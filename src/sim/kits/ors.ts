import type { Kit } from './schema';

/**
 * ÖRS — a tank that has to be next to you.
 *
 * Its attack is a wide sweep with nothing behind it, so it does nothing to
 * anyone it cannot reach. The Super is the reach: a charge that stuns whoever
 * it runs into, and which is the only way it ever closes on a kiter.
 */
export const orsKit: Kit = {
  id: 'ors',
  maxAmmo: 3,

  attack: {
    name: 'Süpürme',
    actions: [
      { type: 'sound', cue: 'heavy_punch' },
      {
        type: 'projectiles',
        delivery: { pattern: 'spread', count: 6, arc: 1.7 },
        projectile: {
          speed: 900,
          radius: 18,
          damage: { ofAttack: 1 },
          range: 190,
          color: '#fda4af',
          offset: 14,
          piercesBodies: true,
          knockback: 220,
        },
      },
    ],
  },

  super: {
    name: 'Koçbaşı Hücumu',
    actions: [
      { type: 'sound', cue: 'heavy_leap' },
      { type: 'banner', text: 'KOÇBAŞI!', color: '#fb7185' },
      { type: 'dash', speed: 1500, statuses: [{ kind: 'immunity', duration: 0.6 }] },
      {
        type: 'burst',
        count: 8,
        interval: 0.07,
        actions: [
          {
            type: 'explosion',
            at: 'self',
            damage: 650,
            radius: 80,
            knockback: 260,
            statuses: [{ kind: 'stun', duration: 1.1 }],
          },
          { type: 'vfx', at: 'self', effect: 'ground_slam', radius: 70, color: '#fb7185', duration: 0.3 },
        ],
      },
    ],
  },

  gadget: {
    name: 'Yer Tokmağı',
    actions: [
      { type: 'banner', text: 'TOKMAK!', color: '#fda4af' },
      {
        type: 'explosion',
        at: 'self',
        damage: 350,
        radius: 170,
        knockback: 520,
        statuses: [{ kind: 'slow', duration: 1.5 }],
      },
      { type: 'vfx', at: 'self', effect: 'ground_slam', radius: 170, color: '#fb7185', duration: 0.45 },
    ],
  },

  bot: {
    engageRange: 1.0,
    superRange: { min: 0.4, max: 1.2 },
    gadget: { when: 'enemyWithin', range: 150 },
  },
};
