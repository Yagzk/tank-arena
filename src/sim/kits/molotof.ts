import type { Kit } from './schema';
import { speed, tiles } from './bs';

/**
 * MOLOTOF — the artillery that makes puddles.
 *
 * A bottle that lands and wets the ground: it hurts on the splash and again for
 * whoever stays in it. The Super is five of them, afire, over a huge area. Two
 * gadgets turn the same ground into a trap or into a healing pool.
 */
const splash = (damage: number) => ({
  type: 'explosion' as const,
  at: 'here' as const,
  damage,
  radius: tiles(2),
  charge: 18,
});

export const molotofKit: Kit = {
  id: 'molotof',
  maxAmmo: 3,

  attack: {
    name: 'Yangın Şişesi',
    actions: [
      { type: 'sound', cue: 'rocket_launch' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: speed(1750),
          radius: 10,
          damage: 0,
          range: tiles(7.33),
          color: '#a3e635',
          offset: 22,
          motion: 'lob',
          onEnd: [
            splash(1600),
            {
              type: 'hazard',
              at: 'here',
              hazard: { kind: 'fire', radius: tiles(2), duration: 1, damagePerSec: 1600, tint: '#a3e635' },
            },
          ],
        },
      },
    ],
  },

  super: {
    name: 'Son Sipariş',
    actions: [
      { type: 'banner', text: 'SON SİPARİŞ!', color: '#fb923c' },
      {
        type: 'burst',
        count: 5,
        interval: 0.3,
        scatter: 100,
        channel: true,
        actions: [
          { type: 'sound', cue: 'rocket_launch' },
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: speed(1700),
              radius: 10,
              damage: 0,
              range: tiles(9.33),
              color: '#fb923c',
              offset: 22,
              motion: 'lob',
              onEnd: [
                { type: 'explosion', at: 'here', damage: 1600, radius: tiles(2), charge: 14.8 },
                {
                  type: 'hazard',
                  at: 'here',
                  hazard: { kind: 'fire', radius: tiles(2), duration: 2, damagePerSec: 1600, noStack: true },
                },
              ],
            },
          },
        ],
      },
    ],
  },

  gadgets: [
    {
      name: 'Yapışkan Şurup',
      description: 'Bulunduğu yere, içinden geçeni yavaşlatan 4 saniyelik bir gölet bırakır.',
      cooldown: 18,
      actions: [
        {
          type: 'hazard',
          at: 'self',
          hazard: { kind: 'fire', radius: tiles(3.33), duration: 4, damagePerSec: 0.01, slow: 0.53, tint: '#d97706' },
        },
      ],
    },
    {
      name: 'Şifalı Karışım',
      description: 'Kendinin ve yakındaki dostlarının altında saniyede %15 can yenileyen göletler açar.',
      cooldown: 17,
      actions: [
        {
          type: 'hazard',
          at: 'self',
          atAllies: tiles(10),
          hazard: { kind: 'fire', radius: tiles(2.67), duration: 4.5, damagePerSec: 0.01, healPerSec: 810, tint: '#4ade80' },
        },
      ],
    },
  ],

  starPowers: [
    {
      name: 'Tıbbi Kullanım',
      description: 'Her atışta canının %10’unu yeniler.',
      apply: kit => {
        kit.attack.actions.push({ type: 'heal', target: 'self', fraction: 0.1 });
      },
    },
    {
      name: 'Fazla Zehirli',
      description: 'Atışın hasarı her vuruşta +200 artar.',
      apply: kit => {
        for (const a of kit.attack.actions) {
          if (a.type !== 'projectiles' || !a.projectile.onEnd) continue;
          for (const e of a.projectile.onEnd) {
            if (e.type === 'explosion') e.damage = 1800;
            if (e.type === 'hazard') e.hazard.damagePerSec = 1800;
          }
        }
      },
    },
  ],

  bot: {
    engageRange: 0.95,
    superRange: { max: 1.0 },
    gadgets: [{ when: 'enemyWithin', range: 240 }, { when: 'never' }],
    ignoresCover: true,
  },
};
