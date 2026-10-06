export type BrawlerId = 'shelly' | 'colt' | 'el_primo' | 'brock' | 'spike' | 'leon';

export interface BrawlerConfig {
  id: BrawlerId;
  name: string;
  title: string;
  rarity: 'Başlangıç' | 'Kupa Yolu' | 'Ender' | 'Süper Ender' | 'Efsanevi';
  color: string;
  secondaryColor: string;
  avatarBg: string;
  maxHp: number;
  speed: number;
  reloadTime: number; // Seconds per ammo
  range: number;
  damagePerAttack: number;
  superChargePerHit: number; // % charge per hit
  description: string;
  attackName: string;
  attackDesc: string;
  superName: string;
  superDesc: string;
  projectileSpeed: number;
  projectileCount: number;
  spreadAngle: number;
}

export const BRAWLERS: Record<BrawlerId, BrawlerConfig> = {
  shelly: {
    id: 'shelly',
    name: 'SHELLY',
    title: 'Öncü Dövüşçü',
    rarity: 'Başlangıç',
    color: '#a855f7',
    secondaryColor: '#7c3aed',
    avatarBg: 'from-purple-600 to-indigo-900',
    maxHp: 3800,
    speed: 170,
    reloadTime: 1.3,
    range: 320,
    damagePerAttack: 320, // 5 pellets = 1600 max
    superChargePerHit: 11,
    description: 'Saçma tüfeğiyle yakındaki rakipleri delik deşik eder.',
    attackName: 'Fişek Saçması',
    attackDesc: 'Geniş bir alana 5 adet yüksek hasarlı saçma fırlatır.',
    superName: 'Süper Saçma',
    superDesc: 'Duvarları ve çalıları paramparça eden devasa bir şok dalgası!',
    projectileSpeed: 520,
    projectileCount: 5,
    spreadAngle: 0.38,
  },
  colt: {
    id: 'colt',
    name: 'COLT',
    title: 'Şerif & Keskin Nişancı',
    rarity: 'Kupa Yolu',
    color: '#ef4444',
    secondaryColor: '#b91c1c',
    avatarBg: 'from-red-600 to-rose-900',
    maxHp: 2800,
    speed: 170,
    reloadTime: 1.4,
    range: 460,
    damagePerAttack: 360, // 6 bullets = 2160 max
    superChargePerHit: 9,
    description: 'İki altıpatlarıyla hedefe kurşun yağdırır.',
    attackName: 'Altıpatlar Fırtınası',
    attackDesc: 'Düz bir hat boyunca peş peşe 6 hızlı lazer mermisi sıkar.',
    superName: 'Mermi Barajı',
    superDesc: 'Duvarların içinden geçip engelleri yıkan 12 ekstra uzun menzilli mermi!',
    projectileSpeed: 640,
    projectileCount: 6,
    spreadAngle: 0.05,
  },
  el_primo: {
    id: 'el_primo',
    name: 'EL PRIMO',
    title: 'Lucha Libre Şampiyonu',
    rarity: 'Ender',
    color: '#0284c7',
    secondaryColor: '#0369a1',
    avatarBg: 'from-sky-600 to-blue-900',
    maxHp: 6200,
    speed: 195,
    reloadTime: 0.85,
    range: 160,
    damagePerAttack: 440, // 4 punches = 1760 max
    superChargePerHit: 11,
    description: 'Devasa can havuzuyla rakiplerin üstüne atılır.',
    attackName: 'Öfke Yumrukları',
    attackDesc: 'Yakın mesafede peş peşe 4 şiddetli yumruk savurur.',
    superName: 'Uçan Dirsek',
    superDesc: 'Havaya sıçrayıp duvarların üzerinden hedefe uçar ve deprem yaratır!',
    projectileSpeed: 380,
    projectileCount: 4,
    spreadAngle: 0.22,
  },
  brock: {
    id: 'brock',
    name: 'BROCK',
    title: 'Roketçi Delikanlı',
    rarity: 'Kupa Yolu',
    color: '#f59e0b',
    secondaryColor: '#d97706',
    avatarBg: 'from-amber-600 to-yellow-900',
    maxHp: 2600,
    speed: 165,
    reloadTime: 1.75,
    range: 520,
    damagePerAttack: 1420,
    superChargePerHit: 25,
    description: 'Uzak mesafeden güçlü roketlerle bölgeyi domine eder.',
    attackName: 'Tekli Roket',
    attackDesc: 'Uzun menzilli, çarptığında alan hasarı veren güçlü roket.',
    superName: 'Roket Yağmuru',
    superDesc: 'Hedeflenen alana gökyüzünden 9 alev roketi yağdırır!',
    projectileSpeed: 540,
    projectileCount: 1,
    spreadAngle: 0,
  },
  spike: {
    id: 'spike',
    name: 'SPIKE',
    title: 'Efsanevi Kaktüs',
    rarity: 'Efsanevi',
    color: '#10b981',
    secondaryColor: '#059669',
    avatarBg: 'from-emerald-600 to-green-900',
    maxHp: 2400,
    speed: 165,
    reloadTime: 1.65,
    range: 380,
    damagePerAttack: 720, // grenade + 6 needles
    superChargePerHit: 18,
    description: 'Patlayan kaktüsleri ve iğneleriyle rakipleri şaşırtır.',
    attackName: 'İğne Bombası',
    attackDesc: 'Çarptığında 6 yöne ölümcül kaktüs iğneleri fırlatır.',
    superName: 'Diken Tarlası',
    superDesc: 'Geniş bir alana diken sererek rakipleri yavaşlatır ve eritir!',
    projectileSpeed: 460,
    projectileCount: 1,
    spreadAngle: 0,
  },
  leon: {
    id: 'leon',
    name: 'LEON',
    title: 'Gizli Suikastçı',
    rarity: 'Efsanevi',
    color: '#06b6d4',
    secondaryColor: '#0891b2',
    avatarBg: 'from-cyan-600 to-teal-900',
    maxHp: 3200,
    speed: 210,
    reloadTime: 1.45,
    range: 400,
    damagePerAttack: 460, // 4 blades = 1840 max
    superChargePerHit: 12,
    description: 'Hızı ve duman bombasıyla görünmez pusu ustasıdır.',
    attackName: 'Döner Bıçaklar',
    attackDesc: 'Yay şeklinde 4 dönen ninja yıldızı fırlatır.',
    superName: 'Duman Perdesi',
    superDesc: '6 saniye boyunca rakiplere karşı TAMAMEN GÖRÜNMEZ olur!',
    projectileSpeed: 580,
    projectileCount: 4,
    spreadAngle: 0.28,
  },
};

