import type { Kit } from './schema';
import { deg, speed, tiles } from './bs';

/**
 * MIRA — the close-range shotgunner.
 *
 * A wide fan of pellets that hurts most up close, a Super that is the same fan
 * made larger and pierced through everything including cover, and a choice of
 * how to spend the gadget: a dash that refills the clip, or three narrow, long
 * shots. Numbers are the original game's, at the top power level.
 */
export const miraKit: Kit = {
  id: 'mira',
  maxAmmo: 3,

  attack: {
    name: 'Hurda Saçması',
    actions: [
      { type: 'sound', cue: 'scatter_shot' },
      {
        type: 'projectiles',
        delivery: { pattern: 'spread', count: 5, arc: deg(27) },
        projectile: {
          speed: speed(3100),
          radius: 7,
          damage: 600,
          range: tiles(7.67),
          color: '#c084fc',
          offset: 22,
          charge: 10.05,
        },
      },
    ],
  },

  super: {
    name: 'Büyük Saçma',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      { type: 'banner', text: 'BÜYÜK SAÇMA!', color: '#e9d5ff' },
      {
        type: 'projectiles',
        delivery: { pattern: 'spread', count: 9, arc: deg(45) },
        projectile: {
          speed: speed(4130),
          radius: 8,
          damage: 640,
          range: tiles(7.67),
          color: '#e9d5ff',
          offset: 22,
          piercesBodies: true,
          breaksWalls: true,
          pushback: tiles(2.5),
          charge: 4.8,
        },
      },
    ],
  },

  gadgets: [
    {
      name: 'Atılış',
      description: 'İleri atılır, atılırken hasar almaz ve tüm cephanesini doldurur.',
      cooldown: 16,
      actions: [
        { type: 'dash', distance: tiles(2.67), statuses: [{ kind: 'immunity', duration: 0.45 }] },
        { type: 'ammo', amount: 3 },
      ],
    },
    {
      name: 'Nişan Dar',
      description: 'Sonraki 3 atış daha dar ve çok daha uzağa gider.',
      cooldown: 18,
      cooldownAfterUse: true,
      actions: [
        {
          type: 'empower',
          uses: 3,
          attack: [
            { type: 'sound', cue: 'scatter_shot' },
            {
              type: 'projectiles',
              delivery: { pattern: 'spread', count: 5, arc: deg(13.5) },
              projectile: {
                speed: speed(4300),
                radius: 7,
                damage: 600,
                range: tiles(10),
                color: '#f0abfc',
                offset: 22,
                charge: 7.5,
              },
            },
          ],
        },
      ],
    },
  ],

  starPowers: [
    {
      name: 'Sersemletici Saçma',
      description: 'Süper, vurduğu düşmanları 2 saniye %55 yavaşlatır.',
      apply: kit => {
        for (const a of kit.super.actions) {
          if (a.type === 'projectiles') a.projectile.applyStatus = [{ kind: 'slow', duration: 2, magnitude: 0.55 }];
        }
      },
    },
    {
      name: 'Yara Bandı',
      description: 'Canı %40 altına düşünce hemen %30 can yeniler. 15 saniyede bir.',
      apply: kit => {
        kit.passives = [
          {
            name: 'Yara Bandı',
            trigger: 'lowHealth',
            threshold: 0.4,
            cooldown: 15,
            actions: [
              { type: 'heal', target: 'self', fraction: 0.3 },
              { type: 'sound', cue: 'band_aid' },
            ],
          },
        ];
      },
    },
  ],

  bot: {
    engageRange: 0.85,
    superRange: { max: 0.9 },
    gadgets: [
      { when: 'enemyBetween', min: 100, max: 300 },
      { when: 'enemyBetween', min: 260, max: 560 },
    ],
  },
};
