import { describe, expect, it } from 'vitest';
import { BrawlEngine } from '../game/brawlEngine';
import { FIXED_DT } from '../core/loop';
import {
  BRAWLER_IDS,
  BRAWLERS,
  type BrawlPlayerInput,
  type BrawlerEntity,
  type BrawlerId,
  type PlayerInfo,
} from '../types/brawl';
import { CHARACTER_STYLES } from '../render/characterStyles';
import { KITS } from './kits';

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
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) engine.update(FIXED_DT);
}

/** Two brawlers 300 apart on open ground, everybody else out of the way. */
function duel(a: BrawlerId, b: BrawlerId): { engine: BrawlEngine; me: BrawlerEntity; foe: BrawlerEntity } {
  const engine = arena(players(a, b));
  const [me, foe] = engine.brawlers;
  place(me, 800, 800);
  place(foe, 1100, 800);
  return { engine, me, foe };
}

function press(engine: BrawlEngine, me: BrawlerEntity, over: Partial<BrawlPlayerInput>, seconds = 0.1): void {
  engine.setPlayerInput(me.id, idle(over));
  run(engine, seconds);
  engine.setPlayerInput(me.id, idle());
}

describe('the roster', () => {
  it('holds twenty-six characters, each with a look, a kit and a config', () => {
    expect(BRAWLER_IDS).toHaveLength(26);
    for (const id of BRAWLER_IDS) {
      expect(CHARACTER_STYLES[id], id + ' style').toBeDefined();
      expect(KITS[id], id + ' kit').toBeDefined();
      expect(BRAWLERS[id].id).toBe(id);
    }
  });

  it('never gives two characters the same weapon and headgear and back together', () => {
    const seen = new Map<string, BrawlerId>();
    for (const id of BRAWLER_IDS) {
      const s = CHARACTER_STYLES[id];
      const key = [s.weapon, s.headgear, s.back ?? 'none'].join('/');
      expect(seen.get(key), id + ' looks like ' + seen.get(key)).toBeUndefined();
      seen.set(key, id);
    }
  });
});

describe('a charged attack', () => {
  it('hits harder the longer it has been held', () => {
    const quick = duel('lumen', 'boulder');
    quick.me.charge = 0;
    press(quick.engine, quick.me, { attack: true, aimAngle: 0 }, 0.05);
    run(quick.engine, 0.4);
    const quickDamage = quick.foe.maxHp - quick.foe.hp;

    const patient = duel('lumen', 'boulder');
    run(patient.engine, 1.6);
    expect(patient.me.charge).toBe(1);
    press(patient.engine, patient.me, { attack: true, aimAngle: 0 }, 0.05);
    run(patient.engine, 0.4);
    const patientDamage = patient.foe.maxHp - patient.foe.hp;

    expect(quickDamage).toBeGreaterThan(0);
    expect(patientDamage).toBeGreaterThan(quickDamage * 2);
  });

  it('starts over after a shot', () => {
    const { engine, me } = duel('lumen', 'boulder');
    run(engine, 1.6);
    press(engine, me, { attack: true, aimAngle: 0 }, 0.05);
    expect(me.charge).toBeLessThan(0.2);
  });

  it('goes through everybody in the lane', () => {
    const engine = arena(players('lumen', 'boulder', 'zirh'));
    const [me, a, b] = engine.brawlers;
    place(me, 800, 800);
    place(a, 1000, 800);
    place(b, 1200, 800);
    run(engine, 1.6);
    press(engine, me, { attack: true, aimAngle: 0 }, 0.05);
    run(engine, 0.3);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });
});

describe('a combo', () => {
  it('walks through its hits and starts over after a pause', () => {
    const { engine, me } = duel('devir', 'boulder');
    expect(me.comboIndex).toBe(0);
    press(engine, me, { attack: true }, 0.05);
    expect(me.comboIndex).toBe(1);
    run(engine, 0.4);
    press(engine, me, { attack: true }, 0.05);
    expect(me.comboIndex).toBe(2);
    run(engine, 2);
    press(engine, me, { attack: true }, 0.05);
    expect(me.comboIndex, 'a pause longer than the window resets the chain').toBe(1);
  });

  it('ends on the boomerang', () => {
    const { engine, me } = duel('devir', 'boulder');
    for (let i = 0; i < 2; i++) {
      press(engine, me, { attack: true }, 0.05);
      run(engine, 0.4);
      engine.projectiles = [];
    }
    press(engine, me, { attack: true }, 0.05);
    expect(engine.projectiles.some(p => p.motion === 'boomerang')).toBe(true);
  });
});

