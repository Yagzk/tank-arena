import { Peer, DataConnection } from 'peerjs';
import { PlayerInfo, PlayerInput, GameStateSnapshot, TankColor } from '../types/game';
import { SoundEvent } from '../game/gameEngine';

export type NetworkMessage =
  | { type: 'JOIN'; name: string; color: TankColor }
  | { type: 'ROOM_UPDATE'; players: PlayerInfo[]; targetScore: number }
  | { type: 'START_MATCH'; targetScore: number }
  | { type: 'INPUT'; input: PlayerInput }
  | { type: 'STATE'; snapshot: GameStateSnapshot }
  | { type: 'SOUND'; event: SoundEvent }
  | { type: 'RESTART_ROUND' };

export interface PeerManagerCallbacks {
  onConnected?: (peerId: string) => void;
  onPlayersChanged?: (players: PlayerInfo[]) => void;
  onGameStart?: (targetScore: number) => void;
  onStateReceived?: (snapshot: GameStateSnapshot) => void;
  onInputReceived?: (playerId: string, input: PlayerInput) => void;
  onSoundReceived?: (event: SoundEvent) => void;
  onError?: (err: string) => void;
}

export class PeerManager {
  private peer: Peer | null = null;
  public myId: string = '';
  public roomCode: string = '';
  public isHost: boolean = false;
  public players: PlayerInfo[] = [];
  public connections: Map<string, DataConnection> = new Map();
  private hostConn: DataConnection | null = null;
  private callbacks: PeerManagerCallbacks = {};

  constructor(callbacks: PeerManagerCallbacks) {
    this.callbacks = callbacks;
  }

  // Generate clean 4-character alphanumeric code (e.g. 7X9K)
  public static generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Host a room
  public hostRoom(roomCode: string, hostName: string, hostColor: TankColor) {
    this.isHost = true;
    this.roomCode = roomCode.toUpperCase();
    const peerId = `tk2d-${this.roomCode}`;

    this.peer = new Peer(peerId, {
      debug: 1,
    });

    this.peer.on('open', id => {
      this.myId = id;
      this.players = [
        {
          id,
          name: hostName || 'Komutan 1',
          color: hostColor,
          isHost: true,
          score: 0,
        },
      ];
      this.callbacks.onConnected?.(this.roomCode);
      this.callbacks.onPlayersChanged?.(this.players);
    });

    this.peer.on('connection', conn => {
      conn.on('open', () => {
        // Wait for JOIN message
      });

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
          targetScore: 5,
        });
      });
    });

    this.peer.on('error', err => {
      console.warn('Peer error:', err);
      if (err.type === 'unavailable-id') {
        this.callbacks.onError?.('Bu oda kodu zaten kullanımda, lütfen yeni bir oda kurun.');
      } else {
        this.callbacks.onError?.(err.message || 'Bağlantı hatası oluştu');
      }
    });
  }

  // Join existing room
  public joinRoom(roomCode: string, playerName: string, playerColor: TankColor) {
    this.isHost = false;
    this.roomCode = roomCode.toUpperCase();
    const targetPeerId = `tk2d-${this.roomCode}`;

    this.peer = new Peer({
      debug: 1,
    });

    this.peer.on('open', myId => {
      this.myId = myId;
      const conn = this.peer!.connect(targetPeerId, { reliable: true });
      this.hostConn = conn;

      conn.on('open', () => {
        this.callbacks.onConnected?.(this.roomCode);
        // Send join request
        conn.send({
          type: 'JOIN',
          name: playerName || 'Asker',
          color: playerColor,
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
        this.callbacks.onError?.('Odaya bağlanılamadı: ' + err);
      });
    });

    this.peer.on('error', err => {
      console.warn('Peer error:', err);
      this.callbacks.onError?.('Oda bulunamadı veya bağlantı sağlanamadı.');
    });
  }

  private handleHostIncomingMessage(conn: DataConnection, msg: NetworkMessage) {
    if (msg.type === 'JOIN') {
      if (this.players.length >= 4) {
        conn.send({ type: 'ROOM_UPDATE', players: this.players, targetScore: 5 });
        conn.close();
        return;
      }

      this.connections.set(conn.peer, conn);

      // Check for color conflict and adjust if necessary
      let color = msg.color;
      const takenColors = this.players.map(p => p.color);
      if (takenColors.includes(color)) {
        const allColors: TankColor[] = ['cyan', 'red', 'green', 'amber', 'purple'];
        const available = allColors.find(c => !takenColors.includes(c));
        if (available) color = available;
      }

      const newPlayer: PlayerInfo = {
        id: conn.peer,
        name: msg.name,
        color,
        isHost: false,
        score: 0,
      };

      this.players.push(newPlayer);
      this.callbacks.onPlayersChanged?.(this.players);

      this.broadcast({
        type: 'ROOM_UPDATE',
        players: this.players,
        targetScore: 5,
      });
    } else if (msg.type === 'INPUT') {
      this.callbacks.onInputReceived?.(conn.peer, msg.input);
    }
  }

  private handleClientIncomingMessage(msg: NetworkMessage) {
    switch (msg.type) {
      case 'ROOM_UPDATE':
        this.players = msg.players;
        this.callbacks.onPlayersChanged?.(this.players);
        break;
      case 'START_MATCH':
        this.callbacks.onGameStart?.(msg.targetScore);
        break;
      case 'STATE':
        this.callbacks.onStateReceived?.(msg.snapshot);
        break;
      case 'SOUND':
        this.callbacks.onSoundReceived?.(msg.event);
        break;
    }
  }

  // Host broadcasts to all clients
  public broadcast(msg: NetworkMessage) {
    if (!this.isHost) return;
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send(msg);
      }
    });
  }

  // Client sends to host
  public sendToHost(msg: NetworkMessage) {
    if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(msg);
    }
  }

  // Add Bot (Host only)
  public addBot(botName: string, color: TankColor) {
    if (!this.isHost || this.players.length >= 4) return;
    const botId = `bot-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    this.players.push({
      id: botId,
      name: botName,
      color,
      isHost: false,
      isBot: true,
      score: 0,
    });
    this.callbacks.onPlayersChanged?.(this.players);
    this.broadcast({
      type: 'ROOM_UPDATE',
      players: this.players,
      targetScore: 5,
    });
  }

  // Remove Player/Bot (Host only)
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
      targetScore: 5,
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
