import { describe, expect, it } from 'vitest';
import { BrawlEngine } from '../../game/brawlEngine';
import { FIXED_DT } from '../../core/loop';
import {
  BRAWLER_IDS,
  type BrawlPlayerInput,
  type BrawlerEntity,
  type BrawlerId,
  type DeployedEntity,
  type PlayerInfo,
} from '../../types/brawl';
import { KITS } from '../kits';
import { keyFor } from '../kits/registry';

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

function arena(roster: PlayerInfo[]): BrawlEngine {
  const engine = new BrawlEngine();
  engine.initMatch(roster, 'showdown', 11);
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
  const ticks = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < ticks; i++) engine.update(FIXED_DT);
}

/** The action list the turret fires, borrowed for hand-built deployables. */
function turretActionKey(): string {
  const summon = KITS.ustabasi.super.actions.find(a => a.type === 'summon')!;
  return keyFor(summon)!;
}

function handBuilt(owner: BrawlerEntity, over: Partial<DeployedEntity>): DeployedEntity {
  return {
    id: 'hand-made',
    ownerId: owner.id,
    team: owner.team,
    brawlerId: owner.brawlerId,
    kind: 'turret',
    behaviour: 'turret',
    x: owner.x,
    y: owner.y,
    angle: 0,
    radius: 18,
    hp: 1000,
    maxHp: 1000,
    lifetime: 20,
    actTimer: 0,
    interval: 0.5,
    range: 300,
    actionKey: turretActionKey(),
    ...over,
  };
}

describe('turrets', () => {
  it('is placed in front of the brawler that called it', () => {
    const engine = arena(players('ustabasi', 'mira'));
    const owner = engine.brawlers[0];
    place(owner, 400, 400);
    owner.superCharge = 100;

    engine.setPlayerInput('p0', idle({ superAttack: true, aimAngle: 0 }));
    engine.update(FIXED_DT);

    expect(engine.deployables).toHaveLength(1);
    expect(engine.deployables[0].x).toBeGreaterThan(owner.x + 30);
  });

  it('shoots an enemy that walks into its reach', () => {
    const engine = arena(players('ustabasi', 'boulder'));
    const [owner, victim] = engine.brawlers;
    place(owner, 400, 400);
    place(victim, 620, 400);
    owner.superCharge = 100;
    const before = victim.hp;

    engine.setPlayerInput('p0', idle({ superAttack: true, aimAngle: 0 }));
    run(engine, 1.5);

    expect(victim.hp).toBeLessThan(before);
  });

  it('will not shoot through a wall', () => {
    const engine = arena(players('ustabasi', 'boulder'));
    const [owner, victim] = engine.brawlers;
    place(owner, 400, 400);
    place(victim, 700, 400);
    owner.superCharge = 100;

    engine.setPlayerInput('p0', idle({ superAttack: true, aimAngle: 0 }));
    engine.update(FIXED_DT);

    // Drop a wall between the turret and its target after it is placed.
    engine.walls = [
      { id: 'w', x: 540, y: 300, w: 40, h: 200, isDestructible: false },
    ];
    const before = victim.hp;
    run(engine, 2.0);

    expect(victim.hp).toBe(before);
  });

  it('can be destroyed by shooting it', () => {
    const engine = arena(players('ustabasi', 'rivet'));
    const [owner, shooter] = engine.brawlers;
    place(owner, 400, 400);
    owner.superCharge = 100;
    engine.setPlayerInput('p0', idle({ superAttack: true, aimAngle: 0 }));
    engine.update(FIXED_DT);

    const turret = engine.deployables[0];
    turret.hp = 200;
    // The owner has to get out of the way: it stands between the turret and
    // anywhere the shooter could fire from.
    place(owner, 400, 900);
    place(shooter, turret.x - 120, turret.y);
    engine.setPlayerInput('p1', idle({ attack: true, aimAngle: 0 }));
    run(engine, 1.2);

    expect(engine.deployables).toHaveLength(0);
  });

  it('does not eat bullets from its own team', () => {
    const engine = arena(players('ustabasi', 'boulder'));
    const [owner, victim] = engine.brawlers;
    place(owner, 400, 400);
    place(victim, 700, 400);
    owner.superCharge = 100;
    engine.setPlayerInput('p0', idle({ superAttack: true, aimAngle: 0 }));
    engine.update(FIXED_DT);

    const turretHp = engine.deployables[0].hp;
    engine.setPlayerInput('p0', idle({ attack: true, aimAngle: 0 }));
    run(engine, 0.6);

    expect(engine.deployables[0].hp).toBe(turretHp);
  });

  it('packs up when its time runs out', () => {
    const engine = arena(players('ustabasi', 'mira'));
    const owner = engine.brawlers[0];
    owner.superCharge = 100;
    engine.setPlayerInput('p0', idle({ superAttack: true }));
    engine.update(FIXED_DT);
    engine.setPlayerInput('p0', idle());

    expect(engine.deployables).toHaveLength(1);
    engine.deployables[0].lifetime = 0.5;
    run(engine, 1.0);

    expect(engine.deployables).toHaveLength(0);
  });

  it('outlives its owner', () => {
    // A turret that vanished the moment you died would be worth nothing at
    // exactly the moment you most needed it.
    //
    // Three players, because Showdown ends the moment one is left standing
    // and a finished match stops simulating anything at all.
    const engine = arena(players('ustabasi', 'boulder', 'mira'));
    const [owner, victim, bystander] = engine.brawlers;
    place(owner, 400, 400);
    place(victim, 620, 400);
    place(bystander, 1400, 1400);
    owner.superCharge = 100;
    engine.setPlayerInput('p0', idle({ superAttack: true, aimAngle: 0 }));
    engine.update(FIXED_DT);

    owner.hp = 1;
    owner.burnTimer = 1;
    owner.burnDamagePerSec = 9999;
    const before = victim.hp;
    run(engine, 1.5);

    expect(owner.isAlive).toBe(false);
    expect(engine.deployables).toHaveLength(1);
    expect(victim.hp).toBeLessThan(before);
  });
});