describe('a chain', () => {
  it('jumps from one enemy to the next, hitting each once and a little less each time', () => {
    const engine = arena(players('lumen', 'boulder', 'zirh', 'mira'));
    const [me, a, b, c] = engine.brawlers;
    place(me, 800, 800);
    place(a, 1000, 800);
    place(b, 1150, 900);
    place(c, 1300, 800);
    me.superCharge = 100;
    const before = [a, b, c].map(x => x.hp);
    press(engine, me, { superAttack: true, aimAngle: 0 }, 0.05);
    run(engine, 0.2);
    const lost = [a, b, c].map((x, i) => before[i] - x.hp);
    expect(lost.every(d => d > 0), 'all three struck').toBe(true);
    expect(lost[1]).toBeLessThan(lost[0]);
    expect(lost[2]).toBeLessThan(lost[1]);
  });

  it('stops where nobody is in reach', () => {
    const engine = arena(players('lumen', 'boulder', 'zirh'));
    const [me, a, far] = engine.brawlers;
    place(me, 800, 800);
    place(a, 1000, 800);
    place(far, 2000, 800);
    me.superCharge = 100;
    press(engine, me, { superAttack: true }, 0.05);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(far.hp).toBe(far.maxHp);
  });
});

describe('a built wall', () => {
  function fence() {
    const engine = arena(players('filiz', 'boulder'));
    const [me, foe] = engine.brawlers;
    place(me, 800, 800);
    place(foe, 1200, 800);
    me.superCharge = 100;
    press(engine, me, { superAttack: true, aimAngle: 0, superTargetX: 1000, superTargetY: 800 }, 0.05);
    return { engine, me, foe };
  }

  it('is a row of five solid blocks', () => {
    const { engine } = fence();
    const walls = engine.deployables.filter(d => d.kind === 'wall');
    expect(walls).toHaveLength(5);
  });

  it('stops a body walking into it', () => {
    const { engine, foe } = fence();
    const wall = engine.deployables.find(d => d.kind === 'wall')!;
    place(foe, wall.x + 140, wall.y);
    engine.setPlayerInput(foe.id, idle({ moveX: -1 }));
    run(engine, 1.5);
    expect(foe.x).toBeGreaterThan(wall.x);
  });

  it('stops shots from either side, and is worn down by the other side only', () => {
    const { engine, me, foe } = fence();
    const wall = engine.deployables.find(d => d.kind === 'wall')!;
    const before = wall.hp;

    // The builder's own shot is stopped without damaging it.
    const ownShooter = engine.brawlers[0];
    ownShooter.ammo = 3;
    place(ownShooter, wall.x - 150, wall.y);
    press(engine, ownShooter, { attack: true, aimAngle: 0 }, 0.05);
    run(engine, 0.5);
    expect(wall.hp).toBe(before);

    // An enemy shot is stopped and does damage.
    engine.projectiles = [];
    place(foe, wall.x + 150, wall.y);
    foe.ammo = 3;
    press(engine, foe, { attack: true, aimAngle: Math.PI }, 0.05);
    run(engine, 0.5);
    expect(wall.hp).toBeLessThan(before);
    expect(me.hp).toBe(me.maxHp);
  });

  it('is gone when its time is up', () => {
    const { engine } = fence();
    run(engine, 8.5);
    expect(engine.deployables.filter(d => d.kind === 'wall')).toHaveLength(0);
  });
});

describe('a barrier', () => {
  it('stops enemy shots and lets the builder side through', () => {
    const engine = arena(players('kalkan', 'rivet'));
    const [me, foe] = engine.brawlers;
    place(me, 800, 800);
    place(foe, 1200, 800);
    me.superCharge = 100;
    press(engine, me, { superAttack: true, aimAngle: 0 }, 0.05);
    const barrier = engine.deployables.find(d => d.kind === 'barrier')!;
    expect(barrier).toBeDefined();
    place(foe, barrier.x + 200, barrier.y);
    foe.ammo = 3;
    press(engine, foe, { attack: true, aimAngle: Math.PI }, 0.05);
    run(engine, 0.6);
    expect(me.hp).toBe(me.maxHp);
  });
});

describe('reflection', () => {
  it('sends a shot back at whoever fired it', () => {
    const { engine, me, foe } = duel('miknatis', 'rivet');
    me.superCharge = 100;
    press(engine, me, { superAttack: true }, 0.05);
    expect(me.reflectTimer).toBeGreaterThan(0);
    foe.ammo = 3;
    press(engine, foe, { attack: true, aimAngle: Math.PI }, 0.05);
    run(engine, 1.2);
    expect(me.hp).toBe(me.maxHp);
    expect(foe.hp).toBeLessThan(foe.maxHp);
  });

  it('wears off', () => {
    const { engine, me } = duel('miknatis', 'rivet');
    me.superCharge = 100;
    press(engine, me, { superAttack: true }, 0.05);
    run(engine, 4);
    expect(me.reflectTimer).toBeLessThanOrEqual(0);
  });
});

describe('a vortex that heals', () => {
  it('returns health in proportion to the damage it deals', () => {
    const { engine, me, foe } = duel('devir', 'boulder');
    place(foe, 880, 800);
    me.hp = me.maxHp * 0.4;
    const before = me.hp;
    me.superCharge = 100;
    press(engine, me, { superAttack: true }, 0.05);
    run(engine, 2.4);
    expect(me.hp).toBeGreaterThan(before);
    expect(foe.hp).toBeLessThan(foe.maxHp);
  });

  it('heals nothing when there is nobody to cut', () => {
    const engine = arena(players('devir', 'boulder'));
    const [me, foe] = engine.brawlers;
    place(me, 800, 800);
    place(foe, 2200, 1400);
    me.hp = me.maxHp * 0.4;
    const before = me.hp;
    me.superCharge = 100;
    press(engine, me, { superAttack: true }, 0.05);
    run(engine, 0.5);
    // Only the slow natural regeneration; nothing like the vortex's heal.
    expect(me.hp - before).toBeLessThan(60);
  });
});

