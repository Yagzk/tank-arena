import { beforeEach, describe, expect, it } from 'vitest';
import { BrawlEngine } from './brawlEngine';
import { BRAWLERS, type BrawlPlayerInput, type BrawlerId, type PlayerInfo } from '../types/brawl';
import { FIXED_DT } from '../core/loop';

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

/** Runs the simulation for `seconds` of game time at the fixed tick rate. */
function run(engine: BrawlEngine, seconds: number): void {
  const ticks = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < ticks; i++) engine.update(FIXED_DT);
}

/** A match that has finished its intro and is ready to be driven. */
function startedMatch(roster: PlayerInfo[], seed = 1234): BrawlEngine {
  const engine = new BrawlEngine();
  engine.initMatch(roster, 'showdown', seed);
  engine.phase = 'playing';
  return engine;
}

/**
 * Strips the level down to bare ground.
 *
 * Combat tests place brawlers at chosen coordinates, and the generated map has
 * cover almost everywhere — the first draft of these tests put a shooter inside
 * a quadrant ruin and every pellet died on the wall two ticks later. Clearing
 * the geometry keeps each test about the one behaviour it names.
 */
function clearLevel(engine: BrawlEngine): void {
  engine.walls = [];
  engine.boxes = [];
  engine.bushes = [];
}

describe('ammo and the attack gate', () => {
  let engine: BrawlEngine;

  beforeEach(() => {
    engine = startedMatch(players('rivet', 'mira'));
  });

  it('starts with a full clip', () => {
    expect(engine.brawlers[0].ammo).toBe(3);
  });

  it('spends one whole slot per attack', () => {
    engine.setPlayerInput('p0', idle({ attack: true }));
    engine.update(FIXED_DT);
    expect(engine.brawlers[0].ammo).toBe(2);
  });

  it('will not dump the clip in consecutive ticks', () => {
    // Holding the trigger used to empty every slot within a few frames, because
    // only ammo gated the attack. A separate post-attack delay stops that.
    engine.setPlayerInput('p0', idle({ attack: true }));
    for (let i = 0; i < 6; i++) engine.update(FIXED_DT);
    expect(engine.brawlers[0].ammo).toBe(2);
  });

  it('lets the next shot through once the delay has passed', () => {
    engine.setPlayerInput('p0', idle({ attack: true }));
    run(engine, BRAWLERS.rivet.attackCooldown + 0.1);
    expect(engine.brawlers[0].ammo).toBeLessThan(2);
  });

  it('refills one whole slot at a time', () => {
    const me = engine.brawlers[0];
    me.ammo = 0;
    me.reloadTimer = 0;
    engine.setPlayerInput('p0', idle());

    // Part-way through the first slot: still empty, not a usable fraction.
    run(engine, BRAWLERS.rivet.reloadTime * 0.6);
    expect(me.ammo).toBe(0);
    expect(me.reloadTimer).toBeGreaterThan(0);

    run(engine, BRAWLERS.rivet.reloadTime * 0.5);
    expect(me.ammo).toBe(1);
  });
});

