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
  gadgetName: string;
  gadgetDesc: string;
  starPowerName: string;
  starPowerDesc: string;
  projectileSpeed: number;
  projectileCount: number;
  spreadAngle: number;
}

export const BRAWLERS: Record<BrawlerId, BrawlerConfig> = {
  shelly: {
    id: 'shelly',
    name: 'SHELLY',
    title: 'Öncü Avcı',
    rarity: 'Başlangıç',
    color: '#a855f7',
    secondaryColor: '#7c3aed',
    avatarBg: 'from-purple-600 to-indigo-900',
    maxHp: 3800,
    speed: 175,
    reloadTime: 1.4,
    range: 340,
    damagePerAttack: 320, // 5 pellets = 1600 max
    superChargePerHit: 10.5,
    description: 'Pompalı tüfeğiyle yakın mesafede ölümcüldür. Süper Saçması duvarları parçalar, düşmanları savurur ve sersemletir.',
    attackName: 'Fişek Saçması (Buckshot)',
    attackDesc: '5 adet konik yayılan saçma atar. Yakın mesafeden tüm saçmalar isabet ederse devasa anlık hasar verir.',
    superName: 'Süper Saçma (Super Shell)',
    superDesc: 'Duvarları ve çalıları paramparça eden 9 devasa saçma fırlatır, rakipleri geri savurur, sersemletir ve ultiyi anında tekrar doldurur!',
    gadgetName: 'İleri Atılma (Fast Forward)',
    gadgetDesc: 'Shelly ileriye doğru hızla atılarak düşmanların üstüne çullanır!',
    starPowerName: 'Yara Bandı (Band-Aid)',
    starPowerDesc: 'Canı %40 altına düştüğünde anında +1800 Can yeniler (15 sn bekleme süresi).',
    projectileSpeed: 550,
    projectileCount: 5,
    spreadAngle: 0.36,
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
    speed: 195, // with Slick Boots Star Power
    reloadTime: 1.5,
    range: 480,
    damagePerAttack: 360, // 6 bullets = 2160 max
    superChargePerHit: 9,
    description: 'İki altıpatlarıyla seri lazer yağdırır. Süper mermileri engelleri delip geçer.',
    attackName: 'Altıpatlar Fırtınası (Six-Shooters)',
    attackDesc: 'Hızlı bir şekilde peş peşe 6 adet yüksek hızlı lazer mermisi sıkar. Hareket ederek mermi hattını yönlendirebilirsiniz.',
    superName: 'Mermi Fırtınası (Bullet Storm)',
    superDesc: 'Duvarları ve engelleri yıkan, rakiplerin ve sandıkların içinden geçen 12 adet ekstra uzun menzilli yıkıcı mermi seli!',
    gadgetName: 'Hızlı Doldurucu (Speedloader)',
    gadgetDesc: 'Anında 2 tam cephane doldurarak çatışmaya kesintisiz devam eder!',
    starPowerName: 'Kayan Çizmeler (Slick Boots)',
    starPowerDesc: 'Colt kalıcı olarak %12 daha hızlı koşar ve altın ayak izleri bırakır.',
    projectileSpeed: 680,
    projectileCount: 6,
    spreadAngle: 0.04,
  },
  el_primo: {
    id: 'el_primo',
    name: 'EL PRIMO',
    title: 'Lucha Libre Şampiyonu',
    rarity: 'Ender',
    color: '#0284c7',
    secondaryColor: '#0369a1',
    avatarBg: 'from-sky-600 to-blue-900',
    maxHp: 6000,
    speed: 200,
    reloadTime: 0.85,
    range: 165,
    damagePerAttack: 380, // 4 punches = 1520 max
    superChargePerHit: 12,
    description: 'Dev cüssesiyle rakiplerin üstüne atılır. Hasar aldıkça ultisi dolar. Gökyüzüne sıçrayıp hedefe çarparak yer sarsıntısı yaratır.',
    attackName: 'Öfke Yumrukları (Fists of Fury)',
    attackDesc: 'Yakın mesafede art arda 4 seri alevli boks yumruğu savurur.',
    superName: 'Uçan Dirsek (Flying Elbow Drop)',
    superDesc: 'Duvarların üzerinden gökyüzüne fırlar; inişte 1300 hasar verir, duvarları/çalıları yıkar ve herkesi savurur!',
    gadgetName: 'Suplex Takviyesi (Suplex Supplement)',
    gadgetDesc: 'Yakındaki rakibi tutup omzunun üstünden arkasına fırlatır ve sersemletir!',
    starPowerName: 'Ateşli Yumruk (El Fuego)',
    starPowerDesc: 'Süperiyle çarptığı rakipler 4 saniye boyunca yanar (toplam 1200 yanma hasarı).',
    projectileSpeed: 420,
    projectileCount: 4,
    spreadAngle: 0.18,
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
    reloadTime: 1.7,
    range: 540,
    damagePerAttack: 1360, // rocket with AoE and fire patch
    superChargePerHit: 25,
    description: 'Uzak mesafeden alan hasarı veren roketler atar. Yeri alevler içinde bırakır.',
    attackName: 'Tekli Roket (Rockin\' Rocket)',
    attackDesc: 'Uzun menzilli roket. Çarptığında patlayarak alan hasarı verir ve yerde 2 saniye yanan alev havuzu bırakır.',
    superName: 'Roket Yağmuru (Rocket Rain)',
    superDesc: 'Gökyüzünden hedeflenen bölgeye 9 alev roketi yağdırır, duvarları yok eder ve alev havuzları bırakır!',
    gadgetName: 'Roket Bağcıkları (Rocket Laces)',
    gadgetDesc: 'Yere roket fırlatarak havaya zıplar, yakındaki düşmanları savurur ve hasar verir!',
    starPowerName: 'Alev Alan (Incendiary)',
    starPowerDesc: 'Tüm roket patlamaları yerde 420 hasar/sn vuran yangın havuzları bırakır.',
    projectileSpeed: 560,
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
    range: 390,
    damagePerAttack: 700, // grenade + 6 needles (420 each)
    superChargePerHit: 18,
    description: 'Patlayan kaktüs bombaları 6 yöne iğne saçar. Diken Tarlası rakipleri kilitler, kendini iyileştirir.',
    attackName: 'İğne Bombası (Needle Grenade)',
    attackDesc: 'Çarptığında veya menzil sonunda 6 yöne kavisli ölümcül kaktüs iğneleri fırlatır.',
    superName: 'Diken Tarlası (Stick Around!)',
    superDesc: 'Geniş bir alana diken serer; rakipleri %50 yavaşlatır ve saniyede 600 hasar verir!',
    gadgetName: 'Diken Yağmuru (Popping Pincushion)',
    gadgetDesc: 'Kendi etrafında 360 derece 16 adet sivri iğne fırlatır!',
    starPowerName: 'Gübre (Fertilizer)',
    starPowerDesc: 'Spike kendi Diken Tarlasının içinde durduğunda saniyede +700 Can yeniler!',
    projectileSpeed: 480,
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
    range: 420,
    damagePerAttack: 480, // 4 blades = up to 3200 close range burst!
    superChargePerHit: 12,
    description: 'Dönen ninja yıldızları yakından 2 kat daha fazla vurur. Duman bombasıyla tamamen görünmez olur, hızlanır ve can yeniler.',
    attackName: 'Döner Bıçaklar (Spinner Blades)',
    attackDesc: 'Yay şeklinde 4 dönen shuriken fırlatır. Yakın mesafeden devasa suikast hasarı (3200+) verir.',
    superName: 'Duman Bombası (Smoke Bomb)',
    superDesc: 'Duman bombası patlatarak 6 saniye boyunca TAMAMEN GÖRÜNMEZ olur, %30 ekstra hız kazanır ve her saniye +700 Can yeniler!',
    gadgetName: 'Klon Yansıtıcı (Clone Projector)',
    gadgetDesc: 'Rakipleri yanıltmak ve mermileri engellemek için koşan bir hologram klon oluşturur!',
    starPowerName: 'Görünmez İyileşme (Invisiheal)',
    starPowerDesc: 'Gizlilik halindeyken saniyede +700 Can yenilenir ve duman izleri arkada süzülür.',
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
  ammo: number; // 0 to 3
  maxAmmo: number; // 3
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
  type: 'explosion' | 'shockwave' | 'primo_slam' | 'smoke_poof' | 'debris' | 'dash' | 'band_aid';
  x: number;
  y: number;
  radius: number;
  color: string;
  duration: number;
  progress: number;
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
