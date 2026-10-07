/**
 * Drag a body toward a point — a hook, a vortex, a grab.
 *
 * Pull is not knockback with a flipped sign: the impulse has to be clamped by
 * the distance left, or a target standing right next to the caster is flung
 * straight past them and out the other side.
 */

import type { BrawlerEntity } from '../../types/brawl';

export function applyPull(
  target: BrawlerEntity,
  towardX: number,
  towardY: number,
  force: number,
  stun = 0
): void {
  const dx = towardX - target.x;
  const dy = towardY - target.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  // Momentum decays at exp(-7t), so the ground a body covers is roughly
  // force/7. Never ask for more than the gap itself.
  const capped = Math.min(force, len * 7);
  target.knockbackVx += (dx / len) * capped;
  target.knockbackVy += (dy / len) * capped;
  if (stun > 0) target.stunTimer = Math.max(target.stunTimer, stun);
}

/** Places a body directly, for grabs that reposition rather than drag. */
export function placeAt(target: BrawlerEntity, x: number, y: number): void {
  target.x = x;
  target.y = y;
  target.prevX = x;
  target.prevY = y;
}
