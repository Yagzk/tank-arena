import type { Kit } from './schema';

/**
 * MİRA — close-range scattergun.
 *
 * A fan of pellets that is devastating at point blank and nearly harmless at
 * range, a Super that shreds cover, and an emergency heal that rewards staying
 * in a fight one beat longer than is comfortable.
 */
export const miraKit: Kit = {
  id: 'mira',
  maxAmmo: 3,

  // Balance dial: see docs/DENGE.md.
  traits: { damageScale: 0.81 },

  attack: {
    name: 'Hurda Saçması',
    actions: [
      { type: 'sound', cue: 'scatter_shot' },
      {
        type: 'projectiles',
        delivery: { pattern: 'spread', count: 5, arc: 0.36 },
        projectile: {
          speed: 550,
          radius: 5,
          damage: { ofAttack: 1 },
          range: 340,
          color: '#c084fc',
          offset: 22,
        },
      },
    ],
  },

  super: {
    name: 'Yıkım Salvosu',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      {
        type: 'vfx',
        at: 'aim',
        anchorOffset: 30,
        effect: 'shockwave',
        radius: 90,
        color: '#e879f9',
        duration: 0.35,
      },
      {
        type: 'projectiles',
        delivery: { pattern: 'spread', count: 9, arc: 0.55 },
        projectile: {
          speed: 680,
          radius: 7.5,
          damage: 440,
          range: 400,
          color: '#e879f9',
          offset: 26,
          breaksWalls: true,
          knockback: 380,
          applyStatus: [{ kind: 'slow', duration: 3 }],
        },
      },
    ],
  },

  gadget: {
    name: 'Atılım',
    actions: [
      { type: 'banner', text: 'İLERİ ATILMA!', color: '#c084fc' },
      { type: 'dash', speed: 580 },
      { type: 'vfx', at: 'self', effect: 'dash', radius: 50, color: '#a855f7', duration: 0.3 },
    ],
  },

  bot: {
    // A shotgun's useful range is well short of its stated one.
    engageRange: 0.88,
    superRange: { max: 0.77 },
    gadget: { when: 'enemyBetween', min: 90, max: 200 },
  },

  passives: [
    {
      // The heal is deliberately on a long cooldown: it should decide one
      // fight, not make her unkillable in a drawn-out one.
      name: 'Sargı',
      trigger: 'lowHealth',
      threshold: 0.4,
      cooldown: 15,
      actions: [
        { type: 'heal', target: 'self', amount: 1800 },
        { type: 'banner', text: '+1800 YARA BANDI!', color: '#4ade80' },
        { type: 'vfx', at: 'self', effect: 'band_aid', radius: 50, color: '#22c55e', duration: 0.6 },
        { type: 'sound', cue: 'band_aid' },
      ],
    },
  ],
};
