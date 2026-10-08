/**
 * The fixed-timestep arithmetic, free of any browser API.
 *
 * Split out of `loop.ts` so the dedicated server can use the same policy as
 * the client without importing a file that mentions `requestAnimationFrame`.
 * Two sides that disagree about how elapsed time becomes simulation steps
 * would disagree about the match.
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
export const MAX_STEPS_PER_WAKE = 600;

/**
 * Real time beyond this in one wake-up is discarded rather than simulated. A
 * gap this large means the machine slept; replaying it would fast-forward the
 * match the instant the player came back.
 */
export const MAX_DELTA = 10;

/**
 * Timer period. Oversampled relative to the tick rate so the accumulator is
 * rarely left waiting on the clock, and so ordinary timer jitter cannot cost a
 * whole tick.
 */
export const SIM_TIMER_MS = 1000 / 120;

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

