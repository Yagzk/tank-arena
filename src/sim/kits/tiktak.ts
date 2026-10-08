import type { Kit } from './schema';

/**
 * TİKTAK — mines, thrown.
 *
 * Every shot is a grenade that goes off where it lands, and the Super sows the
 * ground with mines that wait. The difference from a turret is that a mine is
 * only a threat to somebody who walks into it, which makes the map the weapon.
 */
export const tiktakKit: Kit = {
  id: 'tiktak',
  maxAmmo: 3,

  attack: {
    name: 'Saatli Bomba',
    actions: [
      { type: 'sound', cue: 'rocket_launch' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: 540,
          radius: 10,
          damage: 0,
          range: 450,
          color: '#fbbf24',
          offset: 22,
          motion: 'lob',
          onEnd: [
            { type: 'explosion', at: 'here', damage: { ofAttack: 1 }, radius: 70 },
            { type: 'vfx', at: 'here', effect: 'explosion', radius: 60, color: '#f59e0b', duration: 0.3, intensity: 0.5 },
          ],
        },
      },
    ],
  },

  super: {
    name: 'Mayın Tarlası',
    actions: [
      { type: 'sound', cue: 'gadget_activate' },
      { type: 'banner', text: 'MAYIN TARLASI!', color: '#fbbf24' },
      {
        type: 'burst',
        count: 6,
        interval: 0.1,
        scatter: 210,
        actions: [
          {
            type: 'summon',
            kind: 'mine',
            at: 'target',
            lifetime: 14,
            hp: 350,
            radius: 13,
            range: 54,
            interval: 0.6,
            onAct: [
              { type: 'sound', cue: 'explosion' },
              { type: 'explosion', at: 'self', damage: 900, radius: 95, knockback: 300 },
              { type: 'vfx', at: 'self', effect: 'explosion', radius: 90, color: '#f59e0b', duration: 0.35, intensity: 0.7 },
            ],
          },
        ],
      },
    ],
  },

  gadget: {
    name: 'Ayak Altı',
    actions: [
      { type: 'banner', text: 'MAYIN!', color: '#fde68a' },
      {
        type: 'summon',
        kind: 'mine',
        at: 'self',
        lifetime: 12,
        hp: 350,
        radius: 13,
        range: 54,
        interval: 0.7,
        onAct: [
          { type: 'explosion', at: 'self', damage: 800, radius: 92, knockback: 320 },
          { type: 'vfx', at: 'self', effect: 'explosion', radius: 90, color: '#f59e0b', duration: 0.35 },
        ],
      },
      { type: 'status', target: 'self', statuses: [{ kind: 'speed', duration: 1.5, magnitude: 1.3 }] },
    ],
  },

  bot: {
    engageRange: 0.95,
    superRange: { max: 1.0 },
    gadget: { when: 'enemyWithin', range: 200 },
    ignoresCover: true,
  },
};
