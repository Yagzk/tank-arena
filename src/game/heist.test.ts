import { describe, expect, it, vi } from 'vitest';
import { BrawlEngine } from './brawlEngine';
import { FIXED_DT } from '../core/loop';
import { MODES, SAFE_HP, decideHeist } from './modes';
import type { BrawlPlayerInput, PlayerInfo } from '../types/brawl';

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

function start(count = 4): BrawlEngine {
  const engine = new BrawlEngine();
  engine.initMatch(roster(count), 'heist', 5);
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

/** Stands `who` 300 units from a safe, on open ground, and fires straight at it. */
function fireAt(engine: BrawlEngine, whoIndex: number, safeTeam: number, seconds = 0.4): void {
  const safe = engine.safes.find(s => s.team === safeTeam)!;
  const who = engine.brawlers[whoIndex];
  const cx = safe.x + safe.w / 2;
  const cy = safe.y + safe.h / 2;
  const side = cx < 1200 ? 1 : -1;
  for (const b of engine.brawlers) {
    if (b !== who) {
      b.x = b.prevX = 1200;
      b.y = b.prevY = 100;
    }
  }
  who.x = who.prevX = cx + side * 300;
  who.y = who.prevY = cy;
  engine.setPlayerInput(who.id, idle({ attack: true, aimAngle: side === 1 ? Math.PI : 0 }));
  run(engine, seconds);
  engine.setPlayerInput(who.id, idle());
}

describe('the safes', () => {
  it('are one for each side, the same size, at full health', () => {
    const engine = start();
    expect(engine.safes.map(s => s.team).sort()).toEqual([0, 1]);
    const [a, b] = engine.safes;
    expect([a.w, a.h]).toEqual([b.w, b.h]);
    expect(a.hp).toBe(SAFE_HP);
    expect(b.hp).toBe(SAFE_HP);
  });

  it('exist in no other mode', () => {
    const engine = new BrawlEngine();
    engine.initMatch(roster(4), 'gem_grab', 5);
    expect(engine.safes).toEqual([]);
  });

  it('take damage from the other side', () => {
    const engine = start();
    fireAt(engine, 0, 1);
    expect(engine.safes.find(s => s.team === 1)!.hp).toBeLessThan(SAFE_HP);
    expect(engine.safes.find(s => s.team === 0)!.hp).toBe(SAFE_HP);
  });

  it('are not hurt by their own side', () => {
    const engine = start();
    fireAt(engine, 0, 0);
    expect(engine.safes.find(s => s.team === 0)!.hp).toBe(SAFE_HP);
  });

  it('charge the Super of whoever is hitting them', () => {
    const engine = start();
    fireAt(engine, 0, 1);
    expect(engine.brawlers[0].superCharge).toBeGreaterThan(0);
  });

  it('are solid, so nobody walks through one', () => {
    const engine = start();
    const safe = engine.safes[0];
    const p = engine.brawlers[0];
    for (const b of engine.brawlers) if (b !== p) b.x = b.prevX = 1200;
    p.x = p.prevX = safe.x + safe.w + 60;
    p.y = p.prevY = safe.y + safe.h / 2;
    engine.setPlayerInput(p.id, idle({ moveX: safe.team === 0 ? -1 : 1 }));
    run(engine, 1.5);
    const reachedInside = p.x > safe.x && p.x < safe.x + safe.w;
    expect(reachedInside).toBe(false);
  });
});

describe('who wins', () => {
  it('is whoever breaks the other safe', () => {
    const engine = start();
    engine.safes.find(s => s.team === 1)!.hp = 1;
    fireAt(engine, 0, 1);
    run(engine, 0.1);
    expect(engine.phase).toBe('match_end');
    expect(engine.winnerTeam).toBe(0);
  });

  it('is decided by what is left of each when time runs out', () => {
    const engine = start();
    engine.safes.find(s => s.team === 0)!.hp = SAFE_HP * 0.4;
    engine.matchTimer = MODES.heist.timeLimit! + 0.1;
    run(engine, 0.05);
    expect(engine.phase).toBe('match_end');
    expect(engine.winnerTeam).toBe(1);
  });

  it('decideHeist: broken beats everything, level is a draw, both broken is a draw', () => {
    expect(decideHeist([1, 0], false)).toEqual({ winner: 0, draw: false });
    expect(decideHeist([0, 0.2], true)).toEqual({ winner: 1, draw: false });
    expect(decideHeist([0.5, 0.5], true)).toEqual({ winner: null, draw: true });
    expect(decideHeist([0, 0], false)).toEqual({ winner: null, draw: true });
    expect(decideHeist([0.9, 0.3], false)).toEqual({ winner: null, draw: false });
    expect(decideHeist([0.9, 0.3], true)).toEqual({ winner: 0, draw: false });
  });
});

describe('bots', () => {
  it('go for the safe', () => {
    let state = 777;
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    });
    let damage = 0;
    for (const seed of [1, 2, 3]) {
      const engine = new BrawlEngine();
      engine.initMatch(roster(6).map(p => ({ ...p, isBot: true })), 'heist', seed);
      engine.phase = 'playing';
      for (let i = 0; i < 60 * 60 && (engine.phase as string) !== 'match_end'; i++) engine.update(FIXED_DT);
      damage += engine.safes.reduce((n, s) => n + (s.maxHp - s.hp), 0);
    }
    random.mockRestore();
    expect(damage).toBeGreaterThan(0);
  });
});
