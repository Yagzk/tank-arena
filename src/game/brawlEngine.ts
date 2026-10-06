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
import { circleRectCollision, circleIntersect, dist } from './physics';
import { BrawlBot } from './brawlBot';

export interface BrawlSoundEvent {
  type:
    | 'shelly_attack'
    | 'colt_attack'
    | 'primo_punch'
    | 'primo_leap'
    | 'brock_rocket'
    | 'leon_shuriken'
    | 'super_ready'
    | 'super_blast'
    | 'gem_pickup'
    | 'cube_pickup'
    | 'star_player'
    | 'alarm';
}

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

  public playerInputs: Record<string, BrawlPlayerInput> = {};
  private botControllers: Record<string, BrawlBot> = {};

  public onSoundTriggered?: (event: BrawlSoundEvent) => void;

  private nextEntityId: number = 1;
  private prevSuperReadyState: Record<string, boolean> = {};

  constructor() {
    const map = generateBrawlMap('showdown');
    this.walls = map.walls;
    this.bushes = map.bushes;
    this.boxes = map.boxes;
  }

  public initMatch(players: PlayerInfo[], mode: BrawlGameMode = 'showdown') {
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

    this.poisonGas = {
      inset: 0,
      damageTimer: 0,
      isActive: mode === 'showdown',
    };

    // Initialize brawlers (up to 10 players)
    this.brawlers = players.map((p, idx) => {
      const cfg = BRAWLERS[p.brawler || 'shelly'];
      const spawn = map.spawns[idx % map.spawns.length];
      const team = mode === 'gem_grab' ? (idx % 2) : idx;

      if (p.isBot) {
        this.botControllers[p.id] = new BrawlBot();
      }

      return {
        id: p.id,
        name: p.name,
        brawlerId: p.brawler || 'shelly',
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
      };
    });
  }

  public setPlayerInput(playerId: string, input: BrawlPlayerInput) {
    this.playerInputs[playerId] = input;
  }

  public update(dt: number) {
    if (this.phase === 'starting') {
      this.matchTimer += dt;
      if (this.matchTimer >= 2.0) {
        this.phase = 'playing';
      }
      return;
    }

    if (this.phase === 'match_end') {
      this.updateFloatingNumbers(dt);
      this.updateVisualEffects(dt);
      return;
    }

    this.matchTimer += dt;

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

    for (const b of this.brawlers) {
      if (!b.isAlive) continue;

      const cfg = BRAWLERS[b.brawlerId];

      // Ammo Reload (1 ammo every cfg.reloadTime seconds)
      if (b.ammo < b.maxAmmo) {
        b.ammo = Math.min(b.maxAmmo, b.ammo + dt / cfg.reloadTime);
      }

      // Natural Health Regeneration (+13% HP/sec after 3s out of combat)
      b.timeSinceLastDamage += dt;
      b.timeSinceLastAttack += dt;
      if (b.timeSinceLastDamage >= 3.0 && b.timeSinceLastAttack >= 3.0) {
        if (b.hp < b.maxHp) {
          b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.13 * dt);
        }
      }

      // Timers: Stun, Slow, Speed Boost, Invisibility, Emote
      if (b.stunTimer > 0) b.stunTimer -= dt;
      if (b.slowTimer > 0) b.slowTimer -= dt;
      if (b.speedBoostTimer > 0) b.speedBoostTimer -= dt;
      if (b.invisibilityTimer > 0) b.invisibilityTimer -= dt;
      if (b.emoteTimer > 0) {
        b.emoteTimer -= dt;
        if (b.emoteTimer <= 0) b.activeEmote = null;
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

      // El Primo Jump Progression
      if (b.isJumping) {
        b.jumpProgress += dt * 1.55; // ~0.65s jump duration
        b.x = b.jumpStartX + (b.jumpTargetX - b.jumpStartX) * b.jumpProgress;
        b.y = b.jumpStartY + (b.jumpTargetY - b.jumpStartY) * b.jumpProgress;

        if (b.jumpProgress >= 1.0) {
          b.isJumping = false;
          b.x = b.jumpTargetX;
          b.y = b.jumpTargetY;
          this.triggerPrimoLanding(b);
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
          dt
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

      // Movement Calculations with Speed Modifiers
      let speed = cfg.speed;
      if (b.slowTimer > 0) speed *= 0.5; // Spike slow
      if (b.speedBoostTimer > 0) speed *= 1.25; // Leon assassin burst speed!

      if (input.moveX !== 0 || input.moveY !== 0) {
        const len = Math.hypot(input.moveX, input.moveY) || 1;
        const normX = input.moveX / len;
        const normY = input.moveY / len;

        b.vx = normX * speed;
        b.vy = normY * speed;
        b.x += normX * speed * dt;
        b.y += normY * speed * dt;
        b.angle = Math.atan2(normY, normX);
      } else {
        b.vx = 0;
        b.vy = 0;
      }

      // Wall Collisions
      for (const wall of this.walls) {
        const col = circleRectCollision({ x: b.x, y: b.y, radius: brawlerRadius }, wall);
        if (col.collided) {
          b.x += col.nx * col.depth;
          b.y += col.ny * col.depth;
        }
      }

      // Box Collisions
      for (const box of this.boxes) {
        const col = circleRectCollision({ x: b.x, y: b.y, radius: brawlerRadius }, box);
        if (col.collided) {
          b.x += col.nx * col.depth;
          b.y += col.ny * col.depth;
        }
      }

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

      // ATTACK & SUPER TRIGGERING
      if (input.superAttack && b.superCharge >= 100) {
        b.superCharge = 0;
        b.timeSinceLastAttack = 0;
        if (b.invisibilityTimer > 0) b.invisibilityTimer = 0; // Attacking cancels stealth
        this.executeSuper(b, input);
      } else if (input.attack && b.ammo >= 1 && b.burstRemaining <= 0) {
        b.ammo -= 1;
        b.timeSinceLastAttack = 0;
        if (b.invisibilityTimer > 0) b.invisibilityTimer = 0; // Attacking cancels stealth
        this.executeAttack(b, input);
      }
    }
  }

  // Basic Attacks Implementation (Authentic to Brawl Stars)
  private executeAttack(b: BrawlerEntity, input: BrawlPlayerInput) {
    const cfg = BRAWLERS[b.brawlerId];
    const dmgMultiplier = 1 + b.powerCubes * 0.1;

    switch (b.brawlerId) {
      case 'shelly': {
        // Shelly Buckshot: 5 spread pellets simultaneously! Devastating point blank
        this.onSoundTriggered?.({ type: 'shelly_attack' });
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

      case 'colt': {
        // Colt Six-Shooters: 6 high-speed bullets in rapid burst!
        this.onSoundTriggered?.({ type: 'colt_attack' });
        b.burstRemaining = 6;
        b.burstInterval = 0.065;
        b.burstTimer = 0; // Fire first bullet immediately
        b.burstIsSuper = false;
        b.burstAimAngle = input.aimAngle;
        b.burstShotIndex = 0;
        break;
      }

      case 'el_primo': {
        // El Primo Fists of Fury: 4 rapid alternating boxing punches!
        this.onSoundTriggered?.({ type: 'primo_punch' });
        b.burstRemaining = 4;
        b.burstInterval = 0.08;
        b.burstTimer = 0;
        b.burstIsSuper = false;
        b.burstAimAngle = input.aimAngle;
        b.burstShotIndex = 0;
        break;
      }

      case 'brock': {
        // Brock Rockin' Rocket: Single rocket with splash AoE and incendiary fire patch!
        this.onSoundTriggered?.({ type: 'brock_rocket' });
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

      case 'spike': {
        // Spike Needle Grenade: Explodes into 6 sharp needles at 60° increments!
        this.onSoundTriggered?.({ type: 'shelly_attack' });
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

      case 'leon': {
        // Leon Spinner Blades: 4 shurikens in a sweep! Assassin close-range burst
        this.onSoundTriggered?.({ type: 'leon_shuriken' });
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

    if (b.brawlerId === 'colt') {
      if (b.burstIsSuper) {
        // Colt Super: Bullet Storm (12 giant piercing bullets)
        const spread = (Math.random() - 0.5) * 0.05;
        const ang = b.aimAngle + spread;
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
        if (b.burstShotIndex % 3 === 0) this.onSoundTriggered?.({ type: 'colt_attack' });
      } else {
        // Colt Basic: Six-Shooters (6 rapid bullets)
        const spread = (Math.random() - 0.5) * 0.04;
        const ang = b.aimAngle + spread;
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
    } else if (b.brawlerId === 'el_primo') {
      // El Primo Fists of Fury (alternating left/right punches)
      const offset = (b.burstShotIndex % 2 === 0 ? 1 : -1) * 0.14;
      const ang = b.aimAngle + offset;
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
    } else if (b.brawlerId === 'leon') {
      // Leon Spinner Blades (sweeping arc from left to right)
      const offset = ((b.burstShotIndex / 3) - 0.5) * 0.28;
      const ang = b.aimAngle + offset;
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
    } else if (b.brawlerId === 'brock' && b.burstIsSuper) {
      // Brock Super: Rocket Rain (9 artillery rockets)
      const rx = b.burstTargetX + (Math.random() - 0.5) * 170;
      const ry = b.burstTargetY + (Math.random() - 0.5) * 170;
      this.triggerExplosionAt(rx, ry, b.id, b.team, Math.round(950 * dmgMultiplier), 85, true);
      this.onSoundTriggered?.({ type: 'brock_rocket' });
    }
  }

  // Super Attacks Implementation
  private executeSuper(b: BrawlerEntity, input: BrawlPlayerInput) {
    const dmgMultiplier = 1 + b.powerCubes * 0.1;

    switch (b.brawlerId) {
      case 'shelly': {
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

      case 'colt': {
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

      case 'el_primo': {
        // Flying Elbow Drop: Airborne leap over walls and landing earthquake shockwave!
        this.onSoundTriggered?.({ type: 'primo_leap' });
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

      case 'brock': {
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

      case 'spike': {
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

      case 'leon': {
        // Smoke Bomb: Smoke cloud puff, 6s Invisibility AND +25% Assassin Speed Boost!
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

        this.addFloatingNumber('GÖRÜNMEZ & HIZLI!', b.x, b.y - 30, '#06b6d4');
        break;
      }
    }
  }

  private triggerPrimoLanding(b: BrawlerEntity) {
    this.onSoundTriggered?.({ type: 'super_blast' });
    const blastRadius = 125;
    const dmg = Math.round(1300 * (1 + b.powerCubes * 0.1));

    // Spawn earthquake crater shockwave
    this.visualEffects.push({
      id: `fx-${this.nextEntityId++}`,
      type: 'primo_slam',
      x: b.x,
      y: b.y,
      radius: blastRadius,
      color: '#f59e0b',
      duration: 0.45,
      progress: 0,
    });

    this.triggerExplosionAt(b.x, b.y, b.id, b.team, dmg, blastRadius, false, 420);
  }

  private triggerExplosionAt(
    x: number,
    y: number,
    ownerId: string,
    team: number,
    damage: number,
    radius: number,
    spawnFire: boolean = false,
    knockbackForce: number = 0
  ) {
    // Damage and knockback enemies
    for (const b of this.brawlers) {
      if (!b.isAlive || b.isJumping) continue;
      if (b.team === team && this.mode === 'gem_grab') continue;

      const d = dist(x, y, b.x, b.y);
      if (d <= radius + 22) {
        this.damageBrawler(b, damage, ownerId);

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

  private updateProjectiles(dt: number) {
    const toRemove = new Set<string>();

    for (const p of this.projectiles) {
      const stepX = p.vx * dt;
      const stepY = p.vy * dt;
      p.x += stepX;
      p.y += stepY;
      p.traveled += Math.hypot(stepX, stepY);

      if (p.traveled >= p.maxRange) {
        toRemove.add(p.id);
        if (p.burstNeedlesOnEnd) {
          this.burstSpikeNeedles(p.x, p.y, p.ownerId, p.team, Math.round(p.damage * 0.6));
        }
        if (p.spawnFireOnEnd) {
          this.triggerExplosionAt(p.x, p.y, p.ownerId, p.team, p.damage, 65, true);
        }
        continue;
      }

      // Check walls
      let hitWall = false;
      for (let i = this.walls.length - 1; i >= 0; i--) {
        const wall = this.walls[i];
        const col = circleRectCollision({ x: p.x, y: p.y, radius: p.radius }, wall);
        if (col.collided) {
          if (p.breaksWalls && wall.isDestructible) {
            this.walls.splice(i, 1);
          } else if (!p.piercesWalls) {
            hitWall = true;
            toRemove.add(p.id);
            if (p.burstNeedlesOnEnd) {
              this.burstSpikeNeedles(p.x, p.y, p.ownerId, p.team, Math.round(p.damage * 0.6));
            }
            if (p.spawnFireOnEnd) {
              this.triggerExplosionAt(p.x, p.y, p.ownerId, p.team, p.damage, 65, true);
            }
            break;
          }
        }
      }
      if (hitWall) continue;

      // Check boxes
      let hitBox = false;
      for (let i = this.boxes.length - 1; i >= 0; i--) {
        const box = this.boxes[i];
        const col = circleRectCollision({ x: p.x, y: p.y, radius: p.radius }, box);
        if (col.collided) {
          box.hp -= p.damage;
          this.addFloatingNumber(`-${p.damage}`, box.x + box.w / 2, box.y, '#f59e0b');

          if (box.hp <= 0) {
            this.destroyBox(i);
          }

          if (p.burstNeedlesOnEnd) {
            this.burstSpikeNeedles(p.x, p.y, p.ownerId, p.team, Math.round(p.damage * 0.6));
          }
          if (p.spawnFireOnEnd) {
            this.triggerExplosionAt(p.x, p.y, p.ownerId, p.team, p.damage, 65, true);
          }

          if (!p.piercesWalls) {
            hitBox = true;
            toRemove.add(p.id);
            break;
          }
        }
      }
      if (hitBox && !p.piercesWalls) continue;

      // Check enemy brawlers
      for (const target of this.brawlers) {
        if (!target.isAlive || target.isJumping || target.id === p.ownerId) continue;
        if (this.mode === 'gem_grab' && target.team === p.team) continue;

        if (dist(p.x, p.y, target.x, target.y) <= p.radius + 22) {
          // Calculate Leon Damage Falloff (Close range assassin multiplier!)
          let effectiveDmg = p.damage;
          if (p.brawlerId === 'leon' && !p.isSuper) {
            if (p.traveled < 130) {
              effectiveDmg = Math.round(p.damage * 1.65); // High damage ambush
            } else if (p.traveled > 280) {
              effectiveDmg = Math.round(p.damage * 0.75); // Lower damage poke
            }
          }

          this.damageBrawler(target, effectiveDmg, p.ownerId);

          // Apply Knockback & Stun from Super Shell
          if (p.knockbackForce && p.knockbackForce > 0) {
            const ang = Math.atan2(target.y - p.y, target.x - p.x);
            target.knockbackVx += Math.cos(ang) * p.knockbackForce;
            target.knockbackVy += Math.sin(ang) * p.knockbackForce;
            target.stunTimer = Math.max(target.stunTimer, 0.35);
          }

          // Charge owner's Super gauge
          const owner = this.brawlers.find(o => o.id === p.ownerId);
          if (owner) {
            const cfg = BRAWLERS[owner.brawlerId];
            owner.superCharge = Math.min(100, owner.superCharge + cfg.superChargePerHit);
          }

          if (p.burstNeedlesOnEnd) {
            this.burstSpikeNeedles(p.x, p.y, p.ownerId, p.team, Math.round(p.damage * 0.6));
          }
          if (p.spawnFireOnEnd) {
            this.triggerExplosionAt(p.x, p.y, p.ownerId, p.team, p.damage, 65, true);
          }

          if (!p.piercesWalls) {
            toRemove.add(p.id);
            break;
          }
        }
      }
    }

    if (toRemove.size > 0) {
      this.projectiles = this.projectiles.filter(p => !toRemove.has(p.id));
    }
  }

  // Spike's 6 Needle Burst at 60-degree increments
  private burstSpikeNeedles(x: number, y: number, ownerId: string, team: number, damage: number) {
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3;
      this.projectiles.push({
        id: `proj-${this.nextEntityId++}`,
        ownerId,
        brawlerId: 'spike',
        team,
        x,
        y,
        vx: Math.cos(ang) * 460,
        vy: Math.sin(ang) * 460,
        radius: 4.5,
        damage,
        maxRange: 200,
        traveled: 0,
        isSuper: false,
        color: '#10b981',
        piercesWalls: false,
        breaksWalls: false,
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

    if (showFloating) {
      this.addFloatingNumber(`-${damage}`, b.x, b.y - 20, '#ef4444');
    }

    if (b.hp <= 0 && b.isAlive) {
      b.isAlive = false;
      b.hp = 0;

      const killer = this.brawlers.find(k => k.id === killerId);
      if (killer) killer.kills++;

      // Drop gems carried
      if (b.gemsCarried > 0) {
        for (let i = 0; i < b.gemsCarried; i++) {
          const ang = Math.random() * Math.PI * 2;
          const r = 20 + Math.random() * 45;
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
          const ang = Math.random() * Math.PI * 2;
          const r = 20 + Math.random() * 40;
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

      const ang = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 35;
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
        if (!b.isAlive || b.isJumping) continue;
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
        if (!b.isAlive || b.isJumping) continue;
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

    // Starts shrinking after 25s
    if (this.matchTimer >= 25.0) {
      if (this.poisonGas.inset < 900) {
        this.poisonGas.inset += dt * 25; // 25 px/sec
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
            this.damageBrawler(b, 1000, 'gas');
            this.addFloatingNumber('-1000 GAZ', b.x, b.y - 20, '#10b981');
          }
        }
      }
    }
  }

  private checkGameModeRules(dt: number) {
    if (this.mode === 'showdown') {
      const aliveBrawlers = this.brawlers.filter(b => b.isAlive);
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
        teamGems[b.team] = (teamGems[b.team] || 0) + b.gemsCarried;
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
            const winningBrawlers = this.brawlers.filter(b => b.team === winningTeam);
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
    };
  }
}
