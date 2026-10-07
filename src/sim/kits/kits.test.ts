import { describe, expect, it } from 'vitest';
import { BRAWLERS, type BrawlerId } from '../../types/brawl';
import { KITS, getKit, validateKit } from './index';
import { keyFor, getActions, getHooks } from './registry';
import type { Kit } from './schema';

/** A kit that is known good, to mutate into the broken cases below. */
function soundKit(): Kit {
  return {
    id: 'mira',
    maxAmmo: 3,
    attack: {
      name: 'Test',
      actions: [
        {
          type: 'projectiles',
          delivery: { pattern: 'single' },
          projectile: { speed: 400, radius: 5, damage: 100, range: 300, color: '#fff' },
        },
      ],
    },
    super: { name: 'Test', actions: [{ type: 'ammo', amount: 1 }] },
    gadget: { name: 'Test', actions: [{ type: 'ammo', amount: 1 }] },
  };
}

describe('the roster', () => {
  it('has a kit for every brawler in the config', () => {
    for (const id of Object.keys(BRAWLERS) as BrawlerId[]) {
      expect(getKit(id), id).toBeDefined();
    }
  });

  it('defines every kit soundly', () => {
    // These same checks run at module load, so a broken kit never reaches a
    // match. This test is what tells you *which* kit, and why.
    for (const id of Object.keys(KITS) as BrawlerId[]) {
      expect(validateKit(KITS[id]), id).toEqual([]);
    }
  });

  it('gives every brawler an ammo count the HUD can draw', () => {
    for (const id of Object.keys(KITS) as BrawlerId[]) {
      expect(KITS[id].maxAmmo, id).toBeGreaterThanOrEqual(1);
      expect(KITS[id].maxAmmo, id).toBeLessThanOrEqual(6);
    }
  });
});

describe('the validator', () => {
  it('accepts a sound kit', () => {
    expect(validateKit(soundKit())).toEqual([]);
  });

  it('rejects a projectile that would sit on the muzzle', () => {
    const kit = soundKit();
    // A missing speed is the single most likely typo in a data file, and the
    // symptom — a projectile that never moves — is baffling in a match.
    (kit.attack.actions[0] as { projectile: { speed: number } }).projectile.speed = 0;
    expect(validateKit(kit).join()).toMatch(/speed must be positive/);
  });

  it('rejects a burst with no interval', () => {
    const kit = soundKit();
    kit.super.actions = [
      { type: 'burst', count: 6, interval: 0, actions: [{ type: 'ammo', amount: 1 }] },
    ];
    expect(validateKit(kit).join()).toMatch(/positive interval/);
  });

  it('rejects an aim rule with nothing to vary across', () => {
    const kit = soundKit();
    kit.super.actions = [
      {
        type: 'burst',
        count: 4,
        interval: 0.1,
        aim: 'sweep',
        actions: [{ type: 'ammo', amount: 1 }],
      },
    ];
    expect(validateKit(kit).join()).toMatch(/needs an amplitude/);
  });

  it('rejects a shield with no pool to absorb', () => {
    const kit = soundKit();
    kit.super.actions = [
      { type: 'status', target: 'self', statuses: [{ kind: 'shield', duration: 3 }] },
    ];
    expect(validateKit(kit).join()).toMatch(/shield needs a magnitude/);
  });

  it('rejects a status that expires on the tick it lands', () => {
    const kit = soundKit();
    kit.super.actions = [
      { type: 'status', target: 'self', statuses: [{ kind: 'stun', duration: 0 }] },
    ];
    expect(validateKit(kit).join()).toMatch(/positive duration/);
  });

  it('rejects a close-range bonus that is not one', () => {
    const kit = soundKit();
    (kit.attack.actions[0] as {
      projectile: { falloff?: { near: number; far: number; distance: number } };
    }).projectile.falloff = { near: 0.5, far: 1.5, distance: 300 };
    expect(validateKit(kit).join()).toMatch(/near multiplier should exceed far/);
  });

  it('refuses an empty ability rather than silently doing nothing', () => {
    const kit = soundKit();
    kit.gadget.actions = [];
    expect(validateKit(kit).join()).toMatch(/no actions/);
  });

  it('names the kit and the path of each problem', () => {
    const kit = soundKit();
    (kit.attack.actions[0] as { projectile: { radius: number } }).projectile.radius = 0;
    expect(validateKit(kit)[0]).toMatch(/^mira\.attack\.actions\[0\]\.projectile:/);
  });
});

describe('compilation', () => {
  it('registers the action list a burst repeats', () => {
    // Rivet's attack is a burst; it cannot work unless the shots it owes are
    // reachable by key from the entity between ticks.
    const burst = KITS.rivet.attack.actions.find(a => a.type === 'burst')!;
    const key = keyFor(burst);
    expect(key).toBeDefined();
    expect(getActions(key!)).toHaveLength(1);
  });

  it('registers the hooks a projectile carries', () => {
    // Thorn's seed bomb is only dangerous because of what it leaves behind.
    const action = KITS.thorn.attack.actions.find(a => a.type === 'projectiles')!;
    const key = keyFor(action.projectile);
    expect(key).toBeDefined();
    expect(getHooks(key)?.onEnd).toHaveLength(1);
  });

  it('registers a jump payload so it survives the flight', () => {
    const jump = KITS.boulder.super.actions.find(a => a.type === 'jump')!;
    const key = keyFor(jump);
    expect(key).toBeDefined();
    expect(getActions(key!)!.length).toBeGreaterThan(0);
  });

  it('leaves a plain projectile without hooks', () => {
    // Mira's pellets do nothing on landing, so they should carry no key and
    // therefore nothing across the network.
    const action = KITS.mira.attack.actions.find(a => a.type === 'projectiles')!;
    expect(keyFor(action.projectile)).toBeUndefined();
  });
});
