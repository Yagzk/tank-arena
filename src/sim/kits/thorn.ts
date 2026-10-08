import type { Kit } from './schema';
import { deg, speed, tiles } from './bs';

/**
 * THORN — the cactus.
 *
 * The attack is a thrown cactus that bursts into six spikes where it stops, so
 * it is far more dangerous up close than the number on it suggests. The Super is
 * a patch of thorns that hurts and slows whoever stays in it.
 */
const spike = {
  speed: speed(3261),
  radius: 10,
  damage: 1080,
  range: tiles(4.33),
  color: '#86efac',
  offset: 12,
  charge: 12.975,
};

export const thornKit: Kit = {
  id: 'thorn',
  maxAmmo: 3,

  attack: {
    name: 'Iğneli Kaktüs',
    actions: [
      { type: 'sound', cue: 'rocket_launch' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: speed(2174),
          radius: 28,
          damage: 1080,
          range: tiles(7.67),
          color: '#4ade80',
          offset: 24,
          onEnd: [
            { type: 'explosion', at: 'here', damage: 1080, radius: tiles(1) },
            {
              type: 'projectiles',
              // Six spikes, always on the same six headings.
              delivery: { pattern: 'radial', count: 6, fixed: true },
              projectile: { ...spike },
            },
            { type: 'vfx', at: 'here', effect: 'hit_spark', radius: 40, color: '#86efac', duration: 0.25 },
          ],
        },
      },
    ],
  },

  super: {
    name: 'Dikenli Bomba',
    actions: [
      { type: 'sound', cue: 'rocket_launch' },
      { type: 'banner', text: 'DİKENLİ BOMBA!', color: '#4ade80' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: speed(1739),
          radius: 14,
          damage: 0,
          range: tiles(7.67),
          color: '#22c55e',
          offset: 24,
          motion: 'lob',
          onEnd: [
            {
              type: 'hazard',
              at: 'here',
              hazard: { kind: 'thorn', radius: tiles(2.67), duration: 4.5, damagePerSec: 800, slow: 0.53 },
            },
            { type: 'vfx', at: 'here', effect: 'ground_slam', radius: tiles(2.67), color: '#22c55e', duration: 0.5 },
          ],
        },
      },
    ],
  },

  gadgets: [
    {
      name: 'İğne Yağmuru',
      description: 'Bir sıra iğne fırlatır; uzağa gittikçe daha çok vurur.',
      cooldown: 17,
      actions: [
        { type: 'sound', cue: 'scatter_shot' },
        {
          type: 'projectiles',
          delivery: { pattern: 'spread', count: 5, arc: deg(20) },
          projectile: {
            speed: speed(3261),
            radius: 10,
            damage: 1000,
            range: tiles(7.67),
            color: '#bbf7d0',
            offset: 22,
            falloff: { near: 0.6, far: 1, distance: tiles(7.67) },
            charge: 8,
          },
        },
      ],
    },
    {
      name: 'Can Bitkisi',
      description: 'Takıma siper olan büyük bir kaktüs diker. Yıkılırsa yakındaki dostları iyileştirir.',
      cooldown: 20,
      actions: [
        {
          type: 'projectiles',
          delivery: { pattern: 'single' },
          projectile: {
            speed: speed(1739),
            radius: 12,
            damage: 0,
            range: tiles(7.33),
            color: '#4ade80',
            offset: 22,
            motion: 'lob',
            onEnd: [
              {
                type: 'summon',
                kind: 'cactus',
                at: 'here',
                lifetime: 60,
                hp: 3500,
                radius: 34,
                unique: true,
                onDestroy: [
                  { type: 'heal', target: 'allies', fraction: 0.3, radius: tiles(3.33) },
                  { type: 'vfx', at: 'self', effect: 'band_aid', radius: tiles(3.33), color: '#86efac', duration: 0.5 },
                ],
              },
            ],
          },
        },
      ],
    },
  ],

  starPowers: [
    {
      name: 'Gübre',
      description: 'Süperin verdiği hasarın %75’i kadar can yeniler.',
      apply: kit => {
        for (const a of kit.super.actions) {
          if (a.type !== 'projectiles' || !a.projectile.onEnd) continue;
          for (const e of a.projectile.onEnd) if (e.type === 'hazard') e.hazard.lifesteal = 0.75;
        }
      },
    },
    {
      name: 'Eğri Top',
      description: 'Kaktüsün iğneleri bir yana kıvrılarak gider, isabet kolaylaşır.',
      apply: kit => {
        for (const a of kit.attack.actions) {
          if (a.type !== 'projectiles' || !a.projectile.onEnd) continue;
          for (const e of a.projectile.onEnd) {
            if (e.type === 'projectiles') {
              e.projectile.motion = 'curve';
              e.projectile.curveRate = 1.1;
            }
          }
        }
      },
    },
  ],

  bot: {
    engageRange: 0.9,
    superRange: { max: 1.0 },
    gadgets: [
      { when: 'enemyBetween', min: 200, max: 460 },
      { when: 'enemyWithin', range: 220 },
    ],
  },
};
