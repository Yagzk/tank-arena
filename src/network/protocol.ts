/**
 * The messages between a browser and the game server.
 *
 * The server is open to the internet, so everything a client sends is treated
 * as hostile until it has been through `parseClientMessage`. A `NaN` fed into
 * the simulation does not stay in one brawler — it poisons every distance
 * check that touches it and eventually the whole match — and a number big
 * enough to overflow an array index crashes the process that every room runs
 * in. Validation is therefore not a nicety; it is the boundary.
 */

import {
  BRAWLER_IDS,
  type BrawlerId,
  type BrawlGameMode,
  type BrawlPlayerInput,
  type PlayerInfo,
} from '../types/brawl';
import type { BrawlSoundEvent } from '../game/brawlEngine';
import { MODE_IDS } from '../game/modes';
import type { NetSnapshot } from './codec';

export const MAX_PLAYERS = 10;
export const MIN_PLAYERS_TO_START = 4;
export const MAX_NAME_LENGTH = 16;

export type ClientMessage =
  | { t: 'create'; name: string; brawler: BrawlerId; mode: BrawlGameMode }
  | { t: 'join'; code: string; name: string; brawler: BrawlerId }
  | { t: 'pick'; brawler: BrawlerId }
  | { t: 'mode'; mode: BrawlGameMode }
  | { t: 'addBot' }
  | { t: 'remove'; id: string }
  | { t: 'start' }
  | { t: 'restart' }
  | { t: 'lobby' }
  | { t: 'input'; seq: number; input: BrawlPlayerInput }
  | { t: 'ping'; ts: number }
  | { t: 'leave' };

export type ServerMessage =
  | { t: 'joined'; code: string; you: string }
  | { t: 'room'; players: PlayerInfo[]; mode: BrawlGameMode; owner: string }
  | { t: 'start'; mode: BrawlGameMode }
  | { t: 'state'; s: NetSnapshot }
  | { t: 'sound'; e: BrawlSoundEvent }
  | { t: 'lobby' }
  | { t: 'pong'; ts: number }
  | { t: 'error'; message: string };

const MODES: ReadonlySet<string> = new Set<string>(MODE_IDS);
const BRAWLERS: ReadonlySet<string> = new Set<string>(BRAWLER_IDS);

/** Room codes: no characters that read as each other (0/O, 1/I). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET.charAt(Math.floor(random() * CODE_ALPHABET.length));
  return code;
}

export function normaliseRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(code) ? code : null;
}

/** A name a person typed, made safe to show to everybody else. */
export function sanitiseName(raw: unknown, fallback = 'Brawler'): string {
  if (typeof raw !== 'string') return fallback;
  // Control characters and the angle brackets that make markup; lengths are
  // counted in code points so an emoji is one character, not two.
  const cleaned = Array.from(raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim())
    .slice(0, MAX_NAME_LENGTH)
    .join('');
  return cleaned.length > 0 ? cleaned : fallback;
}

function finite(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Map extent, with room to spare; a target outside this is not a target. */
const WORLD_LIMIT = 10000;

/**
 * Turns whatever arrived into an input the simulation can safely use.
 *
 * Returns a fresh object rather than the one the client sent, so nothing the
 * client attached beyond these fields can reach the engine.
 */
export function sanitiseInput(raw: unknown): BrawlPlayerInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const input: BrawlPlayerInput = {
    moveX: finite(r.moveX, 0, -1, 1),
    moveY: finite(r.moveY, 0, -1, 1),
    aimAngle: finite(r.aimAngle, 0, -Math.PI * 4, Math.PI * 4),
    attack: r.attack === true,
    superAttack: r.superAttack === true,
  };
  if (r.gadget === true) input.gadget = true;
  if (typeof r.superTargetX === 'number' && Number.isFinite(r.superTargetX)) {
    input.superTargetX = finite(r.superTargetX, 0, -WORLD_LIMIT, WORLD_LIMIT);
  }
  if (typeof r.superTargetY === 'number' && Number.isFinite(r.superTargetY)) {
    input.superTargetY = finite(r.superTargetY, 0, -WORLD_LIMIT, WORLD_LIMIT);
  }
  // Emotes are free text on the client; only a short string is allowed on.
  if (typeof r.emote === 'string' && r.emote.length > 0 && r.emote.length <= 8) {
    input.emote = r.emote;
  }
  return input;
}

/**
 * Parses one message from the wire. Anything that is not exactly a known
 * message with sane contents is `null`, and the caller drops it.
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;

  switch (m.t) {
    case 'create':
      if (!BRAWLERS.has(m.brawler as string) || !MODES.has(m.mode as string)) return null;
      return {
        t: 'create',
        name: sanitiseName(m.name),
        brawler: m.brawler as BrawlerId,
        mode: m.mode as BrawlGameMode,
      };

    case 'join': {
      const code = normaliseRoomCode(m.code);
      if (!code || !BRAWLERS.has(m.brawler as string)) return null;
      return { t: 'join', code, name: sanitiseName(m.name), brawler: m.brawler as BrawlerId };
    }

    case 'pick':
      return BRAWLERS.has(m.brawler as string) ? { t: 'pick', brawler: m.brawler as BrawlerId } : null;

    case 'mode':
      return MODES.has(m.mode as string) ? { t: 'mode', mode: m.mode as BrawlGameMode } : null;

    case 'remove':
      return typeof m.id === 'string' && m.id.length <= 64 ? { t: 'remove', id: m.id } : null;

    case 'input': {
      const input = sanitiseInput(m.input);
      if (!input) return null;
      return { t: 'input', seq: finite(m.seq, 0, 0, 2147483647) | 0, input };
    }

    case 'ping':
      return typeof m.ts === 'number' && Number.isFinite(m.ts) ? { t: 'ping', ts: m.ts } : null;

    case 'addBot':
    case 'start':
    case 'restart':
    case 'lobby':
    case 'leave':
      return { t: m.t };

    default:
      return null;
  }
}
