import type { Kit } from './schema';

/**
 * THORN — area control.
 *
 * A seed bomb that bursts into curving needles, so the threat is not the
 * grenade but the six lines it leaves behind, and a garden that holds ground
 * while healing its owner for standing in it.
 */
export const thornKit: Kit = {
  id: 'thorn',
  maxAmmo: 3,

  attack: {
    name: 'Tohum Bombası',
    actions: [
      { type: 'sound', cue: 'scatter_shot' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: 480,
          radius: 9,
          damage: { ofAttack: 1 },
          range: 390,
          color: '#34d399',
          offset: 20,
          // Bursts wherever it stops — a wall, a body, the end of its range.
          onEnd: [
            {
              type: 'projectiles',
              delivery: { pattern: 'radial', count: 6 },
              projectile: {
                speed: 460,
                radius: 4.5,
                damage: { ofAttack: 0.6 },
                range: 210,
                color: '#10b981',
                offset: 0,
                motion: 'curve',
                curveRate: 2.5,
              },
            },
          ],
        },
      },
    ],
  },

  super: {
    name: 'Diken Tarlası',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      {
        type: 'hazard',
        at: 'target',
        hazard: { kind: 'thorn', radius: 135, duration: 5, damagePerSec: 600 },
      },
    ],
  },

  gadget: {
    name: 'Diken Yağmuru',
    actions: [
      { type: 'banner', text: 'DİKEN YAĞMURU!', color: '#10b981' },
      {
        type: 'projectiles',
        delivery: { pattern: 'radial', count: 16 },
        projectile: {
          speed: 480,
          radius: 4.5,
          damage: 420,
          range: 240,
          color: '#10b981',
          offset: 15,
        },
      },
    ],
  },

  passives: [
    {
      // Fertilizer. Standing in your own garden is the correct play and it
      // should feel like it.
      name: 'Gübre',
      trigger: 'whileInOwnHazard',
      perSecond: true,
      actions: [{ type: 'heal', target: 'self', amount: 700 }],
    },
  ],
};
