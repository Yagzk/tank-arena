import { Peer, DataConnection } from 'peerjs';
import { PlayerInfo, BrawlPlayerInput, BrawlSnapshot, BrawlerId, BrawlGameMode } from '../types/brawl';
import { BrawlSoundEvent } from '../game/brawlEngine';

export type NetworkMessage =
  | { type: 'JOIN'; name: string; brawler: BrawlerId }
  | { type: 'ROOM_UPDATE'; players: PlayerInfo[]; mode: BrawlGameMode }
  | { type: 'START_MATCH'; mode: BrawlGameMode }
  | { type: 'INPUT'; input: BrawlPlayerInput }
  | { type: 'STATE'; snapshot: BrawlSnapshot }
  | { type: 'SOUND'; event: BrawlSoundEvent };

export interface PeerManagerCallbacks {
  onConnected?: (roomCode: string) => void;
  onPlayersChanged?: (players: PlayerInfo[]) => void;
  onGameStart?: (mode: BrawlGameMode) => void;
  onStateReceived?: (snapshot: BrawlSnapshot) => void;
  onInputReceived?: (playerId: string, input: BrawlPlayerInput) => void;
  onSoundReceived?: (event: BrawlSoundEvent) => void;
  onError?: (err: string) => void;
}

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
    } else if (msg.type === 'INPUT') {
      this.callbacks.onInputReceived?.(conn.peer, msg.input);
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

  public setMode(mode: BrawlGameMode) {
    this.mode = mode;
    this.broadcast({
      type: 'ROOM_UPDATE',
      players: this.players,
      mode: this.mode,
    });
  }

  public destroy() {
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
