/**
 * Fixed-timestep game loop with render interpolation.
 *
 * The old loop fed `requestAnimationFrame`'s delta straight into the engine,
 * which meant the game literally played differently on a 60 Hz and a 144 Hz
 * display: reload speed, projectile travel and regeneration all scaled with
 * frame time, and a backgrounded tab produced 50 ms steps that teleported
 * everything through walls.
 *
 * Here the simulation always advances in whole 1/60 s steps. Leftover time is
 * carried in an accumulator and exposed as `alpha`, the 0..1 blend factor the
 * renderer uses to interpolate between the previous and current state, so
 * motion stays smooth on displays that do not divide evenly into 60 Hz.
 */

export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;

/** Never simulate more than this many steps in one frame (spiral-of-death guard). */
const MAX_STEPS_PER_FRAME = 5;

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
  private lastTime = 0;
  private rafId = 0;
  private running = false;
  private tick = 0;

  /** Simulation steps executed in the most recent frame — useful for diagnostics. */
  public lastStepCount = 0;
  /** Smoothed frames per second, for the debug overlay. */
  public fps = 60;

  constructor(private readonly callbacks: LoopCallbacks) {}

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  public stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  public get currentTick(): number {
    return this.tick;
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);

    let frameDt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // A tab that was backgrounded hands us an enormous delta. Discarding it is
    // correct: we would rather drop simulated time than fast-forward the match.
    if (frameDt > 0.25) frameDt = FIXED_DT;

    this.fps += (1 / Math.max(frameDt, 1e-4) - this.fps) * 0.1;

    this.accumulator += frameDt;

    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.callbacks.update(FIXED_DT, this.tick);
      this.tick++;
      this.accumulator -= FIXED_DT;
      steps++;
    }
    this.lastStepCount = steps;

    // If we hit the step cap the machine cannot keep up; drop the backlog so
    // the next frame starts clean rather than falling further behind.
    if (steps === MAX_STEPS_PER_FRAME) {
      this.accumulator = 0;
    }

    this.callbacks.render(this.accumulator / FIXED_DT, frameDt);
  };
}
