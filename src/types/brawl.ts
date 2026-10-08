export type BrawlerId =
  | 'mira'
  | 'rivet'
  | 'boulder'
  | 'fuse'
  | 'thorn'
  | 'wisp'
  | 'molotof'
  | 'ustabasi'
  | 'nagme'
  | 'zirh';

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
  molotof: {
    id: 'molotof',
    name: 'MOLOTOF',
    title: 'Ateş Ustası',
    rarity: 'Ender',
    color: '#f97316',
    secondaryColor: '#c2410c',
    avatarBg: 'from-orange-600 to-red-900',
    maxHp: 3000,
    speed: 170,
    reloadTime: 1.6,
    attackCooldown: 0.6,
    acceleration: 1400,
    superHitsRequired: 2.6,
    range: 470,
    damagePerAttack: 900,
    superChargePerHit: 20,
    description:
      'Duvar ardına şişe fırlatır. Vurduğu yeri değil, rakibin gidebileceği yeri kapatır.',
    attackName: 'Yangın Şişesi',
    attackDesc:
      'Duvarları aşan bir yay çizer, indiği noktada patlar ve yeri tutuşturur.',
    superName: 'Alev Gölü',
    superDesc: 'Geniş bir alanı 8 saniye yanar hâlde bırakır; o bölgede durulamaz.',
    gadgetName: 'Ateş Çemberi',
    gadgetDesc: 'Kendi etrafını kısa süre alev çemberiyle çevirir.',
    starPowerName: 'Körük',
    starPowerDesc: 'Alevleri daha geniş yayılır ve daha uzun yanar.',
    projectileSpeed: 520,
    projectileCount: 1,
    spreadAngle: 0,
  },
  ustabasi: {
    id: 'ustabasi',
    name: 'USTABAŞI',
    title: 'Hurda Mühendisi',
    rarity: 'Kupa Yolu',
    color: '#64748b',
    secondaryColor: '#334155',
    avatarBg: 'from-slate-500 to-slate-900',
    maxHp: 4400,
    speed: 180,
    reloadTime: 1.3,
    attackCooldown: 0.55,
    acceleration: 1400,
    superHitsRequired: 3.4,
    range: 420,
    damagePerAttack: 240,
    superChargePerHit: 8,
    description:
      'Orta mesafede geniş bir saçma yağdırır. Asıl gücü kurduğu makinelerde: alan tutar, tuzak kurar.',
    attackName: 'Hurda Yağmuru',
    attackDesc: '7 parça geniş bir koni hâlinde savrulur; dipten tamamı isabet eder.',
    superName: 'Otomatik Taret',
    superDesc: 'Gördüğü rakibe kendi ateş eden, yıkılabilir bir taret kurar.',
    gadgetName: 'Tuzak',
    gadgetDesc: 'Yere yaklaşanı havaya savuran bir yakınlık mayını bırakır.',
    starPowerName: 'Takviye',
    starPowerDesc: 'Kurduğu makineler daha dayanıklı olur.',
    projectileSpeed: 500,
    projectileCount: 7,
    spreadAngle: 0.5,
  },
  nagme: {
    id: 'nagme',
    name: 'NAĞME',
    title: 'Saha Şifacısı',
    rarity: 'Süper Ender',
    color: '#ec4899',
    secondaryColor: '#9d174d',
    avatarBg: 'from-pink-500 to-fuchsia-900',
    maxHp: 3600,
    speed: 175,
    reloadTime: 1.5,
    attackCooldown: 0.58,
    acceleration: 1450,
    superHitsRequired: 3,
    range: 450,
    damagePerAttack: 700,
    superChargePerHit: 11,
    description:
      'Rakiplerin içinden geçen geniş bir dalga gönderir. Süperi takımı bir anda ayağa kaldırır.',
    attackName: 'Ses Dalgası',
    attackDesc: 'Önündeki herkesin içinden geçen geniş bir dalga; kalabalığı tek atışta tarar.',
    superName: 'Diriliş Ezgisi',
    superDesc: 'Çevresindeki tüm takım arkadaşlarının canını büyük ölçüde yeniler.',
    gadgetName: 'Şifa İstasyonu',
    gadgetDesc: 'Yere, çevresindeki takımı sürekli iyileştiren bir istasyon kurar.',
    starPowerName: 'Yankı',
    starPowerDesc: 'Dalgası dost değdiğinde onları da iyileştirir.',
    projectileSpeed: 540,
    projectileCount: 3,
    spreadAngle: 0.4,
  },
  zirh: {
    id: 'zirh',
    name: 'ZIRH',
    title: 'Ön Saf',
    rarity: 'Ender',
    color: '#0d9488',
    secondaryColor: '#115e59',
    avatarBg: 'from-teal-600 to-emerald-900',
    maxHp: 5600,
    speed: 185,
    reloadTime: 1.0,
    attackCooldown: 0.34,
    acceleration: 1200,
    superHitsRequired: 2.8,
    range: 185,
    damagePerAttack: 420,
    superChargePerHit: 11,
    description:
      'Takımın önünde durur. Hasar aldıkça şarjı dolar ve o şarj takımın hayatta kalmasına gider.',
    attackName: 'Balyoz',
    attackDesc: 'Yakın mesafede art arda 3 ağır savurma.',
    superName: 'Siper Emri',
    superDesc: 'Kendisi ve yakınındaki takım arkadaşlarına 5 saniyelik kalkan verir.',
    gadgetName: 'Sarsıntı',
    gadgetDesc: 'Yere vurarak çevresindekileri savurur ve kendine kalkan alır.',
    starPowerName: 'Siper',
    starPowerDesc: 'Kalkanı kırıldığında kısa süre hız kazanır.',
    projectileSpeed: 430,
    projectileCount: 3,
    spreadAngle: 0.2,
  },
};

