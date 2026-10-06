import {
  Tank,
  Bullet,
  Mine,
  ExplosiveBarrel,
  BoostPad,
  Portal,
  PowerUp,
  Wall,
  Particle,
  TreadMark,
  FloatingText,
  SuddenDeathZone,
  BiomeType,
  GameStateSnapshot,
  PlayerInput,
  PlayerInfo,
  TANK_COLORS,
  PowerUpType,
  GameEventMessage,
} from '../types/game';
import { generateMap, SPAWN_POINTS, ARENA_WIDTH, ARENA_HEIGHT } from './mapGenerator';
import {
  circleRectCollision,
  circleIntersect,
  bounceBulletAgainstWall,
  distSq,
  dist,
} from './physics';
import { BotController } from './botController';

export interface SoundEvent {
  type: 'shoot' | 'ricochet' | 'explosion' | 'laser' | 'mine' | 'powerup' | 'shield' | 'victory' | 'dash' | 'emp' | 'portal' | 'sudden_death';
  isBig?: boolean;
}

export class GameEngine {
  public phase: GameStateSnapshot['phase'] = 'waiting';
  public biome: BiomeType = 'cyber';
  public round: number = 1;
  public maxRounds: number = 5;
  public roundTimer: number = 0;
  public matchDuration: number = 0;
  public roundWinnerId: string | null = null;
  public matchWinnerId: string | null = null;

  public tanks: Tank[] = [];
  public bullets: Bullet[] = [];
  public mines: Mine[] = [];
  public barrels: ExplosiveBarrel[] = [];
  public boostPads: BoostPad[] = [];
  public portals: Portal[] = [];
  public powerups: PowerUp[] = [];
  public walls: Wall[] = [];
  public particles: Particle[] = [];
  public treadMarks: TreadMark[] = [];
  public floatingTexts: FloatingText[] = [];
  public events: GameEventMessage[] = [];

  public suddenDeath: SuddenDeathZone = {
    isActive: false,
    inset: 0,
    damageTimer: 0,
  };

  public scores: Record<string, number> = {};
  public playerInputs: Record<string, PlayerInput> = {};
  private botControllers: Record<string, BotController> = {};

  public onSoundTriggered?: (event: SoundEvent) => void;

  private layoutIndex: number = 0;
  private nextEntityId: number = 1;

  constructor() {
    const mapData = generateMap(0);
    this.walls = mapData.walls;
    this.barrels = mapData.barrels;
    this.boostPads = mapData.boostPads;
    this.portals = mapData.portals;
    this.biome = mapData.biome;
  }

  public initMatch(players: PlayerInfo[], targetScore: number = 5) {
    this.maxRounds = targetScore;
    this.scores = {};
    players.forEach(p => {
      this.scores[p.id] = 0;
      if (p.isBot) {
        this.botControllers[p.id] = new BotController();
      }
    });

    this.round = 1;
    this.matchWinnerId = null;
    this.startRound(players);
  }

  public startRound(players: PlayerInfo[]) {
    this.layoutIndex = (this.round - 1) % 3;
    const mapData = generateMap(this.layoutIndex);
    this.biome = mapData.biome;
    this.walls = mapData.walls;
    this.barrels = mapData.barrels;
    this.boostPads = mapData.boostPads;
    this.portals = mapData.portals;

    this.bullets = [];
    this.mines = [];
    this.powerups = [];
    this.particles = [];
    this.treadMarks = [];
    this.floatingTexts = [];
    this.roundWinnerId = null;
    this.matchDuration = 0;

    this.suddenDeath = {
      isActive: false,
      inset: 0,
      damageTimer: 0,
    };

    // Spawn tanks
    this.tanks = players.map((p, idx) => {
      const spawn = SPAWN_POINTS[idx % SPAWN_POINTS.length];
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        x: spawn.x,
        y: spawn.y,
        angle: spawn.angle,
        turretAngle: spawn.angle,
        vx: 0,
        vy: 0,
        hp: 100,
        maxHp: 100,
        isAlive: true,
        shield: false,
        speedBoostTimer: 0,
        tripleShotTimer: 0,
        laserShotTimer: 0,
        homingShotTimer: 0,
        ammo: 5,
        maxAmmo: 5,
        lastShootTime: 0,
        lastMineTime: 0,
        dashCooldown: 0,
        empCooldown: 0,
        isDashing: false,
        dashTimer: 0,
        isBot: p.isBot,
      };
    });

