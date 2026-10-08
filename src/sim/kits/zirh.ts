import type { Kit } from './schema';
import { deg, speed, tiles } from './bs';

/**
 * ZIRH — the one that charges.
 *
 * A short-range double-barrel and a vast pool of health that fills the Super as
 * it is spent. The Super runs a full eleven tiles through whatever is in the
 * way, breaking cover and throwing enemies aside, and slows everyone near where
 * it stops.
 */
export const zirhKit: Kit = {
  id: 'zirh',
  maxAmmo: 3,

  traits: {
    superChargeFromDamageTaken: 100 / 2.4,
  },

  attack: {
    name: 'Çifte Namlu',
    actions: [
      { type: 'sound', cue: 'scatter_shot' },
      {
        type: 'projectiles',
        delivery: { pattern: 'spread', count: 5, arc: deg(40.5) },
        projectile: {
          speed: speed(2853),
          radius: 8,
          damage: 880,
          range: tiles(5.33),
          color: '#fda4af',
          offset: 22,
          charge: 11,
        },
      },
    ],
  },

  super: {
    name: 'Buldozer',
    actions: [
      { type: 'sound', cue: 'heavy_leap' },
      { type: 'banner', text: 'BULDOZER!', color: '#fb7185' },
      {
        type: 'rush',
        distance: tiles(11),
        speed: speed(2000),
        damage: 2000,
        push: tiles(1.5),
        reach: 56,
        breaksWalls: true,
        charge: 30,
        onEnd: [
          { type: 'status', target: 'enemies', radius: tiles(3), statuses: [{ kind: 'slow', duration: 2.5, magnitude: 0.5 }] },
          { type: 'vfx', at: 'self', effect: 'ground_slam', radius: tiles(3), color: '#fb7185', duration: 0.5 },
        ],
      },
    ],
  },

  gadgets: [
    {
      name: 'T-Kemik Füzesi',
      description: 'Hedefe fırlattığı füze 1600 hasar verir ve o kadar can yeniler.',
      cooldown: 18,
      actions: [
        { type: 'sound', cue: 'rocket_launch' },
        {
          type: 'projectiles',
          delivery: { pattern: 'single' },
          projectile: {
            speed: speed(3000),
            radius: 18,
            damage: 1600,
            range: tiles(6),
            color: '#fecdd3',
            offset: 22,
            onHit: [{ type: 'heal', target: 'self', amount: 1600 }],
          },
        },
      ],
    },
    {
      name: 'Tepme',
      description: 'Yere vurup yakındakileri yavaşlatır; zaten yavaş olanı sersemletir.',
      cooldown: 20,
      actions: [
        { type: 'explosion', at: 'self', damage: 0, radius: tiles(2.67), slowThenStun: { amount: 0.5, duration: 1 } },
        { type: 'vfx', at: 'self', effect: 'ground_slam', radius: tiles(2.67), color: '#fb7185', duration: 0.4 },
      ],
    },
  ],

  starPowers: [
    {
      name: 'Çılgınlık',
      description: 'Canı %60 altına düşünce yeniden doldurma hızı ikiye katlanır.',
      apply: kit => {
        kit.traits = { ...(kit.traits ?? {}), conditional: [{ when: 'healthBelow', below: 0.6, reload: 2 }] };
      },
    },
    {
      name: 'Zorlu Adam',
      description: 'Canı %30 altına düşünce aldığı hasar %30 azalır.',
      apply: kit => {
        kit.traits = { ...(kit.traits ?? {}), conditional: [{ when: 'healthBelow', below: 0.3, taken: 0.7 }] };
      },
    },
  ],

  bot: {
    engageRange: 1.0,
    superRange: { min: 0.5, max: 2.0 },
    gadgets: [{ when: 'enemyBetween', min: 100, max: 360 }, { when: 'enemyWithin', range: 150 }],
  },
};
