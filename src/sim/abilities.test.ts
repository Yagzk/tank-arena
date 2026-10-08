import { afterEach, describe, expect, it } from 'vitest';
import { BrawlEngine } from '../game/brawlEngine';
import { FIXED_DT } from '../core/loop';
import { KITS, withKit } from './kits';
import type { Kit } from './kits/schema';
import {
  BRAWLERS,
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

/**
 * A character that plays the kit a test needs, whatever the real one is tuned
 * to this week. Everything the test does not name is inert.
 */
const INERT: Omit<Kit, 'id'> = {
  maxAmmo: 3,
  attack: { name: 'a', actions: [{ type: 'banner', text: 'a', color: '#fff' }] },
  super: { name: 's', actions: [{ type: 'banner', text: 's', color: '#fff' }] },
  gadgets: [
    { name: 'g', description: '', cooldown: 5, actions: [{ type: 'banner', text: 'g', color: '#fff' }] },
    { name: 'h', description: '', cooldown: 5, actions: [{ type: 'banner', text: 'h', color: '#fff' }] },
  ],
};

let restore: Array<() => void> = [];
afterEach(() => {
  for (const r of restore.reverse()) r();
  restore = [];
});

function fixture(id: BrawlerId, over: Partial<Omit<Kit, 'id'>>): void {
  restore.push(withKit(id, { ...INERT, ...over }));
}

/** A match on bare ground, so a test is about the ability and not the map. */
function arena(roster: PlayerInfo[], seed = 7): BrawlEngine {
  const engine = new BrawlEngine();
  engine.initMatch(roster, 'showdown', seed);
  engine.phase = 'playing';
  engine.walls = [];
  engine.boxes = [];
  engine.bushes = [];
  engine.poisonGas.isActive = false;
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

describe('delivery patterns', () => {
  it('fans a spread across its arc', () => {
    fixture('mira', {
      attack: {
        name: 'fan',
        actions: [
          {
            type: 'projectiles',
            delivery: { pattern: 'spread', count: 5, arc: 0.5 },
            projectile: { speed: 600, radius: 6, damage: 100, range: 400, color: '#fff' },
          },
        ],
      },
    });
    const engine = arena(players('mira', 'rivet'));
    engine.setPlayerInput('p0', idle({ attack: true }));
    engine.update(FIXED_DT);

    const shots = engine.projectiles.filter(p => p.ownerId === 'p0');
    expect(shots).toHaveLength(5);

    // The outermost pellets should sit half an arc either side of the aim
    // line. If the delivery collapsed, they would all share one heading.
    const headings = shots.map(p => Math.atan2(p.vy, p.vx)).sort((a, b) => a - b);
    expect(headings[0]).toBeCloseTo(-0.25, 4);
    expect(headings[headings.length - 1]).toBeCloseTo(0.25, 4);
  });

  it('spreads a radial burst evenly around the brawler', () => {
    fixture('thorn', {
      gadgets: [
        {
          name: 'ring',
          description: '',
          cooldown: 5,
          actions: [
            {
              type: 'projectiles',
              delivery: { pattern: 'radial', count: 16 },
              projectile: { speed: 400, radius: 5, damage: 50, range: 300, color: '#fff' },
            },
          ],
        },
        INERT.gadgets![1],
      ],
    });
    const engine = arena(players('thorn', 'rivet'));
    engine.setPlayerInput('p0', idle({ gadget: true }));
    engine.update(FIXED_DT);

    const needles = engine.projectiles.filter(p => p.ownerId === 'p0');
    expect(needles).toHaveLength(16);

    // Evenly spaced means the headings cancel out: no net direction.
    const sumX = needles.reduce((acc, p) => acc + p.vx, 0);
    const sumY = needles.reduce((acc, p) => acc + p.vy, 0);
    expect(Math.hypot(sumX, sumY)).toBeLessThan(1);
  });

  it('fires a burst over time rather than all at once', () => {
    const engine = arena(players('rivet', 'mira'));
    engine.setPlayerInput('p0', idle({ attack: true }));
    engine.update(FIXED_DT);

    // The trigger pull queues six rounds and fires none of them yet; the
    // queue is drained at the top of the following tick.
    expect(engine.projectiles).toHaveLength(0);
    expect(engine.brawlers[0].pendingBurst?.remaining).toBe(6);

    engine.update(FIXED_DT);
    expect(engine.projectiles).toHaveLength(1);

    // Releasing the trigger does not cancel what was already paid for.
    engine.setPlayerInput('p0', idle());
    const seen = new Set<string>();
    for (let i = 0; i < 60 && engine.brawlers[0].pendingBurst; i++) {
      for (const p of engine.projectiles) if (p.ownerId === 'p0') seen.add(p.id);
      engine.update(FIXED_DT);
    }
    for (const p of engine.projectiles) if (p.ownerId === 'p0') seen.add(p.id);

    expect(seen.size).toBe(6);
    expect(engine.brawlers[0].pendingBurst).toBeNull();
  });

  it('sweeps a thrown handful across its arc', () => {
    // Four blades fired on one heading would be one blade as far as the player
    // can tell. The sweep is what makes the attack cover ground.
    fixture('wisp', {
      attack: {
        name: 'sweep',
        actions: [
          {
            type: 'burst',
            count: 4,
            interval: 0.1,
            aim: 'sweep',
            amplitude: 0.3,
            actions: [
              {
                type: 'projectiles',
                delivery: { pattern: 'single' },
                projectile: { speed: 600, radius: 6, damage: 100, range: 400, color: '#fff' },
              },
            ],
          },
        ],
      },
    });
    const engine = arena(players('wisp', 'mira'));
    engine.setPlayerInput('p0', idle({ attack: true }));
    engine.update(FIXED_DT);
    engine.setPlayerInput('p0', idle());

    const seen = new Set<string>();
    const headings: number[] = [];
    for (let i = 0; i < 40; i++) {
      for (const p of engine.projectiles) {
        if (p.ownerId === 'p0' && !seen.has(p.id)) {
          seen.add(p.id);
          headings.push(Math.atan2(p.vy, p.vx));
        }
      }
      if (!engine.brawlers[0].pendingBurst) break;
      engine.update(FIXED_DT);
    }

    expect(headings).toHaveLength(4);
    const spread = Math.max(...headings) - Math.min(...headings);
    expect(spread).toBeCloseTo(0.3, 2);
  });
});

describe('projectile hooks', () => {
  it('bursts a seed bomb into needles where it stops', () => {
    fixture('thorn', {
      attack: {
        name: 'bomb',
        actions: [
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: 480,
              radius: 8,
              damage: 100,
              range: 390,
              color: '#fff',
              onEnd: [
                {
                  type: 'projectiles',
                  delivery: { pattern: 'radial', count: 6 },
                  projectile: { speed: 300, radius: 4, damage: 50, range: 200, color: '#fff', motion: 'curve', curveRate: 1 },
                },
              ],
            },
          },
        ],
      },
    });
    const engine = arena(players('thorn', 'rivet'));
    place(engine.brawlers[1], 2000, 2000); // out of the way
    engine.setPlayerInput('p0', idle({ attack: true }));
    engine.update(FIXED_DT);
    engine.setPlayerInput('p0', idle());

    // The grenade travels 390 px at 480 px/s, so it expires inside a second.
    run(engine, 1.1);
    const needles = engine.projectiles.filter(p => p.motion === 'curve');
    expect(needles).toHaveLength(6);
  });

  it('spares the body a rocket hit directly from its own splash', () => {
    // A direct hit used to take the rocket's damage *and* its full splash,
    // which quietly doubled the damage of the hardest-hitting attack.
    const engine = arena(players('fuse', 'boulder'));
    const [shooter, victim] = engine.brawlers;
    place(shooter, 400, 400);
    place(victim, 520, 400);
    const before = victim.hp;

    engine.setPlayerInput('p0', idle({ attack: true }));
    engine.setPlayerInput('p1', idle());
    run(engine, 0.6);

    const dealt = before - victim.hp;
    const rocket = BRAWLERS.fuse.damagePerAttack * (KITS.fuse.traits?.damageScale ?? 1);
    expect(dealt).toBeGreaterThan(rocket * 0.9);
    expect(dealt).toBeLessThan(rocket * 1.4);
  });

  it('still catches a bystander in the splash', () => {
    const engine = arena(players('fuse', 'boulder', 'boulder'));
    const [shooter, victim, bystander] = engine.brawlers;
    place(shooter, 400, 400);
    place(victim, 520, 400);
    place(bystander, 560, 420);
    const before = bystander.hp;

    engine.setPlayerInput('p0', idle({ attack: true }));
    run(engine, 0.6);

    expect(bystander.hp).toBeLessThan(before);
  });

  it('applies the statuses a projectile carries', () => {
    const engine = arena(players('mira', 'boulder'));
    const [shooter, victim] = engine.brawlers;
    place(shooter, 400, 400);
    place(victim, 480, 400);
    shooter.superCharge = 100;

    engine.setPlayerInput('p0', idle({ superAttack: true, superTargetX: 480, superTargetY: 400 }));
    run(engine, 0.3);

    expect(victim.slowTimer).toBeGreaterThan(0);
  });

  it('scales a close-range bonus smoothly with distance', () => {
    const near = arena(players('wisp', 'boulder'));
    place(near.brawlers[0], 400, 400);
    place(near.brawlers[1], 450, 400);
    const nearBefore = near.brawlers[1].hp;
    near.setPlayerInput('p0', idle({ attack: true }));
    run(near, 0.4);
    const nearDealt = nearBefore - near.brawlers[1].hp;

    const far = arena(players('wisp', 'boulder'));
    place(far.brawlers[0], 400, 400);
    place(far.brawlers[1], 740, 400);
    const farBefore = far.brawlers[1].hp;
    far.setPlayerInput('p0', idle({ attack: true }));
    run(far, 0.9);
    const farDealt = farBefore - far.brawlers[1].hp;

    expect(nearDealt).toBeGreaterThan(farDealt * 1.5);
  });
});

