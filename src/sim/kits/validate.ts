/**
 * Kit validation.
 *
 * A kit is data, which means a typo is a silent zero rather than a compile
 * error: a projectile with no speed sits on the muzzle, a status with no
 * duration expires on the tick it was applied, a burst with no interval fires
 * its whole count in one frame. All of those are things you discover in the
 * middle of a match if nothing checks for them.
 *
 * So every kit is checked once at module load. A broken kit fails loudly at
 * startup, where it is five seconds of work to fix, instead of quietly during
 * play.
 */

import { BRAWLERS } from '../../types/brawl';
import type { AbilityAction, AbilitySpec, Kit, ProjectileSpec, StatusSpec } from './schema';

/** Guards against a kit that nests action lists into each other forever. */
const MAX_DEPTH = 8;

class Problems {
  readonly list: string[] = [];
  constructor(private readonly kitId: string) {}

  at(path: string, message: string): void {
    this.list.push(this.kitId + '.' + path + ': ' + message);
  }
}

function checkStatus(p: Problems, path: string, s: StatusSpec): void {
  if (!(s.duration > 0)) p.at(path, 'status "' + s.kind + '" needs a positive duration');
  if (s.kind === 'shield' && !(s.magnitude! > 0)) {
    p.at(path, 'a shield needs a magnitude — the pool it absorbs');
  }
  if (s.kind === 'burn' && s.magnitude !== undefined && !(s.magnitude > 0)) {
    p.at(path, 'burn magnitude is damage per second and must be positive');
  }
  if (s.kind === 'speed' && s.magnitude !== undefined && !(s.magnitude > 0)) {
    p.at(path, 'speed magnitude is a multiplier and must be positive');
  }
}

function checkProjectile(p: Problems, path: string, spec: ProjectileSpec, depth: number): void {
  if (!(spec.speed > 0)) p.at(path, 'projectile speed must be positive');
  if (!(spec.radius > 0)) p.at(path, 'projectile radius must be positive');
  if (!(spec.range > 0)) p.at(path, 'projectile range must be positive');
  if (!spec.color) p.at(path, 'projectile needs a colour');

  const dmg = spec.damage;
  if (typeof dmg === 'number') {
    if (dmg < 0) p.at(path, 'projectile damage cannot be negative');
  } else if (!(dmg.ofAttack > 0)) {
    p.at(path, 'ofAttack must be positive — use an absolute number for zero');
  }

  if (spec.motion === 'curve' && spec.curveRate !== undefined && spec.curveRate === 0) {
    p.at(path, 'a curving projectile with curveRate 0 is just a straight one');
  }
  if (spec.motion === 'bounce' && spec.bounces !== undefined && spec.bounces < 1) {
    p.at(path, 'a bouncing projectile needs at least one bounce');
  }
  if (spec.falloff) {
    if (!(spec.falloff.distance > 0)) p.at(path, 'falloff distance must be positive');
    if (spec.falloff.near <= spec.falloff.far) {
      p.at(path, 'falloff near multiplier should exceed far, or it is not a close-range bonus');
    }
  }

  if (spec.applyStatus) {
    spec.applyStatus.forEach((s, i) => checkStatus(p, path + '.applyStatus[' + i + ']', s));
  }
  if (spec.onHit) checkActions(p, path + '.onHit', spec.onHit, depth + 1);
  if (spec.onEnd) checkActions(p, path + '.onEnd', spec.onEnd, depth + 1);
}

