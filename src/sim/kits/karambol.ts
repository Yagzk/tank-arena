import type { Kit } from './schema';
import { deg, speed, tiles } from './bs';

/**
 * KARAMBOL — the one that uses the walls.
 *
 * Bullets that bounce, each bounce carrying them farther, so a target behind
 * cover is a target at an angle. The Super is a longer, piercing burst of the
 * same, and a vending machine of its own makes a wall that can be bounced off.
 */
const bullet = (damage: number, range: number, charge: number, spd: number) => ({
  speed: spd,
  radius: 20,
  damage,
  range,
  color: '#fbbf24',
  offset: 22,
  motion: 'bounce' as const,
  bounces: 8,
  bounceRange: tiles(1.67),
  charge,
});

export const karambolKit: Kit = {
  id: 'karambol',
  maxAmmo: 3,

  attack: {
    name: 'Seken Kurşunlar',
    actions: [
      {
        type: 'burst',
        count: 5,
        interval: 0.15,
        aim: 'random',
        amplitude: deg(6.75),
        actions: [
          { type: 'sound', cue: 'rapid_shot' },
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: bullet(600, tiles(9.67), 6.375, speed(3478)),
          },
        ],
      },
    ],
  },

  super: {
    name: 'Hileli Atış',
    actions: [
      { type: 'banner', text: 'HİLELİ ATIŞ!', color: '#fde68a' },
      {
        type: 'burst',
        count: 12,
        interval: 0.104,
        aim: 'random',
        amplitude: deg(9),
        channel: true,
        actions: [
          { type: 'sound', cue: 'rapid_shot' },
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: { ...bullet(720, tiles(13.33), 9.45, speed(4891)), piercesBodies: true },
          },
        ],
      },
    ],
  },

  gadgets: [
    {
      name: 'Çoklu Top Makinesi',
      description: 'Sağlam bir otomat kurar. Kurşunlar ondan sekebilir; patlayınca etrafa kurşun yağdırır.',
      cooldown: 22,
      actions: [
        {
          type: 'summon',
          kind: 'vending',
          at: 'aim',
          offset: 90,
          lifetime: 120,
          hp: 4000,
          radius: 32,
          unique: true,
          onDestroy: [
            {
              type: 'projectiles',
              delivery: { pattern: 'radial', count: 16, fixed: true },
              projectile: {
                speed: speed(4891),
                radius: 20,
                damage: 800,
                range: tiles(11.67),
                color: '#fcd34d',
                offset: 30,
                piercesBodies: true,
              },
            },
            { type: 'vfx', at: 'self', effect: 'explosion', radius: 80, color: '#fbbf24', duration: 0.4 },
          ],
        },
      ],
    },
    {
      name: 'Çoklu Top',
      description: 'Duvara ya da düşmana çarpınca üçe bölünen büyük bir kurşun atar.',
      cooldown: 17,
      actions: [
        { type: 'sound', cue: 'heavy_punch' },
        {
          type: 'projectiles',
          delivery: { pattern: 'single' },
          projectile: {
            speed: speed(3478),
            radius: 30,
            damage: 1800,
            range: tiles(9.67),
            color: '#f97316',
            offset: 24,
            onEnd: [
              {
                type: 'projectiles',
                delivery: { pattern: 'spread', count: 3, arc: deg(40) },
                projectile: {
                  speed: speed(3478),
                  radius: 14,
                  damage: 900,
                  range: tiles(5),
                  color: '#fdba74',
                  offset: 10,
                  piercesBodies: true,
                },
              },
            ],
          },
        },
      ],
    },
  ],

  starPowers: [
    {
      name: 'Süper Sekme',
      description: 'İlk sekmeden sonra kurşunlar +240 hasar verir.',
      apply: kit => {
        const bonus = (actions: typeof kit.attack.actions) => {
          for (const a of actions) {
            if (a.type === 'burst') bonus(a.actions);
            if (a.type === 'projectiles') a.projectile.bounceBonus = 240;
          }
        };
        bonus(kit.attack.actions);
        bonus(kit.super.actions);
      },
    },
    {
      name: 'Robot Çekilişi',
      description: 'Canı %40 altına düşünce %35 daha hızlı koşar.',
      apply: kit => {
        kit.traits = { ...(kit.traits ?? {}), conditional: [{ when: 'healthBelow', below: 0.4, speed: 1.35 }] };
      },
    },
  ],

  bot: {
    engageRange: 0.95,
    superRange: { max: 1.1 },
    gadgets: [{ when: 'enemyWithin', range: 320 }, { when: 'enemyBetween', min: 150, max: 560 }],
  },
};
