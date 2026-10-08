/**
 * What each game mode is, as data, and the rules that score it.
 *
 * The engine used to branch on `mode === 'gem_grab'` in half a dozen places,
 * which made a third mode a hunt for every one of them. A mode is now a
 * definition — how players are grouped, whether people come back, what ends
 * the round — and the rules that decide who is winning are plain functions of
 * the scores, so they can be tested without running a match.
 *
 * Deliberately free of any import but types, so the server, the map validator
 * and the client can all read it.
 */

import type { BrawlGameMode } from '../types/brawl';

export const MODE_IDS: readonly BrawlGameMode[] = [
  'showdown',
  'duo_showdown',
  'gem_grab',
  'brawl_ball',
  'wipeout',
  'knockout',
  'hot_zone',
  'bounty',
  'heist',
];

/** Which family of maps a mode is played on. */
export type MapKind = 'arena' | 'sides';

/** How players are grouped into teams. */
export type Grouping = 'solo' | 'pairs' | 'sides';

export interface ModeDefinition {
  id: BrawlGameMode;
  name: string;
  tagline: string;
  icon: string;
  grouping: Grouping;
  mapKind: MapKind;
  /** Seconds before a downed brawler returns. Zero means death is final. */
  respawnDelay: number;
  /** Seconds of protection on return. */
  respawnImmunity: number;
  /** Fraction of the Super bar kept through a death. */
  superRetention: number;
  /** The arena closes in on the survivors. */
  gas: boolean;
  /** Boxes hold power cubes, and the fallen drop them. */
  powerCubes: boolean;
  /** Seconds the match may run before the score decides it. Absent means no limit. */
  timeLimit?: number;
  /** Score that wins outright. Absent means the mode is not decided by a score. */
  scoreLimit?: number;
  /** Rounds to win, for a mode played in rounds. */
  roundsToWin?: number;
  /** The mode has a ball and two goals, and needs a map that provides them. */
  usesBall?: boolean;
  /** The mode has a safe to defend and one to break, in the map's goal tiles. */
  usesSafes?: boolean;
}

export const MODES: Record<BrawlGameMode, ModeDefinition> = {
  showdown: {
    id: 'showdown',
    name: 'HESAPLAŞMA',
    tagline: 'Kutular, zehirli gaz, son kalan kazanır',
    icon: '💀',
    grouping: 'solo',
    mapKind: 'arena',
    respawnDelay: 0,
    respawnImmunity: 0,
    superRetention: 0,
    gas: true,
    powerCubes: true,
  },
  duo_showdown: {
    id: 'duo_showdown',
    name: 'İKİLİ HESAPLAŞMA',
    tagline: 'İki kişilik takımlar, son kalan takım kazanır',
    icon: '🤝',
    grouping: 'pairs',
    mapKind: 'arena',
    respawnDelay: 0,
    respawnImmunity: 0,
    superRetention: 0,
    gas: true,
    powerCubes: true,
  },
  gem_grab: {
    id: 'gem_grab',
    name: 'ELMAS KAPMACA',
    tagline: '10 elması topla ve geri sayımı başlat',
    icon: '💎',
    grouping: 'sides',
    mapKind: 'sides',
    respawnDelay: 3,
    respawnImmunity: 1.5,
    superRetention: 0.25,
    gas: false,
    powerCubes: false,
  },
  brawl_ball: {
    id: 'brawl_ball',
    name: 'BRAWL BALL',
    tagline: 'Topu karşı kaleye sok, ilk iki gol kazanır',
    icon: '⚽',
    grouping: 'sides',
    mapKind: 'sides',
    respawnDelay: 3,
    respawnImmunity: 1.5,
    superRetention: 0.25,
    gas: false,
    powerCubes: false,
    timeLimit: 120,
    scoreLimit: 2,
    usesBall: true,
  },
  wipeout: {
    id: 'wipeout',
    name: 'YOK ETME',
    tagline: 'Rakibi daha çok elen takım kazanır',
    icon: '⚔️',
    grouping: 'sides',
    mapKind: 'sides',
    respawnDelay: 3,
    respawnImmunity: 1.5,
    superRetention: 0.25,
    gas: false,
    powerCubes: false,
    timeLimit: 120,
    scoreLimit: 15,
  },
  knockout: {
    id: 'knockout',
    name: 'NAKAVT',
    tagline: 'Canlanma yok. İki tur kazanan takım kazanır',
    icon: '🥊',
    grouping: 'sides',
    mapKind: 'sides',
    respawnDelay: 0,
    respawnImmunity: 0,
    superRetention: 0,
    gas: false,
    powerCubes: false,
    roundsToWin: 2,
    // A round that drags on is decided by health, so it cannot be camped out.
    timeLimit: 90,
  },
  bounty: {
    id: 'bounty',
    name: 'ÖDÜL AVI',
    tagline: 'Kafası değerli olanı indir, yıldızları topla',
    icon: '⭐',
    grouping: 'sides',
    mapKind: 'sides',
    respawnDelay: 3,
    respawnImmunity: 1.5,
    superRetention: 0.25,
    gas: false,
    powerCubes: false,
    timeLimit: 120,
  },
  heist: {
    id: 'heist',
    name: 'SOYGUN',
    tagline: 'Rakibin kasasını kır, kendininkini koru',
    icon: '🔐',
    grouping: 'sides',
    mapKind: 'sides',
    respawnDelay: 3,
    respawnImmunity: 1.5,
    superRetention: 0.25,
    gas: false,
    powerCubes: false,
    timeLimit: 120,
    usesSafes: true,
  },
  hot_zone: {
    id: 'hot_zone',
    name: 'SICAK BÖLGE',
    tagline: 'Bölgeyi tut, puan topla',
    icon: '🔥',
    grouping: 'sides',
    mapKind: 'sides',
    respawnDelay: 3,
    respawnImmunity: 1.5,
    superRetention: 0.25,
    gas: false,
    powerCubes: false,
    timeLimit: 150,
    scoreLimit: 100,
  },
};

