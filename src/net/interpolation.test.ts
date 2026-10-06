import { describe, expect, it } from 'vitest';
import { INTERPOLATION_DELAY_MS, SnapshotInterpolator } from './interpolation';
import type { BrawlSnapshot, BrawlerEntity } from '../types/brawl';

function brawler(id: string, x: number, y: number, extra: Partial<BrawlerEntity> = {}) {
  return { id, x, y, angle: 0, aimAngle: 0, jumpProgress: 0, hp: 100, ...extra } as BrawlerEntity;
}

function snapshot(brawlers: BrawlerEntity[], projectiles: { id: string; x: number; y: number }[] = []) {
  return { brawlers, projectiles } as unknown as BrawlSnapshot;
}

/** Pushes two snapshots `gap` ms apart and samples at `now`. */
function sampleBetween(
  first: BrawlSnapshot,
  second: BrawlSnapshot,
  gap: number,
  now: number
): BrawlSnapshot | null {
  const interp = new SnapshotInterpolator();
  interp.push(first, 1000);
  interp.push(second, 1000 + gap);
  return interp.sample(now);
}

describe('SnapshotInterpolator', () => {
  it('returns nothing before any snapshot arrives', () => {
    expect(new SnapshotInterpolator().sample(5000)).toBeNull();
  });

  it('returns the only snapshot it has', () => {
    const interp = new SnapshotInterpolator();
    const snap = snapshot([brawler('a', 10, 10)]);
    interp.push(snap, 1000);
    expect(interp.sample(1200)).toBe(snap);
  });

  it('ignores a repeated reference to the same snapshot', () => {
    const interp = new SnapshotInterpolator();
    const snap = snapshot([brawler('a', 10, 10)]);
    // React re-renders hand the same object over and over; buffering each one
    // would collapse the time span between distinct states to zero.
    interp.push(snap, 1000);
    interp.push(snap, 1016);
    interp.push(snap, 1032);
    expect(interp.sample(1100)).toBe(snap);
  });

  it('blends position halfway between two snapshots', () => {
    const gap = 100;
    // Sampling renders INTERPOLATION_DELAY_MS in the past, so aim the render
    // clock at the midpoint of the two packets.
    const now = 1000 + gap / 2 + INTERPOLATION_DELAY_MS;
    const result = sampleBetween(
      snapshot([brawler('a', 0, 0)]),
      snapshot([brawler('a', 100, 200)]),
      gap,
      now
    );

    expect(result!.brawlers[0].x).toBeCloseTo(50, 5);
    expect(result!.brawlers[0].y).toBeCloseTo(100, 5);
  });

  it('blends projectiles too', () => {
    const gap = 100;
    const now = 1000 + gap / 2 + INTERPOLATION_DELAY_MS;
    const result = sampleBetween(
      snapshot([], [{ id: 'p1', x: 0, y: 0 }]),
      snapshot([], [{ id: 'p1', x: 80, y: 40 }]),
      gap,
      now
    );

    expect(result!.projectiles[0].x).toBeCloseTo(40, 5);
    expect(result!.projectiles[0].y).toBeCloseTo(20, 5);
  });

  it('takes the short arc when an angle wraps past PI', () => {
    const gap = 100;
    const now = 1000 + gap / 2 + INTERPOLATION_DELAY_MS;
    const result = sampleBetween(
      snapshot([brawler('a', 0, 0, { aimAngle: 3.0 })]),
      snapshot([brawler('a', 0, 0, { aimAngle: -3.0 })]),
      gap,
      now
    );

    // Blending the raw numbers would sweep the whole way round through zero.
    // The short arc crosses PI instead.
    expect(Math.abs(result!.brawlers[0].aimAngle)).toBeGreaterThan(3.0);
  });

  it('carries discrete state from the newer snapshot', () => {
    const gap = 100;
    const now = 1000 + gap / 2 + INTERPOLATION_DELAY_MS;
    const result = sampleBetween(
      snapshot([brawler('a', 0, 0, { hp: 100 })]),
      snapshot([brawler('a', 100, 0, { hp: 20 })]),
      gap,
      now
    );

    // Halfway between 100 and 20 health is not a state the host ever had.
    expect(result!.brawlers[0].hp).toBe(20);
  });

  it('places a newly appeared body where the host says it is', () => {
    const gap = 100;
    const now = 1000 + gap / 2 + INTERPOLATION_DELAY_MS;
    const result = sampleBetween(
      snapshot([brawler('a', 0, 0)]),
      snapshot([brawler('a', 100, 0), brawler('b', 500, 500)]),
      gap,
      now
    );

    const fresh = result!.brawlers.find(b => b.id === 'b')!;
    expect(fresh.x).toBe(500);
    expect(fresh.y).toBe(500);
  });

  it('drops bodies the host no longer reports', () => {
    const gap = 100;
    const now = 1000 + gap / 2 + INTERPOLATION_DELAY_MS;
    const result = sampleBetween(
      snapshot([brawler('a', 0, 0), brawler('b', 10, 10)]),
      snapshot([brawler('a', 100, 0)]),
      gap,
      now
    );

    expect(result!.brawlers).toHaveLength(1);
  });

  it('falls back to the newest state when the buffer has run dry', () => {
    const interp = new SnapshotInterpolator();
    interp.push(snapshot([brawler('a', 0, 0)]), 1000);
    const latest = snapshot([brawler('a', 100, 0)]);
    interp.push(latest, 1100);

    // Far enough ahead that the render clock is past every buffered packet.
    expect(interp.sample(9000)).toBe(latest);
  });

  it('forgets snapshots older than the buffer window', () => {
    const interp = new SnapshotInterpolator();
    for (let i = 0; i < 200; i++) {
      interp.push(snapshot([brawler('a', i, 0)]), 1000 + i * 33);
    }
    // Sampling still works after long play; the buffer is bounded, not growing.
    const result = interp.sample(1000 + 199 * 33);
    expect(result).not.toBeNull();
  });

  it('starts clean after clear', () => {
    const interp = new SnapshotInterpolator();
    interp.push(snapshot([brawler('a', 0, 0)]), 1000);
    interp.clear();
    expect(interp.sample(1200)).toBeNull();
  });
});
