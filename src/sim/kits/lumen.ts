import type { Kit } from './schema';

/**
 * LUMEN — the sniper that rewards waiting.
 *
 * The beam crosses the whole lane and goes through everybody in it. How hard it
 * hits depends on how long it has been since the last one: a snap shot is a
 * nudge, a held one is half a health bar. The Super is a bolt that jumps from
 * one enemy to the next, which is what punishes standing in a group.
 */
export const lumenKit: Kit = {
  id: 'lumen',
  maxAmmo: 2,

  traits: {
    // Balance dial: see docs/DENGE.md.
    damageScale: 0.62,
    charge: { time: 1.4, minScale: 0.45, maxScale: 1.6 },
  },

  attack: {
    name: 'Işın',
    actions: [
      { type: 'sound', cue: 'turret_shot' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          // Fast enough that the renderer draws it as a beam, and that nothing
          // can be dodged once it has left.
          speed: 3200,
          radius: 7,
          damage: { ofAttack: 1 },
          range: 720,
          color: '#fde047',
          offset: 24,
          piercesBodies: true,
        },
      },
    ],
  },

  super: {
    name: 'Zincir Şimşek',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      { type: 'banner', text: 'ZİNCİR ŞİMŞEK!', color: '#fde047' },
      { type: 'chain', range: 560, hops: 5, hopRange: 300, damage: 900, falloff: 0.88, color: '#fde047' },
    ],
  },

  gadget: {
    name: 'Geri Sıçrama',
    actions: [
      { type: 'banner', text: 'GERİ SIÇRAMA!', color: '#fef08a' },
      { type: 'teleport', at: 'aim', anchorOffset: -230 },
      { type: 'vfx', at: 'self', effect: 'smoke_poof', radius: 50, color: '#fde047', duration: 0.35 },
    ],
  },

  bot: {
    engageRange: 0.97,
    superRange: { max: 0.8 },
    gadget: { when: 'enemyWithin', range: 170 },
  },
};
