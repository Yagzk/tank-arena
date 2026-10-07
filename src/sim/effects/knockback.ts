/**
 * Impulse away from a point.
 *
 * Added to existing momentum rather than replacing it, so two blasts landing
 * together throw a body further than one — which is how a knockback combo is
 * supposed to read.
 */

import type { BrawlerEntity } from '../../types/brawl';

export function applyKnockback(
  target: BrawlerEntity,
  fromX: number,
  fromY: number,
  force: number,
  stun = 0
): void {
  if (force === 0) return;
  const dx = target.x - fromX;
  const dy = target.y - fromY;
  const len = Math.hypot(dx, dy) || 1;
  target.knockbackVx += (dx / len) * force;
  target.knockbackVy += (dy / len) * force;
  if (stun > 0) target.stunTimer = Math.max(target.stunTimer, stun);
}

/** Impulse along a heading, for dashes and directional throws. */
export function applyImpulse(target: BrawlerEntity, angle: number, force: number): void {
  target.knockbackVx += Math.cos(angle) * force;
  target.knockbackVy += Math.sin(angle) * force;
}
