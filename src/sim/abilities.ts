/**
 * The kit interpreter.
 *
 * This file replaces three `switch (b.brawlerId)` blocks that between them
 * held every attack, Super and gadget in the game. The switch here is over
 * *action kinds* — a fixed, finite vocabulary — so the twenty-fourth brawler
 * adds no branch to it, and neither does the ninety-sixth gadget.
 *
 * Nothing in here is allowed to know a character's name.
 */

import { BRAWLERS, type BrawlerEntity } from '../types/brawl';
import type { SimWorld } from './world';
import type {
  AbilityAction,
  AbilitySpec,
  Anchor,
  DamageSpec,
  Delivery,
  PassiveSpec,
} from './kits/schema';
import { getActions, getHooks, keyFor } from './kits/registry';
import {
  applyDamage,
  applyDash,
  applyHeal,
  applyPull,
  applyShield,
  applyStatus,
  applyStatuses,
  chargeSuperFlat,
  placeAt,
  restoreAmmo,
  spawnDecoy,
  spawnHazard,
  spawnProjectile,
  teleport,
} from './effects';

export interface AbilityContext {
  world: SimWorld;
  caster: BrawlerEntity;
  /** Direction the ability points. A burst rewrites this per shot. */
  aimAngle: number;
  /** The point the player aimed a placed ability at. */
  targetX: number;
  targetY: number;
  /** Power cubes and similar, folded into one factor. */
  damageMultiplier: number;
  isSuper: boolean;
  /** Position of whatever triggered this list, for the `here` anchor. */
  hereX: number;
  hereY: number;
  /**
   * Scales continuous effects. One for an instantaneous ability; the tick
   * length for a passive that describes a rate.
   */
  scale: number;
  /** A body any blast in this list must spare. See `ExplosionParams`. */
  excludeId?: string;
}

/** Spawn angles for one delivery pattern, reused so firing allocates nothing. */
const angleScratch: number[] = new Array(64).fill(0);

export function makeContext(
  world: SimWorld,
  caster: BrawlerEntity,
  opts: Partial<AbilityContext> = {}
): AbilityContext {
  return {
    world,
    caster,
    aimAngle: opts.aimAngle ?? caster.aimAngle,
    targetX: opts.targetX ?? caster.x,
    targetY: opts.targetY ?? caster.y,
    damageMultiplier: opts.damageMultiplier ?? 1 + caster.powerCubes * 0.1,
    isSuper: opts.isSuper ?? false,
    hereX: opts.hereX ?? caster.x,
    hereY: opts.hereY ?? caster.y,
    scale: opts.scale ?? 1,
    excludeId: opts.excludeId,
  };
}

function resolveDamage(spec: DamageSpec, ctx: AbilityContext): number {
  const base =
    typeof spec === 'number'
      ? spec
      : BRAWLERS[ctx.caster.brawlerId].damagePerAttack * spec.ofAttack;
  return base * ctx.damageMultiplier * ctx.scale;
}

function anchorX(at: Anchor, offset: number, ctx: AbilityContext): number {
  switch (at) {
    case 'self':
      return ctx.caster.x;
    case 'aim':
      return ctx.caster.x + Math.cos(ctx.aimAngle) * offset;
    case 'target':
      return ctx.targetX;
    case 'here':
      return ctx.hereX;
  }
}

function anchorY(at: Anchor, offset: number, ctx: AbilityContext): number {
  switch (at) {
    case 'self':
      return ctx.caster.y;
    case 'aim':
      return ctx.caster.y + Math.sin(ctx.aimAngle) * offset;
    case 'target':
      return ctx.targetY;
    case 'here':
      return ctx.hereY;
  }
}

/** Fills the scratch buffer with one angle per projectile. Returns the count. */
function resolveDelivery(delivery: Delivery, aimAngle: number): number {
  switch (delivery.pattern) {
    case 'single':
      angleScratch[0] = aimAngle;
      return 1;

    case 'spread': {
      const n = Math.min(delivery.count, angleScratch.length);
      for (let i = 0; i < n; i++) {
        // A single-projectile "spread" would divide by zero; it is also just
        // a single shot, so centre it.
        const t = n === 1 ? 0 : i / (n - 1) - 0.5;
        angleScratch[i] = aimAngle + t * delivery.arc;
      }
      return n;
    }

    case 'radial': {
      const n = Math.min(delivery.count, angleScratch.length);
      for (let i = 0; i < n; i++) {
        angleScratch[i] = aimAngle + (i * Math.PI * 2) / n;
      }
      return n;
    }
  }
}

