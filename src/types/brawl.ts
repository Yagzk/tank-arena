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
  | 'zirh'
  | 'karambol'
  | 'fisilti'
  | 'cengel'
  | 'buz'
  | 'bekci'
  | 'kalkan'
  | 'filiz'
  | 'sis'
  | 'lumen'
  | 'ors'
  | 'devir'
  | 'golge'
  | 'tiktak'
  | 'pansuman'
  | 'dinamit'
  | 'miknatis';

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
    maxHp: 3500,
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
    maxHp: 2250,
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
    maxHp: 5250,
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
    maxHp: 2100,
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
    maxHp: 2050,
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
    maxHp: 2800,
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
    maxHp: 3150,
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
    maxHp: 4050,
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
    maxHp: 3050,
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
    maxHp: 5500,
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
  karambol: {
    id: 'karambol',
    name: 'KARAMBOL',
    title: 'Bilardo Ustası',
    rarity: 'Kupa Yolu',
    color: '#84cc16',
    secondaryColor: '#4d7c0f',
    avatarBg: 'from-lime-500 to-green-900',
    maxHp: 3500,
    speed: 180,
    reloadTime: 1.5,
    attackCooldown: 0.5,
    acceleration: 1500,
    superHitsRequired: 3,
    range: 520,
    damagePerAttack: 520,
    superChargePerHit: 12,
    description:
      'Duvarı düşman sanır, düşmanı duvar. Mermileri kenardan seker; köşeyi dönen biri onu hiç göremeden vurulur.',
    attackName: 'Isteka Vuruşu',
    attackDesc: 'Duvardan iki kez seken tek bir top. Sekmeyi hesaplayan isabet eder.',
    superName: 'Sekme Seli',
    superDesc: 'Her yöne seken 8 top; kapalı bir odayı tamamen doldurur.',
    gadgetName: 'Hızlı Top',
    gadgetDesc: 'Kısa süre hızlanır ve bir cephane kazanır.',
    starPowerName: 'Üç Bant',
    starPowerDesc: 'Toplar bir kez daha seker.',
    projectileSpeed: 600,
    projectileCount: 1,
    spreadAngle: 0,
  },
  fisilti: {
    id: 'fisilti',
    name: 'FISILTI',
    title: 'Gölgenin Fısıltısı',
    rarity: 'Süper Ender',
    color: '#6366f1',
    secondaryColor: '#3730a3',
    avatarBg: 'from-indigo-500 to-violet-900',
    maxHp: 4000,
    speed: 205,
    reloadTime: 1.4,
    attackCooldown: 0.45,
    acceleration: 1800,
    superHitsRequired: 3.2,
    range: 200,
    damagePerAttack: 460,
    superChargePerHit: 11,
    description:
      'Önce atılır, sonra keser. Kalabalığın içinden geçip dağınık bir takımı tek hamlede parçalar.',
    attackName: 'Çifte Kesik',
    attackDesc: 'İleri sıçrayıp üç bıçaklık yakın bir yay çizer.',
    superName: 'Gölge Sıçraması',
    superDesc: 'Düşmanların içinden geçen bir atılım; yol boyunca hasar verir ve 2 cephane doldurur.',
    gadgetName: 'Sis Adımı',
    gadgetDesc: 'Kısa süre görünmez olur ve hızlanır.',
    starPowerName: 'Keskin Bıçak',
    starPowerDesc: 'Yakın vuruşlar daha çok hasar verir.',
    projectileSpeed: 520,
    projectileCount: 3,
    spreadAngle: 0.9,
  },
  cengel: {
    id: 'cengel',
    name: 'ÇENGEL',
    title: 'Zincirbaz',
    rarity: 'Ender',
    color: '#ca8a04',
    secondaryColor: '#713f12',
    avatarBg: 'from-yellow-600 to-amber-900',
    maxHp: 3400,
    speed: 175,
    reloadTime: 1.5,
    attackCooldown: 0.55,
    acceleration: 1400,
    superHitsRequired: 3,
    range: 520,
    damagePerAttack: 800,
    superChargePerHit: 15,
    description:
      'Zincirinin ucundaki kancayla kimseyi uzak tutmaz. Süperi, korunaktan çıkamayanı kendine çeker ve sersemletir.',
    attackName: 'Zincir Atışı',
    attackDesc: 'Uzun menzilli, tek hedefli ağır bir atış.',
    superName: 'Kanca',
    superDesc: 'İlk vurduğu düşmanı yanına çeker ve sersemletir; çekilenin koruması yok olur.',
    gadgetName: 'Çek Gel',
    gadgetDesc: 'Yakındaki en yakın düşmanı hemen kendine çeker.',
    starPowerName: 'Sıkı Zincir',
    starPowerDesc: 'Çekilen düşman daha uzun sersemler.',
    projectileSpeed: 620,
    projectileCount: 1,
    spreadAngle: 0,
  },
  buz: {
    id: 'buz',
    name: 'BUZ',
    title: 'Kış Bekçisi',
    rarity: 'Süper Ender',
    color: '#7dd3fc',
    secondaryColor: '#0e7490',
    avatarBg: 'from-sky-300 to-cyan-800',
    maxHp: 3500,
    speed: 170,
    reloadTime: 1.6,
    attackCooldown: 0.55,
    acceleration: 1450,
    superHitsRequired: 2.8,
    range: 440,
    damagePerAttack: 650,
    superChargePerHit: 14,
    description:
      'Her atışı yavaşlatır, süperi donduran bir alan kurar. Kaçamayan düşman, hareket edemeden vurulur.',
    attackName: 'Kırağı',
    attackDesc: 'Vurduğu düşmanı yavaşlatan bir buz parçası.',
    superName: 'Kış Çemberi',
    superDesc: 'Geniş bir alandaki herkesi 2.5 saniye yerine çiviler ve yavaşlatır.',
    gadgetName: 'Buz Zırhı',
    gadgetDesc: 'Kendine kalkan çeker ve yakındaki düşmanları yavaşlatır.',
    starPowerName: 'Kalıcı Don',
    starPowerDesc: 'Yavaşlatma daha uzun sürer.',
    projectileSpeed: 560,
    projectileCount: 1,
    spreadAngle: 0,
  },
  bekci: {
    id: 'bekci',
    name: 'BEKÇİ',
    title: 'Mahalle Bekçisi',
    rarity: 'Kupa Yolu',
    color: '#f59e0b',
    secondaryColor: '#b45309',
    avatarBg: 'from-amber-400 to-orange-800',
    maxHp: 3400,
    speed: 180,
    reloadTime: 1.5,
    attackCooldown: 0.5,
    acceleration: 1500,
    superHitsRequired: 3.0,
    range: 400,
    damagePerAttack: 420,
    superChargePerHit: 14,
    description:
      'İkili atışıyla tek hedefe yüklenir. Süperi, düşmanın peşinden koşup yanında patlayan bir köpektir.',
    attackName: 'İkiz Atış',
    attackDesc: 'Birbirine yakın iki mermi atar.',
    superName: 'Bekçi Köpeği',
    superDesc: 'En yakın düşmana koşan ve yanında patlayan bir köpek salar.',
    gadgetName: 'Düdük',
    gadgetDesc: 'Kısa süre hızlanır ve bir cephane kazanır.',
    starPowerName: 'Keskin Kulak',
    starPowerDesc: 'Köpek daha uzun yaşar.',
    projectileSpeed: 640,
    projectileCount: 2,
    spreadAngle: 0.16,
  },
  kalkan: {
    id: 'kalkan',
    name: 'KALKAN',
    title: 'Siper Ustası',
    rarity: 'Ender',
    color: '#38bdf8',
    secondaryColor: '#0369a1',
    avatarBg: 'from-sky-400 to-blue-900',
    maxHp: 4150,
    speed: 175,
    reloadTime: 1.45,
    attackCooldown: 0.55,
    acceleration: 1500,
    superHitsRequired: 3.0,
    range: 380,
    damagePerAttack: 560,
    superChargePerHit: 14,
    description:
      'Orta menzilde sağlam atış yapar. Süperi, düşman mermilerini durdurup dost mermilerini geçiren bir siper kurar.',
    attackName: 'Kalkan Darbesi',
    attackDesc: 'Dengeli, tek bir mermi.',
    superName: 'Siper Duvarı',
    superDesc: 'Düşman mermilerini durduran üç parçalı bir bariyer kurar.',
    gadgetName: 'Koruma Alanı',
    gadgetDesc: 'Yakındaki dostlara kalkan verir.',
    starPowerName: 'Sağlam Siper',
    starPowerDesc: 'Bariyer daha uzun kalır.',
    projectileSpeed: 600,
    projectileCount: 1,
    spreadAngle: 0,
  },
  filiz: {
    id: 'filiz',
    name: 'FİLİZ',
    title: 'Bahçe Büyücüsü',
    rarity: 'Süper Ender',
    color: '#4ade80',
    secondaryColor: '#15803d',
    avatarBg: 'from-green-400 to-emerald-900',
    maxHp: 3950,
    speed: 175,
    reloadTime: 1.7,
    attackCooldown: 0.6,
    acceleration: 1450,
    superHitsRequired: 2.8,
    range: 480,
    damagePerAttack: 700,
    superChargePerHit: 14,
    description:
      'Duvar aşan tohumlarla düşmanı yavaşlatır. Süperi sahaya canlı bir çit örer.',
    attackName: 'Tohum Bombası',
    attackDesc: 'Duvarların üstünden aşan, yavaşlatan bir tohum.',
    superName: 'Canlı Çit',
    superDesc: '5 parçalık, 8 saniye duran sağlam bir duvar örer.',
    gadgetName: 'Sarmaşık',
    gadgetDesc: 'Etraftakileri bir an köklendirir.',
    starPowerName: 'Derin Kök',
    starPowerDesc: 'Çit daha uzun dayanır.',
    projectileSpeed: 520,
    projectileCount: 1,
    spreadAngle: 0,
  },
  sis: {
    id: 'sis',
    name: 'SİS',
    title: 'Gözcü',
    rarity: 'Efsanevi',
    color: '#a78bfa',
    secondaryColor: '#6d28d9',
    avatarBg: 'from-violet-400 to-purple-900',
    maxHp: 3750,
    speed: 215,
    reloadTime: 1.2,
    attackCooldown: 0.4,
    acceleration: 1600,
    superHitsRequired: 3.0,
    range: 410,
    damagePerAttack: 340,
    superChargePerHit: 13,
    description:
      'Hızlı ve çevik. Süperi bir alandaki herkesi çalılıkta bile açığa çıkarır ve süperlerini susturur.',
    attackName: 'Duman Oku',
    attackDesc: 'Hızlı tek mermi.',
    superName: 'Sis Perdesi',
    superDesc: 'Geniş alandaki düşmanları 5 sn ifşa eder, 3 sn susturur.',
    gadgetName: 'İşaret Fişeği',
    gadgetDesc: 'Uzaktaki düşmanları bir an ifşa eder.',
    starPowerName: 'Keskin Göz',
    starPowerDesc: 'İfşa daha uzun sürer.',
    projectileSpeed: 760,
    projectileCount: 1,
    spreadAngle: 0,
  },
  lumen: {
    id: 'lumen',
    name: 'LUMEN',
    title: 'Işık Nişancısı',
    rarity: 'Efsanevi',
    color: '#fde047',
    secondaryColor: '#a16207',
    avatarBg: 'from-yellow-300 to-amber-800',
    maxHp: 2100,
    speed: 170,
    reloadTime: 1.8,
    attackCooldown: 0.9,
    acceleration: 1400,
    superHitsRequired: 3.0,
    range: 720,
    damagePerAttack: 1200,
    superChargePerHit: 22,
    description:
      'Bekledikçe güçlenen, her şeyi delip geçen bir ışın atar. Süperi düşmandan düşmana atlayan şimşektir.',
    attackName: 'Işın',
    attackDesc: 'Atış arası ne kadar uzunsa o kadar sert vurur; gövdeleri deler.',
    superName: 'Zincir Şimşek',
    superDesc: '5 düşmana kadar zıplayan bir şimşek.',
    gadgetName: 'Geri Sıçrama',
    gadgetDesc: 'Arkaya doğru ışınlanır.',
    starPowerName: 'Odak',
    starPowerDesc: 'Şarj daha çabuk dolar.',
    projectileSpeed: 3200,
    projectileCount: 1,
    spreadAngle: 0,
  },
  ors: {
    id: 'ors',
    name: 'ÖRS',
    title: 'Demirci',
    rarity: 'Süper Ender',
    color: '#fb7185',
    secondaryColor: '#9f1239',
    avatarBg: 'from-rose-400 to-red-900',
    maxHp: 5500,
    speed: 185,
    reloadTime: 0.9,
    attackCooldown: 0.4,
    acceleration: 1400,
    superHitsRequired: 2.6,
    range: 190,
    damagePerAttack: 520,
    superChargePerHit: 12,
    description:
      'Yakın dövüşte geniş bir süpürmeyle herkesi savurur. Süperi, çarptığı herkesi sersemleten bir hücumdur.',
    attackName: 'Süpürme',
    attackDesc: 'Geniş bir yayda, yakındaki herkese vurur ve iter.',
    superName: 'Koçbaşı Hücumu',
    superDesc: 'İleri atılır, çarptıklarını sersemletir.',
    gadgetName: 'Yer Tokmağı',
    gadgetDesc: 'Etrafındakileri savurur ve yavaşlatır.',
    starPowerName: 'Demir Deri',
    starPowerDesc: 'Daha az hasar alır.',
    projectileSpeed: 900,
    projectileCount: 6,
    spreadAngle: 1.7,
  },
  devir: {
    id: 'devir',
    name: 'DEVİR',
    title: 'Meydan Okuyucu',
    rarity: 'Ender',
    color: '#fb923c',
    secondaryColor: '#c2410c',
    avatarBg: 'from-orange-400 to-red-800',
    maxHp: 5150,
    speed: 190,
    reloadTime: 1.1,
    attackCooldown: 0.35,
    acceleration: 1550,
    superHitsRequired: 2.8,
    range: 260,
    damagePerAttack: 400,
    superChargePerHit: 14,
    description:
      'Üç vuruşluk kombo yapar, sonuncusu geri dönen bir bumerangdır. Süperi can çalan bir kasırgadır.',
    attackName: 'Kesik',
    attackDesc: 'Üçlü kombo: iki kesik ve bir bumerang.',
    superName: 'Kıyım Girdabı',
    superDesc: 'Etrafındakilere vurur, verdiği hasarın bir kısmıyla iyileşir.',
    gadgetName: 'Atılış',
    gadgetDesc: 'Kısa, hasar almayan bir atılış.',
    starPowerName: 'Ritim',
    starPowerDesc: 'Kombo penceresi genişler.',
    projectileSpeed: 760,
    projectileCount: 3,
    spreadAngle: 0.6,
  },
  golge: {
    id: 'golge',
    name: 'GÖLGE',
    title: 'Gece Yürüyen',
    rarity: 'Efsanevi',
    color: '#818cf8',
    secondaryColor: '#3730a3',
    avatarBg: 'from-indigo-400 to-slate-900',
    maxHp: 3300,
    speed: 215,
    reloadTime: 1.3,
    attackCooldown: 0.4,
    acceleration: 1600,
    superHitsRequired: 3.2,
    range: 250,
    damagePerAttack: 380,
    superChargePerHit: 14,
    description:
      'Çift bıçakla kısa menzilde savaşır. Süperiyle en yakın düşmanın arkasına ışınlanıp saplar.',
    attackName: 'İkiz Bıçak',
    attackDesc: 'İki bıçak fırlatır.',
    superName: 'Arkadan Vuruş',
    superDesc: 'Düşmanın arkasına ışınlanır, sersemletip ağır hasar verir.',
    gadgetName: 'Duman Bombası',
    gadgetDesc: 'Kısa süre görünmez olup hızlanır.',
    starPowerName: 'Sessiz Adım',
    starPowerDesc: 'Görünmezlik daha uzun sürer.',
    projectileSpeed: 780,
    projectileCount: 2,
    spreadAngle: 0.22,
  },
  tiktak: {
    id: 'tiktak',
    name: 'TİKTAK',
    title: 'Saatçi',
    rarity: 'Ender',
    color: '#fbbf24',
    secondaryColor: '#92400e',
    avatarBg: 'from-yellow-400 to-amber-900',
    maxHp: 3500,
    speed: 170,
    reloadTime: 1.6,
    attackCooldown: 0.6,
    acceleration: 1450,
    superHitsRequired: 2.8,
    range: 450,
    damagePerAttack: 560,
    superChargePerHit: 14,
    description:
      'Duvar aşan bombalar atar. Süperi sahaya, bastığı anda patlayan mayınlar eker.',
    attackName: 'Saatli Bomba',
    attackDesc: 'Düştüğü yerde patlayan bir bomba.',
    superName: 'Mayın Tarlası',
    superDesc: 'Hedef bölgeye 6 mayın saçar.',
    gadgetName: 'Ayak Altı',
    gadgetDesc: 'Bulunduğu yere mayın bırakır ve hızlanır.',
    starPowerName: 'Hassas Saat',
    starPowerDesc: 'Mayınlar daha çabuk kurulur.',
    projectileSpeed: 540,
    projectileCount: 1,
    spreadAngle: 0,
  },
  pansuman: {
    id: 'pansuman',
    name: 'PANSUMAN',
    title: 'Revir Hemşiresi',
    rarity: 'Kupa Yolu',
    color: '#86efac',
    secondaryColor: '#15803d',
    avatarBg: 'from-emerald-300 to-green-900',
    maxHp: 3600,
    speed: 175,
    reloadTime: 1.5,
    attackCooldown: 0.55,
    acceleration: 1500,
    superHitsRequired: 3.0,
    range: 400,
    damagePerAttack: 450,
    superChargePerHit: 14,
    description:
      'Sade bir atış yapar. Süperi, içindekileri hem iyileştiren hem koruyan bir revir kurar.',
    attackName: 'Şırınga',
    attackDesc: 'Tek mermi.',
    superName: 'Seyyar Revir',
    superDesc: '9 saniye boyunca yarım saniyede bir iyileştirir ve kalkan verir.',
    gadgetName: 'Pansuman',
    gadgetDesc: 'Kendini hemen iyileştirir.',
    starPowerName: 'Hızlı Müdahale',
    starPowerDesc: 'Revir daha geniş alanı kapsar.',
    projectileSpeed: 640,
    projectileCount: 1,
    spreadAngle: 0,
  },
  dinamit: {
    id: 'dinamit',
    name: 'DİNAMİT',
    title: 'Yıkımcı',
    rarity: 'Süper Ender',
    color: '#f87171',
    secondaryColor: '#b91c1c',
    avatarBg: 'from-red-400 to-rose-900',
    maxHp: 3000,
    speed: 175,
    reloadTime: 1.8,
    attackCooldown: 0.7,
    acceleration: 1450,
    superHitsRequired: 2.8,
    range: 470,
    damagePerAttack: 600,
    superChargePerHit: 12,
    description:
      'Arka arkaya iki dinamit fırlatır; patlamalar duvarları da yıkar. Süperi koca bir demettir.',
    attackName: 'Çifte Fitil',
    attackDesc: 'Kısa aralıkla iki dinamit, duvarları yıkar.',
    superName: 'Dinamit Demeti',
    superDesc: 'Bölgeye 6 dinamit yağdırır.',
    gadgetName: 'Uzun Fitil',
    gadgetDesc: 'Önünde büyük bir patlama yaratır.',
    starPowerName: 'Fazla Barut',
    starPowerDesc: 'Patlamalar daha geniş.',
    projectileSpeed: 560,
    projectileCount: 2,
    spreadAngle: 0,
  },
  miknatis: {
    id: 'miknatis',
    name: 'MIKNATIS',
    title: 'Demir Çekirdek',
    rarity: 'Efsanevi',
    color: '#7dd3fc',
    secondaryColor: '#0e7490',
    avatarBg: 'from-cyan-300 to-sky-900',
    maxHp: 3850,
    speed: 170,
    reloadTime: 1.5,
    attackCooldown: 0.55,
    acceleration: 1450,
    superHitsRequired: 3.0,
    range: 360,
    damagePerAttack: 620,
    superChargePerHit: 14,
    description:
      'Sağlam bir atış yapar. Süperi takımın üstüne mermileri sahibine geri gönderen bir yansıtma alanı serer.',
    attackName: 'Çekim Darbesi',
    attackDesc: 'İteleyen tek mermi.',
    superName: 'Yansıtma Alanı',
    superDesc: 'Yakındaki herkesin mermileri geri yansıtmasını sağlar.',
    gadgetName: 'Çekirdek Kalkanı',
    gadgetDesc: 'Kısa süre kalkan alır.',
    starPowerName: 'Güçlü Alan',
    starPowerDesc: 'Yansıtma daha uzun sürer.',
    projectileSpeed: 580,
    projectileCount: 1,
    spreadAngle: 0,
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
  | 'brawl_ball'
  | 'wipeout'
  | 'knockout'
  | 'hot_zone'
  | 'bounty'
  | 'heist';

/**
 * The ball in Brawl Ball.
 *
 * Carried, it sits at its holder's feet and goes where they go; free, it rolls,
 * slows and bounces off walls. `carrier` is who holds it, or null.
 */
export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  carrier: string | null;
}