/** The most stars one brawler's head can be worth in Bounty. */
export const MAX_BOUNTY = 7;

/**
 * What a kill is worth in Bounty, and what the two sides' bounties become.
 *
 * The one downed pays out what they were worth and goes back to the base
 * price; the one who downed them becomes worth a star more, up to a ceiling.
 * That is the whole catch-up and snowball rule in one place: a streak makes
 * you a target, and the target's death makes up for a lot.
 */
export function bountyPayout(victimBounty: number, killerBounty: number): { stars: number; killer: number; victim: number } {
  return { stars: victimBounty, killer: Math.min(MAX_BOUNTY, killerBounty + 1), victim: 1 };
}

export function isTeamMode(mode: BrawlGameMode): boolean {
  return MODES[mode].grouping !== 'solo';
}

/** The team a player belongs to, from their place in the roster. */
export function teamFor(mode: BrawlGameMode, index: number): number {
  switch (MODES[mode].grouping) {
    case 'solo':
      return index;
    case 'pairs':
      return Math.floor(index / 2);
    case 'sides':
      return index % 2;
  }
}

/* ---------------------------------------------------------------- *
 * Who is winning.
 * ---------------------------------------------------------------- */

export interface Standing {
  /** The team that has won, or null if it is not decided yet. */
  winner: number | null;
  /** True when the match is over and nobody won. */
  draw: boolean;
}

/**
 * Decides a score-based match.
 *
 * The score limit wins immediately. Otherwise, when time runs out the higher
 * score wins, and a tie is a draw — not a coin flip, and not an arbitrary
 * first team.
 */
export function decideByScore(
  scores: readonly number[],
  scoreLimit: number | undefined,
  timeUp: boolean
): Standing {
  if (scoreLimit !== undefined) {
    for (let team = 0; team < scores.length; team++) {
      if (scores[team] >= scoreLimit) {
        // Both over the line on the same tick: the higher one still wins.
        const best = Math.max(...scores);
        const leaders = scores.filter(s => s === best).length;
        return leaders === 1 ? { winner: scores.indexOf(best), draw: false } : { winner: null, draw: true };
      }
    }
  }
  if (!timeUp) return { winner: null, draw: false };

  const best = Math.max(...scores);
  const leaders = scores.filter(s => s === best).length;
  return leaders === 1 ? { winner: scores.indexOf(best), draw: false } : { winner: null, draw: true };
}

/** How close, in world units, you must be to see somebody standing in a bush: two tiles. */
export const BUSH_SIGHT = 120;

/** How close an invisible body must be to be seen anyway: four tiles. */
export const INVISIBLE_SIGHT = 240;

/** Health a safe starts with. */
export const SAFE_HP = 24000;

/**
 * Decides a Heist from how much of each safe is left, as a fraction.
 *
 * A safe that is broken ends it at once, in favour of the other side. When
 * time runs out, the side whose safe is in better shape wins; level is a draw.
 */
export function decideHeist(safeFraction: readonly number[], timeUp: boolean): Standing {
  const broken = safeFraction.map((f, team) => (f <= 0 ? team : -1)).filter(t => t >= 0);
  if (broken.length >= 2) return { winner: null, draw: true };
  if (broken.length === 1) return { winner: safeFraction.findIndex((_, t) => t !== broken[0]), draw: false };
  if (!timeUp) return { winner: null, draw: false };

  const best = Math.max(...safeFraction);
  const leaders = safeFraction.filter(f => f === best).length;
  return leaders === 1 ? { winner: safeFraction.indexOf(best), draw: false } : { winner: null, draw: true };
}

/**
 * Decides one round of Knockout: whichever side still has anybody standing.
 * Both sides wiped out together is a drawn round, which counts for neither.
 */
export function decideRound(
  alivePerTeam: readonly number[],
  hpPerTeam: readonly number[],
  timeUp: boolean
): Standing {
  const standing = alivePerTeam.map((n, team) => (n > 0 ? team : -1)).filter(t => t >= 0);
  if (standing.length === 0) return { winner: null, draw: true };
  if (standing.length === 1) return { winner: standing[0], draw: false };
  if (!timeUp) return { winner: null, draw: false };

  // Time is up with both sides alive: the one that is in better shape wins.
  const byAlive = alivePerTeam.indexOf(Math.max(...alivePerTeam));
  const aliveLeaders = alivePerTeam.filter(n => n === Math.max(...alivePerTeam)).length;
  if (aliveLeaders === 1) return { winner: byAlive, draw: false };

  const bestHp = Math.max(...hpPerTeam);
  const hpLeaders = hpPerTeam.filter(h => h === bestHp).length;
  return hpLeaders === 1 ? { winner: hpPerTeam.indexOf(bestHp), draw: false } : { winner: null, draw: true };
}

/**
 * Which side, if any, is scoring from a zone this tick.
 *
 * Only one team inside scores. Both inside is a contest, and contested ground
 * is worth nothing to either: that is what makes it worth fighting over
 * instead of simply standing in.
 */
export function zoneController(insidePerTeam: readonly number[]): number | null {
  const present = insidePerTeam.map((n, team) => (n > 0 ? team : -1)).filter(t => t >= 0);
  return present.length === 1 ? present[0] : null;
}
