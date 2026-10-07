/**
 * The kit language.
 *
 * A character's whole moveset — basic attack, Super, gadget, star power and
 * passives — is a value of type `Kit`. Nothing here is code: a kit is plain
 * data that serialises, diffs and validates, and the interpreter in
 * `src/sim/abilities.ts` is the only thing that knows how to run it.
 *
 * The vocabulary is deliberately small. Every entry in `AbilityAction` maps to
 * exactly one effect primitive under `src/sim/effects/`, so the interpreter's
 * switch has one case per *primitive* and none per character. Adding the
 * twenty-fourth brawler adds no branch anywhere; adding a genuinely new kind
 * of mechanic adds exactly one.
 */

import type { BrawlerId } from '../../types/brawl';
import type { VisualEffect } from '../../types/brawl';
import type { BrawlSoundEvent } from '../../game/brawlEngine';

/**
 * Damage, either as an absolute number or as a multiple of the brawler's
 * configured `damagePerAttack`. The relative form means a balance pass on a
 * character's damage number carries through its whole kit.
 */
export type DamageSpec = number | { ofAttack: number };

/** Where an action happens. */
export type Anchor =
  /** The caster's own position. */
  | 'self'
  /** Ahead of the caster along the aim angle, by `anchorOffset`. */
  | 'aim'
  /** The point the player aimed the Super at. */
  | 'target'
  /**
   * Wherever the thing that triggered this action is — a projectile's
   * resting point, a landing spot. Only meaningful in nested action lists.
   */
  | 'here';

export type StatusKind =
  | 'stun'
  | 'slow'
  | 'burn'
  | 'speed'
  | 'invisible'
  /** Takes no damage at all. Used for respawn protection and dashes. */
  | 'immunity'
  /** Absorbs a pool of damage before health is touched. */
  | 'shield'
  /** Cannot use the Super. */
  | 'silence'
  /** Cannot move, can still shoot. */
  | 'root'
  /** Visible to enemies even inside a bush. */
  | 'reveal';

export interface StatusSpec {
  kind: StatusKind;
  duration: number;
  /**
   * Meaning depends on the kind: damage per second for `burn`, a speed
   * multiplier for `speed`, a damage pool for `shield`. Ignored otherwise.
   */
  magnitude?: number;
}

/** A damaging area left on the ground. */
export interface HazardSpec {
  /** `thorn` also slows whatever stands in it; `fire` only burns. */
  kind: 'thorn' | 'fire';
  radius: number;
  duration: number;
  damagePerSec: number;
}

export type ProjectileMotion =
  /** Flies in a straight line. */
  | 'straight'
  /** Arcs steadily to one side. */
  | 'curve'
  /** Travels over walls and lands at a point. */
  | 'lob'
  /** Reflects off walls instead of dying on them. */
  | 'bounce'
  /** Flies out, turns around, and comes back to the thrower. */
  | 'boomerang';

export interface ProjectileSpec {
  speed: number;
  radius: number;
  damage: DamageSpec;
  range: number;
  color: string;
  /** How far ahead of the body it appears. Keeps muzzles out of walls. */
  offset?: number;
  motion?: ProjectileMotion;
  /** Turn rate in rad/s, for `curve`. */
  curveRate?: number;
  /** Wall reflections allowed before it dies, for `bounce`. */
  bounces?: number;
  /** Passes through bodies, damaging each once. */
  piercesBodies?: boolean;
  /** Ignores walls entirely. */
  piercesWalls?: boolean;
  /** Destroys breakable walls it touches and keeps going. */
  breaksWalls?: boolean;
  /** Impulse applied to a body it connects with. */
  knockback?: number;
  /**
   * Close-range bonus. Damage is scaled by `near` at point blank and by `far`
   * at `distance` travelled, smoothly in between.
   */
  falloff?: { near: number; far: number; distance: number };
  /** Statuses applied to a body it connects with. */
  applyStatus?: StatusSpec[];
  /** Runs at the point of contact, only when it hits a body. */
  onHit?: AbilityAction[];
  /** Runs wherever it comes to rest — a wall, a body, or the end of its range. */
  onEnd?: AbilityAction[];
}

/** How a set of projectiles leaves the barrel at one instant. */
export type Delivery =
  /** One projectile along the aim angle. */
  | { pattern: 'single' }
  /** A fan of `count` projectiles spanning `arc` radians. */
  | { pattern: 'spread'; count: number; arc: number }
  /** `count` projectiles evenly around the caster. */
  | { pattern: 'radial'; count: number };

