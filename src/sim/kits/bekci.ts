import type { Kit } from './schema';

/**
 * BEKÇİ — deployer with a pet.
 *
 * Two shots a press, close enough together that both land on anyone who is
 * not moving, and a Super that is a creature rather than a building: it walks
 * after the nearest enemy and goes off beside them. A turret is a position; this
 * is pressure, and the answer to it is to shoot it, which is not free.
 */
export const bekciKit: Kit = {
  id: 'bekci',
  maxAmmo: 3,

  // Balance dial: see docs/DENGE.md.
  traits: { damageScale: 0.72 },

  attack: {
    name: 'İkiz Atış',
    actions: [
      { type: 'sound', cue: 'rapid_shot' },
      {
        type: 'projectiles',
        delivery: { pattern: 'spread', count: 2, arc: 0.16 },
        projectile: {
          speed: 640,
          radius: 7,
          damage: { ofAttack: 1 },
          range: 400,
          color: '#fbbf24',
          offset: 22,
        },
      },
    ],
  },

  super: {
    name: 'Bekçi Köpeği',
    actions: [
      { type: 'sound', cue: 'gadget_activate' },
      { type: 'banner', text: 'BEKÇİ KÖPEĞİ!', color: '#fbbf24' },
      {
        type: 'summon',
        kind: 'minion',
        at: 'aim',
        offset: 50,
        lifetime: 14,
        hp: 2400,
        radius: 17,
        range: 700,
        interval: 0.7,
        speed: 215,
        onAct: [
          { type: 'sound', cue: 'explosion' },
          { type: 'explosion', at: 'self', damage: 420, radius: 62, knockback: 140 },
          { type: 'vfx', at: 'self', effect: 'hit_spark', radius: 40, color: '#fbbf24', duration: 0.2 },
        ],
      },
    ],
  },

  gadget: {
    name: 'Düdük',
    actions: [
      { type: 'banner', text: 'DÜDÜK!', color: '#fde68a' },
      { type: 'status', target: 'self', statuses: [{ kind: 'speed', duration: 2.5, magnitude: 1.35 }] },
      { type: 'ammo', amount: 1 },
    ],
  },

  bot: {
    engageRange: 0.9,
    superRange: { max: 1.4 },
    gadget: { when: 'outOfAmmo', range: 450 },
  },
};
