import { describe, expect, it } from 'vitest';
import { BrawlEngine } from './brawlEngine';
import { FIXED_DT } from '../core/loop';
import { MODES } from './modes';
import type { BrawlerEntity, BrawlGameMode, BrawlPlayerInput, PlayerInfo } from '../types/brawl';

function roster(count: number): PlayerInfo[] {
  const brawlers = ['mira', 'rivet', 'boulder', 'fuse', 'thorn', 'wisp', 'zirh', 'nagme'] as const;
  return Array.from({ length: count }, (_, i) => ({
    id: 'p' + i,
    name: 'P' + i,
    brawler: brawlers[i % brawlers.length],
    team: i,
    isHost: i === 0,
    score: 0,
    trophies: 0,
  }));
}

function idle(): BrawlPlayerInput {
  return { moveX: 0, moveY: 0, aimAngle: 0, attack: false, superAttack: false };
}

/** A match that is past its countdown, with every body standing still. */
function start(mode: BrawlGameMode, count = 6, keepLevel = false): BrawlEngine {
  const engine = new BrawlEngine();
  engine.initMatch(roster(count), mode, 21);
  engine.phase = 'playing';
  engine.matchTimer = 0;
  if (!keepLevel) {
    engine.walls = [];
    engine.boxes = [];
    engine.bushes = [];
  }
  engine.poisonGas.isActive = false;
  for (const b of engine.brawlers) engine.setPlayerInput(b.id, idle());
  return engine;
}

function run(engine: BrawlEngine, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) engine.update(FIXED_DT);
}

type Damager = { damageBrawler(b: BrawlerEntity, amount: number, killerId: string): void };

/** Kills `victim` through the real damage path, crediting `killer`. */
function kill(engine: BrawlEngine, victim: BrawlerEntity, killer: BrawlerEntity): void {
  victim.shieldHp = 0;
  victim.immunityTimer = 0;
  (engine as unknown as Damager).damageBrawler(victim, 999999, killer.id);
}

function team(engine: BrawlEngine, t: number): BrawlerEntity[] {
  return engine.brawlers.filter(b => b.team === t);
}

