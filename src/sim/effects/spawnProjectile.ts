/**
 * Projectile creation.
 *
 * Everything about how a shot behaves after it leaves the barrel — whether it
 * curves, bounces, arcs over walls, pierces, what it leaves behind — is data
 * carried on the projectile, read by the projectile system. No character is
 * named here, which is the whole point: a thrown bottle and a sniper round
 * differ by their numbers, not by a branch in the engine.
 */

import type { BrawlProjectile, BrawlerId } from '../../types/brawl';
import type { SimWorld } from '../world';
import type { ProjectileSpec } from '../kits/schema';

export interface SpawnProjectileParams {
  spec: ProjectileSpec;
  /** Resolved damage, after the caster's multipliers. */
  damage: number;
  x: number;
  y: number;
  angle: number;
  ownerId: string;
  brawlerId: BrawlerId;
  team: number;
  isSuper: boolean;
  /** Key into the compiled hook registry, if this projectile has hooks. */
  hooks?: string;
  /** Overrides the spec's range — a lob stops where the player aimed. */
  range?: number;
  /** Sign of the curve, so a pair of projectiles can mirror each other. */
  curveSign?: number;
}

export function spawnProjectile(world: SimWorld, p: SpawnProjectileParams): BrawlProjectile {
  const { spec } = p;
  const offset = spec.offset ?? 20;
  const cos = Math.cos(p.angle);
  const sin = Math.sin(p.angle);
  const range = p.range ?? spec.range;

  const proj: BrawlProjectile = {
    id: world.nextId('proj'),
    ownerId: p.ownerId,
    brawlerId: p.brawlerId,
    team: p.team,
    x: p.x + cos * offset,
    y: p.y + sin * offset,
    vx: cos * spec.speed,
    vy: sin * spec.speed,
    radius: spec.radius,
    damage: Math.round(p.damage),
    maxRange: range,
    traveled: 0,
    isSuper: p.isSuper,
    color: spec.color,
    piercesWalls: spec.piercesWalls === true,
    breaksWalls: spec.breaksWalls === true,
    piercesBodies: spec.piercesBodies === true,
    motion: spec.motion ?? 'straight',
    hooks: p.hooks,
  };

  if (spec.knockback) proj.knockbackForce = spec.knockback;
  if (spec.charge !== undefined) proj.charge = spec.charge;
  if (spec.pushback) proj.pushback = spec.pushback;
  if (spec.falloff) {
    proj.falloff = {
      near: spec.falloff.near,
      far: spec.falloff.far,
      range: spec.falloff.distance,
      hold: spec.falloff.hold ?? 0,
    };
  }

  switch (proj.motion) {
    case 'curve':
      proj.curveRate = (spec.curveRate ?? 2.5) * (p.curveSign ?? 1);
      break;
    case 'bounce':
      proj.bouncesLeft = spec.bounces ?? 2;
      break;
    case 'lob':
      // A lob is defined by where it lands, so its range *is* its turn point.
      proj.turnAt = range;
      break;
    case 'boomerang':
      // Out to half its range, then back along the same line.
      proj.turnAt = range * 0.5;
      break;
  }

  world.projectiles.push(proj);
  return proj;
}
