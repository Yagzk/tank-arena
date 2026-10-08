import { describe, expect, it } from 'vitest';
import { createBrawlerEntity } from '../sim/entity';
import type { BrawlSnapshot, BrawlerEntity, BrawlGameMode, BrawlerId } from '../types/brawl';
import { computeResults } from './results';

function brawler(id: string, team: number, over: Partial<BrawlerEntity> = {}): BrawlerEntity {
  const b = createBrawlerEntity({
    id,
    name: id.toUpperCase(),
    brawlerId: 'mira' as BrawlerId,
    team,
    x: 0,
    y: 0,
  });
  return Object.assign(b, over);
}

function snapshot(
  mode: BrawlGameMode,
  brawlers: BrawlerEntity[],
  over: Partial<BrawlSnapshot> = {}
): BrawlSnapshot {
  return {
    phase: 'match_end',
    mode,
    matchTimer: 100,
    countdownTimer: 0,
    countdownTeam: null,
    winnerTeam: null,
    winnerPlayerId: null,
    starPlayerId: null,
    brawlers,
    projectiles: [],
    deployables: [],
    thornFields: [],
    boxes: [],
    powerCubes: [],
    gems: [],
    bushes: [],
    walls: [],
    poisonGas: { inset: 0, damageTimer: 0, isActive: false },
    floatingNumbers: [],
    killFeed: [],
    eliminationOrder: [],
    introCountdown: 0,
    mapName: '',
    teamScores: [],
    scoreLimit: null,
    timeLeft: null,
    round: 1,
    roundWins: [],
    roundsToWin: null,
    zone: null,
    ball: null,
    goals: [],
    goalTeam: null,
    safes: [],
    ...over,
  };
}

describe('Showdown placement', () => {
  // d is out first, then c, then b; a is the last one standing.
  const four = () =>
    snapshot('showdown', [brawler('a', 0), brawler('b', 1), brawler('c', 2), brawler('d', 3)], {
      winnerPlayerId: 'a',
      eliminationOrder: ['d', 'c', 'b'],
    });

  it('puts the survivor first and the earliest casualty last', () => {
    const { rows } = computeResults(four(), 'a');
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.map(r => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('tells you where you finished', () => {
    expect(computeResults(four(), 'c').myRank).toBe(3);
    expect(computeResults(four(), 'c').title).toBe('3. SIRA');
  });

  it('calls a win a win, and only for the winner', () => {
    const win = computeResults(four(), 'a');
    expect(win.isWin).toBe(true);
    expect(win.title).toBe('ZAFER!');

    const loss = computeResults(four(), 'b');
    expect(loss.isWin).toBe(false);
    // Second place is not a win. This is what stopped the old screen from
    // throwing confetti at somebody who had just lost.
    expect(loss.title).toBe('2. SIRA');
  });

  it('marks exactly one winner', () => {
    expect(computeResults(four(), 'a').rows.filter(r => r.isWinner).map(r => r.id)).toEqual(['a']);
  });

  it('ranks everyone when nobody is left standing', () => {
    // Two eliminated on the same tick: no survivor, but still a full ranking.
    const s = snapshot('showdown', [brawler('a', 0), brawler('b', 1), brawler('c', 2)], {
      winnerPlayerId: null,
      eliminationOrder: ['c', 'a', 'b'],
    });
    const result = computeResults(s, 'a');
    expect(result.rows.map(r => r.id)).toEqual(['b', 'a', 'c']);
    expect(result.isWin).toBe(false);
  });

  it('places someone the elimination list missed by what they achieved', () => {
    const s = snapshot(
      'showdown',
      [brawler('a', 0), brawler('b', 1, { kills: 5 }), brawler('c', 2, { kills: 1 })],
      { winnerPlayerId: 'a', eliminationOrder: [] }
    );
    expect(computeResults(s, 'a').rows.map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('leaves a decoy off the scoreboard', () => {
    const s = four();
    s.brawlers.push(brawler('decoy', 0, { isClone: true }));
    const result = computeResults(s, 'a');
    expect(result.total).toBe(4);
    expect(result.rows.some(r => r.id === 'decoy')).toBe(false);
  });

  it('says so when you were only watching', () => {
    const result = computeResults(four(), 'nobody');
    expect(result.myRank).toBeNull();
    expect(result.title).toBe('MAÇ BİTTİ');
    expect(result.isWin).toBe(false);
  });

  it('flags the star player', () => {
    const s = four();
    s.starPlayerId = 'a';
    expect(computeResults(s, 'b').rows.find(r => r.isStar)?.id).toBe('a');
  });
});

describe('team results', () => {
  const teams = (winner: number | null) =>
    snapshot(
      'gem_grab',
      [
        brawler('a', 0, { gemsCarried: 4, kills: 1 }),
        brawler('b', 0, { gemsCarried: 1, kills: 0 }),
        brawler('c', 1, { gemsCarried: 9, kills: 3 }),
        brawler('d', 1, { gemsCarried: 0, kills: 0 }),
      ],
      { winnerTeam: winner }
    );

  it('lists the winning side first, whoever on the losing side did better', () => {
    const { rows } = computeResults(teams(0), 'a');
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('orders each side by what its members contributed', () => {
    const { rows } = computeResults(teams(1), 'a');
    expect(rows.map(r => r.id)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('wins and loses with the team', () => {
    expect(computeResults(teams(0), 'b').isWin).toBe(true);
    expect(computeResults(teams(0), 'b').title).toBe('ZAFER!');
    expect(computeResults(teams(0), 'c').isWin).toBe(false);
    expect(computeResults(teams(0), 'c').title).toBe('YENİLGİ');
  });

  it('marks every member of the winning side as a winner', () => {
    const winners = computeResults(teams(0), 'a').rows.filter(r => r.isWinner);
    expect(winners.map(r => r.id).sort()).toEqual(['a', 'b']);
  });

  it('calls it a draw when nobody won', () => {
    const result = computeResults(teams(null), 'a');
    expect(result.title).toBe('BERABERE');
    expect(result.isWin).toBe(false);
    expect(result.rows.some(r => r.isWinner)).toBe(false);
  });
});
