/**
 * Picking a map.
 *
 * The choice is seeded, not random: every peer in a match derives it from the
 * same room seed, so nobody has to send the map over the wire and nobody can
 * end up playing a different one.
 */

import type { BrawlGameMode } from '../types/brawl';
import { Rng } from '../core/rng';
import { MAP_POOL } from './pool';
import { buildMap, validateMap, type MapData, type TileMapSource } from './format';

export {
  TILE,
  GRID_W,
  GRID_H,
  MAP_WIDTH,
  MAP_HEIGHT,
  TILES,
  expandMap,
  validateMap,
  buildMap,
} from './format';
export type { MapData, SpawnPoint, TileMapSource, Symmetry } from './format';
export { MAP_POOL } from './pool';

// Checked once, at load. A map that cannot be played should stop the app
// rather than drop a team into a sealed base in front of a human being.
const problems: string[] = [];
for (const map of MAP_POOL) problems.push(...validateMap(map));
if (problems.length > 0) {
  throw new Error('Bozuk harita:\n  ' + problems.join('\n  '));
}

export function mapsFor(mode: BrawlGameMode): TileMapSource[] {
  return MAP_POOL.filter(m => m.modes.includes(mode));
}

/** The map a given seed lands on, for a mode. */
export function pickMap(mode: BrawlGameMode, seed: number): TileMapSource {
  const pool = mapsFor(mode);
  const rng = new Rng(seed ^ 0x9e3779b9);
  return pool[rng.int(0, pool.length - 1)];
}

/** Builds the geometry for a match. */
export function generateBrawlMap(mode: BrawlGameMode, seed: number = 1): MapData {
  return buildMap(pickMap(mode, seed), mode);
}
