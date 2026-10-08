/**
 * One room: its roster, its owner, and — once a round starts — the match.
 *
 * Knows nothing about sockets. A room talks to its players through the small
 * `Peer` interface, and is driven by `tick(now)` from whoever owns the clock.
 * That is what lets the whole thing be tested by calling methods, with no
 * network, no timers and no waiting: the rules of a room are the part most
 * likely to be quietly wrong, and the part least pleasant to debug over a
 * connection.
 */

import { BrawlEngine } from '../src/game/brawlEngine';
import { MAX_DELTA, MAX_STEPS_PER_WAKE, FIXED_DT, planSteps } from '../src/core/timestep';
import { seedFromString } from '../src/core/rng';
import { SnapshotEncoder } from '../src/network/codec';
import {
  BRAWLER_IDS,
  type BrawlerId,
  type BrawlGameMode,
  type PlayerInfo,
} from '../src/types/brawl';
import {
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  type ClientMessage,
  type ServerMessage,
} from '../src/network/protocol';

/** One connected player, as the room sees them. */
export interface Peer {
  readonly id: string;
  send(message: ServerMessage): void;
  /** Pre-serialised state, sent as-is so a snapshot is encoded once, not once per player. */
  sendRaw(payload: string): void;
  /** Bytes queued for this player and not yet on the wire. */
  backlog(): number;
  close(): void;
}

/** A client whose backlog is past this is skipped for a snapshot, not queued behind it. */
const MAX_BACKLOG_BYTES = 96 * 1024;

/**
 * Seconds between snapshots. The server is not the bottleneck a player's home
 * connection was, so the full rate is affordable for the whole room.
 */
const SNAPSHOT_INTERVAL = 1 / 30;

export interface RoomHooks {
  /** Called when the last human has gone and the room should be forgotten. */
  onEmpty(room: Room): void;
}

export class Room {
  public readonly code: string;
  private players: PlayerInfo[] = [];
  private readonly peers = new Map<string, Peer>();
  private ownerId = '';
  private mode: BrawlGameMode;

  private engine: BrawlEngine | null = null;
  private readonly encoder = new SnapshotEncoder();
  private matchCount = 0;
  private botCount = 0;

  private accumulator = 0;
  private netAccumulator = 0;
  private lastTickMs = 0;

  /** Round-trip and shedding counters, for the status endpoint. */
  public statesSent = 0;
  public statesSkipped = 0;

  constructor(
    code: string,
    mode: BrawlGameMode,
    private readonly hooks: RoomHooks
  ) {
    this.code = code;
    this.mode = mode;
  }

  /* ---------------------------------------------------------------- *
   * Roster
   * ---------------------------------------------------------------- */

  public get playerCount(): number {
    return this.players.length;
  }

  public get humanCount(): number {
    return this.peers.size;
  }

  public get inMatch(): boolean {
    return this.engine !== null;
  }

  public get owner(): string {
    return this.ownerId;
  }

  public roster(): PlayerInfo[] {
    return this.players;
  }

  /** Adds a person to the room. Returns an error message, or null on success. */
  public join(peer: Peer, name: string, brawler: BrawlerId): string | null {
    if (this.engine) return 'Bu oda şu an bir maçta.';
    if (this.players.length >= MAX_PLAYERS) return 'Oda dolu.';

    this.peers.set(peer.id, peer);
    this.players.push({
      id: peer.id,
      name,
      brawler,
      team: this.players.length % 2,
      isHost: this.players.length === 0,
      score: 0,
      trophies: 0,
    });
    if (this.ownerId === '') this.ownerId = peer.id;

    peer.send({ t: 'joined', code: this.code, you: peer.id });
    this.broadcastRoom();
    return null;
  }

  /** A person has gone, by choice or because the connection died. */
  public leave(peerId: string): void {
    if (!this.peers.delete(peerId)) return;

    if (this.engine) {
      // Their brawler stays in the fight, under a bot's control, instead of
      // standing where it fell for the rest of the round.
      this.engine.convertToBot(peerId);
      this.players = this.players.map(p => (p.id === peerId ? { ...p, isBot: true } : p));
    } else {
      this.players = this.players.filter(p => p.id !== peerId);
    }

    if (this.peers.size === 0) {
      this.hooks.onEmpty(this);
      return;
    }

    if (peerId === this.ownerId) {
      // The room does not end because its owner left; the next person in it
      // takes over, so everybody else is not thrown out for one person's exit.
      this.ownerId = [...this.peers.keys()][0];
    }
    this.broadcastRoom();
  }

  /* ---------------------------------------------------------------- *
   * Messages
   * ---------------------------------------------------------------- */

  public handle(peerId: string, message: ClientMessage, now: number): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    const isOwner = peerId === this.ownerId;

