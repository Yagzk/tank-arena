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

import type { BrawlerId, DeployedKind, VisualEffect } from '../../types/brawl';
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
  | 'reveal'
  /** Enemy shots that touch this body are sent back at their owner. */
  | 'reflect'
  /** Enemy shots that reach this body are destroyed without effect. */
  | 'absorb'
  /** Takes less damage: `magnitude` is the fraction cut. */
  | 'guard'
  /** The Super is in effect, for kits whose other traits depend on it. */
  | 'superActive';

export interface StatusSpec {
  kind: StatusKind;
  duration: number;
  /**
   * Meaning depends on the kind: damage per second for `burn`, a speed
   * multiplier for `speed`, a damage pool for `shield`, the fraction of speed
   * taken for `slow` (0.5 if absent), the fraction cut for `guard`.
   */
  magnitude?: number;
}

/** A damaging area left on the ground. */
export interface HazardSpec {
  /** Fraction of speed taken from enemies standing in it. */
  slow?: number;
  /** Fraction of the damage dealt that the owner gets back as health. */
  lifesteal?: number;
  /** Health per second for the owner's side standing in it. */
  healPerSec?: number;
  /** Colour of the ground, for ground that is not fire or thorns. */
  tint?: string;
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
  falloff?: { near: number; far: number; distance: number; hold?: number };
  /** Percent of the Super added to its owner when it hits a brawler. */
  charge?: number;
  /** Shoves a body it hits this many pixels, without stunning it. */
  pushback?: number;
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
  | { pattern: 'radial'; count: number; fixed?: boolean };

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
      /** Pixels each shot is moved sideways, alternating, so a volley leaves in two streams. */
      lateral?: number;
      /** Blocks attacking and reloading until it ends; a stun or a shove cancels it. */
      channel?: boolean;
    }
  | {
      type: 'explosion';
      at: Anchor;
      anchorOffset?: number;
      damage: DamageSpec;
      radius: number;
      knockback?: number;
      /** Pixels bodies are shoved away from the centre, without a stun. */
      push?: number;
      spawnFire?: boolean;
      burn?: { duration: number; damagePerSec: number };
      /** Applied to every body the blast catches. */
      statuses?: StatusSpec[];
      /** Fraction of the damage dealt that the caster takes back as health. */
      lifesteal?: number;
      /** Percent of the Super added to the caster for each brawler the blast hits. */
      charge?: number;
    }
  | { type: 'hazard'; at: Anchor; anchorOffset?: number; hazard: HazardSpec }
  | {
      type: 'status';
      target: 'self' | 'allies' | 'enemies';
      /** Required for `allies` and `enemies`; omit to mean the whole team. */
      radius?: number;
      statuses: StatusSpec[];
    }
  | { type: 'heal'; target: 'self' | 'allies'; amount?: number; fraction?: number; radius?: number }
  | { type: 'shield'; target: 'self' | 'allies'; amount: number; duration: number; radius?: number }
  /**
   * A bolt that jumps: it strikes the nearest enemy in `range`, then the
   * nearest *other* enemy within `hopRange` of that one, and so on.
   */
  | {
      type: 'chain';
      range: number;
      hops: number;
      hopRange: number;
      damage: DamageSpec;
      /** Each hop deals this fraction of the one before. One means no falloff. */
      falloff?: number;
      statuses?: StatusSpec[];
      color?: string;
    }
  | { type: 'ammo'; amount: number }
  /**
   * The next `uses` ordinary attacks are replaced by `attack` — a gadget that
   * loads a special shot rather than doing something on the spot. They still
   * spend ammo, as the original ones do.
   */
  | { type: 'empower'; uses: number; attack: AbilityAction[] }
  | { type: 'superCharge'; percent: number }
  /** A short burst of speed along the aim angle. */
  | {
      type: 'dash';
      /** How far it carries, in pixels. Takes the place of `speed`. */
      distance?: number;
      /** Enemies in its path are picked up and set down this far behind the caster. */
      grabThrow?: number;
      speed?: number;
      /** Passes through bodies instead of shouldering them aside. */
      throughBodies?: boolean;
      statuses?: StatusSpec[];
    }
  /**
   * Drags a body toward the caster — a hook, a vortex.
   *
   * As a projectile's `onHit` it pulls the body that was hit, which is what
   * makes a hook a hook: the shot decides who gets pulled. On its own it pulls
   * the nearest enemy in reach.
   */
  | {
      type: 'pull';
      on?: 'hit' | 'nearest';
      range: number;
      /** Impulse toward the caster, clamped by the gap so nobody overshoots. */
      force: number;
      damage?: DamageSpec;
      statuses?: StatusSpec[];
      missText?: string;
    }
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
  | {
      type: 'summon';
      /** `decoy` is a dummy body; everything else acts on its own. */
      kind: DeployedKind | 'decoy';
      lifetime: number;
      /** Health lost per second on its own, so something placed there fades. */
      decay?: number;
      /** Runs when it is destroyed or replaced. */
      onDestroy?: AbilityAction[];
      /** Placing another of this owner's destroys the first (and runs its `onDestroy`). */
      unique?: boolean;
      /** A decoy's touch: damage per hit, once a second. */
      touchDamage?: number;
      /** Where it goes: ahead of the caster by default, or on the aimed point. */
      at?: Anchor;
      offset?: number;
      hp?: number;
      radius?: number;
      /** Seconds between acts. */
      interval?: number;
      /** How far it looks for something to act on. */
      range?: number;
      /** Movement speed, for a minion. */
      speed?: number;
      /** What it does each time it acts — fires, detonates, heals. */
      onAct?: AbilityAction[];
      /**
       * Places several side by side, across the aim direction and centred on
       * the anchor. A wall that is one block is a pillar; this makes it a wall.
       */
      row?: { count: number; spacing: number };
    }
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