/** Heist: a team's safe. Break the other one before yours is broken. */
export interface Safe {
  id: string;
  team: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
}

/** A goal mouth: the team that defends it, and the ground that counts as in. */
export interface GoalArea {
  /** The team this goal belongs to — the one that concedes if the ball enters. */
  team: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  /** Charged attacks: how much of the charge is built up, 0..1. */
  charge: number;
  /** Combo attacks: which hit of the chain comes next, and how long it stays live. */
  comboIndex: number;
  comboTimer: number;
  /** While above zero, enemy shots that touch this brawler are sent back. */
  reflectTimer: number;
  /** Bounty: the stars the one who downs this brawler collects. Grows with every kill, resets on death. */
  bounty: number;
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
   * Passes through other bodies while positive. A dash that shoulders its way
   * through a crowd is not an escape, it is a traffic jam.
   */
  phaseTimer: number;
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

export type DeployedKind = 'turret' | 'minion' | 'mine' | 'healStation' | 'barrier' | 'wall';

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
  | 'blocker'
  /** A solid block: stops bodies and every side's shots, and can be shot down. */
  | 'solid';

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
    | 'muzzle_flash'
    /** A glowing line from (x, y) along `angle`, `radius` long. Chains and beams. */
    | 'beam';
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
  /** Brawl Ball's ball and goals; null and empty in every other mode. */
  ball: BallState | null;
  goals: GoalArea[];
  /** The team whose goal is being celebrated right now, or null. */
  goalTeam: number | null;
  /** Heist's safes; empty in every other mode. */
  safes: Safe[];
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
