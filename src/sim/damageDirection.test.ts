import { describe, expect, it } from 'vitest';
import { BrawlEngine } from '../game/brawlEngine';
import { FIXED_DT } from '../core/loop';
import { NO_DAMAGE_DIRECTION } from './entity';
import type { BrawlPlayerInput, BrawlerEntity, BrawlerId, PlayerInfo } from '../types/brawl';

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

function idle(over: Partial<BrawlPlayerInput> = {}): BrawlPlayerInput {
  return { moveX: 0, moveY: 0, aimAngle: 0, attack: false, superAttack: false, ...over };
}

function arena(roster: PlayerInfo[], mode: 'showdown' | 'gem_grab' = 'showdown'): BrawlEngine {
  const engine = new BrawlEngine();
  engine.initMatch(roster, mode, 3);
  engine.phase = 'playing';
  engine.walls = [];
  engine.boxes = [];
  engine.bushes = [];
  engine.poisonGas.isActive = false;
  for (const b of engine.brawlers) engine.setPlayerInput(b.id, idle());
  return engine;
}

function place(b: BrawlerEntity, x: number, y: number): void {
  b.x = x;
  b.y = y;
  b.prevX = x;
  b.prevY = y;
}

function run(engine: BrawlEngine, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) engine.update(FIXED_DT);
}

describe('where the last hit came from', () => {
  it('starts with no direction at all', () => {
    const engine = arena(players('mira', 'rivet'));
    expect(engine.brawlers[0].lastDamageAngle).toBe(NO_DAMAGE_DIRECTION);
  });

  it('points at the attacker', () => {
    const engine = arena(players('rivet', 'boulder', 'mira'));
    const [shooter, victim] = engine.brawlers;
    place(shooter, 600, 300);
    place(victim, 600, 600);
    place(engine.brawlers[2], 2000, 1500);

    // The shooter is directly north of the victim, and screen y grows downward,
    // so "toward the attacker" is straight up: -90 degrees.
    engine.setPlayerInput('p0', idle({ attack: true, aimAngle: Math.PI / 2 }));
    run(engine, 0.6);

    expect(victim.hp).toBeLessThan(victim.maxHp);
    expect(victim.lastDamageAngle).toBeCloseTo(-Math.PI / 2, 1);
  });

  it('is not a direction when the damage was the gas', () => {
    // Fire and gas have no source. Reusing the last attacker's bearing would
    // point the marker at somebody who was not even involved.
    const engine = arena(players('rivet', 'boulder', 'mira'));
    const [shooter, victim] = engine.brawlers;
    place(shooter, 600, 300);
    place(victim, 600, 600);
    place(engine.brawlers[2], 2000, 1500);
    engine.setPlayerInput('p0', idle({ attack: true, aimAngle: Math.PI / 2 }));
    run(engine, 0.6);
    expect(Math.abs(victim.lastDamageAngle)).toBeLessThan(10);

    engine.setPlayerInput('p0', idle());
    // Bullets still in the air would land mid-burn and, being later in the
    // tick, win: the last thing to hurt you is what the marker should show.
    engine.projectiles = [];
    victim.burnTimer = 1;
    victim.burnDamagePerSec = 400;
    run(engine, 0.5);

    expect(victim.lastDamageAngle).toBe(NO_DAMAGE_DIRECTION);
  });

  it('is cleared when the brawler comes back', () => {
    // Respawning resets the damage timer, which would otherwise light the
    // marker for a second pointing at whoever killed the last life.
    const engine = arena(players('boulder', 'mira', 'rivet', 'fuse'), 'gem_grab');
    const victim = engine.brawlers[0];
    victim.lastDamageAngle = 1.2;
    victim.hp = 1;
    victim.burnTimer = 1;
    victim.burnDamagePerSec = 5000;
    engine.update(FIXED_DT);
    expect(victim.isAlive).toBe(false);

    run(engine, 3.2);
    expect(victim.isAlive).toBe(true);
    expect(victim.lastDamageAngle).toBe(NO_DAMAGE_DIRECTION);
  });
});