/** A gadget: an ability on a cooldown rather than a number of uses. */
export interface GadgetSpec {
  name: string;
  description: string;
  /** Seconds before it can be used again, counted from the press. */
  cooldown: number;
  /** Count the cooldown from the empowered attack being used, not from the press. */
  cooldownAfterUse?: boolean;
  actions: AbilityAction[];
  /** Only usable while one of the caster's own summons of this kind is within reach. */
  requires?: { deployable: DeployedKind; within: number };
}

/** A star power: a change to the character's kit, chosen before the match. */
export interface StarPowerSpec {
  name: string;
  description: string;
  /** Edits a private copy of the kit. The original is never touched. */
  apply: (kit: Kit) => void;
}

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
/**
 * A change that holds while a condition is true — a speed boost while
 * invisible, a faster reload while hurt. Several can hold at once.
 */
export interface ConditionalMod {
  when: 'invisible' | 'healthBelow' | 'inBush' | 'superActive';
  /** Fraction of maximum health, for `healthBelow`. */
  below?: number;
  speed?: number;
  reload?: number;
  /** Multiplies the damage taken. */
  taken?: number;
  /** Health recovered per second, as a fraction of maximum. */
  healPerSec?: number;
}

export interface KitTraits {
  /** Multiplies base movement speed. */
  speedMultiplier?: number;
  conditional?: ConditionalMod[];
  /**
   * Super charge gained for taking damage, as a percentage of the Super bar
   * per full health bar lost. This is what makes a tank's Super inevitable.
   */
  superChargeFromDamageTaken?: number;
  /**
   * A patient attack: the longer it has been since the last shot, the harder
   * the next one hits. `time` is seconds to full charge; the scale runs from
   * `minScale` straight after a shot to `maxScale` when fully charged.
   */
  charge?: { time: number; minScale: number; maxScale: number };
  /**
   * The balance dial for the whole character: every point of damage it deals —
   * shots, blasts, turrets, mines, chains — is multiplied by this. One means
   * the numbers in the kit are the numbers that land.
   */
  damageScale?: number;
}

/**
 * How a bot plays this character.
 *
 * The bot had seventeen `brawlerId === '...'` branches for six characters —
 * the same shape as the ability switches, and the same problem: a new
 * character meant editing the bot. Ranges are fractions of the brawler's own
 * configured range, so a character's reach and the distance its bot prefers
 * stay in step through a balance pass.
 */
export type BotGadget =
  | { when: 'enemyWithin'; range: number }
  | { when: 'enemyBetween'; min: number; max: number }
  | { when: 'outOfAmmo'; range: number }
  | { when: 'chance'; range: number; probability: number }
  /** Whenever it is off cooldown and there is anything in the fight at all. */
  | { when: 'always' }
  /** Never: for a gadget the bot cannot use well. */
  | { when: 'never' };

export interface BotProfile {
  /** Fraction of its range the bot will open fire at. */
  engageRange?: number;
  /** Band, in fractions of range, within which it will fire its Super. */
  superRange?: { min?: number; max?: number };
  /** When each of the two gadgets is worth spending. */
  gadgets?: [BotGadget, BotGadget];
  /** When the gadget is worth spending, for a character with one. */
  gadget?: BotGadget;
  /**
   * True for an attack that arcs over walls. Without it a lobber would never
   * fire from behind cover, which is the only place it wants to be.
   */
  ignoresCover?: boolean;
}

export interface Kit {
  id: BrawlerId;
  /** Ammo slots. Three is common but not universal. */
  maxAmmo: number;
  /** Super percent for a hit of the ordinary attack, where a projectile does not say. */
  chargePerHit?: number;
  attack: AbilitySpec;
  /**
   * A chain of attacks that replaces `attack`: the first shot uses the first
   * entry, the next (within `comboWindow` seconds) the second, and so on, then
   * round again. The last one is usually the big one.
   */
  combo?: AbilitySpec[];
  comboWindow?: number;
  super: AbilitySpec;
  /** Two gadgets, chosen before the match. */
  gadgets?: [GadgetSpec, GadgetSpec];
  /** Two star powers, chosen before the match. */
  starPowers?: [StarPowerSpec, StarPowerSpec];
  /** The one gadget of a character not yet moved to the two-gadget form. */
  gadget?: AbilitySpec;
  passives?: PassiveSpec[];
  traits?: KitTraits;
  bot?: BotProfile;
}
