import type { Kit } from './schema';

/**
 * MOLOTOF — area denial.
 *
 * The first character whose attack arcs over walls, which changes what a wall
 * means: cover stops being safety and becomes a place someone knows you are
 * standing. The damage is almost beside the point — what this character does
 * is take tiles away.
 */
export const molotofKit: Kit = {
  id: 'molotof',
  // Two slots, not three. A thrown bottle that could be spammed would deny
  // the whole map; scarcity is what keeps it a decision.
  maxAmmo: 2,

  attack: {
    name: 'Yangın Şişesi',
    actions: [
      { type: 'sound', cue: 'rocket_launch' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: 520,
          radius: 10,
          damage: { ofAttack: 1 },
          range: 470,
          color: '#fb923c',
          offset: 22,
          // Lands where the player aimed, having passed over everything in
          // between.
          motion: 'lob',
          onEnd: [
            { type: 'explosion', at: 'here', damage: { ofAttack: 1 }, radius: 58 },
            {
              type: 'hazard',
              at: 'here',
              hazard: { kind: 'fire', radius: 62, duration: 3.5, damagePerSec: 480 },
            },
            {
              type: 'vfx',
              at: 'here',
              effect: 'explosion',
              radius: 60,
              color: '#f97316',
              duration: 0.3,
              intensity: 0.6,
            },
          ],
        },
      },
    ],
  },

  bot: {
    engageRange: 0.95,
    superRange: { max: 1.0 },
    gadget: { when: 'enemyWithin', range: 140 },
    // The bottle goes over the wall it is standing behind.
    ignoresCover: true,
  },

  super: {
    name: 'Alev Gölü',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      { type: 'banner', text: 'ALEV GÖLÜ!', color: '#f97316' },
      {
        type: 'hazard',
        at: 'target',
        hazard: { kind: 'fire', radius: 150, duration: 8, damagePerSec: 520 },
      },
      {
        type: 'vfx',
        at: 'target',
        effect: 'shockwave',
        radius: 150,
        color: '#fb923c',
        duration: 0.5,
      },
    ],
  },

  gadget: {
    name: 'Ateş Çemberi',
    actions: [
      { type: 'banner', text: 'ATEŞ ÇEMBERİ!', color: '#fb923c' },
      {
        type: 'hazard',
        at: 'self',
        hazard: { kind: 'fire', radius: 92, duration: 3, damagePerSec: 420 },
      },
    ],
  },
};