describe('who is on whose side', () => {
  it('pairs players up in Duo Showdown', () => {
    const engine = start('duo_showdown', 6);
    expect(engine.brawlers.map(b => b.team)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('starts the two members of a pair beside each other, and the pairs apart', () => {
    const engine = start('duo_showdown', 6, true);
    for (const t of [0, 1, 2]) {
      const [a, b] = team(engine, t);
      expect(Math.hypot(a.x - b.x, a.y - b.y), 'pair ' + t).toBeLessThan(80);
    }
    const [a0] = team(engine, 0);
    const [a1] = team(engine, 1);
    expect(Math.hypot(a0.x - a1.x, a0.y - a1.y)).toBeGreaterThan(300);
  });

  it('splits two-sided modes down the middle, each side in its own half', () => {
    for (const mode of ['wipeout', 'knockout', 'hot_zone', 'gem_grab'] as const) {
      const engine = start(mode, 6, true);
      const left = team(engine, 0);
      const right = team(engine, 1);
      expect(left.length, mode).toBe(3);
      for (const b of left) expect(b.x, mode).toBeLessThan(1200);
      for (const b of right) expect(b.x, mode).toBeGreaterThan(1200);
    }
  });

  it('does not let partners hurt each other', () => {
    const engine = start('duo_showdown', 4);
    const [a, partner] = team(engine, 0);
    a.x = 600;
    a.y = 600;
    partner.x = 720;
    partner.y = 600;
    const before = partner.hp;
    engine.setPlayerInput(a.id, { ...idle(), attack: true, aimAngle: 0 });
    run(engine, 0.6);
    expect(partner.hp).toBe(before);
  });
});

describe('Duo Showdown', () => {
  it('goes on while two teams still have somebody', () => {
    const engine = start('duo_showdown', 6);
    kill(engine, team(engine, 0)[0], team(engine, 1)[0]);
    run(engine, 0.2);
    expect(engine.phase).toBe('playing');
  });

  it('is won by the last team standing, even with one member down', () => {
    const engine = start('duo_showdown', 6);
    // Team 0 loses one; teams 1 and 2 are wiped out. Team 0 wins with one left.
    kill(engine, team(engine, 0)[0], team(engine, 2)[0]);
    for (const b of [...team(engine, 1), ...team(engine, 2)]) kill(engine, b, team(engine, 0)[1]);
    run(engine, 0.2);

    expect(engine.phase).toBe('match_end');
    expect(engine.winnerTeam).toBe(0);
    expect(engine.starPlayerId).toBe(team(engine, 0)[1].id);
  });

  it('does not bring anybody back', () => {
    const engine = start('duo_showdown', 6);
    const victim = team(engine, 0)[0];
    kill(engine, victim, team(engine, 1)[0]);
    run(engine, 6);
    expect(victim.isAlive).toBe(false);
  });
});

describe('Wipeout', () => {
  it('scores a point for the side that makes a kill', () => {
    const engine = start('wipeout', 6);
    kill(engine, team(engine, 1)[0], team(engine, 0)[0]);
    expect(engine.teamScores).toEqual([1, 0]);
    kill(engine, team(engine, 0)[1], team(engine, 1)[1]);
    expect(engine.teamScores).toEqual([1, 1]);
  });

  it('gives nothing for a death with nobody to credit', () => {
    const engine = start('wipeout', 6);
    const victim = team(engine, 0)[0];
    victim.hp = 1;
    victim.burnTimer = 1;
    victim.burnDamagePerSec = 9000;
    run(engine, 0.2);
    expect(victim.isAlive).toBe(false);
    expect(engine.teamScores).toEqual([0, 0]);
  });

  it('brings the fallen back, which is why it is a score and not a last-man-standing', () => {
    const engine = start('wipeout', 6);
    const victim = team(engine, 1)[0];
    kill(engine, victim, team(engine, 0)[0]);
    expect(victim.respawnTimer).toBeGreaterThan(0);
    run(engine, 3.3);
    expect(victim.isAlive).toBe(true);
  });

  it('is won at the score limit', () => {
    const engine = start('wipeout', 6);
    const limit = MODES.wipeout.scoreLimit!;
    for (let i = 0; i < limit; i++) {
      const victim = team(engine, 1)[0];
      victim.isAlive = true;
      kill(engine, victim, team(engine, 0)[0]);
    }
    run(engine, 0.1);
    expect(engine.phase).toBe('match_end');
    expect(engine.winnerTeam).toBe(0);
  });

  it('goes to the leader when time runs out', () => {
    const engine = start('wipeout', 6);
    kill(engine, team(engine, 0)[0], team(engine, 1)[0]);
    engine.matchTimer = MODES.wipeout.timeLimit! + 0.1;
    run(engine, 0.1);
    expect(engine.phase).toBe('match_end');
    expect(engine.winnerTeam).toBe(1);
  });

  it('is a draw when time runs out level', () => {
    const engine = start('wipeout', 6);
    engine.matchTimer = MODES.wipeout.timeLimit! + 0.1;
    run(engine, 0.1);
    expect(engine.phase).toBe('match_end');
    expect(engine.winnerTeam).toBeNull();
  });
});

describe('Hot Zone', () => {
  function zoneOf(engine: BrawlEngine) {
    const zone = engine.zone;
    if (!zone) throw new Error('no zone');
    return zone;
  }

  it('puts a zone in the middle of the map, and only in this mode', () => {
    const engine = start('hot_zone', 6, true);
    const zone = zoneOf(engine);
    expect(zone.x).toBeCloseTo(1200, 0);
    expect(zone.radius).toBeGreaterThan(80);
    expect(start('wipeout', 6).zone).toBeNull();
  });

  it('scores for the side that holds it alone', () => {
    const engine = start('hot_zone', 6);
    const zone = zoneOf(engine);
    const holder = team(engine, 0)[0];
    holder.x = zone.x;
    holder.y = zone.y;
    run(engine, 5);
    expect(engine.teamScores[0]).toBeGreaterThanOrEqual(4);
    expect(engine.teamScores[1]).toBe(0);
    expect(zone.controller).toBe(0);
  });

  it('scores for nobody while it is contested', () => {
    const engine = start('hot_zone', 6);
    const zone = zoneOf(engine);
    const a = team(engine, 0)[0];
    const b = team(engine, 1)[0];
    a.x = zone.x - 30;
    a.y = zone.y;
    b.x = zone.x + 30;
    b.y = zone.y;
    // Stand them where nothing can hurt them, so the contest is the only thing going on.
    a.immunityTimer = 100;
    b.immunityTimer = 100;
    run(engine, 4);
    expect(engine.teamScores).toEqual([0, 0]);
    expect(zone.controller).toBeNull();
  });

  it('scores for nobody while it is empty', () => {
    const engine = start('hot_zone', 6);
    run(engine, 3);
    expect(engine.teamScores).toEqual([0, 0]);
  });

  it('does not score for a body that has been knocked out of it', () => {
    const engine = start('hot_zone', 6);
    const zone = zoneOf(engine);
    const holder = team(engine, 0)[0];
    holder.x = zone.x;
    holder.y = zone.y;
    kill(engine, holder, team(engine, 1)[0]);
    run(engine, 2);
    expect(engine.teamScores[0]).toBe(0);
  });

  it('is won at the score limit', () => {
    const engine = start('hot_zone', 6);
    const zone = zoneOf(engine);
    const holder = team(engine, 1)[0];
    holder.x = zone.x;
    holder.y = zone.y;
    engine.teamScores[1] = MODES.hot_zone.scoreLimit! - 0.5;
    run(engine, 1);
    expect(engine.phase).toBe('match_end');
    expect(engine.winnerTeam).toBe(1);
  });

  it('keeps the score of a held zone going across the clock', () => {
    const engine = start('hot_zone', 6);
    expect(engine.getSnapshot().timeLeft).toBeCloseTo(MODES.hot_zone.timeLimit!, 0);
    run(engine, 2);
    expect(engine.getSnapshot().timeLeft!).toBeLessThan(MODES.hot_zone.timeLimit!);
  });
});

describe('bots and the zone', () => {
  it('go to the zone and hold it, instead of only hunting each other', () => {
    const engine = new BrawlEngine();
    engine.initMatch(
      roster(6).map(p => ({ ...p, isBot: true })),
      'hot_zone',
      9
    );
    engine.phase = 'playing';
    engine.matchTimer = 0;
    run(engine, 30);

    // Somebody scored from it, which means somebody stood in it alone.
    expect(engine.teamScores[0] + engine.teamScores[1]).toBeGreaterThan(0);
  });

  it('do not spend their ammo on the empty ground they are walking toward', () => {
    const engine = new BrawlEngine();
    engine.initMatch(
      roster(4).map(p => ({ ...p, isBot: true })),
      'hot_zone',
      9
    );
    engine.phase = 'playing';
    engine.matchTimer = 0;
    // Far from the enemy and far from the zone: nothing to shoot yet.
    for (const b of engine.brawlers) {
      b.immunityTimer = 100;
    }
    run(engine, 1);
    // Nobody is fighting anybody this early, so nothing should be in the air.
    expect(engine.projectiles.length).toBe(0);
  });
});

describe('Knockout', () => {
  function wipeOut(engine: BrawlEngine, losing: number, by: number) {
    const killer = team(engine, by)[0];
    for (const b of team(engine, losing)) {
      if (b.isAlive) kill(engine, b, killer);
    }
  }

  it('does not bring anybody back inside a round', () => {
    const engine = start('knockout', 6);
    const victim = team(engine, 0)[0];
    kill(engine, victim, team(engine, 1)[0]);
    run(engine, 4);
    expect(victim.isAlive).toBe(false);
  });

  it('lets a decided round play on for a moment before closing it', () => {
    const engine = start('knockout', 6);
    wipeOut(engine, 1, 0);
    run(engine, 0.3);
    // Decided, but not yet counted or reset: the kill is still on screen.
    expect(engine.roundWins).toEqual([0, 0]);
    expect(engine.round).toBe(1);
  });

  it('counts the round for the side left standing and starts the next', () => {
    const engine = start('knockout', 6);
    wipeOut(engine, 1, 0);
    run(engine, 2.2);

    expect(engine.roundWins).toEqual([1, 0]);
    expect(engine.round).toBe(2);
    expect(engine.phase).toBe('starting');
  });

  it('puts everyone back on their feet for the next round, at their own bases', () => {
    const engine = start('knockout', 6, true);
    const starts = engine.brawlers.map(b => ({ x: b.x, y: b.y }));
    wipeOut(engine, 1, 0);
    team(engine, 0)[0].x = 777;
    run(engine, 2.2);

    engine.brawlers.forEach((b, i) => {
      expect(b.isAlive, b.id).toBe(true);
      expect(b.hp, b.id).toBe(b.maxHp);
      expect(b.x, b.id).toBeCloseTo(starts[i].x, 5);
      expect(b.y, b.id).toBeCloseTo(starts[i].y, 5);
    });
  });

  it('rebuilds the level, so cover broken in one round is back in the next', () => {
    const engine = start('knockout', 6, true);
    const before = engine.walls.length;
    // Whatever the map is made of, some of it is gone by the end of a round.
    engine.walls = engine.walls.slice(5);
    expect(engine.walls.length).toBeLessThan(before);

    wipeOut(engine, 1, 0);
    run(engine, 2.2);
    expect(engine.walls.length).toBe(before);
  });

  it('freezes everybody for the countdown that opens the next round', () => {
    const engine = start('knockout', 6);
    wipeOut(engine, 1, 0);
    run(engine, 2.2);
    const mover = team(engine, 0)[0];
    const x = mover.x;
    engine.setPlayerInput(mover.id, { ...idle(), moveX: 1 });
    run(engine, 1);
    expect(mover.x).toBe(x);
    expect(engine.getSnapshot().introCountdown).toBeGreaterThan(0);
  });

  it('is won by the first side to take two rounds', () => {
    const engine = start('knockout', 6);
    wipeOut(engine, 1, 0);
    run(engine, 2.2);
    engine.phase = 'playing';

    wipeOut(engine, 1, 0);
    run(engine, 2.2);

    expect(engine.roundWins).toEqual([2, 0]);
    expect(engine.phase).toBe('match_end');
    expect(engine.winnerTeam).toBe(0);
  });

  it('goes the distance when the rounds are split', () => {
    const engine = start('knockout', 6);
    wipeOut(engine, 1, 0);
    run(engine, 2.2);
    engine.phase = 'playing';
    wipeOut(engine, 0, 1);
    run(engine, 2.2);

    expect(engine.roundWins).toEqual([1, 1]);
    expect(engine.round).toBe(3);
    expect(engine.phase).toBe('starting');
  });

  it('gives a timed-out round to the healthier side, so it cannot be won by hiding', () => {
    const engine = start('knockout', 6);
    for (const b of team(engine, 1)) b.hp = 100;
    engine.matchTimer = MODES.knockout.timeLimit! + 0.1;
    run(engine, 2.2);
    expect(engine.roundWins).toEqual([1, 0]);
  });

  it('does not count a round both sides lose together', () => {
    const engine = start('knockout', 6);
    for (const b of engine.brawlers) {
      b.isAlive = false;
      b.hp = 0;
    }
    run(engine, 2.2);
    expect(engine.roundWins).toEqual([0, 0]);
    expect(engine.round).toBe(2);
  });

  it('reports the round and the wins to the screen', () => {
    const engine = start('knockout', 6);
    wipeOut(engine, 1, 0);
    run(engine, 2.2);
    const snap = engine.getSnapshot();
    expect(snap.round).toBe(2);
    expect(snap.roundWins).toEqual([1, 0]);
    expect(snap.roundsToWin).toBe(2);
  });
});

describe('what the modes share', () => {
  it('keeps power cubes in the modes that have them and out of the ones that do not', () => {
    for (const mode of ['showdown', 'duo_showdown'] as const) {
      expect(start(mode, 6, true).boxes.length, mode).toBeGreaterThan(0);
    }
    for (const mode of ['gem_grab', 'wipeout', 'knockout', 'hot_zone'] as const) {
      expect(start(mode, 6, true).boxes.length, mode).toBe(0);
    }
  });

  it('runs the gas only where nobody comes back', () => {
    for (const mode of ['showdown', 'duo_showdown'] as const) {
      const engine = new BrawlEngine();
      engine.initMatch(roster(6), mode, 3);
      expect(engine.poisonGas.isActive, mode).toBe(true);
    }
    for (const mode of ['gem_grab', 'wipeout', 'knockout', 'hot_zone'] as const) {
      const engine = new BrawlEngine();
      engine.initMatch(roster(6), mode, 3);
      expect(engine.poisonGas.isActive, mode).toBe(false);
    }
  });

  it('plays every mode on a map made for it', () => {
    for (const mode of Object.keys(MODES) as BrawlGameMode[]) {
      const engine = new BrawlEngine();
      engine.initMatch(roster(6), mode, 5);
      expect(engine.mapName.length, mode).toBeGreaterThan(2);
      for (const b of engine.brawlers) {
        expect(Number.isFinite(b.x) && Number.isFinite(b.y), mode + ' ' + b.id).toBe(true);
      }
    }
  });

  it('survives a full match of bots in every mode without throwing', () => {
    for (const mode of Object.keys(MODES) as BrawlGameMode[]) {
      const engine = new BrawlEngine();
      engine.initMatch(
        roster(6).map(p => ({ ...p, isBot: true })),
        mode,
        9
      );
      expect(() => run(engine, 40), mode).not.toThrow();
    }
  });
});
