/**
 * Super charge.
 *
 * Charge is proportional to damage dealt, never to how many projectiles
 * happened to connect. Charging a flat amount per pellet meant a five-pellet
 * shotgun blast filled 52% of the bar on one trigger pull: two attacks and the
 * Super was back.
 */

import { BRAWLERS, type BrawlerEntity } from '../../types/brawl';

export function chargeSuperFlat(b: BrawlerEntity, percent: number): void {
  b.superCharge = Math.min(100, Math.max(0, b.superCharge + percent));
}

/** Charge earned for dealing `damage` with a basic attack. */
export function chargeSuperForDamage(b: BrawlerEntity, damage: number): void {
  const cfg = BRAWLERS[b.brawlerId];
  const fullAttack = cfg.damagePerAttack * Math.max(1, cfg.projectileCount);
  chargeSuperFlat(b, (damage * 100) / (fullAttack * cfg.superHitsRequired));
}