/** How a burst varies its aim from shot to shot. */
export type BurstAim =
  /** Every shot on the same line. */
  | 'fixed'
  /** Left, right, left — a boxer's alternating punches. */
  | 'alternate'
  /** Pans across the arc over the burst, like a thrown handful of blades. */
  | 'sweep'
  /** Seeded random inside the arc. */
  | 'random';

export type AbilityAction =
  /** Spawns projectiles. */
  | { type: 'projectiles'; delivery: Delivery; projectile: ProjectileSpec }
  /**
   * Repeats `actions` over time. This is what makes a six-round burst, a
   * flurry of punches and an artillery barrage the same mechanic.
   */
  | {
      type: 'burst';
      count: number;
      interval: number;
      actions: AbilityAction[];
      aim?: BurstAim;
      /** Angular spread the aim rule works across, in radians. */
      amplitude?: number;
      /** Random displacement of the aim point, in pixels. */
      scatter?: number;
    }
  | {
      type: 'explosion';
      at: Anchor;
      anchorOffset?: number;
      damage: DamageSpec;
      radius: number;
      knockback?: number;
      spawnFire?: boolean;
      burn?: { duration: number; damagePerSec: number };
    }
  | { type: 'hazard'; at: Anchor; anchorOffset?: number; hazard: HazardSpec }
  | {
      type: 'status';
      target: 'self' | 'allies' | 'enemies';
      /** Required for `allies` and `enemies`; omit to mean the whole team. */
      radius?: number;
      statuses: StatusSpec[];
    }
  | { type: 'heal'; target: 'self' | 'allies'; amount: number; radius?: number }
  | { type: 'shield'; target: 'self' | 'allies'; amount: number; duration: number; radius?: number }
  | { type: 'ammo'; amount: number }
  | { type: 'superCharge'; percent: number }
  /** A short burst of speed along the aim angle. */
  | { type: 'dash'; speed: number; throughBodies?: boolean; statuses?: StatusSpec[] }
  /** An arc over walls, with an optional landing payload. */
  | {
      type: 'jump';
      /** Fixed distance, or `toTarget` to land on the aimed point. */
      distance?: number;
      toTarget?: boolean;
      maxDistance?: number;
      onLand?: AbilityAction[];
    }
  | { type: 'teleport'; at: Anchor; anchorOffset?: number; behindNearestEnemy?: number }
  /** Grabs the nearest enemy within `range` and throws it behind the caster. */
  | {
      type: 'grab';
      range: number;
      throwDistance: number;
      damage: DamageSpec;
      statuses?: StatusSpec[];
      /** Shown over the victim when the grab connects. */
      hitText?: string;
      /** Shown when there was nobody to grab. */
      missText?: string;
    }
  | { type: 'summon'; kind: 'decoy'; lifetime: number; offset?: number }
  | {
      type: 'vfx';
      at: Anchor;
      anchorOffset?: number;
      effect: VisualEffect['type'];
      radius: number;
      color: string;
      duration: number;
      intensity?: number;
    }
  | { type: 'banner'; text: string; color: string }
  | { type: 'sound'; cue: BrawlSoundEvent['type'] };

export interface AbilitySpec {
  /** Shown in the UI. The mechanical name, not a description. */
  name: string;
  actions: AbilityAction[];
}

/** A continuously or conditionally active effect, with no button behind it. */
export interface PassiveSpec {
  name: string;
  trigger:
    /** Fires once when health drops below `threshold`, then goes on cooldown. */
    | 'lowHealth'
    /** Runs every tick while invisible. */
    | 'whileInvisible'
    /** Runs every tick while standing in a hazard this brawler created. */
    | 'whileInOwnHazard';
  /** Fraction of maximum health, for `lowHealth`. */
  threshold?: number;
  cooldown?: number;
  /**
   * True when the actions describe a per-second rate rather than a one-off,
   * so the interpreter scales them by the tick length.
   */
  perSecond?: boolean;
  actions: AbilityAction[];
}

/** Always-on numeric modifiers, which are cheaper as numbers than as actions. */
export interface KitTraits {
  /** Multiplies base movement speed. */
  speedMultiplier?: number;
  /**
   * Super charge gained for taking damage, as a percentage of the Super bar
   * per full health bar lost. This is what makes a tank's Super inevitable.
   */
  superChargeFromDamageTaken?: number;
}

export interface Kit {
  id: BrawlerId;
  /** Ammo slots. Three is common but not universal. */
  maxAmmo: number;
  attack: AbilitySpec;
  super: AbilitySpec;
  gadget: AbilitySpec;
  passives?: PassiveSpec[];
  traits?: KitTraits;
}
