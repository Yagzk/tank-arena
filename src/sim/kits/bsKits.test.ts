import { describe, expect, it } from 'vitest';
import { BrawlEngine } from '../../game/brawlEngine';
import { FIXED_DT } from '../../core/loop';
import type { BrawlPlayerInput, BrawlerEntity, BrawlerId, PlayerInfo } from '../../types/brawl';

/**
 * The characters that were written from the original game's numbers: what each
 * attack, Super, gadget and star power actually does when run.
 */

interface Loadout {
  gadget?: number;
  starPower?: number;
}

function roster(list: Array<[BrawlerId, Loadout?]>): PlayerInfo[] {
  return list.map(([brawler, l], i) => ({
    id: 'p' + i,
    name: 'P' + i,
    brawler,
    team: i,
    isHost: i === 0,
    score: 0,
    trophies: 0,
    gadget: l?.gadget ?? 0,
    starPower: l?.starPower ?? 0,
  }));
}

function idle(over: Partial<BrawlPlayerInput> = {}): BrawlPlayerInput {
  return { moveX: 0, moveY: 0, aimAngle: 0, attack: false, superAttack: false, ...over };
}

function arena(list: Array<[BrawlerId, Loadout?]>): BrawlEngine {
  const engine = new BrawlEngine();
  engine.initMatch(roster(list), 'showdown', 3);
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

function press(engine: BrawlEngine, who: BrawlerEntity, over: Partial<BrawlPlayerInput>, seconds = 0.05): void {
  engine.setPlayerInput(who.id, idle(over));
  run(engine, seconds);
  engine.setPlayerInput(who.id, idle());
}

/** Two brawlers 150 px apart on open ground, the second a stout target that does nothing. */
function pair(a: [BrawlerId, Loadout?], gap = 150): { engine: BrawlEngine; me: BrawlerEntity; foe: BrawlerEntity } {
  const engine = arena([a, ['boulder']]);
  const [me, foe] = engine.brawlers;
  place(me, 800, 900);
  place(foe, 800 + gap, 900);
  return { engine, me, foe };
}

describe('MIRA (the close-range shotgunner)', () => {
  it('fires five pellets for 600 each in a 27 degree fan', () => {
    const { engine, me } = pair(['mira'], 600);
    press(engine, me, { attack: true });
    const shots = engine.projectiles.filter(p => p.ownerId === me.id);
    expect(shots).toHaveLength(5);
    expect(shots.every(p => p.damage === 600)).toBe(true);
    const heads = shots.map(p => Math.atan2(p.vy, p.vx));
    expect((Math.max(...heads) - Math.min(...heads)) * (180 / Math.PI)).toBeCloseTo(27, 0);
  });

  it('hurts much more at point blank than at range', () => {
    const near = pair(['mira'], 90);
    press(near.engine, near.me, { attack: true });
    run(near.engine, 0.5);
    const far = pair(['mira'], 420);
    press(far.engine, far.me, { attack: true });
    run(far.engine, 0.8);
    const nearHit = near.foe.maxHp - near.foe.hp;
    const farHit = far.foe.maxHp - far.foe.hp;
    expect(nearHit).toBeGreaterThanOrEqual(2400);
    expect(farHit).toBeLessThan(nearHit);
  });

  it('has a Super of nine piercing pellets that breaks cover', () => {
    const { engine, me } = pair(['mira'], 700);
    me.superCharge = 100;
    press(engine, me, { superAttack: true });
    const shots = engine.projectiles.filter(p => p.ownerId === me.id);
    expect(shots).toHaveLength(9);
    expect(shots.every(p => p.piercesBodies && p.breaksWalls && p.damage === 640)).toBe(true);
  });

  it('Fast Forward dashes about 2.7 tiles, takes no damage on the way, and refills the clip', () => {
    const { engine, me, foe } = pair(['mira', { gadget: 0 }], 900);
    me.ammo = 0;
    press(engine, me, { gadget: true, aimAngle: 0 });
    expect(me.ammo).toBe(3);
    expect(me.immunityTimer).toBeGreaterThan(0);
    run(engine, 0.8);
    expect(me.x - 800).toBeGreaterThan(130);
    expect(me.x - 800).toBeLessThan(200);
    expect(foe.hp).toBe(foe.maxHp);
  });

  it('Fast Forward waits sixteen seconds', () => {
    const { engine, me } = pair(['mira', { gadget: 0 }], 900);
    press(engine, me, { gadget: true });
    expect(me.gadgetCooldown).toBeGreaterThan(15);
    expect(me.gadgetCooldown).toBeLessThanOrEqual(16);
  });

  it('Clay Pigeons narrows and lengthens exactly three shots, then goes back', () => {
    const { engine, me } = pair(['mira', { gadget: 1 }], 900);
    press(engine, me, { gadget: true });
    const widths: number[] = [];
    for (let i = 0; i < 4; i++) {
      engine.projectiles = [];
      me.attackCooldown = 0;
      me.ammo = 3;
      press(engine, me, { attack: true });
      const heads = engine.projectiles.filter(p => p.ownerId === me.id).map(p => Math.atan2(p.vy, p.vx));
      widths.push((Math.max(...heads) - Math.min(...heads)) * (180 / Math.PI));
    }
    expect(widths[0]).toBeCloseTo(13.5, 0);
    expect(widths[1]).toBeCloseTo(13.5, 0);
    expect(widths[2]).toBeCloseTo(13.5, 0);
    expect(widths[3]).toBeCloseTo(27, 0);
  });

  it('Clay Pigeons starts its cooldown only after the third shot', () => {
    const { engine, me } = pair(['mira', { gadget: 1 }], 900);
    press(engine, me, { gadget: true });
    expect(me.gadgetCooldown).toBeGreaterThan(1000);
    for (let i = 0; i < 3; i++) {
      me.attackCooldown = 0;
      press(engine, me, { attack: true });
    }
    expect(me.gadgetCooldown).toBeGreaterThan(17);
    expect(me.gadgetCooldown).toBeLessThanOrEqual(18);
  });

  it('Band-Aid heals thirty percent once health falls under forty', () => {
    const { engine, me } = pair(['mira', { starPower: 1 }], 900);
    me.hp = me.maxHp * 0.3;
    run(engine, 0.1);
    expect(me.hp).toBeGreaterThan(me.maxHp * 0.55);
  });

  it('Shell Shock slows what the Super hits by 55 percent for two seconds', () => {
    const { engine, me, foe } = pair(['mira', { starPower: 0 }], 200);
    me.superCharge = 100;
    press(engine, me, { superAttack: true });
    run(engine, 0.5);
    expect(foe.slowTimer).toBeGreaterThan(1);
    expect(foe.slowAmount).toBeCloseTo(0.55, 2);
  });
});

describe('RIVET (the gunslinger)', () => {
  it('unloads six 720 bullets over about eight tenths of a second', () => {
    const { engine, me } = pair(['rivet'], 900);
    press(engine, me, { attack: true });
    let launched = engine.projectiles.filter(p => p.ownerId === me.id).length;
    const seen = new Set(engine.projectiles.map(p => p.id));
    for (let i = 0; i < 60; i++) {
      engine.update(FIXED_DT);
      for (const p of engine.projectiles) {
        if (p.ownerId === me.id && !seen.has(p.id)) {
          seen.add(p.id);
          launched++;
        }
      }
    }
    expect(launched).toBe(6);
    expect(engine.projectiles.every(p => p.damage === 720)).toBe(true);
  });

  it('has a Super of twelve piercing bullets that a stun cuts short', () => {
    const { engine, me } = pair(['rivet'], 900);
    me.superCharge = 100;
    press(engine, me, { superAttack: true });
    run(engine, 0.4);
    expect(me.pendingBurst?.channel).toBe(true);
    me.stunTimer = 0.5;
    run(engine, 0.1);
    expect(me.pendingBurst).toBeNull();
  });

  it('does not reload while the Super is going out', () => {
    const { engine, me } = pair(['rivet'], 900);
    me.superCharge = 100;
    me.ammo = 0;
    me.reloadTimer = 0;
    press(engine, me, { superAttack: true });
    run(engine, 1.0);
    expect(me.ammo).toBe(0);
  });

  it('Silver Bullet is one piercing 1200 shot that goes through walls, and the cooldown waits for it', () => {
    const { engine, me } = pair(['rivet', { gadget: 1 }], 900);
    press(engine, me, { gadget: true });
    expect(me.gadgetCooldown).toBeGreaterThan(1000);
    me.attackCooldown = 0;
    press(engine, me, { attack: true });
    const shot = engine.projectiles.find(p => p.ownerId === me.id)!;
    expect(shot.damage).toBe(1200);
    expect(shot.piercesBodies && shot.piercesWalls).toBe(true);
    expect(me.gadgetCooldown).toBeLessThanOrEqual(17);
  });

  it('Speedloader fires two slowing bullets without using ammo', () => {
    const { engine, me, foe } = pair(['rivet', { gadget: 0 }], 300);
    const ammo = me.ammo;
    press(engine, me, { gadget: true });
    run(engine, 0.6);
    expect(me.ammo).toBe(ammo);
    expect(foe.maxHp - foe.hp).toBe(1280);
    expect(foe.slowTimer).toBeGreaterThan(0);
  });

  it('Slick Boots is thirteen percent faster', () => {
    const base = pair(['rivet', { starPower: 1 }], 900);
    const fast = pair(['rivet', { starPower: 0 }], 900);
    for (const t of [base, fast]) press(t.engine, t.me, { moveX: 1 }, 2);
    expect(fast.me.x - 800).toBeGreaterThan((base.me.x - 800) * 1.08);
  });
});

describe('BOULDER (the brawler)', () => {
  it('throws four 760 punches that go through bodies', () => {
    const { engine, me } = pair(['boulder'], 900);
    press(engine, me, { attack: true });
    run(engine, 0.9);
    const seen = engine.projectiles.filter(p => p.ownerId === me.id);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(p => p.damage === 760 && p.piercesBodies)).toBe(true);
  });

  it('charges the Super from damage taken: 2.4 bars of health fill it', () => {
    const { engine, me, foe } = pair(['boulder'], 900);
    void foe;
    const dealt = me.maxHp * 0.24;
    (engine as unknown as { damageBrawler(b: BrawlerEntity, d: number, k: string): void }).damageBrawler(me, dealt, 'p1');
    expect(me.superCharge).toBeCloseTo(10, 0);
  });

  it('Super leaps up to nine tiles, lands for 1920, and throws everyone near it back', () => {
    const { engine, me, foe } = pair(['boulder', { starPower: 1 }], 300);
    me.superCharge = 100;
    // Landing a little short of it, so there is a direction to be thrown in.
    press(engine, me, { superAttack: true, superTargetX: 1050, superTargetY: 900 });
    run(engine, 1.2);
    expect(me.isJumping).toBe(false);
    expect(me.x).toBeGreaterThan(1000);
    expect(foe.maxHp - foe.hp).toBe(1920);
    expect(foe.x - 1050).toBeGreaterThan(60);
  });

  it('El Fuego burns them for 1800 more', () => {
    const { engine, me, foe } = pair(['boulder', { starPower: 0 }], 300);
    me.superCharge = 100;
    press(engine, me, { superAttack: true, superTargetX: 1100, superTargetY: 900 });
    run(engine, 5);
    expect(foe.maxHp - foe.hp).toBeGreaterThan(3200);
  });

  it('Asteroid Belt destroys what is fired at it for a second', () => {
    const engine = arena([['boulder', { gadget: 1 }], ['rivet']]);
    const [me, shooter] = engine.brawlers;
    place(me, 800, 900);
    place(shooter, 1200, 900);
    press(engine, me, { gadget: true });
    shooter.aimAngle = Math.PI;
    press(engine, shooter, { attack: true, aimAngle: Math.PI }, 0.05);
    run(engine, 0.8);
    expect(me.hp).toBe(me.maxHp);
  });

  it('Suplex Supplement drags whoever is in the way over its head and behind it', () => {
    const { engine, me, foe } = pair(['boulder', { gadget: 0 }], 100);
    press(engine, me, { gadget: true, aimAngle: 0 });
    run(engine, 0.3);
    expect(foe.x).toBeLessThan(me.x);
  });
});

