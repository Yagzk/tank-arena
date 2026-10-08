/**
 * The one place that knows how a named status maps onto an entity.
 *
 * Statuses live as individual timers on the body rather than as a list of
 * objects. That is a deliberate trade: a fixed set of fields costs nothing per
 * tick, serialises into a network packet as plain numbers, and cannot allocate
 * in the hot loop — where a generic stack would do all three.
 *
 * Refresh rule: a status always takes the longer of what is already running
 * and what is being applied, so a weak reapplication can never cut a strong
 * one short.
 */

import type { BrawlerEntity } from '../../types/brawl';
import type { StatusSpec } from '../kits/schema';

function extend(current: number, duration: number): number {
  return Math.max(current, duration);
}

export function applyStatus(target: BrawlerEntity, s: StatusSpec): void {
  if (!target.isAlive) return;

  switch (s.kind) {
    case 'stun':
      target.stunTimer = extend(target.stunTimer, s.duration);
      break;

    case 'slow':
      target.slowTimer = extend(target.slowTimer, s.duration);
      break;

    case 'burn':
      target.burnTimer = extend(target.burnTimer, s.duration);
      // A second, stronger burn upgrades the rate; a weaker one does not
      // downgrade it.
      target.burnDamagePerSec = Math.max(target.burnDamagePerSec, s.magnitude ?? 300);
      break;

    case 'speed':
      target.speedBoostTimer = extend(target.speedBoostTimer, s.duration);
      target.speedBoostMagnitude = Math.max(target.speedBoostMagnitude, s.magnitude ?? 1.3);
      break;

    case 'invisible':
      target.invisibilityTimer = extend(target.invisibilityTimer, s.duration);
      break;

    case 'immunity':
      target.immunityTimer = extend(target.immunityTimer, s.duration);
      break;

    case 'shield':
      // Shields replace rather than stack, so two supports cannot make
      // someone unkillable by layering pools.
      target.shieldHp = Math.max(target.shieldHp, s.magnitude ?? 0);
      target.shieldTimer = extend(target.shieldTimer, s.duration);
      break;

    case 'silence':
      target.silenceTimer = extend(target.silenceTimer, s.duration);
      break;

    case 'root':
      target.rootTimer = extend(target.rootTimer, s.duration);
      break;

    case 'reveal':
      target.revealTimer = extend(target.revealTimer, s.duration);
      break;

    case 'reflect':
      target.reflectTimer = extend(target.reflectTimer, s.duration);
      break;
  }
}

export function applyStatuses(target: BrawlerEntity, list: StatusSpec[] | undefined): void {
  if (!list) return;
  for (let i = 0; i < list.length; i++) applyStatus(target, list[i]);
}

/** Advances every status timer by one tick. */
export function tickStatuses(b: BrawlerEntity, dt: number): void {
  if (b.stunTimer > 0) b.stunTimer -= dt;
  if (b.slowTimer > 0) b.slowTimer -= dt;
  if (b.speedBoostTimer > 0) {
    b.speedBoostTimer -= dt;
    if (b.speedBoostTimer <= 0) b.speedBoostMagnitude = 1;
  }
  if (b.invisibilityTimer > 0) b.invisibilityTimer -= dt;
  if (b.immunityTimer > 0) b.immunityTimer -= dt;
  if (b.silenceTimer > 0) b.silenceTimer -= dt;
  if (b.rootTimer > 0) b.rootTimer -= dt;
  if (b.revealTimer > 0) b.revealTimer -= dt;
  if (b.reflectTimer > 0) b.reflectTimer -= dt;
  if (b.comboTimer > 0) b.comboTimer -= dt;
  if (b.phaseTimer > 0) b.phaseTimer -= dt;
  if (b.shieldTimer > 0) {
    b.shieldTimer -= dt;
    if (b.shieldTimer <= 0) b.shieldHp = 0;
  }
}
