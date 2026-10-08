import type { Kit } from './schema';

/**
 * SİS — the scout.
 *
 * Fast, light, and quick on the trigger; what it brings the team is
 * information. The Super fogs a whole area: everybody in it is revealed even
 * from inside a bush, and cannot use their own Super while they are.
 */
export const sisKit: Kit = {
  id: 'sis',
  maxAmmo: 3,

  // Balance dial: see docs/DENGE.md.
  traits: { damageScale: 2.0 },

  attack: {
    name: 'Duman Oku',
    actions: [
      { type: 'sound', cue: 'rapid_shot' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: 760,
          radius: 6,
          damage: { ofAttack: 1 },
          range: 410,
          color: '#c4b5fd',
          offset: 20,
        },
      },
    ],
  },

  super: {
    name: 'Sis Perdesi',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      { type: 'banner', text: 'SİS PERDESİ!', color: '#c4b5fd' },
      {
        type: 'status',
        target: 'enemies',
        radius: 420,
        statuses: [
          { kind: 'reveal', duration: 5 },
          { kind: 'silence', duration: 3 },
        ],
      },
      { type: 'vfx', at: 'self', effect: 'smoke_poof', radius: 420, color: '#a78bfa', duration: 0.7 },
    ],
  },

  gadget: {
    name: 'İşaret Fişeği',
    actions: [
      { type: 'banner', text: 'FİŞEK!', color: '#ddd6fe' },
      { type: 'status', target: 'enemies', radius: 560, statuses: [{ kind: 'reveal', duration: 3.5 }] },
      { type: 'vfx', at: 'self', effect: 'shockwave', radius: 300, color: '#c4b5fd', duration: 0.4 },
    ],
  },

  bot: {
    engageRange: 0.92,
    superRange: { max: 0.9 },
    gadget: { when: 'chance', range: 520, probability: 0.02 },
  },
};
