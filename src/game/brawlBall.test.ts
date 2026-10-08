import { describe, expect, it, vi } from 'vitest';
import { BrawlEngine } from './brawlEngine';
import { FIXED_DT } from '../core/loop';
import { MODES } from './modes';
import type { BrawlerEntity, BrawlPlayerInput, PlayerInfo } from '../types/brawl';

function roster(count: number): PlayerInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: 'p' + i,
    name: 'P' + i,
    brawler: 'mira' as const,
    team: i,
    isHost: i === 0,
    score: 0,
    trophies: 0,
  }));
}

function idle(over: Partial<BrawlPlayerInput> = {}): BrawlPlayerInput {
  return { moveX: 0, moveY: 0, aimAngle: 0, attack: false, superAttack: false, ...over };
}

/** A ball match past its countdown with an empty pitch, so only the ball matters. */
function start(count = 4): BrawlEngine {
  const engine = new BrawlEngine();
  engine.initMatch(roster(count), 'brawl_ball', 7);
  engine.phase = 'playing';
  engine.matchTimer = 0;
  engine.walls = [];
  engine.bushes = [];
  engine.boxes = [];
  for (const b of engine.brawlers) engine.setPlayerInput(b.id, idle());
  return engine;
}

function run(engine: BrawlEngine, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) engine.update(FIXED_DT);
}

function goalOf(engine: BrawlEngine, team: number) {
  const g = engine.goals.find(x => x.team === team);
  if (!g) throw new Error('no goal for team ' + team);
  return { cx: g.x + g.w / 2, cy: g.y + g.h / 2, g };
}

function moveAway(engine: BrawlEngine, except: BrawlerEntity[]): void {
  // Park everyone else in a far corner so they cannot touch the ball.
  for (const b of engine.brawlers) {
    if (except.includes(b)) continue;
    b.x = b.prevX = 90;
    b.y = b.prevY = 90;
  }
}

describe('the ball and the goals', () => {
  it('sets up a ball in the middle and a goal for each team', () => {
    const engine = start();
    expect(engine.ball).not.toBeNull();
    expect(engine.goals.map(g => g.team).sort()).toEqual([0, 1]);
    const [a, b] = [goalOf(engine, 0), goalOf(engine, 1)];
    expect(a.g.w).toBe(b.g.w);
    expect(a.g.h).toBe(b.g.h);
    expect(engine.ball!.carrier).toBeNull();
  });

  it('exists in no other mode', () => {
    const engine = new BrawlEngine();
    engine.initMatch(roster(4), 'wipeout', 7);
    expect(engine.ball).toBeNull();
    expect(engine.goals).toEqual([]);
    expect(MODES.wipeout.usesBall).toBeUndefined();
  });
});

describe('carrying and kicking', () => {
  it('is picked up by a brawler who touches it', () => {
    const engine = start();
    const p = engine.brawlers[0];
    moveAway(engine, [p]);
    p.x = engine.ball!.x - 20;
    p.y = engine.ball!.y;
    run(engine, 0.1);
    expect(engine.ball!.carrier).toBe(p.id);
  });

  it('follows its carrier', () => {
    const engine = start();
    const p = engine.brawlers[0];
    moveAway(engine, [p]);
    p.x = engine.ball!.x - 20;
    p.y = engine.ball!.y;
    run(engine, 0.1);
    p.x += 200;
    p.y += 50;
    run(engine, 0.05);
    expect(Math.hypot(engine.ball!.x - p.x, engine.ball!.y - p.y)).toBeLessThan(60);
  });

  it('turns an attack into a kick that sends the ball away along the aim', () => {
    const engine = start();
    const p = engine.brawlers[0];
    moveAway(engine, [p]);
    p.x = engine.ball!.x - 20;
    p.y = engine.ball!.y;
    run(engine, 0.1);
    const ammo = p.ammo;

    engine.setPlayerInput(p.id, idle({ attack: true, aimAngle: 0 }));
    run(engine, 0.05);
    engine.setPlayerInput(p.id, idle());

    expect(engine.ball!.carrier).toBeNull();
    expect(engine.ball!.vx).toBeGreaterThan(300);
    expect(Math.abs(engine.ball!.vy)).toBeLessThan(5);
    expect(p.ammo, 'a kick costs no ammo').toBe(ammo);
    expect(engine.projectiles.length, 'and fires no shot').toBe(0);
  });

  it('slows to a stop by itself', () => {
    const engine = start();
    moveAway(engine, []);
    engine.ball!.vx = 800;
    run(engine, 8);
    expect(Math.hypot(engine.ball!.vx, engine.ball!.vy)).toBeLessThan(1);
  });

  it('bounces off a wall instead of passing through it', () => {
    const engine = start();
    moveAway(engine, []);
    const ball = engine.ball!;
    engine.walls = [{ id: 'w', x: ball.x + 120, y: ball.y - 200, w: 40, h: 400, isDestructible: false } as never];
    (engine as unknown as { wallGridDirty: boolean }).wallGridDirty = true;
    ball.vx = 700;
    run(engine, 0.5);
    expect(ball.x).toBeLessThan(engine.walls[0].x);
    expect(ball.vx).toBeLessThan(0);
  });

  it('is dropped when the carrier goes down, and cannot be snatched straight back', () => {
    const engine = start();
    const p = engine.brawlers[0];
    moveAway(engine, [p]);
    p.x = engine.ball!.x - 20;
    p.y = engine.ball!.y;
    run(engine, 0.1);
    expect(engine.ball!.carrier).toBe(p.id);

    p.stunTimer = 0.3;
    run(engine, 0.02);
    expect(engine.ball!.carrier).toBeNull();
  });

  it('is not picked up by a body that is not alive', () => {
    const engine = start();
    const p = engine.brawlers[0];
    moveAway(engine, [p]);
    p.isAlive = false;
    p.x = engine.ball!.x;
    p.y = engine.ball!.y;
    run(engine, 0.2);
    expect(engine.ball!.carrier).toBeNull();
  });
});

