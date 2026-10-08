import type { Kit } from './schema';
import { speed, tiles } from './bs';

/**
 * FISILTI — the dasher.
 *
 * It has no ranged attack at all: an attack is a lunge that cuts whatever it
 * passes, and a long wait makes the next lunge longer. The Super sends bats
 * through walls that heal their owner by exactly what they take.
 */
export const fisiltiKit: Kit = {
  id: 'fisilti',
  maxAmmo: 3,

  traits: {
    // The long lunge is earned by not attacking for a while.
    charge: { time: 4.5, minScale: 1, maxScale: 1 },
  },

  attack: {
    name: 'Kürek Darbesi',
    actions: [
      { type: 'sound', cue: 'heavy_punch' },
      {
        type: 'rush',
        distance: tiles(2.67),
        bonusDistance: tiles(2),
        speed: speed(2700),
        damage: 2000,
        reach: 52,
        charge: 21.25,
      },
    ],
  },

  super: {
    name: 'Kan Emiciler',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      { type: 'banner', text: 'KAN EMİCİLER!', color: '#a5b4fc' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: speed(3000),
          radius: 80,
          damage: 1800,
          range: tiles(10),
          color: '#6366f1',
          offset: 30,
          piercesBodies: true,
          piercesWalls: true,
          charge: 30.15,
          // Heals for the full amount once for every enemy brawler it goes through.
          onHit: [{ type: 'heal', target: 'self', amount: 1800 }],
        },
      },
    ],
  },

  gadgets: [
    {
      name: 'Kombo Döndürücü',
      description: 'Küreği etrafında döndürüp yakındakilere 2000 hasar verir. Cephane harcamaz.',
      cooldown: 18,
      actions: [
        { type: 'explosion', at: 'self', damage: 2000, radius: tiles(2.67), charge: 21.25 },
        { type: 'vfx', at: 'self', effect: 'shockwave', radius: tiles(2.67), color: '#818cf8', duration: 0.35 },
      ],
    },
    {
      name: 'Gecenin Yaratığı',
      description: 'Yarasa sürüsüne dönüşüp işaret ettiği yere engellerin üstünden uçar; hasar almaz.',
      cooldown: 24,
      actions: [
        { type: 'vfx', at: 'self', effect: 'smoke_poof', radius: 60, color: '#6366f1', duration: 0.4 },
        { type: 'rush', distance: tiles(5), speed: speed(3000), ghost: true },
      ],
    },
  ],

  starPowers: [
    {
      name: 'Ürpertici Hasat',
      description: 'Bir düşmanı alt edince canının %20’sini yeniler.',
      apply: kit => {
        kit.passives = [
          { name: 'Hasat', trigger: 'onKill', actions: [{ type: 'heal', target: 'self', fraction: 0.2 }] },
        ];
      },
    },
    {
      name: 'Dolanmış Yılan',
      description: 'Uzun atılışı 2 saniye erken kazanır.',
      apply: kit => {
        kit.traits = { ...(kit.traits ?? {}), charge: { time: 2.5, minScale: 1, maxScale: 1 } };
      },
    },
  ],

  bot: {
    engageRange: 0.35,
    superRange: { max: 3 },
    gadgets: [{ when: 'enemyWithin', range: 150 }, { when: 'never' }],
  },
};
