import { describe, expect, it } from 'vitest';
import { BrawlEngine } from '../game/brawlEngine';
import { FIXED_DT } from '../core/loop';
import {
  type BrawlGameMode,
  type BrawlPlayerInput,
  type BrawlerEntity,
  type BrawlerId,
  type PlayerInfo,
} from '../types/brawl';

function players(...ids: BrawlerId[]): PlayerInfo[] {
  return ids.map((brawler, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    brawler,
    team: i,
    isHost: i === 0,
    score: 0,
    trophies: 0,
  }));
}

function idle(overrides: Partial<BrawlPlayerInput> = {}): BrawlPlayerInput {
  return { moveX: 0, moveY: 0, aimAngle: 0, attack: false, superAttack: false, ...overrides };
}

function arena(mode: BrawlGameMode, roster: PlayerInfo[]): BrawlEngine {
  const engine = new BrawlEngine();
  engine.initMatch(roster, mode, 99);
  engine.phase = 'playing';
  engine.walls = [];
  engine.boxes = [];
  engine.bushes = [];
  engine.poisonGas.isActive = false;
  for (const b of engine.brawlers) engine.setPlayerInput(b.id, idle());
  return engine;
}

function run(engine: BrawlEngine, seconds: number): void {
  const ticks = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < ticks; i++) engine.update(FIXED_DT);
}

/** Takes a brawler out without caring how. */
function finish(engine: BrawlEngine, victim: BrawlerEntity): void {
  victim.hp = 1;
  victim.shieldHp = 0;
  victim.immunityTimer = 0;
  // Burning ground is the simplest killer that goes through the real damage
  // funnel, so the death path under test is the one a match actually uses.
  victim.burnTimer = 1;
  victim.burnDamagePerSec = 5000;
  engine.update(FIXED_DT);
}

