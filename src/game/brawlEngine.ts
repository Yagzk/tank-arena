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
  HotZone,
  BallState,
  GoalArea,
  Safe,
} from '../types/brawl';
import { generateBrawlMap, MAP_WIDTH, MAP_HEIGHT } from '../maps';
import { circleRectCollision, circleIntersect, sweepCircleVsRect, sweepCircleVsCircle, createSweepHit } from '../core/collision';
import { dist, clamp, moveTowards, smoothstep } from '../core/math';
import { Rng } from '../core/rng';
import { SpatialHash } from '../core/spatialHash';
import { NavGrid } from '../core/navGrid';
import { BrawlBot, type Strike } from './brawlBot';
import type { SoundType } from '../audio/cues';
import { MODES, SAFE_HP, bountyPayout, decideByScore, decideHeist, decideRound, teamFor, zoneController } from './modes';
import { createBrawlerEntity, respawnBrawler, NO_DAMAGE_DIRECTION } from '../sim/entity';
import { BRAWLER_RADIUS, integrateMovement, maxSpeedFor, pushOutOfRect } from '../sim/movement';
import { updateDeployables } from '../sim/systems/deployables';
import { getKit, gadgetOf } from '../sim/kits';
import { damageFactor } from '../sim/damageFactor';
import { conditionalMods } from '../sim/conditions';
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
  type: SoundType;
  /** Where it happened, so a client can place it relative to the listener. */
  x?: number;
  y?: number;
  /**
   * The only player it is meant for. "Your Super is ready" is not news to
   * everybody else, and a chime for a bot's Super is just noise.
   */
  to?: string;
}

/** Hot Zone: how big the zone is, and how fast holding it scores. */
const ZONE_RADIUS = 150;
const ZONE_POINTS_PER_SECOND = 1;

/** Duo Showdown: how long a fallen partner waits, and how long they are protected on return. */
const DUO_RESPAWN_DELAY = 15;
const DUO_RESPAWN_IMMUNITY = 2;

/** How much of its damage a reflected shot keeps on the way back. */
const REFLECT_DAMAGE_KEPT = 0.6;

/** Brawl Ball: the ball, how it rolls, and how hard it is kicked. */
const BALL_RADIUS = 14;
const BALL_FRICTION = 1.4;
const BALL_BOUNCE = 0.6;
const BALL_KICK_SPEED = 900;
const BALL_MAX_SPEED = 1000;
/** Seconds the one who just kicked or dropped the ball cannot pick it up again. */
const BALL_RETAKE_DELAY = 0.45;
/** A hit harder than this knocks the ball loose from its carrier. */
const BALL_DROP_KNOCKBACK = 250;
/** Seconds the goal is celebrated before everyone is put back. */
const GOAL_CELEBRATION = 2.2;
/** How long a tied game may go on past time, in sudden death, before it is called a draw. */
const OVERTIME_LIMIT = 60;

/** How far apart the two members of a pair start, in world units. */
const PARTNER_OFFSET = 52;

/** Seconds a decided Knockout round plays on before the next begins. */
const ROUND_CLOSE_DELAY = 1.8;

/** Shortest time, in simulated seconds, between two reports of the same sound. */
const SOUND_GAPS: Partial<Record<SoundType, number>> = {
  hit: 0.06,
  rapid_shot: 0.05,
  explosion: 0.06,
  rapid_reload: 0.1,
};

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


/** Seconds a gadget is locked out for after use. */
const GADGET_COOLDOWN = 4.5;

