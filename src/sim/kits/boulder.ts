import type { Kit } from './schema';

/**
 * BOULDER — tank.
 *
 * Alternating punches at arm's length, and a leap that clears walls to land on
 * someone. The Super charges from damage *taken* as well as dealt, which is
 * what makes a tank's engage inevitable rather than optional.
 */
export const boulderKit: Kit = {
  id: 'boulder',
  maxAmmo: 3,

  attack: {
    name: 'Çifte Yumruk',
    actions: [
      { type: 'sound', cue: 'heavy_punch' },
      {
        type: 'burst',
        count: 4,
        interval: 0.08,
        // Left, right, left, right — the punches read as a combination rather
        // than as four identical projectiles.
        aim: 'alternate',
        amplitude: 0.14,
        actions: [
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: 420,
              radius: 9,
              damage: { ofAttack: 1 },
              range: 165,
              color: '#38bdf8',
              offset: 20,
            },
          },
        ],
      },
    ],
  },

  super: {
    name: 'Göktaşı İnişi',
    actions: [
      { type: 'sound', cue: 'heavy_leap' },
      {
        type: 'jump',
        toTarget: true,
        maxDistance: 380,
        distance: 280,
        onLand: [
          { type: 'sound', cue: 'super_blast' },
          {
            type: 'vfx',
            at: 'here',
            effect: 'ground_slam',
            radius: 125,
            color: '#f59e0b',
            duration: 0.45,
          },
          {
            type: 'explosion',
            at: 'here',
            damage: 1300,
            radius: 125,
            knockback: 420,
            burn: { duration: 4, damagePerSec: 300 },
          },
          // Meteor Rush: the landing is an opening, so the speed to follow it
          // up comes with it.
          { type: 'status', target: 'self', statuses: [{ kind: 'speed', duration: 4, magnitude: 1.32 }] },
        ],
      },
    ],
  },

  gadget: {
    name: 'Savurma',
    actions: [
      {
        type: 'grab',
        range: 90,
        throwDistance: 140,
        damage: 480,
        statuses: [{ kind: 'stun', duration: 0.6 }],
        hitText: 'SAVURMA!',
        missText: 'HEDEF YOK!',
      },
    ],
  },

  bot: {
    engageRange: 0.97,
    // The leap needs somewhere to leap to: useless point blank, wasted at
    // the far end of the map.
    superRange: { min: 0.6, max: 2.4 },
    gadget: { when: 'enemyWithin', range: 80 },
  },

  traits: {
    // Balance dial: see docs/DENGE.md.
    damageScale: 0.75,
    superChargeFromDamageTaken: 75,
  },
};
