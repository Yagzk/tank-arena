import type { Kit } from './schema';

/**
 * MIKNATIS — the answer to a lane of shooters.
 *
 * Its own attack is ordinary. What it is for is the moment a team is being
 * shot at: the Super puts a pane of reflection on everybody nearby, and every
 * bullet that touches it goes back to whoever fired it.
 */
export const miknatisKit: Kit = {
  id: 'miknatis',
  maxAmmo: 3,

  attack: {
    name: 'Çekim Darbesi',
    actions: [
      { type: 'sound', cue: 'heavy_punch' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: 580,
          radius: 11,
          damage: { ofAttack: 1 },
          range: 360,
          color: '#f87171',
          offset: 22,
          knockback: 120,
        },
      },
    ],
  },

  super: {
    name: 'Yansıtma Alanı',
    actions: [
      { type: 'sound', cue: 'shield_up' },
      { type: 'banner', text: 'YANSITMA!', color: '#e0f2fe' },
      {
        type: 'status',
        target: 'allies',
        radius: 240,
        statuses: [{ kind: 'reflect', duration: 3.2 }],
      },
      { type: 'status', target: 'self', statuses: [{ kind: 'reflect', duration: 3.2 }] },
      { type: 'vfx', at: 'self', effect: 'shockwave', radius: 240, color: '#7dd3fc', duration: 0.5 },
    ],
  },

  gadget: {
    name: 'Çekirdek Kalkanı',
    actions: [
      { type: 'banner', text: 'KALKAN!', color: '#fca5a5' },
      { type: 'status', target: 'self', statuses: [{ kind: 'reflect', duration: 1.1 }] },
      { type: 'shield', target: 'self', amount: 700, duration: 2 },
    ],
  },

  bot: {
    engageRange: 0.92,
    superRange: { max: 1.0 },
    gadget: { when: 'enemyWithin', range: 220 },
  },
};
