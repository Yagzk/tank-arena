import { Peer, DataConnection } from 'peerjs';
import { PlayerInfo, BrawlPlayerInput, BrawlerId, BrawlGameMode } from '../types/brawl';
import { BrawlSoundEvent } from '../game/brawlEngine';
import type { NetSnapshot } from './codec';

export type NetworkMessage =
  | { type: 'JOIN'; name: string; brawler: BrawlerId }
  /** A client changing its pick while sitting in the room. */
  | { type: 'PICK_BRAWLER'; brawler: BrawlerId }
  | { type: 'ROOM_UPDATE'; players: PlayerInfo[]; mode: BrawlGameMode }
  | { type: 'START_MATCH'; mode: BrawlGameMode }
  /** The host ending the round and bringing everybody back to the room. */
  | { type: 'RETURN_TO_LOBBY' }
  /** Round-trip measurement: the host echoes the timestamp straight back. */
  | { type: 'PING'; ts: number }
  | { type: 'PONG'; ts: number }
  | { type: 'INPUT'; input: BrawlPlayerInput; seq?: number }
  | { type: 'STATE'; snapshot: NetSnapshot }
  | { type: 'SOUND'; event: BrawlSoundEvent };

export interface PeerManagerCallbacks {
  onConnected?: (roomCode: string) => void;
  onPlayersChanged?: (players: PlayerInfo[]) => void;
  onGameStart?: (mode: BrawlGameMode) => void;
  onStateReceived?: (snapshot: NetSnapshot) => void;
  onReturnToLobby?: () => void;
  /** Round trip to the host in milliseconds, smoothed. */
  onPing?: (rttMs: number) => void;
  onInputReceived?: (playerId: string, input: BrawlPlayerInput, seq?: number) => void;
  onSoundReceived?: (event: BrawlSoundEvent) => void;
  onError?: (err: string) => void;
}

/**
 * Bytes waiting in a client's send buffer beyond which state is withheld.
 *
 * A packet is a few kilobytes, so this is a handful of them: about a sixth of
 * a second at the send rate. Small enough that being skipped costs one frame
 * of detail, large enough that ordinary jitter does not trigger it.
 */
const MAX_BUFFERED_BYTES = 24 * 1024;

export class PeerManager {
  private peer: Peer | null = null;
  public myId: string = '';
  public roomCode: string = '';
  public isHost: boolean = false;
  public players: PlayerInfo[] = [];
  public mode: BrawlGameMode = 'showdown';
  public connections: Map<string, DataConnection> = new Map();
  private hostConn: DataConnection | null = null;
  private callbacks: PeerManagerCallbacks = {};

  constructor(callbacks: PeerManagerCallbacks) {
    this.callbacks = callbacks;
  }

  public static generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  public hostRoom(roomCode: string, hostName: string, hostBrawler: BrawlerId, mode: BrawlGameMode) {
    this.isHost = true;
    this.roomCode = roomCode.toUpperCase();
    this.mode = mode;
    const peerId = `brwl-${this.roomCode}`;

    this.peer = new Peer(peerId, { debug: 1 });

    this.peer.on('open', id => {
      this.myId = id;
      this.players = [
        {
          id,
          name: hostName || 'Yıldız Oyuncu',
          brawler: hostBrawler,
          team: 0,
          isHost: true,
          score: 0,
          trophies: 0,
        },
      ];
      this.callbacks.onConnected?.(this.roomCode);
      this.callbacks.onPlayersChanged?.(this.players);
    });

    this.peer.on('connection', conn => {
      conn.on('data', data => {
        const msg = data as NetworkMessage;
        this.handleHostIncomingMessage(conn, msg);
      });

      conn.on('close', () => {
        this.connections.delete(conn.peer);
        this.players = this.players.filter(p => p.id !== conn.peer);
        this.callbacks.onPlayersChanged?.(this.players);
        this.broadcast({
          type: 'ROOM_UPDATE',
          players: this.players,
          mode: this.mode,
        });
      });
    });

    this.peer.on('error', err => {
      console.warn('Peer error:', err);
      if (err.type === 'unavailable-id') {
        this.callbacks.onError?.('Bu oda kodu kullanımda. Lütfen yeni oda kurun.');
      } else {
        this.callbacks.onError?.(err.message || 'Bağlantı hatası oluştu');
      }
    });
  }