/** How far a placed Super reaches when the player gave only a direction. */
const SUPER_DEFAULT_REACH = 360;

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
  /** Points per team, in modes decided by a score. */
  public teamScores: number[] = [];
  /** Hot Zone's zone; null in every other mode. */
  public zone: HotZone | null = null;
  /** Brawl Ball's ball and goals; null and empty in every other mode. */
  public ball: BallState | null = null;
  public goals: GoalArea[] = [];
  /** Heist's safes; empty in every other mode. */
  public safes: Safe[] = [];
  private ballSpawn: { x: number; y: number } | null = null;
  /** Seconds left of the goal celebration, or null while play is live. */
  private goalTimer: number | null = null;
  /** The team that just scored, while it is being celebrated. */
  private goalTeam: number | null = null;
  /** Seconds of play already used before the last restart. */
  private playedBefore = 0;
  private lastToucher: string | null = null;
  /** Brawl Ball: set once a tied game goes to sudden death and the field is cleared. */
  private suddenDeath = false;
  private ballRetake: Record<string, number> = {};
  private goalsBy: Record<string, number> = {};
  /** Knockout: the round being played, and the rounds each team has won. */
  public round = 1;
  public roundWins: number[] = [];
  /** Seconds until a decided Knockout round is closed out, or null while it is live. */
  private roundCloseTimer: number | null = null;
  private roundResult: { winner: number | null } | null = null;
  /** What this match was built from, so a new round can rebuild the same map. */
  private matchSeed = 0;
  private matchPlayers: PlayerInfo[] = [];
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

  /** `simClock` when each kind of sound last went out. */
  private soundSentAt: Record<string, number> = {};

  /**
   * Reports a sound, rationed.
   *
   * A hit lands every few ticks in a fight, and every report is a message to
   * every client. Beyond a point they are inaudible as separate sounds anyway —
   * the audio side refuses to restart one inside its cooldown — so the cut is
   * made here, before they cost bandwidth.
   */
  private emitSound(type: SoundType, x?: number, y?: number, to?: string) {
    if (!this.onSoundTriggered) return;
    const key = to ? type + ':' + to : type;
    const gap = SOUND_GAPS[type] ?? 0.03;
    const last = this.soundSentAt[key];
    if (last !== undefined && this.simClock - last < gap) return;
    this.soundSentAt[key] = this.simClock;
    this.onSoundTriggered({
      type,
      x: x === undefined ? undefined : Math.round(x),
      y: y === undefined ? undefined : Math.round(y),
      to,
    });
  }

  private nextEntityId: number = 1;
  /** Seconds of simulated time since the engine was made. */
  private simClock = 0;
  /** `simClock` when each player's latest input arrived. */
  private inputAckAt: Record<string, number> = {};
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
      sound: (type, x, y) => this.emitSound(type, x, y),
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
    isSuper: boolean,
    scale = 1,
    charged = false
  ): AbilityContext {
    const reach = isSuper ? SUPER_DEFAULT_REACH : BRAWLERS[b.brawlerId].range;
    return makeContext(this.world, b, {
      scale,
      charged,
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
    this.matchSeed = seed;
    this.matchPlayers = players;
    this.round = 1;
    this.roundWins = [];
    this.roundCloseTimer = null;
    this.roundResult = null;
    this.playedBefore = 0;
    this.goalTimer = null;
    this.goalTeam = null;
    this.lastToucher = null;
    this.ballRetake = {};
    this.goalsBy = {};
    this.suddenDeath = false;

    const def = MODES[mode];
    const map = this.loadMap(mode, seed);
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

    this.poisonGas = { inset: 0, damageTimer: 0, isActive: def.gas };

    // Initialize brawlers (up to 10 players)
    this.brawlers = players.map((p, idx) => {
      const team = teamFor(mode, idx);
      const spawn = this.spawnFor(map, mode, idx, team);

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
        // A bot takes whatever the roll gives it; a person, what they chose.
        gadget: p.gadget ?? (p.isBot ? this.rng.int(0, 1) : 0),
        starPower: p.starPower ?? (p.isBot ? this.rng.int(0, 1) : 0),
      });
      // Where this brawler returns to if the mode allows it, fixed for the
      // whole match so a death never relocates someone's base.
      entity.spawnX = spawn.x;
      entity.spawnY = spawn.y;
      return entity;
    });

    const teams = new Set(this.brawlers.map(b => b.team)).size;
    if (def.grouping !== 'solo') {
      this.teamScores = new Array(Math.max(2, teams)).fill(0);
      this.roundWins = new Array(Math.max(2, teams)).fill(0);
    } else {
      this.teamScores = [];
    }
  }

  /** Builds the level for a mode and installs it. */
  private loadMap(mode: BrawlGameMode, seed: number) {
    const def = MODES[mode];
    const map = generateBrawlMap(mode, seed);
    this.walls = map.walls;
    this.bushes = map.bushes;
    // Power cubes belong to the modes that have them. Gem Grab has no use for
    // a box that drops one, and used to be handing out health for smashing it.
    this.boxes = def.powerCubes ? map.boxes : [];
    this.gemMine = map.gemMine;
    this.mapName = map.name;
    this.wallGridDirty = true;

    this.zone =
      mode === 'hot_zone' && map.objective
        ? { x: map.objective.x, y: map.objective.y, radius: ZONE_RADIUS, controller: null }
        : null;

    this.goals = def.usesBall ? map.goals : [];
    this.ballSpawn = def.usesBall && map.ballSpawn ? map.ballSpawn : null;
    this.safes = def.usesSafes
      ? map.goals.map(g => ({
          id: 'safe-' + g.team,
          team: g.team,
          x: g.x,
          y: g.y,
          w: g.w,
          h: g.h,
          hp: SAFE_HP,
          maxHp: SAFE_HP,
        }))
      : [];
    this.ball = this.ballSpawn
      ? { x: this.ballSpawn.x, y: this.ballSpawn.y, vx: 0, vy: 0, radius: BALL_RADIUS, carrier: null }
      : null;
    return map;
  }

  /**
   * Where the idx-th player starts.
   *
   * Two-sided maps list each side's spawns together, so a player takes the next
   * free one on their own side; indexing by raw roster order dropped half the
   * lobby into the enemy base. In a pair, the partner stands beside the first.
   */
  private spawnFor(
    map: ReturnType<typeof generateBrawlMap>,
    mode: BrawlGameMode,
    idx: number,
    team: number
  ): { x: number; y: number } {
    const spawns = map.spawns;
    const grouping = MODES[mode].grouping;

    if (grouping === 'sides') {
      const half = Math.ceil(spawns.length / 2);
      return spawns[Math.min(spawns.length - 1, (team === 0 ? 0 : half) + Math.floor(idx / 2))];
    }

    if (grouping === 'pairs') {
      const base = spawns[team % spawns.length];
      const partner = idx % 2;
      // Beside it, toward the middle of the map, where the ground is open.
      const towardCentre = base.x < MAP_WIDTH / 2 ? 1 : -1;
      return { x: base.x + partner * towardCentre * PARTNER_OFFSET, y: base.y };
    }

    return spawns[idx % spawns.length];
  }

  /**
   * Stores a player's latest input.
   *
   * `seq`, when given, is the client's own numbering of it. The engine records
   * it on the brawler together with how long ago it arrived, because that is
   * exactly what a predicting client needs: "your inputs up to this one are in
   * the position you were sent, and this one has been in effect for this long".
   */
  public setPlayerInput(playerId: string, input: BrawlPlayerInput, seq?: number) {
    this.playerInputs[playerId] = input;
    if (seq === undefined) return;
    const b = this.brawlers.find(x => x.id === playerId);
    if (!b) return;
    b.inputAck = seq;
    this.inputAckAt[playerId] = this.simClock;
    b.inputAckAge = 0;
  }

  /**
   * Hands a player's brawler to a bot, for somebody who left mid-round.
   *
   * Before this, a player who disconnected left their body standing where it
   * was for the rest of the match — an undefeatable target that never shot
   * back, and one the round could not end around. A bot keeps the fight a
   * fight, and keeps the roster the size everybody else was told it was.
   */
  public convertToBot(playerId: string): boolean {
    const b = this.brawlers.find(x => x.id === playerId && !x.isClone);
    if (!b || b.isBot) return false;
    b.isBot = true;
    this.botControllers[playerId] = new BrawlBot();
    delete this.playerInputs[playerId];
    return true;
  }

  public update(dt: number) {
    this.simClock += dt;
    this.refreshInputAges();

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
    this.updateZone(dt);
    this.updateBall(dt);
    this.updatePoisonGas(dt);
    this.updatePickups();
    this.updateFloatingNumbers(dt);
    this.checkGameModeRules(dt);
  }

  /** Keeps each brawler's "how long ago did your last input arrive" current. */
  private refreshInputAges() {
    for (const id in this.inputAckAt) {
      const b = this.brawlers.find(x => x.id === id);
      if (b) b.inputAckAge = Math.round((this.simClock - this.inputAckAt[id]) * 1000);
    }
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
          if (this.mode === 'duo_showdown') {
            const partner = this.brawlers.find(o => o.team === b.team && o.id !== b.id && o.isAlive && !o.isClone);
            if (!partner) {
              // The one they were waiting on is gone: this was the last of them.
              b.respawnTimer = 0;
              if (this.eliminationOrder.indexOf(b.id) === -1) this.eliminationOrder.push(b.id);
              continue;
            }
            // They come back beside whoever is left, not at the start.
            b.spawnX = partner.x + 52;
            b.spawnY = partner.y;
          }
          b.respawnTimer -= dt;
          if (b.respawnTimer <= 0) {
            const rules = MODES[this.mode];
            respawnBrawler(b, {
              immunity: this.mode === 'duo_showdown' ? DUO_RESPAWN_IMMUNITY : rules.respawnImmunity,
              superRetention: rules.superRetention,
            });
            this.emitSound('respawn', b.x, b.y);
            this.addEffect('smoke_poof', b.x, b.y, 56, '#38bdf8', 0.45);
            this.addFloatingNumber('GERİ DÖNDÜ', b.x, b.y - 30, '#38bdf8');
          }
        }
        continue;
      }

      const cfg = BRAWLERS[b.brawlerId];
      const kit = getKit(b.brawlerId, b.starPower);

      // Remember where the body was so the renderer can interpolate between
      // simulation ticks instead of snapping once every 1/60 s.
      b.prevX = b.x;
      b.prevY = b.y;

      // Ammo refills one whole slot at a time. The old fractional counter let
      // you fire the instant the bar ticked over, so the ammo display never
      // matched what the brawler could actually do.
      const mods = conditionalMods(b, kit);
      if (mods.healPerSec > 0 && b.hp < b.maxHp) {
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * mods.healPerSec * dt);
      }
      // A channelled Super keeps both hands busy: nothing reloads under it.
      if (b.ammo < b.maxAmmo && !b.pendingBurst?.channel) {
        b.reloadTimer += dt * mods.reload;
        while (b.reloadTimer >= cfg.reloadTime && b.ammo < b.maxAmmo) {
          b.reloadTimer -= cfg.reloadTime;
          b.ammo += 1;
        }
        if (b.ammo >= b.maxAmmo) b.reloadTimer = 0;
      } else {
        b.reloadTimer = 0;
      }

      if (b.attackCooldown > 0) b.attackCooldown -= dt;

      // A patient attack builds up while nothing is being fired.
      const chargeTrait = kit.traits?.charge;
      if (chargeTrait && b.ammo >= 1 && !b.pendingBurst) {
        b.charge = Math.min(1, b.charge + dt / chargeTrait.time);
      }

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
          // A clone that has a touch hurts what it reaches, once a second.
          if (b.touchDamage) {
            b.decoyTouchTimer = (b.decoyTouchTimer ?? 0) - dt;
            if (b.decoyTouchTimer <= 0 && dist(b.x, b.y, enemy.x, enemy.y) <= 56) {
              this.damageBrawler(enemy, b.touchDamage, b.decoyOwnerId ?? b.id);
              b.decoyTouchTimer = 1;
            }
          }
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

      // A run in progress moves the body on its own; nothing else does.
      if (b.rush) {
        this.stepRush(b, dt);
        if (b.rush) continue;
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

      // A channelled Super is cancelled by being stunned or thrown about.
      if (
        b.pendingBurst?.channel &&
        (b.stunTimer > 0 || Math.hypot(b.knockbackVx, b.knockbackVy) > 260)
      ) {
        b.pendingBurst = null;
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
          this.navGrid,
          // Hot Zone gives bots a place to be.
          this.zone ? { x: this.zone.x, y: this.zone.y } : undefined,
          this.ball ? { ball: this.ball, goals: this.goals } : undefined,
          this.strikeFor(b)
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

      // The same code the client runs to predict its own movement; see
      // `sim/movement.ts`. Anything changed there changes both.
      integrateMovement(
        b,
        input.moveX,
        input.moveY,
        maxSpeedFor(
          cfg.speed,
          (kit.traits?.speedMultiplier ?? 1) * mods.speed,
          b.slowTimer,
          b.speedBoostTimer,
          b.speedBoostMagnitude,
          b.slowAmount
        ),
        cfg.acceleration,
        b.rootTimer > 0,
        dt,
        horizontal => this.resolveAgainstGeometry(b, BRAWLER_RADIUS, horizontal)
      );
      if (Math.abs(b.vx) > 1 || Math.abs(b.vy) > 1) {
        b.angle = Math.atan2(b.vy, b.vx);
      }

      // Brawler vs Brawler soft push
      for (const other of this.brawlers) {
        if (other.id === b.id || !other.isAlive || other.isJumping) continue;
        // A body mid-dash goes through others rather than shoving them.
        if (b.phaseTimer > 0 || other.phaseTimer > 0) continue;
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
        // Only for the person whose Super it is, and never for a bot's.
        if (!b.isBot) this.emitSound('super_ready', b.x, b.y, b.id);
      }
      this.prevSuperReadyState[b.id] = isSuperReady;

      // Gadget, Super, attack. Three `switch (b.brawlerId)` blocks with
      // eighteen branches between them used to live below this point; all of
      // it is kit data now, run by one interpreter that never learns a
      // character's name.
      // Whoever has the ball has their hands full: no gadget, no Super.
      const carryingBall = this.ball !== null && this.ball.carrier === b.id;
      const gadget = gadgetOf(kit, b.gadgetIndex);
      if (input.gadget && !carryingBall && gadget && b.gadgetCooldown <= 0 && this.gadgetRequirementMet(b, gadget)) {
        // A gadget that loads a special shot starts its cooldown only when the
        // shot has been fired; until then the button stays down.
        b.gadgetCooldown = gadget.cooldownAfterUse ? 9999 : gadget.cooldown;
        b.gadgetPending = gadget.cooldownAfterUse === true;
        this.emitSound('gadget_activate', b.x, b.y);
        runActions(this.contextFor(b, input, false), gadget.actions);
      }

      if (input.superAttack && !carryingBall && b.superCharge >= 100 && b.silenceTimer <= 0) {
        b.superCharge = 0;
        b.timeSinceLastAttack = 0;
        if (b.invisibilityTimer > 0) b.invisibilityTimer = 0; // Attacking breaks stealth
        executeAbility(this.contextFor(b, input, true), kit.super);
      } else if (input.attack && this.ball && this.ball.carrier === b.id) {
        // Whoever has the ball does not shoot with it; the attack is a kick.
        this.kickBall(b, input.aimAngle);
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
        // Whatever the kit does to vary an attack: how charged it is, and
        // which hit of a combo this is.
        const charge = kit.traits?.charge;
        const scale = charge ? charge.minScale + (charge.maxScale - charge.minScale) * b.charge : 1;
        const wasFull = b.charge >= 1;
        b.charge = 0;
        let spec = kit.attack;
        if (kit.combo) {
          if (b.comboTimer <= 0) b.comboIndex = 0;
          spec = kit.combo[b.comboIndex % kit.combo.length];
          b.comboIndex++;
          b.comboTimer = kit.comboWindow ?? 1;
        }
        let attackActions = spec.actions;
        if (b.empowerUses > 0 && b.empowerKey) {
          // A gadget has loaded something special in place of this attack.
          attackActions = getActions(b.empowerKey) ?? attackActions;
          b.empowerUses--;
          if (b.empowerUses <= 0) {
            b.empowerKey = undefined;
            if (b.gadgetPending) {
              b.gadgetPending = false;
              const g = gadgetOf(kit, b.gadgetIndex);
              b.gadgetCooldown = g ? g.cooldown : 0;
            }
          }
        }
        runActions(this.contextFor(b, input, false, scale, wasFull), attackActions);
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
    this.emitSound('explosion', x, y);

    for (const b of this.brawlers) {
      if (!b.isAlive || b.isJumping) continue;
      if (b.id === ownerId || b.id === params.excludeId) continue;
      if (!this.isHostile(team, b)) continue;

      if (dist(x, y, b.x, b.y) <= radius + BRAWLER_RADIUS) {
        this.damageBrawler(b, damage, ownerId);
        if (params.charge !== undefined) {
          const owner = this.brawlers.find(o => o.id === ownerId);
          if (owner) chargeSuperFlat(owner, params.charge);
        }
        if (params.burn) {
          applyStatus(b, {
            kind: 'burn',
            duration: params.burn.duration,
            magnitude: params.burn.damagePerSec,
          });
        }
        if (params.knockback) applyKnockback(b, x, y, params.knockback, 0.35);
        if (params.push) applyKnockback(b, x, y, params.push * 7, 0);
        if (params.slowThenStun) {
          const s = params.slowThenStun;
          if (b.slowTimer > 0) applyStatus(b, { kind: 'stun', duration: s.duration });
          else applyStatus(b, { kind: 'slow', duration: s.duration, magnitude: s.amount });
        }
      }
    }

    for (const safe of this.safes) {
      if (safe.team === team || safe.hp <= 0) continue;
      if (dist(x, y, safe.x + safe.w / 2, safe.y + safe.h / 2) <= radius + Math.max(safe.w, safe.h) / 2) {
        this.damageSafe(safe, damage, ownerId);
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

      // A wave widens as it goes.
      if (p.growth) p.radius = (p.baseRadius ?? p.radius) + p.growth * p.traveled;

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
      let hitKind: 'none' | 'wall' | 'box' | 'safe' | 'brawler' | 'deployable' = 'none';
      let hitSafeIndex = -1;
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

      for (let i = 0; i < this.safes.length && !airborne; i++) {
        sweepCircleVsRect(p.x, p.y, p.radius, stepX, stepY, this.safes[i], this.sweep);
        if (this.sweep.hit && this.sweep.t < bestT) {
          bestT = this.sweep.t;
          hitKind = 'safe';
          hitSafeIndex = i;
          hitX = this.sweep.x;
          hitY = this.sweep.y;
        }
      }

      for (const target of this.brawlers) {
        if (airborne) break;
        if (!target.isAlive || target.isJumping || target.id === p.ownerId) continue;
        if (target.team === p.team) {
          // A team-mate matters only to a shot that heals, and only once.
          if (p.allyHeal === undefined || target.isClone) continue;
          if (p.hitIds && p.hitIds.indexOf(target.id) !== -1) continue;
        } else {
          if (!this.isHostile(p.team, target)) continue;
          if (p.onlyAllies) continue;
        }
        // Respawn protection should stop the shot, not eat it silently.
        if (target.immunityTimer > 0 && target.team !== p.team) continue;
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
        const mine = d.ownerId === p.ownerId;
        const healable = mine && p.turretHeal !== undefined && d.kind === 'turret';
        const bounceable = mine && d.kind === 'vending' && p.motion === 'bounce' && (p.bouncesLeft ?? 0) > 0;
        // A built wall stops everybody's shots; the rest only deal with enemies.
        if (d.behaviour !== 'solid' && !healable && !bounceable && !this.isHostileTeam(p.team, d.team)) continue;
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
          if (p.bounceRange) p.maxRange += p.bounceRange;
          if (p.bounceBonus) {
            p.damage += p.bounceBonus;
            p.bounceBonus = undefined;
          }
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

      if (hitKind === 'safe') {
        const safe = this.safes[hitSafeIndex];
        // Your own safe stops your shots without taking them.
        if (safe && safe.team !== p.team) this.damageSafe(safe, p.damage, p.ownerId);
        this.detonateProjectile(p, hitX, hitY, 'end');
        if (!p.piercesBodies) {
          toRemove.add(p.id);
        } else {
          p.x += stepX * (1 - bestT);
          p.y += stepY * (1 - bestT);
        }
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

      if (hitKind === 'deployable' && hitDeployable && hitDeployable.ownerId === p.ownerId && p.turretHeal !== undefined && hitDeployable.kind === 'turret') {
        const d = hitDeployable;
        d.hp = Math.min(d.maxHp, d.hp + p.turretHeal);
        this.addFloatingNumber('+' + p.turretHeal, d.x, d.y - 18, '#4ade80');
        // It still goes on to the next enemy, as it would have.
        p.x += stepX * (1 - bestT);
        p.y += stepY * (1 - bestT);
        (p.hitIds ||= []).push(d.id);
        continue;
      }

      if (hitKind === 'deployable' && hitDeployable && hitDeployable.kind === 'vending' && hitDeployable.ownerId === p.ownerId && p.motion === 'bounce' && (p.bouncesLeft ?? 0) > 0) {
        // Its owner's shot glances off the machine like it would off a wall.
        const d = hitDeployable;
        const nx0 = hitX - d.x;
        const ny0 = hitY - d.y;
        const len = Math.hypot(nx0, ny0) || 1;
        const nx = nx0 / len;
        const ny = ny0 / len;
        const vdotn = p.vx * nx + p.vy * ny;
        p.vx -= 2 * vdotn * nx;
        p.vy -= 2 * vdotn * ny;
        p.bouncesLeft = (p.bouncesLeft ?? 0) - 1;
        if (p.bounceRange) p.maxRange += p.bounceRange;
        if (p.bounceBonus) {
          p.damage += p.bounceBonus;
          p.bounceBonus = undefined;
        }
        p.x += nx * 1;
        p.y += ny * 1;
        continue;
      }

      if (hitKind === 'deployable' && hitDeployable) {
        const d = hitDeployable;
        // A barrier soaks the shot without taking damage — that is what makes
        // it cover rather than a target.
        if (d.behaviour !== 'blocker' && this.isHostileTeam(p.team, d.team)) {
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

      if (hitKind === 'brawler' && hitTarget && hitTarget.team === p.team) {
        // The shot found a friend: it heals them and, if it can, goes on.
        const before = hitTarget.hp;
        hitTarget.hp = Math.min(hitTarget.maxHp, hitTarget.hp + (p.allyHeal ?? 0));
        if (hitTarget.hp > before) this.addFloatingNumber('+' + Math.round(hitTarget.hp - before), hitTarget.x, hitTarget.y - 26, '#4ade80');
        const healer = this.brawlers.find(o => o.id === p.ownerId);
        if (healer && p.charge !== undefined) chargeSuperFlat(healer, p.charge);
        (p.hitIds ||= []).push(hitTarget.id);
        if (!p.piercesBodies) toRemove.add(p.id);
        else {
          p.x += stepX * (1 - bestT);
          p.y += stepY * (1 - bestT);
        }
        continue;
      }

      if (hitKind === 'brawler' && hitTarget && hitTarget.absorbTimer > 0) {
        // Destroyed on the shield, harmlessly.
        this.addEffect('hit_spark', hitX, hitY, 20, '#e2e8f0', 0.18, Math.atan2(p.vy, p.vx), 0.5);
        toRemove.add(p.id);
        continue;
      }

      if (hitKind === 'brawler' && hitTarget && hitTarget.reflectTimer > 0) {
        // Sent back where it came from, as the reflector's own.
        p.vx = -p.vx;
        p.vy = -p.vy;
        p.ownerId = hitTarget.id;
        p.team = hitTarget.team;
        p.traveled = 0;
        p.hitIds = [];
        // Sent back a little weaker, or standing in a reflection beats any fight.
        p.damage = Math.round(p.damage * REFLECT_DAMAGE_KEPT);
        this.addEffect('hit_spark', hitX, hitY, 24, '#e0f2fe', 0.2, Math.atan2(p.vy, p.vx), 0.7);
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
        if (p.pushback) {
          // A shove measured in distance, not a stun: it carries a body that far.
          const speedP = Math.hypot(p.vx, p.vy) || 1;
          hitTarget.knockbackVx += (p.vx / speedP) * p.pushback * 7;
          hitTarget.knockbackVy += (p.vy / speedP) * p.pushback * 7;
        } else if (!p.knockbackForce) {
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
        if (owner) {
          if (p.charge !== undefined) {
            // The kit says exactly how much a hit is worth — less, where the
            // damage itself falls off with distance.
            chargeSuperFlat(owner, p.charge * this.falloffShare(p));
          } else if (!p.isSuper) {
            // Not yet stated: the old rule, a share of the damage dealt.
            chargeSuperForDamage(owner, effectiveDmg);
          }
        }

        this.detonateProjectile(p, hitX, hitY, 'hit', hitTarget.id);

        if ((p.chainLeft ?? 0) > 0) {
          (p.hitIds ||= []).push(hitTarget.id);
          let next: BrawlerEntity | null = null;
          let nextDist = p.chainRange ?? 0;
          for (const cand of this.brawlers) {
            if (!cand.isAlive || cand.isJumping || cand.isClone || cand.id === p.ownerId) continue;
            if (!this.isHostile(p.team, cand) || p.hitIds.indexOf(cand.id) !== -1) continue;
            const dd = dist(hitTarget.x, hitTarget.y, cand.x, cand.y);
            if (dd < nextDist) {
              nextDist = dd;
              next = cand;
            }
          }
          if (next) {
            // Off again toward the next one, weaker and slower.
            const ang = Math.atan2(next.y - hitTarget.y, next.x - hitTarget.x);
            const sp = p.chainSpeed ?? Math.hypot(p.vx, p.vy);
            p.x = hitTarget.x;
            p.y = hitTarget.y;
            p.vx = Math.cos(ang) * sp;
            p.vy = Math.sin(ang) * sp;
            p.damage = Math.round(p.damage * (p.chainFalloff ?? 0.75));
            p.maxRange = p.chainReach ?? p.maxRange;
            p.traveled = 0;
            p.chainLeft = (p.chainLeft ?? 1) - 1;
            continue;
          }
          toRemove.add(p.id);
          continue;
        }

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
      damageMultiplier: owner ? damageFactor(owner) : 1,
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
  /** The damage multiplier a shot has reached by how far it has flown. */
  private falloffMult(p: BrawlProjectile): number {
    if (!p.falloff) return 1;
    const f = p.falloff;
    // Full strength to `hold`, then a straight line to the far end.
    const t = clamp((p.traveled / f.range - f.hold) / Math.max(0.0001, 1 - f.hold), 0, 1);
    return f.near + (f.far - f.near) * t;
  }

  /** How much of its best value a shot is worth now, for what scales with damage. */
  private falloffShare(p: BrawlProjectile): number {
    if (!p.falloff) return 1;
    return this.falloffMult(p) / Math.max(p.falloff.near, p.falloff.far);
  }

  private applyDamageFalloff(p: BrawlProjectile, damage: number): number {
    if (!p.falloff || p.isSuper) return damage;
    return Math.round(damage * this.falloffMult(p));
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
      if (wall) pushOutOfRect(b, radius, wall, horizontal);
    }
    for (const box of this.boxes) pushOutOfRect(b, radius, box, horizontal);
    for (const safe of this.safes) pushOutOfRect(b, radius, safe, horizontal);
    for (const d of this.deployables) {
      if (d.behaviour !== 'solid' && d.behaviour !== 'cover') continue;
      const r = this.wallScratch;
      r.x = d.x - d.radius;
      r.y = d.y - d.radius;
      r.w = d.radius * 2;
      r.h = d.radius * 2;
      pushOutOfRect(b, radius, r, horizontal);
    }
  }

  private wallScratch = { x: 0, y: 0, w: 0, h: 0 };

  /**
   * Rebuilds the bot navigation grid when the level changes shape. Walls
   * and boxes are both destructible, so a route that was blocked a second
   * ago may now be open.
   */
  private ensureNavGrid() {
    if (this.walls.length === this.navWallCount && this.boxes.length === this.navBoxCount) {
      return;
    }
    this.navGrid.rebuild([this.walls, this.boxes, this.safes], BRAWLER_RADIUS);
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
          if (tf.slowAmount !== undefined) {
            applyStatus(b, { kind: 'slow', duration: 1.05, magnitude: tf.slowAmount });
          } else {
            b.slowTimer = Math.max(b.slowTimer, 0.5);
          }
          const dealt = Math.round(tf.damagePerSec * dt);
          this.damageBrawler(b, dealt, tf.ownerId, false);
          this.healOwner(tf.ownerId, dealt * (tf.lifesteal ?? 0));
        }
      }
      this.healSide(tf.team, tf.x, tf.y, tf.radius, (tf.healPerSec ?? 0) * dt);

      if (tf.duration <= 0) {
        this.thornFields.splice(i, 1);
      }
    }
  }

  /** Health given back to a brawler, without a floating number every tick. */
  private healOwner(id: string, amount: number) {
    if (amount <= 0) return;
    const o = this.brawlers.find(b => b.id === id && b.isAlive);
    if (o) o.hp = Math.min(o.maxHp, o.hp + amount);
  }

  /** Health given to everyone on a side who is standing in a circle. */
  private healSide(team: number, x: number, y: number, radius: number, amount: number) {
    if (amount <= 0) return;
    for (const b of this.brawlers) {
      if (!b.isAlive || b.isClone || b.team !== team) continue;
      if (dist(x, y, b.x, b.y) <= radius) b.hp = Math.min(b.maxHp, b.hp + amount);
    }
  }

  private updateFirePatches(dt: number) {
    // Who has already been hurt this tick by ground that does not add up.
    const struck = new Set<string>();
    for (let i = this.firePatches.length - 1; i >= 0; i--) {
      const fp = this.firePatches[i];
      fp.duration -= dt;

      // Ground that cleans: the other side's ill effects wash off its owner's side.
      if (fp.cleanse) {
        for (const ally of this.brawlers) {
          if (!ally.isAlive || ally.team !== fp.team || dist(fp.x, fp.y, ally.x, ally.y) > fp.radius) continue;
          ally.stunTimer = 0;
          ally.slowTimer = 0;
          ally.slowAmount = 0;
          ally.burnTimer = 0;
          ally.rootTimer = 0;
          ally.silenceTimer = 0;
        }
      }

      // Damage enemies standing in fire
      for (const b of this.brawlers) {
        if (!b.isAlive || b.isJumping) continue;
        if (b.id === fp.ownerId) continue;
        if (!this.isHostile(fp.team, b)) continue;

        if (dist(fp.x, fp.y, b.x, b.y) <= fp.radius + 18) {
          if (fp.noStack) {
            const key = fp.ownerId + ':' + b.id;
            if (struck.has(key)) continue;
            struck.add(key);
          }
          const dealt = Math.round(fp.damagePerSec * dt);
          this.damageBrawler(b, dealt, fp.ownerId, false);
          this.healOwner(fp.ownerId, dealt * (fp.lifesteal ?? 0));
          if (fp.slowAmount !== undefined) {
            applyStatus(b, { kind: 'slow', duration: 0.6, magnitude: fp.slowAmount });
          }
        }
      }
      this.healSide(fp.team, fp.x, fp.y, fp.radius, (fp.healPerSec ?? 0) * dt);

      for (const safe of this.safes) {
        if (safe.team === fp.team || safe.hp <= 0) continue;
        if (dist(fp.x, fp.y, safe.x + safe.w / 2, safe.y + safe.h / 2) <= fp.radius + Math.max(safe.w, safe.h) / 2) {
          this.damageSafe(safe, Math.round(fp.damagePerSec * dt), fp.ownerId, false);
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

    // A clone is flimsy by design: whatever hits it counts double.
    if (b.isClone) damage *= 2;

    // Standing guard and conditional toughness cut what gets through.
    if (b.guardTimer > 0) damage *= 1 - b.guardAmount;
    damage *= conditionalMods(b, getKit(b.brawlerId, b.starPower)).taken;

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
    this.emitSound('hit', b.x, b.y);

    // Where it came from, for the edge-of-screen marker. Gas and burning have
    // no direction, and an angle of zero already means "from the east", so
    // they get a value no real angle can take.
    const source = this.brawlers.find(s => s.id === killerId);
    b.lastDamageAngle =
      source && source.id !== b.id ? Math.atan2(source.y - b.y, source.x - b.x) : NO_DAMAGE_DIRECTION;

    // A tank's Super filling from damage taken is what makes its engage
    // inevitable rather than optional. It is a kit trait, not a name check.
    const traits = getKit(b.brawlerId, b.starPower).traits;
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
      this.emitSound('death', b.x, b.y);
      this.scoreKill(b, source);
      // The satisfaction of a kill is the killer's alone, and a bot does not
      // need telling.
      if (source && !source.isBot && source.id !== b.id) {
        this.emitSound('kill', undefined, undefined, source.id);
      }

      if (source) source.kills++;
      if (source && !source.isClone && source.id !== b.id && !b.isClone) this.runKillPassives(source);
      const killer = source;

      const rules = MODES[this.mode];
      // Duo Showdown: a fallen partner comes back if the other one is still
      // standing when the wait is over.
      const partnerStanding =
        this.mode === 'duo_showdown' &&
        !b.isClone &&
        this.brawlers.some(o => o.team === b.team && o.id !== b.id && o.isAlive && !o.isClone);
      b.respawnTimer = b.isClone ? 0 : partnerStanding ? DUO_RESPAWN_DELAY : rules.respawnDelay;

      if (!b.isClone) {
        // Placement is only meaningful where death is final; in a mode with
        // respawn, being downed is a setback, not an exit.
        if (rules.respawnDelay <= 0 && !partnerStanding) this.eliminationOrder.push(b.id);
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

      // Drop power cubes, where the mode has them
      if (MODES[this.mode].powerCubes) {
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
      this.emitSound('gem_pickup', this.gemMine.x, this.gemMine.y);
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
          this.emitSound('cube_pickup', b.x, b.y);
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
          this.emitSound('gem_pickup', b.x, b.y);
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

  /** A kill is a point to the side that made it, in the modes that count them. */
  private scoreKill(victim: BrawlerEntity, killer: BrawlerEntity | undefined) {
    if (victim.isClone) return;
    if (this.mode === 'bounty') {
      if (!killer || killer.team === victim.team) {
        victim.bounty = 1;
        return;
      }
      const pay = bountyPayout(victim.bounty, killer.bounty);
      this.teamScores[killer.team] = (this.teamScores[killer.team] ?? 0) + pay.stars;
      killer.bounty = pay.killer;
      victim.bounty = pay.victim;
      this.addFloatingNumber('+' + pay.stars + ' ★', victim.x, victim.y - 34, '#facc15');
      return;
    }
    if (this.mode !== 'wipeout') return;
    if (!killer || killer.team === victim.team) return;
    this.teamScores[killer.team] = (this.teamScores[killer.team] ?? 0) + 1;
  }

  /** Hot Zone: whoever holds the zone alone is scoring from it. */
  private updateZone(dt: number) {
    const zone = this.zone;
    if (!zone || this.phase !== 'playing') return;

    const inside = new Array(this.teamScores.length).fill(0);
    for (const b of this.brawlers) {
      if (!b.isAlive || b.isClone || b.isJumping) continue;
      if (dist(b.x, b.y, zone.x, zone.y) <= zone.radius + BRAWLER_RADIUS * 0.5) {
        inside[b.team] = (inside[b.team] ?? 0) + 1;
      }
    }

    zone.controller = zoneController(inside);
    if (zone.controller !== null) {
      this.teamScores[zone.controller] += dt * ZONE_POINTS_PER_SECOND;
    }
  }

  /** Heist: damage to a safe, and a little Super for whoever did it. */
  private damageSafe(safe: Safe, amount: number, ownerId: string, showNumber = true) {
    if (this.phase !== 'playing' || amount <= 0) return;
    safe.hp = Math.max(0, safe.hp - amount);
    if (showNumber) this.addFloatingNumber('-' + Math.round(amount), safe.x + safe.w / 2, safe.y, '#fde047');
    const attacker = this.brawlers.find(b => b.id === ownerId);
    if (attacker) chargeSuperForDamage(attacker, amount * 0.5);
    if (safe.hp <= 0) {
      this.emitSound('explosion', safe.x + safe.w / 2, safe.y + safe.h / 2);
      this.addEffect('explosion', safe.x + safe.w / 2, safe.y + safe.h / 2, 150, '#fde047', 0.6);
    }
  }

  /**
   * Where a bot should be heading to break the enemy safe, and the safe itself
   * to shoot at. The standing point is on open ground in front of it, because
   * the safe is solid and cannot be walked to.
   */
  private strikeFor(b: BrawlerEntity): Strike | undefined {
    if (this.safes.length === 0) return undefined;
    const enemy = this.safes.find(s => s.team !== b.team && s.hp > 0);
    const own = this.safes.find(s => s.team === b.team && s.hp > 0);
    if (!enemy || !own) return undefined;

    // Every other member of a side goes on the attack; the rest stay home.
    const mates = this.brawlers.filter(m => m.team === b.team && !m.isClone);
    const role = mates.indexOf(b) % 2 === 0 ? 'attack' : 'defend';
    const front = (safe: Safe) => {
      const cx = safe.x + safe.w / 2;
      const towardMiddle = cx < MAP_WIDTH / 2 ? 1 : -1;
      return { x: cx + towardMiddle * (safe.w / 2 + 150), y: safe.y + safe.h / 2 };
    };
    return role === 'attack'
      ? { role, stand: front(enemy), target: { x: enemy.x + enemy.w / 2, y: enemy.y + enemy.h / 2 } }
      : { role, stand: front(own), target: { x: own.x + own.w / 2, y: own.y + own.h / 2 } };
  }

  /**
   * One tick of a rush: move at a steady speed, break or bounce off what is in
   * the way, strike whatever the body passes, and run the ending when it is over.
   */
  private stepRush(b: BrawlerEntity, dt: number) {
    const r = b.rush;
    if (!r) return;

    // A stun stops a run, unless the body is not really there.
    if (b.stunTimer > 0 && !r.ghost) {
      b.rush = undefined;
      return;
    }

    const step = Math.min(r.speed * dt, r.remaining);
    let nx = b.x + Math.cos(r.angle) * step;
    let ny = b.y + Math.sin(r.angle) * step;

    if (!r.ghost) {
      for (let i = this.walls.length - 1; i >= 0; i--) {
        const wall = this.walls[i];
        const col = circleRectCollision({ x: nx, y: ny, radius: BRAWLER_RADIUS }, wall);
        if (!col.collided) continue;
        if (wall.isDestructible && r.breaks) {
          this.walls.splice(i, 1);
          this.wallGridDirty = true;
          continue;
        }
        if (r.bounces > 0) {
          // Mirror the heading off the face that was struck, and be bodies-fresh again.
          const vdotn = Math.cos(r.angle) * col.nx + Math.sin(r.angle) * col.ny;
          const rx = Math.cos(r.angle) - 2 * vdotn * col.nx;
          const ry = Math.sin(r.angle) - 2 * vdotn * col.ny;
          r.angle = Math.atan2(ry, rx);
          r.bounces--;
          r.hit = [];
          nx = b.x + col.nx * col.depth;
          ny = b.y + col.ny * col.depth;
          break;
        }
        // Stopped: it is over, from wherever the body was.
        r.remaining = 0;
        nx = b.x;
        ny = b.y;
        break;
      }
    }

    b.x = nx;
    b.y = ny;
    r.remaining -= step;

    for (const other of this.brawlers) {
      if (other.id === b.id || !other.isAlive || other.isJumping || other.isClone) continue;
      if (!this.isHostile(b.team, other) || r.hit.indexOf(other.id) !== -1) continue;
      if (dist(b.x, b.y, other.x, other.y) > r.reach) continue;
      r.hit.push(other.id);
      if (r.damage > 0) this.damageBrawler(other, r.damage, b.id);
      if (r.push > 0) {
        other.knockbackVx += Math.cos(r.angle) * r.push * 7;
        other.knockbackVy += Math.sin(r.angle) * r.push * 7;
      }
      if (r.charge > 0) chargeSuperFlat(b, r.charge);
      this.addEffect('hit_spark', other.x, other.y, 26, '#e2e8f0', 0.2, r.angle, 0.7);
    }

    if (r.remaining <= 0.5) {
      const endKey = r.endKey;
      b.rush = undefined;
      b.vx = 0;
      b.vy = 0;
      if (endKey) {
        const actions = getActions(endKey);
        if (actions) runActions(makeContext(this.world, b, { aimAngle: r.angle }), actions);
      }
    }
  }

  /** What a character does each time it defeats somebody. */
  private runKillPassives(killer: BrawlerEntity) {
    const passives = getKit(killer.brawlerId, killer.starPower).passives;
    if (!passives) return;
    for (const passive of passives) {
      if (passive.trigger === 'onKill') runActions(makeContext(this.world, killer), passive.actions);
    }
  }

  /** Whether a gadget that needs one of the caster's own summons has one close enough. */
  private gadgetRequirementMet(b: BrawlerEntity, gadget: { requires?: { deployable: string; within: number } }): boolean {
    const need = gadget.requires;
    if (!need) return true;
    return this.deployables.some(
      d => d.ownerId === b.id && d.kind === need.deployable && dist(d.x, d.y, b.x, b.y) <= need.within
    );
  }

  /** Seconds of the match played so far, across any restarts. */
  private playClock(): number {
    // The countdown before a restart is not play: the clock waits for it.
    return this.playedBefore + (this.phase === 'playing' ? this.matchTimer : 0);
  }

  /** Brawl Ball: how the ball moves, who has it, and what happens when it goes in. */
  private updateBall(dt: number) {
    const ball = this.ball;
    if (!ball || this.phase !== 'playing') return;

    // A goal is celebrated with the ball sitting still, then everyone is
    // put back where they started.
    if (this.goalTimer !== null) {
      this.goalTimer -= dt;
      if (this.goalTimer <= 0) this.afterGoal();
      return;
    }

    for (const id in this.ballRetake) {
      this.ballRetake[id] -= dt;
      if (this.ballRetake[id] <= 0) delete this.ballRetake[id];
    }

    if (ball.carrier) {
      const c = this.brawlers.find(b => b.id === ball.carrier);
      const knocked = c ? Math.hypot(c.knockbackVx, c.knockbackVy) > BALL_DROP_KNOCKBACK : false;
      if (!c || !c.isAlive || c.stunTimer > 0 || c.isJumping || knocked) {
        this.dropBall(c);
      } else {
        // At the feet, a little ahead of where they are looking.
        const reach = BRAWLER_RADIUS + ball.radius * 0.4;
        let bx = c.x + Math.cos(c.aimAngle) * reach;
        let by = c.y + Math.sin(c.aimAngle) * reach;
        for (const wall of this.walls) {
          if (circleRectCollision({ x: bx, y: by, radius: ball.radius }, wall).collided) {
            bx = c.x;
            by = c.y;
            break;
          }
        }
        ball.x = bx;
        ball.y = by;
        ball.vx = 0;
        ball.vy = 0;
      }
    }

    if (!ball.carrier) {
      this.rollBall(ball, dt);
      this.tryPickUpBall(ball);
    }

    this.checkGoal(ball);
  }

  private rollBall(ball: BallState, dt: number) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    for (const wall of this.walls) {
      const col = circleRectCollision({ x: ball.x, y: ball.y, radius: ball.radius }, wall);
      if (!col.collided) continue;
      ball.x += col.nx * col.depth;
      ball.y += col.ny * col.depth;
      // Only the part of the speed that was driving into the wall is reflected.
      const into = ball.vx * col.nx + ball.vy * col.ny;
      if (into < 0) {
        ball.vx -= (1 + BALL_BOUNCE) * into * col.nx;
        ball.vy -= (1 + BALL_BOUNCE) * into * col.ny;
      }
    }

    const decay = Math.exp(-BALL_FRICTION * dt);
    ball.vx *= decay;
    ball.vy *= decay;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed < 8) {
      ball.vx = 0;
      ball.vy = 0;
    } else if (speed > BALL_MAX_SPEED) {
      ball.vx *= BALL_MAX_SPEED / speed;
      ball.vy *= BALL_MAX_SPEED / speed;
    }
  }

  private tryPickUpBall(ball: BallState) {
    let best: BrawlerEntity | null = null;
    let bestDist = Infinity;
    const reach = BRAWLER_RADIUS + ball.radius + 6;
    for (const b of this.brawlers) {
      if (!b.isAlive || b.isClone || b.isJumping || b.stunTimer > 0) continue;
      if (this.ballRetake[b.id] !== undefined) continue;
      const d = dist(b.x, b.y, ball.x, ball.y);
      if (d <= reach && d < bestDist) {
        best = b;
        bestDist = d;
      }
    }
    if (!best) return;
    ball.carrier = best.id;
    ball.vx = 0;
    ball.vy = 0;
    this.lastToucher = best.id;
  }

  /** The ball comes loose where its carrier was, and they cannot snatch it straight back. */
  private dropBall(carrier: BrawlerEntity | undefined) {
    const ball = this.ball;
    if (!ball) return;
    ball.carrier = null;
    if (carrier) {
      ball.x = carrier.x;
      ball.y = carrier.y;
      this.ballRetake[carrier.id] = BALL_RETAKE_DELAY * 1.5;
    }
    ball.vx = 0;
    ball.vy = 0;
  }

  private kickBall(kicker: BrawlerEntity, angle: number) {
    const ball = this.ball;
    if (!ball || ball.carrier !== kicker.id) return;
    ball.carrier = null;
    ball.x = kicker.x + Math.cos(angle) * (BRAWLER_RADIUS + ball.radius + 2);
    ball.y = kicker.y + Math.sin(angle) * (BRAWLER_RADIUS + ball.radius + 2);
    ball.vx = Math.cos(angle) * BALL_KICK_SPEED;
    ball.vy = Math.sin(angle) * BALL_KICK_SPEED;
    this.ballRetake[kicker.id] = BALL_RETAKE_DELAY;
    this.lastToucher = kicker.id;
    kicker.attackCooldown = 0.3;
    kicker.timeSinceLastAttack = 0;
    if (kicker.invisibilityTimer > 0) kicker.invisibilityTimer = 0;
    this.emitSound('kick', ball.x, ball.y);
    this.addEffect('muzzle_flash', ball.x, ball.y, 20, '#fde047', 0.12, angle, 0.5);
  }

  private checkGoal(ball: BallState) {
    for (const g of this.goals) {
      if (ball.x < g.x || ball.x > g.x + g.w || ball.y < g.y || ball.y > g.y + g.h) continue;
      // The ball in a team's own goal is a point for the other side.
      const scorer = g.team === 0 ? 1 : 0;
      this.teamScores[scorer] = (this.teamScores[scorer] ?? 0) + 1;
      this.goalTeam = scorer;
      this.goalTimer = GOAL_CELEBRATION;
      ball.carrier = null;
      ball.vx = 0;
      ball.vy = 0;

      const toucher = this.brawlers.find(b => b.id === this.lastToucher);
      if (toucher && toucher.team === scorer) {
        this.goalsBy[toucher.id] = (this.goalsBy[toucher.id] ?? 0) + 1;
      }
      this.emitSound('goal');
      this.addEffect('shockwave', ball.x, ball.y, 110, scorer === 0 ? '#38bdf8' : '#f87171', 0.6);
      this.addFloatingNumber('GOL!', ball.x, ball.y - 30, '#fde047');
      return;
    }
  }

  /** The celebration is over: the match ends, or everyone goes back to their end. */
  private afterGoal() {
    const def = MODES[this.mode];
    const players = this.brawlers.filter(b => !b.isClone);
    const overtime = this.playClock() >= (def.timeLimit ?? Infinity);
    // In sudden death the next goal settles it, whatever the score limit.
    const standing = decideByScore(this.teamScores, overtime ? undefined : def.scoreLimit, overtime);
    this.goalTimer = null;
    this.goalTeam = null;

    if (standing.winner !== null) {
      this.finishMatch(standing.winner, players.filter(b => b.team === standing.winner));
      return;
    }

    this.playedBefore += this.matchTimer;
    this.matchTimer = 0;
    this.projectiles = [];
    this.deployables = [];
    this.thornFields = [];
    this.firePatches = [];
    this.floatingNumbers = [];
    this.brawlers = this.brawlers.filter(b => !b.isClone);
    for (const b of this.brawlers) {
      respawnBrawler(b, { immunity: 0, superRetention: 0.5 });
    }
    if (this.ball && this.ballSpawn) {
      this.ball.x = this.ballSpawn.x;
      this.ball.y = this.ballSpawn.y;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.carrier = null;
    }
    this.lastToucher = null;
    this.ballRetake = {};
    this.phase = 'starting';
  }

  /** Brawl Ball: time running out decides it, unless it is level — then it is sudden death. */
  private checkBallTime(players: BrawlerEntity[]) {
    const def = MODES[this.mode];
    if (this.goalTimer !== null) return;
    const clock = this.playClock();
    if (clock < (def.timeLimit ?? Infinity)) return;

    const standing = decideByScore(this.teamScores, undefined, true);
    if (standing.winner === null && !this.suddenDeath) {
      // Level at the whistle: the field is cleared, so there is nowhere to hide.
      this.suddenDeath = true;
      this.walls = [];
      this.bushes = [];
      this.wallGridDirty = true;
      this.addFloatingNumber('ALTIN GOL!', this.ball ? this.ball.x : 1200, this.ball ? this.ball.y - 40 : 900, '#fde047');
    }
    if (standing.winner !== null) {
      this.finishMatch(standing.winner, players.filter(b => b.team === standing.winner));
    } else if (clock >= (def.timeLimit ?? 0) + OVERTIME_LIMIT) {
      this.finishMatch(null, players);
    }
  }

  /** Ends the match, and picks who gets the credit for it. */
  private finishMatch(winnerTeam: number | null, starPool: BrawlerEntity[]) {
    this.phase = 'match_end';
    this.winnerTeam = winnerTeam;

    const pool = starPool.filter(b => !b.isClone);
    const credit = (b: BrawlerEntity) => b.kills * 2 + b.gemsCarried + (this.goalsBy[b.id] ?? 0) * 4;
    pool.sort((a, b) => credit(b) - credit(a));
    this.starPlayerId = pool[0]?.id ?? null;
    this.emitSound('star_player');
  }

  private checkGameModeRules(dt: number) {
    const def = MODES[this.mode];
    const players = this.brawlers.filter(b => !b.isClone);

    switch (this.mode) {
      case 'showdown': {
        const alive = players.filter(b => b.isAlive);
        if (alive.length <= 1) {
          this.phase = 'match_end';
          if (alive.length === 1) {
            this.winnerPlayerId = alive[0].id;
            this.starPlayerId = alive[0].id;
          }
          this.emitSound('star_player');
        }
        return;
      }

      case 'duo_showdown': {
        // The round ends when one team is left, however many of it are.
        const alive = players.filter(b => b.isAlive);
        const teams = new Set(alive.map(b => b.team));
        if (teams.size <= 1) {
          const winner = teams.size === 1 ? [...teams][0] : null;
          const best = alive.slice().sort((a, b) => b.hp - a.hp)[0];
          this.winnerPlayerId = best ? best.id : null;
          this.finishMatch(winner, winner === null ? players : players.filter(b => b.team === winner));
          if (this.winnerPlayerId) this.starPlayerId = this.winnerPlayerId;
        }
        return;
      }

      case 'gem_grab':
        this.checkGemGrab(dt, players);
        return;

      case 'brawl_ball':
        this.checkBallTime(players);
        return;

      case 'heist': {
        const timeUp = def.timeLimit !== undefined && this.matchTimer >= def.timeLimit;
        const fractions = [0, 1].map(team => {
          const safe = this.safes.find(s => s.team === team);
          return safe ? Math.max(0, safe.hp) / safe.maxHp : 1;
        });
        const standing = decideHeist(fractions, timeUp);
        if (standing.winner !== null || standing.draw) {
          this.finishMatch(
            standing.winner,
            standing.winner === null ? players : players.filter(b => b.team === standing.winner)
          );
        }
        return;
      }

      case 'wipeout':
      case 'bounty':
      case 'hot_zone': {
        const timeUp = def.timeLimit !== undefined && this.playClock() >= def.timeLimit;
        const standing = decideByScore(this.teamScores, def.scoreLimit, timeUp);
        if (standing.winner !== null || standing.draw) {
          this.finishMatch(
            standing.winner,
            standing.winner === null ? players : players.filter(b => b.team === standing.winner)
          );
        }
        return;
      }

      case 'knockout':
        this.checkKnockout(dt, players);
        return;
    }
  }

  private checkGemGrab(dt: number, players: BrawlerEntity[]) {
    const teamGems: Record<number, number> = { 0: 0, 1: 0 };
    for (const b of players) teamGems[b.team] = (teamGems[b.team] || 0) + b.gemsCarried;

    const team0Gems = teamGems[0] || 0;
    const team1Gems = teamGems[1] || 0;

    let winningTeam: number | null = null;
    if (team0Gems >= 10 && team0Gems > team1Gems) winningTeam = 0;
    else if (team1Gems >= 10 && team1Gems > team0Gems) winningTeam = 1;

    if (winningTeam === null) {
      this.countdownTeam = null;
      this.countdownTimer = 15.0;
      return;
    }

    if (this.countdownTeam !== winningTeam) {
      this.countdownTeam = winningTeam;
      this.countdownTimer = 15.0; // 15s Countdown begins!
      this.emitSound('alarm');
      return;
    }

    this.countdownTimer -= dt;
    if (this.countdownTimer <= 0) {
      this.finishMatch(winningTeam, players.filter(b => b.team === winningTeam));
    }
  }

  /**
   * Knockout: rounds, with nobody coming back inside one.
   *
   * A decided round is not closed out the instant it is decided. The sim keeps
   * running for a moment so the last kill is seen, and then the next round is
   * set up from scratch — the map, the positions, everyone's health.
   */
  private checkKnockout(dt: number, players: BrawlerEntity[]) {
    const def = MODES.knockout;

    if (this.roundCloseTimer !== null) {
      this.roundCloseTimer -= dt;
      if (this.roundCloseTimer <= 0) this.closeRound(players);
      return;
    }

    const teamCount = this.roundWins.length;
    const alive = new Array(teamCount).fill(0);
    const hp = new Array(teamCount).fill(0);
    for (const b of players) {
      if (!b.isAlive) continue;
      alive[b.team]++;
      hp[b.team] += b.hp;
    }

    const timeUp = def.timeLimit !== undefined && this.matchTimer >= def.timeLimit;
    const standing = decideRound(alive, hp, timeUp);
    if (standing.winner === null && !standing.draw) return;

    this.roundResult = { winner: standing.winner };
    this.roundCloseTimer = ROUND_CLOSE_DELAY;
  }

  private closeRound(players: BrawlerEntity[]) {
    const def = MODES.knockout;
    const winner = this.roundResult ? this.roundResult.winner : null;
    this.roundCloseTimer = null;
    this.roundResult = null;

    if (winner !== null) this.roundWins[winner]++;

    const needed = def.roundsToWin ?? 2;
    const maxRounds = needed * 2 + 1;
    const best = Math.max(...this.roundWins);
    const leader = this.roundWins.indexOf(best);
    const leaders = this.roundWins.filter(w => w === best).length;

    if (winner !== null && this.roundWins[winner] >= needed) {
      this.finishMatch(winner, players.filter(b => b.team === winner));
      return;
    }
    // A match of nothing but drawn rounds cannot go on for ever.
    if (this.round >= maxRounds) {
      const won = leaders === 1 ? leader : null;
      this.finishMatch(won, won === null ? players : players.filter(b => b.team === won));
      return;
    }

    this.startNextRound();
  }

  private startNextRound() {
    this.round += 1;

    // A fresh level: nothing broken, nothing left in the air.
    this.loadMap(this.mode, this.matchSeed);
    this.projectiles = [];
    this.deployables = [];
    this.thornFields = [];
    this.firePatches = [];
    this.visualEffects = [];
    this.floatingNumbers = [];
    this.eliminationOrder = [];

    // Decoys do not survive a round; everyone else is back on their feet.
    this.brawlers = this.brawlers.filter(b => !b.isClone);
    for (const b of this.brawlers) {
      respawnBrawler(b, { immunity: 0, superRetention: 0.5 });
    }

    // The countdown again, which is also what freezes everybody in place.
    this.phase = 'starting';
    this.matchTimer = 0;
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
      teamScores: this.teamScores.map(v => Math.floor(v)),
      scoreLimit: MODES[this.mode].scoreLimit ?? null,
      timeLeft:
        MODES[this.mode].timeLimit !== undefined &&
        (this.phase === 'playing' || (this.phase === 'starting' && MODES[this.mode].usesBall))
          ? Math.max(0, (MODES[this.mode].timeLimit as number) - this.playClock())
          : null,
      round: this.round,
      roundWins: this.roundWins,
      roundsToWin: MODES[this.mode].roundsToWin ?? null,
      zone: this.zone,
      ball: this.ball,
      goals: this.goals,
      goalTeam: this.goalTimer !== null ? this.goalTeam : null,
      safes: this.safes,
    };
  }
}
