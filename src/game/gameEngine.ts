import {
  Tank,
  Bullet,
  Mine,
  PowerUp,
  Wall,
  Particle,
  TreadMark,
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
  type: 'shoot' | 'ricochet' | 'explosion' | 'laser' | 'mine' | 'powerup' | 'shield' | 'victory';
  isBig?: boolean;
}

export class GameEngine {
  public phase: GameStateSnapshot['phase'] = 'waiting';
  public round: number = 1;
  public maxRounds: number = 5;
  public roundTimer: number = 0;
  public roundWinnerId: string | null = null;
  public matchWinnerId: string | null = null;

  public tanks: Tank[] = [];
  public bullets: Bullet[] = [];
  public mines: Mine[] = [];
  public powerups: PowerUp[] = [];
  public walls: Wall[] = [];
  public particles: Particle[] = [];
  public treadMarks: TreadMark[] = [];
  public events: GameEventMessage[] = [];

  public scores: Record<string, number> = {};
  public playerInputs: Record<string, PlayerInput> = {};
  private botControllers: Record<string, BotController> = {};

  public onSoundTriggered?: (event: SoundEvent) => void;

  private layoutIndex: number = 0;
  private nextEntityId: number = 1;

  constructor() {
    this.walls = generateMap(0);
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
    this.walls = generateMap(this.layoutIndex);
    this.bullets = [];
    this.mines = [];
    this.powerups = [];
    this.particles = [];
    this.treadMarks = [];
    this.roundWinnerId = null;

    // Spawn tanks at designated spawn points
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
        ammo: 5,
        maxAmmo: 5,
        lastShootTime: 0,
        lastMineTime: 0,
        isBot: p.isBot,
      };
    });

    this.phase = 'starting';
    this.roundTimer = 3.0; // 3 second countdown
    this.addEvent(`Round ${this.round} Başlıyor!`, '#38bdf8');
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
      return;
    }

    if (this.phase === 'round_end') {
      this.roundTimer -= dt;
      this.updateParticles(dt);
      if (this.roundTimer <= 0) {
        // Check if any player won the match
        for (const [pId, score] of Object.entries(this.scores)) {
          if (score >= this.maxRounds) {
            this.phase = 'match_end';
            this.matchWinnerId = pId;
            this.onSoundTriggered?.({ type: 'victory' });
            return;
          }
        }
        // Next round
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
      return;
    }

    // PHASE === 'playing'
    this.updateTanks(dt);
    this.updateBullets(dt);
    this.updateMines(dt);
    this.updatePowerups(dt);
    this.updateParticles(dt);
    this.checkRoundEndCondition();
  }

  private updateTanks(dt: number) {
    const tankRadius = 18;
    const baseSpeed = 160;
    const rotateSpeed = 3.2;

    for (const tank of this.tanks) {
      if (!tank.isAlive) continue;

      // Update timers
      if (tank.speedBoostTimer > 0) tank.speedBoostTimer -= dt;
      if (tank.tripleShotTimer > 0) tank.tripleShotTimer -= dt;
      if (tank.laserShotTimer > 0) tank.laserShotTimer -= dt;

      // Ammo regeneration (1 ammo every 0.8s up to 5)
      tank.ammo = Math.min(tank.maxAmmo, tank.ammo + dt * 1.25);

      // Get input
      let input = this.playerInputs[tank.id];
      if (tank.isBot && this.botControllers[tank.id]) {
        input = this.botControllers[tank.id].update(
          tank,
          this.tanks,
          this.walls,
          this.powerups,
          dt
        );
        this.playerInputs[tank.id] = input;
      }

      if (!input) continue;

      // Rotate body
      if (input.turnLeft) tank.angle -= rotateSpeed * dt;
      if (input.turnRight) tank.angle += rotateSpeed * dt;

      // Turret angle
      tank.turretAngle = input.aimAngle;

      // Move forward/backward
      const speed = tank.speedBoostTimer > 0 ? baseSpeed * 1.5 : baseSpeed;
      let moveDir = 0;
      if (input.moveForward) moveDir += 1;
      if (input.moveBackward) moveDir -= 0.65;

      if (moveDir !== 0) {
        const dx = Math.cos(tank.angle) * speed * moveDir * dt;
        const dy = Math.sin(tank.angle) * speed * moveDir * dt;

        tank.x += dx;
        tank.y += dy;

        // Add tread mark periodically
        if (Math.random() < 0.25) {
          this.treadMarks.push({
            x: tank.x,
            y: tank.y,
            angle: tank.angle,
            alpha: 0.35,
          });
          if (this.treadMarks.length > 80) this.treadMarks.shift();
        }
      }

      // Tank collision with arena borders & walls
      for (const wall of this.walls) {
        const col = circleRectCollision({ x: tank.x, y: tank.y, radius: tankRadius }, wall);
        if (col.collided) {
          tank.x += col.nx * col.depth;
          tank.y += col.ny * col.depth;
        }
      }

      // Tank vs Tank push collision
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
        }
      }

      // Shooting
      const now = performance.now();
      if (input.shoot && tank.ammo >= 1 && now - tank.lastShootTime > 300) {
        tank.lastShootTime = now;
        tank.ammo -= 1;
        this.fireBullet(tank);
      }

      // Mine placement
      if (input.placeMine && now - tank.lastMineTime > 2500) {
        tank.lastMineTime = now;
        this.placeMine(tank);
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
      // Railgun / Laser: Faster, piercing
      this.bullets.push({
        id: `bullet-${this.nextEntityId++}`,
        ownerId: tank.id,
        x: spawnX,
        y: spawnY,
        vx: Math.cos(tank.turretAngle) * 750,
        vy: Math.sin(tank.turretAngle) * 750,
        radius: 6,
        bouncesLeft: 1,
        color: '#f43f5e',
        isLaser: true,
        createdAt: performance.now(),
      });
      this.onSoundTriggered?.({ type: 'laser' });
    } else if (tank.tripleShotTimer > 0) {
      // 3-way spread
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
      // Standard Shell
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

    // Muzzle smoke particle
    this.createMuzzleSmoke(spawnX, spawnY, tank.turretAngle);
  }

  private placeMine(tank: Tank) {
    this.mines.push({
      id: `mine-${this.nextEntityId++}`,
      ownerId: tank.id,
      x: tank.x,
      y: tank.y,
      radius: 12,
      armTimer: 1.0, // Armed after 1s so owner doesn't instantly explode
      fuseTimer: 25.0, // Auto detonate after 25s
      isDetonated: false,
      color: TANK_COLORS[tank.color]?.primary || '#ef4444',
    });
    this.onSoundTriggered?.({ type: 'mine' });
  }

  private updateBullets(dt: number) {
    const toRemove = new Set<string>();

    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      // Small smoke trail
      if (Math.random() < 0.35) {
        this.particles.push({
          x: bullet.x,
          y: bullet.y,
          vx: (Math.random() - 0.5) * 15,
          vy: (Math.random() - 0.5) * 15,
          color: bullet.isLaser ? 'rgba(244, 63, 94, 0.6)' : 'rgba(255, 255, 255, 0.4)',
          radius: 2,
          alpha: 0.6,
          decay: 2.5,
        });
      }

      // Check bullet against walls & destructible crates
      let hitWall = false;
      for (let i = this.walls.length - 1; i >= 0; i--) {
        const wall = this.walls[i];
        if (wall.isDestructible) {
          // Destructible crate: destroyed by bullet hit
          const col = circleRectCollision({ x: bullet.x, y: bullet.y, radius: bullet.radius }, wall);
          if (col.collided) {
            hitWall = true;
            this.destroyCrate(i);
            toRemove.add(bullet.id);
            break;
          }
        } else {
          // Solid wall: bounce bullet
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

        // Bullets can only hit owner after 0.25s of flight to prevent instant self-harm on shoot
        const age = performance.now() - bullet.createdAt;
        if (tank.id === bullet.ownerId && age < 250) continue;

        if (distSq(bullet.x, bullet.y, tank.x, tank.y) <= Math.pow(tank.shield ? 26 : 18, 2)) {
          toRemove.add(bullet.id);
          this.hitTank(tank, bullet.ownerId);
          break;
        }
      }
    }

    this.bullets = this.bullets.filter(b => !toRemove.has(b.id));
  }

  private updateMines(dt: number) {
    const toRemove = new Set<string>();

    for (const mine of this.mines) {
      if (mine.armTimer > 0) mine.armTimer -= dt;
      mine.fuseTimer -= dt;

      // Proximity check with all tanks
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

    // Damage nearby tanks
    for (const tank of this.tanks) {
      if (!tank.isAlive) continue;
      const d = dist(mine.x, mine.y, tank.x, tank.y);
      if (d <= blastRadius) {
        this.hitTank(tank, mine.ownerId);
      }
    }

    // Destroy nearby crates
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const wall = this.walls[i];
      if (wall.isDestructible) {
        const crateCenter = { x: wall.x + wall.w / 2, y: wall.y + wall.h / 2 };
        if (dist(mine.x, mine.y, crateCenter.x, crateCenter.y) <= blastRadius + 20) {
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

    // 40% chance to drop power-up
    if (Math.random() < 0.45) {
      const types: PowerUpType[] = ['shield', 'speed', 'triple', 'laser', 'ammo'];
      const chosenType = types[Math.floor(Math.random() * types.length)];
      this.powerups.push({
        id: `powerup-${this.nextEntityId++}`,
        x: crate.x + crate.w / 2,
        y: crate.y + crate.h / 2,
        type: chosenType,
        radius: 14,
        duration: 20, // 20s lifespan
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

      // Check collision with tanks
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
        break;
      case 'speed':
        tank.speedBoostTimer = 8.0;
        this.addEvent(`${tank.name} Turbo Hız kazandı!`, '#facc15');
        break;
      case 'triple':
        tank.tripleShotTimer = 10.0;
        tank.laserShotTimer = 0;
        this.addEvent(`${tank.name} Üçlü Atış kazandı!`, '#fb923c');
        break;
      case 'laser':
        tank.laserShotTimer = 8.0;
        tank.tripleShotTimer = 0;
        this.addEvent(`${tank.name} Lazer Raygun kuşandı!`, '#f43f5e');
        break;
      case 'ammo':
        tank.ammo = tank.maxAmmo;
        this.addEvent(`${tank.name} Şarjörü tazeledi!`, '#4ade80');
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
      return;
    }

    // Tank Destroyed!
    tank.isAlive = false;
    this.createExplosion(tank.x, tank.y, true);
    this.onSoundTriggered?.({ type: 'explosion', isBig: true });

    const killer = this.tanks.find(t => t.id === killerId);
    if (killer && killer.id !== tank.id) {
      this.addEvent(`${killer.name} ➔ ${tank.name}'i yok etti!`, '#ef4444');
    } else {
      this.addEvent(`${tank.name} kendi kendini imha etti!`, '#94a3b8');
    }
  }

  private checkRoundEndCondition() {
    const aliveTanks = this.tanks.filter(t => t.isAlive);

    // If only 1 tank alive (or 0 in mutual destruction)
    if (aliveTanks.length <= 1) {
      this.phase = 'round_end';
      this.roundTimer = 3.5;

      if (aliveTanks.length === 1) {
        const winner = aliveTanks[0];
        this.roundWinnerId = winner.id;
        this.scores[winner.id] = (this.scores[winner.id] || 0) + 1;
        this.addEvent(`👑 Round Kazananı: ${winner.name}!`, TANK_COLORS[winner.color]?.primary || '#eab308');
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
      round: this.round,
      maxRounds: this.maxRounds,
      roundTimer: this.roundTimer,
      roundWinnerId: this.roundWinnerId,
      matchWinnerId: this.matchWinnerId,
      scores: { ...this.scores },
      tanks: this.tanks,
      bullets: this.bullets,
      mines: this.mines,
      powerups: this.powerups,
      walls: this.walls,
      events: this.events,
    };
  }
}