describe('scoring', () => {
  /** Puts the ball dead centre in a goal, rolling in. */
  function scoreInto(engine: BrawlEngine, defendingTeam: number): void {
    const { cx, cy } = goalOf(engine, defendingTeam);
    moveAway(engine, []);
    engine.ball!.x = cx;
    engine.ball!.y = cy;
    run(engine, 0.05);
  }

  it('gives the point to the side that did not defend the goal', () => {
    const engine = start();
    scoreInto(engine, 1);
    expect(engine.teamScores).toEqual([1, 0]);
  });

  it('counts the ball in your own goal for the other side', () => {
    const engine = start();
    scoreInto(engine, 0);
    expect(engine.teamScores).toEqual([0, 1]);
  });

  it('celebrates, then puts everyone and the ball back', () => {
    const engine = start();
    const spawn = { x: engine.ball!.x, y: engine.ball!.y };
    scoreInto(engine, 1);
    expect(engine.getSnapshot().goalTeam).toBe(0);

    run(engine, 2.5);
    expect(engine.phase).toBe('starting');
    expect(engine.ball!.x).toBeCloseTo(spawn.x, 0);
    expect(engine.ball!.y).toBeCloseTo(spawn.y, 0);
    for (const b of engine.brawlers) {
      expect(b.x).toBeCloseTo(b.spawnX, 0);
      expect(b.y).toBeCloseTo(b.spawnY, 0);
    }
    expect(engine.getSnapshot().goalTeam).toBeNull();
  });

  it('wins the match on the second goal', () => {
    const engine = start();
    scoreInto(engine, 1);
    run(engine, 2.5);
    engine.phase = 'playing';
    scoreInto(engine, 1);
    run(engine, 2.5);
    expect(engine.phase).toBe('match_end');
    expect(engine.winnerTeam).toBe(0);
  });

  it('does not run the clock down while the restart countdown plays', () => {
    const engine = start();
    scoreInto(engine, 1);
    run(engine, 2.5);
    const before = engine.getSnapshot().timeLeft;
    run(engine, 1);
    expect(engine.getSnapshot().timeLeft).toBe(before);
    expect(before).not.toBeNull();
    expect(before!).toBeGreaterThan(100);
  });
});

