/**
 * The surface the simulation's effect primitives are allowed to touch.
 *
 * Abilities used to be written directly against `BrawlEngine`'s private
 * methods, inside `switch (b.brawlerId)` blocks. That worked for six
 * characters and could not work for twenty-four with ninety-six gadgets and
 * star powers between them: every new ability meant editing the engine.
 *
 * So the engine now exposes exactly the capabilities an ability can need, and
 * nothing else. Effects take this interface and some parameters; they never
 * see the engine, the renderer or React. The practical consequence is that a
 * new character is a data file — there is no engine branch to add.
 */

import type {
  BrawlerEntity,
  BrawlProjectile,
  BrawlGameMode,
  DeployedEntity,
  ThornField,
  FirePatch,
  VisualEffect,
  BrawlWall,
  Bush,
  PowerCubeBox,
} from '../types/brawl';
import type { BrawlSoundEvent } from '../game/brawlEngine';
import type { Rng } from '../core/rng';

/** A blast: damage, optional knockback, and terrain demolition. */
export interface ExplosionParams {
  x: number;
  y: number;
  ownerId: string;
  team: number;
  damage: number;
  radius: number;
  /** Impulse applied to bodies, away from the centre. */
  knockback?: number;
  /** Leaves a burning patch where it went off. */
  spawnFire?: boolean;
  /** Burn applied to every body caught in it. */
  burn?: { duration: number; damagePerSec: number };
  /**
   * A body this blast must not touch. A rocket's splash spares whatever the
   * rocket already hit directly, so a direct hit is one instance of damage
   * rather than two.
   */
  excludeId?: string;
}

export interface SimWorld {
  readonly mode: BrawlGameMode;
  readonly matchTimer: number;

  brawlers: BrawlerEntity[];
  projectiles: BrawlProjectile[];
  deployables: DeployedEntity[];
  thornFields: ThornField[];
  firePatches: FirePatch[];
  walls: BrawlWall[];
  bushes: Bush[];
  boxes: PowerCubeBox[];

  /** Seeded. Effects must use this and never `Math.random()`. */
  readonly rng: Rng;

  /** Monotonic ids, so two peers running the same seed agree on every name. */
  nextId(prefix: string): string;

  /** Applies damage, handling death, drops and the kill feed. */
  damage(target: BrawlerEntity, amount: number, sourceId: string, showNumber?: boolean): void;

  /** Area damage, including terrain destruction and pickups. */
  explode(params: ExplosionParams): void;

  /** True when `a` may harm `b` under the current mode's friendly-fire rules. */
  isHostile(team: number, other: BrawlerEntity): boolean;

  sound(type: BrawlSoundEvent['type']): void;

  vfx(
    type: VisualEffect['type'],
    x: number,
    y: number,
    radius: number,
    color: string,
    duration: number,
    angle?: number,
    intensity?: number
  ): void;

  banner(text: string, x: number, y: number, color: string): void;

  /** Marks static geometry as changed, so broadphase and navigation rebuild. */
  invalidateGeometry(): void;
}
