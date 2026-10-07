import {
  BrawlerEntity,
  BrawlProjectile,
  DeployedEntity,
  ThornField,
  FirePatch,
  VisualEffect,
  PowerCubeBox,
  PowerCubeDrop,
  GemDrop,
  Bush,
  BrawlWall,
  FloatingNumber,
  KillFeedEntry,
  PoisonGas,
  GemMine,
  BrawlSnapshot,
  BrawlPlayerInput,
  PlayerInfo,
  BRAWLERS,
  BrawlerId,
  BrawlGameMode,
} from '../types/brawl';
import { generateBrawlMap, MAP_WIDTH, MAP_HEIGHT } from '../maps';
import { circleRectCollision, circleIntersect, sweepCircleVsRect, sweepCircleVsCircle, createSweepHit } from '../core/collision';
import { dist, clamp, moveTowards, smoothstep } from '../core/math';
import { Rng } from '../core/rng';
import { SpatialHash } from '../core/spatialHash';
import { NavGrid } from '../core/navGrid';
import { BrawlBot } from './brawlBot';
import { createBrawlerEntity, respawnBrawler } from '../sim/entity';
import { updateDeployables } from '../sim/systems/deployables';
import { getKit } from '../sim/kits';
import { getActions } from '../sim/kits/registry';
import {
  executeAbility,
  fireBurstShot,
  makeContext,
  projectileStatuses,
  runActions,
  runPassives,
  runProjectileHooks,
  type AbilityContext,
} from '../sim/abilities';
import {
  absorbWithShield,
  applyKnockback,
  applyStatus,
  chargeSuperFlat,
  chargeSuperForDamage,
  spawnHazard,
  tickStatuses,
} from '../sim/effects';
import type { ExplosionParams, SimWorld } from '../sim/world';

export interface BrawlSoundEvent {
  type:
    | 'scatter_shot'
    | 'rapid_shot'
    | 'heavy_punch'
    | 'heavy_leap'
    | 'rocket_launch'
    | 'blade_throw'
    | 'super_ready'
    | 'super_blast'
    | 'gem_pickup'
    | 'cube_pickup'
    | 'star_player'
    | 'alarm'
    | 'gadget_activate'
    | 'band_aid'
    | 'rapid_reload';
}

/** When the arena starts closing in Showdown. */
const GAS_START_TIME = 55;
/** Closing speed, in pixels per second, at the start and once fully ramped. */
const GAS_SPEED_INITIAL = 14;
const GAS_SPEED_FINAL = 48;
/** Damage per second for standing in it, at the start and once fully ramped. */
const GAS_DAMAGE_INITIAL = 350;
const GAS_DAMAGE_FINAL = 1600;

/** Seconds of countdown before a match becomes playable. */
const INTRO_DURATION = 3.0;

/** Collision radius shared by every brawler body. */
const BRAWLER_RADIUS = 22;

/** Seconds a gadget is locked out for after use. */
const GADGET_COOLDOWN = 4.5;

/** How far a placed Super reaches when the player gave only a direction. */
const SUPER_DEFAULT_REACH = 360;

/**
 * What death means, per mode.
 *
 * This table is the fix for the single worst bug in the project: `isAlive`
 * used to be a one-way door. Nothing anywhere set it back to true, so a Gem
 * Grab player who died was gone for the rest of the match and the mode could
 * not actually be played. Elimination is a *rule*, not a property of the
 * engine, and it belongs in one place that every future mode reads.
 */
interface ModeRules {
  /** Seconds before a downed brawler returns. Zero means death is final. */
  respawnDelay: number;
  /** Seconds of protection on return, so a base camper cannot farm the spawn. */
  respawnImmunity: number;
  /** Fraction of the Super bar carried through a death. */
  superRetention: number;
}

const MODE_RULES: Record<BrawlGameMode, ModeRules> = {
  showdown: { respawnDelay: 0, respawnImmunity: 0, superRetention: 0 },
  // Three seconds is long enough to be a real cost and short enough that the
  // objective does not go uncontested while you wait.
  gem_grab: { respawnDelay: 3, respawnImmunity: 1.5, superRetention: 0.25 },
};

export class BrawlEngine {
  public phase: BrawlSnapshot['phase'] = 'waiting';
  public mode: BrawlGameMode = 'showdown';
  public matchTimer: number = 0;
  public countdownTimer: number = 0;
  public countdownTeam: number | null = null;
  public winnerTeam: number | null = null;
  public winnerPlayerId: string | null = null;
  public starPlayerId: string | null = null;

  public brawlers: BrawlerEntity[] = [];
  public projectiles: BrawlProjectile[] = [];
  /** Turrets, minions, mines, stations and barriers left on the field. */
  public deployables: DeployedEntity[] = [];
  public thornFields: ThornField[] = [];
  public firePatches: FirePatch[] = [];
  public visualEffects: VisualEffect[] = [];
  public boxes: PowerCubeBox[] = [];
  public powerCubes: PowerCubeDrop[] = [];
  public gems: GemDrop[] = [];
  public bushes: Bush[] = [];
  public walls: BrawlWall[] = [];
  public gemMine?: GemMine;
  public poisonGas: PoisonGas = { inset: 0, damageTimer: 0, isActive: false };
  public floatingNumbers: FloatingNumber[] = [];
  /** Recent kills, newest last. */
  /** The map this match is being played on, for the HUD. */
  public mapName: string = '';
  public killFeed: KillFeedEntry[] = [];
  /** Player ids in elimination order, used to work out Showdown placement. */
  public eliminationOrder: string[] = [];

  public playerInputs: Record<string, BrawlPlayerInput> = {};
  private botControllers: Record<string, BrawlBot> = {};

  public onSoundTriggered?: (event: BrawlSoundEvent) => void;

  private nextEntityId: number = 1;
  private prevSuperReadyState: Record<string, boolean> = {};

  /** Seeded RNG. The simulation never calls this.rng.next(), so a match replays
   *  identically from the same seed and peers cannot silently drift apart. */
  private rng = new Rng(0x5eed);
  /** Broadphase over static geometry, rebuilt only when walls actually change. */
  private wallGrid = new SpatialHash(MAP_WIDTH, MAP_HEIGHT);
  private wallGridCount = -1;
  private wallGridDirty = true;
  /** Reused sweep result, so collision queries allocate nothing per tick. */
  private readonly sweep = createSweepHit();
  /** Navigation mesh for bots, rebuilt when the level geometry changes. */
  private navGrid = new NavGrid(MAP_WIDTH, MAP_HEIGHT, 40);
  private navWallCount = -1;
  private navBoxCount = -1;

  /**
   * The capability surface the kit interpreter runs against.
   *
   * Effects are handed this, never the engine. The getters matter: the engine
   * reassigns `projectiles` and `brawlers` wholesale when it filters them, so
   * a plain snapshot of the arrays would go stale within a tick.
   */
  private readonly world: SimWorld;

  constructor() {
    // A placeholder board, so the engine is never in an undefined state
    // before a match has been set up. `initMatch` replaces all of it.
    const map = generateBrawlMap('showdown', 1);
    this.walls = map.walls;
    this.bushes = map.bushes;
    this.boxes = map.boxes;
    this.world = this.createWorld();
  }

