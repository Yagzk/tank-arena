import type { Kit } from './schema';

/**
 * GÖLGE — the assassin that picks its moment.
 *
 * Two thrown knives a press, short of range and fast to reload. The Super is
 * the kill: it puts the body behind the nearest enemy and stabs, and what it
 * does next is a question of whether the target had friends.
 */
export const golgeKit: Kit = {
  id: 'golge',
  maxAmmo: 3,

  // Balance dial: see docs/DENGE.md.
  traits: { damageScale: 1.2 },

  attack: {
    name: 'İkiz Bıçak',
    actions: [
      { type: 'sound', cue: 'blade_throw' },
      {
        type: 'projectiles',
        delivery: { pattern: 'spread', count: 2, arc: 0.22 },
        projectile: {
          speed: 780,
          radius: 8,
          damage: { ofAttack: 1 },
          range: 250,
          color: '#a5b4fc',
          offset: 18,
        },
      },
    ],
  },

  super: {
    name: 'Arkadan Vuruş',
    actions: [
      { type: 'sound', cue: 'heavy_leap' },
      { type: 'banner', text: 'ARKADAN VURUŞ!', color: '#a5b4fc' },
      { type: 'teleport', at: 'self', behindNearestEnemy: 560 },
      { type: 'vfx', at: 'self', effect: 'smoke_poof', radius: 60, color: '#6366f1', duration: 0.4 },
      {
        type: 'explosion',
        at: 'self',
        damage: 1500,
        radius: 82,
        knockback: 120,
        statuses: [{ kind: 'stun', duration: 0.7 }],
      },
      { type: 'status', target: 'self', statuses: [{ kind: 'immunity', duration: 0.6 }] },
    ],
  },

  gadget: {
    name: 'Duman Bombası',
    actions: [
      { type: 'banner', text: 'DUMAN!', color: '#c7d2fe' },
      {
        type: 'status',
        target: 'self',
        statuses: [
          { kind: 'invisible', duration: 1.8 },
          { kind: 'speed', duration: 1.8, magnitude: 1.25 },
        ],
      },
      { type: 'vfx', at: 'self', effect: 'smoke_poof', radius: 70, color: '#6366f1', duration: 0.5 },
    ],
  },

  bot: {
    engageRange: 1.0,
    superRange: { min: 0.2, max: 2.2 },
    gadget: { when: 'enemyBetween', min: 150, max: 450 },
  },
};