function checkAction(p: Problems, path: string, action: AbilityAction, depth: number): void {
  switch (action.type) {
    case 'projectiles': {
      const d = action.delivery;
      if (d.pattern === 'spread') {
        if (!(d.count >= 1)) p.at(path, 'a spread needs at least one projectile');
        if (!(d.arc > 0)) p.at(path, 'a spread needs a positive arc');
      } else if (d.pattern === 'radial') {
        if (!(d.count >= 2)) p.at(path, 'a radial burst of one projectile is a single shot');
      }
      checkProjectile(p, path + '.projectile', action.projectile, depth);
      break;
    }

    case 'burst':
      if (!(action.count >= 1)) p.at(path, 'a burst needs at least one shot');
      if (!(action.interval > 0)) {
        p.at(path, 'a burst needs a positive interval, or it fires everything in one frame');
      }
      if (action.actions.length === 0) p.at(path, 'a burst with no actions does nothing');
      if ((action.aim === 'sweep' || action.aim === 'alternate' || action.aim === 'random') &&
          !(action.amplitude! > 0)) {
        p.at(path, 'aim "' + action.aim + '" needs an amplitude to vary across');
      }
      checkActions(p, path + '.actions', action.actions, depth + 1);
      break;

    case 'explosion':
      if (!(action.radius > 0)) p.at(path, 'an explosion needs a positive radius');
      if (action.burn) {
        if (!(action.burn.duration > 0)) p.at(path, 'burn duration must be positive');
        if (!(action.burn.damagePerSec > 0)) p.at(path, 'burn damage per second must be positive');
      }
      if (action.statuses) {
        action.statuses.forEach((s, i) => checkStatus(p, path + '.statuses[' + i + ']', s));
      }
      if (action.lifesteal !== undefined && !(action.lifesteal > 0 && action.lifesteal <= 2)) {
        p.at(path, 'lifesteal is a fraction of damage dealt, above 0 and at most 2');
      }
      break;

    case 'pull':
      if (!(action.range > 0)) p.at(path, 'a pull needs a positive range');
      if (!(action.force > 0)) p.at(path, 'a pull needs a positive force');
      if (action.statuses) {
        action.statuses.forEach((s, i) => checkStatus(p, path + '.statuses[' + i + ']', s));
      }
      break;

    case 'hazard':
      if (!(action.hazard.radius > 0)) p.at(path, 'a hazard needs a positive radius');
      if (!(action.hazard.duration > 0)) p.at(path, 'a hazard needs a positive duration');
      if (!(action.hazard.damagePerSec > 0)) {
        p.at(path, 'a hazard needs positive damage per second');
      }
      break;

    case 'status':
      if (action.statuses.length === 0) p.at(path, 'no statuses to apply');
      action.statuses.forEach((s, i) => checkStatus(p, path + '.statuses[' + i + ']', s));
      if (action.target !== 'self' && action.radius !== undefined && !(action.radius > 0)) {
        p.at(path, 'radius must be positive when given');
      }
      break;

    case 'heal':
      if (!(action.amount > 0)) p.at(path, 'a heal needs a positive amount');
      break;

    case 'shield':
      if (!(action.amount > 0)) p.at(path, 'a shield needs a positive pool');
      if (!(action.duration > 0)) p.at(path, 'a shield needs a positive duration');
      break;

    case 'ammo':
      if (action.amount === 0) p.at(path, 'an ammo action of zero does nothing');
      break;

    case 'superCharge':
      if (action.percent === 0) p.at(path, 'a super charge of zero does nothing');
      break;

    case 'dash':
      if (!(action.speed > 0)) p.at(path, 'a dash needs a positive speed');
      if (action.statuses) {
        action.statuses.forEach((s, i) => checkStatus(p, path + '.statuses[' + i + ']', s));
      }
      break;

    case 'jump':
      if (!action.toTarget && !(action.distance! > 0)) {
        p.at(path, 'a jump needs either toTarget or a positive distance');
      }
      if (action.onLand) {
        if (action.onLand.length === 0) p.at(path, 'an empty onLand list does nothing');
        checkActions(p, path + '.onLand', action.onLand, depth + 1);
      }
      break;

    case 'teleport':
      if (action.behindNearestEnemy !== undefined && !(action.behindNearestEnemy > 0)) {
        p.at(path, 'behindNearestEnemy is a search range and must be positive');
      }
      break;

    case 'grab':
      if (!(action.range > 0)) p.at(path, 'a grab needs a positive range');
      if (!(action.throwDistance > 0)) p.at(path, 'a grab needs a positive throw distance');
      if (action.statuses) {
        action.statuses.forEach((s, i) => checkStatus(p, path + '.statuses[' + i + ']', s));
      }
      break;

    case 'summon':
      if (!(action.lifetime > 0)) p.at(path, 'a summon needs a positive lifetime');
      if (action.kind !== 'decoy') {
        if (!(action.hp! > 0)) p.at(path, 'a deployable needs health, or it cannot be destroyed');
        if (action.kind !== 'barrier' && action.kind !== 'wall') {
          if (!action.onAct || action.onAct.length === 0) {
            p.at(path, 'a ' + action.kind + ' with no onAct list would just sit there');
          }
          if (!(action.interval! > 0)) p.at(path, 'a ' + action.kind + ' needs an interval');
          if (!(action.range! > 0)) p.at(path, 'a ' + action.kind + ' needs a range');
        }
        if (action.kind === 'minion' && !(action.speed! > 0)) {
          p.at(path, 'a minion that cannot move is a turret');
        }
      }
      if (action.onAct) checkActions(p, path + '.onAct', action.onAct, depth + 1);
      break;

    case 'chain':
      if (!(action.range > 0)) p.at(path, 'a chain needs a positive range');
      if (!(action.hops >= 1)) p.at(path, 'a chain needs at least one hop');
      if (!(action.hopRange > 0)) p.at(path, 'a chain needs a positive hop range');
      if (action.falloff !== undefined && !(action.falloff > 0 && action.falloff <= 1)) {
        p.at(path, 'chain falloff is a fraction above 0 and up to 1');
      }
      if (action.statuses) {
        action.statuses.forEach((s, i) => checkStatus(p, path + '.statuses[' + i + ']', s));
      }
      break;

    case 'vfx':
      if (!(action.radius > 0)) p.at(path, 'a visual effect needs a positive radius');
      if (!(action.duration > 0)) p.at(path, 'a visual effect needs a positive duration');
      break;

    case 'banner':
      if (!action.text) p.at(path, 'a banner with no text does nothing');
      break;

    case 'sound':
      break;
  }
}