describe('mines', () => {
  it('waits, then goes off when an enemy comes close', () => {
    const engine = arena(players('ustabasi', 'boulder'));
    const [owner, victim] = engine.brawlers;
    place(owner, 400, 400);
    place(victim, 1200, 400);

    engine.setPlayerInput('p0', idle({ gadget: true }));
    engine.update(FIXED_DT);
    engine.setPlayerInput('p0', idle());
    expect(engine.deployables).toHaveLength(1);

    // Nothing near it: it sits there.
    run(engine, 1.5);
    expect(engine.deployables).toHaveLength(1);

    const before = victim.hp;
    place(victim, 410, 400);
    run(engine, 0.2);

    expect(victim.hp).toBeLessThan(before);
    expect(engine.deployables).toHaveLength(0);
  });

  it('cannot be triggered by the team that laid it', () => {
    const engine = arena(players('ustabasi', 'boulder'));
    const owner = engine.brawlers[0];
    place(owner, 400, 400);
    engine.setPlayerInput('p0', idle({ gadget: true }));
    engine.update(FIXED_DT);
    engine.setPlayerInput('p0', idle());
    run(engine, 2.0);

    expect(engine.deployables).toHaveLength(1);
  });
});

describe('stations', () => {
  it('heals the team standing in it, from where it stands', () => {
    const engine = arena(players('nagme', 'mira'));
    const medic = engine.brawlers[0];
    place(medic, 400, 400);
    medic.hp = 1000;

    engine.setPlayerInput('p0', idle({ gadget: true }));
    engine.update(FIXED_DT);
    engine.setPlayerInput('p0', idle());
    run(engine, 2.2);

    expect(engine.deployables[0].kind).toBe('healStation');
    expect(medic.hp).toBeGreaterThan(1600);
  });

  it('stops healing someone who walks out of it', () => {
    const engine = arena(players('nagme', 'mira'));
    const medic = engine.brawlers[0];
    place(medic, 400, 400);
    engine.setPlayerInput('p0', idle({ gadget: true }));
    engine.update(FIXED_DT);
    engine.setPlayerInput('p0', idle());

    const station = engine.deployables[0];
    medic.hp = 1000;
    place(medic, station.x + station.range + 120, station.y);
    const before = medic.hp;
    run(engine, 1.2);

    // Out-of-combat regeneration still applies, so the bar is allowed to move
    // a little — just nowhere near a 420-a-second pulse.
    expect(medic.hp - before).toBeLessThan(400);
  });
});

