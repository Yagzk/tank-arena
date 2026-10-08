/**
 * The wire format for match state.
 *
 * The host used to send the whole snapshot to every client, thirty times a
 * second: about 22 KB a packet with ten players, of which over a third was
 * walls and bushes that had not changed since the match began, and most of
 * the rest was forty fields per brawler where thirty-odd were zero. With nine
 * clients that is several megabytes a second of upload — more than a home
 * connection has, and the reason a full room lagged.
 *
 * Three things bring it down:
 *
 *  - Static geometry is sent when it changes, and on a slow keyframe, not
 *    every packet.
 *  - A brawler is sent as the fields that differ from a fresh one. The field
 *    list is *derived* from the entity factory, so a field added to the
 *    simulation travels without anyone remembering to add it here.
 *  - Numbers are quantised to integers where the precision is not visible.
 *    On the wire a float costs nine bytes and a small integer one to three.
 *
 * Both peers run the same build, so the shared field order is the contract.
 * The tests pin every assumption this relies on.
 */

import type {
  BrawlerEntity,
  BrawlProjectile,
  BrawlSnapshot,
  BrawlWall,
  Bush,
  FloatingNumber,
  VisualEffect,
} from '../types/brawl';
import { createBrawlerEntity } from '../sim/entity';

/**
 * Brawler fields no client ever reads. Sending them is pure cost.
 *
 * Checked against the renderer and HUD by grep, and by a test that fails if
 * one of these starts to matter.
 */
const SKIP: ReadonlySet<string> = new Set([
  'pendingBurst',
  'knockbackVx',
  'knockbackVy',
  'spawnX',
  'spawnY',
  'prevX',
  'prevY',
  'jumpStartX',
  'jumpStartY',
  'jumpTargetX',
  'jumpTargetY',
  'jumpLandKey',
  'burnDamagePerSec',
  'attackCooldown',
  'decoyLifetime',
]);

/**
 * Fractional fields and the multiplier that turns them into an integer.
 *
 * Positions go to a tenth of a unit: at the highest zoom that is a third of a
 * screen pixel, below what interpolation can show. Angles go to a hundredth
 * of a radian, about half a degree. Timers go to a hundredth of a second.
 */
const SCALE: Readonly<Record<string, number>> = {
  x: 10,
  y: 10,
  vx: 1,
  vy: 1,
  angle: 100,
  aimAngle: 100,
  lastDamageAngle: 100,
  hp: 1,
  shieldHp: 1,
  superCharge: 10,
  jumpProgress: 100,
  speedBoostMagnitude: 100,
  reloadTimer: 100,
  stunTimer: 100,
  slowTimer: 100,
  speedBoostTimer: 100,
  invisibilityTimer: 100,
  immunityTimer: 100,
  shieldTimer: 100,
  silenceTimer: 100,
  rootTimer: 100,
  phaseTimer: 100,
  revealTimer: 100,
  respawnTimer: 100,
  burnTimer: 100,
  gadgetCooldown: 100,
  emoteTimer: 100,
  timeSinceLastDamage: 100,
  timeSinceLastAttack: 100,
  inputAck: 1,
  inputAckAge: 1,
  // `maxHp` grows by whole cubes, but is a float after a heal-scaled change.
  maxHp: 1,
};

/** Timers that mean "a long time ago" once they pass this, collapsed to it. */
const LONG_AGO: ReadonlySet<string> = new Set(['timeSinceLastDamage', 'timeSinceLastAttack']);
const LONG_AGO_AT = 5;
const LONG_AGO_VALUE = 99;

const TEMPLATE: BrawlerEntity = createBrawlerEntity({
  id: '',
  name: '',
  brawlerId: 'mira',
  team: 0,
  x: 0,
  y: 0,
});

/** The fields that travel, in the order both peers agree on. */
export const BRAWLER_FIELDS = (Object.keys(TEMPLATE) as Array<keyof BrawlerEntity & string>).filter(
  key => !SKIP.has(key)
);

export const BRAWLER_SKIPPED: ReadonlyArray<string> = Array.from(SKIP);
export const BRAWLER_SCALES: Readonly<Record<string, number>> = SCALE;

/** Bits used per mask word. Thirty keeps every operation inside a safe int. */
const BITS = 30;
const MASK_WORDS = Math.ceil(BRAWLER_FIELDS.length / BITS);