describe('movement abilities', () => {
  it('runs a landing payload where the jump comes down', () => {
    fixture('boulder', {
      super: {
        name: 'leap',
        actions: [
          {
            type: 'jump',
            toTarget: true,
            maxDistance: 500,
            onLand: [
              { type: 'explosion', at: 'self', damage: 1000, radius: 120 },
              { type: 'status', target: 'self', statuses: [{ kind: 'speed', duration: 3, magnitude: 1.25 }] },
            ],
          },
        ],
      },
    });
    const engine = arena(players('boulder', 'mira'));
    const [jumper, victim] = engine.brawlers;
    place(jumper, 400, 400);
    place(victim, 700, 400);
    jumper.superCharge = 100;
    const before = victim.hp;

    engine.setPlayerInput('p0', idle({ superAttack: true, superTargetX: 700, superTargetY: 400 }));
    engine.setPlayerInput('p1', idle());
    run(engine, 1.2);

    expect(jumper.isJumping).toBe(false);
    expect(jumper.x).toBeGreaterThan(600);
    expect(victim.hp).toBeLessThan(before);
    // The landing also hands out the speed it promised.
    expect(jumper.speedBoostTimer).toBeGreaterThan(0);
  });

  it('throws a grabbed enemy behind the grabber', () => {
    const engine = arena(players('boulder', 'mira'));
    const [grabber, victim] = engine.brawlers;
    place(grabber, 400, 400);
    place(victim, 440, 400);

    // Aiming right throws the victim left, behind the grabber.
    engine.setPlayerInput('p0', idle({ gadget: true, aimAngle: 0 }));
    engine.update(FIXED_DT);

    expect(victim.x).toBeLessThan(grabber.x);
    expect(victim.stunTimer).toBeGreaterThan(0);
  });

  it('moves a dash along the aim line', () => {
    const engine = arena(players('mira', 'rivet'));
    const dasher = engine.brawlers[0];
    place(dasher, 400, 400);

    engine.setPlayerInput('p0', idle({ gadget: true, aimAngle: 0 }));
    run(engine, 0.4);

    expect(dasher.x).toBeGreaterThan(440);
  });
});