/**
 * Roster order, for every list the player sees.
 *
 * Derived from the config rather than written out again, because three
 * separate hard-coded arrays — the lobby, the bot filler, the solo match —
 * meant a new character silently failed to appear in two of them.
 */
export const BRAWLER_IDS = Object.keys(BRAWLERS) as BrawlerId[];

export type BrawlGameMode =
  | 'showdown'
  | 'duo_showdown'
  | 'gem_grab'
  | 'wipeout'
  | 'knockout'
  | 'hot_zone';

/** The ground a team fights over in Hot Zone. */
export interface HotZone {
  x: number;
  y: number;
  radius: number;
  /** The team currently scoring from it, or null if empty or contested. */
  controller: number | null;
}

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
  /** Times this brawler has been taken out. Matters in modes with respawn. */
  deaths: number;
  /**
   * Shots still owed by an attack that fires over time — a six-round burst, a
   * flurry of punches, an artillery barrage. One queue replaces what used to
   * be eight loose fields, and it carries the key of the action list to run,
   * so the behaviour lives in the kit rather than in the engine.
   */
  pendingBurst: PendingBurst | null;
  // Gadgets & Star Powers
  gadgetCharges: number; // 3 per match
  gadgetCooldown: number;
  /** Remaining cooldown per passive, keyed by the passive's name. */
  passiveCooldowns: Record<string, number>;
  burnTimer: number;
  burnDamagePerSec: number;
  /** Multiplier applied while `speedBoostTimer` is running. */
  speedBoostMagnitude: number;

  // ---- respawn ----
  /**
   * Seconds until this brawler comes back. Zero in modes without respawn,
   * where death is final.
   */
  respawnTimer: number;
  /** Where this brawler returns to — its team's base. */
  spawnX: number;
  spawnY: number;

  // ---- status effects ----
  /** Takes no damage while positive. Used for respawn protection. */
  immunityTimer: number;
  /** Damage the shield will absorb before health is touched. */
  shieldHp: number;
  shieldTimer: number;
  /** Cannot fire the Super while positive. */
  silenceTimer: number;
  /** Cannot move, can still shoot. */
  rootTimer: number;
  /** Visible to enemies even inside a bush. */
  revealTimer: number;
  /**
   * The last input of this player's the server has received, by the client's
   * own numbering, and how many milliseconds ago it arrived. A predicting
   * client replays everything after that input on top of the position it was
   * sent, so these two numbers are what let it agree with the server.
   */
  inputAck: number;
  inputAckAge: number;
  /**
   * World direction the last damage arrived from.
   *
   * Taking fire from somewhere you cannot see is the most common way a player
   * dies without understanding why. This is what the edge-of-screen indicator
   * points along.
   */
  lastDamageAngle: number;

  /**
   * Action list to run where an airborne brawler lands, as a registry key so
   * the payload survives the flight without the entity holding kit objects.
   */
  jumpLandKey?: string;

  isClone?: boolean;
  /** Seconds a summoned decoy has left before it dissipates. */
  decoyLifetime?: number;
}

