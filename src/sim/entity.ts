/**
 * Brawler construction in one place.
 *
 * There used to be two full literal initialisers for `BrawlerEntity` — one in
 * `initMatch`, one inside the decoy gadget — each listing forty-odd fields.
 * Adding a field meant finding every copy, and a missed one is a body that
 * behaves subtly differently from every other body in the match. With respawn
 * there is now a third caller, so the shape lives here.
 */

import { BRAWLERS, type BrawlerEntity, type BrawlerId } from '../types/brawl';
import { getKit } from './kits';

/**
 * `lastDamageAngle` when the last damage had no direction — gas, fire — or
 * there has been none. A real angle is within ±π, and an angle of zero already
 * means "from the east", so "none" needs a value no direction can take.
 */
export const NO_DAMAGE_DIRECTION = 99;

export interface SpawnOptions {
  id: string;
  name: string;
  brawlerId: BrawlerId;
  team: number;
  x: number;
  y: number;
  isBot?: boolean;
  /** A decoy: looks like a brawler, cannot act, dissipates on its own. */
  isClone?: boolean;
  decoyLifetime?: number;
  hp?: number;
  maxHp?: number;
  powerCubes?: number;
}

export function createBrawlerEntity(opts: SpawnOptions): BrawlerEntity {
  const cfg = BRAWLERS[opts.brawlerId];
  const kit = getKit(opts.brawlerId);
  const maxHp = opts.maxHp ?? cfg.maxHp;

  return {
    id: opts.id,
    name: opts.name,
    brawlerId: opts.brawlerId,
    team: opts.team,
    x: opts.x,
    y: opts.y,
    angle: 0,
    aimAngle: 0,
    vx: 0,
    vy: 0,
    knockbackVx: 0,
    knockbackVy: 0,
    stunTimer: 0,
    speedBoostTimer: 0,
    speedBoostMagnitude: 1,
    hp: opts.hp ?? maxHp,
    maxHp,
    ammo: kit.maxAmmo,
    maxAmmo: kit.maxAmmo,
    reloadTimer: 0,
    attackCooldown: 0,
    prevX: opts.x,
    prevY: opts.y,
    superCharge: 0,
    isAlive: true,
    powerCubes: opts.powerCubes ?? 0,
    gemsCarried: 0,
    isInBush: false,
    isVisibleToEnemies: true,
    invisibilityTimer: 0,
    isJumping: false,
    jumpProgress: 0,
    jumpStartX: 0,
    jumpStartY: 0,
    jumpTargetX: 0,
    jumpTargetY: 0,
    timeSinceLastDamage: 99,
    timeSinceLastAttack: 99,
    slowTimer: 0,
    activeEmote: null,
    emoteTimer: 0,
    isBot: opts.isBot,
    kills: 0,
    deaths: 0,
    pendingBurst: null,
    gadgetCharges: 3,
    gadgetCooldown: 0,
    passiveCooldowns: {},
    burnTimer: 0,
    burnDamagePerSec: 0,
    respawnTimer: 0,
    spawnX: opts.x,
    spawnY: opts.y,
    immunityTimer: 0,
    shieldHp: 0,
    shieldTimer: 0,
    silenceTimer: 0,
    rootTimer: 0,
    revealTimer: 0,
    lastDamageAngle: NO_DAMAGE_DIRECTION,
    isClone: opts.isClone ?? false,
    decoyLifetime: opts.decoyLifetime,
  };
}

/**
 * Returns a dead brawler to the fight.
 *
 * Everything that was true of its last life is cleared: statuses, momentum,
 * queued shots, the half-finished reload. Health and ammo come back full, and
 * the brawler keeps the power cubes and gems it was carrying only if the mode
 * said so — that is the caller's decision, not this function's.
 */
export function respawnBrawler(
  b: BrawlerEntity,
  opts: { immunity: number; superRetention: number }
): void {
  b.isAlive = true;
  b.hp = b.maxHp;
  b.ammo = b.maxAmmo;
  b.reloadTimer = 0;
  b.attackCooldown = 0;
  b.respawnTimer = 0;

  b.x = b.spawnX;
  b.y = b.spawnY;
  b.prevX = b.spawnX;
  b.prevY = b.spawnY;
  b.vx = 0;
  b.vy = 0;
  b.knockbackVx = 0;
  b.knockbackVy = 0;

  b.pendingBurst = null;
  b.isJumping = false;
  b.jumpProgress = 0;

  b.stunTimer = 0;
  b.slowTimer = 0;
  b.burnTimer = 0;
  b.burnDamagePerSec = 0;
  b.speedBoostTimer = 0;
  b.speedBoostMagnitude = 1;
  b.invisibilityTimer = 0;
  b.shieldHp = 0;
  b.shieldTimer = 0;
  b.silenceTimer = 0;
  b.rootTimer = 0;
  b.revealTimer = 0;

  b.timeSinceLastDamage = 0;
  b.timeSinceLastAttack = 99;
  // Respawning resets the damage timer, which would otherwise light the
  // marker for a second pointing at whoever killed the last life.
  b.lastDamageAngle = NO_DAMAGE_DIRECTION;

  // A few frames of protection, or a brawler that respawns into a pair of
  // enemies camping the base dies before the screen has even settled.
  b.immunityTimer = opts.immunity;

  // Losing a fight should not also cost the whole Super you charged during it.
  b.superCharge = Math.min(100, b.superCharge * opts.superRetention);
}
