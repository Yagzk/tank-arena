/**
 * A committed burst of movement along a heading.
 *
 * Implemented as an impulse on the momentum channel rather than as a scripted
 * path, which means a dash collides with walls and is interrupted by terrain
 * exactly like every other displacement in the game — no special cases, and no
 * way to end up inside a wall.
 */

import type { BrawlerEntity } from '../../types/brawl';
import { applyImpulse } from './knockback';

export function applyDash(b: BrawlerEntity, angle: number, speed: number): void {
  // Replace rather than add: a dash should cover the same ground whether or
  // not the brawler was already being thrown around.
  b.knockbackVx = 0;
  b.knockbackVy = 0;
  applyImpulse(b, angle, speed);
}