describe('damage and death', () => {
  it('hits a target standing in front of the shooter', () => {
    const engine = startedMatch(players('rivet', 'mira'));
    clearLevel(engine);
    const [shooter, target] = engine.brawlers;

    shooter.x = 500;
    shooter.y = 500;
    target.x = 700;
    target.y = 500;
    const startHp = target.hp;

    engine.setPlayerInput('p0', idle({ attack: true, aimAngle: 0 }));
    engine.setPlayerInput('p1', idle());
    run(engine, 0.6);

    expect(target.hp).toBeLessThan(startHp);
  });

  it('does not let a fast projectile pass through a body', () => {
    // Rivet's rounds travel 680 px/s, which is 11 px per tick against a 44 px
    // body — fine — but the guard that matters is that no step can straddle the
    // target. Place them close enough that a single step covers the gap.
    const engine = startedMatch(players('rivet', 'mira'));
    clearLevel(engine);
    const [shooter, target] = engine.brawlers;

    shooter.x = 500;
    shooter.y = 500;
    target.x = 508;
    target.y = 500;
    const startHp = target.hp;

    engine.setPlayerInput('p0', idle({ attack: true, aimAngle: 0 }));
    engine.setPlayerInput('p1', idle());
    run(engine, 0.3);

    expect(target.hp).toBeLessThan(startHp);
  });

  it('marks a brawler dead when health runs out', () => {
    // Not Mira: her emergency heal would bring the target back from one point.
    const engine = startedMatch(players('rivet', 'boulder'));
    clearLevel(engine);
    const target = engine.brawlers[1];
    target.hp = 1;
    target.x = engine.brawlers[0].x + 120;
    target.y = engine.brawlers[0].y;

    engine.setPlayerInput('p0', idle({ attack: true, aimAngle: 0 }));
    engine.setPlayerInput('p1', idle());
    run(engine, 0.6);

    expect(target.isAlive).toBe(false);
  });

  it('lets burn damage finish someone off', () => {
    // Burn was clamped to a floor of 1 HP and could never land the kill.
    //
    // The victim is deliberately not Mira: her Band-Aid star power fires the
    // moment she drops below 40% health and would heal straight through this.
    const engine = startedMatch(players('mira', 'boulder'));
    const victim = engine.brawlers[1];
    victim.hp = 40;
    victim.burnTimer = 3;
    victim.burnDamagePerSec = 300;

    engine.setPlayerInput('p0', idle());
    engine.setPlayerInput('p1', idle());
    run(engine, 1.0);

    expect(victim.isAlive).toBe(false);
  });
});

describe('super charge', () => {
  it('is proportional to damage, not to the number of projectiles', () => {
    // Mira fires five pellets. Charging a flat amount per pellet filled 52% of
    // her Super on one trigger pull, so two attacks brought it back.
    const engine = startedMatch(players('mira', 'boulder'));
    clearLevel(engine);
    const [shooter, target] = engine.brawlers;

    shooter.x = 500;
    shooter.y = 500;
    target.x = 580;
    target.y = 500;

    engine.setPlayerInput('p0', idle({ attack: true, aimAngle: 0 }));
    engine.setPlayerInput('p1', idle());
    run(engine, 0.5);

    expect(shooter.superCharge).toBeGreaterThan(0);
    // One full attack is worth roughly 1/superHitsRequired of the bar.
    expect(shooter.superCharge).toBeLessThan(45);
  });

  it('is not charged by the Super itself', () => {
    const engine = startedMatch(players('mira', 'boulder'));
    clearLevel(engine);
    const [shooter, target] = engine.brawlers;

    shooter.x = 500;
    shooter.y = 500;
    shooter.superCharge = 100;
    target.x = 600;
    target.y = 500;

    engine.setPlayerInput('p0', idle({ superAttack: true, aimAngle: 0 }));
    engine.setPlayerInput('p1', idle());
    run(engine, 0.5);

    expect(shooter.superCharge).toBe(0);
  });
});

describe('friendly fire on your own effects', () => {
  it('does not hurt the brawler whose Super landed', () => {
    // Boulder's landing shockwave used to take 1300 off his own health bar.
    const engine = startedMatch(players('boulder', 'mira'));
    const me = engine.brawlers[0];
    const startHp = me.hp;

    engine.setPlayerInput('p0', idle({ superAttack: true, aimAngle: 0 }));
    engine.setPlayerInput('p1', idle());
    me.superCharge = 100;

    run(engine, 1.5);

    expect(me.hp).toBeGreaterThanOrEqual(startHp - 1);
  });

  it('does not hurt Thorn inside her own field', () => {
    const engine = startedMatch(players('thorn', 'mira'));
    const me = engine.brawlers[0];
    me.superCharge = 100;
    const startHp = me.hp;

    engine.setPlayerInput('p0', idle({ superAttack: true, superTargetX: me.x, superTargetY: me.y }));
    engine.setPlayerInput('p1', idle());
    run(engine, 1.5);

    expect(me.hp).toBeGreaterThanOrEqual(startHp - 1);
  });
});

