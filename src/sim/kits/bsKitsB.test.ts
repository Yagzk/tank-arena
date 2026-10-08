import { describe, expect, it } from 'vitest';
import { BrawlEngine } from '../../game/brawlEngine';
import { FIXED_DT } from '../../core/loop';
import type { BrawlPlayerInput, BrawlerEntity, BrawlerId, PlayerInfo } from '../../types/brawl';

/** The second six: what each attack, Super, gadget and star power does when run. */

interface Loadout {
  gadget?: number;
  starPower?: number;
}
type Entry = [BrawlerId, Loadout?];

function roster(list: Entry[], teams?: number[]): PlayerInfo[] {
  return list.map(([brawler, l], i) => ({
    id: 'p' + i,
    name: 'P' + i,
    brawler,
    team: teams ? teams[i] : i,
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

function arena(list: Entry[], mode: 'showdown' | 'wipeout' = 'showdown'): BrawlEngine {
  const engine = new BrawlEngine();
  engine.initMatch(roster(list), mode, 3);
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

function pair(a: Entry, gap = 300, foe: BrawlerId = 'boulder') {
  const engine = arena([a, [foe, { starPower: 1 }]]);
  const [me, other] = engine.brawlers;
  place(me, 800, 900);
  place(other, 800 + gap, 900);
  return { engine, me, foe: other };
}

describe('MOLOTOF', () => {
  it('lobs a bottle that splashes for 1600 and wets the ground for another 1600', () => {
    const { engine, me, foe } = pair(['molotof', { starPower: 1 }], 400);
    press(engine, me, { attack: true, superTargetX: 1200, superTargetY: 900 });
    run(engine, 2.5);
    // SP1 is +200, so 1800 + 1800 for something that stood in it the whole time.
    expect(foe.maxHp - foe.hp).toBeGreaterThanOrEqual(3400);
  });

  it('the plain bottle is worth 1600 on landing and about as much again in the puddle', () => {
    const { engine, me, foe } = pair(['molotof', { starPower: 0 }], 400);
    press(engine, me, { attack: true, superTargetX: 1200, superTargetY: 900 });
    run(engine, 2.5);
    expect(foe.maxHp - foe.hp).toBeGreaterThanOrEqual(2900);
    expect(foe.maxHp - foe.hp).toBeLessThanOrEqual(3300);
  });

  it('Tıbbi Kullanım heals a tenth of its health on every attack', () => {
    const { engine, me } = pair(['molotof', { starPower: 0 }], 900);
    me.hp = me.maxHp * 0.5;
    const before = me.hp;
    press(engine, me, { attack: true, superTargetX: 1000, superTargetY: 900 });
    expect(me.hp - before).toBeGreaterThanOrEqual(me.maxHp * 0.1 - 5);
  });

  it('Super throws five bottles and the puddles do not add up where they overlap', () => {
    const { engine, me, foe } = pair(['molotof', { starPower: 1 }], 400);
    me.superCharge = 100;
    press(engine, me, { superAttack: true, superTargetX: 1200, superTargetY: 900 });
    let launched = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 180; i++) {
      engine.update(FIXED_DT);
      for (const p of engine.projectiles) if (p.ownerId === me.id && !seen.has(p.id)) (seen.add(p.id), launched++);
    }
    expect(launched).toBe(5);
    run(engine, 3);
    // Several splashes and a long burn: close to a whole health bar of a tank.
    expect(foe.maxHp - foe.hp).toBeGreaterThan(8000);
  });

  it('Sticky Syrup makes a puddle that slows by about half', () => {
    const { engine, me, foe } = pair(['molotof', { gadget: 0 }], 100);
    press(engine, me, { gadget: true });
    run(engine, 0.3);
    expect(foe.slowTimer).toBeGreaterThan(0);
    expect(foe.slowAmount).toBeCloseTo(0.53, 2);
  });

  it('Herbal Tonic heals a team-mate standing near', () => {
    const engine = arena([['molotof', { gadget: 1 }], ['boulder'], ['boulder']]);
    const [me, mate, foe] = engine.brawlers;
    engine.brawlers.forEach(b => (b.team = b === foe ? 1 : 0));
    place(me, 800, 900);
    place(mate, 900, 900);
    place(foe, 2200, 1500);
    mate.hp = mate.maxHp * 0.5;
    const before = mate.hp;
    press(engine, me, { gadget: true });
    run(engine, 2);
    expect(mate.hp - before).toBeGreaterThan(1200);
  });
});

describe('USTABAŞI', () => {
  it('fires an orb that goes on to the next two enemies, a quarter weaker each time', () => {
    const engine = arena([['ustabasi'], ['boulder'], ['boulder'], ['boulder']]);
    const [me, a, b, c] = engine.brawlers;
    for (const t of [a, b, c]) t.hp = t.maxHp = 13000;
    place(me, 800, 900);
    place(a, 1000, 900);
    place(b, 1150, 940);
    place(c, 1300, 900);
    press(engine, me, { attack: true });
    run(engine, 2.5);
    expect(a.maxHp - a.hp).toBe(2120);
    expect(b.maxHp - b.hp).toBe(1590);
    expect(c.maxHp - c.hp).toBe(1193);
  });

  it('puts a turret down at most five tiles away, sturdier than itself, and it shoots', () => {
    const { engine, me, foe } = pair(['ustabasi'], 450);
    me.superCharge = 100;
    press(engine, me, { superAttack: true, superTargetX: 1800, superTargetY: 900 });
    const turret = engine.deployables.find(d => d.kind === 'turret')!;
    expect(turret.x - 800).toBeLessThanOrEqual(305);
    expect(turret.hp).toBe(7200);
    run(engine, 3);
    expect(foe.hp).toBeLessThan(foe.maxHp);
  });

  it('its gadgets need a turret to work on', () => {
    const { engine, me } = pair(['ustabasi', { gadget: 1 }], 900);
    press(engine, me, { gadget: true });
    expect(me.gadgetCooldown).toBe(0);
  });

  it('Recoil Spring doubles the turret rate', () => {
    const { engine, me } = pair(['ustabasi', { gadget: 1 }], 400);
    me.superCharge = 100;
    press(engine, me, { superAttack: true, superTargetX: 1000, superTargetY: 900 });
    const turret = engine.deployables.find(d => d.kind === 'turret')!;
    const count = (seconds: number) => {
      const seen = new Set<string>();
      for (let i = 0; i < seconds * 60; i++) {
        engine.update(FIXED_DT);
        for (const p of engine.projectiles) if (p.ownerId === me.id && p.damage === 600) seen.add(p.id);
      }
      return seen.size;
    };
    const normal = count(2);
    press(engine, me, { gadget: true });
    expect(turret.rateBoost).toBe(2);
    const boosted = count(2);
    expect(boosted).toBeGreaterThan(normal * 1.5);
  });

  it('Kıvılcım slows enemies around the turret, not around the owner', () => {
    const { engine, me, foe } = pair(['ustabasi', { gadget: 0 }], 800);
    me.superCharge = 100;
    press(engine, me, { superAttack: true, superTargetX: 1100, superTargetY: 900 });
    place(foe, 1250, 900);
    place(me, 700, 900);
    press(engine, me, { gadget: true });
    expect(foe.slowTimer).toBeGreaterThan(2);
    expect(foe.slowAmount).toBeCloseTo(0.47, 2);
  });
});

describe('NAĞME', () => {
  it('hurts enemies in the wave and heals team-mates in it', () => {
    const engine = arena([['nagme', { starPower: 1 }], ['boulder'], ['boulder']]);
    const [me, mate, foe] = engine.brawlers;
    mate.team = me.team;
    place(me, 800, 900);
    place(mate, 950, 900);
    place(foe, 1050, 900);
    mate.hp = mate.maxHp * 0.5;
    const mateBefore = mate.hp;
    press(engine, me, { attack: true });
    run(engine, 1);
    expect(foe.maxHp - foe.hp).toBeGreaterThanOrEqual(1520);
    expect(mate.hp - mateBefore).toBeGreaterThanOrEqual(400);
  });

  it('the Super only heals: ally and self, never an enemy', () => {
    const engine = arena([['nagme', { starPower: 0 }], ['boulder'], ['boulder']]);
    const [me, mate, foe] = engine.brawlers;
    mate.team = me.team;
    place(me, 800, 900);
    place(mate, 1000, 900);
    place(foe, 1200, 900);
    me.hp = 3000;
    mate.hp = 3000;
    me.superCharge = 100;
    press(engine, me, { superAttack: true });
    run(engine, 1);
    expect(me.hp).toBeGreaterThan(6500);
    expect(mate.hp).toBeGreaterThan(6500);
    expect(foe.hp).toBe(foe.maxHp);
  });

  it('Çınlayan Solo makes the Super hurt enemies too', () => {
    const { engine, me, foe } = pair(['nagme', { starPower: 1 }], 400);
    me.superCharge = 100;
    press(engine, me, { superAttack: true });
    run(engine, 1);
    expect(foe.maxHp - foe.hp).toBe(1520);
  });

  it('Diyapazon heals three times over four seconds', () => {
    const { engine, me } = pair(['nagme', { gadget: 0 }], 900);
    me.hp = 2000;
    press(engine, me, { gadget: true });
    run(engine, 4.3);
    expect(me.hp).toBeGreaterThanOrEqual(2000 + 1400 * 3 - 50);
  });

  it('Koruyucu Ezgi washes slows and stuns off the team standing in it', () => {
    const { engine, me } = pair(['nagme', { gadget: 1 }], 900);
    press(engine, me, { gadget: true, superTargetX: 900, superTargetY: 900 });
    run(engine, 1.2);
    me.slowTimer = 3;
    me.slowAmount = 0.5;
    me.stunTimer = 2;
    place(me, 900, 900);
    run(engine, 0.2);
    expect(me.slowTimer).toBe(0);
    expect(me.stunTimer).toBe(0);
  });
});

describe('ZIRH', () => {
  it('Buldozer runs eleven tiles, breaking cover and throwing enemies aside', () => {
    const { engine, me, foe } = pair(['zirh'], 250);
    engine.walls = [{ id: 'w', x: 1300, y: 860, w: 60, h: 80, isDestructible: true } as never];
    (engine as unknown as { wallGridDirty: boolean }).wallGridDirty = true;
    me.superCharge = 100;
    press(engine, me, { superAttack: true, aimAngle: 0 });
    run(engine, 2.5);
    expect(me.x - 800).toBeGreaterThan(600);
    expect(foe.maxHp - foe.hp).toBe(2000);
    expect(engine.walls).toHaveLength(0);
  });

  it('slows everyone near where the charge stops', () => {
    const engine = arena([['zirh'], ['boulder'], ['boulder']]);
    const [me, hit, bystander] = engine.brawlers;
    place(me, 800, 900);
    place(hit, 2200, 1500);
    place(bystander, 1500, 900);
    me.superCharge = 100;
    press(engine, me, { superAttack: true, aimAngle: 0 });
    run(engine, 2.6);
    expect(bystander.slowTimer).toBeGreaterThan(0);
  });

  it('a stun stops the charge', () => {
    const { engine, me } = pair(['zirh'], 900);
    me.superCharge = 100;
    press(engine, me, { superAttack: true, aimAngle: 0 });
    run(engine, 0.3);
    me.stunTimer = 1;
    const at = me.x;
    run(engine, 0.5);
    expect(me.x - at).toBeLessThan(40);
  });

  it('fills its Super from damage taken', () => {
    const { engine, me } = pair(['zirh'], 900);
    (engine as unknown as { damageBrawler(b: BrawlerEntity, d: number, k: string): void }).damageBrawler(me, me.maxHp * 0.24, 'p1');
    expect(me.superCharge).toBeCloseTo(10, 0);
  });

  it('T-Kemik Füzesi heals as much as it deals', () => {
    const { engine, me, foe } = pair(['zirh', { gadget: 0 }], 250);
    me.hp = 4000;
    press(engine, me, { gadget: true });
    run(engine, 0.7);
    expect(foe.maxHp - foe.hp).toBe(1600);
    expect(me.hp).toBeGreaterThanOrEqual(5600);
  });

  it('Tepme slows, and stuns what was already slowed', () => {
    const { engine, me, foe } = pair(['zirh', { gadget: 1 }], 100);
    press(engine, me, { gadget: true });
    expect(foe.slowTimer).toBeGreaterThan(0);
    expect(foe.stunTimer).toBe(0);
    me.gadgetCooldown = 0;
    press(engine, me, { gadget: true });
    expect(foe.stunTimer).toBeGreaterThan(0);
  });

  it('Çılgınlık reloads twice as fast under sixty percent health', () => {
    const slow = pair(['zirh', { starPower: 0 }], 900);
    const fast = pair(['zirh', { starPower: 0 }], 900);
    fast.me.hp = fast.me.maxHp * 0.5;
    for (const t of [slow, fast]) {
      t.me.ammo = 0;
      t.me.reloadTimer = 0;
      run(t.engine, 1.7);
    }
    expect(slow.me.ammo).toBe(1);
    expect(fast.me.ammo).toBeGreaterThanOrEqual(2);
  });
});

describe('KARAMBOL', () => {
  it('has bullets that bounce off a wall and come back for what stood behind it', () => {
    const { engine, me, foe } = pair(['karambol', { starPower: 1 }], 500);
    // A wall across the way, and the foe in front of it: the bullets glance off and miss it.
    engine.walls = [{ id: 'w', x: 1000, y: 700, w: 40, h: 400, isDestructible: false } as never];
    (engine as unknown as { wallGridDirty: boolean }).wallGridDirty = true;
    place(foe, 1200, 900);
    place(me, 800, 900);
    press(engine, me, { attack: true, aimAngle: 0 });
    let bounced = false;
    for (let i = 0; i < 90; i++) {
      engine.update(FIXED_DT);
      if (engine.projectiles.some(p => p.ownerId === me.id && p.vx < 0)) bounced = true;
    }
    expect(bounced).toBe(true);
  });

  it('Super is twelve piercing bullets', () => {
    const { engine, me } = pair(['karambol'], 900);
    me.superCharge = 100;
    press(engine, me, { superAttack: true });
    const seen = new Set<string>();
    for (let i = 0; i < 120; i++) {
      engine.update(FIXED_DT);
      for (const p of engine.projectiles) if (p.ownerId === me.id) seen.add(p.id);
    }
    expect(seen.size).toBe(12);
  });

  it('the vending machine takes fire and bursts into sixteen piercing bullets', () => {
    const { engine, me } = pair(['karambol', { gadget: 0 }], 900);
    press(engine, me, { gadget: true, aimAngle: 0 });
    const machine = engine.deployables.find(d => d.kind === 'vending')!;
    expect(machine.hp).toBe(4000);
    machine.hp = 0;
    run(engine, 0.1);
    const ring = engine.projectiles.filter(p => p.ownerId === me.id && p.damage === 800);
    expect(ring).toHaveLength(16);
  });

  it('Çoklu Top splits in three where it stops', () => {
    const { engine, me } = pair(['karambol', { gadget: 1 }], 900);
    press(engine, me, { gadget: true, aimAngle: 0 });
    let most = 0;
    for (let i = 0; i < 90; i++) {
      engine.update(FIXED_DT);
      most = Math.max(most, engine.projectiles.filter(p => p.ownerId === me.id && p.damage === 900).length);
    }
    expect(most).toBe(3);
  });

  it('Süper Sekme adds 240 once a bullet has bounced', () => {
    const { engine, me } = pair(['karambol', { starPower: 0 }], 900);
    press(engine, me, { attack: true });
    const shot = engine.projectiles.find(p => p.ownerId === me.id)!;
    expect(shot.bounceBonus).toBe(240);
  });
});

describe('FISILTI', () => {
  it('cuts what it dashes through for 2000, over about 160 pixels', () => {
    const { engine, me, foe } = pair(['fisilti'], 120);
    press(engine, me, { attack: true, aimAngle: 0 });
    run(engine, 0.6);
    expect(foe.maxHp - foe.hp).toBe(2000);
    expect(me.x - 800).toBeGreaterThan(140);
    expect(me.x - 800).toBeLessThan(190);
  });

  it('goes two tiles farther after waiting four and a half seconds', () => {
    const { engine, me } = pair(['fisilti'], 900);
    run(engine, 4.7);
    expect(me.charge).toBe(1);
    press(engine, me, { attack: true, aimAngle: 0 });
    run(engine, 1);
    expect(me.x - 800).toBeGreaterThan(260);
  });

  it('Coiled Snake gets there two seconds sooner', () => {
    const { engine, me } = pair(['fisilti', { starPower: 1 }], 900);
    run(engine, 2.7);
    expect(me.charge).toBe(1);
  });

  it('Super passes through walls and heals for what it deals', () => {
    const { engine, me, foe } = pair(['fisilti'], 400);
    engine.walls = [{ id: 'w', x: 1000, y: 700, w: 40, h: 400, isDestructible: false } as never];
    (engine as unknown as { wallGridDirty: boolean }).wallGridDirty = true;
    me.hp = 3000;
    me.superCharge = 100;
    press(engine, me, { superAttack: true, aimAngle: 0 });
    run(engine, 1.2);
    expect(foe.maxHp - foe.hp).toBe(1800);
    expect(me.hp).toBeGreaterThanOrEqual(4800);
  });

  it('Combo Spinner hits everything around it without spending ammo', () => {
    const { engine, me, foe } = pair(['fisilti', { gadget: 0 }], 100);
    const ammo = me.ammo;
    press(engine, me, { gadget: true });
    expect(foe.maxHp - foe.hp).toBe(2000);
    expect(me.ammo).toBe(ammo);
  });

  it('Gecenin Yaratığı flies over walls and cannot be hurt on the way', () => {
    const { engine, me } = pair(['fisilti', { gadget: 1 }], 900);
    engine.walls = [{ id: 'w', x: 900, y: 700, w: 40, h: 400, isDestructible: false } as never];
    (engine as unknown as { wallGridDirty: boolean }).wallGridDirty = true;
    press(engine, me, { gadget: true, aimAngle: 0 });
    expect(me.immunityTimer).toBeGreaterThan(0);
    run(engine, 0.8);
    expect(me.x).toBeGreaterThan(1000);
  });

  it('Ürpertici Hasat heals a fifth of its health for a kill', () => {
    const { engine, me, foe } = pair(['fisilti', { starPower: 0 }], 900);
    me.hp = 2000;
    foe.hp = 10;
    (engine as unknown as { damageBrawler(b: BrawlerEntity, d: number, k: string): void }).damageBrawler(foe, 100, me.id);
    expect(me.hp).toBeGreaterThanOrEqual(2000 + me.maxHp * 0.2 - 5);
  });
});
