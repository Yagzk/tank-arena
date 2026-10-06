import {
  BrawlerEntity,
  BrawlProjectile,
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
import { generateBrawlMap, MAP_WIDTH, MAP_HEIGHT } from './brawlMaps';
import { circleRectCollision, circleIntersect, sweepCircleVsRect, sweepCircleVsCircle, createSweepHit } from '../core/collision';
import { dist, clamp, moveTowards, smoothstep } from '../core/math';
import { Rng } from '../core/rng';
import { SpatialHash } from '../core/spatialHash';
import { NavGrid } from '../core/navGrid';
import { BrawlBot } from './brawlBot';

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

  constructor() {
    const map = generateBrawlMap('showdown');
    this.walls = map.walls;
    this.bushes = map.bushes;
    this.boxes = map.boxes;
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

    const map = generateBrawlMap(mode);
    this.walls = map.walls;
    this.bushes = map.bushes;
    this.boxes = map.boxes;
    this.gemMine = map.gemMine;
    this.projectiles = [];
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
      const cfg = BRAWLERS[p.brawler || 'mira'];
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

      return {
        id: p.id,
        name: p.name,
        brawlerId: p.brawler || 'mira',
        team,
        x: spawn.x,
        y: spawn.y,
        angle: 0,
        aimAngle: 0,
        vx: 0,
        vy: 0,
        knockbackVx: 0,
        knockbackVy: 0,
        stunTimer: 0,
        speedBoostTimer: 0,
        hp: cfg.maxHp,
        maxHp: cfg.maxHp,
        ammo: 3,
        maxAmmo: 3,
        reloadTimer: 0,
        attackCooldown: 0,
        prevX: spawn.x,
        prevY: spawn.y,
        superCharge: 0,
        isAlive: true,
        powerCubes: 0,
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
        isBot: p.isBot,
        kills: 0,
        burstRemaining: 0,
        burstInterval: 0,
        burstTimer: 0,
        burstIsSuper: false,
        burstAimAngle: 0,
        burstTargetX: 0,
        burstTargetY: 0,
        burstShotIndex: 0,
        // Star Powers & Gadgets
        gadgetCharges: 3,
        gadgetCooldown: 0,
        bandAidCooldown: 0,
        meteorRushTimer: 0,
        burnTimer: 0,
        burnDamagePerSec: 0,
        isClone: false,
      };
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
      if (!b.isAlive) continue;

      const cfg = BRAWLERS[b.brawlerId];

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

      // Timers: Stun, Slow, Speed Boost, Invisibility, Emote, Gadget, Star Powers
      if (b.stunTimer > 0) b.stunTimer -= dt;
      if (b.slowTimer > 0) b.slowTimer -= dt;
      if (b.speedBoostTimer > 0) b.speedBoostTimer -= dt;
      if (b.invisibilityTimer > 0) b.invisibilityTimer -= dt;
      if (b.gadgetCooldown > 0) b.gadgetCooldown -= dt;
      if (b.bandAidCooldown > 0) b.bandAidCooldown -= dt;
      if (b.meteorRushTimer > 0) b.meteorRushTimer -= dt;

      if (b.emoteTimer > 0) {
        b.emoteTimer -= dt;
        if (b.emoteTimer <= 0) b.activeEmote = null;
      }

      // El Fuego Burn Tick
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

      // Shelly Star Power: Band-Aid (Instant heal when HP < 40%)
      if (b.brawlerId === 'mira' && b.hp < b.maxHp * 0.4 && b.bandAidCooldown <= 0) {
        b.hp = Math.min(b.maxHp, b.hp + 1800);
        b.bandAidCooldown = 15.0;
        this.addFloatingNumber('+1800 YARA BANDI!', b.x, b.y - 30, '#4ade80');
        this.visualEffects.push({
          id: `fx-${this.nextEntityId++}`,
          type: 'band_aid',
          x: b.x,
          y: b.y,
          radius: 50,
          color: '#22c55e',
          duration: 0.6,
          progress: 0,
        });
        this.onSoundTriggered?.({ type: 'band_aid' });
      }

      // Spike Star Power: Fertilizer (Heals +700 HP/sec in own Thorn Field)
      if (b.brawlerId === 'thorn') {
        const inOwnThorn = this.thornFields.some(tf => tf.ownerId === b.id && dist(b.x, b.y, tf.x, tf.y) <= tf.radius);
        if (inOwnThorn) {
          b.hp = Math.min(b.maxHp, b.hp + 700 * dt);
        }
      }

      // Leon Star Power: Invisiheal (Heals +700 HP/sec in Stealth)
      if (b.brawlerId === 'wisp' && b.invisibilityTimer > 0) {
        b.hp = Math.min(b.maxHp, b.hp + 700 * dt);
      }

      // Leon Holographic Clone AI
      if (b.isClone) {
        // Clone charges toward nearest enemy
        const enemy = this.brawlers.find(e => e.id !== b.id && e.isAlive && e.team !== b.team && !e.isClone);
        if (enemy) {
          const ang = Math.atan2(enemy.y - b.y, enemy.x - b.x);
          b.x += Math.cos(ang) * 190 * dt;
          b.y += Math.sin(ang) * 190 * dt;
          b.aimAngle = ang;
        }
        b.timeSinceLastDamage += dt;
        if (b.timeSinceLastDamage > 8.0 || b.hp <= 0) {
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
          if (b.brawlerId === 'boulder') {
            this.triggerSlamLanding(b);
          }
        }
        continue; // Airborne brawler skips ground collisions & input
      }

      // Process Queued Burst Attacks (Deterministic tick-based burst shooting)
      if (b.burstRemaining > 0) {
        b.burstTimer -= dt;
        if (b.burstTimer <= 0) {
          this.fireQueuedBurstShot(b);
          b.burstRemaining--;
          b.burstShotIndex++;
          b.burstTimer = b.burstInterval;
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

      // Movement Calculations with Speed Modifiers & Star Powers
      let speed = cfg.speed;
      if (b.slowTimer > 0) speed *= 0.5; // Spike slow
      if (b.speedBoostTimer > 0) speed *= 1.3; // Leon Smoke Trails (+30%)
      if (b.meteorRushTimer > 0) speed *= 1.32; // El Primo Meteor Rush (+32%)

      // Velocity ramps toward the input rather than snapping to it. Instant
      // full-speed starts and dead stops are why movement felt like sliding
      // a cursor around instead of driving a character.
      let targetVx = 0;
      let targetVy = 0;
      const inputLen = Math.hypot(input.moveX, input.moveY);
      const isPushing = inputLen > 0.001;
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
      b.isVisibleToEnemies = !b.isInBush || b.timeSinceLastAttack < 1.5 || b.timeSinceLastDamage < 1.5;

      // Super Sound Trigger (Iconic chime when super reaches 100%)
      const wasSuperReady = this.prevSuperReadyState[b.id] || false;
      const isSuperReady = b.superCharge >= 100;
      if (isSuperReady && !wasSuperReady) {
        this.onSoundTriggered?.({ type: 'super_ready' });
      }
      this.prevSuperReadyState[b.id] = isSuperReady;

      // GADGET ACTIVATION (E Key / Mobile Gadget button)
      if (input.gadget && b.gadgetCharges > 0 && b.gadgetCooldown <= 0) {
        b.gadgetCharges--;
        b.gadgetCooldown = 4.5;
        this.executeGadget(b);
      }

      // ATTACK & SUPER TRIGGERING
      if (input.superAttack && b.superCharge >= 100) {
        b.superCharge = 0;
        b.timeSinceLastAttack = 0;
        if (b.invisibilityTimer > 0) b.invisibilityTimer = 0; // Attacking cancels stealth
        this.executeSuper(b, input);
      } else if (
        input.attack &&
        b.ammo >= 1 &&
        b.attackCooldown <= 0 &&
        b.burstRemaining <= 0
      ) {
        b.ammo -= 1;
        // A fixed post-attack delay, separate from ammo, stops a full clip
        // from leaving the barrel inside a couple of frames.
        b.attackCooldown = cfg.attackCooldown;
        b.timeSinceLastAttack = 0;
        if (b.invisibilityTimer > 0) b.invisibilityTimer = 0; // Attacking cancels stealth
        this.executeAttack(b, input);
      }
    }
  }

  // Gadgets Execution
  private executeGadget(b: BrawlerEntity) {
    this.onSoundTriggered?.({ type: 'gadget_activate' });

    switch (b.brawlerId) {
      case 'mira': {
        // Fast Forward: Dash 140px in aim direction
        this.addFloatingNumber('İLERİ ATILMA!', b.x, b.y - 25, '#c084fc');
        b.knockbackVx = Math.cos(b.aimAngle) * 580;
        b.knockbackVy = Math.sin(b.aimAngle) * 580;
        this.visualEffects.push({
          id: `fx-${this.nextEntityId++}`,
          type: 'dash',
          x: b.x,
          y: b.y,
          radius: 50,
          color: '#a855f7',
          duration: 0.3,
          progress: 0,
        });
        break;
      }

      case 'rivet': {
        // Speedloader: Instantly reload 2 ammo
        b.ammo = Math.min(b.maxAmmo, b.ammo + 2);
        this.addFloatingNumber('+2 CEPHANE!', b.x, b.y - 25, '#ef4444');
        this.onSoundTriggered?.({ type: 'rapid_reload' });
        break;
      }

      case 'boulder': {
        // Suplex Supplement: Grab nearest enemy (< 90px) and throw behind
        let nearest: BrawlerEntity | null = null;
        let minDist = 90;
        for (const other of this.brawlers) {
          if (other.id === b.id || !other.isAlive || other.team === b.team) continue;
          const d = dist(b.x, b.y, other.x, other.y);
          if (d < minDist) {
            minDist = d;
            nearest = other;
          }
        }
        if (nearest) {
          const flingAng = b.aimAngle + Math.PI;
          nearest.x = b.x + Math.cos(flingAng) * 140;
          nearest.y = b.y + Math.sin(flingAng) * 140;
          nearest.stunTimer = 0.6;
          this.damageBrawler(nearest, 480, b.id);
          this.addFloatingNumber('SUPLEX!', nearest.x, nearest.y - 25, '#0284c7');
          this.onSoundTriggered?.({ type: 'super_blast' });
        } else {
          this.addFloatingNumber('HEDEF YOK!', b.x, b.y - 25, '#94a3b8');
        }
        break;
      }

      case 'fuse': {
        // Rocket Laces: Jump in air, push and damage nearby enemies
        this.addFloatingNumber('ROKET BAĞCIKLARI!', b.x, b.y - 25, '#f59e0b');
        b.isJumping = true;
        b.jumpProgress = 0;
        b.jumpStartX = b.x;
        b.jumpStartY = b.y;
        b.jumpTargetX = b.x + Math.cos(b.aimAngle) * 120;
        b.jumpTargetY = b.y + Math.sin(b.aimAngle) * 120;

        this.triggerExplosionAt(b.x, b.y, b.id, b.team, 500, 75, true, 250);
        this.onSoundTriggered?.({ type: 'rocket_launch' });
        break;
      }

      case 'thorn': {
        // Popping Pincushion: 360-degree burst of 16 needles
        this.addFloatingNumber('DİKEN YAĞMURU!', b.x, b.y - 25, '#10b981');
        for (let i = 0; i < 16; i++) {
          const ang = (i * Math.PI * 2) / 16;
          this.projectiles.push({
            id: `proj-${this.nextEntityId++}`,
            ownerId: b.id,
            brawlerId: 'thorn',
            team: b.team,
            x: b.x + Math.cos(ang) * 15,
            y: b.y + Math.sin(ang) * 15,
            vx: Math.cos(ang) * 480,
            vy: Math.sin(ang) * 480,
            radius: 4.5,
            damage: 420,
            maxRange: 240,
            traveled: 0,
            isSuper: false,
            color: '#10b981',
            piercesWalls: false,
            breaksWalls: false,
          });
        }
        break;
      }

      case 'wisp': {
        // Clone Projector: Spawn holographic decoy clone
        this.addFloatingNumber('KLON OLUŞTURULDU!', b.x, b.y - 25, '#06b6d4');
        const cloneId = `clone-${this.nextEntityId++}`;
        this.brawlers.push({
          id: cloneId,
          name: `${b.name} (KLON)`,
          brawlerId: 'wisp',
          team: b.team,
          x: b.x + 20,
          y: b.y + 20,
          angle: b.angle,
          aimAngle: b.aimAngle,
          vx: 0,
          vy: 0,
          knockbackVx: 0,
          knockbackVy: 0,
          stunTimer: 0,
          speedBoostTimer: 0,
          hp: b.hp,
          maxHp: b.maxHp,
          ammo: 0,
          maxAmmo: 3,
          reloadTimer: 0,
          attackCooldown: 0,
          prevX: b.x + 20,
          prevY: b.y + 20,
          superCharge: 0,
          isAlive: true,
          powerCubes: b.powerCubes,
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
          timeSinceLastDamage: 0,
          timeSinceLastAttack: 99,
          slowTimer: 0,
          activeEmote: '🤖',
          emoteTimer: 3,
          isBot: true,
          kills: 0,
          burstRemaining: 0,
          burstInterval: 0,
          burstTimer: 0,
          burstIsSuper: false,
          burstAimAngle: 0,
          burstTargetX: 0,
          burstTargetY: 0,
          burstShotIndex: 0,
          gadgetCharges: 0,
          gadgetCooldown: 99,
          bandAidCooldown: 99,
          meteorRushTimer: 0,
          burnTimer: 0,
          burnDamagePerSec: 0,
          isClone: true,
        });
        break;
      }
    }
  }

  // Basic Attacks Implementation (Authentic to Nova Arena)
  private executeAttack(b: BrawlerEntity, input: BrawlPlayerInput) {
    const cfg = BRAWLERS[b.brawlerId];
    const dmgMultiplier = 1 + b.powerCubes * 0.1;

    // Flash at the barrel so firing has a visible origin, not just projectiles
    // appearing a few pixels ahead of the body.
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

    switch (b.brawlerId) {
      case 'mira': {
        // Shelly Buckshot: 5 spread pellets simultaneously! Devastating point blank
        this.onSoundTriggered?.({ type: 'scatter_shot' });
        const pelletCount = 5;
        const spread = cfg.spreadAngle;
        const baseDmg = Math.round(cfg.damagePerAttack * dmgMultiplier);

        for (let i = 0; i < pelletCount; i++) {
          const offset = ((i / (pelletCount - 1)) - 0.5) * spread;
          const ang = input.aimAngle + offset;
          this.projectiles.push({
            id: `proj-${this.nextEntityId++}`,
            ownerId: b.id,
            brawlerId: b.brawlerId,
            team: b.team,
            x: b.x + Math.cos(ang) * 22,
            y: b.y + Math.sin(ang) * 22,
            vx: Math.cos(ang) * cfg.projectileSpeed,
            vy: Math.sin(ang) * cfg.projectileSpeed,
            radius: 5,
            damage: baseDmg,
            maxRange: cfg.range,
            traveled: 0,
            isSuper: false,
            color: '#c084fc',
            piercesWalls: false,
            breaksWalls: false,
          });
        }
        break;
      }

      case 'rivet': {
        // Colt Six-Shooters: 6 high-speed bullets in rapid burst!
        this.onSoundTriggered?.({ type: 'rapid_shot' });
        b.burstRemaining = 6;
        b.burstInterval = 0.065;
        b.burstTimer = 0; // Fire first bullet immediately
        b.burstIsSuper = false;
        b.burstAimAngle = input.aimAngle;
        b.burstShotIndex = 0;
        break;
      }

      case 'boulder': {
        // El Primo Fists of Fury: 4 rapid alternating boxing punches!
        this.onSoundTriggered?.({ type: 'heavy_punch' });
        b.burstRemaining = 4;
        b.burstInterval = 0.08;
        b.burstTimer = 0;
        b.burstIsSuper = false;
        b.burstAimAngle = input.aimAngle;
        b.burstShotIndex = 0;
        break;
      }

      case 'fuse': {
        // Brock Rockin' Rocket: Single rocket with splash AoE and incendiary fire patch!
        this.onSoundTriggered?.({ type: 'rocket_launch' });
        const baseDmg = Math.round(cfg.damagePerAttack * dmgMultiplier);
        this.projectiles.push({
          id: `proj-${this.nextEntityId++}`,
          ownerId: b.id,
          brawlerId: b.brawlerId,
          team: b.team,
          x: b.x + Math.cos(input.aimAngle) * 25,
          y: b.y + Math.sin(input.aimAngle) * 25,
          vx: Math.cos(input.aimAngle) * cfg.projectileSpeed,
          vy: Math.sin(input.aimAngle) * cfg.projectileSpeed,
          radius: 8,
          damage: baseDmg,
          maxRange: cfg.range,
          traveled: 0,
          isSuper: false,
          color: '#fbbf24',
          piercesWalls: false,
          breaksWalls: false,
          spawnFireOnEnd: true,
        });
        break;
      }

      case 'thorn': {
        // Spike Needle Grenade: Explodes into 6 sharp needles at 60° increments with Curveball!
        this.onSoundTriggered?.({ type: 'scatter_shot' });
        const baseDmg = Math.round(cfg.damagePerAttack * dmgMultiplier);
        this.projectiles.push({
          id: `proj-${this.nextEntityId++}`,
          ownerId: b.id,
          brawlerId: b.brawlerId,
          team: b.team,
          x: b.x + Math.cos(input.aimAngle) * 20,
          y: b.y + Math.sin(input.aimAngle) * 20,
          vx: Math.cos(input.aimAngle) * cfg.projectileSpeed,
          vy: Math.sin(input.aimAngle) * cfg.projectileSpeed,
          radius: 9,
          damage: baseDmg,
          maxRange: cfg.range,
          traveled: 0,
          isSuper: false,
          color: '#34d399',
          piercesWalls: false,
          breaksWalls: false,
          burstNeedlesOnEnd: true,
        });
        break;
      }

      case 'wisp': {
        // Leon Spinner Blades: 4 shurikens in a sweep! Assassin close-range burst
        this.onSoundTriggered?.({ type: 'blade_throw' });
        b.burstRemaining = 4;
        b.burstInterval = 0.055;
        b.burstTimer = 0;
        b.burstIsSuper = false;
        b.burstAimAngle = input.aimAngle;
        b.burstShotIndex = 0;
        break;
      }
    }
  }

  // Firing one shot from the active burst queue
  private fireQueuedBurstShot(b: BrawlerEntity) {
    const cfg = BRAWLERS[b.brawlerId];
    const dmgMultiplier = 1 + b.powerCubes * 0.1;

    if (b.brawlerId === 'rivet') {
      if (b.burstIsSuper) {
        // Colt Super: Bullet Storm (12 giant piercing bullets)
        const spread = (this.rng.next() - 0.5) * 0.05;
        const ang = b.burstAimAngle + spread;
        this.projectiles.push({
          id: `proj-${this.nextEntityId++}`,
          ownerId: b.id,
          brawlerId: b.brawlerId,
          team: b.team,
          x: b.x + Math.cos(ang) * 26,
          y: b.y + Math.sin(ang) * 26,
          vx: Math.cos(ang) * 800,
          vy: Math.sin(ang) * 800,
          radius: 7,
          damage: Math.round(440 * dmgMultiplier),
          maxRange: 580,
          traveled: 0,
          isSuper: true,
          color: '#f43f5e',
          piercesWalls: true,
          breaksWalls: true,
        });
        if (b.burstShotIndex % 3 === 0) this.onSoundTriggered?.({ type: 'rapid_shot' });
      } else {
        // Colt Basic: Six-Shooters (6 rapid bullets)
        const spread = (this.rng.next() - 0.5) * 0.04;
        const ang = b.burstAimAngle + spread;
        this.projectiles.push({
          id: `proj-${this.nextEntityId++}`,
          ownerId: b.id,
          brawlerId: b.brawlerId,
          team: b.team,
          x: b.x + Math.cos(ang) * 22,
          y: b.y + Math.sin(ang) * 22,
          vx: Math.cos(ang) * cfg.projectileSpeed,
          vy: Math.sin(ang) * cfg.projectileSpeed,
          radius: 4.5,
          damage: Math.round(cfg.damagePerAttack * dmgMultiplier),
          maxRange: cfg.range,
          traveled: 0,
          isSuper: false,
          color: '#f87171',
          piercesWalls: false,
          breaksWalls: false,
        });
      }
    } else if (b.brawlerId === 'boulder') {
      // El Primo Fists of Fury (alternating left/right punches)
      const offset = (b.burstShotIndex % 2 === 0 ? 1 : -1) * 0.14;
      const ang = b.burstAimAngle + offset;
      this.projectiles.push({
        id: `proj-${this.nextEntityId++}`,
        ownerId: b.id,
        brawlerId: b.brawlerId,
        team: b.team,
        x: b.x + Math.cos(ang) * 20,
        y: b.y + Math.sin(ang) * 20,
        vx: Math.cos(ang) * cfg.projectileSpeed,
        vy: Math.sin(ang) * cfg.projectileSpeed,
        radius: 9,
        damage: Math.round(cfg.damagePerAttack * dmgMultiplier),
        maxRange: cfg.range,
        traveled: 0,
        isSuper: false,
        color: '#38bdf8',
        piercesWalls: false,
        breaksWalls: false,
      });
    } else if (b.brawlerId === 'wisp') {
      // Leon Spinner Blades (sweeping arc from left to right)
      const offset = ((b.burstShotIndex / 3) - 0.5) * 0.28;
      const ang = b.burstAimAngle + offset;
      this.projectiles.push({
        id: `proj-${this.nextEntityId++}`,
        ownerId: b.id,
        brawlerId: b.brawlerId,
        team: b.team,
        x: b.x + Math.cos(ang) * 20,
        y: b.y + Math.sin(ang) * 20,
        vx: Math.cos(ang) * cfg.projectileSpeed,
        vy: Math.sin(ang) * cfg.projectileSpeed,
        radius: 6,
        damage: Math.round(cfg.damagePerAttack * dmgMultiplier),
        maxRange: cfg.range,
        traveled: 0,
        isSuper: false,
        color: '#22d3ee',
        piercesWalls: false,
        breaksWalls: false,
      });
    } else if (b.brawlerId === 'fuse' && b.burstIsSuper) {
      // Brock Super: Rocket Rain (9 artillery rockets)
      const rx = b.burstTargetX + (this.rng.next() - 0.5) * 170;
      const ry = b.burstTargetY + (this.rng.next() - 0.5) * 170;
      this.triggerExplosionAt(rx, ry, b.id, b.team, Math.round(950 * dmgMultiplier), 85, true);
      this.onSoundTriggered?.({ type: 'rocket_launch' });
    }
  }

  // Super Attacks Implementation
  private executeSuper(b: BrawlerEntity, input: BrawlPlayerInput) {
    const dmgMultiplier = 1 + b.powerCubes * 0.1;

    switch (b.brawlerId) {
      case 'mira': {
        // Super Shell: 9 heavy buckshot shells that break walls, shear bushes, knock back, and stun!
        this.onSoundTriggered?.({ type: 'super_blast' });
        const pelletCount = 9;
        const spread = 0.55;
        const superDmg = Math.round(440 * dmgMultiplier);

        this.visualEffects.push({
          id: `fx-${this.nextEntityId++}`,
          type: 'shockwave',
          x: b.x + Math.cos(input.aimAngle) * 30,
          y: b.y + Math.sin(input.aimAngle) * 30,
          radius: 90,
          color: '#e879f9',
          duration: 0.35,
          progress: 0,
        });

        for (let i = 0; i < pelletCount; i++) {
          const offset = ((i / (pelletCount - 1)) - 0.5) * spread;
          const ang = input.aimAngle + offset;
          this.projectiles.push({
            id: `proj-${this.nextEntityId++}`,
            ownerId: b.id,
            brawlerId: b.brawlerId,
            team: b.team,
            x: b.x + Math.cos(ang) * 26,
            y: b.y + Math.sin(ang) * 26,
            vx: Math.cos(ang) * 680,
            vy: Math.sin(ang) * 680,
            radius: 7.5,
            damage: superDmg,
            maxRange: 400,
            traveled: 0,
            isSuper: true,
            color: '#e879f9',
            piercesWalls: false,
            breaksWalls: true,
            knockbackForce: 380,
          });
        }
        break;
      }

      case 'rivet': {
        // Bullet Storm: 12 long-range piercing bullets breaking through obstacles!
        this.onSoundTriggered?.({ type: 'super_blast' });
        b.burstRemaining = 12;
        b.burstInterval = 0.045;
        b.burstTimer = 0;
        b.burstIsSuper = true;
        b.burstAimAngle = input.aimAngle;
        b.burstShotIndex = 0;
        break;
      }

      case 'boulder': {
        // Flying Elbow Drop: Airborne leap over walls and landing earthquake shockwave!
        this.onSoundTriggered?.({ type: 'heavy_leap' });
        b.isJumping = true;
        b.jumpProgress = 0;
        b.jumpStartX = b.x;
        b.jumpStartY = b.y;

        const leapDist = Math.min(380, dist(b.x, b.y, input.superTargetX || b.x, input.superTargetY || b.y) || 280);
        const ang = Math.atan2((input.superTargetY || b.y) - b.y, (input.superTargetX || b.x) - b.x);
        b.jumpTargetX = b.x + Math.cos(ang) * leapDist;
        b.jumpTargetY = b.y + Math.sin(ang) * leapDist;
        break;
      }

      case 'fuse': {
        // Rocket Rain: 9 heavy incendiary rockets raining from above!
        this.onSoundTriggered?.({ type: 'super_blast' });
        const targetX = input.superTargetX || (b.x + Math.cos(b.aimAngle) * 360);
        const targetY = input.superTargetY || (b.y + Math.sin(b.aimAngle) * 360);

        b.burstRemaining = 9;
        b.burstInterval = 0.12;
        b.burstTimer = 0;
        b.burstIsSuper = true;
        b.burstTargetX = targetX;
        b.burstTargetY = targetY;
        b.burstShotIndex = 0;
        break;
      }

      case 'thorn': {
        // Stick Around!: Giant thorny garden slowing enemies by 50% and dealing rapid damage
        this.onSoundTriggered?.({ type: 'super_blast' });
        const targetX = input.superTargetX || (b.x + Math.cos(b.aimAngle) * 320);
        const targetY = input.superTargetY || (b.y + Math.sin(b.aimAngle) * 320);

        this.thornFields.push({
          id: `tf-${this.nextEntityId++}`,
          ownerId: b.id,
          team: b.team,
          x: targetX,
          y: targetY,
          radius: 135,
          duration: 5.0,
          damagePerSec: Math.round(600 * dmgMultiplier),
        });
        break;
      }

      case 'wisp': {
        // Smoke Bomb: Smoke cloud puff, 6s Invisibility AND +30% Assassin Speed Boost & Invisiheal!
        this.onSoundTriggered?.({ type: 'super_blast' });
        b.invisibilityTimer = 6.0;
        b.speedBoostTimer = 6.0;

        this.visualEffects.push({
          id: `fx-${this.nextEntityId++}`,
          type: 'smoke_poof',
          x: b.x,
          y: b.y,
          radius: 65,
          color: '#06b6d4',
          duration: 0.5,
          progress: 0,
        });

        this.addFloatingNumber('GÖRÜNMEZLİK AKTİF!', b.x, b.y - 30, '#06b6d4');
        break;
      }
    }
  }

  private triggerSlamLanding(b: BrawlerEntity) {
    this.onSoundTriggered?.({ type: 'super_blast' });
    const blastRadius = 125;
    const dmg = Math.round(1300 * (1 + b.powerCubes * 0.1));

    // El Primo Meteor Rush Star Power (+32% speed for 4s)
    b.meteorRushTimer = 4.0;

    // Spawn earthquake crater shockwave
    this.visualEffects.push({
      id: `fx-${this.nextEntityId++}`,
      type: 'ground_slam',
      x: b.x,
      y: b.y,
      radius: blastRadius,
      color: '#f59e0b',
      duration: 0.45,
      progress: 0,
    });

    this.triggerExplosionAt(b.x, b.y, b.id, b.team, dmg, blastRadius, false, 420, true);
  }

  private triggerExplosionAt(
    x: number,
    y: number,
    ownerId: string,
    team: number,
    damage: number,
    radius: number,
    spawnFire: boolean = false,
    knockbackForce: number = 0,
    applyPrimoBurn: boolean = false
  ) {
    // Damage and knockback enemies
    for (const b of this.brawlers) {
      if (!b.isAlive || b.isJumping) continue;
      // El Primo's landing used to take 1300 off his own health bar, and
      // Brock's Rocket Laces blew him up on the way out.
      if (b.id === ownerId) continue;
      if (b.team === team && this.mode === 'gem_grab') continue;

      const d = dist(x, y, b.x, b.y);
      if (d <= radius + 22) {
        this.damageBrawler(b, damage, ownerId);

        // El Fuego Star Power: Burns hit enemies for 4s
        if (applyPrimoBurn) {
          b.burnTimer = 4.0;
          b.burnDamagePerSec = 300;
        }

        // Apply knockback away from explosion
        if (knockbackForce > 0) {
          const ang = Math.atan2(b.y - y, b.x - x);
          b.knockbackVx += Math.cos(ang) * knockbackForce;
          b.knockbackVy += Math.sin(ang) * knockbackForce;
          b.stunTimer = Math.max(b.stunTimer, 0.35);
        }
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
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const w = this.walls[i];
      if (w.isDestructible) {
        if (dist(x, y, w.x + w.w / 2, w.y + w.h / 2) <= radius + 20) {
          this.walls.splice(i, 1);
        }
      }
    }

    // Clear bushes in blast radius
    for (let i = this.bushes.length - 1; i >= 0; i--) {
      const bush = this.bushes[i];
      if (dist(x, y, bush.x + bush.w / 2, bush.y + bush.h / 2) <= radius + 15) {
        this.bushes.splice(i, 1);
      }
    }

    // Spawn Incendiary Fire Patch if requested (Brock)
    if (spawnFire) {
      this.firePatches.push({
        id: `fire-${this.nextEntityId++}`,
        ownerId,
        team,
        x,
        y,
        radius: 44,
        duration: 2.0,
        damagePerSec: 420,
      });
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
      // Spike's needles curve as they fly.
      if (p.isCurvingNeedle) {
        const curAng = Math.atan2(p.vy, p.vx) + 2.5 * dt;
        const spd = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(curAng) * spd;
        p.vy = Math.sin(curAng) * spd;
      }

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
      let hitKind: 'none' | 'wall' | 'box' | 'brawler' = 'none';
      let hitWallIndex = -1;
      let hitBoxIndex = -1;
      let hitTarget: BrawlerEntity | null = null;
      let hitX = p.x + stepX;
      let hitY = p.y + stepY;

      if (!p.piercesWalls) {
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

      for (let i = 0; i < this.boxes.length; i++) {
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
        if (!target.isAlive || target.isJumping || target.id === p.ownerId) continue;
        if (this.mode === 'gem_grab' && target.team === p.team) continue;
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

      // ---- advance to the contact, or to the end of the step -----------
      const advanceX = stepX * bestT;
      const advanceY = stepY * bestT;
      p.x += advanceX;
      p.y += advanceY;
      p.traveled += Math.hypot(advanceX, advanceY);

      if (hitKind === 'none') {
        if (expiresThisStep) {
          toRemove.add(p.id);
          this.detonateProjectile(p, p.x, p.y);
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
        toRemove.add(p.id);
        this.addEffect('hit_spark', hitX, hitY, 11, '#cbd5e1', 0.16, Math.atan2(p.vy, p.vx), 0.3);
        this.detonateProjectile(p, hitX, hitY);
        continue;
      }

      if (hitKind === 'box') {
        const box = this.boxes[hitBoxIndex];
        if (box) {
          box.hp -= p.damage;
          this.addFloatingNumber(`-${p.damage}`, box.x + box.w / 2, box.y, '#f59e0b');
          if (box.hp <= 0) this.destroyBox(hitBoxIndex);
        }
        this.detonateProjectile(p, hitX, hitY);
        if (!p.piercesWalls) {
          toRemove.add(p.id);
        } else {
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

        // Shelly's Super slows whatever it catches.
        if (p.brawlerId === 'mira' && p.isSuper) {
          hitTarget.slowTimer = 3.0;
        }

        if (p.knockbackForce && p.knockbackForce > 0) {
          const ang = Math.atan2(hitTarget.y - hitY, hitTarget.x - hitX);
          hitTarget.knockbackVx += Math.cos(ang) * p.knockbackForce;
          hitTarget.knockbackVy += Math.sin(ang) * p.knockbackForce;
          hitTarget.stunTimer = Math.max(hitTarget.stunTimer, 0.35);
        }

        // Supers do not charge the next Super.
        if (!p.isSuper) {
          const owner = this.brawlers.find(o => o.id === p.ownerId);
          if (owner) {
            owner.superCharge = Math.min(
              100,
              owner.superCharge + this.superChargeFor(owner, effectiveDmg)
            );
          }
        }

        this.detonateProjectile(p, hitX, hitY);

        if (!p.piercesWalls) {
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

  /** Secondary effects a projectile triggers wherever it comes to rest. */
  private detonateProjectile(p: BrawlProjectile, x: number, y: number) {
    if (p.burstNeedlesOnEnd) {
      this.burstSpikeNeedles(x, y, p.ownerId, p.team, Math.round(p.damage * 0.6));
    }
    if (p.spawnFireOnEnd) {
      this.triggerExplosionAt(x, y, p.ownerId, p.team, p.damage, 65, true);
    }
  }

  /**
   * Leon's close-range bonus as a smooth curve. The old version used two hard
   * brackets, so a blade crossing an invisible 130 px line changed its damage
   * by 55% from one pixel to the next.
   */
  private applyDamageFalloff(p: BrawlProjectile, damage: number): number {
    if (p.brawlerId !== 'wisp' || p.isSuper) return damage;
    const t = clamp(p.traveled / 320, 0, 1);
    return Math.round(damage * (1.7 - 0.95 * smoothstep(t)));
  }

  /**
   * Super charge is proportional to damage dealt, not to how many projectiles
   * happened to connect. Charging a flat amount per pellet meant Shelly's
   * five-pellet shot filled 52% of her Super on one trigger pull and Colt's
   * six-round burst 54% — two attacks and the Super was back.
   */
  private superChargeFor(owner: BrawlerEntity, damage: number): number {
    const cfg = BRAWLERS[owner.brawlerId];
    const fullAttackDamage = cfg.damagePerAttack * Math.max(1, cfg.projectileCount);
    return (damage * 100) / (fullAttackDamage * cfg.superHitsRequired);
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

  // Spike's 6 Needle Burst at 60-degree increments (With Curveball)
  private burstSpikeNeedles(x: number, y: number, ownerId: string, team: number, damage: number) {
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3;
      this.projectiles.push({
        id: `proj-${this.nextEntityId++}`,
        ownerId,
        brawlerId: 'thorn',
        team,
        x,
        y,
        vx: Math.cos(ang) * 460,
        vy: Math.sin(ang) * 460,
        radius: 4.5,
        damage,
        maxRange: 210,
        traveled: 0,
        isSuper: false,
        color: '#10b981',
        piercesWalls: false,
        breaksWalls: false,
        isCurvingNeedle: true,
      });
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
        if (this.mode === 'gem_grab' && b.team === tf.team) continue;

        if (dist(tf.x, tf.y, b.x, b.y) <= tf.radius) {
          b.slowTimer = 0.5; // 50% slow down
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
        if (this.mode === 'gem_grab' && b.team === fp.team) continue;

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

  private damageBrawler(b: BrawlerEntity, damage: number, killerId: string, showFloating: boolean = true) {
    b.hp -= damage;
    b.timeSinceLastDamage = 0;

    // El Primo Tank Trait: Charges super when receiving damage!
    if (b.brawlerId === 'boulder' && !b.isClone) {
      b.superCharge = Math.min(100, b.superCharge + (damage / b.maxHp) * 75);
    }

    if (showFloating) {
      this.addFloatingNumber(`-${damage}`, b.x, b.y - 20, '#ef4444');
    }

    if (b.hp <= 0 && b.isAlive) {
      b.isAlive = false;
      b.hp = 0;

      const killer = this.brawlers.find(k => k.id === killerId);
      if (killer) killer.kills++;

      if (!b.isClone) {
        this.eliminationOrder.push(b.id);
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
    };
  }
}
