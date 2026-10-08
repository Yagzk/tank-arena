import type { Kit } from './schema';

/**
 * KALKAN — support that holds a line.
 *
 * A steady mid-range shot, and a Super that plants a barrier enemy bullets
 * cannot cross while its own team's pass straight through. It does nothing to
 * anyone by itself; it decides which side of the fight can shoot.
 */
export const kalkanKit: Kit = {
  id: 'kalkan',
  maxAmmo: 3,

  // Balance dial: see docs/DENGE.md.
  traits: { damageScale: 0.93 },

  attack: {
    name: 'Kalkan Darbesi',
    actions: [
      { type: 'sound', cue: 'rapid_shot' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: 600,
          radius: 10,
          damage: { ofAttack: 1 },
          range: 380,
          color: '#38bdf8',
          offset: 22,
        },
      },
    ],
  },

  super: {
    name: 'Siper Duvarı',
    actions: [
      { type: 'sound', cue: 'shield_up' },
      { type: 'banner', text: 'SİPER!', color: '#38bdf8' },
      {
        type: 'summon',
        kind: 'barrier',
        at: 'aim',
        offset: 120,
        lifetime: 7,
        hp: 5000,
        radius: 62,
        row: { count: 3, spacing: 92 },
      },
      { type: 'shield', target: 'self', amount: 900, duration: 4 },
    ],
  },

  gadget: {
    name: 'Koruma Alanı',
    actions: [
      { type: 'banner', text: 'KORUMA!', color: '#7dd3fc' },
      { type: 'shield', target: 'allies', amount: 1000, duration: 4, radius: 240 },
      { type: 'vfx', at: 'self', effect: 'shockwave', radius: 240, color: '#38bdf8', duration: 0.45 },
    ],
  },

  bot: {
    engageRange: 0.9,
    superRange: { min: 0.3, max: 1.0 },
    gadget: { when: 'enemyWithin', range: 320 },
  },
};