  public joinRoom(roomCode: string, playerName: string, playerBrawler: BrawlerId) {
    this.isHost = false;
    this.roomCode = roomCode.toUpperCase();
    const targetPeerId = `brwl-${this.roomCode}`;

    this.peer = new Peer({ debug: 1 });

    this.peer.on('open', myId => {
      this.myId = myId;
      const conn = this.peer!.connect(targetPeerId, { reliable: true });
      this.hostConn = conn;

      conn.on('open', () => {
        this.startPinging();
        this.callbacks.onConnected?.(this.roomCode);
        conn.send({
          type: 'JOIN',
          name: playerName || 'Brawler',
          brawler: playerBrawler,
        });
      });

      conn.on('data', data => {
        const msg = data as NetworkMessage;
        this.handleClientIncomingMessage(msg);
      });

      conn.on('close', () => {
        this.callbacks.onError?.('Oda sahibi ile bağlantı kesildi.');
      });

      conn.on('error', err => {
        this.callbacks.onError?.('Bağlantı hatası: ' + err);
      });
    });

    this.peer.on('error', err => {
      console.warn('Peer error:', err);
      this.callbacks.onError?.('Odaya bağlanılamadı. Kodun doğru olduğundan emin olun.');
    });
  }

  private handleHostIncomingMessage(conn: DataConnection, msg: NetworkMessage) {
    if (msg.type === 'JOIN') {
      if (this.players.length >= 10) {
        conn.send({ type: 'ROOM_UPDATE', players: this.players, mode: this.mode });
        conn.close();
        return;
      }

      this.connections.set(conn.peer, conn);

      const team = this.players.length % 2;
      const newPlayer: PlayerInfo = {
        id: conn.peer,
        name: msg.name,
        brawler: msg.brawler,
        team,
        isHost: false,
        score: 0,
        trophies: 0,
      };

      this.players.push(newPlayer);
      this.callbacks.onPlayersChanged?.(this.players);

      this.broadcast({
        type: 'ROOM_UPDATE',
        players: this.players,
        mode: this.mode,
      });
    } else if (msg.type === 'PICK_BRAWLER') {
      const player = this.players.find(p => p.id === conn.peer);
      if (!player) return;
      player.brawler = msg.brawler;
      this.callbacks.onPlayersChanged?.(this.players);
      this.broadcast({
        type: 'ROOM_UPDATE',
        players: this.players,
        mode: this.mode,
      });
    } else if (msg.type === 'PING') {
      conn.send({ type: 'PONG', ts: msg.ts });
    } else if (msg.type === 'INPUT') {
      this.callbacks.onInputReceived?.(conn.peer, msg.input, msg.seq);
    }
  }

  private handleClientIncomingMessage(msg: NetworkMessage) {
    switch (msg.type) {
      case 'ROOM_UPDATE':
        this.players = msg.players;
        this.mode = msg.mode;
        this.callbacks.onPlayersChanged?.(this.players);
        break;
      case 'START_MATCH':
        this.callbacks.onGameStart?.(msg.mode);
        break;
      case 'RETURN_TO_LOBBY':
        this.callbacks.onReturnToLobby?.();
        break;
      case 'PONG': {
        const sample = performance.now() - msg.ts;
        this.rtt = this.rtt === null ? sample : this.rtt * 0.7 + sample * 0.3;
        this.callbacks.onPing?.(Math.round(this.rtt));
        break;
      }
      case 'STATE':
        this.callbacks.onStateReceived?.(msg.snapshot);
        break;
      case 'SOUND':
        this.callbacks.onSoundReceived?.(msg.event);
        break;
    }
  }

