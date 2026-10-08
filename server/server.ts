/**
 * The game server: sockets in, rooms out.
 *
 * This file is the only one that knows about the network. It accepts
 * connections, keeps each one honest — size limits, a message budget, a
 * heartbeat — hands parsed messages to the right `Room`, and drives every
 * running match from a single clock.
 */

import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Room, type Peer } from './room';
import {
  generateRoomCode,
  parseClientMessage,
  type ServerMessage,
} from '../src/network/protocol';
import { SIM_TIMER_MS } from '../src/core/timestep';

export interface ServerOptions {
  port: number;
  host?: string;
  /** Rooms the process will hold at once. */
  maxRooms?: number;
  /** Simultaneous connections allowed from one address. */
  maxConnectionsPerIp?: number;
  /** Origins allowed to connect; empty means any. */
  allowedOrigins?: string[];
  /** Clock override, for tests. */
  now?: () => number;
}

export interface GameServer {
  readonly port: number;
  readonly roomCount: number;
  readonly connectionCount: number;
  status(): Record<string, unknown>;
  close(): Promise<void>;
}

/**
 * Messages a single connection may send per second.
 *
 * A client legitimately sends an input every frame, 60 a second, plus the odd
 * request. Well above that and it is a script, not a player.
 */
const MESSAGES_PER_SECOND = 180;

/** Largest message accepted. An input is about a hundred bytes. */
const MAX_PAYLOAD_BYTES = 2048;

const HEARTBEAT_MS = 15000;

class Connection implements Peer {
  public room: Room | null = null;
  public alive = true;
  private budget = MESSAGES_PER_SECOND;
  private budgetAt = 0;
  private strikes = 0;

  constructor(
    public readonly id: string,
    public readonly socket: WebSocket,
    public readonly ip: string
  ) {}

  send(message: ServerMessage): void {
    this.sendRaw(JSON.stringify(message));
  }

  sendRaw(payload: string): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(payload);
  }

  backlog(): number {
    return this.socket.bufferedAmount;
  }

  close(): void {
    this.socket.close();
  }

  /** Token bucket: refilled continuously, spent one per message. */
  allow(nowMs: number): boolean {
    const elapsed = Math.max(0, nowMs - this.budgetAt) / 1000;
    this.budgetAt = nowMs;
    this.budget = Math.min(MESSAGES_PER_SECOND, this.budget + elapsed * MESSAGES_PER_SECOND);
    if (this.budget >= 1) {
      this.budget -= 1;
      this.strikes = 0;
      return true;
    }
    // Over budget for a sustained stretch is somebody flooding, not a burst.
    this.strikes++;
    if (this.strikes > MESSAGES_PER_SECOND * 3) this.socket.terminate();
    return false;
  }
}

export function startGameServer(options: ServerOptions): Promise<GameServer> {
  const maxRooms = options.maxRooms ?? 200;
  const maxPerIp = options.maxConnectionsPerIp ?? 30;
  const allowed = options.allowedOrigins ?? [];
  const now = options.now ?? (() => performance.now());

  const rooms = new Map<string, Room>();
  const connections = new Set<Connection>();
  const perIp = new Map<string, number>();

  const wss = new WebSocketServer({
    port: options.port,
    host: options.host,
    maxPayload: MAX_PAYLOAD_BYTES,
    // Frames are tiny and sent constantly; compressing them costs more CPU
    // than the bandwidth it saves on a server with a fast link.
    perMessageDeflate: false,
    verifyClient: ({ origin }: { origin: string }) =>
      allowed.length === 0 || allowed.includes(origin),
  });

  /** The one clock. Every running match advances from here. */
  const clock = setInterval(() => {
    const t = now();
    for (const room of rooms.values()) room.tick(t);
  }, SIM_TIMER_MS);

  /** Drops connections that stopped answering, which TCP alone takes minutes to notice. */
  const heartbeat = setInterval(() => {
    for (const c of connections) {
      if (!c.alive) {
        c.socket.terminate();
        continue;
      }
      c.alive = false;
      c.socket.ping();
    }
  }, HEARTBEAT_MS);

  function forget(room: Room): void {
    room.destroy();
    rooms.delete(room.code);
  }

  function uniqueCode(): string | null {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = generateRoomCode();
      if (!rooms.has(code)) return code;
    }
    return null;
  }

  wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    const ip = request.socket.remoteAddress ?? 'unknown';
    const open = perIp.get(ip) ?? 0;
    if (open >= maxPerIp) {
      socket.close(1013, 'too many connections');
      return;
    }
    perIp.set(ip, open + 1);

    const conn = new Connection('p-' + randomBytes(6).toString('hex'), socket, ip);
    connections.add(conn);

    socket.on('pong', () => {
      conn.alive = true;
    });

    socket.on('message', (data: RawData) => {
      conn.alive = true;
      const t = now();
      if (!conn.allow(t)) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      const message = parseClientMessage(parsed);
      if (!message) return;

      // Answered before anything else and whether or not the connection is in a
      // room: a client wants to know its round trip while it is still choosing
      // one, and a ping that waits behind room logic measures the wrong thing.
      if (message.t === 'ping') {
        conn.send({ t: 'pong', ts: message.ts });
        return;
      }

      if (message.t === 'create') {
        if (conn.room) return;
        if (rooms.size >= maxRooms) {
          conn.send({ t: 'error', message: 'Sunucu şu an dolu, biraz sonra tekrar dene.' });
          return;
        }
        const code = uniqueCode();
        if (!code) return;
        const room = new Room(code, message.mode, { onEmpty: forget });
        rooms.set(code, room);
        const error = room.join(conn, message.name, message.brawler);
        if (error) {
          conn.send({ t: 'error', message: error });
          forget(room);
          return;
        }
        conn.room = room;
        return;
      }

      if (message.t === 'join') {
        if (conn.room) return;
        const room = rooms.get(message.code);
        if (!room) {
          conn.send({ t: 'error', message: 'Oda bulunamadı. Kodu kontrol et.' });
          return;
        }
        const error = room.join(conn, message.name, message.brawler);
        if (error) {
          conn.send({ t: 'error', message: error });
          return;
        }
        conn.room = room;
        return;
      }

      if (message.t === 'leave') {
        conn.room?.leave(conn.id);
        conn.room = null;
        return;
      }

      conn.room?.handle(conn.id, message, t);
    });

    socket.on('close', () => {
      connections.delete(conn);
      const left = (perIp.get(ip) ?? 1) - 1;
      if (left <= 0) perIp.delete(ip);
      else perIp.set(ip, left);
      conn.room?.leave(conn.id);
      conn.room = null;
    });

    socket.on('error', () => socket.terminate());
  });

  return new Promise((resolve, reject) => {
    wss.once('error', reject);
    wss.once('listening', () => {
      const address = wss.address();
      const port = typeof address === 'object' && address ? address.port : options.port;

      resolve({
        port,
        get roomCount() {
          return rooms.size;
        },
        get connectionCount() {
          return connections.size;
        },
        status() {
          let matches = 0;
          let skipped = 0;
          let sent = 0;
          for (const r of rooms.values()) {
            if (r.inMatch) matches++;
            skipped += r.statesSkipped;
            sent += r.statesSent;
          }
          return {
            rooms: rooms.size,
            matches,
            connections: connections.size,
            statesSent: sent,
            statesSkipped: skipped,
          };
        },
        close() {
          clearInterval(clock);
          clearInterval(heartbeat);
          for (const room of rooms.values()) room.destroy();
          rooms.clear();
          for (const c of connections) c.socket.terminate();
          return new Promise<void>(done => wss.close(() => done()));
        },
      });
    });
  });
}
