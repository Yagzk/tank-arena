/**
 * Everything a brawler left behind, ticking on its own.
 *
 * Five decision rules, one entity. A turret looks for a target it can see and
 * shoots it; a minion walks at the nearest enemy; a mine waits and goes off; a
 * station acts on its own team on a timer; a barrier does nothing at all and
 * is only there to be in the way.
 *
 * What each of them *does* when it acts is not here — that is an action list
 * from the kit, run through the same interpreter as everything else. So the
 * turret that fires bolts and the turret that fires a healing pulse are the
 * same code and different data.
 */

import type { BrawlerEntity, DeployedEntity } from '../../types/brawl';
import type { SimWorld } from '../world';
import { hasLineOfSight } from '../../core/collision';
import { getActions } from '../kits/registry';
import { runActions, type AbilityContext } from '../abilities';

/** How far outside its radius a mine or minion counts as touching someone. */
const CONTACT_MARGIN = 20;

function nearestHostile(world: SimWorld, d: DeployedEntity, range: number): BrawlerEntity | null {
  let best: BrawlerEntity | null = null;
  let bestDist = range;

  for (const b of world.brawlers) {
    if (!world.isHostile(d.team, b)) continue;
    // Anything airborne is out of reach, and a brawler under respawn
    // protection should not be what a turret decides to aim at.
    if (b.isJumping || b.immunityTimer > 0) continue;
    // A deployable cannot see into a bush any better than a player can.
    if (b.isInBush && !b.isVisibleToEnemies) continue;

    const dist = Math.hypot(b.x - d.x, b.y - d.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = b;
    }
  }
  return best;
}

function contextFor(
  world: SimWorld,
  d: DeployedEntity,
  owner: BrawlerEntity,
  aimAngle: number,
  targetX: number,
  targetY: number
): AbilityContext {
  return {
    world,
    caster: owner,
    aimAngle,
    targetX,
    targetY,
    // The owner's power cubes still count: a deployable is their damage.
    damageMultiplier: 1 + owner.powerCubes * 0.1,
    isSuper: false,
    // Shots come out of the deployable, not out of whoever placed it.
    originX: d.x,
    originY: d.y,
    hereX: d.x,
    hereY: d.y,
    scale: 1,
  };
}

function act(
  world: SimWorld,
  d: DeployedEntity,
  owner: BrawlerEntity,
  aimAngle: number,
  targetX: number,
  targetY: number
): void {
  if (!d.actionKey) return;
  const actions = getActions(d.actionKey);
  if (!actions) return;
  if (d.kind === 'turret') world.sound('turret_shot', d.x, d.y);
  runActions(contextFor(world, d, owner, aimAngle, targetX, targetY), actions);
}

export function updateDeployables(world: SimWorld, dt: number): void {
  for (let i = world.deployables.length - 1; i >= 0; i--) {
    const d = world.deployables[i];

    d.lifetime -= dt;
    if (d.actTimer > 0) d.actTimer -= dt;

    if (d.lifetime <= 0 || d.hp <= 0 || d.spent) {
      // Destroyed and expired look different on purpose: one is something you
      // did, the other is the clock running out.
      const violent = d.hp <= 0 || d.spent;
      world.vfx(
        violent ? 'explosion' : 'smoke_poof',
        d.x,
        d.y,
        d.radius + (violent ? 18 : 8),
        violent ? '#fbbf24' : '#94a3b8',
        violent ? 0.35 : 0.3
      );
      world.deployables.splice(i, 1);
      continue;
    }

    const owner = world.brawlers.find(b => b.id === d.ownerId);
    // A deployable outlives its owner's death — that is most of the point of
    // placing one — but not their removal from the match.
    if (!owner) {
      world.deployables.splice(i, 1);
      continue;
    }

    switch (d.behaviour) {
      case 'turret': {
        const target = nearestHostile(world, d, d.range);
        if (!target) break;
        if (!hasLineOfSight(d.x, d.y, target.x, target.y, world.walls)) break;

        d.angle = Math.atan2(target.y - d.y, target.x - d.x);
        if (d.actTimer <= 0) {
          d.actTimer = d.interval;
          act(world, d, owner, d.angle, target.x, target.y);
        }
        break;
      }

      case 'chase': {
        const target = nearestHostile(world, d, Infinity);
        if (!target) break;

        const angle = Math.atan2(target.y - d.y, target.x - d.x);
        d.angle = angle;
        const gap = Math.hypot(target.x - d.x, target.y - d.y);

        if (gap > d.radius + CONTACT_MARGIN) {
          // Walks straight at its target. Pathfinding is the bots' problem;
          // a minion that gets stuck behind a wall is a minion you can dodge.
          d.x += Math.cos(angle) * (d.speed ?? 140) * dt;
          d.y += Math.sin(angle) * (d.speed ?? 140) * dt;
        } else if (d.actTimer <= 0) {
          d.actTimer = d.interval;
          act(world, d, owner, angle, target.x, target.y);
        }
        break;
      }

      case 'proximity': {
        const target = nearestHostile(world, d, d.range + CONTACT_MARGIN);
        if (!target) break;
        // Mines are armed by their spawn delay, then go off once.
        if (d.actTimer > 0) break;
        d.spent = true;
        act(world, d, owner, Math.atan2(target.y - d.y, target.x - d.x), target.x, target.y);
        break;
      }

      case 'aura': {
        if (d.actTimer > 0) break;
        d.actTimer = d.interval;
        act(world, d, owner, d.angle, d.x, d.y);
        break;
      }

      case 'blocker':
        // Stands still and stops bullets. The projectile system does the work.
        break;
    }
  }
}

/** Removes every deployable, for a new round. */
export function clearDeployables(world: SimWorld): void {
  world.deployables.length = 0;
}