describe('FUSE (the rocketeer)', () => {
  it('fires a rocket that does 2320 once to what it hits, and leaves the ground burning', () => {
    const { engine, me, foe } = pair(['fuse'], 300);
    press(engine, me, { attack: true });
    run(engine, 0.7);
    expect(foe.maxHp - foe.hp).toBeGreaterThanOrEqual(2320);
    expect(engine.firePatches.length).toBeGreaterThan(0);
  });

  it('Rocket Rain sends nine rockets', () => {
    const { engine, me } = pair(['fuse', { starPower: 1 }], 900);
    me.superCharge = 100;
    press(engine, me, { superAttack: true, superTargetX: 1100, superTargetY: 900 });
    let total = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 180; i++) {
      engine.update(FIXED_DT);
      for (const p of engine.projectiles) {
        if (p.ownerId === me.id && !seen.has(p.id)) {
          seen.add(p.id);
          total++;
        }
      }
    }
    expect(total).toBe(9);
  });

  it('More Rockets makes it thirteen', () => {
    const { engine, me } = pair(['fuse', { starPower: 0 }], 900);
    me.superCharge = 100;
    press(engine, me, { superAttack: true, superTargetX: 1100, superTargetY: 900 });
    const seen = new Set<string>();
    for (let i = 0; i < 240; i++) {
      engine.update(FIXED_DT);
      for (const p of engine.projectiles) if (p.ownerId === me.id) seen.add(p.id);
    }
    expect(seen.size).toBe(13);
  });

  it('Rocket No. 4 gives a fourth ammo slot', () => {
    const { me } = pair(['fuse', { starPower: 1 }], 900);
    expect(me.maxAmmo).toBe(4);
    expect(me.ammo).toBe(4);
  });

  it('Rocket Laces jumps four tiles and hits both ends for 1000', () => {
    const engine = arena([['fuse', { gadget: 0 }], ['boulder'], ['boulder']]);
    const [me, atStart, atEnd] = engine.brawlers;
    place(me, 800, 900);
    // Behind the jump, so the shove from taking off carries it away from the landing.
    place(atStart, 760, 900);
    place(atEnd, 1050, 900);
    press(engine, me, { gadget: true, aimAngle: 0 });
    run(engine, 1.2);
    expect(atStart.maxHp - atStart.hp).toBe(1000);
    expect(atEnd.maxHp - atEnd.hp).toBe(1000);
  });

  it('Rocket Fuel is one 2000 rocket and the cooldown waits for it', () => {
    const { engine, me } = pair(['fuse', { gadget: 1 }], 900);
    press(engine, me, { gadget: true });
    me.attackCooldown = 0;
    press(engine, me, { attack: true });
    expect(engine.projectiles.find(p => p.ownerId === me.id)!.damage).toBe(2000);
    expect(me.gadgetCooldown).toBeLessThanOrEqual(22);
  });
});