describe('the other behaviours', () => {
  it('walks a minion at the nearest enemy', () => {
    const engine = arena(players('ustabasi', 'boulder'));
    const [owner, victim] = engine.brawlers;
    place(owner, 400, 400);
    place(victim, 900, 400);

    const minion = handBuilt(owner, {
      kind: 'minion',
      behaviour: 'chase',
      speed: 200,
      interval: 0.5,
      range: 40,
    });
    engine.deployables.push(minion);

    run(engine, 1.0);
    expect(minion.x).toBeGreaterThan(560);
  });

  it('stops a hostile projectile on a barrier without damaging it', () => {
    const engine = arena(players('zirh', 'rivet'));
    const [owner, shooter] = engine.brawlers;
    place(owner, 400, 400);
    place(shooter, 700, 400);

    const barrier = handBuilt(owner, {
      kind: 'barrier',
      behaviour: 'blocker',
      radius: 34,
      actionKey: undefined,
    });
    barrier.x = 560;
    barrier.y = 400;
    engine.deployables.push(barrier);

    const before = owner.hp;
    engine.setPlayerInput('p1', idle({ attack: true, aimAngle: Math.PI }));
    run(engine, 0.8);

    expect(owner.hp).toBe(before);
    expect(barrier.hp).toBe(barrier.maxHp);
  });
});

describe('wave one', () => {
  it('takes the roster to ten', () => {
    expect(BRAWLER_IDS).toHaveLength(10);
  });

  it('throws a bottle over a wall', () => {
    const engine = arena(players('molotof', 'boulder'));
    const [thrower, victim] = engine.brawlers;
    place(thrower, 400, 400);
    place(victim, 700, 400);
    // A wall the bottle has to clear. A straight shot would die on it.
    engine.walls = [{ id: 'w', x: 520, y: 300, w: 40, h: 200, isDestructible: false }];

    const before = victim.hp;
    engine.setPlayerInput('p0', idle({ attack: true, aimAngle: 0, superTargetX: 700, superTargetY: 400 }));
    run(engine, 1.2);

    expect(victim.hp).toBeLessThan(before);
  });

  it('leaves burning ground where the bottle lands', () => {
    const engine = arena(players('molotof', 'mira'));
    place(engine.brawlers[1], 2000, 2000);
    engine.setPlayerInput('p0', idle({ attack: true, superTargetX: 700, superTargetY: 400 }));
    run(engine, 1.2);

    expect(engine.firePatches.length).toBeGreaterThan(0);
  });

  it('heals the team with the support Super and threatens nobody', () => {
    const engine = arena(players('nagme', 'boulder'));
    const [medic, enemy] = engine.brawlers;
    place(medic, 400, 400);
    place(enemy, 440, 400);
    medic.hp = 500;
    medic.superCharge = 100;
    const enemyBefore = enemy.hp;

    engine.setPlayerInput('p0', idle({ superAttack: true }));
    engine.update(FIXED_DT);

    expect(medic.hp).toBeGreaterThan(2500);
    expect(enemy.hp).toBe(enemyBefore);
  });

  it('shields the team and charges from damage taken', () => {
    const engine = arena(players('zirh', 'rivet'));
    const [tank, shooter] = engine.brawlers;
    place(tank, 400, 400);
    place(shooter, 520, 400);

    engine.setPlayerInput('p1', idle({ attack: true, aimAngle: Math.PI }));
    run(engine, 0.8);
    expect(tank.superCharge).toBeGreaterThan(0);

    tank.superCharge = 100;
    engine.setPlayerInput('p0', idle({ superAttack: true }));
    engine.update(FIXED_DT);

    expect(tank.shieldHp).toBeGreaterThan(2000);
  });

  it('pierces bodies with the sound wave', () => {
    const engine = arena(players('nagme', 'boulder', 'boulder'));
    const [medic, first, second] = engine.brawlers;
    place(medic, 400, 400);
    place(first, 500, 400);
    place(second, 600, 400);
    const firstBefore = first.hp;
    const secondBefore = second.hp;

    engine.setPlayerInput('p0', idle({ attack: true, aimAngle: 0 }));
    run(engine, 0.8);

    expect(first.hp).toBeLessThan(firstBefore);
    expect(second.hp).toBeLessThan(secondBefore);
  });
});
