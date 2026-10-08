/**
 * Fixed-timestep game loop with render interpolation.
 *
 * The original loop fed `requestAnimationFrame`'s delta straight into the
 * engine, which meant the game literally played differently on a 60 Hz and a
 * 144 Hz display: reload speed, projectile travel and regeneration all scaled
 * with frame time, and a backgrounded tab produced 50 ms steps that teleported
 * bodies through walls.
 *
 * Here the simulation always advances in whole 1/60 s steps. Leftover time is
 * carried in an accumulator and exposed as `alpha`, the 0..1 blend factor the
 * renderer uses between the previous and current state, so motion stays smooth
 * on displays that do not divide evenly into 60 Hz.
 *
 * Simulation and rendering are driven by different clocks on purpose.
 * `requestAnimationFrame` is throttled hard whenever the browser decides the
 * page is not worth painting — a background tab, an occluded window, a laptop
 * on battery — sometimes to one callback every several seconds, and it does so
 * without the page being marked hidden. Driving the simulation from it means a
 * peer-hosted match freezes for everybody the moment the host's window slips
 * behind another one.
 *
 * So the simulation runs on a timer and the renderer on rAF. The timer is not
 * a plain `setInterval` either: that is throttled to one wake-up a second the
 * moment the page is hidden, which freezes a hosted match for everybody the
 * instant its host alt-tabs. It runs in a Web Worker instead. The accumulator
 * absorbs timer jitter, and a throttled wake-up simply arrives with more time
 * to account for, which is exactly the case fixed-timestep catch-up handles.
 */

import { createTicker, type Ticker } from './ticker';

export { TICK_RATE, FIXED_DT, planSteps, type StepPlan } from './timestep';
import { FIXED_DT, MAX_DELTA, MAX_STEPS_PER_WAKE, SIM_TIMER_MS, planSteps } from './timestep';

export interface LoopCallbacks {
  /** Advances the simulation by exactly FIXED_DT seconds. */
  update: (dt: number, tick: number) => void;
  /**
   * Runs once after a batch of steps, with how many there were.
   *
   * Anything that should happen at most once per wake-up belongs here rather
   * than in `update`: after a stall the loop catches up with dozens of steps
   * at once, and sending a network packet from inside each of them turns one
   * hiccup into a burst that floods every client.
   */
  afterSteps?: (steps: number) => void;
  /**
   * Draws a frame. `alpha` is how far the renderer sits between the last two
   * simulation states; `frameDt` is real elapsed time, for purely cosmetic
   * animation that does not affect gameplay.
   */
  render: (alpha: number, frameDt: number) => void;
}

export class GameLoop {
  private accumulator = 0;
  private lastSimTime = 0;
  private lastRenderTime = 0;
  private rafId = 0;
  private readonly ticker: Ticker;
  private running = false;
  private tick = 0;

  /** Simulation steps executed in the most recent wake-up. */
  public lastStepCount = 0;
  /** Smoothed frames per second, for the diagnostics overlay. */
  public fps = 60;

  /** `ticker` is replaceable so a test can hand the loop a clock it controls. */
  constructor(
    private readonly callbacks: LoopCallbacks,
    ticker: Ticker = createTicker()
  ) {
    this.ticker = ticker;
  }

  /** Whether the simulation clock survives the tab being hidden. */
  public get survivesBackground(): boolean {
    return this.ticker.usesWorker;
  }

  public start(): void {
    if (this.running) return;
    this.running = true;

    const now = performance.now();
    this.lastSimTime = now;
    this.lastRenderTime = now;
    this.accumulator = 0;

    // The beat comes from a worker, so a host who alt-tabs does not freeze the
    // match for everybody else. See `ticker.ts`.
    this.ticker.start(this.simulate, SIM_TIMER_MS);
    this.rafId = requestAnimationFrame(this.frame);
  }

  public stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.ticker.stop();
  }

  public get currentTick(): number {
    return this.tick;
  }

  private simulate = (): void => {
    if (!this.running) return;

    const now = performance.now();
    const elapsed = (now - this.lastSimTime) / 1000;
    this.lastSimTime = now;

    const plan = planSteps(this.accumulator, elapsed, MAX_STEPS_PER_WAKE, MAX_DELTA);
    for (let i = 0; i < plan.steps; i++) {
      this.callbacks.update(FIXED_DT, this.tick);
      this.tick++;
    }

    this.accumulator = plan.remainder;
    this.lastStepCount = plan.steps;
    if (plan.steps > 0) this.callbacks.afterSteps?.(plan.steps);
  };

  private frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);

    const frameDt = (now - this.lastRenderTime) / 1000;
    this.lastRenderTime = now;
    this.fps += (1 / Math.max(frameDt, 1e-4) - this.fps) * 0.1;

    this.callbacks.render(this.accumulator / FIXED_DT, frameDt);
  };
}