describe('THORN (the cactus)', () => {
  it('bursts into six spikes where the cactus stops', () => {
    const { engine, me } = pair(['thorn'], 900);
    place(engine.brawlers[1], 2200, 1500);
    press(engine, me, { attack: true });
    run(engine, 1.3);
    const spikes = engine.projectiles.filter(p => p.damage === 1080 && p.radius === 10);
    expect(spikes.length).toBe(6);
  });

  it('is lethal up close, where several spikes land as well as the cactus', () => {
    const { engine, me, foe } = pair(['thorn', { starPower: 1 }], 60);
    press(engine, me, { attack: true });
    run(engine, 1.5);
    expect(foe.maxHp - foe.hp).toBeGreaterThanOrEqual(4000);
  });

  it('Super leaves a patch that hurts and slows for four and a half seconds', () => {
    const { engine, me, foe } = pair(['thorn'], 300);
    me.superCharge = 100;
    press(engine, me, { superAttack: true, superTargetX: 1100, superTargetY: 900 });
    run(engine, 2.5);
    expect(engine.thornFields.length).toBe(1);
    expect(foe.maxHp - foe.hp).toBeGreaterThan(1000);
    expect(foe.slowAmount).toBeCloseTo(0.53, 2);
  });

  it('Fertilize heals Spike for most of what the patch deals', () => {
    const { engine, me, foe } = pair(['thorn', { starPower: 0 }], 300);
    me.hp = me.maxHp * 0.3;
    const before = me.hp;
    me.superCharge = 100;
    press(engine, me, { superAttack: true, superTargetX: 1100, superTargetY: 900 });
    run(engine, 3);
    const dealt = foe.maxHp - foe.hp;
    expect(me.hp - before).toBeGreaterThan(dealt * 0.5);
  });

  it('Life Plant grows a cactus that heals the side when it falls', () => {
    const engine = arena([['thorn', { gadget: 1 }], ['boulder']]);
    const [me, foe] = engine.brawlers;
    place(me, 800, 900);
    place(foe, 2200, 1500);
    press(engine, me, { gadget: true, aimAngle: 0, superTargetX: 1050, superTargetY: 900 });
    run(engine, 1.5);
    const plant = engine.deployables.find(d => d.kind === 'cactus');
    expect(plant).toBeDefined();
    place(me, plant!.x - 100, plant!.y);
    me.hp = me.maxHp * 0.4;
    plant!.hp = 0;
    run(engine, 0.1);
    expect(me.hp).toBeGreaterThan(me.maxHp * 0.6);
  });

  it('Pincushion needles are worth 600 up close and 1000 at the far end', () => {
    const { engine, me } = pair(['thorn', { gadget: 0 }], 900);
    press(engine, me, { gadget: true });
    const needles = engine.projectiles.filter(p => p.ownerId === me.id);
    expect(needles).toHaveLength(5);
    expect(needles[0].damage).toBe(1000);
    expect(needles[0].falloff?.near).toBe(0.6);
    expect(needles[0].falloff?.far).toBe(1);
  });
});

