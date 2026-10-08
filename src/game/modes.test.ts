import { describe, expect, it } from 'vitest';
import {
  MODES,
  MODE_IDS,
  decideByScore,
  decideRound,
  isTeamMode,
  teamFor,
  zoneController,
} from './modes';

describe('the mode table', () => {
  it('defines every mode the game lists', () => {
    for (const id of MODE_IDS) expect(MODES[id].id).toBe(id);
    expect(Object.keys(MODES).sort()).toEqual([...MODE_IDS].sort());
  });

  it('gives every mode a name a player can read', () => {
    for (const id of MODE_IDS) {
      expect(MODES[id].name.length, id).toBeGreaterThan(3);
      expect(MODES[id].tagline.length, id).toBeGreaterThan(8);
    }
  });

  it('lets people come back only where the mode says so', () => {
    expect(MODES.showdown.respawnDelay).toBe(0);
    expect(MODES.duo_showdown.respawnDelay).toBe(0);
    expect(MODES.knockout.respawnDelay).toBe(0);
    for (const id of ['gem_grab', 'wipeout', 'hot_zone'] as const) {
      expect(MODES[id].respawnDelay, id).toBeGreaterThan(0);
      expect(MODES[id].respawnImmunity, id).toBeGreaterThan(0);
    }
  });

  it('puts the gas only where nobody comes back', () => {
    // The gas is what forces a fight to end. Where people respawn, it would
    // punish dying twice.
    for (const id of MODE_IDS) {
      if (MODES[id].gas) expect(MODES[id].respawnDelay, id).toBe(0);
    }
  });

  it('plays the arena modes on arena maps and the rest on two-sided ones', () => {
    for (const id of MODE_IDS) {
      expect(MODES[id].mapKind, id).toBe(MODES[id].grouping === 'sides' ? 'sides' : 'arena');
    }
  });

  it('gives every score-decided mode a way to end', () => {
    for (const id of ['wipeout', 'hot_zone'] as const) {
      expect(MODES[id].scoreLimit, id).toBeGreaterThan(0);
      expect(MODES[id].timeLimit, id).toBeGreaterThan(0);
    }
  });
});

describe('teams', () => {
  it('puts everyone on their own in solo, in pairs for duo, and on two sides otherwise', () => {
    expect([0, 1, 2, 3].map(i => teamFor('showdown', i))).toEqual([0, 1, 2, 3]);
    expect([0, 1, 2, 3, 4, 5].map(i => teamFor('duo_showdown', i))).toEqual([0, 0, 1, 1, 2, 2]);
    expect([0, 1, 2, 3].map(i => teamFor('wipeout', i))).toEqual([0, 1, 0, 1]);
  });

  it('knows which modes are team modes', () => {
    expect(isTeamMode('showdown')).toBe(false);
    for (const id of MODE_IDS.filter(m => m !== 'showdown')) expect(isTeamMode(id), id).toBe(true);
  });
});

describe('score modes', () => {
  it('is undecided while nobody is over the line and time remains', () => {
    expect(decideByScore([4, 7], 15, false)).toEqual({ winner: null, draw: false });
  });

  it('is won the moment the limit is reached', () => {
    expect(decideByScore([15, 7], 15, false)).toEqual({ winner: 0, draw: false });
    expect(decideByScore([3, 16], 15, false)).toEqual({ winner: 1, draw: false });
  });

  it('is won by the leader when time runs out', () => {
    expect(decideByScore([9, 6], 15, true)).toEqual({ winner: 0, draw: false });
  });

  it('is a draw when time runs out level', () => {
    // Not a coin flip, and not whichever team happens to be listed first.
    expect(decideByScore([8, 8], 15, true)).toEqual({ winner: null, draw: true });
  });

  it('gives the match to the higher score if both pass the line together', () => {
    expect(decideByScore([16, 17], 15, false)).toEqual({ winner: 1, draw: false });
    expect(decideByScore([15, 15], 15, false)).toEqual({ winner: null, draw: true });
  });

  it('works with no limit at all', () => {
    expect(decideByScore([40, 3], undefined, false)).toEqual({ winner: null, draw: false });
    expect(decideByScore([40, 3], undefined, true)).toEqual({ winner: 0, draw: false });
  });
});

describe('a Knockout round', () => {
  it('goes on while both sides have somebody', () => {
    expect(decideRound([2, 3], [4000, 6000], false)).toEqual({ winner: null, draw: false });
  });

  it('is won by the side left standing', () => {
    expect(decideRound([0, 2], [0, 3000], false)).toEqual({ winner: 1, draw: false });
    expect(decideRound([1, 0], [900, 0], false)).toEqual({ winner: 0, draw: false });
  });

  it('is drawn if both sides go down together', () => {
    expect(decideRound([0, 0], [0, 0], false)).toEqual({ winner: null, draw: true });
  });

  it('goes to the side with more people left when time runs out', () => {
    expect(decideRound([3, 2], [3000, 9000], true)).toEqual({ winner: 0, draw: false });
  });

  it('goes to the healthier side if time runs out with equal numbers', () => {
    // This is what stops a round being won by hiding.
    expect(decideRound([2, 2], [3000, 5000], true)).toEqual({ winner: 1, draw: false });
  });

  it('is drawn if even health is level at the horn', () => {
    expect(decideRound([2, 2], [4000, 4000], true)).toEqual({ winner: null, draw: true });
  });
});

describe('a zone', () => {
  it('scores for the only side inside it', () => {
    expect(zoneController([0, 2])).toBe(1);
    expect(zoneController([1, 0])).toBe(0);
  });

  it('scores for nobody when it is empty', () => {
    expect(zoneController([0, 0])).toBeNull();
  });

  it('scores for nobody when it is contested', () => {
    // That is the point of it: standing in it is not enough, you have to hold it.
    expect(zoneController([1, 1])).toBeNull();
    expect(zoneController([3, 1])).toBeNull();
  });
});
