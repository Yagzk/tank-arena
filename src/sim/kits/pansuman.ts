import type { Kit } from './schema';

/**
 * PANSUMAN — the medic that stays put.
 *
 * Plain damage on its own, and a Super that plants a station which heals and
 * shields everybody inside it every half second. It is the kit for the player
 * who would rather decide where the fight is than be good at it.
 */
export const pansumanKit: Kit = {
  id: 'pansuman',
  maxAmmo: 3,

  attack: {
    name: 'Şırınga',
    actions: [
      { type: 'sound', cue: 'rapid_shot' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: 640,
          radius: 8,
          damage: { ofAttack: 1 },
          range: 400,
          color: '#86efac',
          offset: 22,
        },
      },
    ],
  },

  super: {
    name: 'Seyyar Revir',
    actions: [
      { type: 'sound', cue: 'shield_up' },
      { type: 'banner', text: 'SEYYAR REVİR!', color: '#86efac' },
      {
        type: 'summon',
        kind: 'healStation',
        at: 'self',
        lifetime: 9,
        hp: 2200,
        radius: 24,
        range: 190,
        interval: 0.5,
        onAct: [
          { type: 'heal', target: 'allies', amount: 260, radius: 190 },
          { type: 'shield', target: 'allies', amount: 500, duration: 1.2, radius: 190 },
          { type: 'vfx', at: 'self', effect: 'band_aid', radius: 190, color: '#86efac', duration: 0.4 },
        ],
      },
    ],
  },

  gadget: {
    name: 'Pansuman',
    actions: [
      { type: 'banner', text: 'PANSUMAN!', color: '#bbf7d0' },
      { type: 'heal', target: 'self', amount: 1200 },
      { type: 'vfx', at: 'self', effect: 'band_aid', radius: 60, color: '#86efac', duration: 0.5 },
    ],
  },

  bot: {
    engageRange: 0.9,
    superRange: { max: 2.0 },
    gadget: { when: 'enemyWithin', range: 260 },
  },
};