export type BrawlGameMode = 'showdown' | 'gem_grab';

export interface PlayerInfo {
  id: string;
  name: string;
  brawler: BrawlerId;
  team: number;
  isHost: boolean;
  isBot?: boolean;
  score: number;
  trophies: number;
}

export interface BrawlerEntity {
  id: string;
  name: string;
  brawlerId: BrawlerId;
  team: number;
  x: number;
  y: number;
  angle: number;
  aimAngle: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  ammo: number; // 0 to 3
  maxAmmo: number; // 3
  superCharge: number; // 0 to 100%
  isAlive: boolean;
  powerCubes: number; // For Showdown (+400 HP, +10% damage)
  gemsCarried: number; // For Gem Grab
  isInBush: boolean;
  isVisibleToEnemies: boolean;
  invisibilityTimer: number; // Leon super
  isJumping: boolean; // El Primo super
  jumpProgress: number;
  jumpStartX: number;
  jumpStartY: number;
  jumpTargetX: number;
  jumpTargetY: number;
  timeSinceLastDamage: number;
  timeSinceLastAttack: number;
  slowTimer: number;
  activeEmote: string | null;
  emoteTimer: number;
  isBot?: boolean;
  kills: number;
}

export interface BrawlProjectile {
  id: string;
  ownerId: string;
  brawlerId: BrawlerId;
  team: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  maxRange: number;
  traveled: number;
  isSuper: boolean;
  color: string;
  piercesWalls: boolean;
  breaksWalls: boolean;
  burstNeedlesOnEnd?: boolean;
}

export interface ThornField {
  id: string;
  ownerId: string;
  team: number;
  x: number;
  y: number;
  radius: number;
  duration: number;
  damagePerSec: number;
}

export interface PowerCubeBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
}

export interface PowerCubeDrop {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface GemDrop {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface Bush {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BrawlWall {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  isDestructible: boolean;
  isWater?: boolean;
}

export interface FloatingNumber {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  alpha: number;
  vy: number;
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

export interface PoisonGas {
  inset: number; // Pixels inward from borders
  damageTimer: number;
  isActive: boolean;
}

export interface GemMine {
  x: number;
  y: number;
  spawnTimer: number;
  totalSpawned: number;
}

export type BrawlPhase = 'waiting' | 'starting' | 'playing' | 'match_end';

export interface BrawlSnapshot {
  phase: BrawlPhase;
  mode: BrawlGameMode;
  matchTimer: number;
  countdownTimer: number; // 15s for gem grab win
  countdownTeam: number | null;
  winnerTeam: number | null;
  winnerPlayerId: string | null;
  starPlayerId: string | null;
  brawlers: BrawlerEntity[];
  projectiles: BrawlProjectile[];
  thornFields: ThornField[];
  boxes: PowerCubeBox[];
  powerCubes: PowerCubeDrop[];
  gems: GemDrop[];
  bushes: Bush[];
  walls: BrawlWall[];
  gemMine?: GemMine;
  poisonGas: PoisonGas;
  floatingNumbers: FloatingNumber[];
}

export interface BrawlPlayerInput {
  moveX: number;
  moveY: number;
  aimAngle: number;
  attack: boolean;
  superAttack: boolean;
  superTargetX?: number;
  superTargetY?: number;
  emote?: string;
}
