import type { Kit } from './schema';

/**
 * BUZ — slow and root.
 *
 * Every attack is a little worse to be hit by than the damage says, and the
 * Super pins a whole area in place. It rewards the team that can punish a
 * target that has stopped being able to move, which is why it is a support for
 * damage dealers rather than a damage dealer.
 */
export const buzKit: Kit = {
  id: 'buz',
  maxAmmo: 3,

  // Balance dial: see docs/DENGE.md.
  traits: { damageScale: 1.08 },

  attack: {
    name: 'Kırağı',
    actions: [
      { type: 'sound', cue: 'scatter_shot' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: 560,
          radius: 8,
          damage: { ofAttack: 1 },
          range: 440,
          color: '#bae6fd',
          offset: 22,
          applyStatus: [{ kind: 'slow', duration: 1.4 }],
        },
      },
    ],
  },

  super: {
    name: 'Kış Çemberi',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      { type: 'banner', text: 'KIŞ ÇEMBERİ!', color: '#e0f2fe' },
      {
        type: 'explosion',
        at: 'target',
        damage: 600,
        radius: 150,
        statuses: [
          { kind: 'root', duration: 2.5 },
          { kind: 'slow', duration: 3.5 },
        ],
      },
      { type: 'vfx', at: 'target', effect: 'shockwave', radius: 150, color: '#7dd3fc', duration: 0.5 },
    ],
  },

  gadget: {
    name: 'Buz Zırhı',
    actions: [
      { type: 'banner', text: 'BUZ ZIRHI!', color: '#e0f2fe' },
      { type: 'shield', target: 'self', amount: 1100, duration: 3.5 },
      {
        type: 'status',
        target: 'enemies',
        radius: 170,
        statuses: [{ kind: 'slow', duration: 2 }],
      },
    ],
  },

  bot: {
    engageRange: 0.92,
    superRange: { max: 1.05 },
    gadget: { when: 'enemyWithin', range: 160 },
  },
};
