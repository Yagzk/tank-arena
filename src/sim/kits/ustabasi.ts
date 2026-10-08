import type { Kit } from './schema';

/**
 * USTABAŞI — deployer.
 *
 * A wide, cheap spread that is unremarkable on its own, and two machines that
 * hold ground without being stood on. The character is about where you choose
 * to put things, which is why the turret has to be destructible: a turret that
 * cannot be removed is not a position, it is a wall.
 */
export const ustabasiKit: Kit = {
  id: 'ustabasi',
  maxAmmo: 3,

  // Balance dial: see docs/DENGE.md.
  traits: { damageScale: 0.89 },

  attack: {
    name: 'Hurda Yağmuru',
    actions: [
      { type: 'sound', cue: 'scatter_shot' },
      {
        type: 'projectiles',
        delivery: { pattern: 'spread', count: 7, arc: 0.5 },
        projectile: {
          speed: 500,
          radius: 5.5,
          damage: { ofAttack: 1 },
          range: 420,
          color: '#facc15',
          offset: 22,
        },
      },
    ],
  },

  bot: {
    engageRange: 0.9,
    // A turret wants to go down while there is still a fight to hold, not
    // across the map from one.
    superRange: { max: 1.1 },
    gadget: { when: 'enemyWithin', range: 170 },
  },

  super: {
    name: 'Otomatik Taret',
    actions: [
      { type: 'sound', cue: 'gadget_activate' },
      { type: 'banner', text: 'TARET KURULDU!', color: '#facc15' },
      {
        type: 'summon',
        kind: 'turret',
        at: 'aim',
        offset: 58,
        lifetime: 24,
        hp: 2400,
        radius: 20,
        // Slightly shorter reach than its owner's attack, so taking it down is
        // a matter of approaching from the right angle rather than impossible.
        range: 360,
        interval: 0.42,
        onAct: [
          {
            type: 'projectiles',
            delivery: { pattern: 'single' },
            projectile: {
              speed: 620,
              radius: 5,
              damage: 300,
              range: 380,
              color: '#fde047',
              offset: 18,
            },
          },
        ],
      },
    ],
  },

  gadget: {
    name: 'Tuzak',
    actions: [
      { type: 'banner', text: 'TUZAK!', color: '#facc15' },
      {
        type: 'summon',
        kind: 'mine',
        at: 'self',
        lifetime: 20,
        hp: 400,
        radius: 13,
        range: 44,
        // Doubles as the arming delay: it cannot go off the instant it lands.
        interval: 0.8,
        onAct: [
          { type: 'sound', cue: 'super_blast' },
          {
            type: 'explosion',
            at: 'self',
            damage: 1100,
            radius: 92,
            knockback: 360,
          },
          {
            type: 'vfx',
            at: 'self',
            effect: 'explosion',
            radius: 92,
            color: '#facc15',
            duration: 0.35,
            intensity: 0.8,
          },
        ],
      },
    ],
  },
};
