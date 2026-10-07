import type { Kit } from './schema';

/**
 * NAĞME — support.
 *
 * The first character who wins a fight without dealing the damage. The attack
 * pierces, so it is worth more against a group than against a duellist, and
 * the Super is pure healing: it does not threaten anybody, it just undoes the
 * last few seconds of the other team's work.
 */
export const nagmeKit: Kit = {
  id: 'nagme',
  maxAmmo: 3,

  attack: {
    name: 'Ses Dalgası',
    actions: [
      { type: 'sound', cue: 'blade_throw' },
      {
        type: 'projectiles',
        delivery: { pattern: 'spread', count: 3, arc: 0.4 },
        projectile: {
          speed: 540,
          // Wide and slow, and it does not stop on the first body: this is a
          // crowd-clearing attack, not a precise one.
          radius: 13,
          damage: { ofAttack: 1 },
          range: 450,
          color: '#fbcfe8',
          offset: 22,
          piercesBodies: true,
        },
      },
    ],
  },

  bot: {
    engageRange: 0.92,
    // Healing has nothing to do with where the enemy is, so the band is wide
    // on purpose: it fires when there is a fight at all.
    superRange: { max: 2.0 },
    gadget: { when: 'enemyWithin', range: 260 },
  },

  super: {
    name: 'Diriliş Ezgisi',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      { type: 'banner', text: 'DİRİLİŞ EZGİSİ!', color: '#f9a8d4' },
      { type: 'heal', target: 'allies', amount: 2600, radius: 320 },
      {
        type: 'vfx',
        at: 'self',
        effect: 'shockwave',
        radius: 320,
        color: '#f9a8d4',
        duration: 0.55,
      },
    ],
  },

  gadget: {
    name: 'Şifa İstasyonu',
    actions: [
      { type: 'banner', text: 'ŞİFA İSTASYONU!', color: '#f9a8d4' },
      {
        type: 'summon',
        kind: 'healStation',
        at: 'self',
        lifetime: 11,
        hp: 1400,
        radius: 22,
        range: 150,
        interval: 1,
        // Pulses from where it stands, so leaving the station means leaving
        // the healing. It is a position, not a buff that follows you.
        onAct: [
          { type: 'heal', target: 'allies', amount: 420, radius: 150 },
          {
            type: 'vfx',
            at: 'self',
            effect: 'band_aid',
            radius: 150,
            color: '#f9a8d4',
            duration: 0.5,
          },
        ],
      },
    ],
  },
};
