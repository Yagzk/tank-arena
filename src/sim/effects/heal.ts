/**
 * Healing, for one brawler or a team.
 *
 * Capped at maximum health rather than allowed to overheal, and it never
 * touches a dead body: a heal landing on someone who is waiting to respawn
 * would otherwise quietly revive them with no respawn timer.
 */

import type { BrawlerEntity } from '../../types/brawl';
import type { SimWorld } from '../world';

export interface HealParams {
  amount: number;
  /** Omit to heal the caster alone. */
  radius?: number;
  includeSelf?: boolean;
  showNumber?: boolean;
}

export function healOne(target: BrawlerEntity, amount: number): number {
  if (!target.isAlive || amount <= 0) return 0;
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  return target.hp - before;
}

export function applyHeal(world: SimWorld, caster: BrawlerEntity, p: HealParams): void {
  if (p.radius === undefined) {
    const healed = healOne(caster, p.amount);
    if (healed > 0 && p.showNumber) {
      world.banner('+' + Math.round(healed), caster.x, caster.y - 26, '#4ade80');
    }
    return;
  }

  const r2 = p.radius * p.radius;
  for (const other of world.brawlers) {
    if (other.team !== caster.team || other.isClone) continue;
    if (other.id === caster.id && p.includeSelf === false) continue;
    const dx = other.x - caster.x;
    const dy = other.y - caster.y;
    if (dx * dx + dy * dy > r2) continue;
    const healed = healOne(other, p.amount);
    if (healed > 0 && p.showNumber) {
      world.banner('+' + Math.round(healed), other.x, other.y - 26, '#4ade80');
    }
  }
}
