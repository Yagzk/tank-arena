import type { Kit } from './schema';

/**
 * RIVET — rapid-fire duellist.
 *
 * Six rounds down a lane. The burst is the whole character: it rewards holding
 * a line and punishes the player who fires while repositioning, because the
 * shots keep going where the trigger was pulled.
 */
export const rivetKit: Kit = {
  id: 'rivet',
  maxAmmo: 3,

  attack: {
    name: 'Seri Atış',
    actions: [
      { type: 'sound', cue: 'rapid_shot' },
      {
        type: 'burst',
        count: 6,
        interval: 0.065,
        aim: 'random',
        amplitude: 0.04,
        actions: [
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: 680,
              radius: 4.5,
              damage: { ofAttack: 1 },
              range: 480,
              color: '#f87171',
              offset: 22,
            },
          },
        ],
      },
    ],
  },

  super: {
    name: 'Delici Yaylım',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      {
        type: 'burst',
        count: 12,
        interval: 0.045,
        aim: 'random',
        amplitude: 0.05,
        actions: [
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: 800,
              radius: 7,
              damage: 440,
              range: 580,
              color: '#f43f5e',
              offset: 26,
              piercesWalls: true,
              piercesBodies: true,
              breaksWalls: true,
            },
          },
        ],
      },
    ],
  },

  gadget: {
    name: 'Hızlı Şarjör',
    actions: [
      { type: 'ammo', amount: 2 },
      { type: 'sound', cue: 'rapid_reload' },
    ],
  },

  traits: {
    // Light-foot: a permanent edge in a kiting duel, which is the only kind
    // of fight this character wants.
    speedMultiplier: 1.12,
  },
};
