import type { Kit } from './schema';

/**
 * DİNAMİT — two sticks, and a lot of demolition.
 *
 * A pair of lobs a fraction apart, each of which takes cover out of the map as
 * well as health out of whoever is behind it. The Super is the whole bundle.
 */
export const dinamitKit: Kit = {
  id: 'dinamit',
  maxAmmo: 3,

  // Balance dial: see docs/DENGE.md.
  traits: { damageScale: 1.17 },

  attack: {
    name: 'Çifte Fitil',
    actions: [
      { type: 'sound', cue: 'rocket_launch' },
      {
        type: 'burst',
        count: 2,
        interval: 0.16,
        scatter: 36,
        actions: [
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: 560,
              radius: 8,
              damage: 0,
              range: 470,
              color: '#f87171',
              offset: 20,
              motion: 'lob',
              onEnd: [
                { type: 'explosion', at: 'here', damage: { ofAttack: 1 }, radius: 74 },
                { type: 'vfx', at: 'here', effect: 'explosion', radius: 64, color: '#ef4444', duration: 0.3, intensity: 0.5 },
              ],
            },
          },
        ],
      },
    ],
  },

  super: {
    name: 'Dinamit Demeti',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      { type: 'banner', text: 'DİNAMİT DEMETİ!', color: '#f87171' },
      {
        type: 'burst',
        count: 6,
        interval: 0.14,
        scatter: 170,
        actions: [
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: 600,
              radius: 9,
              damage: 0,
              range: 620,
              color: '#fca5a5',
              offset: 20,
              motion: 'lob',
              onEnd: [
                { type: 'explosion', at: 'here', damage: 700, radius: 96, knockback: 240 },
                { type: 'vfx', at: 'here', effect: 'explosion', radius: 90, color: '#ef4444', duration: 0.35, intensity: 0.7 },
              ],
            },
          },
        ],
      },
    ],
  },

  gadget: {
    name: 'Uzun Fitil',
    actions: [
      { type: 'banner', text: 'UZUN FİTİL!', color: '#fca5a5' },
      { type: 'explosion', at: 'aim', anchorOffset: 130, damage: 800, radius: 135, knockback: 420 },
      { type: 'vfx', at: 'aim', anchorOffset: 130, effect: 'explosion', radius: 130, color: '#ef4444', duration: 0.4 },
    ],
  },

  bot: {
    engageRange: 0.95,
    superRange: { max: 1.0 },
    gadget: { when: 'enemyBetween', min: 100, max: 170 },
    ignoresCover: true,
  },
};