/** An attack that fires over several ticks rather than all at once. */
export interface PendingBurst {
  /** Key of the compiled action list each shot runs. */
  actionKey: string;
  remaining: number;
  interval: number;
  timer: number;
  /** Which shot of the burst the next one is, from zero. */
  index: number;
  /** Total shots the burst started with, so sweeps know their span. */
  count: number;
  aim: 'fixed' | 'alternate' | 'sweep' | 'random';
  amplitude: number;
  scatter: number;
  aimAngle: number;
  targetX: number;
  targetY: number;
  isSuper: boolean;
  /** Damage multiplier captured when the attack was triggered. */
  damageMultiplier: number;
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
  /** Passes through bodies, damaging each of them once. */
  piercesBodies?: boolean;
  knockbackForce?: number;
  /**
   * How this projectile travels. Anything other than `straight` is steered
   * each tick by the projectile system.
   */
  motion?: 'straight' | 'curve' | 'lob' | 'bounce' | 'boomerang';
  /** Turn rate in rad/s for `curve`, signed. */
  curveRate?: number;
  /** Wall reflections left, for `bounce`. */
  bouncesLeft?: number;
  /** Distance at which a `lob` or `boomerang` turns, in pixels. */
  turnAt?: number;
  /** Close-range damage bonus: `near` at point blank, `far` at `range`. */
  falloff?: { near: number; far: number; range: number };
  /**
   * Key into the compiled kit registry for this projectile's hooks — the
   * statuses it applies and the action lists it runs on hit and at rest.
   * A key rather than the data itself, so network packets stay small and
   * both peers resolve the same static behaviour.
   */
  hooks?: string;
  /** Bodies a piercing projectile has already damaged, so it cannot hit the
   *  same target twice as it passes through. */
  hitIds?: string[];
}

/**
 * Something a brawler left on the battlefield that acts on its own.
 *
 * One entity type covers a turret, a chasing minion, a proximity mine, a
 * healing station and a projectile-blocking barrier, because mechanically they
 * differ only in how they decide to act and what they do when they act. The
 * alternative — an entity type per gadget — is the same trap the ability
 * switches were.
 */
export interface DeployedEntity {
  id: string;
  ownerId: string;
  team: number;
  /** Whose colours it wears. */
  brawlerId: BrawlerId;
  kind: DeployedKind;
  behaviour: DeployedBehaviour;
  x: number;
  y: number;
  /** Facing. A turret tracks its target; everything else keeps its spawn angle. */
  angle: number;
  radius: number;
  hp: number;
  maxHp: number;
  /** Seconds left before it packs up. */
  lifetime: number;
  /** Seconds until it may act again. */
  actTimer: number;
  /** How often it acts, in seconds. */
  interval: number;
  /** How far it looks for something to act on. */
  range: number;
  /** Movement speed, for a minion. */
  speed?: number;
  /** Registry key of the action list it runs when it acts. */
  actionKey?: string;
  /** True once it has gone off, so a mine cannot trigger twice in a tick. */
  spent?: boolean;
}

export type DeployedKind = 'turret' | 'minion' | 'mine' | 'healStation' | 'barrier';

export type DeployedBehaviour =
  /** Shoots the nearest enemy it can see. */
  | 'turret'
  /** Walks at the nearest enemy and hits whatever it reaches. */
  | 'chase'
  /** Waits, then goes off when an enemy comes close. */
  | 'proximity'
  /** Acts on its own team, on a timer, regardless of enemies. */
  | 'aura'
  /** Does nothing but stand in the way of projectiles. */
  | 'blocker';

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

/** One line of the kill feed. */
export interface KillFeedEntry {
  id: string;
  killerName: string;
  victimName: string;
  victimBrawler: BrawlerId;
  /** Match time the kill happened, so the renderer can fade it out. */
  at: number;
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
  deployables: DeployedEntity[];
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
  /** Recent kills, newest last. Capped by the engine. */
  killFeed: KillFeedEntry[];
  /**
   * Player ids in the order they were eliminated. Position in Showdown is read
   * off the end of this: the last one out placed second, and so on.
   */
  eliminationOrder: string[];
  /** Seconds remaining in the pre-match countdown; zero once play has begun. */
  introCountdown: number;
  /** The map being played, shown during the countdown. */
  mapName: string;
  /** Points per team, in modes decided by a score. Empty otherwise. */
  teamScores: number[];
  /** Score that wins outright, if the mode has one. */
  scoreLimit: number | null;
  /** Seconds left before the clock decides it, or null if there is no clock. */
  timeLeft: number | null;
  /** Knockout: which round this is, who has won how many, and how many win it. */
  round: number;
  roundWins: number[];
  roundsToWin: number | null;
  /** Hot Zone's zone, or null in every other mode. */
  zone: HotZone | null;
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
