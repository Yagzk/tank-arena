import type { Kit } from './schema';

/**
 * FUSE — artillery.
 *
 * One heavy rocket at a time, and a barrage that denies a whole area. Every
 * blast leaves ground burning, so a direct hit is rarely the point: the point
 * is that the tile is no longer somewhere you can stand.
 *
 * Note on the direct hit. Splash deliberately spares the body the rocket
 * actually connected with. Before the kit rewrite, a direct hit took the
 * rocket's damage *and* the full splash from the same rocket — 2720 instead of
 * 1360 — which quietly made this the hardest-hitting character in the game.
 */
export const fuseKit: Kit = {
  id: 'fuse',
  maxAmmo: 3,

  attack: {
    name: 'Tekli Roket',
    actions: [
      { type: 'sound', cue: 'rocket_launch' },
      {
        type: 'projectiles',
        delivery: { pattern: 'single' },
        projectile: {
          speed: 560,
          radius: 8,
          damage: { ofAttack: 1 },
          range: 540,
          color: '#fbbf24',
          offset: 25,
          onEnd: [
            {
              type: 'explosion',
              at: 'here',
              damage: { ofAttack: 1 },
              radius: 65,
              spawnFire: true,
            },
          ],
        },
      },
    ],
  },

  super: {
    name: 'Roket Yağmuru',
    actions: [
      { type: 'sound', cue: 'super_blast' },
      {
        type: 'burst',
        count: 9,
        interval: 0.12,
        // Rockets land scattered around the aim point rather than stacked on
        // it, which is what turns the Super into area denial.
        scatter: 170,
        actions: [
          {
            type: 'explosion',
            at: 'target',
            damage: 950,
            radius: 85,
            spawnFire: true,
          },
          { type: 'sound', cue: 'rocket_launch' },
        ],
      },
    ],
  },

  bot: {
    engageRange: 0.92,
    superRange: { max: 0.96 },
    // The jump is an escape, so it is worth spending when something is close.
    gadget: { when: 'enemyWithin', range: 120 },
  },

  gadget: {
    name: 'İtki Fişeği',
    actions: [
      { type: 'banner', text: 'ROKET BAĞCIKLARI!', color: '#f59e0b' },
      { type: 'jump', distance: 120 },
      {
        type: 'explosion',
        at: 'self',
        damage: 500,
        radius: 75,
        knockback: 250,
        spawnFire: true,
      },
      { type: 'sound', cue: 'rocket_launch' },
    ],
  },
};