function checkActions(p: Problems, path: string, actions: AbilityAction[], depth: number): void {
  if (depth > MAX_DEPTH) {
    p.at(path, 'nested deeper than ' + MAX_DEPTH + ' levels — almost certainly a cycle');
    return;
  }
  actions.forEach((action, i) => checkAction(p, path + '[' + i + ']', action, depth));
}

function checkAbility(p: Problems, path: string, ability: AbilitySpec): void {
  if (!ability.name) p.at(path, 'ability needs a name');
  if (ability.actions.length === 0) p.at(path, 'ability has no actions');
  checkActions(p, path + '.actions', ability.actions, 0);
}

/** Returns every problem found in a kit. An empty list means it is sound. */
export function validateKit(kit: Kit): string[] {
  const p = new Problems(kit.id);

  if (!BRAWLERS[kit.id]) p.at('id', 'no brawler config with this id');
  if (!(kit.maxAmmo >= 1 && kit.maxAmmo <= 6)) {
    p.at('maxAmmo', 'ammo slots outside the 1..6 the HUD can draw');
  }

  checkAbility(p, 'attack', kit.attack);
  checkAbility(p, 'super', kit.super);
  checkAbility(p, 'gadget', kit.gadget);

  kit.passives?.forEach((passive, i) => {
    const path = 'passives[' + i + ']';
    if (!passive.name) p.at(path, 'a passive needs a name — it keys its own cooldown');
    if (passive.actions.length === 0) p.at(path, 'a passive with no actions does nothing');
    if (passive.trigger === 'lowHealth') {
      const t = passive.threshold ?? 0.4;
      if (!(t > 0 && t < 1)) p.at(path, 'lowHealth threshold must be a fraction between 0 and 1');
    }
    if (passive.perSecond && passive.cooldown) {
      p.at(path, 'a per-second passive on a cooldown is a contradiction');
    }
    checkActions(p, path + '.actions', passive.actions, 0);
  });

  const traits = kit.traits;
  if (traits?.speedMultiplier !== undefined && !(traits.speedMultiplier > 0)) {
    p.at('traits.speedMultiplier', 'must be positive');
  }
  if (traits?.superChargeFromDamageTaken !== undefined && traits.superChargeFromDamageTaken < 0) {
    p.at('traits.superChargeFromDamageTaken', 'cannot be negative');
  }
  if (traits?.charge) {
    const c = traits.charge;
    if (!(c.time > 0)) p.at('traits.charge.time', 'must be positive');
    if (!(c.minScale > 0 && c.maxScale >= c.minScale)) {
      p.at('traits.charge', 'needs 0 < minScale <= maxScale');
    }
  }
  if (kit.combo) {
    if (kit.combo.length < 2) p.at('combo', 'a combo of one attack is just the attack');
    if (!(kit.comboWindow! > 0)) p.at('comboWindow', 'a combo needs a positive window');
    kit.combo.forEach((spec, i) => checkAbility(p, 'combo[' + i + ']', spec));
  }

  return p.list;
}
