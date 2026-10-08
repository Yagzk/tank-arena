import type { Kit } from './schema';
import { speed, tiles } from './bs';

/**
 * NAĞME — the support who plays.
 *
 * A wave that widens as it travels: it hurts the other side and heals its own.
 * The Super is the same wave made longer, which only heals. Both go through
 * bodies, so a crowd is the point.
 */
export const nagmeKit: Kit = {
  id: 'nagme',
  maxAmmo: 3,

  attack: {
    name: 'Güçlü Akor',
    actions: [
      { type: 'sound', cue: 'heavy_punch' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: speed(2500),
          radius: 20,
          growth: 0.6,
          damage: 1520,
          allyHeal: 400,
          range: tiles(7),
          color: '#f9a8d4',
          offset: 22,
          piercesBodies: true,
          charge: 20.8,
        },
      },
    ],
  },

  super: {
    name: 'Bis',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      { type: 'banner', text: 'BİS!', color: '#86efac' },
      { type: 'heal', target: 'self', amount: 4200 },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: speed(5000),
          radius: 20,
          growth: 0.6,
          damage: 0,
          allyHeal: 4200,
          onlyAllies: true,
          range: tiles(9.33),
          color: '#86efac',
          offset: 22,
          piercesBodies: true,
          piercesWalls: true,
        },
      },
    ],
  },

  gadgets: [
    {
      name: 'Diyapazon',
      description: 'Kendini ve yakındaki dostları 4 saniyede üç kez 1400 iyileştirir.',
      cooldown: 24,
      actions: [
        {
          type: 'burst',
          count: 3,
          interval: 2,
          actions: [
            { type: 'heal', target: 'allies', amount: 1400, radius: tiles(3.33) },
            { type: 'vfx', at: 'self', effect: 'band_aid', radius: tiles(3.33), color: '#f9a8d4', duration: 0.5 },
          ],
        },
      ],
    },
    {
      name: 'Koruyucu Ezgi',
      description: 'Atılan nota 4 saniyelik bir alan açar: içindeki dostların kötü etkileri silinir.',
      cooldown: 24,
      actions: [
        {
          type: 'projectiles',
          delivery: { pattern: 'single' },
          projectile: {
            speed: speed(1700),
            radius: 10,
            damage: 0,
            range: tiles(6),
            color: '#fbbf24',
            offset: 22,
            motion: 'lob',
            onEnd: [
              {
                type: 'hazard',
                at: 'here',
                hazard: { kind: 'fire', radius: tiles(3.33), duration: 4, damagePerSec: 0.01, cleanse: true, tint: '#fbbf24' },
              },
            ],
          },
        },
      ],
    },
  ],

  starPowers: [
    {
      name: 'Başa Sarma',
      description: 'Atış dostlara 800 fazladan can verir.',
      apply: kit => {
        for (const a of kit.attack.actions) if (a.type === 'projectiles') a.projectile.allyHeal = 1200;
      },
    },
    {
      name: 'Çınlayan Solo',
      description: 'Süper düşmanlara da 1520 hasar verir.',
      apply: kit => {
        for (const a of kit.super.actions) {
          if (a.type !== 'projectiles') continue;
          a.projectile.onlyAllies = false;
          a.projectile.damage = 1520;
        }
      },
    },
  ],

  bot: {
    engageRange: 0.9,
    superRange: { max: 2.0 },
    gadgets: [{ when: 'enemyWithin', range: 360 }, { when: 'never' }],
  },
};
