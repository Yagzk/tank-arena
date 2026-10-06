import { describe, expect, it } from 'vitest';
import { FIXED_DT, planSteps } from './loop';

/** Budgets matching the loop's own, so the tests describe real policy. */
const MAX_STEPS = 600;
const MAX_DELTA = 10;

/** A deliberately tight budget, for the cases about running out of it. */
const TIGHT_STEPS = 5;

describe('planSteps', () => {
  it('runs one step for one tick of elapsed time', () => {
    const plan = planSteps(0, FIXED_DT, MAX_STEPS, MAX_DELTA);
    expect(plan.steps).toBe(1);
    expect(plan.remainder).toBeCloseTo(0, 10);
  });

  it('banks a partial tick instead of running it', () => {
    // The leftover is what the renderer interpolates with; spending it early
    // would make the simulation run slightly fast.
    const plan = planSteps(0, FIXED_DT * 0.5, MAX_STEPS, MAX_DELTA);
    expect(plan.steps).toBe(0);
    expect(plan.remainder).toBeCloseTo(FIXED_DT * 0.5, 10);
  });

  it('spends banked time on the next frame', () => {
    const first = planSteps(0, FIXED_DT * 0.6, MAX_STEPS, MAX_DELTA);
    const second = planSteps(first.remainder, FIXED_DT * 0.6, MAX_STEPS, MAX_DELTA);
    expect(second.steps).toBe(1);
  });

  it('keeps wall-clock over many uneven frames', () => {
    // A 144 Hz display does not divide evenly into 60 Hz, which is exactly the
    // case the accumulator exists for.
    const frameDt = 1 / 144;
    let accumulator = 0;
    let steps = 0;
    for (let i = 0; i < 1440; i++) {
      const plan = planSteps(accumulator, frameDt, MAX_STEPS, MAX_DELTA);
      accumulator = plan.remainder;
      steps += plan.steps;
    }
    // Ten seconds of real time is 600 ticks, give or take the final partial.
    expect(steps).toBeGreaterThanOrEqual(599);
    expect(steps).toBeLessThanOrEqual(600);
  });

  it('caps the work a single frame may do', () => {
    // 0.2 s is inside the discard threshold, so it is real time the loop must
    // account for — twelve ticks' worth, against a budget of five.
    const plan = planSteps(0, 0.2, TIGHT_STEPS, MAX_DELTA);
    expect(plan.steps).toBe(TIGHT_STEPS);
  });

  it('drops the backlog it could not run', () => {
    // Carrying an unrecoverable debt guarantees the next frame is late too,
    // and the one after that — the spiral of death.
    const plan = planSteps(0, 0.2, TIGHT_STEPS, MAX_DELTA);
    expect(plan.dropped).toBe(true);
    expect(plan.remainder).toBe(0);
  });

  it('accounts for one step when the loop was clearly not running', () => {
    // A slept machine or a long stall. Simulating the gap would fast-forward
    // the match the instant the player came back.
    const plan = planSteps(0, 45, MAX_STEPS, MAX_DELTA);
    expect(plan.steps).toBe(1);
    expect(plan.dropped).toBe(false);
  });

  it('catches up a throttled wake-up', () => {
    // Browsers clamp background timers to around a second. A host must
    // simulate that second, or the match freezes for everyone else.
    const plan = planSteps(0, 1.0, MAX_STEPS, MAX_DELTA);
    expect(plan.steps).toBe(60);
    expect(plan.dropped).toBe(false);
  });

  it('never returns a negative remainder', () => {
    for (const dt of [0, 0.001, FIXED_DT, 0.05, 0.3, 2, 60]) {
      const plan = planSteps(0.004, dt, MAX_STEPS, MAX_DELTA);
      expect(plan.remainder).toBeGreaterThanOrEqual(0);
      expect(plan.steps).toBeGreaterThanOrEqual(0);
    }
  });
});