function nearestHostile(
  world: SimWorld,
  from: BrawlerEntity,
  range: number
): BrawlerEntity | null {
  let best: BrawlerEntity | null = null;
  let bestDist = range;
  for (const other of world.brawlers) {
    if (other.id === from.id || !other.isAlive) continue;
    if (!world.isHostile(from.team, other)) continue;
    const d = Math.hypot(other.x - from.x, other.y - from.y);
    if (d < bestDist) {
      bestDist = d;
      best = other;
    }
  }
  return best;
}

export function runActions(ctx: AbilityContext, actions: AbilityAction[]): void {
  for (let i = 0; i < actions.length; i++) runAction(ctx, actions[i]);
}

function runAction(ctx: AbilityContext, action: AbilityAction): void {
  const { world, caster } = ctx;

  switch (action.type) {
    case 'projectiles': {
      const spec = action.projectile;
      const hooks = keyFor(spec);
      const count = resolveDelivery(action.delivery, ctx.aimAngle);
      // Mirroring the curve opens a fan outward. Around a radial burst it
      // would just make half the ring turn the wrong way.
      const mirror = action.delivery.pattern === 'spread';
      const damage = resolveDamage(spec.damage, ctx);
      // A lob lands where the player pointed, not at the end of its stated
      // range: that is the whole point of arcing over a wall.
      const range =
        spec.motion === 'lob'
          ? Math.min(spec.range, Math.hypot(ctx.targetX - caster.x, ctx.targetY - caster.y))
          : undefined;

      for (let i = 0; i < count; i++) {
        spawnProjectile(world, {
          spec,
          damage,
          x: caster.x,
          y: caster.y,
          angle: angleScratch[i],
          ownerId: caster.id,
          brawlerId: caster.brawlerId,
          team: caster.team,
          isSuper: ctx.isSuper,
          hooks,
          range,
          curveSign: mirror && i < count / 2 ? -1 : 1,
        });
      }
      break;
    }

    case 'burst': {
      const key = keyFor(action);
      if (!key) break;
      caster.pendingBurst = {
        actionKey: key,
        remaining: action.count,
        interval: action.interval,
        // Zero, so the first shot leaves on the next tick. The queue is
        // drained near the top of the brawler update, deliberately ahead of
        // input and of the stun check: a burst that has been paid for must
        // finish even if the player lets go of the trigger or gets stunned
        // half way through it.
        timer: 0,
        index: 0,
        count: action.count,
        aim: action.aim ?? 'fixed',
        amplitude: action.amplitude ?? 0,
        scatter: action.scatter ?? 0,
        aimAngle: ctx.aimAngle,
        targetX: ctx.targetX,
        targetY: ctx.targetY,
        isSuper: ctx.isSuper,
        damageMultiplier: ctx.damageMultiplier,
      };
      break;
    }

    case 'explosion': {
      const offset = action.anchorOffset ?? 0;
      world.explode({
        x: anchorX(action.at, offset, ctx),
        y: anchorY(action.at, offset, ctx),
        ownerId: caster.id,
        team: caster.team,
        damage: Math.round(resolveDamage(action.damage, ctx)),
        radius: action.radius,
        knockback: action.knockback,
        spawnFire: action.spawnFire,
        burn: action.burn,
        excludeId: ctx.excludeId,
      });
      break;
    }

    case 'hazard': {
      const offset = action.anchorOffset ?? 0;
      spawnHazard(
        world,
        {
          ...action.hazard,
          damagePerSec: action.hazard.damagePerSec * ctx.damageMultiplier,
        },
        anchorX(action.at, offset, ctx),
        anchorY(action.at, offset, ctx),
        caster.id,
        caster.team
      );
      break;
    }

    case 'status': {
      if (action.target === 'self') {
        applyStatuses(caster, action.statuses);
        break;
      }
      const radius = action.radius ?? Infinity;
      const r2 = radius * radius;
      for (const other of world.brawlers) {
        if (other.isClone || !other.isAlive) continue;
        const friendly = other.team === caster.team;
        if (action.target === 'allies' && !friendly) continue;
        if (action.target === 'enemies' && !world.isHostile(caster.team, other)) continue;
        const dx = other.x - caster.x;
        const dy = other.y - caster.y;
        if (dx * dx + dy * dy > r2) continue;
        applyStatuses(other, action.statuses);
      }
      break;
    }

    case 'heal':
      applyHeal(world, caster, {
        amount: action.amount * ctx.scale,
        radius: action.target === 'allies' ? (action.radius ?? 200) : undefined,
        showNumber: ctx.scale === 1,
      });
      break;

    case 'shield':
      applyShield(
        world,
        caster,
        action.amount,
        action.duration,
        action.target === 'allies' ? (action.radius ?? 220) : undefined
      );
      break;

    case 'ammo': {
      const gained = restoreAmmo(caster, action.amount);
      if (gained > 0) world.banner('+' + gained + ' CEPHANE', caster.x, caster.y - 26, '#fbbf24');
      break;
    }

    case 'superCharge':
      chargeSuperFlat(caster, action.percent);
      break;

    case 'dash':
      applyDash(caster, ctx.aimAngle, action.speed);
      applyStatuses(caster, action.statuses);
      break;

    case 'jump': {
      const dx = ctx.targetX - caster.x;
      const dy = ctx.targetY - caster.y;
      const toTargetDist = Math.hypot(dx, dy);
      const angle = action.toTarget && toTargetDist > 1 ? Math.atan2(dy, dx) : ctx.aimAngle;
      // Falling back to a default when the player has not aimed means the
      // Super still goes somewhere useful instead of landing underfoot.
      const distance = action.toTarget
        ? Math.min(action.maxDistance ?? 380, toTargetDist || (action.distance ?? 280))
        : (action.distance ?? 200);

      caster.isJumping = true;
      caster.jumpProgress = 0;
      caster.jumpStartX = caster.x;
      caster.jumpStartY = caster.y;
      caster.jumpTargetX = caster.x + Math.cos(angle) * distance;
      caster.jumpTargetY = caster.y + Math.sin(angle) * distance;
      caster.jumpLandKey = action.onLand ? keyFor(action) : undefined;
      break;
    }

    case 'teleport': {
      if (action.behindNearestEnemy !== undefined) {
        const target = nearestHostile(world, caster, action.behindNearestEnemy);
        if (target) {
          const behind = Math.atan2(caster.y - target.y, caster.x - target.x) + Math.PI;
          teleport(caster, target.x + Math.cos(behind) * 52, target.y + Math.sin(behind) * 52);
          caster.aimAngle = Math.atan2(target.y - caster.y, target.x - caster.x);
        }
        break;
      }
      const offset = action.anchorOffset ?? 0;
      teleport(caster, anchorX(action.at, offset, ctx), anchorY(action.at, offset, ctx));
      break;
    }

    case 'grab': {
      const target = nearestHostile(world, caster, action.range);
      if (!target) {
        if (action.missText) world.banner(action.missText, caster.x, caster.y - 26, '#94a3b8');
        break;
      }
      const behind = ctx.aimAngle + Math.PI;
      placeAt(
        target,
        caster.x + Math.cos(behind) * action.throwDistance,
        caster.y + Math.sin(behind) * action.throwDistance
      );
      applyStatuses(target, action.statuses);
      if (action.hitText) world.banner(action.hitText, target.x, target.y - 26, '#38bdf8');
      applyDamage(world, {
        target,
        amount: resolveDamage(action.damage, ctx),
        sourceId: caster.id,
      });
      break;
    }

    case 'summon':
      spawnDecoy(world, { owner: caster, lifetime: action.lifetime, offset: action.offset });
      break;

    case 'vfx': {
      const offset = action.anchorOffset ?? 0;
      world.vfx(
        action.effect,
        anchorX(action.at, offset, ctx),
        anchorY(action.at, offset, ctx),
        action.radius,
        action.color,
        action.duration,
        ctx.aimAngle,
        action.intensity
      );
      break;
    }

    case 'banner':
      world.banner(action.text, caster.x, caster.y - 28, action.color);
      break;

    case 'sound':
      world.sound(action.cue);
      break;
  }
}