describe('statuses and passives', () => {
  it('turns a stealth Super into invisibility and speed', () => {
    fixture('wisp', {
      super: {
        name: 'smoke',
        actions: [
          {
            type: 'status',
            target: 'self',
            statuses: [
              { kind: 'invisible', duration: 6 },
              { kind: 'speed', duration: 6, magnitude: 1.3 },
            ],
          },
        ],
      },
    });
    const engine = arena(players('wisp', 'mira'));
    const sneak = engine.brawlers[0];
    sneak.superCharge = 100;

    engine.setPlayerInput('p0', idle({ superAttack: true }));
    engine.update(FIXED_DT);

    expect(sneak.invisibilityTimer).toBeGreaterThan(5);
    expect(sneak.speedBoostTimer).toBeGreaterThan(5);
    expect(sneak.speedBoostMagnitude).toBeCloseTo(1.3, 5);
  });

  it('fires a cooldown passive once, then holds it', () => {
    fixture('mira', {
      passives: [
        {
          name: 'Sargi',
          trigger: 'lowHealth',
          threshold: 0.4,
          cooldown: 15,
          actions: [{ type: 'heal', target: 'self', amount: 1800 }],
        },
      ],
    });
    const engine = arena(players('mira', 'rivet'));
    const medic = engine.brawlers[0];
    medic.hp = medic.maxHp * 0.3;

    engine.setPlayerInput('p0', idle());
    engine.update(FIXED_DT);
    const afterHeal = medic.hp;

    expect(afterHeal).toBeGreaterThan(medic.maxHp * 0.3);
    expect(medic.passiveCooldowns['Sargi']).toBeGreaterThan(0);

    // Dropped low again inside the cooldown, it must not heal a second time.
    medic.hp = medic.maxHp * 0.2;
    run(engine, 1.0);
    expect(medic.hp).toBeLessThan(medic.maxHp * 0.35);
  });

  it('heals a continuous passive by the second, not by the tick', () => {
    fixture('wisp', {
      super: {
        name: 'smoke',
        actions: [{ type: 'status', target: 'self', statuses: [{ kind: 'invisible', duration: 6 }] }],
      },
      passives: [
        {
          name: 'Gizli Sifa',
          trigger: 'whileInvisible',
          perSecond: true,
          actions: [{ type: 'heal', target: 'self', amount: 700 }],
        },
      ],
    });
    const engine = arena(players('wisp', 'mira'));
    const sneak = engine.brawlers[0];
    sneak.hp = 1000;
    sneak.superCharge = 100;
    engine.setPlayerInput('p0', idle({ superAttack: true }));
    engine.update(FIXED_DT);

    engine.setPlayerInput('p0', idle());
    run(engine, 1.0);

    // 700 a second, plus the out-of-combat trickle. Framerate-dependent
    // healing would be sixty times this.
    expect(sneak.hp).toBeGreaterThan(1600);
    expect(sneak.hp).toBeLessThan(2100);
  });

  it('keeps a rooted brawler in place while it can still shoot', () => {
    const engine = arena(players('mira', 'rivet'));
    const b = engine.brawlers[0];
    place(b, 400, 400);
    b.rootTimer = 1.0;

    engine.setPlayerInput('p0', idle({ moveX: 1, attack: true }));
    run(engine, 0.3);

    expect(Math.abs(b.x - 400)).toBeLessThan(2);
    expect(engine.projectiles.length).toBeGreaterThan(0);
  });

  it('stops a silenced brawler from using its Super', () => {
    const engine = arena(players('wisp', 'mira'));
    const b = engine.brawlers[0];
    b.superCharge = 100;
    b.silenceTimer = 1.0;

    engine.setPlayerInput('p0', idle({ superAttack: true }));
    engine.update(FIXED_DT);

    expect(b.superCharge).toBe(100);
    expect(b.invisibilityTimer).toBe(0);
  });

  it('spends a shield before it touches health', () => {
    const engine = arena(players('rivet', 'boulder'));
    const [shooter, victim] = engine.brawlers;
    place(shooter, 400, 400);
    place(victim, 500, 400);
    victim.shieldHp = 10000;
    victim.shieldTimer = 10;
    const before = victim.hp;

    engine.setPlayerInput('p0', idle({ attack: true }));
    run(engine, 0.6);

    expect(victim.hp).toBe(before);
    expect(victim.shieldHp).toBeLessThan(10000);
  });
});
