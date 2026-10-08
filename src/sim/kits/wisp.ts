import type { Kit } from './schema';
import { deg, speed, tiles } from './bs';

/**
 * WISP — the assassin.
 *
 * Four blades that sweep across a narrow arc and hit hard up close and little
 * at the edge of their range. The Super is six seconds of being invisible to
 * anyone farther than four tiles away, ended by attacking.
 */
export const wispKit: Kit = {
  id: 'wisp',
  maxAmmo: 3,

  attack: {
    name: 'Dönen Bıçaklar',
    actions: [
      {
        type: 'burst',
        count: 4,
        interval: 0.117,
        aim: 'sweep',
        amplitude: deg(17.5),
        actions: [
          { type: 'sound', cue: 'blade_throw' },
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: speed(3500),
              radius: 14,
              damage: 960,
              range: tiles(9.67),
              color: '#22d3ee',
              offset: 20,
              // Full strength for the first 15% of the range, then down to 35%.
              falloff: { near: 1, far: 0.342, distance: tiles(9.67), hold: 0.15 },
              charge: 12.6,
            },
          },
        ],
      },
    ],
  },

  super: {
    name: 'Duman Bombası',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      { type: 'banner', text: 'DUMAN BOMBASI!', color: '#67e8f9' },
      { type: 'vfx', at: 'self', effect: 'smoke_poof', radius: 70, color: '#22d3ee', duration: 0.5 },
      { type: 'status', target: 'self', statuses: [{ kind: 'invisible', duration: 6 }] },
    ],
  },

  gadgets: [
    {
      name: 'Kopya Yansıtıcı',
      description: 'Düşmana koşan ve dokunduğuna hasar veren bir kopya bırakır.',
      cooldown: 13,
      actions: [
        { type: 'sound', cue: 'gadget_activate' },
        { type: 'summon', kind: 'decoy', lifetime: 10, offset: 40, touchDamage: 800 },
      ],
    },
    {
      name: 'Şekerleme',
      description: 'Takımı geniş bir alanda görünmez yapan bir şeker bırakır.',
      cooldown: 20,
      actions: [
        {
          type: 'summon',
          kind: 'lollipop',
          at: 'self',
          lifetime: 12,
          hp: 2000,
          decay: 200,
          radius: 22,
          range: tiles(4.33),
          interval: 0.25,
          unique: true,
          onAct: [{ type: 'status', target: 'allies', radius: tiles(4.33), statuses: [{ kind: 'invisible', duration: 0.45 }] }],
        },
      ],
    },
  ],

  starPowers: [
    {
      name: 'Duman İzi',
      description: 'Görünmezken %30 daha hızlıdır.',
      apply: kit => {
        kit.traits = { ...(kit.traits ?? {}), conditional: [{ when: 'invisible', speed: 1.3 }] };
      },
    },
    {
      name: 'Gizli Şifa',
      description: 'Süper açıkken saniyede canının %20’sini yeniler.',
      apply: kit => {
        kit.traits = { ...(kit.traits ?? {}), conditional: [{ when: 'invisible', healPerSec: 0.2 }] };
      },
    },
  ],

  bot: {
    engageRange: 0.6,
    superRange: { min: 0.3, max: 1.4 },
    gadgets: [
      { when: 'enemyBetween', min: 100, max: 420 },
      { when: 'chance', range: 500, probability: 0.01 },
    ],
  },
};