  private createWorld(): SimWorld {
    const engine = this;
    return {
      get mode() {
        return engine.mode;
      },
      get matchTimer() {
        return engine.matchTimer;
      },
      get brawlers() {
        return engine.brawlers;
      },
      set brawlers(v: BrawlerEntity[]) {
        engine.brawlers = v;
      },
      get projectiles() {
        return engine.projectiles;
      },
      set projectiles(v: BrawlProjectile[]) {
        engine.projectiles = v;
      },
      get deployables() {
        return engine.deployables;
      },
      set deployables(v: DeployedEntity[]) {
        engine.deployables = v;
      },
      get thornFields() {
        return engine.thornFields;
      },
      set thornFields(v: ThornField[]) {
        engine.thornFields = v;
      },
      get firePatches() {
        return engine.firePatches;
      },
      set firePatches(v: FirePatch[]) {
        engine.firePatches = v;
      },
      get walls() {
        return engine.walls;
      },
      set walls(v: BrawlWall[]) {
        engine.walls = v;
      },
      get bushes() {
        return engine.bushes;
      },
      set bushes(v: Bush[]) {
        engine.bushes = v;
      },
      get boxes() {
        return engine.boxes;
      },
      set boxes(v: PowerCubeBox[]) {
        engine.boxes = v;
      },
      get rng() {
        return engine.rng;
      },
      nextId: (prefix: string) => prefix + '-' + this.nextEntityId++,
      damage: (target, amount, sourceId, showNumber) =>
        this.damageBrawler(target, amount, sourceId, showNumber),
      explode: params => this.explode(params),
      isHostile: (team, other) => this.isHostile(team, other),
      sound: type => this.onSoundTriggered?.({ type }),
      vfx: (type, x, y, radius, color, duration, angle, intensity) =>
        this.addEffect(type, x, y, radius, color, duration, angle, intensity),
      banner: (text, x, y, color) => this.addFloatingNumber(text, x, y, color),
      invalidateGeometry: () => {
        this.wallGridDirty = true;
      },
    };
  }

  /**
   * Whether `other` is a legitimate target for someone on `team`.
   *
   * Showdown gives every player their own team number, so one rule covers
   * both modes — and unlike the old scattered `mode === 'gem_grab'` checks, it
   * also stops a summoned decoy from being shot by its own owner.
   */
  private isHostile(team: number, other: BrawlerEntity): boolean {
    return other.isAlive && this.isHostileTeam(team, other.team);
  }

  /** Team-level hostility, for things that are not brawlers. */
  private isHostileTeam(team: number, otherTeam: number): boolean {
    return otherTeam !== team;
  }

  /**
   * Builds the context a kit ability runs in.
   *
   * A placed ability falls back to a point out along the aim line when the
   * player gave only a direction, which is what happens on a keyboard and on
   * a quick tap of the Super button.
   */
  private contextFor(
    b: BrawlerEntity,
    input: BrawlPlayerInput,
    isSuper: boolean
  ): AbilityContext {
    const reach = isSuper ? SUPER_DEFAULT_REACH : BRAWLERS[b.brawlerId].range;
    return makeContext(this.world, b, {
      aimAngle: input.aimAngle,
      targetX: input.superTargetX ?? b.x + Math.cos(input.aimAngle) * reach,
      targetY: input.superTargetY ?? b.y + Math.sin(input.aimAngle) * reach,
      isSuper,
    });
  }

  public initMatch(
    players: PlayerInfo[],
    mode: BrawlGameMode = 'showdown',
    seed: number = Date.now() & 0xffffffff
  ) {
    this.rng = new Rng(seed);
    this.wallGridDirty = true;
    this.mode = mode;
    this.phase = 'starting';
    this.matchTimer = 0;
    this.countdownTimer = 15;
    this.countdownTeam = null;
    this.winnerTeam = null;
    this.winnerPlayerId = null;
    this.starPlayerId = null;

    this.botControllers = {};
    const map = generateBrawlMap(mode, seed);
    this.walls = map.walls;
    this.bushes = map.bushes;
    this.boxes = map.boxes;
    this.gemMine = map.gemMine;
    this.mapName = map.name;
    this.projectiles = [];
    this.deployables = [];
    this.thornFields = [];
    this.firePatches = [];
    this.visualEffects = [];
    this.powerCubes = [];
    this.gems = [];
    this.floatingNumbers = [];
    this.killFeed = [];
    this.eliminationOrder = [];

    this.poisonGas = {
      inset: 0,
      damageTimer: 0,
      isActive: mode === 'showdown',
    };

    // Initialize brawlers (up to 10 players)
    this.brawlers = players.map((p, idx) => {
      const team = mode === 'gem_grab' ? idx % 2 : idx;
      // Gem Grab spawn points are grouped by team (first half blue, second
      // half red). Indexing them by raw player order dropped half the lobby
      // into the enemy base on round start.
      const half = Math.ceil(map.spawns.length / 2);
      const spawnIndex =
        mode === 'gem_grab'
          ? Math.min(map.spawns.length - 1, (team === 0 ? 0 : half) + Math.floor(idx / 2))
          : idx % map.spawns.length;
      const spawn = map.spawns[spawnIndex];

      if (p.isBot) {
        this.botControllers[p.id] = new BrawlBot();
      }

      const entity = createBrawlerEntity({
        id: p.id,
        name: p.name,
        brawlerId: p.brawler || 'mira',
        team,
        x: spawn.x,
        y: spawn.y,
        isBot: p.isBot,
      });
      // Where this brawler returns to if the mode allows it, fixed for the
      // whole match so a death never relocates someone's base.
      entity.spawnX = spawn.x;
      entity.spawnY = spawn.y;
      return entity;
    });
  }

  public setPlayerInput(playerId: string, input: BrawlPlayerInput) {
    this.playerInputs[playerId] = input;
  }

  public update(dt: number) {
    if (this.phase === 'starting') {
      // Three seconds of countdown, so players can read the map and find
      // themselves before anything can shoot them.
      this.matchTimer += dt;
      if (this.matchTimer >= INTRO_DURATION) {
        this.phase = 'playing';
        this.matchTimer = 0;
      }
      return;
    }

    if (this.phase === 'match_end') {
      this.updateFloatingNumbers(dt);
      this.updateVisualEffects(dt);
      return;
    }

    this.matchTimer += dt;

    this.ensureNavGrid();
    this.updateBrawlers(dt);
    updateDeployables(this.world, dt);
    this.updateProjectiles(dt);
    this.updateThornFields(dt);
    this.updateFirePatches(dt);
    this.updateVisualEffects(dt);
    this.updateGemMine(dt);
    this.updatePoisonGas(dt);
    this.updatePickups();
    this.updateFloatingNumbers(dt);
    this.checkGameModeRules(dt);
  }

