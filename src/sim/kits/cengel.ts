import type { Kit } from './schema';

/**
 * ÇENGEL — pull control.
 *
 * Takes away the one choice a squishier character always has, which is where to
 * stand. The Super does not damage much; it relocates the target to somewhere
 * you chose and leaves them too stunned to do anything about it.
 */
export const cengelKit: Kit = {
  id: 'cengel',
  maxAmmo: 3,

  attack: {
    name: 'Zincir Atışı',
    actions: [
      { type: 'sound', cue: 'rocket_launch' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: 620,
          radius: 8,
          damage: { ofAttack: 1 },
          range: 520,
          color: '#fde047',
          offset: 24,
        },
      },
    ],
  },

  super: {
    name: 'Kanca',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      { type: 'banner', text: 'KANCA!', color: '#fde047' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: 900,
          radius: 13,
          damage: 400,
          range: 620,
          color: '#facc15',
          offset: 24,
          // Whoever it catches is brought here, and left reeling.
          onHit: [
            {
              type: 'pull',
              on: 'hit',
              range: 700,
              force: 1300,
              statuses: [{ kind: 'stun', duration: 0.9 }],
            },
          ],
        },
      },
    ],
  },

  gadget: {
    name: 'Çek Gel',
    actions: [
      { type: 'banner', text: 'ÇEK GEL!', color: '#fde047' },
      { type: 'pull', on: 'nearest', range: 320, force: 900, missText: 'HEDEF YOK!' },
    ],
  },

  bot: {
    engageRange: 0.95,
    superRange: { min: 0.35, max: 1.15 },
    gadget: { when: 'enemyBetween', min: 120, max: 300 },
  },
};