  public broadcast(msg: NetworkMessage) {
    if (!this.isHost) return;
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send(msg);
      }
    });
  }

  /**
   * Sends match state to every client, without letting a slow one fall behind.
   *
   * The data channel is reliable and ordered, so when a client's connection
   * cannot keep up, packets do not drop — they queue, and every one of them is
   * delivered, late. The queue only ever grows while the link is slower than
   * the send rate, so the delay grows with it: that is the ping that creeps up
   * a few seconds into a match and never comes back down.
   *
   * State is the one kind of message where that is wrong. A snapshot is
   * obsolete the moment the next one exists, so a client whose buffer is
   * backed up is skipped and sent the next one, which keeps its delay bounded
   * by the buffer limit rather than by how long the match has been running.
   * Everything else — room changes, the start signal, sounds — still queues,
   * because losing it is not harmless.
   */
  public broadcastState(msg: NetworkMessage) {
    if (!this.isHost) return;
    this.connections.forEach(conn => {
      if (!conn.open) return;
      const buffered = conn.dataChannel?.bufferedAmount ?? 0;
      // PeerJS keeps its own queue ahead of the browser's once that fills.
      const queued = (conn as unknown as { bufferSize?: number }).bufferSize ?? 0;
      if (buffered > MAX_BUFFERED_BYTES || queued > 0) {
        this.statesSkipped++;
        return;
      }
      conn.send(msg);
      this.statesSent++;
    });
  }

  /** Counters for the diagnostics overlay: how much state is being shed. */
  public statesSent = 0;
  public statesSkipped = 0;

  public sendToHost(msg: NetworkMessage) {
    if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(msg);
    }
  }

  public addBot(botName: string, brawler: BrawlerId) {
    if (!this.isHost || this.players.length >= 10) return;
    const botId = `bot-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const team = this.players.length % 2;

    this.players.push({
      id: botId,
      name: botName,
      brawler,
      team,
      isHost: false,
      isBot: true,
      score: 0,
      trophies: 0,
    });

    this.callbacks.onPlayersChanged?.(this.players);
    this.broadcast({
      type: 'ROOM_UPDATE',
      players: this.players,
      mode: this.mode,
    });
  }

  public removePlayer(playerId: string) {
    if (!this.isHost) return;
    const conn = this.connections.get(playerId);
    if (conn) {
      conn.close();
      this.connections.delete(playerId);
    }
    this.players = this.players.filter(p => p.id !== playerId);
    this.callbacks.onPlayersChanged?.(this.players);
    this.broadcast({
      type: 'ROOM_UPDATE',
      players: this.players,
      mode: this.mode,
    });
  }

  /**
   * Changes which character you are playing, from inside the room.
   *
   * Before this, picking a different character meant leaving and setting the
   * room up again — which hands everybody a new code to type in. The host
   * owns the roster either way, so a client asks rather than tells.
   */
  public setBrawler(brawler: BrawlerId) {
    if (!this.isHost) {
      this.sendToHost({ type: 'PICK_BRAWLER', brawler });
      return;
    }

    const me = this.players.find(p => p.id === this.myId);
    if (!me || me.brawler === brawler) return;
    me.brawler = brawler;
    this.callbacks.onPlayersChanged?.(this.players);
    this.broadcast({
      type: 'ROOM_UPDATE',
      players: this.players,
      mode: this.mode,
    });
  }

  /** Changes a bot's character. Host only; bots have nobody to ask. */
  public setBotBrawler(botId: string, brawler: BrawlerId) {
    if (!this.isHost) return;
    const bot = this.players.find(p => p.id === botId && p.isBot);
    if (!bot) return;
    bot.brawler = brawler;
    this.callbacks.onPlayersChanged?.(this.players);
    this.broadcast({
      type: 'ROOM_UPDATE',
      players: this.players,
      mode: this.mode,
    });
  }

  /**
   * Ends the round and brings everybody back to the room, which stays open.
   *
   * Going back to the lobby used to leave the room — destroying the peer — so
   * the host's own screen fell to the "create a room" page with a stale code
   * and every other player was disconnected with an error. The room is the
   * thing people are waiting in; a round ending is not a reason to close it.
   */
  public returnToLobby() {
    this.broadcast({ type: 'RETURN_TO_LOBBY' });
  }

  public setMode(mode: BrawlGameMode) {
    this.mode = mode;
    this.broadcast({
      type: 'ROOM_UPDATE',
      players: this.players,
      mode: this.mode,
    });
  }

  /** Smoothed round trip to the host, or null before the first answer. */
  public rtt: number | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  private startPinging() {
    this.sendToHost({ type: 'PING', ts: performance.now() });
    this.pingTimer = setInterval(
      () => this.sendToHost({ type: 'PING', ts: performance.now() }),
      2000
    );
  }

  public destroy() {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.connections.forEach(conn => conn.close());
    this.connections.clear();
    if (this.hostConn) {
      this.hostConn.close();
      this.hostConn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}
