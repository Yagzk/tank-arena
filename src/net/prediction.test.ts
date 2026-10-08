import { describe, expect, it } from 'vitest';
import { BrawlEngine } from '../game/brawlEngine';
import { FIXED_DT } from '../core/loop';
import { Predictor } from './prediction';
import { decodeBrawler, encodeBrawler } from '../network/codec';
import type { BrawlerEntity, BrawlWall, PlayerInfo } from '../types/brawl';

const MS_PER_TICK = FIXED_DT * 1000;

interface Setup {
  /** One-way delay, in ticks. A round trip is twice this. */
  latency: number;
  walls?: BrawlWall[];
  /** Snapshot every this many ticks. Two is thirty a second. */
  snapshotEvery?: number;
  /** Extra ticks of delay, at most, added to each packet — a link that is not steady. */
  jitter?: number;
  /** The player's movement, by tick. */
  script: (tick: number) => { x: number; y: number };
  ticks: number;
}

interface Result {
  /** Largest gap between what was drawn and what the server will have, in units. */
  worstPredicted: number;
  /** The same, for drawing the server's position as it arrived, interpolation delay included. */
  worstNaive: number;
  /** Mean of the predicted error, for a figure that is not one unlucky tick. */
  meanPredicted: number;
}

/**
 * A server, a client and a link between them with a fixed delay each way.
 *
 * What the client draws is compared with where the server's body actually is by
 * the time the client's input could have reached it. That is the right yardstick:
 * a prediction cannot know the future, only what the server will have done with
 * the inputs it has already been sent.
 */
