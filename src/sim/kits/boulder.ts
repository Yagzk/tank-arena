import type { Kit } from './schema';
import { speed, tiles } from './bs';

/**
 * BOULDER — the brawler.
 *
 * A flurry of four punches that has to be next to you, a huge body, and a Super
 * that is a leap: it lands hard, knocks everything round it back and breaks
 * cover. Taking damage charges the Super as much as dealing it does.
 */
export const boulderKit: Kit = {
  id: 'boulder',
  maxAmmo: 3,

  traits: {
    // It takes 2.4 full health bars of damage to fill the Super.
    superChargeFromDamageTaken: 100 / 2.4,
  },

  attack: {
    name: 'Yumruk Yağmuru',
    actions: [
      {
        type: 'burst',
        count: 4,
        interval: 0.28,
        lateral: 12,
        actions: [
          { type: 'sound', cue: 'heavy_punch' },
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: speed(3261),
              radius: 26,
              damage: 760,
              range: tiles(3),
              color: '#fb923c',
              offset: 14,
              piercesBodies: true,
              charge: 9.5,
            },
          },
        ],
      },
    ],
  },

  super: {
    name: 'Göktaşı Dirseği',
    actions: [
      { type: 'sound', cue: 'heavy_leap' },
      { type: 'banner', text: 'GÖKTAŞI DİRSEĞİ!', color: '#fdba74' },
      {
        type: 'jump',
        toTarget: true,
        maxDistance: tiles(9),
        onLand: [
          { type: 'sound', cue: 'super_blast' },
          { type: 'explosion', at: 'self', damage: 1920, radius: tiles(2.67), push: tiles(2.6), charge: 25.2 },
          { type: 'vfx', at: 'self', effect: 'ground_slam', radius: tiles(2.67), color: '#f97316', duration: 0.5 },
        ],
      },
    ],
  },

  gadgets: [
    {
      name: 'Arkaya Fırlatış',
      description: 'İleri atılıp çarptığı düşmanları kapıp arkasına fırlatır.',
      cooldown: 15,
      actions: [{ type: 'dash', distance: tiles(2.67), grabThrow: tiles(2) }],
    },
    {
      name: 'Meteor Kuşağı',
      description: '1 saniye boyunca gelen bütün mermileri yok eden bir kalkan açar.',
      cooldown: 20,
      actions: [
        { type: 'status', target: 'self', statuses: [{ kind: 'absorb', duration: 1 }] },
        { type: 'vfx', at: 'self', effect: 'shockwave', radius: 70, color: '#fb923c', duration: 0.5 },
      ],
    },
  ],

  starPowers: [
    {
      name: 'Ateşli Düşüş',
      description: 'Süperin vurduğu düşmanlar 4 saniyede 1800 hasarla yanar.',
      apply: kit => {
        const jump = kit.super.actions.find(a => a.type === 'jump');
        const blast = jump && jump.type === 'jump' ? jump.onLand?.find(a => a.type === 'explosion') : undefined;
        if (blast && blast.type === 'explosion') blast.burn = { duration: 4, damagePerSec: 450 };
      },
    },
    {
      name: 'Göktaşı Hızı',
      description: 'Süperden sonra 3 saniye %25 hızlanır.',
      apply: kit => {
        const jump = kit.super.actions.find(a => a.type === 'jump');
        if (jump && jump.type === 'jump') {
          jump.onLand?.push({ type: 'status', target: 'self', statuses: [{ kind: 'speed', duration: 3, magnitude: 1.25 }] });
        }
      },
    },
  ],

  bot: {
    engageRange: 1.0,
    superRange: { min: 0.6, max: 3.0 },
    gadgets: [
      { when: 'enemyBetween', min: 60, max: 150 },
      { when: 'enemyWithin', range: 260 },
    ],
  },
};
