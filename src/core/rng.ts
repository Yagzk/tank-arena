/**
 * Seeded pseudo-random number generator.
 *
 * The simulation must never call `Math.random()`: a match has to replay
 * identically from the same seed and the same input stream, otherwise
 * host and clients drift apart and replays are impossible. Every random
 * decision in the engine goes through an instance of this class, which is
 * created from the match seed and advanced only by the fixed-step update.
 *
 * mulberry32 — 32-bit state, passes gjrand, ~2^32 period, very cheap.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Avoid the degenerate all-zero state.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Uniform float in [0, 1). */
  public next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform float in [-magnitude, magnitude). */
  public spread(magnitude: number): number {
    return (this.next() * 2 - 1) * magnitude;
  }

  /** Uniform integer in [min, max]. */
  public int(min: number, max: number): number {
    return Math.floor(min + this.next() * (max - min + 1));
  }

  /** True with the given probability. */
  public chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** Uniform angle in [0, 2PI). */
  public angle(): number {
    return this.next() * Math.PI * 2;
  }

  public pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length) % items.length];
  }

  /** Snapshot of the internal state, for save/restore and desync debugging. */
  public getState(): number {
    return this.state;
  }

  public setState(state: number): void {
    this.state = state >>> 0;
  }
}

/** Derives a stable 32-bit seed from a string such as a room code. */
export function seedFromString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
