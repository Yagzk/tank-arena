import { describe, expect, it } from 'vitest';
import { Rng, seedFromString } from './rng';

describe('Rng', () => {
  it('replays the same stream from the same seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    const left = Array.from({ length: 64 }, () => a.next());
    const right = Array.from({ length: 64 }, () => b.next());
    expect(left).toEqual(right);
  });

  it('produces different streams from different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('stays inside [0, 1)', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('survives a zero seed', () => {
    // A zero state is degenerate for this generator and must be substituted.
    const rng = new Rng(0);
    const values = new Set(Array.from({ length: 20 }, () => rng.next()));
    expect(values.size).toBeGreaterThan(1);
  });

  it('respects range bounds', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.range(-5, 12);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(12);
    }
  });

  it('respects integer bounds inclusively', () => {
    const rng = new Rng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(1, 4);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(4);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([1, 2, 3, 4]));
  });

  it('can be snapshotted and restored', () => {
    const rng = new Rng(42);
    rng.next();
    const state = rng.getState();
    const expected = [rng.next(), rng.next(), rng.next()];

    rng.setState(state);
    expect([rng.next(), rng.next(), rng.next()]).toEqual(expected);
  });

  it('derives a stable seed from a string', () => {
    expect(seedFromString('WEQM')).toBe(seedFromString('WEQM'));
    expect(seedFromString('WEQM')).not.toBe(seedFromString('WEQN'));
  });
});
