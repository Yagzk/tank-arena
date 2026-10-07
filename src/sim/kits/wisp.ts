import type { Kit } from './schema';

/**
 * WISP — assassin.
 *
 * Four blades swept across a narrow arc, with a close-range bonus steep enough
 * that the whole character is about closing distance. The Super is not damage,
 * it is permission to approach.
 */
export const wispKit: Kit = {
  id: 'wisp',
  maxAmmo: 3,

  attack: {
    name: 'Dönen Bıçaklar',
    actions: [
      { type: 'sound', cue: 'blade_throw' },
      {
        type: 'burst',
        count: 4,
        interval: 0.055,
        // The blades pan across the arc over the burst, so the handful reads
        // as one thrown motion.
        aim: 'sweep',
        amplitude: 0.28,
        actions: [
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: 600,
              radius: 6,
              damage: { ofAttack: 1 },
              range: 420,
              color: '#22d3ee',
              offset: 20,
              // A smooth curve rather than brackets: a blade crossing an
              // invisible line used to change its damage by 55% from one pixel
              // to the next.
              falloff: { near: 1.7, far: 0.75, distance: 320 },
            },
          },
        ],
      },
    ],
  },

  super: {
    name: 'Sis Perdesi',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      {
        type: 'status',
        target: 'self',
        statuses: [
          { kind: 'invisible', duration: 6 },
          { kind: 'speed', duration: 6, magnitude: 1.3 },
        ],
      },
      { type: 'vfx', at: 'self', effect: 'smoke_poof', radius: 65, color: '#06b6d4', duration: 0.5 },
      { type: 'banner', text: 'GÖRÜNMEZLİK AKTİF!', color: '#06b6d4' },
    ],
  },

  gadget: {
    name: 'Yanılsama',
    actions: [
      { type: 'banner', text: 'KLON OLUŞTURULDU!', color: '#06b6d4' },
      { type: 'summon', kind: 'decoy', lifetime: 8, offset: 20 },
    ],
  },

  bot: {
    engageRange: 0.85,
    // Stealth is worth using whenever there is anyone to lose.
    superRange: { max: 1.2 },
    gadget: { when: 'chance', range: 300, probability: 0.3 },
  },

  passives: [
    {
      name: 'Sessiz Şifa',
      trigger: 'whileInvisible',
      perSecond: true,
      actions: [{ type: 'heal', target: 'self', amount: 700 }],
    },
  ],
};
