import type { Kit } from './schema';

/**
 * FISILTI — dash assassin.
 *
 * Every attack closes distance first, and the Super does it through whoever is
 * standing there. The kit is built around committing: it is the best thing in
 * the game at ending a fight that has already started, and the worst at
 * starting one it cannot finish.
 */
export const fisiltiKit: Kit = {
  id: 'fisilti',
  maxAmmo: 3,

  attack: {
    name: 'Çifte Kesik',
    actions: [
      { type: 'sound', cue: 'blade_throw' },
      // Lunge, then cut. The blades are short-ranged on purpose: the lunge is
      // what carries them to the target.
      { type: 'dash', speed: 360, throughBodies: true },
      {
        type: 'projectiles',
        delivery: { pattern: 'spread', count: 3, arc: 0.9 },
        projectile: {
          speed: 520,
          radius: 9,
          damage: { ofAttack: 1 },
          range: 200,
          color: '#a5b4fc',
          offset: 20,
        },
      },
    ],
  },

  super: {
    name: 'Gölge Sıçraması',
    actions: [
      { type: 'sound', cue: 'heavy_leap' },
      { type: 'banner', text: 'GÖLGE SIÇRAMASI!', color: '#a5b4fc' },
      { type: 'dash', speed: 980, throughBodies: true },
      {
        // Cuts everything along the path: each beat damages whoever is under the
        // body right now, as it travels.
        type: 'burst',
        count: 5,
        interval: 0.06,
        actions: [
          { type: 'explosion', at: 'self', damage: 700, radius: 80, knockback: 120 },
          { type: 'vfx', at: 'self', effect: 'dash', radius: 60, color: '#818cf8', duration: 0.25 },
        ],
      },
      // Landing a Super should leave the clip full: it is how a chain starts.
      { type: 'ammo', amount: 2 },
    ],
  },

  gadget: {
    name: 'Sis Adımı',
    actions: [
      { type: 'banner', text: 'SİS ADIMI!', color: '#a5b4fc' },
      {
        type: 'status',
        target: 'self',
        statuses: [
          { kind: 'invisible', duration: 2.2 },
          { kind: 'speed', duration: 2.2, magnitude: 1.4 },
        ],
      },
      { type: 'vfx', at: 'self', effect: 'smoke_poof', radius: 55, color: '#6366f1', duration: 0.45 },
    ],
  },

  bot: {
    // It has to be near to do anything, so its range is its dash.
    engageRange: 1.15,
    superRange: { min: 0.3, max: 3.0 },
    gadget: { when: 'enemyBetween', min: 120, max: 420 },
  },
};