describe('WISP (the assassin)', () => {
  it('hits much harder up close than at the end of its range', () => {
    const near = pair(['wisp'], 100);
    press(near.engine, near.me, { attack: true });
    run(near.engine, 0.8);
    const far = pair(['wisp'], 520);
    press(far.engine, far.me, { attack: true });
    run(far.engine, 1.2);
    expect(near.foe.maxHp - near.foe.hp).toBeGreaterThan((far.foe.maxHp - far.foe.hp) * 2);
  });

  it('Super is six seconds of invisibility, broken by attacking', () => {
    const { engine, me } = pair(['wisp'], 900);
    me.superCharge = 100;
    press(engine, me, { superAttack: true });
    expect(me.invisibilityTimer).toBeGreaterThan(5.5);
    press(engine, me, { attack: true });
    expect(me.invisibilityTimer).toBe(0);
  });

  it('Clone Projector leaves a decoy that hurts what it touches', () => {
    const { engine, me, foe } = pair(['wisp', { gadget: 0 }], 200);
    press(engine, me, { gadget: true });
    run(engine, 2);
    expect(engine.brawlers.some(b => b.isClone)).toBe(true);
    expect(foe.hp).toBeLessThan(foe.maxHp);
  });

  it('the Lollipop hides a side standing inside it, and fades by itself', () => {
    const engine = arena([['wisp', { gadget: 1 }], ['boulder']]);
    const [me, foe] = engine.brawlers;
    place(me, 800, 900);
    place(foe, 2200, 1500);
    press(engine, me, { gadget: true });
    run(engine, 0.6);
    expect(me.invisibilityTimer).toBeGreaterThan(0);
    const sweet = engine.deployables.find(d => d.kind === 'lollipop')!;
    const before = sweet.hp;
    run(engine, 1);
    expect(sweet.hp).toBeLessThan(before - 150);
  });

  it('Smoke Trails is faster while invisible only', () => {
    const a = pair(['wisp', { starPower: 0 }], 900);
    const b = pair(['wisp', { starPower: 1 }], 900);
    a.me.superCharge = 100;
    b.me.superCharge = 100;
    press(a.engine, a.me, { superAttack: true });
    press(b.engine, b.me, { superAttack: true });
    press(a.engine, a.me, { moveX: 1 }, 1.5);
    press(b.engine, b.me, { moveX: 1 }, 1.5);
    expect(a.me.x - 800).toBeGreaterThan((b.me.x - 800) * 1.15);
  });

  it('Invisiheal heals while the Super lasts', () => {
    const { engine, me } = pair(['wisp', { starPower: 1 }], 900);
    me.hp = 2000;
    me.superCharge = 100;
    press(engine, me, { superAttack: true });
    run(engine, 2);
    expect(me.hp).toBeGreaterThan(2000 + me.maxHp * 0.3);
  });
});
