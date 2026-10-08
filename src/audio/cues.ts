/**
 * The names of the sounds, and nothing else.
 *
 * Kept apart from the recipes so the simulation can name a sound without
 * importing anything that knows what audio is — the game server runs the same
 * engine with no browser types at all.
 */

export type SoundType =
  | 'scatter_shot'
  | 'rapid_shot'
  | 'heavy_punch'
  | 'heavy_leap'
  | 'rocket_launch'
  | 'blade_throw'
  | 'turret_shot'
  | 'super_ready'
  | 'super_blast'
  | 'explosion'
  | 'gadget_activate'
  | 'band_aid'
  | 'heal_pulse'
  | 'shield_up'
  | 'rapid_reload'
  | 'gem_pickup'
  | 'cube_pickup'
  | 'hit'
  | 'kill'
  | 'death'
  | 'respawn'
  | 'star_player'
  | 'alarm'
  | 'countdown_tick'
  | 'countdown_go';