    switch (message.t) {
      case 'input':
        this.engine?.setPlayerInput(peerId, message.input, message.seq);
        break;

      case 'ping':
        peer.send({ t: 'pong', ts: message.ts });
        break;

      case 'pick': {
        if (this.engine) return;
        const player = this.players.find(p => p.id === peerId);
        if (player) {
          player.brawler = message.brawler;
          this.broadcastRoom();
        }
        break;
      }

      case 'mode':
        if (!isOwner || this.engine) return;
        this.mode = message.mode;
        this.broadcastRoom();
        break;

      case 'addBot': {
        if (!isOwner || this.engine || this.players.length >= MAX_PLAYERS) return;
        this.botCount += 1;
        this.players.push({
          id: 'bot-' + this.code + '-' + this.botCount,
          name: 'Bot-' + this.botCount,
          brawler: BRAWLER_IDS[this.players.length % BRAWLER_IDS.length],
          team: this.players.length % 2,
          isHost: false,
          isBot: true,
          score: 0,
          trophies: 0,
        });
        this.broadcastRoom();
        break;
      }

      case 'remove': {
        if (!isOwner || this.engine || message.id === this.ownerId) return;
        const target = this.players.find(p => p.id === message.id);
        if (!target) return;
        this.players = this.players.filter(p => p.id !== message.id);
        const removed = this.peers.get(message.id);
        if (removed) {
          this.peers.delete(message.id);
          removed.send({ t: 'error', message: 'Odadan çıkarıldın.' });
          removed.close();
        }
        this.broadcastRoom();
        break;
      }

      case 'start':
        if (!isOwner || this.engine) return;
        if (this.players.length < MIN_PLAYERS_TO_START) {
          peer.send({ t: 'error', message: 'En az ' + MIN_PLAYERS_TO_START + ' oyuncu gerekli.' });
          return;
        }
        this.startMatch(now);
        break;

      case 'restart':
        // A rematch can be called while the results are still on screen.
        if (!isOwner || !this.engine) return;
        this.startMatch(now);
        break;

      case 'lobby':
        if (!isOwner || !this.engine) return;
        this.stopMatch();
        this.broadcast({ t: 'lobby' });
        this.broadcastRoom();
        break;

      case 'leave':
        this.leave(peerId);
        break;

      case 'create':
      case 'join':
        // Handled by the registry before a room exists; meaningless here.
        break;
    }
  }

  /* ---------------------------------------------------------------- *
   * The match
   * ---------------------------------------------------------------- */

  private startMatch(now: number): void {
    this.matchCount += 1;
    // The round number is part of the seed, or every rematch in a room would
    // be the same map.
    const seed = seedFromString(this.code + '#' + this.matchCount);

    const engine = new BrawlEngine();
    engine.onSoundTriggered = event => this.broadcast({ t: 'sound', e: event });
    engine.initMatch(this.players, this.mode, seed);

    this.engine = engine;
    this.encoder.reset();
    this.accumulator = 0;
    this.netAccumulator = 0;
    this.lastTickMs = now;

    this.broadcast({ t: 'start', mode: this.mode });
  }

  private stopMatch(): void {
    this.engine = null;
    // Anyone who dropped during the round was only a bot by then; with the
    // round over they are simply gone.
    this.players = this.players.filter(p => !p.isBot || !this.isGhost(p));
  }

  /** A bot that used to be a person, which the room no longer has a peer for. */
  private isGhost(p: PlayerInfo): boolean {
    return p.isBot === true && !p.id.startsWith('bot-');
  }

  /** Advances the match to `now`. Safe to call when there is no match. */
  public tick(now: number): void {
    const engine = this.engine;
    if (!engine) return;

    const elapsed = (now - this.lastTickMs) / 1000;
    this.lastTickMs = now;

    const plan = planSteps(this.accumulator, elapsed, MAX_STEPS_PER_WAKE, MAX_DELTA);
    for (let i = 0; i < plan.steps; i++) {
      engine.update(FIXED_DT);
      this.netAccumulator += FIXED_DT;
    }
    this.accumulator = plan.remainder;

    // Once per wake-up, never once per step: after a stall the loop catches up
    // with dozens of steps, and a packet from each would be a flood.
    if (plan.steps > 0 && this.netAccumulator >= SNAPSHOT_INTERVAL) {
      this.netAccumulator %= SNAPSHOT_INTERVAL;
      this.broadcastState(engine, now);
    }
  }

  private broadcastState(engine: BrawlEngine, now: number): void {
    // Encoded and serialised once; every player is sent the same string.
    const payload = JSON.stringify({ t: 'state', s: this.encoder.encode(engine.getSnapshot(), now) });

    for (const peer of this.peers.values()) {
      // A snapshot is obsolete the moment the next one exists, so a player
      // whose connection is backed up is skipped rather than queued behind.
      if (peer.backlog() > MAX_BACKLOG_BYTES) {
        this.statesSkipped++;
        continue;
      }
      peer.sendRaw(payload);
      this.statesSent++;
    }
  }

  /* ---------------------------------------------------------------- *
   * Plumbing
   * ---------------------------------------------------------------- */

  private broadcast(message: ServerMessage): void {
    for (const peer of this.peers.values()) peer.send(message);
  }

  private broadcastRoom(): void {
    this.broadcast({ t: 'room', players: this.players, mode: this.mode, owner: this.ownerId });
  }

  /** Stops everything and lets go of the players. */
  public destroy(): void {
    this.engine = null;
    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
  }
}
