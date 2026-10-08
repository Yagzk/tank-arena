import type { Kit } from './schema';

/**
 * ZIRH — front line.
 *
 * Charges its Super from damage taken, and spends it on keeping other people
 * alive. That loop is the whole character: walking into fire is not a mistake
 * it survives, it is how it pays for the shield.
 */
export const zirhKit: Kit = {
  id: 'zirh',
  maxAmmo: 3,

  attack: {
    name: 'Balyoz',
    actions: [
      { type: 'sound', cue: 'heavy_punch' },
      {
        type: 'burst',
        count: 3,
        interval: 0.09,
        aim: 'alternate',
        amplitude: 0.16,
        actions: [
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: 430,
              radius: 11,
              damage: { ofAttack: 1 },
              range: 185,
              color: '#5eead4',
              offset: 20,
            },
          },
        ],
      },
    ],
  },

  super: {
    name: 'Siper Emri',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      { type: 'banner', text: 'SİPER EMRİ!', color: '#5eead4' },
      { type: 'shield', target: 'allies', amount: 2600, duration: 5, radius: 250 },
      {
        type: 'vfx',
        at: 'self',
        effect: 'shockwave',
        radius: 250,
        color: '#5eead4',
        duration: 0.5,
      },
    ],
  },

  gadget: {
    name: 'Sarsıntı',
    actions: [
      { type: 'banner', text: 'SARSINTI!', color: '#5eead4' },
      { type: 'explosion', at: 'self', damage: 320, radius: 105, knockback: 430 },
      { type: 'shield', target: 'self', amount: 1200, duration: 3 },
      {
        type: 'vfx',
        at: 'self',
        effect: 'ground_slam',
        radius: 105,
        color: '#5eead4',
        duration: 0.4,
      },
    ],
  },

  bot: {
    engageRange: 0.98,
    superRange: { max: 3.0 },
    gadget: { when: 'enemyWithin', range: 110 },
  },

  traits: {
    // Balance dial: see docs/DENGE.md.
    damageScale: 0.91,
    superChargeFromDamageTaken: 60,
  },
};