function quantise(key: string, value: unknown): unknown {
  if (typeof value !== 'number') return value;
  let v = value;
  if (LONG_AGO.has(key) && v > LONG_AGO_AT) v = LONG_AGO_VALUE;
  const scale = SCALE[key];
  return scale === undefined ? v : Math.round(v * scale);
}

function dequantise(key: string, value: unknown): unknown {
  if (typeof value !== 'number') return value;
  const scale = SCALE[key];
  return scale === undefined || scale === 1 ? value : value / scale;
}

/** Encoded form of every field on a fresh brawler, for comparison. */
const TEMPLATE_ENCODED: unknown[] = BRAWLER_FIELDS.map(key => quantise(key, TEMPLATE[key]));

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // The only object-valued field that travels is a small record of cooldowns.
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/**
 * A brawler as `[maskWord…, value…]`: one bit per field that differs from a
 * fresh brawler, followed by those fields' values in order.
 */
export function encodeBrawler(b: BrawlerEntity): unknown[] {
  const out: unknown[] = new Array(MASK_WORDS).fill(0);

  for (let i = 0; i < BRAWLER_FIELDS.length; i++) {
    const key = BRAWLER_FIELDS[i];
    const value = quantise(key, b[key]);
    if (sameValue(value, TEMPLATE_ENCODED[i])) continue;
    // `undefined` is not a value the wire can carry, and "absent" already
    // decodes to the fresh brawler's default.
    if (value === undefined) continue;

    out[(i / BITS) | 0] = (out[(i / BITS) | 0] as number) | (1 << i % BITS);
    out.push(value);
  }
  return out;
}

export function decodeBrawler(packed: unknown[]): BrawlerEntity {
  // A fresh copy, so a decoded brawler never shares state with the template
  // or with another brawler.
  const b: Record<string, unknown> = { ...TEMPLATE, passiveCooldowns: {} };
  let cursor = MASK_WORDS;

  for (let i = 0; i < BRAWLER_FIELDS.length; i++) {
    const word = packed[(i / BITS) | 0] as number;
    if ((word & (1 << i % BITS)) === 0) continue;
    const key = BRAWLER_FIELDS[i];
    b[key] = dequantise(key, packed[cursor++]);
  }
  return b as unknown as BrawlerEntity;
}

/* ---------------------------------------------------------------- *
 * Projectiles and effects: compact tuples, because the client reads
 * five or six fields of each and the rest is the simulation's business.
 * ---------------------------------------------------------------- */

const PROJECTILE_ID = /^proj-(\d+)$/;

export function encodeProjectile(p: BrawlProjectile): unknown[] {
  const match = PROJECTILE_ID.exec(p.id);
  return [
    match ? Number(match[1]) : p.id,
    Math.round(p.x * 10),
    Math.round(p.y * 10),
    Math.round(p.vx),
    Math.round(p.vy),
    Math.round(p.radius * 10),
    p.isSuper ? 1 : 0,
    p.brawlerId,
    p.team,
    p.color,
  ];
}

export function decodeProjectile(t: unknown[]): BrawlProjectile {
  return {
    id: typeof t[0] === 'number' ? 'proj-' + t[0] : (t[0] as string),
    ownerId: '',
    brawlerId: t[7] as BrawlProjectile['brawlerId'],
    team: t[8] as number,
    x: (t[1] as number) / 10,
    y: (t[2] as number) / 10,
    vx: t[3] as number,
    vy: t[4] as number,
    radius: (t[5] as number) / 10,
    damage: 0,
    maxRange: 0,
    traveled: 0,
    isSuper: t[6] === 1,
    color: t[9] as string,
    piercesWalls: false,
    breaksWalls: false,
  };
}

/** Effects older than this have nothing left to show; newer ones win a cap. */
const MAX_EFFECTS = 40;
const MAX_FLOATING = 14;

export function encodeEffect(e: VisualEffect): unknown[] {
  return [
    e.type,
    Math.round(e.x * 10),
    Math.round(e.y * 10),
    Math.round(e.radius),
    e.color,
    Math.round(e.duration * 100),
    Math.round(e.progress * 100),
    e.angle === undefined ? null : Math.round(e.angle * 100),
    e.intensity === undefined ? null : Math.round(e.intensity * 100),
  ];
}

