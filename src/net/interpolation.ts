/**
 * Entity interpolation for network clients.
 *
 * The host simulates at 60 Hz and broadcasts state at 30 Hz. A joining client
 * rendered whatever snapshot had most recently arrived, so every body on screen
 * teleported forward in 33 ms jumps and then sat still until the next packet —
 * and any jitter in delivery showed up directly as stutter.
 *
 * The fix is the standard one: hold incoming snapshots in a short buffer and
 * render the world slightly in the past, blending between the two snapshots
 * that bracket that moment. Costing ~100 ms of latency buys continuous motion
 * that survives late and irregular packets, which is a trade every action game
 * makes.
 *
 * Only remote clients use this. The host draws its own simulation directly and
 * has nothing to interpolate.
 */

import type { BrawlSnapshot, BrawlerEntity, BrawlProjectile } from '../types/brawl';
import { lerp, lerpAngle } from '../core/math';

/**
 * How far behind real time to render.
 *
 * Must exceed the broadcast interval, or the buffer runs dry between packets
 * and the stutter comes straight back. At 30 Hz the interval is 33 ms; 110 ms
 * leaves room for roughly three packets of jitter.
 */
export const INTERPOLATION_DELAY_MS = 110;

/** Snapshots older than this are of no further use. */
const BUFFER_WINDOW_MS = 1200;

interface TimedSnapshot {
  receivedAt: number;
  snapshot: BrawlSnapshot;
}

export class SnapshotInterpolator {
  private buffer: TimedSnapshot[] = [];
  private lastAccepted: BrawlSnapshot | null = null;

  /** Records a snapshot as it arrives. Duplicates are ignored. */
  public push(snapshot: BrawlSnapshot, now: number): void {
    if (snapshot === this.lastAccepted) return;
    this.lastAccepted = snapshot;

    this.buffer.push({ receivedAt: now, snapshot });

    const cutoff = now - BUFFER_WINDOW_MS;
    while (this.buffer.length > 2 && this.buffer[0].receivedAt < cutoff) {
      this.buffer.shift();
    }
  }

  public clear(): void {
    this.buffer.length = 0;
    this.lastAccepted = null;
  }

  /**
   * The world as it should look right now: blended between the two buffered
   * snapshots that bracket `now - INTERPOLATION_DELAY_MS`.
   *
   * Falls back to the newest snapshot whenever there is nothing to blend —
   * the first moments of a match, or a stall long enough to drain the buffer.
   * Showing slightly stale state is better than showing none.
   */
  public sample(now: number): BrawlSnapshot | null {
    if (this.buffer.length === 0) return null;
    if (this.buffer.length === 1) return this.buffer[0].snapshot;

    const renderTime = now - INTERPOLATION_DELAY_MS;

    let older: TimedSnapshot | null = null;
    let newer: TimedSnapshot | null = null;
    for (let i = this.buffer.length - 1; i > 0; i--) {
      if (this.buffer[i - 1].receivedAt <= renderTime && this.buffer[i].receivedAt >= renderTime) {
        older = this.buffer[i - 1];
        newer = this.buffer[i];
        break;
      }
    }

    if (!older || !newer) {
      // renderTime is ahead of everything buffered (we have fallen behind) or
      // behind all of it (a long stall). Either way, the newest state is the
      // best available answer.
      return this.buffer[this.buffer.length - 1].snapshot;
    }

    const span = newer.receivedAt - older.receivedAt;
    const t = span > 0 ? (renderTime - older.receivedAt) / span : 1;

    return blendSnapshots(older.snapshot, newer.snapshot, t);
  }
}

/**
 * Produces a snapshot positioned between `from` and `to`.
 *
 * Only continuous quantities are blended. Discrete state — health, ammo, who is
 * alive, which effects are playing — is taken from the newer snapshot, because
 * halfway between "alive" and "dead" is not a state the renderer can draw.
 */
function blendSnapshots(from: BrawlSnapshot, to: BrawlSnapshot, t: number): BrawlSnapshot {
  const previousBrawlers = new Map<string, BrawlerEntity>();
  for (const b of from.brawlers) previousBrawlers.set(b.id, b);

  const brawlers = to.brawlers.map(current => {
    const previous = previousBrawlers.get(current.id);
    // A body that was not in the older snapshot has only just appeared; there
    // is nothing to blend from, so place it where the host says it is.
    if (!previous) return current;

    return {
      ...current,
      x: lerp(previous.x, current.x, t),
      y: lerp(previous.y, current.y, t),
      angle: lerpAngle(previous.angle, current.angle, t),
      aimAngle: lerpAngle(previous.aimAngle, current.aimAngle, t),
      jumpProgress: lerp(previous.jumpProgress, current.jumpProgress, t),
    };
  });

  const previousProjectiles = new Map<string, BrawlProjectile>();
  for (const p of from.projectiles) previousProjectiles.set(p.id, p);

  const projectiles = to.projectiles.map(current => {
    const previous = previousProjectiles.get(current.id);
    if (!previous) return current;
    return {
      ...current,
      x: lerp(previous.x, current.x, t),
      y: lerp(previous.y, current.y, t),
    };
  });

  return { ...to, brawlers, projectiles };
}