    this.phase = 'starting';
    this.roundTimer = 3.0; // 3 sec countdown
    const biomeNames = { cyber: 'Cyberpunk Çekirdeği', magma: 'Magma Reaktörü', frost: 'Buzul Kalesi' };
    this.addEvent(`Round ${this.round}: ${biomeNames[this.biome]}`, '#38bdf8');
  }

  public setPlayerInput(playerId: string, input: PlayerInput) {
    this.playerInputs[playerId] = input;
  }

  public update(dt: number) {
    if (this.phase === 'starting') {
      this.roundTimer -= dt;
      if (this.roundTimer <= 0) {
        this.phase = 'playing';
        this.roundTimer = 0;
      }
      this.updateParticles(dt);
      this.updateFloatingTexts(dt);
      return;
    }

    if (this.phase === 'round_end') {
      this.roundTimer -= dt;
      this.updateParticles(dt);
      this.updateFloatingTexts(dt);
      if (this.roundTimer <= 0) {
        for (const [pId, score] of Object.entries(this.scores)) {
          if (score >= this.maxRounds) {
            this.phase = 'match_end';
            this.matchWinnerId = pId;
            this.onSoundTriggered?.({ type: 'victory' });
            return;
          }
        }
        this.round++;
        const playerInfos = this.tanks.map(t => ({
          id: t.id,
          name: t.name,
          color: t.color,
          isHost: false,
          isBot: t.isBot,
          score: this.scores[t.id] || 0,
        }));
        this.startRound(playerInfos);
      }
      return;
    }

    if (this.phase === 'match_end') {
      this.updateParticles(dt);
      this.updateFloatingTexts(dt);
      return;
    }

    // PLAYING PHASE
    this.matchDuration += dt;

    // Check Sudden Death (starts after 38s)
    this.updateSuddenDeath(dt);

    this.updateTanks(dt);
    this.updateBullets(dt);
    this.updateMines(dt);
    this.updateBarrels(dt);
    this.updatePortals(dt);
    this.updateBoostPads(dt);
    this.updatePowerups(dt);
    this.updateParticles(dt);
    this.updateFloatingTexts(dt);
    this.checkRoundEndCondition();
  }

  private updateSuddenDeath(dt: number) {
    if (this.matchDuration > 38) {
      if (!this.suddenDeath.isActive) {
        this.suddenDeath.isActive = true;
        this.addEvent(`⚠️ ANİ ÖLÜM! ÇEMBER DARALIYOR!`, '#ef4444');
        this.addFloatingText('SUDDEN DEATH!', ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 100, '#ef4444');
        this.onSoundTriggered?.({ type: 'sudden_death' });
      }

      // Shrink border inward (up to 350px)
      if (this.suddenDeath.inset < 360) {
        this.suddenDeath.inset += dt * 14;
      }

      // Damage tanks outside safe area
      this.suddenDeath.damageTimer += dt;
      if (this.suddenDeath.damageTimer >= 0.75) {
        this.suddenDeath.damageTimer = 0;
        const minX = this.suddenDeath.inset;
        const maxX = ARENA_WIDTH - this.suddenDeath.inset;
        const minY = this.suddenDeath.inset;
        const maxY = ARENA_HEIGHT - this.suddenDeath.inset;

        for (const tank of this.tanks) {
          if (!tank.isAlive) continue;
          if (tank.x < minX || tank.x > maxX || tank.y < minY || tank.y > maxY) {
            this.hitTank(tank, 'sudden-death');
            this.addFloatingText('RADYASYON!', tank.x, tank.y - 20, '#ef4444');
          }
        }
      }
    }
  }

  private updateTanks(dt: number) {
    const tankRadius = 18;
    const baseSpeed = this.biome === 'frost' ? 180 : 160;
    const rotateSpeed = 3.2;

    for (const tank of this.tanks) {
      if (!tank.isAlive) continue;

      // Cooldown timers
      if (tank.speedBoostTimer > 0) tank.speedBoostTimer -= dt;
      if (tank.tripleShotTimer > 0) tank.tripleShotTimer -= dt;
      if (tank.laserShotTimer > 0) tank.laserShotTimer -= dt;
      if (tank.homingShotTimer > 0) tank.homingShotTimer -= dt;
      if (tank.dashCooldown > 0) tank.dashCooldown -= dt;
      if (tank.empCooldown > 0) tank.empCooldown -= dt;

      // Dash state
      if (tank.isDashing) {
        tank.dashTimer -= dt;
        if (tank.dashTimer <= 0) {
          tank.isDashing = false;
        }
      }

      // Ammo regeneration (1 ammo every 0.75s)
      tank.ammo = Math.min(tank.maxAmmo, tank.ammo + dt * 1.35);

      // Bot inputs
      let input = this.playerInputs[tank.id];
      if (tank.isBot && this.botControllers[tank.id]) {
        input = this.botControllers[tank.id].update(tank, this.tanks, this.walls, this.powerups, dt);
        this.playerInputs[tank.id] = input;
      }

      if (!input) continue;

      // Turret Angle
      tank.turretAngle = input.aimAngle;

      // DASH ABILITY (Space / Shift / Q)
      if (input.dash && tank.dashCooldown <= 0 && !tank.isDashing) {
        tank.isDashing = true;
        tank.dashTimer = 0.22; // 220ms dash
        tank.dashCooldown = 2.8; // 2.8s cooldown

        const dashAngle = (input.moveX !== 0 || input.moveY !== 0)
          ? Math.atan2(input.moveY, input.moveX)
          : tank.angle;

        const dashSpeed = 560;
        tank.vx = Math.cos(dashAngle) * dashSpeed;
        tank.vy = Math.sin(dashAngle) * dashSpeed;

        this.addFloatingText('DASH!', tank.x, tank.y - 25, '#38bdf8');
        this.createSparks(tank.x, tank.y, '#38bdf8', 16);
        this.onSoundTriggered?.({ type: 'dash' });
      }

      // EMP DEFENSIVE SHOCKWAVE (E / Q / Middle Click)
      if (input.emp && tank.empCooldown <= 0) {
        tank.empCooldown = 7.0; // 7s cooldown
        this.triggerEmpBlast(tank);
      }

      // Movement handling
      let speed = baseSpeed;
      if (tank.speedBoostTimer > 0) speed *= 1.5;
      if (tank.isDashing) speed = 560;

      if (tank.isDashing) {
        // Move by dash velocity
        tank.x += tank.vx * dt;
        tank.y += tank.vy * dt;
      } else if (input.moveX !== 0 || input.moveY !== 0) {
        // Smooth direct WASD
        const len = Math.hypot(input.moveX, input.moveY) || 1;
        const normX = input.moveX / len;
        const normY = input.moveY / len;

        const friction = this.biome === 'frost' ? 0.85 : 1.0;
        tank.x += normX * speed * dt * friction;
        tank.y += normY * speed * dt * friction;

        // Smooth chassis turning
        const targetAngle = Math.atan2(normY, normX);
        let diff = targetAngle - tank.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        tank.angle += diff * Math.min(1, dt * 16);

        if (Math.random() < 0.25) {
          this.treadMarks.push({ x: tank.x, y: tank.y, angle: tank.angle, alpha: 0.35 });
          if (this.treadMarks.length > 80) this.treadMarks.shift();
        }
      } else {
        // Fallback classic controls
        if (input.turnLeft) tank.angle -= rotateSpeed * dt;
        if (input.turnRight) tank.angle += rotateSpeed * dt;

        let moveDir = 0;
        if (input.moveForward) moveDir += 1;
        if (input.moveBackward) moveDir -= 0.65;

        if (moveDir !== 0) {
          tank.x += Math.cos(tank.angle) * speed * moveDir * dt;
          tank.y += Math.sin(tank.angle) * speed * moveDir * dt;
        }
      }

      // Tank collision with walls
      for (const wall of this.walls) {
        const col = circleRectCollision({ x: tank.x, y: tank.y, radius: tankRadius }, wall);
        if (col.collided) {
          tank.x += col.nx * col.depth;
          tank.y += col.ny * col.depth;
        }
      }

      // Tank vs Tank collisions & ramming
      for (const other of this.tanks) {
        if (other.id === tank.id || !other.isAlive) continue;
        if (circleIntersect({ x: tank.x, y: tank.y, radius: tankRadius }, { x: other.x, y: other.y, radius: tankRadius })) {
          const d = dist(tank.x, tank.y, other.x, other.y) || 1;
          const overlap = tankRadius * 2 - d;
          const nx = (tank.x - other.x) / d;
          const ny = (tank.y - other.y) / d;
          tank.x += nx * (overlap * 0.5);
          tank.y += ny * (overlap * 0.5);
          other.x -= nx * (overlap * 0.5);
          other.y -= ny * (overlap * 0.5);

          // If dashing, ram other tank!
          if (tank.isDashing) {
            other.x -= nx * 40;
            other.y -= ny * 40;
            this.hitTank(other, tank.id);
            this.addFloatingText('RAM DAMAGE!', other.x, other.y - 20, '#f97316');
          }
        }
      }

      // Shooting
      const now = performance.now();
      if (input.shoot && tank.ammo >= 1 && now - tank.lastShootTime > 280) {
        tank.lastShootTime = now;
        tank.ammo -= 1;
        this.fireBullet(tank);

        // Weapon Recoil
        const recoil = 22;
        tank.x -= Math.cos(tank.turretAngle) * recoil * dt * 8;
        tank.y -= Math.sin(tank.turretAngle) * recoil * dt * 8;
      }

      // Mine placement
      if (input.placeMine && now - tank.lastMineTime > 2500) {
        tank.lastMineTime = now;
        this.placeMine(tank);
      }
    }
  }

  private triggerEmpBlast(tank: Tank) {
    const empRadius = 135;
    this.addFloatingText('EMP BLAST!', tank.x, tank.y - 30, '#a855f7');
    this.onSoundTriggered?.({ type: 'emp' });

    // Destroy incoming bullets
    this.bullets = this.bullets.filter(b => {
      if (dist(tank.x, tank.y, b.x, b.y) <= empRadius) {
        this.createSparks(b.x, b.y, '#a855f7', 8);
        return false;
      }
      return true;
    });

    // Push away enemies
    for (const other of this.tanks) {
      if (other.id === tank.id || !other.isAlive) continue;
      const d = dist(tank.x, tank.y, other.x, other.y);
      if (d <= empRadius) {
        const nx = (other.x - tank.x) / (d || 1);
        const ny = (other.y - tank.y) / (d || 1);
        other.x += nx * 60;
        other.y += ny * 60;
      }
    }

    // Detonate nearby mines
    for (const mine of this.mines) {
      if (dist(tank.x, tank.y, mine.x, mine.y) <= empRadius) {
        mine.fuseTimer = 0.05;
      }
    }
  }

  private fireBullet(tank: Tank) {
    const barrelLength = 26;
    const spawnX = tank.x + Math.cos(tank.turretAngle) * barrelLength;
    const spawnY = tank.y + Math.sin(tank.turretAngle) * barrelLength;
    const bulletSpeed = 440;
    const tankColorHex = TANK_COLORS[tank.color]?.primary || '#06b6d4';

    if (tank.laserShotTimer > 0) {
      // Piercing Railgun
      this.bullets.push({
        id: `bullet-${this.nextEntityId++}`,
        ownerId: tank.id,
        x: spawnX,
        y: spawnY,
        vx: Math.cos(tank.turretAngle) * 780,
        vy: Math.sin(tank.turretAngle) * 780,
        radius: 6,
        bouncesLeft: 1,
        color: '#f43f5e',
        isLaser: true,
        createdAt: performance.now(),
      });
      this.onSoundTriggered?.({ type: 'laser' });
    } else if (tank.homingShotTimer > 0) {
      // Homing Seeker Missile
      const enemies = this.tanks.filter(t => t.id !== tank.id && t.isAlive);
      const target = enemies[0]?.id || null;

      this.bullets.push({
        id: `bullet-${this.nextEntityId++}`,
        ownerId: tank.id,
        x: spawnX,
        y: spawnY,
        vx: Math.cos(tank.turretAngle) * 360,
        vy: Math.sin(tank.turretAngle) * 360,
        radius: 5.5,
        bouncesLeft: 1,
        color: '#f59e0b',
        isHoming: true,
        targetTankId: target,
        createdAt: performance.now(),
      });
      this.onSoundTriggered?.({ type: 'shoot' });
    } else if (tank.tripleShotTimer > 0) {
      // 3-way shotgun
      [-0.2, 0, 0.2].forEach(angleOffset => {
        const ang = tank.turretAngle + angleOffset;
        this.bullets.push({
          id: `bullet-${this.nextEntityId++}`,
          ownerId: tank.id,
          x: spawnX,
          y: spawnY,
          vx: Math.cos(ang) * bulletSpeed,
          vy: Math.sin(ang) * bulletSpeed,
          radius: 4,
          bouncesLeft: 2,
          color: tankColorHex,
          createdAt: performance.now(),
        });
      });
      this.onSoundTriggered?.({ type: 'shoot' });
    } else {
      // Standard Ricochet Shell
      this.bullets.push({
        id: `bullet-${this.nextEntityId++}`,
        ownerId: tank.id,
        x: spawnX,
        y: spawnY,
        vx: Math.cos(tank.turretAngle) * bulletSpeed,
        vy: Math.sin(tank.turretAngle) * bulletSpeed,
        radius: 4.5,
        bouncesLeft: 2,
        color: tankColorHex,
        createdAt: performance.now(),
      });
      this.onSoundTriggered?.({ type: 'shoot' });
    }

    this.createMuzzleSmoke(spawnX, spawnY, tank.turretAngle);
  }

  private placeMine(tank: Tank) {
    this.mines.push({
      id: `mine-${this.nextEntityId++}`,
      ownerId: tank.id,
      x: tank.x,
      y: tank.y,
      radius: 12,
      armTimer: 1.0,
      fuseTimer: 25.0,
      isDetonated: false,
      color: TANK_COLORS[tank.color]?.primary || '#ef4444',
    });
    this.onSoundTriggered?.({ type: 'mine' });
  }

  private updateBullets(dt: number) {
    const toRemove = new Set<string>();

    for (const bullet of this.bullets) {
      // Homing guidance logic
      if (bullet.isHoming && bullet.targetTankId) {
        const target = this.tanks.find(t => t.id === bullet.targetTankId && t.isAlive);
        if (target) {
          const desiredAngle = Math.atan2(target.y - bullet.y, target.x - bullet.x);
          const currentAngle = Math.atan2(bullet.vy, bullet.vx);
          let diff = desiredAngle - currentAngle;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          const newAngle = currentAngle + diff * dt * 4.5;
          const speed = Math.hypot(bullet.vx, bullet.vy);
          bullet.vx = Math.cos(newAngle) * speed;
          bullet.vy = Math.sin(newAngle) * speed;
        }
      }

      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      // Small smoke trail
      if (Math.random() < 0.4) {
        this.particles.push({
          x: bullet.x,
          y: bullet.y,
          vx: (Math.random() - 0.5) * 15,
          vy: (Math.random() - 0.5) * 15,
          color: bullet.isLaser ? 'rgba(244, 63, 94, 0.7)' : 'rgba(255, 255, 255, 0.4)',
          radius: 2,
          alpha: 0.6,
          decay: 2.5,
        });
      }

      // Check bullet against explosive barrels
      for (const barrel of this.barrels) {
        if (barrel.isExploded) continue;
        if (dist(bullet.x, bullet.y, barrel.x, barrel.y) <= barrel.radius + bullet.radius) {
          toRemove.add(bullet.id);
          this.explodeBarrel(barrel, bullet.ownerId);
          break;
        }
      }

      // Check bullet against walls & crates
      let hitWall = false;
      for (let i = this.walls.length - 1; i >= 0; i--) {
        const wall = this.walls[i];
        if (wall.isDestructible) {
          const col = circleRectCollision({ x: bullet.x, y: bullet.y, radius: bullet.radius }, wall);
          if (col.collided) {
            hitWall = true;
            this.destroyCrate(i);
            toRemove.add(bullet.id);
            break;
          }
        } else {
          const bounce = bounceBulletAgainstWall(
            bullet.x,
            bullet.y,
            bullet.vx,
            bullet.vy,
            bullet.radius,
            wall
          );

          if (bounce.bounced) {
            hitWall = true;
            bullet.vx = bounce.newVx;
            bullet.vy = bounce.newVy;
            bullet.x = bounce.newX;
            bullet.y = bounce.newY;
            bullet.bouncesLeft--;

            this.createSparks(bullet.x, bullet.y, bullet.color, 8);
            this.onSoundTriggered?.({ type: 'ricochet' });

            if (bullet.bouncesLeft < 0) {
              toRemove.add(bullet.id);
              this.createExplosion(bullet.x, bullet.y, false);
            }
            break;
          }
        }
      }

      if (hitWall && toRemove.has(bullet.id)) continue;

      // Bullet against tanks
      for (const tank of this.tanks) {
        if (!tank.isAlive) continue;

        const age = performance.now() - bullet.createdAt;
        if (tank.id === bullet.ownerId && age < 220) continue;

        if (distSq(bullet.x, bullet.y, tank.x, tank.y) <= Math.pow(tank.shield ? 26 : 18, 2)) {
          toRemove.add(bullet.id);
          this.hitTank(tank, bullet.ownerId);
          break;
        }
      }
    }

    this.bullets = this.bullets.filter(b => !toRemove.has(b.id));
  }

  private explodeBarrel(barrel: ExplosiveBarrel, killerId: string) {
    if (barrel.isExploded) return;
    barrel.isExploded = true;

    const blastRadius = 110;
    this.createExplosion(barrel.x, barrel.y, true);
    this.addFloatingText('BOOM!', barrel.x, barrel.y - 25, '#ef4444');
    this.onSoundTriggered?.({ type: 'explosion', isBig: true });

    // Damage tanks
    for (const tank of this.tanks) {
      if (!tank.isAlive) continue;
      const d = dist(barrel.x, barrel.y, tank.x, tank.y);
      if (d <= blastRadius) {
        this.hitTank(tank, killerId);
      }
    }

    // Destroy nearby crates
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const wall = this.walls[i];
      if (wall.isDestructible) {
        const c = { x: wall.x + wall.w / 2, y: wall.y + wall.h / 2 };
        if (dist(barrel.x, barrel.y, c.x, c.y) <= blastRadius + 20) {
          this.destroyCrate(i);
        }
      }
    }

    // Chain react with other barrels
    for (const other of this.barrels) {
      if (other.id !== barrel.id && !other.isExploded) {
        if (dist(barrel.x, barrel.y, other.x, other.y) <= blastRadius + 15) {
          setTimeout(() => this.explodeBarrel(other, killerId), 120);
        }
      }
    }
  }

  private updateBarrels(dt: number) {
    this.barrels = this.barrels.filter(b => !b.isExploded);
  }

  private updatePortals(dt: number) {
    for (const portal of this.portals) {
      for (const [tankId, timer] of Object.entries(portal.cooldownTanks)) {
        if (timer > 0) {
          portal.cooldownTanks[tankId] = timer - dt;
        }
      }

      for (const tank of this.tanks) {
        if (!tank.isAlive) continue;
        if ((portal.cooldownTanks[tank.id] || 0) <= 0) {
          if (dist(tank.x, tank.y, portal.x, portal.y) <= portal.radius + 12) {
            // Teleport!
            tank.x = portal.targetX;
            tank.y = portal.targetY;
            portal.cooldownTanks[tank.id] = 2.0;

            // Set cooldown on partner portal
            const partner = this.portals.find(p => p.id !== portal.id);
            if (partner) {
              partner.cooldownTanks[tank.id] = 2.0;
            }

            this.createSparks(tank.x, tank.y, portal.color, 20);
            this.addFloatingText('WARP!', tank.x, tank.y - 25, portal.color);
            this.onSoundTriggered?.({ type: 'portal' });
          }
        }
      }
    }
  }

  private updateBoostPads(dt: number) {
    for (const pad of this.boostPads) {
      for (const tank of this.tanks) {
        if (!tank.isAlive) continue;
        const col = circleRectCollision({ x: tank.x, y: tank.y, radius: 18 }, pad);
        if (col.collided) {
          tank.x += pad.dirX * 380 * dt;
          tank.y += pad.dirY * 380 * dt;
          tank.speedBoostTimer = 1.2;
          if (Math.random() < 0.2) {
            this.createSparks(tank.x, tank.y, '#f59e0b', 4);
          }
        }
      }
    }
  }

  private updateMines(dt: number) {
    const toRemove = new Set<string>();

    for (const mine of this.mines) {
      if (mine.armTimer > 0) mine.armTimer -= dt;
      mine.fuseTimer -= dt;

      let detonate = mine.fuseTimer <= 0;
      if (!detonate && mine.armTimer <= 0) {
        for (const tank of this.tanks) {
          if (!tank.isAlive) continue;
          if (dist(mine.x, mine.y, tank.x, tank.y) <= 38) {
            detonate = true;
            break;
          }
        }
      }

      if (detonate) {
        toRemove.add(mine.id);
        this.detonateMine(mine);
      }
    }

    this.mines = this.mines.filter(m => !toRemove.has(m.id));
  }

  private detonateMine(mine: Mine) {
    const blastRadius = 90;
    this.createExplosion(mine.x, mine.y, true);
    this.onSoundTriggered?.({ type: 'explosion', isBig: true });

    for (const tank of this.tanks) {
      if (!tank.isAlive) continue;
      if (dist(mine.x, mine.y, tank.x, tank.y) <= blastRadius) {
        this.hitTank(tank, mine.ownerId);
      }
    }

    for (let i = this.walls.length - 1; i >= 0; i--) {
      const wall = this.walls[i];
      if (wall.isDestructible) {
        const c = { x: wall.x + wall.w / 2, y: wall.y + wall.h / 2 };
        if (dist(mine.x, mine.y, c.x, c.y) <= blastRadius + 20) {
          this.destroyCrate(i);
        }
      }
    }
  }

  private destroyCrate(wallIndex: number) {
    const crate = this.walls[wallIndex];
    if (!crate) return;

    this.walls.splice(wallIndex, 1);
    this.createSparks(crate.x + crate.w / 2, crate.y + crate.h / 2, '#d97706', 15);
    this.onSoundTriggered?.({ type: 'explosion', isBig: false });

    // 45% chance for powerup
    if (Math.random() < 0.48) {
      const types: PowerUpType[] = ['shield', 'speed', 'triple', 'laser', 'homing', 'ammo'];
      const chosenType = types[Math.floor(Math.random() * types.length)];
      this.powerups.push({
        id: `powerup-${this.nextEntityId++}`,
        x: crate.x + crate.w / 2,
        y: crate.y + crate.h / 2,
        type: chosenType,
        radius: 14,
        duration: 22,
      });
    }
  }

  private updatePowerups(dt: number) {
    const toRemove = new Set<string>();

    for (const p of this.powerups) {
      p.duration -= dt;
      if (p.duration <= 0) {
        toRemove.add(p.id);
        continue;
      }

      for (const tank of this.tanks) {
        if (!tank.isAlive) continue;
        if (circleIntersect({ x: p.x, y: p.y, radius: p.radius }, { x: tank.x, y: tank.y, radius: 18 })) {
          this.applyPowerup(tank, p.type);
          toRemove.add(p.id);
          this.onSoundTriggered?.({ type: 'powerup' });
          break;
        }
      }
    }

    this.powerups = this.powerups.filter(p => !toRemove.has(p.id));
  }

  private applyPowerup(tank: Tank, type: PowerUpType) {
    switch (type) {
      case 'shield':
        tank.shield = true;
        this.addEvent(`${tank.name} Enerji Kalkanı aldı!`, '#38bdf8');
        this.addFloatingText('SHIELD UP!', tank.x, tank.y - 25, '#38bdf8');
        break;
      case 'speed':
        tank.speedBoostTimer = 8.0;
        this.addEvent(`${tank.name} Turbo Hız kazandı!`, '#facc15');
        this.addFloatingText('SPEED BOOST!', tank.x, tank.y - 25, '#facc15');
        break;
      case 'triple':
        tank.tripleShotTimer = 10.0;
        tank.laserShotTimer = 0;
        tank.homingShotTimer = 0;
        this.addEvent(`${tank.name} Üçlü Atış kazandı!`, '#fb923c');
        this.addFloatingText('TRIPLE SHOT!', tank.x, tank.y - 25, '#fb923c');
        break;
      case 'laser':
        tank.laserShotTimer = 8.0;
        tank.tripleShotTimer = 0;
        tank.homingShotTimer = 0;
        this.addEvent(`${tank.name} Lazer Kuşandı!`, '#f43f5e');
        this.addFloatingText('RAILGUN!', tank.x, tank.y - 25, '#f43f5e');
        break;
      case 'homing':
        tank.homingShotTimer = 8.0;
        tank.tripleShotTimer = 0;
        tank.laserShotTimer = 0;
        this.addEvent(`${tank.name} Güdümlü Füze aldı!`, '#f59e0b');
        this.addFloatingText('HOMING MISSILES!', tank.x, tank.y - 25, '#f59e0b');
        break;
      case 'ammo':
        tank.ammo = tank.maxAmmo;
        this.addEvent(`${tank.name} Şarjörü tazeledi!`, '#4ade80');
        this.addFloatingText('MAX AMMO!', tank.x, tank.y - 25, '#4ade80');
        break;
    }
    this.createSparks(tank.x, tank.y, '#38bdf8', 15);
  }

  private hitTank(tank: Tank, killerId: string) {
    if (tank.shield) {
      tank.shield = false;
      this.createSparks(tank.x, tank.y, '#06b6d4', 20);
      this.onSoundTriggered?.({ type: 'shield' });
      this.addEvent(`${tank.name}'in Kalkanı patladı!`, '#06b6d4');
      this.addFloatingText('SHIELD BROKEN!', tank.x, tank.y - 25, '#06b6d4');
      return;
    }

    tank.isAlive = false;
    this.createExplosion(tank.x, tank.y, true);
    this.onSoundTriggered?.({ type: 'explosion', isBig: true });

    const killer = this.tanks.find(t => t.id === killerId);
    if (killer && killer.id !== tank.id) {
      this.addEvent(`${killer.name} ➔ ${tank.name}'i yok etti!`, '#ef4444');
      this.addFloatingText('ELIMINATED!', tank.x, tank.y - 25, '#ef4444');
    } else {
      this.addEvent(`${tank.name} imha oldu!`, '#94a3b8');
      this.addFloatingText('DESTROYED!', tank.x, tank.y - 25, '#94a3b8');
    }
  }

  private checkRoundEndCondition() {
    const aliveTanks = this.tanks.filter(t => t.isAlive);

    if (aliveTanks.length <= 1) {
      this.phase = 'round_end';
      this.roundTimer = 3.5;

      if (aliveTanks.length === 1) {
        const winner = aliveTanks[0];
        this.roundWinnerId = winner.id;
        this.scores[winner.id] = (this.scores[winner.id] || 0) + 1;
        this.addEvent(`👑 Round Kazananı: ${winner.name}!`, TANK_COLORS[winner.color]?.primary || '#eab308');
        this.addFloatingText('+1 ROUND WIN', winner.x, winner.y - 35, '#eab308');
      } else {
        this.roundWinnerId = null;
        this.addEvent(`Berabere! Kimse puan alamadı.`, '#94a3b8');
      }
    }
  }

  private addEvent(text: string, color: string) {
    this.events.unshift({
      id: `ev-${this.nextEntityId++}`,
      text,
      color,
      time: performance.now(),
    });
    if (this.events.length > 6) this.events.pop();
  }

  private addFloatingText(text: string, x: number, y: number, color: string) {
    this.floatingTexts.push({
      id: `ft-${this.nextEntityId++}`,
      text,
      x,
      y,
      color,
      alpha: 1.0,
      vy: -35,
    });
    if (this.floatingTexts.length > 25) this.floatingTexts.shift();
  }

  private updateFloatingTexts(dt: number) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy * dt;
      ft.alpha -= dt * 0.9;
      if (ft.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  private createMuzzleSmoke(x: number, y: number, angle: number) {
    for (let i = 0; i < 6; i++) {
      const spread = (Math.random() - 0.5) * 0.5;
      const speed = 40 + Math.random() * 60;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle + spread) * speed,
        vy: Math.sin(angle + spread) * speed,
        color: 'rgba(200, 200, 200, 0.7)',
        radius: 3 + Math.random() * 2,
        alpha: 0.7,
        decay: 3.5,
      });
    }
  }

  private createSparks(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color,
        radius: 2 + Math.random() * 2,
        alpha: 1.0,
        decay: 2.0 + Math.random() * 2.0,
      });
    }
  }

  private createExplosion(x: number, y: number, isBig: boolean) {
    const count = isBig ? 45 : 20;
    const colors = ['#f97316', '#ef4444', '#fbbf24', '#ffffff'];

    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (isBig ? 120 : 60) + Math.random() * (isBig ? 240 : 120);
      const color = colors[Math.floor(Math.random() * colors.length)];
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color,
        radius: (isBig ? 4 : 2) + Math.random() * 3,
        alpha: 1.0,
        decay: 1.5 + Math.random() * 1.5,
      });
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.alpha -= p.decay * dt;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  public getSnapshot(): GameStateSnapshot {
    return {
      phase: this.phase,
      biome: this.biome,
      round: this.round,
      maxRounds: this.maxRounds,
      roundTimer: this.roundTimer,
      roundWinnerId: this.roundWinnerId,
      matchWinnerId: this.matchWinnerId,
      scores: { ...this.scores },
      tanks: this.tanks,
      bullets: this.bullets,
      mines: this.mines,
      barrels: this.barrels,
      boostPads: this.boostPads,
      portals: this.portals,
      powerups: this.powerups,
      walls: this.walls,
      events: this.events,
      floatingTexts: this.floatingTexts,
      suddenDeath: this.suddenDeath,
    };
  }
}
