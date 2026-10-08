import type { Kit } from './schema';

/**
 * DEVİR — a fighter that wins by staying in it.
 *
 * Three hits in a row, the last of which is a boomerang that comes back for a
 * second go; miss the rhythm and it starts over. The Super is a whirlwind that
 * heals for a share of what it cuts, so the longer someone is stuck in it the
 * worse it gets for them.
 */
export const devirKit: Kit = {
  id: 'devir',
  maxAmmo: 3,

  attack: {
    name: 'Kesik',
    actions: [
      {
        type: 'projectiles',
        delivery: { pattern: 'spread', count: 3, arc: 0.6 },
        projectile: { speed: 760, radius: 12, damage: { ofAttack: 1 }, range: 230, color: '#fcd34d', offset: 16 },
      },
    ],
  },

  comboWindow: 1.1,
  combo: [
    {
      name: 'Birinci Kesik',
      actions: [
        { type: 'sound', cue: 'blade_throw' },
        {
          type: 'projectiles',
          delivery: { pattern: 'spread', count: 3, arc: 0.6 },
          projectile: { speed: 760, radius: 12, damage: { ofAttack: 0.8 }, range: 230, color: '#fcd34d', offset: 16 },
        },
      ],
    },
    {
      name: 'İkinci Kesik',
      actions: [
        { type: 'sound', cue: 'blade_throw' },
        {
          type: 'projectiles',
          delivery: { pattern: 'spread', count: 3, arc: 0.6 },
          projectile: { speed: 760, radius: 12, damage: { ofAttack: 0.8 }, range: 230, color: '#fcd34d', offset: 16 },
        },
      ],
    },
    {
      name: 'Bumerang',
      actions: [
        { type: 'sound', cue: 'blade_throw' },
        {
          type: 'projectiles',
          delivery: { pattern: 'single' },
          projectile: {
            speed: 700,
            radius: 15,
            damage: { ofAttack: 1.5 },
            range: 300,
            color: '#fb923c',
            offset: 18,
            motion: 'boomerang',
            piercesBodies: true,
          },
        },
      ],
    },
  ],

  super: {
    name: 'Kıyım Girdabı',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      { type: 'banner', text: 'KIYIM GİRDABI!', color: '#fb923c' },
      { type: 'status', target: 'self', statuses: [{ kind: 'speed', duration: 2.4, magnitude: 1.15 }] },
      {
        type: 'burst',
        count: 8,
        interval: 0.28,
        actions: [
          { type: 'explosion', at: 'self', damage: 330, radius: 145, lifesteal: 0.8 },
          { type: 'vfx', at: 'self', effect: 'shockwave', radius: 145, color: '#fb923c', duration: 0.3 },
        ],
      },
    ],
  },

  gadget: {
    name: 'Atılış',
    actions: [
      { type: 'banner', text: 'ATILIŞ!', color: '#fcd34d' },
      { type: 'dash', speed: 760, statuses: [{ kind: 'immunity', duration: 0.35 }] },
    ],
  },

  bot: {
    engageRange: 1.0,
    superRange: { max: 0.7 },
    gadget: { when: 'enemyBetween', min: 180, max: 420 },
  },
};
