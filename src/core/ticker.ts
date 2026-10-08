/**
 * A clock that keeps running when the tab does not.
 *
 * Browsers throttle timers on any page that is not visible — alt-tabbed,
 * minimised, behind another window — down to one wake-up a second. A game
 * hosted from a browser tab is therefore fine for exactly as long as its host
 * keeps looking at it: the moment they switch away, the simulation advances in
 * one-second lurches, and every other player sees the whole match freeze and
 * then jump.
 *
 * Timers inside a Web Worker are not subject to that throttling. So the beat
 * comes from a worker, which posts a message every period; the main thread
 * does the simulating when the message arrives. Messages are not throttled
 * either, and the page is exempt from being frozen outright while it holds an
 * open peer connection.
 *
 * Where a worker cannot be created — a locked-down embed, an old browser —
 * this falls back to `setInterval`, which is the behaviour before this existed.
 */

export interface Ticker {
  start(callback: () => void, periodMs: number): void;
  stop(): void;
  /** Whether the beat comes from a worker, which is the one that matters. */
  readonly usesWorker: boolean;
}

/** The worker's whole program. Kept as text so no separate file has to ship. */
const WORKER_SOURCE = `
let id = null;
self.onmessage = (event) => {
  const message = event.data;
  if (message && message.cmd === 'start') {
    if (id !== null) clearInterval(id);
    id = setInterval(() => self.postMessage(0), message.period);
  } else if (message && message.cmd === 'stop') {
    if (id !== null) clearInterval(id);
    id = null;
  }
};
`;

export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: unknown) => void) | null;
}

/** Test seam: how a worker is made. */
export type WorkerFactory = () => WorkerLike | null;

function defaultWorkerFactory(): WorkerLike | null {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    return null;
  }
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
    const worker = new Worker(url);
    // The script has been handed to the worker; the URL is no longer needed.
    URL.revokeObjectURL(url);
    return worker as unknown as WorkerLike;
  } catch {
    return null;
  }
}

export function createTicker(factory: WorkerFactory = defaultWorkerFactory): Ticker {
  let worker: WorkerLike | null = null;
  let fallbackId: ReturnType<typeof setInterval> | null = null;
  let usesWorker = false;

  return {
    get usesWorker() {
      return usesWorker;
    },

    start(callback, periodMs) {
      this.stop();

      worker = factory();
      if (worker) {
        usesWorker = true;
        worker.onmessage = () => callback();
        worker.postMessage({ cmd: 'start', period: periodMs });
        return;
      }

      usesWorker = false;
      fallbackId = setInterval(callback, periodMs);
    },

    stop() {
      if (worker) {
        worker.postMessage({ cmd: 'stop' });
        worker.onmessage = null;
        worker.terminate();
        worker = null;
      }
      if (fallbackId !== null) {
        clearInterval(fallbackId);
        fallbackId = null;
      }
      usesWorker = false;
    },
  };
}
