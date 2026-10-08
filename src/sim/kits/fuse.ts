import type { Kit } from './schema';
import { speed, tiles } from './bs';

/**
 * FUSE — the rocketeer.
 *
 * One slow, long-reaching rocket that sets the ground alight where it lands,
 * and a Super that rains nine of them over a wide patch while the thrower
 * walks. Hitting something directly takes the rocket's damage once; the splash
 * is for everyone else.
 */
export const fuseKit: Kit = {
  id: 'fuse',
  maxAmmo: 3,

  attack: {
    name: 'Roket',
    actions: [
      { type: 'sound', cue: 'rocket_launch' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: speed(2700),
          radius: 20,
          damage: 2320,
          range: tiles(9),
          color: '#f59e0b',
          offset: 24,
          charge: 20,
          onEnd: [
            { type: 'explosion', at: 'here', damage: 2320, radius: tiles(1.5), charge: 9 },
            { type: 'hazard', at: 'here', hazard: { kind: 'fire', radius: tiles(1), duration: 2.9, damagePerSec: 696 } },
            { type: 'vfx', at: 'here', effect: 'explosion', radius: tiles(1.5), color: '#f97316', duration: 0.3, intensity: 0.7 },
          ],
        },
      },
    ],
  },

  super: {
    name: 'Roket Yağmuru',
    actions: [
      { type: 'banner', text: 'ROKET YAĞMURU!', color: '#fbbf24' },
      {
        type: 'burst',
        count: 9,
        interval: 0.2,
        scatter: 300,
        channel: true,
        actions: [
          { type: 'sound', cue: 'rocket_launch' },
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: 760,
              radius: 14,
              damage: 0,
              range: tiles(8.33),
              color: '#fde68a',
              offset: 24,
              motion: 'lob',
              charge: 18.2,
              onEnd: [
                { type: 'explosion', at: 'here', damage: 2080, radius: tiles(1.5), charge: 18.2 },
                { type: 'vfx', at: 'here', effect: 'explosion', radius: tiles(1.5), color: '#fbbf24', duration: 0.3, intensity: 0.7 },
              ],
            },
          },
        ],
      },
    ],
  },

  gadgets: [
    {
      name: 'Roket Tepmesi',
      description: 'Hedef bölgeye atlar; kalkarken ve inerken yakındakileri savurur.',
      cooldown: 22,
      actions: [
        { type: 'explosion', at: 'self', damage: 1000, radius: tiles(2), push: tiles(2) },
        {
          type: 'jump',
          distance: tiles(4),
          onLand: [
            { type: 'sound', cue: 'explosion' },
            { type: 'explosion', at: 'self', damage: 1000, radius: tiles(2), push: tiles(2) },
            { type: 'vfx', at: 'self', effect: 'shockwave', radius: tiles(2), color: '#fbbf24', duration: 0.4 },
          ],
        },
      ],
    },
    {
      name: 'Roket Yakıtı',
      description: 'Sonraki atış yerleri de yıkan büyük bir roket olur.',
      cooldown: 22,
      cooldownAfterUse: true,
      actions: [
        {
          type: 'empower',
          uses: 1,
          attack: [
            { type: 'sound', cue: 'rocket_launch' },
            {
              type: 'projectiles',
              delivery: { pattern: 'single' },
              projectile: {
                speed: speed(3500),
                radius: 30,
                damage: 2000,
                range: tiles(9),
                color: '#fb923c',
                offset: 24,
                breaksWalls: true,
                charge: 20,
                onEnd: [
                  { type: 'explosion', at: 'here', damage: 2000, radius: tiles(1.5), charge: 9 },
                  { type: 'vfx', at: 'here', effect: 'explosion', radius: tiles(1.8), color: '#f97316', duration: 0.35, intensity: 0.9 },
                ],
              },
            },
          ],
        },
      ],
    },
  ],

  starPowers: [
    {
      name: 'Daha Çok Roket',
      description: 'Süper 9 yerine 13 roket yağdırır.',
      apply: kit => {
        for (const a of kit.super.actions) {
          if (a.type === 'burst') {
            a.count = 13;
            a.interval = 0.15;
          }
        }
      },
    },
    {
      name: 'Dördüncü Roket',
      description: 'Bir cephane yuvası daha taşır.',
      apply: kit => {
        kit.maxAmmo = 4;
      },
    },
  ],

  bot: {
    engageRange: 0.95,
    superRange: { max: 0.95 },
    gadgets: [
      { when: 'enemyWithin', range: 150 },
      { when: 'enemyBetween', min: 200, max: 540 },
    ],
  },
};