describe('Gem Grab setup', () => {
  it('spawns each team on its own side', () => {
    // Teams were assigned by player order but spawn points by index, so half
    // the lobby started inside the enemy base.
    const engine = new BrawlEngine();
    engine.initMatch(players('mira', 'rivet', 'boulder', 'fuse'), 'gem_grab', 7);

    const teamZero = engine.brawlers.filter(b => b.team === 0);
    const teamOne = engine.brawlers.filter(b => b.team === 1);

    expect(teamZero.length).toBeGreaterThan(0);
    expect(teamOne.length).toBeGreaterThan(0);

    const furthestLeft = Math.max(...teamZero.map(b => b.x));
    const furthestRight = Math.min(...teamOne.map(b => b.x));
    expect(furthestLeft).toBeLessThan(furthestRight);
  });
});

describe('determinism', () => {
  it('replays identically from the same seed and inputs', () => {
    // The whole point of the seeded RNG and the fixed timestep. If this fails,
    // peers drift apart and replays are impossible.
    const roster = players('mira', 'rivet', 'boulder', 'fuse');

    const transcript: BrawlPlayerInput[][] = [];
    for (let tick = 0; tick < 420; tick++) {
      transcript.push(
        roster.map((_, i) =>
          idle({
            moveX: Math.sin(tick * 0.07 + i),
            moveY: Math.cos(tick * 0.05 + i * 2),
            aimAngle: tick * 0.03 + i,
            attack: tick % 17 === i,
            superAttack: tick % 211 === i,
          })
        )
      );
    }

    const play = () => {
      const engine = startedMatch(roster, 0xc0ffee);
      for (const frame of transcript) {
        frame.forEach((input, i) => engine.setPlayerInput(`p${i}`, input));
        engine.update(FIXED_DT);
      }
      return engine.brawlers.map(b => ({
        id: b.id,
        x: b.x,
        y: b.y,
        hp: b.hp,
        ammo: b.ammo,
        superCharge: b.superCharge,
        kills: b.kills,
      }));
    };

    expect(play()).toEqual(play());
  });

  it('diverges from a different seed', () => {
    // Guards against the replay test passing because nothing random happens.
    const roster = players('fuse', 'thorn');

    const play = (seed: number) => {
      const engine = startedMatch(roster, seed);
      clearLevel(engine);
      const [a, b] = engine.brawlers;
      a.x = 600;
      a.y = 600;
      b.x = 900;
      b.y = 600;
      // A deep health pool so the outcome records how many of the scattered
      // rockets actually landed, rather than collapsing to "died either way".
      b.maxHp = 100000;
      b.hp = 100000;

      for (let tick = 0; tick < 240; tick++) {
        // Fuse's Rocket Rain scatters its nine rockets at random, which is the
        // only thing in this scenario the seed can move.
        roster.forEach((_, i) =>
          engine.setPlayerInput(
            `p${i}`,
            idle({ aimAngle: 0, superAttack: tick === 120, superTargetX: 900, superTargetY: 600 })
          )
        );
        if (tick === 119) engine.brawlers.forEach(x => (x.superCharge = 100));
        engine.update(FIXED_DT);
      }
      return engine.brawlers.map(x => `${x.x.toFixed(4)}:${x.hp.toFixed(4)}`).join('|');
    };

    expect(play(1)).not.toBe(play(999));
  });
});

describe('frame-rate independence', () => {
  it('produces the same movement regardless of how update is batched', () => {
    // The engine must only ever be advanced in fixed steps; batching more of
    // them per frame on a slow display must not change the outcome.
    const roster = players('rivet');
    const input = idle({ moveX: 1, moveY: 0.35 });

    const playInBatches = (batchSize: number) => {
      const engine = startedMatch(roster, 42);
      for (let i = 0; i < 300 / batchSize; i++) {
        engine.setPlayerInput('p0', input);
        for (let step = 0; step < batchSize; step++) engine.update(FIXED_DT);
      }
      const me = engine.brawlers[0];
      return `${me.x.toFixed(6)}:${me.y.toFixed(6)}`;
    };

    expect(playInBatches(1)).toBe(playInBatches(3));
    expect(playInBatches(1)).toBe(playInBatches(5));
  });
});
