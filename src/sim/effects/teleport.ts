/**
 * Instant repositioning.
 *
 * `prevX`/`prevY` move with the body on purpose. The renderer interpolates
 * between simulation ticks, so leaving them behind would draw the brawler
 * smoothly sliding across the map instead of appearing at the destination.
 */

import type { BrawlerEntity } from '../../types/brawl';

export function teleport(b: BrawlerEntity, x: number, y: number): void {
  b.x = x;
  b.y = y;
  b.prevX = x;
  b.prevY = y;
  b.vx = 0;
  b.vy = 0;
  b.knockbackVx = 0;
  b.knockbackVy = 0;
}
