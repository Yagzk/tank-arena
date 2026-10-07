/**
 * A pool of damage absorbed before health is touched.
 *
 * Kept separate from healing so a shield cannot regenerate out of combat and
 * cannot be topped up by a support: it is a window, not a second health bar.
 */

import type { BrawlerEntity } from '../../types/brawl';
import type { SimWorld } from '../world';
import { applyStatus } from './applyStatus';

export function applyShield(
  world: SimWorld,
  caster: BrawlerEntity,
  amount: number,
  duration: number,
  radius?: number
): void {
  if (radius === undefined) {
    applyStatus(caster, { kind: 'shield', duration, magnitude: amount });
    return;
  }

  const r2 = radius * radius;
  for (const other of world.brawlers) {
    if (other.team !== caster.team || other.isClone || !other.isAlive) continue;
    const dx = other.x - caster.x;
    const dy = other.y - caster.y;
    if (dx * dx + dy * dy > r2) continue;
    applyStatus(other, { kind: 'shield', duration, magnitude: amount });
  }
}

/**
 * Spends shield before health, and reports the damage that got through.
 *
 * Called from the engine's damage funnel so every source goes through it —
 * bullets, burning ground, the closing gas.
 */
export function absorbWithShield(b: BrawlerEntity, damage: number): number {
  if (b.shieldHp <= 0) return damage;
  const absorbed = Math.min(b.shieldHp, damage);
  b.shieldHp -= absorbed;
  if (b.shieldHp <= 0) b.shieldTimer = 0;
  return damage - absorbed;
}