describe('respawn in a team mode', () => {
  it('schedules a return instead of removing the player for good', () => {
    // `isAlive = false` used to be a one-way door: nothing anywhere set it
    // back. A Gem Grab player who died was out for the rest of the match,
    // which is why the mode could not actually be played.
    const engine = arena('gem_grab', players('boulder', 'mira', 'rivet', 'fuse'));
    const victim = engine.brawlers[0];

    finish(engine, victim);

    expect(victim.isAlive).toBe(false);
    expect(victim.respawnTimer).toBeGreaterThan(0);
    expect(victim.deaths).toBe(1);
  });

  it('brings the brawler back after the delay, at full health', () => {
    const engine = arena('gem_grab', players('boulder', 'mira', 'rivet', 'fuse'));
    const victim = engine.brawlers[0];
    finish(engine, victim);

    run(engine, 2.5);
    expect(victim.isAlive).toBe(false);

    run(engine, 1.0);
    expect(victim.isAlive).toBe(true);
    expect(victim.hp).toBe(victim.maxHp);
    expect(victim.ammo).toBe(victim.maxAmmo);
  });

  it('returns the brawler to its own base, not where it fell', () => {
    const engine = arena('gem_grab', players('boulder', 'mira', 'rivet', 'fuse'));
    const victim = engine.brawlers[0];
    const base = { x: victim.spawnX, y: victim.spawnY };

    victim.x = base.x + 600;
    victim.y = base.y + 300;
    finish(engine, victim);
    run(engine, 3.2);

    expect(victim.isAlive).toBe(true);
    expect(victim.x).toBeCloseTo(base.x, 5);
    expect(victim.y).toBeCloseTo(base.y, 5);
  });

  it('protects the brawler briefly so the spawn cannot be farmed', () => {
    const engine = arena('gem_grab', players('boulder', 'mira', 'rivet', 'fuse'));
    const victim = engine.brawlers[0];
    finish(engine, victim);
    run(engine, 3.1);

    expect(victim.immunityTimer).toBeGreaterThan(0);

    const camper = engine.brawlers[1];
    camper.x = victim.x + 40;
    camper.y = victim.y;
    const before = victim.hp;
    engine.setPlayerInput(camper.id, idle({ attack: true, aimAngle: Math.PI }));
    run(engine, 0.3);

    expect(victim.hp).toBe(before);
  });

  it('lets the protection expire rather than leaving it on', () => {
    const engine = arena('gem_grab', players('boulder', 'mira', 'rivet', 'fuse'));
    const victim = engine.brawlers[0];
    finish(engine, victim);
    run(engine, 5.0);

    expect(victim.immunityTimer).toBeLessThanOrEqual(0);
  });

  it('clears the statuses and momentum of the life that ended', () => {
    const engine = arena('gem_grab', players('boulder', 'mira', 'rivet', 'fuse'));
    const victim = engine.brawlers[0];
    victim.stunTimer = 5;
    victim.slowTimer = 5;
    victim.shieldHp = 0;
    victim.knockbackVx = 900;
    finish(engine, victim);
    run(engine, 3.2);

    expect(victim.stunTimer).toBeLessThanOrEqual(0);
    expect(victim.slowTimer).toBeLessThanOrEqual(0);
    expect(victim.knockbackVx).toBe(0);
    expect(victim.pendingBurst).toBeNull();
  });

  it('keeps part of the Super charged through a death', () => {
    // Losing a fight should not also cost the whole Super you charged during
    // it; keeping all of it would make dying nearly free.
    const engine = arena('gem_grab', players('boulder', 'mira', 'rivet', 'fuse'));
    const victim = engine.brawlers[0];
    victim.superCharge = 100;
    finish(engine, victim);
    run(engine, 3.2);

    expect(victim.superCharge).toBeGreaterThan(0);
    expect(victim.superCharge).toBeLessThan(100);
  });

  it('does not count a respawning death as a final placement', () => {
    const engine = arena('gem_grab', players('boulder', 'mira', 'rivet', 'fuse'));
    finish(engine, engine.brawlers[0]);
    expect(engine.eliminationOrder).toEqual([]);
  });

  it('still records the kill', () => {
    const engine = arena('gem_grab', players('boulder', 'mira', 'rivet', 'fuse'));
    const [victim, killer] = engine.brawlers;
    victim.hp = 1;
    killer.x = victim.x + 40;
    killer.y = victim.y;
    engine.setPlayerInput(killer.id, idle({ attack: true, aimAngle: Math.PI }));
    run(engine, 0.4);

    expect(victim.isAlive).toBe(false);
    expect(killer.kills).toBe(1);
    expect(engine.killFeed.length).toBe(1);
  });

  it('does not end the match while a team still has someone coming back', () => {
    const engine = arena('gem_grab', players('boulder', 'mira', 'rivet', 'fuse'));
    finish(engine, engine.brawlers[0]);
    finish(engine, engine.brawlers[2]);
    run(engine, 1.0);

    expect(engine.phase).toBe('playing');
  });
});

describe('elimination in Showdown', () => {
  it('makes death final', () => {
    const engine = arena('showdown', players('boulder', 'mira', 'rivet', 'fuse'));
    const victim = engine.brawlers[0];
    finish(engine, victim);

    expect(victim.isAlive).toBe(false);
    expect(victim.respawnTimer).toBe(0);

    run(engine, 6.0);
    expect(victim.isAlive).toBe(false);
  });

  it('records the order players went out, for placement', () => {
    const engine = arena('showdown', players('boulder', 'mira', 'rivet', 'fuse'));
    finish(engine, engine.brawlers[2]);
    finish(engine, engine.brawlers[0]);

    expect(engine.eliminationOrder).toEqual(['p2', 'p0']);
  });

  it('ends the match when one player is left', () => {
    const engine = arena('showdown', players('boulder', 'mira', 'rivet'));
    finish(engine, engine.brawlers[0]);
    finish(engine, engine.brawlers[1]);
    engine.update(FIXED_DT);

    expect(engine.phase).toBe('match_end');
    expect(engine.winnerPlayerId).toBe('p2');
  });
});
