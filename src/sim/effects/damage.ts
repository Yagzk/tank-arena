/**
 * Single-target damage.
 *
 * Thin on purpose: the engine owns the damage funnel, because shields,
 * immunity, death, drops and the kill feed all have to happen in exactly one
 * place no matter whether the source was a bullet, a burning patch or the gas.
 * This primitive exists so kits never reach past the world interface.
 */

import type { BrawlerEntity } from '../../types/brawl';
import type { SimWorld } from '../world';

export interface DamageParams {
  target: BrawlerEntity;
  amount: number;
  sourceId: string;
  /** Floating numbers are noise for per-tick sources like burning ground. */
  showNumber?: boolean;
}

export function applyDamage(world: SimWorld, p: DamageParams): void {
  if (p.amount <= 0 || !p.target.isAlive) return;
  world.damage(p.target, Math.round(p.amount), p.sourceId, p.showNumber !== false);
}
