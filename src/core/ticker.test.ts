import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTicker, type Ticker, type WorkerLike } from './ticker';
import { FIXED_DT, GameLoop } from './loop';

/** A worker that does nothing but record how it was driven. */
class FakeWorker implements WorkerLike {
  public sent: unknown[] = [];
  public terminated = false;
  public onmessage: ((event: unknown) => void) | null = null;
  postMessage(message: unknown) {
    this.sent.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  /** What the worker's own timer would do each period. */
  beat() {
    this.onmessage?.({ data: 0 });
  }
}

describe('the ticker', () => {
  it('takes its beat from the worker when it can have one', () => {
    const worker = new FakeWorker();
    const ticker = createTicker(() => worker);
    const callback = vi.fn();

    ticker.start(callback, 8);
    expect(ticker.usesWorker).toBe(true);
    expect(worker.sent[0]).toEqual({ cmd: 'start', period: 8 });

    worker.beat();
    worker.beat();
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('stops the worker and lets go of it', () => {
    const worker = new FakeWorker();
    const ticker = createTicker(() => worker);
    const callback = vi.fn();
    ticker.start(callback, 8);

    ticker.stop();
    expect(worker.sent).toContainEqual({ cmd: 'stop' });
    expect(worker.terminated).toBe(true);

    // A beat that was already in flight must not reach a loop that has ended.
    worker.beat();
    expect(callback).not.toHaveBeenCalled();
    expect(ticker.usesWorker).toBe(false);
  });

  it('does not leave the old worker running when restarted', () => {
    const first = new FakeWorker();
    const second = new FakeWorker();
    const queue = [first, second];
    const ticker = createTicker(() => queue.shift() ?? null);

    ticker.start(vi.fn(), 8);
    ticker.start(vi.fn(), 8);
    expect(first.terminated).toBe(true);
    expect(second.terminated).toBe(false);
  });

  describe('without a worker', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('falls back to a plain interval, which is what it did before', () => {
      const ticker = createTicker(() => null);
      const callback = vi.fn();
      ticker.start(callback, 10);
      expect(ticker.usesWorker).toBe(false);

      vi.advanceTimersByTime(55);
      expect(callback).toHaveBeenCalledTimes(5);

      ticker.stop();
      vi.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(5);
    });
  });
});

describe('the game loop on the ticker', () => {
  // The loop wants animation frames, which node does not have.
  const realRaf = globalThis.requestAnimationFrame;
  const realCancel = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.requestAnimationFrame = (() => 0) as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.requestAnimationFrame = realRaf;
    globalThis.cancelAnimationFrame = realCancel;
  });

  /** A clock the test fires by hand, with the time it reports under its control. */
  function manualClock() {
    let wake: () => void = () => undefined;
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const ticker: Ticker = {
      usesWorker: false,
      start: callback => {
        wake = callback;
      },
      stop: () => undefined,
    };
    return {
      ticker,
      /** Time passes and the clock wakes once, as a throttled timer would. */
      wakeAfter: (ms: number) => {
        now += ms;
        wake();
      },
    };
  }

  it('runs the hook once per wake-up, however many steps the wake-up ran', () => {
    // After a stall the loop catches up with a lot of steps at once. Anything
    // sent from inside each step turns one hiccup into a flood; the hook is
    // the place to send from, and it fires once.
    const clock = manualClock();
    let steps = 0;
    const hookCalls: number[] = [];
    const loop = new GameLoop(
      {
        update: () => {
          steps++;
        },
        afterSteps: n => hookCalls.push(n),
        render: () => undefined,
      },
      clock.ticker
    );

    loop.start();
    // A whole second passes before the clock wakes once, the way a hidden tab
    // with a throttled timer behaves.
    clock.wakeAfter(1000);
    loop.stop();

    expect(steps).toBe(60);
    // One wake-up, so one announcement — carrying all sixty steps.
    expect(hookCalls).toEqual([60]);
  });

  it('keeps its pace when the clock wakes on time', () => {
    const clock = manualClock();
    let steps = 0;
    const hookCalls: number[] = [];
    const loop = new GameLoop(
      { update: () => steps++, afterSteps: n => hookCalls.push(n), render: () => undefined },
      clock.ticker
    );
    loop.start();
    // Ten seconds in 8 ms beats, the cadence the worker keeps even when hidden.
    for (let i = 0; i < 1250; i++) clock.wakeAfter(8);
    loop.stop();

    expect(steps).toBeGreaterThanOrEqual(596);
    expect(steps).toBeLessThanOrEqual(604);
    // Most beats are too short to fit a whole step; the hook only fires for
    // the ones that did.
    expect(hookCalls.length).toBeLessThan(1250);
    expect(hookCalls.every(n => n >= 1)).toBe(true);
  });

  it('does not run the hook when there was nothing to simulate', () => {
    const hook = vi.fn();
    const loop = new GameLoop({ update: () => undefined, afterSteps: hook, render: () => undefined });
    loop.start();
    // Less than a tick has passed: no steps, so nothing to announce.
    vi.advanceTimersByTime(Math.floor((FIXED_DT * 1000) / 4));
    loop.stop();
    expect(hook).not.toHaveBeenCalled();
  });

  it('can be stopped without leaving a clock behind', () => {
    const update = vi.fn();
    const loop = new GameLoop({ update, render: () => undefined });
    loop.start();
    vi.advanceTimersByTime(100);
    loop.stop();

    const before = update.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(update.mock.calls.length).toBe(before);
  });
});
