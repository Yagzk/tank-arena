import type { Kit } from './schema';
import { speed, tiles } from './bs';

/**
 * USTABAŞI — the engineer.
 *
 * An energy orb that jumps from one enemy to the next, and a turret to set
 * down: sturdier than its owner, tireless, and aimed at whatever it can see.
 * Both gadgets work on the turret, so they do nothing until there is one.
 */
const orb = {
  speed: speed(3050),
  radius: 30,
  range: tiles(9),
  color: '#facc15',
  offset: 24,
  chain: { hits: 3, range: tiles(6.67), falloff: 0.75, reach: tiles(4.67), speed: speed(1522) },
};

export const ustabasiKit: Kit = {
  id: 'ustabasi',
  maxAmmo: 3,

  attack: {
    name: 'Şok Tüfeği',
    actions: [
      { type: 'sound', cue: 'rapid_shot' },
      { type: 'projectiles', delivery: { pattern: 'single' }, projectile: { ...orb, damage: 2120, charge: 16.695 } },
    ],
  },

  super: {
    name: 'Bekçi Taret',
    actions: [
      { type: 'sound', cue: 'gadget_activate' },
      { type: 'banner', text: 'TARET KURULDU!', color: '#fde047' },
      {
        type: 'summon',
        kind: 'turret',
        at: 'target',
        maxReach: tiles(5),
        lifetime: 120,
        hp: 7200,
        radius: 24,
        range: tiles(9),
        interval: 0.3,
        unique: true,
        onAct: [
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: speed(3478),
              radius: 12,
              damage: 600,
              range: tiles(9),
              color: '#fde047',
              offset: 20,
              charge: 6.25,
            },
          },
        ],
      },
    ],
  },

  gadgets: [
    {
      name: 'Kıvılcım',
      description: 'Taret çevresine bir şok dalgası yayar; düşmanları yavaşlatır.',
      cooldown: 15,
      requires: { deployable: 'turret', within: tiles(12) },
      actions: [
        { type: 'status', target: 'enemies', radius: tiles(4.33), centerOn: 'turret', statuses: [{ kind: 'slow', duration: 3, magnitude: 0.47 }] },
        { type: 'vfx', at: 'self', centerOn: 'turret', effect: 'shockwave', radius: tiles(4.33), color: '#fde047', duration: 0.6 },
      ],
    },
    {
      name: 'Geri Tepme Yayı',
      description: 'Taretin atış hızı 5 saniye boyunca iki katına çıkar.',
      cooldown: 16,
      requires: { deployable: 'turret', within: tiles(12) },
      actions: [{ type: 'buffDeployable', kind: 'turret', rate: 2, duration: 5 }],
    },
  ],

  starPowers: [
    {
      name: 'Enerji Ver',
      description: 'Atışıyla tareti vurursa onu 1060 can iyileştirir.',
      apply: kit => {
        for (const a of kit.attack.actions) if (a.type === 'projectiles') a.projectile.turretHeal = 1060;
      },
    },
    {
      name: 'Şoklu',
      description: 'Taret düşmandan düşmana sıçrayan enerji topları atar.',
      apply: kit => {
        for (const a of kit.super.actions) {
          if (a.type !== 'summon' || !a.onAct) continue;
          for (const inner of a.onAct) {
            if (inner.type === 'projectiles') {
              inner.projectile.chain = { hits: 3, range: tiles(6.67), falloff: 0.75, reach: tiles(4.67), speed: speed(1522) };
            }
          }
        }
      },
    },
  ],

  bot: {
    engageRange: 0.95,
    superRange: { max: 0.7 },
    gadgets: [{ when: 'always' }, { when: 'always' }],
  },
};