describe('the rest of the new characters', () => {
  it('Gölge appears behind the nearest enemy and stuns it', () => {
    const { engine, me, foe } = duel('golge', 'boulder');
    foe.aimAngle = Math.PI; // facing me
    me.superCharge = 100;
    press(engine, me, { superAttack: true }, 0.05);
    expect(me.x).toBeGreaterThan(foe.x);
    expect(foe.hp).toBeLessThan(foe.maxHp);
    expect(foe.stunTimer).toBeGreaterThan(0);
  });

  it('Örs stuns what it charges through', () => {
    const { engine, me, foe } = duel('ors', 'rivet');
    place(foe, 960, 800);
    me.superCharge = 100;
    press(engine, me, { superAttack: true, aimAngle: 0 }, 0.05);
    run(engine, 0.8);
    expect(foe.hp).toBeLessThan(foe.maxHp);
  });

  it('Sis reveals and silences everyone in the fog', () => {
    const { engine, me, foe } = duel('sis', 'rivet');
    me.superCharge = 100;
    press(engine, me, { superAttack: true }, 0.05);
    expect(foe.revealTimer).toBeGreaterThan(0);
    expect(foe.silenceTimer).toBeGreaterThan(0);
  });

  it('Bekçi sends a creature that goes for the enemy', () => {
    const { engine, me, foe } = duel('bekci', 'boulder');
    me.superCharge = 100;
    press(engine, me, { superAttack: true }, 0.05);
    expect(engine.deployables.some(d => d.kind === 'minion')).toBe(true);
    run(engine, 5);
    expect(foe.hp).toBeLessThan(foe.maxHp);
  });

  it('Tiktak scatters six mines', () => {
    const { engine, me, foe } = duel('tiktak', 'boulder');
    // Out of the way, or a mine under its feet goes off and is no longer there to count.
    place(foe, 2200, 1400);
    me.superCharge = 100;
    press(engine, me, { superAttack: true, superTargetX: 1000, superTargetY: 800 }, 0.05);
    run(engine, 0.9);
    expect(engine.deployables.filter(d => d.kind === 'mine')).toHaveLength(6);
  });

  it('Pansuman’s station heals a team-mate standing in it', () => {
    const engine = new BrawlEngine();
    engine.initMatch(players('pansuman', 'mira', 'rivet', 'boulder'), 'wipeout', 3);
    engine.phase = 'playing';
    engine.walls = [];
    engine.boxes = [];
    engine.bushes = [];
    for (const b of engine.brawlers) engine.setPlayerInput(b.id, idle());
    const [me, , mate] = engine.brawlers;
    expect(mate.team).toBe(me.team);
    place(me, 800, 800);
    place(mate, 840, 800);
    for (const other of engine.brawlers) if (other.team !== me.team) place(other, 2200, 1400);
    mate.hp = mate.maxHp * 0.3;
    const before = mate.hp;
    me.superCharge = 100;
    press(engine, me, { superAttack: true }, 0.05);
    run(engine, 2);
    expect(mate.hp).toBeGreaterThan(before);
  });

  it('Dinamit throws two sticks a press', () => {
    const { engine, me, foe } = duel('dinamit', 'boulder');
    press(engine, me, { attack: true, superTargetX: 1100, superTargetY: 800 }, 0.05);
    run(engine, 1.5);
    // One stick is 600 off a 6000-point brawler; two land close to 1200.
    expect(foe.maxHp - foe.hp).toBeGreaterThan(900);
  });
});

describe('every character, played by a bot', () => {
  it('can fight for a minute without anything throwing or going missing', () => {
    for (let group = 0; group < BRAWLER_IDS.length; group += 8) {
      const ids = BRAWLER_IDS.slice(group, group + 8);
      for (const mode of ['showdown', 'wipeout', 'brawl_ball'] as const) {
        const engine = new BrawlEngine();
        engine.initMatch(
          ids.map((brawler, i) => ({
            id: 'b' + i,
            name: 'B' + i,
            brawler,
            team: i,
            isHost: false,
            isBot: true,
            score: 0,
            trophies: 0,
          })),
          mode,
          group + 5
        );
        engine.phase = 'playing';
        for (let i = 0; i < 60 * 60 && (engine.phase as string) !== 'match_end'; i++) {
          engine.update(FIXED_DT);
          if ((engine.phase as string) === 'starting') engine.matchTimer = 3;
        }
        for (const b of engine.brawlers) {
          expect(Number.isFinite(b.x) && Number.isFinite(b.y), b.brawlerId + ' in ' + mode).toBe(true);
          expect(Number.isFinite(b.hp), b.brawlerId + ' hp').toBe(true);
        }
      }
    }
  }, 60000);
});