/** Runs one ability — an attack, a Super, a gadget. */
export function executeAbility(ctx: AbilityContext, spec: AbilitySpec): void {
  runActions(ctx, spec.actions);
}

/**
 * Fires the next shot of a queued burst.
 *
 * The aim rule is what makes one mechanism cover a pistol burst, a boxer's
 * alternating punches, a thrown handful of blades and an artillery barrage.
 */
export function fireBurstShot(world: SimWorld, b: BrawlerEntity): void {
  const burst = b.pendingBurst;
  if (!burst) return;
  const actions = getActions(burst.actionKey);
  if (!actions) return;

  const i = burst.index;
  const span = Math.max(1, burst.count - 1);
  let offset = 0;
  switch (burst.aim) {
    case 'alternate':
      offset = (i % 2 === 0 ? 1 : -1) * burst.amplitude;
      break;
    case 'sweep':
      offset = (i / span - 0.5) * burst.amplitude;
      break;
    case 'random':
      offset = (world.rng.next() - 0.5) * burst.amplitude;
      break;
    case 'fixed':
      offset = 0;
      break;
  }

  const scatterX = burst.scatter ? (world.rng.next() - 0.5) * burst.scatter : 0;
  const scatterY = burst.scatter ? (world.rng.next() - 0.5) * burst.scatter : 0;

  runActions(
    {
      world,
      caster: b,
      aimAngle: burst.aimAngle + offset,
      targetX: burst.targetX + scatterX,
      targetY: burst.targetY + scatterY,
      damageMultiplier: burst.damageMultiplier,
      isSuper: burst.isSuper,
      hereX: b.x,
      hereY: b.y,
      scale: 1,
    },
    actions
  );
}

