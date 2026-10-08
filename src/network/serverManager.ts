/**
 * The browser's side of the dedicated game server.
 *
 * It does what `PeerManager` did for a room, minus the part that mattered
 * least to a player and most to the problem: nobody here runs the match. The
 * server does, and everyone — including whoever made the room — is a client of
 * it. That is the whole reason this exists; see `server/room.ts`.
 */

import type { BrawlerId, BrawlGameMode, BrawlPlayerInput, PlayerInfo } from '../types/brawl';
import type { BrawlSoundEvent } from '../game/brawlEngine';
import type { NetSnapshot } from './codec';
import type { ClientMessage, ServerMessage } from './protocol';

export interface ServerCallbacks {
  onJoined?: (code: string, you: string) => void;
  onRoom?: (players: PlayerInfo[], mode: BrawlGameMode, owner: string) => void;
  onStart?: (mode: BrawlGameMode) => void;
  onState?: (snapshot: NetSnapshot) => void;
  onSound?: (event: BrawlSoundEvent) => void;
  onLobby?: () => void;
  /** Round-trip time to the server in milliseconds, smoothed. */
  onPing?: (rttMs: number) => void;
  onError?: (message: string) => void;
  /** The connection is gone and will not come back by itself. */
  onClosed?: () => void;
}

/** How often the round trip is measured. */
const PING_INTERVAL_MS = 2000;

/** How long to wait for the connection before giving up. */
const CONNECT_TIMEOUT_MS = 8000;

export class ServerManager {
  private socket: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closing = false;

  /** Smoothed round trip, or null before the first answer. */
  public rtt: number | null = null;

  constructor(
    private readonly url: string,
    private readonly callbacks: ServerCallbacks
  ) {}

  /** Opens the connection. Rejects with a message fit to show a player. */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        reject(new Error(message));
      };

      let socket: WebSocket;
      try {
        socket = new WebSocket(this.url);
      } catch {
        fail('Sunucu adresi geçersiz.');
        return;
      }
      this.socket = socket;

      const timeout = setTimeout(() => {
        fail('Sunucuya bağlanılamadı (zaman aşımı).');
        socket.close();
      }, CONNECT_TIMEOUT_MS);

      socket.onopen = () => {
        clearTimeout(timeout);
        if (settled) return;
        settled = true;
        this.startPinging();
        resolve();
      };

      socket.onmessage = event => this.handle(event.data);

      socket.onerror = () => fail('Sunucuya bağlanılamadı.');

      socket.onclose = () => {
        clearTimeout(timeout);
        this.stopPinging();
        fail('Sunucuya bağlanılamadı.');
        // A close that nobody asked for is a lost connection.
        if (!this.closing) this.callbacks.onClosed?.();
      };
    });
  }

  private handle(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }

    switch (message.t) {
      case 'joined':
        this.callbacks.onJoined?.(message.code, message.you);
        break;
      case 'room':
        this.callbacks.onRoom?.(message.players, message.mode, message.owner);
        break;
      case 'start':
        this.callbacks.onStart?.(message.mode);
        break;
      case 'state':
        this.callbacks.onState?.(message.s);
        break;
      case 'sound':
        this.callbacks.onSound?.(message.e);
        break;
      case 'lobby':
        this.callbacks.onLobby?.();
        break;
      case 'pong': {
        const sample = performance.now() - message.ts;
        // Smoothed, so the number on screen does not jitter with every packet
        // but still follows a connection that is genuinely getting worse.
        this.rtt = this.rtt === null ? sample : this.rtt * 0.7 + sample * 0.3;
        this.callbacks.onPing?.(Math.round(this.rtt));
        break;
      }
      case 'error':
        this.callbacks.onError?.(message.message);
        break;
    }
  }

  private startPinging(): void {
    this.sendPing();
    this.pingTimer = setInterval(() => this.sendPing(), PING_INTERVAL_MS);
  }

  private stopPinging(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private sendPing(): void {
    this.send({ t: 'ping', ts: performance.now() });
  }

  private send(message: ClientMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  /* ---- what a player can do ---------------------------------------- */

  public create(name: string, brawler: BrawlerId, mode: BrawlGameMode): void {
    this.send({ t: 'create', name, brawler, mode });
  }

  public join(code: string, name: string, brawler: BrawlerId): void {
    this.send({ t: 'join', code, name, brawler });
  }

  public pick(brawler: BrawlerId): void {
    this.send({ t: 'pick', brawler });
  }

  public setMode(mode: BrawlGameMode): void {
    this.send({ t: 'mode', mode });
  }

  public addBot(): void {
    this.send({ t: 'addBot' });
  }

  public remove(id: string): void {
    this.send({ t: 'remove', id });
  }

  public start(): void {
    this.send({ t: 'start' });
  }

  public restart(): void {
    this.send({ t: 'restart' });
  }

  public returnToLobby(): void {
    this.send({ t: 'lobby' });
  }

  public sendInput(seq: number, input: BrawlPlayerInput): void {
    this.send({ t: 'input', seq, input });
  }

  /** Leaves the room and closes the connection. */
  public destroy(): void {
    this.closing = true;
    this.stopPinging();
    this.send({ t: 'leave' });
    this.socket?.close();
    this.socket = null;
  }
}