export function decodeEffect(t: unknown[], index: number): VisualEffect {
  return {
    id: 'fx-' + index,
    type: t[0] as VisualEffect['type'],
    x: (t[1] as number) / 10,
    y: (t[2] as number) / 10,
    radius: t[3] as number,
    color: t[4] as string,
    duration: (t[5] as number) / 100,
    progress: (t[6] as number) / 100,
    angle: t[7] === null ? undefined : (t[7] as number) / 100,
    intensity: t[8] === null ? undefined : (t[8] as number) / 100,
  };
}

export function encodeFloating(f: FloatingNumber): unknown[] {
  return [f.text, Math.round(f.x), Math.round(f.y), f.color, Math.round(f.alpha * 100)];
}

export function decodeFloating(t: unknown[], index: number): FloatingNumber {
  return {
    id: 'fn-' + index,
    text: t[0] as string,
    x: t[1] as number,
    y: t[2] as number,
    color: t[3] as string,
    alpha: (t[4] as number) / 100,
    vy: -32,
  };
}

/* ---------------------------------------------------------------- *
 * The packet.
 * ---------------------------------------------------------------- */

/** A snapshot as it travels. Static geometry is present only when it changed. */
export type NetSnapshot = Omit<
  BrawlSnapshot,
  'brawlers' | 'projectiles' | 'visualEffects' | 'floatingNumbers' | 'walls' | 'bushes'
> & {
  b: unknown[][];
  pr: unknown[][];
  fx: unknown[][];
  fn: unknown[][];
  /** Present on a keyframe or when a wall or bush has been destroyed. */
  statics?: { walls: BrawlWall[]; bushes: Bush[] };
};

/** How often geometry is resent even if nothing changed, as insurance. */
const KEYFRAME_MS = 3000;

/**
 * Host side. Remembers what the clients already have.
 *
 * Walls and bushes only ever disappear — nothing builds them back — so their
 * counts are a complete change detector: if the counts match, the contents do.
 * Anything that makes geometry appear mid-match will have to stop relying on
 * that, which is why the keyframe exists.
 */
export class SnapshotEncoder {
  private lastKey = -1;
  private lastKeyframeAt = -Infinity;

  /** Forget what clients have, so the next packet carries the geometry. */
  public reset(): void {
    this.lastKey = -1;
    this.lastKeyframeAt = -Infinity;
  }

  public encode(snap: BrawlSnapshot, nowMs: number): NetSnapshot {
    const { brawlers, projectiles, visualEffects, floatingNumbers, walls, bushes, ...rest } = snap;

    const key = walls.length * 100000 + bushes.length;
    const sendStatics = key !== this.lastKey || nowMs - this.lastKeyframeAt >= KEYFRAME_MS;
    if (sendStatics) {
      this.lastKey = key;
      this.lastKeyframeAt = nowMs;
    }

    const effects = visualEffects ?? [];
    const fxStart = Math.max(0, effects.length - MAX_EFFECTS);
    const fnStart = Math.max(0, floatingNumbers.length - MAX_FLOATING);

    const net: NetSnapshot = {
      ...rest,
      b: brawlers.map(encodeBrawler),
      pr: projectiles.map(encodeProjectile),
      fx: effects.slice(fxStart).map(encodeEffect),
      fn: floatingNumbers.slice(fnStart).map(encodeFloating),
    };
    if (sendStatics) net.statics = { walls, bushes };
    return net;
  }
}

/** Client side. Keeps the last geometry it was given. */
export class SnapshotDecoder {
  private walls: BrawlWall[] = [];
  private bushes: Bush[] = [];

  public reset(): void {
    this.walls = [];
    this.bushes = [];
  }

  public decode(net: NetSnapshot): BrawlSnapshot {
    const { b, pr, fx, fn, statics, ...rest } = net;
    if (statics) {
      this.walls = statics.walls;
      this.bushes = statics.bushes;
    }
    return {
      ...rest,
      brawlers: b.map(decodeBrawler),
      projectiles: pr.map(decodeProjectile),
      visualEffects: fx.map(decodeEffect),
      floatingNumbers: fn.map(decodeFloating),
      walls: this.walls,
      bushes: this.bushes,
    };
  }
}
