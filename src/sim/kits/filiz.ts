import type { Kit } from './schema';

/**
 * FİLİZ — control that builds.
 *
 * A seed that lands and slows what it catches, and a Super that grows a row of
 * living walls: solid to everyone, shootable by anyone, gone in eight seconds.
 * It is the first character who changes the shape of the map during a fight.
 */
export const filizKit: Kit = {
  id: 'filiz',
  maxAmmo: 3,

  attack: {
    name: 'Tohum Bombası',
    actions: [
      { type: 'sound', cue: 'rocket_launch' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: 520,
          radius: 9,
          damage: 0,
          range: 480,
          color: '#86efac',
          offset: 22,
          motion: 'lob',
          onEnd: [
            {
              type: 'explosion',
              at: 'here',
              damage: { ofAttack: 1 },
              radius: 78,
              statuses: [{ kind: 'slow', duration: 1.4 }],
            },
            { type: 'vfx', at: 'here', effect: 'smoke_poof', radius: 70, color: '#4ade80', duration: 0.4 },
          ],
        },
      },
    ],
  },

  super: {
    name: 'Canlı Çit',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      { type: 'banner', text: 'CANLI ÇİT!', color: '#4ade80' },
      {
        type: 'summon',
        kind: 'wall',
        at: 'aim',
        offset: 130,
        lifetime: 8,
        hp: 3200,
        radius: 31,
        row: { count: 5, spacing: 62 },
      },
    ],
  },

  gadget: {
    name: 'Sarmaşık',
    actions: [
      { type: 'banner', text: 'SARMAŞIK!', color: '#86efac' },
      {
        type: 'explosion',
        at: 'self',
        damage: 250,
        radius: 150,
        statuses: [{ kind: 'root', duration: 1.4 }],
      },
      { type: 'vfx', at: 'self', effect: 'shockwave', radius: 150, color: '#4ade80', duration: 0.45 },
    ],
  },

  bot: {
    engageRange: 0.95,
    superRange: { min: 0.2, max: 0.9 },
    gadget: { when: 'enemyWithin', range: 150 },
    ignoresCover: true,
  },
};