describe('the clock', () => {
  it('goes to the side that is ahead when time runs out', () => {
    const engine = start();
    engine.teamScores = [1, 0];
    engine.matchTimer = MODES.brawl_ball.timeLimit! + 0.1;
    run(engine, 0.05);
    expect(engine.phase).toBe('match_end');
    expect(engine.winnerTeam).toBe(0);
  });

  it('goes to sudden death when level, and the next goal wins', () => {
    const engine = start();
    engine.teamScores = [1, 1];
    engine.matchTimer = MODES.brawl_ball.timeLimit! + 0.1;
    run(engine, 0.05);
    expect(engine.phase).toBe('playing');
    expect(engine.getSnapshot().timeLeft).toBe(0);

    const { cx, cy } = goalOf(engine, 0);
    moveAway(engine, []);
    engine.ball!.x = cx;
    engine.ball!.y = cy;
    run(engine, 2.6);
    expect(engine.phase).toBe('match_end');
    expect(engine.winnerTeam).toBe(1);
  });

  it('is a draw if nobody scores through the whole overtime', () => {
    const engine = start();
    engine.teamScores = [1, 1];
    engine.matchTimer = MODES.brawl_ball.timeLimit! + 61;
    run(engine, 0.05);
    expect(engine.phase).toBe('match_end');
    expect(engine.winnerTeam).toBeNull();
  });
});

describe('bots', () => {
  it('score without anybody touching the controls', () => {
    // One match can go goalless if the carriers keep getting shot; across a
    // handful of maps and seeds, bots that never score are broken.
    // Bots decide with Math.random; pin it so this cannot flake.
    let state = 12345;
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    });
    let goals = 0;
    for (const seed of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const engine = new BrawlEngine();
      const players = roster(4).map(p => ({ ...p, isBot: true }));
      engine.initMatch(players, 'brawl_ball', seed);
      engine.phase = 'playing';
      engine.matchTimer = 0;
      for (let i = 0; i < 60 * 130 && (engine.phase as string) !== 'match_end'; i++) {
        engine.update(FIXED_DT);
        if ((engine.phase as string) === 'starting') engine.matchTimer = 3; // skip countdowns
      }
      goals += engine.teamScores[0] + engine.teamScores[1];
    }
    random.mockRestore();
    expect(goals, 'goals scored by bots across eight matches').toBeGreaterThan(0);
  });
});

describe('getting out of the base', () => {
  // A bot that cannot find its way off the spawn is worse than no bot. This
  // caught a crate wall across a goal mouth, and cover-ignoring characters
  // walking straight into it instead of around.
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])('every bot leaves its spawn, on seed %i', seed => {
    const engine = new BrawlEngine();
    const players = roster(8).map(p => ({ ...p, isBot: true }));
    const kits = ['molotof', 'fuse', 'boulder', 'mira', 'wisp', 'rivet', 'thorn', 'zirh'] as const;
    players.forEach((p, i) => (p.brawler = kits[i]));
    engine.initMatch(players, 'brawl_ball', seed);
    engine.phase = 'playing';
    engine.matchTimer = 0;

    const furthest = new Map<string, number>();
    for (let i = 0; i < 60 * 12; i++) {
      engine.update(FIXED_DT);
      if ((engine.phase as string) === 'starting') engine.matchTimer = 3;
      for (const b of engine.brawlers) {
        if (b.isClone) continue;
        const d = Math.hypot(b.x - b.spawnX, b.y - b.spawnY);
        furthest.set(b.id, Math.max(furthest.get(b.id) ?? 0, d));
      }
    }
    for (const [id, d] of furthest) {
      expect(d, id + ' on ' + engine.mapName).toBeGreaterThan(300);
    }
  });
});

describe('as in the original rules', () => {
  it('lets nobody use a Super or a gadget while holding the ball', () => {
    const engine = start();
    const p = engine.brawlers[0];
    moveAway(engine, [p]);
    p.x = engine.ball!.x - 20;
    p.y = engine.ball!.y;
    run(engine, 0.1);
    expect(engine.ball!.carrier).toBe(p.id);
    p.superCharge = 100;
    const cooldown = p.gadgetCooldown;
    engine.setPlayerInput(p.id, idle({ superAttack: true, gadget: true }));
    run(engine, 0.1);
    expect(p.superCharge).toBe(100);
    expect(p.gadgetCooldown).toBeGreaterThanOrEqual(cooldown);
  });

  it('clears the field when a tied game goes to sudden death', () => {
    const engine = new BrawlEngine();
    engine.initMatch(roster(4), 'brawl_ball', 7);
    engine.phase = 'playing';
    engine.matchTimer = 0;
    engine.teamScores = [1, 1];
    for (const b of engine.brawlers) engine.setPlayerInput(b.id, idle());
    expect(engine.walls.length).toBeGreaterThan(0);
    engine.matchTimer = MODES.brawl_ball.timeLimit! + 0.1;
    run(engine, 0.05);
    expect(engine.walls).toHaveLength(0);
    expect(engine.bushes).toHaveLength(0);
  });
});