  private updateBrawlers(dt: number) {
    const brawlerRadius = 22;

    for (let bi = this.brawlers.length - 1; bi >= 0; bi--) {
      const b = this.brawlers[bi];

      if (!b.isAlive) {
        // A decoy that goes down is simply gone; there is nothing to respawn.
        if (b.isClone) {
          this.addEffect('smoke_poof', b.x, b.y, 40, '#06b6d4', 0.35);
          this.brawlers.splice(bi, 1);
          continue;
        }
        if (b.respawnTimer > 0) {
          b.respawnTimer -= dt;
          if (b.respawnTimer <= 0) {
            const rules = MODE_RULES[this.mode];
            respawnBrawler(b, {
              immunity: rules.respawnImmunity,
              superRetention: rules.superRetention,
            });
            this.addEffect('smoke_poof', b.x, b.y, 56, '#38bdf8', 0.45);
            this.addFloatingNumber('GERİ DÖNDÜ', b.x, b.y - 30, '#38bdf8');
          }
        }
        continue;
      }

      const cfg = BRAWLERS[b.brawlerId];
      const kit = getKit(b.brawlerId);

      // Remember where the body was so the renderer can interpolate between
      // simulation ticks instead of snapping once every 1/60 s.
      b.prevX = b.x;
      b.prevY = b.y;

      // Ammo refills one whole slot at a time. The old fractional counter let
      // you fire the instant the bar ticked over, so the ammo display never
      // matched what the brawler could actually do.
      if (b.ammo < b.maxAmmo) {
        b.reloadTimer += dt;
        while (b.reloadTimer >= cfg.reloadTime && b.ammo < b.maxAmmo) {
          b.reloadTimer -= cfg.reloadTime;
          b.ammo += 1;
        }
        if (b.ammo >= b.maxAmmo) b.reloadTimer = 0;
      } else {
        b.reloadTimer = 0;
      }

      if (b.attackCooldown > 0) b.attackCooldown -= dt;

      // Natural Health Regeneration (+13% HP/sec after 3s out of combat)
      b.timeSinceLastDamage += dt;
      b.timeSinceLastAttack += dt;
      // 13%/s healed a full bar in under eight seconds, which made chip
      // damage pointless and turned every fight into a disengage race.
      if (b.timeSinceLastDamage >= 4.0 && b.timeSinceLastAttack >= 4.0) {
        if (b.hp < b.maxHp) {
          b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.06 * dt);
        }
      }

      tickStatuses(b, dt);
      if (b.gadgetCooldown > 0) b.gadgetCooldown -= dt;

      if (b.emoteTimer > 0) {
        b.emoteTimer -= dt;
        if (b.emoteTimer <= 0) b.activeEmote = null;
      }

      // Burning ground and burning bodies both land here.
      if (b.burnTimer > 0) {
        b.burnTimer -= dt;
        const burnDmg = Math.round(b.burnDamagePerSec * dt);
        if (burnDmg > 0) {
          // Clamping to 1 HP meant burn damage could never finish anyone off.
          this.damageBrawler(b, burnDmg, 'burn', false);
          if (this.rng.next() < 0.2) {
            this.addFloatingNumber(`-${Math.round(b.burnDamagePerSec)} ATEŞ`, b.x, b.y - 18, '#f97316');
          }
        }
      }

      // Star powers and other conditional, always-on behaviour. This used to
      // be three hand-written `b.brawlerId === '...'` blocks in the middle of
      // the movement code.
      runPassives(this.world, b, kit.passives, dt);

      // A decoy walks at whatever it can see and does nothing else. It exists
      // to draw fire, which it can only do by being a real body.
      if (b.isClone) {
        // Clone charges toward nearest enemy
        const enemy = this.brawlers.find(e => e.id !== b.id && e.isAlive && e.team !== b.team && !e.isClone);
        if (enemy) {
          const ang = Math.atan2(enemy.y - b.y, enemy.x - b.x);
          b.x += Math.cos(ang) * 190 * dt;
          b.y += Math.sin(ang) * 190 * dt;
          b.aimAngle = ang;
        }
        b.decoyLifetime = (b.decoyLifetime ?? 0) - dt;
        if (b.decoyLifetime <= 0 || b.hp <= 0) {
          this.visualEffects.push({
            id: `fx-${this.nextEntityId++}`,
            type: 'smoke_poof',
            x: b.x,
            y: b.y,
            radius: 40,
            color: '#06b6d4',
            duration: 0.35,
            progress: 0,
          });
          this.brawlers.splice(bi, 1);
          continue;
        }
      }

      // Knockback Physics & Momentum decay
      if (b.knockbackVx !== 0 || b.knockbackVy !== 0) {
        b.x += b.knockbackVx * dt;
        b.y += b.knockbackVy * dt;
        b.knockbackVx *= Math.exp(-7 * dt);
        b.knockbackVy *= Math.exp(-7 * dt);
        if (Math.hypot(b.knockbackVx, b.knockbackVy) < 15) {
          b.knockbackVx = 0;
          b.knockbackVy = 0;
        }

        // Wall collisions during knockback
        for (const wall of this.walls) {
          const col = circleRectCollision({ x: b.x, y: b.y, radius: brawlerRadius }, wall);
          if (col.collided) {
            b.x += col.nx * col.depth;
            b.y += col.ny * col.depth;
            b.knockbackVx = 0;
            b.knockbackVy = 0;
          }
        }
      }

      // Airborne Leap Progression (El Primo Super & Brock Gadget jump)
      if (b.isJumping) {
        b.jumpProgress += dt * 1.55; // ~0.65s jump duration
        b.x = b.jumpStartX + (b.jumpTargetX - b.jumpStartX) * b.jumpProgress;
        b.y = b.jumpStartY + (b.jumpTargetY - b.jumpStartY) * b.jumpProgress;

        if (b.jumpProgress >= 1.0) {
          b.isJumping = false;
          b.x = b.jumpTargetX;
          b.y = b.jumpTargetY;

          // Whatever the kit said to do on landing. The key travels on the
          // entity because the landing happens long after the Super was fired.
          const landing = b.jumpLandKey ? getActions(b.jumpLandKey) : undefined;
          b.jumpLandKey = undefined;
          if (landing) {
            runActions(makeContext(this.world, b, { hereX: b.x, hereY: b.y }), landing);
          }
        }
        continue; // Airborne brawler skips ground collisions & input
      }

      // Attacks that fire over several ticks rather than all at once.
      const burst = b.pendingBurst;
      if (burst) {
        burst.timer -= dt;
        if (burst.timer <= 0) {
          fireBurstShot(this.world, b);
          burst.remaining--;
          burst.index++;
          burst.timer = burst.interval;
          if (burst.remaining <= 0) b.pendingBurst = null;
        }
      }

      // Get Input (Human or Bot)
      let input = this.playerInputs[b.id];
      if (b.isBot && this.botControllers[b.id]) {
        input = this.botControllers[b.id].update(
          b,
          this.brawlers,
          this.walls,
          this.bushes,
          this.boxes,
          this.powerCubes,
          this.gems,
          dt,
          this.navGrid
        );
        this.playerInputs[b.id] = input;
      }

      if (!input) continue;

      // Handle Emote
      if (input.emote && b.emoteTimer <= 0) {
        b.activeEmote = input.emote;
        b.emoteTimer = 3.0;
      }

      // Aim angle
      b.aimAngle = input.aimAngle;

      // Stunned brawlers cannot move or attack
      if (b.stunTimer > 0) {
        continue;
      }

      let speed = cfg.speed * (kit.traits?.speedMultiplier ?? 1);
      if (b.slowTimer > 0) speed *= 0.5;
      if (b.speedBoostTimer > 0) speed *= b.speedBoostMagnitude;

      // Velocity ramps toward the input rather than snapping to it. Instant
      // full-speed starts and dead stops are why movement felt like sliding
      // a cursor around instead of driving a character.
      let targetVx = 0;
      let targetVy = 0;
      const inputLen = Math.hypot(input.moveX, input.moveY);
      // Rooted brawlers keep shooting; they just cannot reposition.
      const isPushing = inputLen > 0.001 && b.rootTimer <= 0;
      if (isPushing) {
        const scale = Math.min(1, inputLen) / inputLen;
        targetVx = input.moveX * scale * speed;
        targetVy = input.moveY * scale * speed;
      }

      // Stopping is sharper than starting: turns stay responsive while the
      // body still carries weight.
      const accelStep = cfg.acceleration * (isPushing ? 1 : 1.9) * dt;
      b.vx = moveTowards(b.vx, targetVx, accelStep);
      b.vy = moveTowards(b.vy, targetVy, accelStep);

      if (Math.abs(b.vx) > 1 || Math.abs(b.vy) > 1) {
        b.angle = Math.atan2(b.vy, b.vx);
      }

      // Integrate and resolve one axis at a time so a blocked axis does not
      // cancel the other — that is what makes sliding along cover smooth
      // instead of sticky.
      b.x += b.vx * dt;
      this.resolveAgainstGeometry(b, BRAWLER_RADIUS, true);
      b.y += b.vy * dt;
      this.resolveAgainstGeometry(b, BRAWLER_RADIUS, false);

      // Brawler vs Brawler soft push
      for (const other of this.brawlers) {
        if (other.id === b.id || !other.isAlive || other.isJumping) continue;
        if (circleIntersect({ x: b.x, y: b.y, radius: brawlerRadius }, { x: other.x, y: other.y, radius: brawlerRadius })) {
          const d = dist(b.x, b.y, other.x, other.y) || 1;
          const overlap = brawlerRadius * 2 - d;
          const nx = (b.x - other.x) / d;
          const ny = (b.y - other.y) / d;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;
        }
      }

      // Bush Stealth Check
      b.isInBush = false;
      for (const bush of this.bushes) {
        if (
          b.x >= bush.x &&
          b.x <= bush.x + bush.w &&
          b.y >= bush.y &&
          b.y <= bush.y + bush.h
        ) {
          b.isInBush = true;
          break;
        }
      }

      // Visibility: visible if attacking or damaged within 1.5s
      b.isVisibleToEnemies =
        !b.isInBush ||
        b.revealTimer > 0 ||
        b.timeSinceLastAttack < 1.5 ||
        b.timeSinceLastDamage < 1.5;

      // Super Sound Trigger (Iconic chime when super reaches 100%)
      const wasSuperReady = this.prevSuperReadyState[b.id] || false;
      const isSuperReady = b.superCharge >= 100;
      if (isSuperReady && !wasSuperReady) {
        this.onSoundTriggered?.({ type: 'super_ready' });
      }
      this.prevSuperReadyState[b.id] = isSuperReady;

      // Gadget, Super, attack. Three `switch (b.brawlerId)` blocks with
      // eighteen branches between them used to live below this point; all of
      // it is kit data now, run by one interpreter that never learns a
      // character's name.
      if (input.gadget && b.gadgetCharges > 0 && b.gadgetCooldown <= 0) {
        b.gadgetCharges--;
        b.gadgetCooldown = GADGET_COOLDOWN;
        this.onSoundTriggered?.({ type: 'gadget_activate' });
        executeAbility(this.contextFor(b, input, false), kit.gadget);
      }

      if (input.superAttack && b.superCharge >= 100 && b.silenceTimer <= 0) {
        b.superCharge = 0;
        b.timeSinceLastAttack = 0;
        if (b.invisibilityTimer > 0) b.invisibilityTimer = 0; // Attacking breaks stealth
        executeAbility(this.contextFor(b, input, true), kit.super);
      } else if (input.attack && b.ammo >= 1 && b.attackCooldown <= 0 && !b.pendingBurst) {
        b.ammo -= 1;
        // A fixed post-attack delay, separate from ammo, stops a full clip
        // from leaving the barrel inside a couple of frames.
        b.attackCooldown = cfg.attackCooldown;
        b.timeSinceLastAttack = 0;
        if (b.invisibilityTimer > 0) b.invisibilityTimer = 0;

        // Flash at the barrel so firing has a visible origin, rather than
        // projectiles appearing a few pixels ahead of the body.
        this.addEffect(
          'muzzle_flash',
          b.x + Math.cos(input.aimAngle) * 24,
          b.y + Math.sin(input.aimAngle) * 24,
          17,
          cfg.color,
          0.1,
          input.aimAngle,
          0.45
        );
        executeAbility(this.contextFor(b, input, false), kit.attack);
      }
    }
  }

  /**
   * A blast: damage and knockback to hostile bodies, and demolition of
   * whatever terrain it covers.
   *
   * It always spares the owner. That is not a nicety — before, the tank's
   * landing took 1300 off his own health bar and the artillery gadget blew its
   * user up on the way out.
   */
  private explode(params: ExplosionParams) {
    const { x, y, ownerId, team, damage, radius } = params;

    for (const b of this.brawlers) {
      if (!b.isAlive || b.isJumping) continue;
      if (b.id === ownerId || b.id === params.excludeId) continue;
      if (!this.isHostile(team, b)) continue;

      if (dist(x, y, b.x, b.y) <= radius + BRAWLER_RADIUS) {
        this.damageBrawler(b, damage, ownerId);
        if (params.burn) {
          applyStatus(b, {
            kind: 'burn',
            duration: params.burn.duration,
            magnitude: params.burn.damagePerSec,
          });
        }
        if (params.knockback) applyKnockback(b, x, y, params.knockback, 0.35);
      }
    }

    // Damage boxes
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const box = this.boxes[i];
      if (dist(x, y, box.x + box.w / 2, box.y + box.h / 2) <= radius + 24) {
        box.hp -= damage;
        this.addFloatingNumber(`-${damage}`, box.x + box.w / 2, box.y, '#f59e0b');
        if (box.hp <= 0) {
          this.destroyBox(i);
        }
      }
    }

    // Destroy breakable walls
    let brokeWalls = false;
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const w = this.walls[i];
      if (w.isDestructible) {
        if (dist(x, y, w.x + w.w / 2, w.y + w.h / 2) <= radius + 20) {
          this.walls.splice(i, 1);
          brokeWalls = true;
        }
      }
    }
    if (brokeWalls) this.wallGridDirty = true;

    // Clear bushes in blast radius
    for (let i = this.bushes.length - 1; i >= 0; i--) {
      const bush = this.bushes[i];
      if (dist(x, y, bush.x + bush.w / 2, bush.y + bush.h / 2) <= radius + 15) {
        this.bushes.splice(i, 1);
      }
    }

    if (params.spawnFire) {
      spawnHazard(
        this.world,
        { kind: 'fire', radius: 44, duration: 2.0, damagePerSec: 420 },
        x,
        y,
        ownerId,
        team
      );
    }
  }

  /**
   * Advances every projectile using continuous collision detection.
   *
   * The previous version moved a projectile by `v * dt` and then tested for
   * overlap. Colt's bullets travel 800 px/s, so at 1/60 s they jump ~13 px per
   * tick — and far more on a dropped frame — while bodies are 44 px across and
   * the thinnest walls are 35 px. Shots therefore passed straight through both.
   * Here we ask instead where along the step the *first* contact happened, so a
   * projectile can never skip over anything regardless of its speed.
   */
  private updateProjectiles(dt: number) {
    this.ensureWallGrid();
    const toRemove = new Set<string>();

    for (const p of this.projectiles) {
      // ---- steering, for anything that does not fly straight -----------
      if (p.motion === 'curve' && p.curveRate) {
        const curAng = Math.atan2(p.vy, p.vx) + p.curveRate * dt;
        const spd = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(curAng) * spd;
        p.vy = Math.sin(curAng) * spd;
      } else if (p.motion === 'boomerang' && p.turnAt !== undefined && p.traveled >= p.turnAt) {
        // Turns once, then runs back down its own line. Its range has to grow
        // by the distance it already covered or it would expire on the spot,
        // and its hit list clears so the return leg can connect again.
        p.vx = -p.vx;
        p.vy = -p.vy;
        p.turnAt = undefined;
        p.maxRange += p.traveled;
        p.hitIds = [];
      }

      // A lobbed projectile is in the air: it passes over walls, boxes and
      // bodies alike and only matters where it comes down.
      const airborne = p.motion === 'lob';

      let stepX = p.vx * dt;
      let stepY = p.vy * dt;
      const stepLen = Math.hypot(stepX, stepY);

      // Clip the step at maximum range so a fast projectile expires exactly
      // where its range ends, not up to a whole tick past it.
      const remaining = p.maxRange - p.traveled;
      let expiresThisStep = false;
      if (stepLen >= remaining) {
        const k = remaining / (stepLen || 1);
        stepX *= k;
        stepY *= k;
        expiresThisStep = true;
      }

      // ---- find the earliest contact along the step --------------------
      let bestT = 1;
      let hitKind: 'none' | 'wall' | 'box' | 'brawler' | 'deployable' = 'none';
      let hitWallIndex = -1;
      let hitBoxIndex = -1;
      let hitTarget: BrawlerEntity | null = null;
      let hitDeployable: DeployedEntity | null = null;
      let hitX = p.x + stepX;
      let hitY = p.y + stepY;

      if (!p.piercesWalls && !airborne) {
        const nearWalls = this.wallGrid.querySweep(p.x, p.y, stepX, stepY, p.radius);
        for (let i = 0; i < nearWalls.length; i++) {
          const wall = this.walls[nearWalls[i]];
          if (!wall) continue;
          sweepCircleVsRect(p.x, p.y, p.radius, stepX, stepY, wall, this.sweep);
          if (this.sweep.hit && this.sweep.t < bestT) {
            bestT = this.sweep.t;
            hitKind = 'wall';
            hitWallIndex = nearWalls[i];
            hitX = this.sweep.x;
            hitY = this.sweep.y;
          }
        }
      }

      for (let i = 0; i < this.boxes.length && !airborne; i++) {
        sweepCircleVsRect(p.x, p.y, p.radius, stepX, stepY, this.boxes[i], this.sweep);
        if (this.sweep.hit && this.sweep.t < bestT) {
          bestT = this.sweep.t;
          hitKind = 'box';
          hitBoxIndex = i;
          hitX = this.sweep.x;
          hitY = this.sweep.y;
        }
      }

      for (const target of this.brawlers) {
        if (airborne) break;
        if (!target.isAlive || target.isJumping || target.id === p.ownerId) continue;
        if (!this.isHostile(p.team, target)) continue;
        // Respawn protection should stop the shot, not eat it silently.
        if (target.immunityTimer > 0) continue;
        // A piercing shot may only touch each body once.
        if (p.hitIds && p.hitIds.indexOf(target.id) !== -1) continue;

        sweepCircleVsCircle(
          p.x,
          p.y,
          p.radius,
          stepX,
          stepY,
          target.x,
          target.y,
          BRAWLER_RADIUS,
          this.sweep
        );
        if (this.sweep.hit && this.sweep.t < bestT) {
          bestT = this.sweep.t;
          hitKind = 'brawler';
          hitTarget = target;
          hitX = this.sweep.x;
          hitY = this.sweep.y;
        }
      }

      for (let i = 0; i < this.deployables.length && !airborne; i++) {
        const d = this.deployables[i];
        // Your own turret does not eat your bullets, and a barrier only stops
        // the team it was not placed by.
        if (!this.isHostileTeam(p.team, d.team)) continue;
        if (p.hitIds && p.hitIds.indexOf(d.id) !== -1) continue;

        sweepCircleVsCircle(p.x, p.y, p.radius, stepX, stepY, d.x, d.y, d.radius, this.sweep);
        if (this.sweep.hit && this.sweep.t < bestT) {
          bestT = this.sweep.t;
          hitKind = 'deployable';
          hitDeployable = d;
          hitX = this.sweep.x;
          hitY = this.sweep.y;
        }
      }

      // ---- advance to the contact, or to the end of the step -----------
      const advanceX = stepX * bestT;
      const advanceY = stepY * bestT;
      p.x += advanceX;
      p.y += advanceY;
      p.traveled += Math.hypot(advanceX, advanceY);

      if (hitKind === 'none') {
        if (expiresThisStep) {
          toRemove.add(p.id);
          this.detonateProjectile(p, p.x, p.y, 'end');
        }
        continue;
      }

      if (hitKind === 'wall') {
        const wall = this.walls[hitWallIndex];
        if (p.breaksWalls && wall && wall.isDestructible) {
          this.walls.splice(hitWallIndex, 1);
          this.wallGridDirty = true;
          continue; // carries on through the hole it just made
        }

        // A bouncing shot reflects off the face it struck instead of dying on
        // it. The sweep hands back the surface normal, so this is the same
        // mirror for a flat face and for a corner.
        if (p.motion === 'bounce' && (p.bouncesLeft ?? 0) > 0) {
          p.bouncesLeft = (p.bouncesLeft ?? 0) - 1;
          const nx = this.sweep.nx;
          const ny = this.sweep.ny;
          const vdotn = p.vx * nx + p.vy * ny;
          p.vx -= 2 * vdotn * nx;
          p.vy -= 2 * vdotn * ny;
          // Nudge clear of the surface so the next sweep does not start
          // already touching it.
          p.x += nx * 0.5;
          p.y += ny * 0.5;
          this.addEffect('hit_spark', hitX, hitY, 9, p.color, 0.12, Math.atan2(p.vy, p.vx), 0.25);
          continue;
        }

        toRemove.add(p.id);
        this.addEffect('hit_spark', hitX, hitY, 11, '#cbd5e1', 0.16, Math.atan2(p.vy, p.vx), 0.3);
        this.detonateProjectile(p, hitX, hitY, 'end');
        continue;
      }

      if (hitKind === 'box') {
        const box = this.boxes[hitBoxIndex];
        if (box) {
          box.hp -= p.damage;
          this.addFloatingNumber(`-${p.damage}`, box.x + box.w / 2, box.y, '#f59e0b');
          if (box.hp <= 0) this.destroyBox(hitBoxIndex);
        }
        this.detonateProjectile(p, hitX, hitY, 'end');
        if (!p.piercesBodies) {
          toRemove.add(p.id);
        } else {
          p.x += stepX * (1 - bestT);
          p.y += stepY * (1 - bestT);
        }
        continue;
      }

      if (hitKind === 'deployable' && hitDeployable) {
        const d = hitDeployable;
        // A barrier soaks the shot without taking damage — that is what makes
        // it cover rather than a target.
        if (d.behaviour !== 'blocker') {
          d.hp -= p.damage;
          this.addFloatingNumber(`-${p.damage}`, d.x, d.y - 18, '#fbbf24');
        }
        this.addEffect('hit_spark', hitX, hitY, 12, p.color, 0.18, Math.atan2(p.vy, p.vx), 0.4);
        this.detonateProjectile(p, hitX, hitY, 'end');

        if (!p.piercesBodies) {
          toRemove.add(p.id);
        } else {
          (p.hitIds ||= []).push(d.id);
          p.x += stepX * (1 - bestT);
          p.y += stepY * (1 - bestT);
        }
        continue;
      }

      if (hitKind === 'brawler' && hitTarget) {
        const effectiveDmg = this.applyDamageFalloff(p, p.damage);
        this.damageBrawler(hitTarget, effectiveDmg, p.ownerId);

        // Impact spark, scaled by how hard the shot landed relative to the
        // target's health pool, so a chip hit and a near-execution read
        // differently at a glance.
        const weight = clamp(effectiveDmg / Math.max(1, hitTarget.maxHp * 0.3), 0.25, 1);
        this.addEffect(
          'hit_spark',
          hitX,
          hitY,
          14 + 22 * weight,
          p.color,
          0.22,
          Math.atan2(p.vy, p.vx),
          weight
        );

        // Every connecting shot nudges the target. Without it, taking fire read
        // as a number appearing out of nowhere.
        if (!p.knockbackForce) {
          const nudge = 110 * weight;
          const speed = Math.hypot(p.vx, p.vy) || 1;
          hitTarget.knockbackVx += (p.vx / speed) * nudge;
          hitTarget.knockbackVy += (p.vy / speed) * nudge;
        }

        // Whatever statuses the kit hung on this projectile.
        projectileStatuses(p.hooks, hitTarget);

        if (p.knockbackForce && p.knockbackForce > 0) {
          const ang = Math.atan2(hitTarget.y - hitY, hitTarget.x - hitX);
          hitTarget.knockbackVx += Math.cos(ang) * p.knockbackForce;
          hitTarget.knockbackVy += Math.sin(ang) * p.knockbackForce;
          hitTarget.stunTimer = Math.max(hitTarget.stunTimer, 0.35);
        }

        const owner = this.brawlers.find(o => o.id === p.ownerId);
        // Supers do not charge the next Super.
        if (!p.isSuper && owner) {
          chargeSuperForDamage(owner, effectiveDmg);
        }

        this.detonateProjectile(p, hitX, hitY, 'hit', hitTarget.id);

        if (!p.piercesBodies) {
          toRemove.add(p.id);
        } else {
          (p.hitIds ||= []).push(hitTarget.id);
          p.x += stepX * (1 - bestT);
          p.y += stepY * (1 - bestT);
        }
        continue;
      }
    }

    if (toRemove.size > 0) {
      this.projectiles = this.projectiles.filter(p => !toRemove.has(p.id));
    }
  }

  /**
   * Runs whatever the kit attached to this projectile, wherever it stopped.
   *
   * `kind` distinguishes the two endings: a shot that connected with a body
   * also runs the on-hit list, and its splash is told to spare that body so a
   * direct hit is one instance of damage rather than two.
   */
  private detonateProjectile(
    p: BrawlProjectile,
    x: number,
    y: number,
    kind: 'hit' | 'end',
    hitId?: string
  ) {
    if (!p.hooks) return;
    const owner = this.brawlers.find(o => o.id === p.ownerId);
    runProjectileHooks(this.world, owner, p.hooks, x, y, {
      isSuper: p.isSuper,
      damageMultiplier: owner ? 1 + owner.powerCubes * 0.1 : 1,
      kind,
      aimAngle: Math.atan2(p.vy, p.vx),
      excludeId: hitId,
    });
  }

  /**
   * Close-range damage bonus, as a smooth curve.
   *
   * The curve is data on the projectile rather than a check for one
   * character's name. Smooth, because the version before this used two hard
   * brackets: a blade crossing an invisible line changed its damage by 55%
   * from one pixel to the next.
   */
  private applyDamageFalloff(p: BrawlProjectile, damage: number): number {
    if (!p.falloff || p.isSuper) return damage;
    const t = clamp(p.traveled / p.falloff.range, 0, 1);
    const mult = p.falloff.near + (p.falloff.far - p.falloff.near) * smoothstep(t);
    return Math.round(damage * mult);
  }

  /**
   * Pushes a body out of walls and boxes. Called once per movement axis so a
   * blocked axis does not cancel the other one.
   */
  private resolveAgainstGeometry(b: BrawlerEntity, radius: number, horizontal: boolean) {
    this.ensureWallGrid();

    const near = this.wallGrid.queryCircle(b.x, b.y, radius);
    for (let i = 0; i < near.length; i++) {
      const wall = this.walls[near[i]];
      if (!wall) continue;
      const col = circleRectCollision({ x: b.x, y: b.y, radius }, wall);
      if (col.collided) {
        b.x += col.nx * col.depth;
        b.y += col.ny * col.depth;
        if (horizontal) b.vx = 0;
        else b.vy = 0;
      }
    }

    for (const box of this.boxes) {
      const col = circleRectCollision({ x: b.x, y: b.y, radius }, box);
      if (col.collided) {
        b.x += col.nx * col.depth;
        b.y += col.ny * col.depth;
        if (horizontal) b.vx = 0;
        else b.vy = 0;
      }
    }
  }

  /**
   * Rebuilds the bot navigation grid when the level changes shape. Walls
   * and boxes are both destructible, so a route that was blocked a second
   * ago may now be open.
   */
  private ensureNavGrid() {
    if (this.walls.length === this.navWallCount && this.boxes.length === this.navBoxCount) {
      return;
    }
    this.navGrid.rebuild([this.walls, this.boxes], BRAWLER_RADIUS);
    this.navWallCount = this.walls.length;
    this.navBoxCount = this.boxes.length;
  }

  /** Rebuilds the static broadphase when the wall set has changed. */
  private ensureWallGrid() {
    if (this.wallGridDirty || this.walls.length !== this.wallGridCount) {
      this.wallGrid.rebuildFromRects(this.walls);
      this.wallGridCount = this.walls.length;
      this.wallGridDirty = false;
    }
  }

  private updateThornFields(dt: number) {
    for (let i = this.thornFields.length - 1; i >= 0; i--) {
      const tf = this.thornFields[i];
      tf.duration -= dt;

      // Damage and slow enemies inside
      for (const b of this.brawlers) {
        if (!b.isAlive || b.isJumping) continue;
        // Showdown is free-for-all, so the old gem-grab-only check left
        // Spike standing in his own Super taking 600 damage a second.
        if (b.id === tf.ownerId) continue;
        if (!this.isHostile(tf.team, b)) continue;

        if (dist(tf.x, tf.y, b.x, b.y) <= tf.radius) {
          b.slowTimer = Math.max(b.slowTimer, 0.5);
          this.damageBrawler(b, Math.round(tf.damagePerSec * dt), tf.ownerId, false);
        }
      }

      if (tf.duration <= 0) {
        this.thornFields.splice(i, 1);
      }
    }
  }

  private updateFirePatches(dt: number) {
    for (let i = this.firePatches.length - 1; i >= 0; i--) {
      const fp = this.firePatches[i];
      fp.duration -= dt;

      // Damage enemies standing in fire
      for (const b of this.brawlers) {
        if (!b.isAlive || b.isJumping) continue;
        if (b.id === fp.ownerId) continue;
        if (!this.isHostile(fp.team, b)) continue;

        if (dist(fp.x, fp.y, b.x, b.y) <= fp.radius + 18) {
          this.damageBrawler(b, Math.round(fp.damagePerSec * dt), fp.ownerId, false);
        }
      }

      // Damage boxes in fire
      for (let bi = this.boxes.length - 1; bi >= 0; bi--) {
        const box = this.boxes[bi];
        if (dist(fp.x, fp.y, box.x + box.w / 2, box.y + box.h / 2) <= fp.radius + 15) {
          box.hp -= Math.round(fp.damagePerSec * dt);
          if (box.hp <= 0) {
            this.destroyBox(bi);
          }
        }
      }

      if (fp.duration <= 0) {
        this.firePatches.splice(i, 1);
      }
    }
  }

  private updateVisualEffects(dt: number) {
    for (let i = this.visualEffects.length - 1; i >= 0; i--) {
      const fx = this.visualEffects[i];
      fx.progress += dt / fx.duration;
      if (fx.progress >= 1.0) {
        this.visualEffects.splice(i, 1);
      }
    }
  }

  private destroyBox(index: number) {
    const box = this.boxes[index];
    if (!box) return;

    this.boxes.splice(index, 1);

    // Drop 2 Power Cubes
    [-15, 15].forEach(ox => {
      this.powerCubes.push({
        id: `cube-${this.nextEntityId++}`,
        x: box.x + box.w / 2 + ox,
        y: box.y + box.h / 2,
        radius: 14,
      });
    });
  }

  /**
   * Every point of damage in the game goes through here — bullets, burning
   * ground, hazards, the closing gas. Having exactly one funnel is what lets
   * immunity and shields be a rule rather than something each source has to
   * remember.
   */
  private damageBrawler(
    b: BrawlerEntity,
    damage: number,
    killerId: string,
    showFloating: boolean = true
  ) {
    if (!b.isAlive || damage <= 0) return;

    if (b.immunityTimer > 0) {
      if (showFloating) this.addFloatingNumber('ENGELLENDİ', b.x, b.y - 22, '#93c5fd');
      return;
    }

    const through = absorbWithShield(b, damage);
    const absorbed = damage - through;
    if (absorbed > 0 && showFloating) {
      this.addFloatingNumber(`-${Math.round(absorbed)} KALKAN`, b.x, b.y - 34, '#60a5fa');
    }
    if (through <= 0) return;

    b.hp -= through;
    b.timeSinceLastDamage = 0;

    const source = this.brawlers.find(s => s.id === killerId);
    if (source && source.id !== b.id) {
      b.lastDamageAngle = Math.atan2(source.y - b.y, source.x - b.x);
    }

    // A tank's Super filling from damage taken is what makes its engage
    // inevitable rather than optional. It is a kit trait, not a name check.
    const traits = getKit(b.brawlerId).traits;
    if (traits?.superChargeFromDamageTaken && !b.isClone) {
      chargeSuperFlat(b, (through / b.maxHp) * traits.superChargeFromDamageTaken);
    }

    if (showFloating) {
      this.addFloatingNumber(`-${Math.round(through)}`, b.x, b.y - 20, '#ef4444');
    }

    if (b.hp <= 0) {
      b.isAlive = false;
      b.hp = 0;
      b.pendingBurst = null;
      b.isJumping = false;
      b.deaths++;

      if (source) source.kills++;
      const killer = source;

      const rules = MODE_RULES[this.mode];
      b.respawnTimer = b.isClone ? 0 : rules.respawnDelay;

      if (!b.isClone) {
        // Placement is only meaningful where death is final; in a mode with
        // respawn, being downed is a setback, not an exit.
        if (rules.respawnDelay <= 0) this.eliminationOrder.push(b.id);
        this.killFeed.push({
          id: `kf-${this.nextEntityId++}`,
          killerName: killer ? killer.name : killerId === 'gas' ? 'Zehirli Gaz' : 'Çevre',
          victimName: b.name,
          victimBrawler: b.brawlerId,
          at: this.matchTimer,
        });
        // The HUD only ever shows the last few lines.
        if (this.killFeed.length > 6) this.killFeed.shift();
      }

      // Drop gems carried
      if (b.gemsCarried > 0) {
        for (let i = 0; i < b.gemsCarried; i++) {
          const ang = this.rng.next() * Math.PI * 2;
          const r = 20 + this.rng.next() * 45;
          this.gems.push({
            id: `gem-${this.nextEntityId++}`,
            x: b.x + Math.cos(ang) * r,
            y: b.y + Math.sin(ang) * r,
            radius: 12,
          });
        }
        b.gemsCarried = 0;
      }

      // Drop Power Cubes (Showdown)
      if (this.mode === 'showdown') {
        const cubesToDrop = Math.max(1, Math.floor(b.powerCubes / 2) + 1);
        for (let i = 0; i < cubesToDrop; i++) {
          const ang = this.rng.next() * Math.PI * 2;
          const r = 20 + this.rng.next() * 40;
          this.powerCubes.push({
            id: `cube-${this.nextEntityId++}`,
            x: b.x + Math.cos(ang) * r,
            y: b.y + Math.sin(ang) * r,
            radius: 14,
          });
        }
      }
    }
  }

  private updateGemMine(dt: number) {
    if (!this.gemMine) return;

    this.gemMine.spawnTimer -= dt;
    if (this.gemMine.spawnTimer <= 0) {
      this.gemMine.spawnTimer = 5.5; // Spawn 1 gem every 5.5s
      this.gemMine.totalSpawned++;

      const ang = this.rng.next() * Math.PI * 2;
      const r = 20 + this.rng.next() * 35;
      this.gems.push({
        id: `gem-${this.nextEntityId++}`,
        x: this.gemMine.x + Math.cos(ang) * r,
        y: this.gemMine.y + Math.sin(ang) * r,
        radius: 12,
      });
      this.onSoundTriggered?.({ type: 'gem_pickup' });
    }
  }

  private updatePickups() {
    // Collect Power Cubes
    for (let i = this.powerCubes.length - 1; i >= 0; i--) {
      const cube = this.powerCubes[i];
      for (const b of this.brawlers) {
        if (!b.isAlive || b.isJumping || b.isClone) continue;
        if (dist(cube.x, cube.y, b.x, b.y) <= cube.radius + 22) {
          b.powerCubes++;
          b.maxHp += 400;
          b.hp = Math.min(b.maxHp, b.hp + 400);
          this.powerCubes.splice(i, 1);
          this.addFloatingNumber('+1 GÜÇ KÜPÜ', b.x, b.y - 25, '#22c55e');
          this.onSoundTriggered?.({ type: 'cube_pickup' });
          break;
        }
      }
    }

    // Collect Gems
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const gem = this.gems[i];
      for (const b of this.brawlers) {
        if (!b.isAlive || b.isJumping || b.isClone) continue;
        if (dist(gem.x, gem.y, b.x, b.y) <= gem.radius + 22) {
          b.gemsCarried++;
          this.gems.splice(i, 1);
          this.addFloatingNumber('+1 ELMAS', b.x, b.y - 25, '#c084fc');
          this.onSoundTriggered?.({ type: 'gem_pickup' });
          break;
        }
      }
    }
  }

  private updatePoisonGas(dt: number) {
    if (!this.poisonGas.isActive) return;

    // The gas used to start closing at 25 s and deal a flat 1000 a second,
    // which ended matches in well under a minute: everyone met in the middle
    // immediately and whoever got caught outside was simply executed. A round
    // now has an opening phase — break boxes, take cubes, pick fights on your
    // own terms — before the arena starts squeezing.
    if (this.matchTimer >= GAS_START_TIME) {
      const elapsed = this.matchTimer - GAS_START_TIME;
      // Closes gently at first and accelerates, so late fights are forced
      // rather than the whole match being a sprint to the centre.
      const speed = GAS_SPEED_INITIAL + Math.min(elapsed / 45, 1) * (GAS_SPEED_FINAL - GAS_SPEED_INITIAL);
      if (this.poisonGas.inset < 900) {
        this.poisonGas.inset += dt * speed;
      }

      this.poisonGas.damageTimer += dt;
      if (this.poisonGas.damageTimer >= 1.0) {
        this.poisonGas.damageTimer = 0;
        const minX = this.poisonGas.inset;
        const maxX = MAP_WIDTH - this.poisonGas.inset;
        const minY = this.poisonGas.inset;
        const maxY = MAP_HEIGHT - this.poisonGas.inset;

        for (const b of this.brawlers) {
          if (!b.isAlive || b.isJumping) continue;
          if (b.x < minX || b.x > maxX || b.y < minY || b.y > maxY) {
            // Ramps with the match, so being caught out early is a mistake you
            // can recover from and being caught out late is not.
            const damage = Math.round(
              GAS_DAMAGE_INITIAL +
                Math.min((this.matchTimer - GAS_START_TIME) / 60, 1) *
                  (GAS_DAMAGE_FINAL - GAS_DAMAGE_INITIAL)
            );
            this.damageBrawler(b, damage, 'gas');
            this.addFloatingNumber(`-${damage} GAZ`, b.x, b.y - 20, '#10b981');
          }
        }
      }
    }
  }

  private checkGameModeRules(dt: number) {
    if (this.mode === 'showdown') {
      const aliveBrawlers = this.brawlers.filter(b => b.isAlive && !b.isClone);
      if (aliveBrawlers.length <= 1) {
        this.phase = 'match_end';
        if (aliveBrawlers.length === 1) {
          const winner = aliveBrawlers[0];
          this.winnerPlayerId = winner.id;
          this.starPlayerId = winner.id;
        }
        this.onSoundTriggered?.({ type: 'star_player' });
      }
    } else {
      // Gem Grab Rules
      const teamGems: Record<number, number> = { 0: 0, 1: 0 };
      this.brawlers.forEach(b => {
        if (!b.isClone) {
          teamGems[b.team] = (teamGems[b.team] || 0) + b.gemsCarried;
        }
      });

      const team0Gems = teamGems[0] || 0;
      const team1Gems = teamGems[1] || 0;

      let winningTeam: number | null = null;
      if (team0Gems >= 10 && team0Gems > team1Gems) winningTeam = 0;
      else if (team1Gems >= 10 && team1Gems > team0Gems) winningTeam = 1;

      if (winningTeam !== null) {
        if (this.countdownTeam !== winningTeam) {
          this.countdownTeam = winningTeam;
          this.countdownTimer = 15.0; // 15s Countdown begins!
          this.onSoundTriggered?.({ type: 'alarm' });
        } else {
          this.countdownTimer -= dt;
          if (this.countdownTimer <= 0) {
            this.phase = 'match_end';
            this.winnerTeam = winningTeam;

            // Pick Star Player
            const winningBrawlers = this.brawlers.filter(b => b.team === winningTeam && !b.isClone);
            winningBrawlers.sort((a, b) => (b.gemsCarried * 2 + b.kills) - (a.gemsCarried * 2 + a.kills));
            this.starPlayerId = winningBrawlers[0]?.id || null;
            this.onSoundTriggered?.({ type: 'star_player' });
          }
        }
      } else {
        this.countdownTeam = null;
        this.countdownTimer = 15.0;
      }
    }
  }

  /**
   * Queues a cosmetic effect. Impact feedback was the clearest thing missing
   * from combat: a shot that connected produced a damage number and nothing
   * else, so hits and misses felt identical.
   */
  private addEffect(
    type: VisualEffect['type'],
    x: number,
    y: number,
    radius: number,
    color: string,
    duration: number,
    angle?: number,
    intensity?: number
  ) {
    this.visualEffects.push({
      id: `fx-${this.nextEntityId++}`,
      type,
      x,
      y,
      radius,
      color,
      duration,
      progress: 0,
      angle,
      intensity,
    });
    // Cosmetic only — never let it grow without bound on a busy tick.
    if (this.visualEffects.length > 96) this.visualEffects.shift();
  }

  private addFloatingNumber(text: string, x: number, y: number, color: string) {
    this.floatingNumbers.push({
      id: `fn-${this.nextEntityId++}`,
      text,
      x,
      y,
      color,
      alpha: 1.0,
      vy: -32,
    });
    if (this.floatingNumbers.length > 30) this.floatingNumbers.shift();
  }

  private updateFloatingNumbers(dt: number) {
    for (let i = this.floatingNumbers.length - 1; i >= 0; i--) {
      const fn = this.floatingNumbers[i];
      fn.y += fn.vy * dt;
      fn.alpha -= dt * 1.1;
      if (fn.alpha <= 0) {
        this.floatingNumbers.splice(i, 1);
      }
    }
  }

  public getSnapshot(): BrawlSnapshot {
    return {
      phase: this.phase,
      mode: this.mode,
      matchTimer: this.matchTimer,
      countdownTimer: this.countdownTimer,
      countdownTeam: this.countdownTeam,
      winnerTeam: this.winnerTeam,
      winnerPlayerId: this.winnerPlayerId,
      starPlayerId: this.starPlayerId,
      brawlers: this.brawlers,
      projectiles: this.projectiles,
      deployables: this.deployables,
      thornFields: this.thornFields,
      firePatches: this.firePatches,
      visualEffects: this.visualEffects,
      boxes: this.boxes,
      powerCubes: this.powerCubes,
      gems: this.gems,
      bushes: this.bushes,
      walls: this.walls,
      gemMine: this.gemMine,
      poisonGas: this.poisonGas,
      floatingNumbers: this.floatingNumbers,
      killFeed: this.killFeed,
      eliminationOrder: this.eliminationOrder,
      introCountdown:
        this.phase === 'starting' ? Math.max(0, INTRO_DURATION - this.matchTimer) : 0,
      mapName: this.mapName,
    };
  }
}
