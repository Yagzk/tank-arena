import type { Kit } from './schema';
import { speed, tiles } from './bs';

/**
 * RIVET — the fast-reloading gunslinger.
 *
 * Six bullets in two streams, fast to come back, long in reach. The Super is a
 * longer, wider volley of twelve that goes through bodies and breaks cover; it
 * takes its whole 1.4 seconds to leave the guns and a stun cuts it off.
 */
export const rivetKit: Kit = {
  id: 'rivet',
  maxAmmo: 3,

  attack: {
    name: 'Çifte Altıpatlar',
    actions: [
      {
        type: 'burst',
        count: 6,
        interval: 0.16,
        lateral: 10,
        actions: [
          { type: 'sound', cue: 'rapid_shot' },
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: speed(4000),
              radius: 20,
              damage: 720,
              range: tiles(9),
              color: '#f87171',
              offset: 22,
              charge: 8.35,
            },
          },
        ],
      },
    ],
  },

  super: {
    name: 'Kurşun Fırtınası',
    actions: [
      { type: 'banner', text: 'KURŞUN FIRTINASI!', color: '#fca5a5' },
      {
        type: 'burst',
        count: 12,
        interval: 0.117,
        lateral: 10,
        channel: true,
        actions: [
          { type: 'sound', cue: 'rapid_shot' },
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: speed(4891),
              radius: 30,
              damage: 640,
              range: tiles(11),
              color: '#fecaca',
              offset: 22,
              piercesBodies: true,
              breaksWalls: true,
              charge: 6.95,
            },
          },
        ],
      },
    ],
  },

  gadgets: [
    {
      name: 'Hızlı Şarjör',
      description: 'Hemen iki hızlı kurşun atar; vurduğunu yavaşlatır.',
      cooldown: 15,
      actions: [
        {
          type: 'burst',
          count: 2,
          interval: 0.08,
          actions: [
            { type: 'sound', cue: 'rapid_shot' },
            {
              type: 'projectiles',
              delivery: { pattern: 'single' },
              projectile: {
                speed: speed(4891),
                radius: 20,
                damage: 640,
                range: tiles(11),
                color: '#fb7185',
                offset: 22,
                applyStatus: [{ kind: 'slow', duration: 1.5, magnitude: 0.4 }],
                charge: 8.35,
              },
            },
          ],
        },
      ],
    },
    {
      name: 'Gümüş Kurşun',
      description: 'Sonraki atış tek bir delici kurşundur; duvarları da deler.',
      cooldown: 17,
      cooldownAfterUse: true,
      actions: [
        {
          type: 'empower',
          uses: 1,
          attack: [
            { type: 'sound', cue: 'turret_shot' },
            {
              type: 'projectiles',
              delivery: { pattern: 'single' },
              projectile: {
                speed: speed(3804),
                radius: 22,
                damage: 1200,
                range: tiles(11),
                color: '#e2e8f0',
                offset: 22,
                piercesBodies: true,
                piercesWalls: true,
                breaksWalls: true,
                charge: 8.35,
              },
            },
          ],
        },
      ],
    },
  ],

  starPowers: [
    {
      name: 'Kaygan Çizmeler',
      description: 'Yürüme hızı %13 artar.',
      apply: kit => {
        kit.traits = { ...(kit.traits ?? {}), speedMultiplier: 1.13 };
      },
    },
    {
      name: 'Büyük Mermi',
      description: 'Atışın menzili ve mermi hızı %11 artar.',
      apply: kit => {
        for (const a of kit.attack.actions) {
          if (a.type !== 'burst') continue;
          for (const inner of a.actions) {
            if (inner.type !== 'projectiles') continue;
            inner.projectile.range = tiles(10);
            inner.projectile.speed = Math.round(inner.projectile.speed * 1.11);
          }
        }
      },
    },
  ],

  bot: {
    engageRange: 0.95,
    superRange: { max: 1.2 },
    gadgets: [
      { when: 'enemyBetween', min: 120, max: 560 },
      { when: 'enemyBetween', min: 200, max: 640 },
    ],
  },
};