function simulate(setup: Setup): Result {
  const roster: PlayerInfo[] = ['mira', 'rivet', 'boulder', 'fuse'].map((brawler, i) => ({
    id: 'p' + i,
    name: 'P' + i,
    brawler: brawler as PlayerInfo['brawler'],
    team: i,
    isHost: i === 0,
    isBot: i > 0,
    score: 0,
    trophies: 0,
  }));
  const engine = new BrawlEngine();
  engine.initMatch(roster, 'showdown', 11);
  engine.phase = 'playing';
  engine.walls = setup.walls ?? [];
  engine.boxes = [];
  engine.bushes = [];
  engine.poisonGas.isActive = false;
  // The other three stand still, far away, and take no part.
  engine.brawlers.slice(1).forEach((b, i) => {
    b.x = 2000;
    b.y = 200 + i * 400;
    b.isBot = false;
  });

  const me = engine.brawlers[0];
  me.x = 600;
  me.y = 900;

  const predictor = new Predictor();
  const snapshotEvery = setup.snapshotEvery ?? 2;

  const up: Array<{ at: number; seq: number; input: { x: number; y: number } }> = [];
  const down: Array<{ at: number; me: BrawlerEntity }> = [];
  /** The server's body after each of its updates. */
  const history: Array<{ x: number; y: number }> = [];
  /** What the client drew on each of its frames. */
  const drawn: Array<{ x: number; y: number } | null> = [];
  /** What the client would draw if it only had the server's snapshots. */
  const received: Array<{ x: number; y: number; at: number }> = [];

  let seq = 0;
  let worstPredicted = 0;
  let worstNaive = 0;
  let sum = 0;
  let samples = 0;

  const NAIVE_DELAY_TICKS = Math.round(110 / MS_PER_TICK);

  /** Deterministic stand-in for network jitter, so a failure can be reproduced. */
  const jitterFor = (tick: number, salt: number): number =>
    setup.jitter ? Math.floor(((Math.sin(tick * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1 * (setup.jitter + 1)) : 0;

  for (let tick = 0; tick < setup.ticks; tick++) {
    const nowMs = tick * MS_PER_TICK;

    // ---- the client: this frame's input, answered immediately ----------
    const input = setup.script(tick);
    seq += 1;
    predictor.onLocalInput(seq, input.x, input.y, nowMs);
    const extraUp = jitterFor(tick, 1);
    const lastUp = up.length ? up[up.length - 1].at : 0;
    // A link may delay a packet; it does not reorder them.
    up.push({ at: Math.max(lastUp, tick + setup.latency + extraUp), seq, input });

    // ---- the server: inputs that have arrived, then a tick -------------
    while (up.length && up[0].at <= tick) {
      const arrived = up.shift()!;
      engine.setPlayerInput(
        'p0',
        { moveX: arrived.input.x, moveY: arrived.input.y, aimAngle: 0, attack: false, superAttack: false },
        arrived.seq
      );
    }
    engine.update(FIXED_DT);
    history.push({ x: me.x, y: me.y });

    if (tick % snapshotEvery === 0) {
      // Through the real wire format, so its rounding is part of what is tested.
      const onTheWire = decodeBrawler(encodeBrawler(me));
      const extraDown = jitterFor(tick, 2);
      const lastDown = down.length ? down[down.length - 1].at : 0;
      down.push({ at: Math.max(lastDown, tick + setup.latency + extraDown), me: onTheWire });
    }

    // ---- the client: snapshots that have arrived -----------------------
    while (down.length && down[0].at <= tick) {
      const snap = down.shift()!;
      predictor.reconcile(snap.me, engine.walls, engine.boxes, true);
      received.push({ x: snap.me.x, y: snap.me.y, at: tick });
    }
    predictor.advance(FIXED_DT);
    drawn.push(predictor.position(nowMs));

    // ---- measure -------------------------------------------------------
    // The frame drawn `latency` ticks ago, judged against what the server did
    // with the inputs it was sent by then. That outcome only exists now.
    const frame = tick - setup.latency;
    if (frame < 40) continue;
    const shown = drawn[frame];
    const truth = history[frame + setup.latency - 1];
    if (!shown || !truth) continue;

    const error = Math.hypot(shown.x - truth.x, shown.y - truth.y);
    worstPredicted = Math.max(worstPredicted, error);
    sum += error;
    samples++;

    // Drawing only what the server last said, as the interpolation delay would.
    const stale = received.filter(r => r.at <= frame - NAIVE_DELAY_TICKS).pop();
    if (stale) {
      worstNaive = Math.max(worstNaive, Math.hypot(stale.x - truth.x, stale.y - truth.y));
    }
  }

  if (samples < 50) throw new Error('the harness measured almost nothing: ' + samples + ' samples');
  return { worstPredicted, worstNaive, meanPredicted: sum / Math.max(1, samples) };
}

/** Walk right, then up, then stop, then back — enough to turn and brake. */
function walkAbout(tick: number): { x: number; y: number } {
  const phase = Math.floor(tick / 30) % 6;
  return [{ x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: -1 }, { x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 1 }][phase];
}

describe('prediction against a real server', () => {
  it('stays close to where the server will be, on a 100 ms round trip', () => {
    const result = simulate({ latency: 3, script: walkAbout, ticks: 300 });
    expect(result.worstPredicted).toBeLessThan(6);
  });

  it('is far closer than drawing what the server last said', () => {
    // The whole point. A body at 175 units a second covers about 30 units while
    // the interpolation delay and the link are waited out.
    const result = simulate({ latency: 3, script: walkAbout, ticks: 300 });
    expect(result.worstNaive).toBeGreaterThan(25);
    expect(result.worstPredicted).toBeLessThan(result.worstNaive / 4);
  });

  it('holds up as the link gets worse', () => {
    for (const latency of [1, 3, 6, 10]) {
      const result = simulate({ latency, script: walkAbout, ticks: 300 });
      // Worse links do not make the prediction worse: it is replayed from the
      // server's word every time, so lateness costs nothing.
      expect(result.worstPredicted, 'latency ' + latency).toBeLessThan(8);
    }
  });

  it('agrees with the server about walls', () => {
    // A wall across the path. Walking into it must stop the predicted body where
    // the server stops the real one, or every correction is a visible snap.
    const wall: BrawlWall = { id: 'w', x: 900, y: 600, w: 40, h: 600, isDestructible: false };
    const result = simulate({
      latency: 3,
      walls: [wall],
      script: () => ({ x: 1, y: 0 }),
      ticks: 240,
    });
    expect(result.worstPredicted).toBeLessThan(6);
  });

  it('slides along a wall instead of sticking to it', () => {
    const wall: BrawlWall = { id: 'w', x: 900, y: 600, w: 40, h: 600, isDestructible: false };
    const result = simulate({
      latency: 3,
      walls: [wall],
      // Pushing diagonally into it: one axis blocked, the other free.
      script: () => ({ x: 1, y: -1 }),
      ticks: 240,
    });
    expect(result.worstPredicted).toBeLessThan(6);
  });

  it('does not wobble when nothing is happening', () => {
    const result = simulate({ latency: 4, script: () => ({ x: 0, y: 0 }), ticks: 120 });
    expect(result.worstPredicted).toBeLessThan(0.5);
  });

  it('is exact on a steady link, whatever its delay', () => {
    // Same code, same inputs, same order: nothing left to disagree about.
    for (const latency of [1, 3, 8]) {
      const result = simulate({ latency, script: walkAbout, ticks: 300 });
      expect(result.worstPredicted, 'latency ' + latency).toBeLessThan(1);
    }
  });

  it('stays close on a link that is not steady, with wire rounding too', () => {
    // Packets arrive up to two ticks late, and positions are rounded to a tenth
    // on the wire. The prediction is rebuilt from the server's word every time,
    // so these cost a few units, not a growing drift.
    const result = simulate({ latency: 4, jitter: 2, script: walkAbout, ticks: 400 });
    expect(result.worstPredicted).toBeLessThan(10);
    expect(result.meanPredicted).toBeLessThan(3);
    // And still a large improvement on drawing what the server last said.
    expect(result.worstPredicted).toBeLessThan(result.worstNaive / 3);
  });
});

describe('when the server overrules the prediction', () => {
  function body(over: Partial<BrawlerEntity> = {}): BrawlerEntity {
    const engine = new BrawlEngine();
    engine.initMatch(
      [0, 1, 2, 3].map(i => ({
        id: 'p' + i,
        name: 'P' + i,
        brawler: 'mira' as const,
        team: i,
        isHost: i === 0,
        score: 0,
        trophies: 0,
      })),
      'showdown',
      1
    );
    return Object.assign(engine.brawlers[0], over);
  }

  it('shows nothing of its own while the body is stunned, airborne or dead', () => {
    for (const over of [{ stunTimer: 0.4 }, { isJumping: true }, { isAlive: false }]) {
      const p = new Predictor();
      p.onLocalInput(1, 1, 0, 0);
      p.reconcile(body(over), [], [], true);
      expect(p.position(), JSON.stringify(over)).toBeNull();
    }
  });

  it('shows nothing during the countdown, when nobody moves', () => {
    const p = new Predictor();
    p.onLocalInput(1, 1, 0, 0);
    p.onLocalInput(2, 1, 0, 16);
    p.reconcile(body(), [], [], false);
    expect(p.position()).toBeNull();
  });

  it('eases a small correction in rather than jumping', () => {
    const p = new Predictor();
    const me = body({ x: 500, y: 500 });
    p.reconcile(me, [], [], true);
    expect(p.position()).toEqual({ x: 500, y: 500 });

    // The server says we are 20 units further along than we thought.
    p.reconcile({ ...me, x: 520 }, [], [], true);
    const first = p.position()!;
    // Still drawn near where it was, not at the new position.
    expect(first.x).toBeCloseTo(500, 0);

    for (let i = 0; i < 40; i++) p.advance(1 / 60);
    expect(p.position()!.x).toBeCloseTo(520, 0);
  });

  it('snaps when the correction is large, because that is something that happened', () => {
    const p = new Predictor();
    const me = body({ x: 500, y: 500 });
    p.reconcile(me, [], [], true);
    // Knocked across the room.
    p.reconcile({ ...me, x: 900 }, [], [], true);
    expect(p.position()!.x).toBeCloseTo(900, 0);
  });

  it('drops its history when reset, so a new round starts clean', () => {
    const p = new Predictor();
    p.onLocalInput(1, 1, 0, 0);
    p.reconcile(body(), [], [], true);
    p.reset();
    expect(p.isActive).toBe(false);
    expect(p.position()).toBeNull();
  });

  it('does not run away on an input held far longer than any real one', () => {
    // A stalled tab can leave a single input "held" for seconds.
    const p = new Predictor();
    const me = body({ x: 500, y: 500 });
    p.reconcile(me, [], [], true);
    p.onLocalInput(1, 1, 0, 0);
    p.onLocalInput(2, 1, 0, 5000);
    const moved = p.position()!.x - 500;
    // Capped at a tenth of a second of walking, not five.
    expect(moved).toBeLessThan(25);
  });
});
