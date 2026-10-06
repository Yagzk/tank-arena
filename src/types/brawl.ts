export type BrawlerId = 'mira' | 'rivet' | 'boulder' | 'fuse' | 'thorn' | 'wisp';

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
  reloadTime: number; // Seconds to refill one ammo slot
  /** Enforced delay between two basic attacks, independent of ammo. */
  attackCooldown: number;
  /** Ground acceleration in px/s^2. Lower = heavier, more committed movement. */
  acceleration: number;
  /** Full-damage basic attacks needed to charge the Super from empty. */
  superHitsRequired: number;
  range: number;
  damagePerAttack: number;
  superChargePerHit: number; // % charge per hit
  description: string;
  attackName: string;
  attackDesc: string;
  superName: string;
  superDesc: string;
  gadgetName: string;
  gadgetDesc: string;
  starPowerName: string;
  starPowerDesc: string;
  projectileSpeed: number;
  projectileCount: number;
  spreadAngle: number;
}

export const BRAWLERS: Record<BrawlerId, BrawlerConfig> = {
  mira: {
    id: 'mira',
    name: 'MİRA',
    title: 'Hurdalık Avcısı',
    rarity: 'Başlangıç',
    color: '#a855f7',
    secondaryColor: '#7c3aed',
    avatarBg: 'from-purple-600 to-indigo-900',
    maxHp: 3800,
    speed: 175,
    reloadTime: 1.4,
    attackCooldown: 0.52,
    acceleration: 1500,
    superHitsRequired: 3,
    range: 340,
    damagePerAttack: 320,
    superChargePerHit: 10.5,
    description:
      'Hurdadan yaptığı saçma tüfeğiyle yakın mesafede ölümcüldür. Şarjlı atışı duvarları söker, rakipleri savurur ve sersemletir.',
    attackName: 'Hurda Saçması',
    attackDesc:
      '5 adet konik yayılan saçma atar. Dipten tüm saçmalar isabet ederse devasa anlık hasar verir.',
    superName: 'Yıkım Salvosu',
    superDesc:
      'Duvarları ve çalıları paramparça eden 9 ağır saçma fırlatır; rakipleri savurur, sersemletir ve yavaşlatır.',
    gadgetName: 'Atılım',
    gadgetDesc: 'Nişan yönünde hızla atılarak mesafeyi bir anda kapatır.',
    starPowerName: 'Sargı',
    starPowerDesc: 'Canı %40 altına düştüğünde anında +1800 Can yeniler (15 sn bekleme).',
    projectileSpeed: 550,
    projectileCount: 5,
    spreadAngle: 0.36,
  },
  rivet: {
    id: 'rivet',
    name: 'RIVET',
    title: 'Düello Ustası',
    rarity: 'Kupa Yolu',
    color: '#ef4444',
    secondaryColor: '#b91c1c',
    avatarBg: 'from-red-600 to-rose-900',
    maxHp: 2800,
    speed: 195,
    reloadTime: 1.5,
    attackCooldown: 0.46,
    acceleration: 1700,
    superHitsRequired: 3.2,
    range: 480,
    damagePerAttack: 360,
    superChargePerHit: 9,
    description: 'Çift tabancasıyla seri isabet yağdırır. Şarjlı atışı engelleri delip geçer.',
    attackName: 'Seri Atış',
    attackDesc:
      'Peş peşe 6 yüksek hızlı mermi sıkar. Hat boyunca hareket ederek mermi yolunu okuyabilirsiniz.',
    superName: 'Delici Yaylım',
    superDesc: 'Duvarları yıkan, rakiplerin ve sandıkların içinden geçen 12 uzun menzilli mermi.',
    gadgetName: 'Hızlı Şarjör',
    gadgetDesc: 'Anında 2 tam cephane doldurur.',
    starPowerName: 'Hafif Taban',
    starPowerDesc: 'Kalıcı olarak %12 daha hızlı koşar ve arkasında iz bırakır.',
    projectileSpeed: 680,
    projectileCount: 6,
    spreadAngle: 0.04,
  },
  boulder: {
    id: 'boulder',
    name: 'BOULDER',
    title: 'Ring Devi',
    rarity: 'Ender',
    color: '#0284c7',
    secondaryColor: '#0369a1',
    avatarBg: 'from-sky-600 to-blue-900',
    maxHp: 6000,
    speed: 200,
    reloadTime: 0.85,
    attackCooldown: 0.3,
    acceleration: 1250,
    superHitsRequired: 2.6,
    range: 165,
    damagePerAttack: 380,
    superChargePerHit: 12,
    description:
      'Cüssesiyle rakiplerin üstüne atılır. Hasar aldıkça şarjı dolar; havaya sıçrayıp indiği yeri sarsar.',
    attackName: 'Çifte Yumruk',
    attackDesc: 'Yakın mesafede art arda 4 seri yumruk savurur.',
    superName: 'Göktaşı İnişi',
    superDesc:
      'Duvarların üzerinden sıçrar; inişte 1300 hasar verir, engelleri yıkar ve herkesi savurur.',
    gadgetName: 'Savurma',
    gadgetDesc: 'Yakındaki rakibi kavrayıp arkasına fırlatır ve sersemletir.',
    starPowerName: 'Köz',
    starPowerDesc: 'Şarjlı inişiyle vurduğu rakipler 4 saniye yanar (toplam 1200 hasar).',
    projectileSpeed: 420,
    projectileCount: 4,
    spreadAngle: 0.18,
  },
  fuse: {
    id: 'fuse',
    name: 'FUSE',
    title: 'Havai Fişekçi',
    rarity: 'Kupa Yolu',
    color: '#f59e0b',
    secondaryColor: '#d97706',
    avatarBg: 'from-amber-600 to-yellow-900',
    maxHp: 2600,
    speed: 165,
    reloadTime: 1.7,
    attackCooldown: 0.62,
    acceleration: 1350,
    superHitsRequired: 2.4,
    range: 540,
    damagePerAttack: 1360,
    superChargePerHit: 25,
    description: 'Uzaktan alan hasarı veren roketler atar. Vurduğu yeri alevler içinde bırakır.',
    attackName: 'Tekli Roket',
    attackDesc:
      'Uzun menzilli roket. Çarptığında patlar ve yerde 2 saniye yanan bir alev havuzu bırakır.',
    superName: 'Roket Yağmuru',
    superDesc: 'Hedeflenen bölgeye 9 roket yağdırır, duvarları yok eder ve alev havuzları bırakır.',
    gadgetName: 'İtki Fişeği',
    gadgetDesc: 'Yere roket boşaltarak sıçrar, yakındaki rakipleri savurur ve hasar verir.',
    starPowerName: 'Tutuşturucu',
    starPowerDesc: 'Tüm patlamaları yerde saniyede 420 hasar veren yangın havuzları bırakır.',
    projectileSpeed: 560,
    projectileCount: 1,
    spreadAngle: 0,
  },
  thorn: {
    id: 'thorn',
    name: 'THORN',
    title: 'Çöl Dikeni',
    rarity: 'Efsanevi',
    color: '#10b981',
    secondaryColor: '#059669',
    avatarBg: 'from-emerald-600 to-green-900',
    maxHp: 2400,
    speed: 165,
    reloadTime: 1.65,
    attackCooldown: 0.58,
    acceleration: 1400,
    superHitsRequired: 2.8,
    range: 390,
    damagePerAttack: 700,
    superChargePerHit: 18,
    description:
      'Patlayan tohum bombaları 6 yöne diken saçar. Diken tarlası rakipleri kilitler, kendini besler.',
    attackName: 'Tohum Bombası',
    attackDesc: 'Çarptığında veya menzil sonunda 6 yöne kavisli diken fırlatır.',
    superName: 'Diken Tarlası',
    superDesc: 'Geniş bir alana diken serer; rakipleri %50 yavaşlatır ve saniyede 600 hasar verir.',
    gadgetName: 'Diken Yağmuru',
    gadgetDesc: 'Kendi etrafına 360 derece 16 diken saçar.',
    starPowerName: 'Gübre',
    starPowerDesc: 'Kendi diken tarlasının içinde dururken saniyede +700 Can yeniler.',
    projectileSpeed: 480,
    projectileCount: 1,
    spreadAngle: 0,
  },
  wisp: {
    id: 'wisp',
    name: 'WISP',
    title: 'Gölge Suikastçı',
    rarity: 'Efsanevi',
    color: '#06b6d4',
    secondaryColor: '#0891b2',
    avatarBg: 'from-cyan-600 to-teal-900',
    maxHp: 3200,
    speed: 210,
    reloadTime: 1.45,
    attackCooldown: 0.5,
    acceleration: 1850,
    superHitsRequired: 3,
    range: 420,
    damagePerAttack: 480,
    superChargePerHit: 12,
    description:
      'Dönen bıçakları yakından katlanarak vurur. Sis perdesiyle görünmez olur, hızlanır ve can yeniler.',
    attackName: 'Dönen Bıçaklar',
    attackDesc: 'Yay şeklinde 4 dönen bıçak fırlatır. Dipten devasa suikast hasarı verir.',
    superName: 'Sis Perdesi',
    superDesc:
      '6 saniye boyunca görünmez olur, %30 ekstra hız kazanır ve her saniye +700 Can yeniler.',
    gadgetName: 'Yanılsama',
    gadgetDesc: 'Rakipleri şaşırtan ve mermileri çeken bir hologram kopya bırakır.',
    starPowerName: 'Sessiz Şifa',
    starPowerDesc: 'Görünmezken saniyede +700 Can yenilenir ve arkasında sis izi süzülür.',
    projectileSpeed: 600,
    projectileCount: 4,
    spreadAngle: 0.26,
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
  knockbackVx: number;
  knockbackVy: number;
  stunTimer: number;
  speedBoostTimer: number;
  hp: number;
  maxHp: number;
  ammo: number; // Whole ammo slots, 0 to maxAmmo
  maxAmmo: number; // 3
  /** Seconds accumulated toward the next ammo slot. Drives the partial bar. */
  reloadTimer: number;
  /** Blocks the next basic attack; independent of ammo so bursts cannot stack. */
  attackCooldown: number;
  /** Previous-tick position, used by the renderer to interpolate between ticks. */
  prevX: number;
  prevY: number;
  superCharge: number; // 0 to 100%
  isAlive: boolean;
  powerCubes: number; // For Showdown (+400 HP, +10% damage)
  gemsCarried: number; // For Gem Grab
  isInBush: boolean;
  isVisibleToEnemies: boolean;
  invisibilityTimer: number; // Leon super
  isJumping: boolean; // El Primo super / Brock gadget jump
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
  // Queued burst attacks
  burstRemaining: number;
  burstInterval: number;
  burstTimer: number;
  burstIsSuper: boolean;
  burstAimAngle: number;
  burstTargetX: number;
  burstTargetY: number;
  burstShotIndex: number;
  // Gadgets & Star Powers
  gadgetCharges: number; // 3 per match
  gadgetCooldown: number;
  bandAidCooldown: number; // Shelly Band-Aid (15s cooldown)
  meteorRushTimer: number; // El Primo speed boost after Super
  burnTimer: number; // El Fuego burn timer
  burnDamagePerSec: number;
  isClone?: boolean; // For Leon Clone
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
  isCurvingNeedle?: boolean; // Spike Curveball
  curveDir?: number;
  spawnFireOnEnd?: boolean;
  knockbackForce?: number;
  /** Bodies a piercing projectile has already damaged, so it cannot hit the
   *  same target twice as it passes through. */
  hitIds?: string[];
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

export interface FirePatch {
  id: string;
  ownerId: string;
  team: number;
  x: number;
  y: number;
  radius: number;
  duration: number;
  damagePerSec: number;
}

export interface VisualEffect {
  id: string;
  type:
    | 'explosion'
    | 'shockwave'
    | 'ground_slam'
    | 'smoke_poof'
    | 'debris'
    | 'dash'
    | 'band_aid'
    | 'hit_spark'
    | 'muzzle_flash';
  x: number;
  y: number;
  radius: number;
  color: string;
  duration: number;
  progress: number;
  /** Facing, for effects that read directionally (sparks, muzzle flashes). */
  angle?: number;
  /** 0..1 weight driving spark count, scale and camera shake. */
  intensity?: number;
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
  firePatches?: FirePatch[];
  visualEffects?: VisualEffect[];
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
  gadget?: boolean; // E key or Gadget button
  superTargetX?: number;
  superTargetY?: number;
  emote?: string;
}
