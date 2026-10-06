export type TankColor = 'cyan' | 'red' | 'green' | 'amber' | 'purple';

export interface ColorConfig {
  id: TankColor;
  name: string;
  primary: string;
  secondary: string;
  glow: string;
  trail: string;
}

export const TANK_COLORS: Record<TankColor, ColorConfig> = {
  cyan: {
    id: 'cyan',
    name: 'Neon Cyan',
    primary: '#06b6d4',
    secondary: '#0891b2',
    glow: 'rgba(6, 182, 212, 0.6)',
    trail: 'rgba(6, 182, 212, 0.25)',
  },
  red: {
    id: 'red',
    name: 'Kızıl Alev',
    primary: '#ef4444',
    secondary: '#dc2626',
    glow: 'rgba(239, 68, 68, 0.6)',
    trail: 'rgba(239, 68, 68, 0.25)',
  },
  green: {
    id: 'green',
    name: 'Zehir Yeşili',
    primary: '#22c55e',
    secondary: '#16a34a',
    glow: 'rgba(34, 197, 94, 0.6)',
    trail: 'rgba(34, 197, 94, 0.25)',
  },
  amber: {
    id: 'amber',
    name: 'Yıldırım Sarı',
    primary: '#f59e0b',
    secondary: '#d97706',
    glow: 'rgba(245, 158, 11, 0.6)',
    trail: 'rgba(245, 158, 11, 0.25)',
  },
  purple: {
    id: 'purple',
    name: 'Sibernetik Mor',
    primary: '#a855f7',
    secondary: '#9333ea',
    glow: 'rgba(168, 85, 247, 0.6)',
    trail: 'rgba(168, 85, 247, 0.25)',
  },
};

export interface PlayerInfo {
  id: string;
  name: string;
  color: TankColor;
  isHost: boolean;
  isBot?: boolean;
  score: number;
  ping?: number;
}

export interface Tank {
  id: string;
  name: string;
  color: TankColor;
  x: number;
  y: number;
  angle: number;
  turretAngle: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  isAlive: boolean;
  shield: boolean;
  speedBoostTimer: number;
  tripleShotTimer: number;
  laserShotTimer: number;
  ammo: number;
  maxAmmo: number;
  lastShootTime: number;
  lastMineTime: number;
  isBot?: boolean;
}

export interface Bullet {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  bouncesLeft: number;
  color: string;
  isLaser?: boolean;
  createdAt: number;
}

export interface Mine {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  radius: number;
  armTimer: number; // ticks before active
  fuseTimer: number; // auto detonates after X ms
  isDetonated: boolean;
  color: string;
}

export type PowerUpType = 'shield' | 'speed' | 'triple' | 'laser' | 'ammo';

export interface PowerUp {
  id: string;
  x: number;
  y: number;
  type: PowerUpType;
  radius: number;
  duration: number; // for despawn
}

export interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
  isDestructible: boolean;
  hp?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radius: number;
  alpha: number;
  decay: number;
}

export interface TreadMark {
  x: number;
  y: number;
  angle: number;
  alpha: number;
}

export interface GameEventMessage {
  id: string;
  text: string;
  color: string;
  time: number;
}

export type GamePhase = 'waiting' | 'starting' | 'playing' | 'round_end' | 'match_end';

export interface GameStateSnapshot {
  phase: GamePhase;
  round: number;
  maxRounds: number;
  roundTimer: number;
  roundWinnerId: string | null;
  matchWinnerId: string | null;
  scores: Record<string, number>;
  tanks: Tank[];
  bullets: Bullet[];
  mines: Mine[];
  powerups: PowerUp[];
  walls: Wall[];
  events: GameEventMessage[];
}

export interface PlayerInput {
  moveX: number;
  moveY: number;
  moveForward: boolean;
  moveBackward: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  aimAngle: number;
  shoot: boolean;
  placeMine: boolean;
}
