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
 * So the simulation runs on a timer and the renderer on rAF. The accumulator
 * absorbs timer jitter, and a throttled wake-up simply arrives with more time
 * to account for, which is exactly the case fixed-timestep catch-up handles.
 */

export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;

/**
 * Steps a single wake-up may run.
 *
 * Generous, because a throttled timer is *expected* to arrive with a second or
 * more of real time banked, and catching up is the right response: ten seconds
 * of simulation, which is far more than any legitimate stall.
 */
const MAX_STEPS_PER_WAKE = 600;

/**
 * Real time beyond this in one wake-up is discarded rather than simulated. A
 * gap this large means the machine slept; replaying it would fast-forward the
 * match the instant the player came back.
 */
const MAX_DELTA = 10;

/**
 * Timer period. Oversampled relative to the tick rate so the accumulator is
 * rarely left waiting on the clock, and so ordinary timer jitter cannot cost a
 * whole tick.
 */
const SIM_TIMER_MS = 1000 / 120;

export interface StepPlan {
  /** Number of fixed steps to run now. */
  steps: number;
  /** Time left over, carried into the next frame. */
  remainder: number;
  /** True when time had to be thrown away to stay inside the budget. */
  dropped: boolean;
}

/**
 * Decides how to spend elapsed real time, given what is already banked.
 *
 * Pulled out as a pure function so the policy can be tested directly: it is the
 * part of the loop most likely to be quietly wrong, and the hardest to observe
 * from the outside.
 */
export function planSteps(
  accumulator: number,
  frameDt: number,
  maxSteps: number,
  maxDelta: number
): StepPlan {
  // A delta this large means the loop was not running — a slept machine, a
  // long stall. Simulating it would fast-forward the match; account for one
  // step and move on.
  const usable = frameDt > maxDelta ? FIXED_DT : frameDt;

  let banked = accumulator + usable;
  const wanted = Math.floor(banked / FIXED_DT);
  const steps = Math.min(wanted, maxSteps);
  banked -= steps * FIXED_DT;

  // Hit the cap: the backlog is unrecoverable, so drop it rather than carry a
  // debt that guarantees the next frame is late too.
  const dropped = wanted > maxSteps;
  return { steps, remainder: dropped ? 0 : banked, dropped };
}

export interface LoopCallbacks {
  /** Advances the simulation by exactly FIXED_DT seconds. */
  update: (dt: number, tick: number) => void;
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
  private timerId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private tick = 0;

  /** Simulation steps executed in the most recent wake-up. */
  public lastStepCount = 0;
  /** Smoothed frames per second, for the diagnostics overlay. */
  public fps = 60;

  constructor(private readonly callbacks: LoopCallbacks) {}

  public start(): void {
    if (this.running) return;
    this.running = true;

    const now = performance.now();
    this.lastSimTime = now;
    this.lastRenderTime = now;
    this.accumulator = 0;

    this.timerId = setInterval(this.simulate, SIM_TIMER_MS);
    this.rafId = requestAnimationFrame(this.frame);
  }

  public stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
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
