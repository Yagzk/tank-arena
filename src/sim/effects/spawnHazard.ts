/**
 * Ground that hurts: a thorn patch, a pool of fire.
 *
 * The two kinds stay separate entity lists rather than one list with a flag,
 * because the renderer draws them completely differently and thorns also slow
 * whatever stands in them.
 */

import type { SimWorld } from '../world';
import type { HazardSpec } from '../kits/schema';

export function spawnHazard(
  world: SimWorld,
  spec: HazardSpec,
  x: number,
  y: number,
  ownerId: string,
  team: number
): void {
  if (spec.kind === 'thorn') {
    world.thornFields.push({
      id: world.nextId('tf'),
      ownerId,
      team,
      x,
      y,
      radius: spec.radius,
      duration: spec.duration,
      damagePerSec: Math.round(spec.damagePerSec),
    });
    return;
  }

  world.firePatches.push({
    id: world.nextId('fire'),
    ownerId,
    team,
    x,
    y,
    radius: spec.radius,
    duration: spec.duration,
    damagePerSec: Math.round(spec.damagePerSec),
  });
}
