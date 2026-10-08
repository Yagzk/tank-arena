/**
 * Lightweight rolling profiler.
 *
 * An engine you cannot measure is an engine you cannot keep fast: the previous
 * version had no way to tell whether a frame drop came from simulation,
 * drawing, or React re-rendering, so performance work would have been guesswork.
 *
 * Samples go into fixed-size ring buffers — no allocation per frame, and no
 * unbounded array to trim — and the overlay reads averages and worst cases
 * straight out of them.
 */

const SAMPLE_COUNT = 120;

class Track {
  private readonly samples = new Float32Array(SAMPLE_COUNT);
  private cursor = 0;
  private filled = 0;
  private startedAt = 0;

  public begin(): void {
    this.startedAt = performance.now();
  }

  public end(): void {
    this.push(performance.now() - this.startedAt);
  }

  public push(value: number): void {
    this.samples[this.cursor] = value;
    this.cursor = (this.cursor + 1) % SAMPLE_COUNT;
    if (this.filled < SAMPLE_COUNT) this.filled++;
  }

  public get average(): number {
    if (this.filled === 0) return 0;
    let total = 0;
    for (let i = 0; i < this.filled; i++) total += this.samples[i];
    return total / this.filled;
  }

  /**
   * The 95th percentile rather than the maximum: one scheduling hiccup should
   * not define the number you tune against, but a consistently slow tail should.
   */
  public get p95(): number {
    if (this.filled === 0) return 0;
    const sorted = Array.from(this.samples.subarray(0, this.filled)).sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  }
}

export class Profiler {
  /** Wall time spent inside the fixed-step simulation, per frame. */
  public readonly simulation = new Track();
  /** Wall time spent drawing, per frame. */
  public readonly render = new Track();
  /** Real time between frames. */
  public readonly frame = new Track();

  /** Counts refreshed each frame, for the overlay. */
  public counts: Record<string, number> = {};
  /** Fixed steps executed in the most recent frame. */
  public stepsLastFrame = 0;
  /**
   * Whether the simulation clock is a worker, which keeps running when the tab
   * is hidden, or a plain timer, which does not. Shown on the F3 overlay,
   * because "does it survive alt-tab" is not something you can see otherwise.
   */
  public clockSource: 'worker' | 'timer' | 'none' = 'none';

  public get fps(): number {
    const avg = this.frame.average;
    return avg > 0 ? 1000 / avg : 0;
  }

  public setCount(label: string, value: number): void {
    this.counts[label] = value;
  }
}

/** Shared instance; there is only ever one running game. */
export const profiler = new Profiler();