/**
 * Runs the hooks a projectile carries at the point it stopped.
 *
 * `kind` separates the two cases a projectile can end in: `hit` also runs the
 * on-hit list, while a shot that expired in open ground or broke against a
 * wall only gets `onEnd`.
 */
export function runProjectileHooks(
  world: SimWorld,
  owner: BrawlerEntity | undefined,
  hooksKey: string | undefined,
  x: number,
  y: number,
  opts: {
    isSuper: boolean;
    damageMultiplier: number;
    kind: 'hit' | 'end';
    aimAngle: number;
    /** The body the projectile hit directly, which splash must not re-damage. */
    excludeId?: string;
  }
): void {
  const hooks = getHooks(hooksKey);
  if (!hooks || !owner) return;

  const ctx: AbilityContext = {
    world,
    caster: owner,
    aimAngle: opts.aimAngle,
    targetX: x,
    targetY: y,
    damageMultiplier: opts.damageMultiplier,
    isSuper: opts.isSuper,
    hereX: x,
    hereY: y,
    scale: 1,
    excludeId: opts.excludeId,
  };

  if (opts.kind === 'hit' && hooks.onHit) runActions(ctx, hooks.onHit);
  if (hooks.onEnd) runActions(ctx, hooks.onEnd);
}

/** Statuses a projectile applies to the body it connects with. */
export function projectileStatuses(hooksKey: string | undefined, target: BrawlerEntity): void {
  const hooks = getHooks(hooksKey);
  if (!hooks || !hooks.applyStatus) return;
  for (const s of hooks.applyStatus) applyStatus(target, s);
}

/**
 * Runs a kit's passives for one tick.
 *
 * Passives are where the old engine was at its worst: `b.brawlerId === 'mira'`
 * for the emergency heal, `=== 'thorn'` for the garden regen, `=== 'wisp'` for
 * the stealth regen, each with its own hand-written condition in the middle of
 * the movement code. They are conditions and action lists like everything
 * else.
 */
export function runPassives(
  world: SimWorld,
  b: BrawlerEntity,
  passives: PassiveSpec[] | undefined,
  dt: number
): void {
  if (!passives) return;

  for (const passive of passives) {
    const cooldown = b.passiveCooldowns[passive.name] ?? 0;
    if (cooldown > 0) {
      b.passiveCooldowns[passive.name] = cooldown - dt;
      continue;
    }

    let active = false;
    switch (passive.trigger) {
      case 'lowHealth':
        active = b.hp < b.maxHp * (passive.threshold ?? 0.4);
        break;
      case 'whileInvisible':
        active = b.invisibilityTimer > 0;
        break;
      case 'whileInOwnHazard':
        active = world.thornFields.some(
          tf => tf.ownerId === b.id && Math.hypot(b.x - tf.x, b.y - tf.y) <= tf.radius
        );
        break;
    }
    if (!active) continue;

    runActions(makeContext(world, b, { scale: passive.perSecond ? dt : 1 }), passive.actions);
    if (passive.cooldown) b.passiveCooldowns[passive.name] = passive.cooldown;
  }
}
