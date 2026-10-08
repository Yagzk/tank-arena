import type { Kit } from './schema';

/**
 * KARAMBOL — bounce shooter.
 *
 * The first character whose attack is *about* the walls. A straight shot dies on
 * the first one it meets; this one turns, so a corner stops being safe and a
 * long diagonal across the room becomes a lane. The skill is the geometry, not
 * the aim.
 */
export const karambolKit: Kit = {
  id: 'karambol',
  maxAmmo: 3,

  attack: {
    name: 'Isteka Vuruşu',
    actions: [
      { type: 'sound', cue: 'rapid_shot' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: 600,
          radius: 7,
          damage: { ofAttack: 1 },
          range: 520,
          color: '#bef264',
          offset: 24,
          motion: 'bounce',
          bounces: 2,
        },
      },
    ],
  },

  super: {
    name: 'Sekme Seli',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      { type: 'banner', text: 'SEKME SELİ!', color: '#bef264' },
      {
        type: 'burst',
        count: 8,
        interval: 0.07,
        // Thrown across a wide arc, so the room fills rather than one line.
        aim: 'random',
        amplitude: 1.1,
        actions: [
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: 640,
              radius: 8,
              damage: 420,
              range: 640,
              color: '#d9f99d',
              offset: 24,
              motion: 'bounce',
              bounces: 3,
            },
          },
        ],
      },
    ],
  },

  gadget: {
    name: 'Hızlı Top',
    actions: [
      { type: 'banner', text: 'HIZLI TOP!', color: '#bef264' },
      { type: 'ammo', amount: 1 },
      { type: 'status', target: 'self', statuses: [{ kind: 'speed', duration: 2.2, magnitude: 1.35 }] },
    ],
  },

  bot: {
    engageRange: 0.9,
    superRange: { max: 1.1 },
    gadget: { when: 'outOfAmmo', range: 480 },
  },
};
