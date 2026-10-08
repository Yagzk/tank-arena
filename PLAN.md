# NOVA ARENA — Geliştirme Planı

> Bu dosya projenin tek yol haritasıdır. Bir iş bitince kutusu işaretlenir.
> Son güncelleme: 2026-10-07 · Referans commit: `2e22edb`

---

## 0. Hedef

Brawl Stars'ın oynanış mekaniklerini **birebir** veren, web ve mobil tarayıcıda
çalışan, gerçek zamanlı çok oyunculu bir arena oyunu.

- **Mekanik hedefi:** oynarken fark hissedilmeyecek. Kontrol, tempo, vuruş hissi,
  cephane/şarj ekonomisi, mod akışı, bot davranışı — hepsi birebir.
- **Kimlik:** karakter isimleri, çizimleri ve yetenek adları bize ait. Kadro
  arketipleri birebir karşılıyor; sanat `src/render/characterArt.ts` içinde kod
  olarak üretiliyor, projede hiçbir üçüncü taraf varlığı yok.
- **Platform:** masaüstü ve mobil eşit derecede birinci sınıf. Oyuncu ikisinde de
  oynuyor; hiçbiri "öteki platform" değil.

---

## 1. Nerede duruyoruz

~14.300 satır TypeScript, 164 test, 11 test dosyası. Çalışan: Hesaplaşma ve Elmas
Kapmaca modları, 6 karakter, botlar, P2P çok oyunculu, masaüstü + dokunmatik
kontroller.

**Biten altyapı**

| Modül | İş |
|---|---|
| `sim/kits/` | Yetenekler veri: 6 kit, şema, doğrulayıcı, derleyici |
| `sim/abilities.ts` | Kit yorumlayıcısı — switch yalnızca eylem türü üzerinde |
| `sim/effects/` | 14 efekt ilkeli, simülasyonun tüm sonuç sözlüğü |
| `sim/entity.ts` | Tek varlık fabrikası + canlanma |
| `sim/systems/deployables.ts` | Taret/minyon/mayın/istasyon/bariyer, tek varlık beş karar kuralı |
| `maps/` | Tile tabanlı harita formatı, doğrulayıcı, 10 haritalık havuz |
| `core/loop.ts` | Sabit timestep, rAF'tan ayrık simülasyon, `planSteps` politikası |
| `core/collision.ts` | Swept (sürekli) çarpışma, görüş hattı |
| `core/spatialHash.ts` | Uniform grid broadphase |
| `core/navGrid.ts` | Akış alanı yol bulma |
| `core/rng.ts` | Tohumlu PRNG — simülasyon determinist |
| `core/profiler.ts` | F3 tanılama katmanı |
| `render/characterArt.ts` | Prosedürel tepeden görünüm karakterler |
| `input/touchControls.ts` | Nişan al-bırak twin-stick |
| `input/inputMode.ts` | Dinamik girdi türü algılama |
| `net/interpolation.ts` | İstemci interpolasyonu |

**Bilinen açıklar** (detayı aşağıdaki fazlarda)

- Ses katmanı ince sentez.
- Motor tek dosya (1552 satır) — sistemlere bölünmesi Faz 0.4.
- İlerleme/meta sistemi yok.

---

## 2. Mimari ilkeler

Bunlar tartışmaya kapalı; her yeni kod bunlara uyar.

1. **Simülasyon determinist.** `Math.random()` yasak, `Rng` kullanılır. Sabit
   timestep dışında ilerleme yok. Testle korunuyor.
2. **Simülasyon render'dan ayrı.** Motor React'i, canvas'ı, DOM'u bilmez.
3. **Yetenekler veridir, kod değil.** (Faz 0)
4. **Sıcak döngüde tahsisat yok.** Çarpışma sorguları, sweep sonuçları, grid
   tamponları yeniden kullanılır.
5. **Her yeni mekanik testle gelir.** Özellikle çarpışma, hasar ve mod kuralları.
6. **Her iş iki platformda da doğrulanır.** Masaüstü ve 375px genişlik.

---

## 3. Öncelik sırası (özet)

```
FAZ 0  Yetenek mimarisi          ← buradan başlanmazsa gerisi tıkanır
FAZ 1  Canlanma + motor ilkelleri
FAZ 2  Kadro 6 → 24
FAZ 3  Karakter derinliği (gadget/yıldız gücü/güç seviyesi)
FAZ 4  Modlar
FAZ 5  Haritalar
FAZ 6  Sunum (his, ses, animasyon, UI)
FAZ 7  Meta ve ilerleme
FAZ 8  Ağ ve altyapı
FAZ 9  Mobil cila
```

---

# FAZ 0 — Yetenek mimarisi

**Neden önce bu:** 6 karakter = 3 `switch` × 6 dal. 24 karakter + her birine 2
gadget ve 2 yıldız gücü = 70'ten fazla dal ve 96 ek yetenek. Mevcut yapıda
yazılamaz. Yetenekleri veriye çevirince yeni karakter yeni **kod** değil, yeni
**JSON** olur.

### 0.1 Efekt ilkel kütüphanesi
- [x] `src/sim/effects/` — her ilkel ayrı dosya, hepsi aynı arayüz
- [x] `damage`, `areaDamage`, `heal`, `knockback`, `pull`, `applyStatus`,
      `spawnProjectile`, `spawnHazard`, `spawnEntity`, `teleport`, `dash`,
      `shield`, `chargeSuper`, `restoreAmmo`
- [x] Her ilkel saf: dünya durumu + parametre → mutasyon, dönüş değeri yok
- [x] `src/sim/world.ts` — ilkellerin dokunmasına izin verilen tek yüzey;
      motor, React ve canvas efektlerden tamamen gizli

### 0.2 Kit şeması
- [x] `src/sim/kits/schema.ts` — `Kit`, `AbilitySpec`, `AbilityAction`,
      `ProjectileSpec`, `StatusSpec`, `PassiveSpec`, `KitTraits`
- [x] Teslim biçimleri: `single` · `spread` · `radial` · `burst` (aim kuralı:
      fixed/alternate/sweep/random) · `lob` · `bounce` · `boomerang` · `curve`
- [ ] Kalan teslim biçimleri: `beam` · `melee` · `charged` (Faz 1.2)
- [x] Şema doğrulayıcı — bozuk kit **açılışta** hata veriyor, maçta değil
      (`validateKit`, 11 test)

### 0.3 Taşıma
- [x] Mevcut 6 karakter `src/sim/kits/*.ts` dosyalarına taşındı
- [x] `executeAttack` / `executeSuper` / `executeGadget` switch'leri silindi —
      motorda **0 karakter dalı** kaldı (1957 → 1552 satır)
- [x] Yorumlayıcı: `src/sim/abilities.ts`, switch yalnızca *eylem türü* üzerinde
- [x] Yıldız güçleri ve pasifler de veriye taşındı (`PassiveSpec`, `KitTraits`) —
      hareket kodunun ortasındaki `brawlerId === '...'` blokları gitti
- [x] Determinizm testi geçiyor (aynı tohum + aynı input = aynı dünya)

**Taşımada düzeltilen iki hata** (birebir kopyalamak yerine):
- Roketin alan hasarı artık doğrudan vurduğu bedeni ikinci kez vurmuyor
  (direkt isabet 2720 değil 1360).
- Hedef dostluğu tek kural oldu; çağrılan kopya artık sahibinin hedefi değil.

### 0.4 Motoru bölme — **sıradaki iş**
- [ ] `brawlEngine.ts` (1552 satır) → `sim/systems/` altında sistemlere:
      `movement`, `combat`, `projectiles`, `hazards`, `pickups`, `modes/`
- [ ] `SimContext`: sistemlerin ihtiyaç duyduğu dahili yüzey (broadphase,
      navGrid, sweep tamponu) — `SimWorld`'ün üstüne
- [ ] Motor sınıfı sadece sistemleri sırayla çağırır

**Bitti sayılma ölçütü:** yeni bir karakter eklemek için tek bir `.ts` veri
dosyası yazmak yetiyor, hiçbir `switch`'e dokunulmuyor.

---

# FAZ 1 — Canlanma ve motor ilkelleri

## 1.1 Canlanma sistemi — **bitti**

- [x] `BrawlerEntity.respawnTimer`
- [x] Mod başına kural (`MODE_RULES`): Hesaplaşma'da canlanma yok; Elmas
      Kapmaca 3 sn. Yeni modlar bu tabloya bir satır ekleyecek.
- [x] Takım üssünde doğma (`spawnX`/`spawnY` maç boyunca sabit)
- [x] 1.5 sn dokunulmazlık — üs kampı yapan rakip spawn'ı sömüremiyor
- [x] Ölüm ekranı: geri sayım + izleyici kamerası; elenmede farklı metin
- [x] Ölünce süper şarjının %25'i korunuyor
- [x] Canlanırken önceki hayatın her izi siliniyor: durumlar, momentum, kuyruk
- [x] Testler: 13 test — süre, konum, i-frame penceresi, süper korunumu,
      eleme sırasının yalnızca Hesaplaşma'da işlenmesi

## 1.2 Mermi ve saldırı teslimi

| İlkel | Durum | Açtığı karakter |
|---|---|---|
| Hızlı mermi / saçma / seri atış | ✅ | — |
| Delici mermi | ✅ | — |
| **Lob (yay)** — duvar aşıp noktaya düşer | ❌ | Molotof, Dinamit, Tiktak, Filiz |
| **Sektirme** — duvardan seker | ❌ | Karambol |
| **Bumerang** — gidip döner | ❌ | Devir |
| **Sürekli ışın** — tick hasar | ❌ | Lumen |
| **Yakın dövüş yayı** — süpürme vuruşu | ❌ | Örs, Devir |
| **Şarjlı atış** — tut/bırak | ❌ | Lumen |
| **Kombo** — 3. vuruş farklı | ❌ | Devir |
| **Zincirleme** — düşmandan düşmana | ❌ | Lumen yıldız gücü |

> Not: `bounceBulletAgainstWall` eski `physics.ts`'te yazılmıştı ama hiç
> kullanılmadı; swept çarpışmaya uyarlanarak geri getirilecek.

- [x] Lob · [x] Sektirme · [x] Bumerang · [ ] Işın · [ ] Yakın dövüş yayı
- [ ] Şarjlı atış · [ ] Kombo · [ ] Zincirleme

> Lob havadayken duvar, sandık ve bedenleri aşıyor ve nişan noktasında iniyor.
> Sektirme swept çarpışmanın verdiği yüzey normaliyle yansıyor, köşede de
> doğru. Bumerang dönüş bacağında yeniden isabet edebiliyor.

## 1.3 Hareket

- [x] Atılım'ı genel ilkel yap — momentum kanalında, yani duvarlarla normal
      çarpışıyor; duvarın içinde kalmak imkânsız
- [ ] Düşmanın içinden geçen atılım
- [x] Işınlanma (hedefin arkasına dahil)
- [x] Çekme / kanca — mesafeyle sınırlanmış itki, hedefi öteye savurmuyor
- [ ] Duvarlardan geçme
- [x] Duvar aşan sıçrama
- [x] Geri savurma

## 1.4 Konuşlandırılabilirler

- [x] Ortak `DeployedEntity` tipi: can, ömür, sahip, takım, hedefleme
- [x] Taret — gördüğünü vurur, görüş hattı gerektirir, yıkılabilir, sahibinin
      ölümünden sonra da çalışır
- [x] Peşinden koşan minyon
- [x] Yaklaşınca patlayan mayın (kurulum gecikmesi = kurulma süresi, kendi
      takımı tetiklemez)
- [x] İyileştirme istasyonu — bulunduğu yerden nabız atar, sahibi uzaklaşınca
      iyileştirmez
- [x] Mermi durduran bariyer — düşman mermisini yer, hasar almaz
- [ ] Geçici duvar inşası (duvarlara ömür alanı + navGrid tetiklemesi gerek)

> Beş davranış tek varlık üzerinde: `turret` · `chase` · `proximity` · `aura` ·
> `blocker`. Ne yaptıkları kitten gelen eylem listesi, yani bolt atan taret ile
> iyileştiren taret aynı kod, farklı veri.

## 1.5 Durum etkileri

- [x] Yavaşlatma · [x] Sersemletme · [x] Yanma · [x] Hız artışı
- [x] Kalkan — tek hasar hunisinden geçiyor: mermi, yangın, gaz hepsi
- [x] Dokunulmazlık (i-frame)
- [x] Susturma (süper kullanamaz)
- [x] Köklenme (hareket edemez, ateş eder)
- [x] Görüş açma (çalıdakini ifşa)
- [ ] Yansıtma / soğurma
- [x] Ortak durum yığını: `applyStatus` tek eşleme noktası, `tickStatuses` tek
      sayaç noktası, yenileme kuralı "uzun olan kazanır". Nesne listesi değil
      sabit alanlar — sıcak döngüde tahsisat yok, pakette düz sayı.

## 1.6 Kaynak mekanikleri

- [x] Karakter başına cephane sayısı — kitte `maxAmmo`, doğrulayıcı 1..6 arası
      zorunlu tutuyor (şu an hepsi 3, artık karakter başına değiştirilebilir)
- [ ] Şarj gerektirmeyen, bekleme süreli süper
- [ ] İyileştirme ve asistle süper doldurma
- [ ] İsabette cephane dolduran saldırılar
- [ ] Yeniden doldurma hızı değiştiricileri

---

# FAZ 2 — Kadro: 6 → 24

Her dalga, kendi karakterlerini mümkün kılan ilkelleri **önce** getirir.

## Mevcut (6)

| Karakter | Rol |
|---|---|
| MİRA | Yakın mesafe saçmacı |
| RIVET | Seri atışlı nişancı |
| BOULDER | Tank |
| FUSE | Topçu |
| THORN | Alan kontrolü |
| WISP | Suikastçı |

## Dalga 1 — Lob, taret, iyileştirme, kalkan → kadro 10 · **bitti**

- [x] **MOLOTOF** · Alan reddi · Duvar aşıran şişe, indiği yeri tutuşturur ·
      Süper: 8 sn yanan geniş alev gölü · Gadget: ateş çemberi · 2 cephane
- [x] **USTABAŞI** · Konuşlandırıcı · 7 parça geniş saçma · Süper: otomatik
      taret (2400 can, 24 sn) · Gadget: yakınlık mayını
- [x] **NAĞME** · Destek · İçinden geçen geniş dalga · Süper: 320 yarıçapta
      takıma 2600 can · Gadget: şifa istasyonu
- [x] **ZIRH** · Tank · 3'lü balyoz · Süper: takıma 2600 kalkan · Gadget:
      savuran sarsıntı + kendine kalkan · Hasar aldıkça şarj

## Dalga 2 — Sektirme, delen atılım, çekme, köklenme → kadro 14

- [ ] **KARAMBOL** · Nişancı · Duvardan seken mermiler · Süper: uzun sekme seli
- [ ] **FISILTI** · Suikastçı · Kısa yay vuruşu · Süper: içinden geçen atılım, isabette cephane
- [ ] **ÇENGEL** · Kontrol · Tek hedefli atış · Süper: düşmanı çeker + sersemletir
- [ ] **BUZ** · Kontrol · Yavaşlatan atış · Süper: kökleyen buz alanı

## Dalga 3 — Minyon, bariyer, duvar inşası, ifşa → kadro 18

- [ ] **BEKÇİ** · Konuşlandırıcı · Çift atış · Süper: peşinden koşan yaratık
- [ ] **KALKAN** · Destek · Orta menzil · Süper: mermi durduran bariyer
- [ ] **FİLİZ** · Kontrol · Lob eden tohum · Süper: geçici duvar örer
- [ ] **SİS** · Keşif · Hızlı atış · Süper: ifşa + susturma

## Dalga 4 — Şarjlı atış, ışın, yakın dövüş yayı, ışınlanma → kadro 22

- [ ] **LUMEN** · Keskin nişancı · Şarjlı delici ışın · Süper: zincirleme hüzme
- [ ] **ÖRS** · Tank · Yakın dövüş süpürme · Süper: sersemleten koçbaşı hücumu
- [ ] **DEVİR** · Dövüşçü · 3'lü kombo + bumerang · Süper: can çalan girdap
- [ ] **GÖLGE** · Suikastçı · Çift bıçak · Süper: hedefin arkasına ışınlanma

## Dalga 5 — Arketip tamamlama → kadro 24

- [ ] **TİKTAK** · Lob eden yakınlık mayınları
- [ ] **PANSUMAN** · İyileştirme istasyonu + kalkan
- [ ] **DİNAMİT** · Çift lob, duvar yıkma
- [ ] **MIKNATIS** · Mermi soğurma / yansıtma

### Her karakter için bitti sayılma ölçütü
- [x] Kit verisi + görsel stil (`characterStyles.ts`) + silüet ayrımı —
      4 yeni silah (şişe, çivi tabancası, rezonatör, balyoz) ve 2 yeni başlık
- [x] Bot davranış profili **kitte**: `BotProfile` — menzil tercihi, süper
      bandı, gadget koşulu, duvar aşan saldırı işareti. Botta kalan
      `brawlerId === '...'` dalı: 0 (önce 17 vardı)
- [x] Kit testi: hasar, menzil, süper etkisi
- [ ] Mobilde ve masaüstünde oynanarak doğrulama (Dalga 1 için bekliyor)

> Kadro listeleri artık `BRAWLER_IDS` üzerinden config'den türüyor. Üç ayrı
> elle yazılmış dizi vardı (lobi, bot doldurma, tek oyunculu maç) ve yeni bir
> karakter ikisinde sessizce görünmüyordu.

---

# FAZ 3 — Karakter derinliği

- [ ] **2 gadget + 2 yıldız gücü**, maç öncesi seçilebilir
      (şu an 1'er tane ve hep açık — örn. Mira'nın Sargı'sı istemsiz tetikleniyor)
- [ ] **Güç seviyesi 1-11** — can/hasar ölçekleme eğrisi
- [ ] **Dişli (gear) sistemi** — 2 slot
- [ ] **Hiper şarj**
- [ ] Lobi: kit seçim ekranı
- [ ] 24 × (2+2) = **96 ek yetenek** — Faz 0 olmadan yazılamaz

---

# FAZ 4 — Modlar

Hepsinin önkoşulu: **canlanma sistemi** (Faz 1.1).

- [x] Hesaplaşma (Showdown)
- [x] Elmas Kapmaca (Gem Grab) — canlanma gelince gerçekten oynanabilir olacak
- [ ] **Brawl Ball** — top fiziği (taşı/pas/şut/sek), kale, gol, devre
- [ ] **Bounty** — yıldız biriktirme, seri, süre sonu skor
- [ ] **Knockout** — canlanma yok, round bazlı sıfırlama, 2/3
- [ ] **Heist** — canı olan kasa, savunma/saldırı
- [ ] **Hot Zone** — bölge ele geçirme yüzdesi
- [ ] **Duo Hesaplaşma** — takım hâlinde battle royale, yoldaşı diriltme
- [ ] **Wipeout** — skorlu takım ölüm maçı
- [ ] **Duels** — 1v1, üç karakter sırayla

Her mod için: kurallar · kazanma koşulu · HUD · harita tipi · bot davranışı · test

---

# FAZ 5 — Haritalar

- [x] **Tile tabanlı harita formatı** — `src/maps/format.ts`, 40x30 ızgara,
      60 px tile. `brawlMaps.ts` silindi.
- [x] Yükleyici + derleyici — bitişik tile'lar tek dikdörtgene birleşiyor
      (tile başına bir duvar, bir bedeni aynı adımda on kez iterdi)
- [x] **Simetri garantili** — harita yarım (takım modları) veya çeyrek
      (Hesaplaşma) olarak yazılıyor, gerisi üretiliyor. Doğrulanmıyor,
      *imkânsız* hâle getiriliyor; aynalanırken doğma noktaları takım
      değiştiriyor.
- [x] Doğrulayıcı: ızgara boyutu, lejant, kapalı kenarlık, doğma sayısı ve
      denkliği, hedef erişilebilirliği, **bağlantı** (çıkılamayan üs), ve
      **siper yoğunluğu**
- [x] Harita rotasyonu — tohumdan seçiliyor, yani eşler aynı haritaya düşüyor
      ve harita ağdan gönderilmiyor
- [x] 10 harita (5 Elmas Kapmaca + 5 Hesaplaşma)
- [ ] Mod başına 8-12'ye çıkarmak (şu an 5+5)
- [ ] Harita editörü (uzun vadeli)

> **Yoğunluk kuralı neden var:** havuzun ilk hâli kenarlık hariç %14 siperdi ve
> tek uzun bir nişan hattı gibi oynanıyordu — yaklaşılacak yer yok, en uzağa
> vuran kazanıyor, oyunun geri kalanı anlamsız. Artık %26-50 arası siper ve en
> az %7 çalı zorunlu; ilk havuzun **onu da** bu kurala takıldı.

---

# FAZ 6 — Sunum

## 6.1 Vuruş hissi
- [ ] **Hitstop** — isabette 40-60 ms donma
- [x] Ekran sarsıntısı (şiddete göre ölçekli)
- [x] İsabet kıvılcımları, namlu alevi
- [x] Öldürücü vuruşta ayrı geri bildirim — "X ELENDİ" duyurusu + sarsıntı
- [x] Ekran dışı düşman göstergesi (kenarda ok) — en yakın 4, çalıdakini ele vermez
- [x] Hasar yönü göstergesi — gaz/ateşte (yönü olmayan hasar) gösterilmez
- [x] Vurulan bedenin beyaz parlaması

## 6.2 Ses — **şu an en zayıf halka**
- [ ] Her karaktere ayrı atış / isabet / süper sesi, katmanlı
- [ ] Anons sesleri ("HESAPLAŞMA!", "BAŞLA!", "MAÇIN YILDIZI")
- [ ] Lobi + mod başına müzik
- [ ] Mesafeye göre ses seviyesi, stereo konumlandırma
- [ ] Ses havuzu ve kısma (aynı ses üst üste binmesin)

## 6.3 Animasyon
- [ ] Durum makinesi: idle / koşu / atak / hasar / ölüm / zafer
- [ ] Süper kullanımında özel poz
- [ ] Emoji/pin animasyonları

## 6.4 Ekranlar
- [x] Başlangıç geri sayımı
- [x] Öldürme akışı, eleme bildirimi, izleyici kamerası
- [ ] Maç girişi — takımları/rakipleri gösteren açılış
- [x] Zafer/yenilgi ekranı — sıralama, 2 aşamalı açılış, konfeti yalnızca zaferde
- [ ] Ödül animasyonu, kupa sayacı (kupa sistemi Faz 7'ye bağlı)
- [ ] Karakter seçim karuseli
- [ ] Mod seçim ekranı

---

# FAZ 7 — Meta ve ilerleme

- [ ] Karakter başına kupa + kupa yolu
- [ ] Sezon / savaş bileti
- [ ] Para birimleri: güç puanı, altın, elmas, kredi
- [ ] Ödül kutuları
- [ ] Karakter açma
- [ ] Ustalık (mastery)
- [ ] Dereceli mod
- [ ] Kulüp + kulüp ligi
- [ ] Arkadaş listesi
- [ ] Profil, savaş günlüğü, istatistikler
- [ ] Kostüm, pin, sprey, profil ikonu
- [ ] Mağaza

---

# FAZ 8 — Ağ ve altyapı

- [x] **Delta paket** — statik geometri yalnızca değişince, brawler'lar varsayılandan
      farkıyla, sayılar tam sayıya yuvarlanmış: paket 16–20 KB → 2,4–3,8 KB
      (PeerJS'in kendi serileştiricisiyle ölçüldü). İkili çerçeve (JSON yerine)
      hâlâ yok.
- [ ] **Client-side prediction + reconciliation** (kendi karakterin için;
      interpolasyon sadece rakipleri kapsıyor)
- [ ] **Lag compensation** — isabetler sunucuda geri sarılarak doğrulanır
- [x] **Otoriter sunucu** (Node + `ws`) — `server/`, odayı ve maçı sunucuda
      çalıştırır; motor DOM'suz olduğu için aynen çalışıyor. Gelen her mesaj
      doğrulanır, hız/boyut/IP/oda sınırları var. P2P hâlâ yedek olarak duruyor.
      Kurulum: `docs/SUNUCU.md`
- [x] **Ping göstergesi** — HUD'da, hem sunucu hem P2P modunda
- [x] **Arka planda donmama** — simülasyon saati Web Worker'da; host alt-tab
      yapınca maç artık saniyede bir sıçramıyor
- [ ] **Eşleştirme** + bölge seçimi
- [ ] **Yeniden bağlanma**
- [ ] **Hesap + kalıcılık** (şu an her şey `localStorage`)
- [ ] **Anti-cheat** (otoriter sunucunun doğal sonucu)
- [ ] Sunucu tarafı replay (determinizm zaten hazır)

---

# FAZ 9 — Mobil cila

- [ ] PWA — ana ekrana ekleme, çevrimdışı kabuk
- [ ] Tam ekran + yatay/dikey kilit
- [ ] Düşük bütçeli telefonda 60 fps hedefi
- [ ] Batarya/ısınma profili
- [ ] Kontrol ayarları: joystick hassasiyeti, sabit/yüzen, sol-sağ değiştirme
- [ ] Haptic ayarı (açık/kapalı/şiddet)
- [ ] Güvenli alan (çentik) desteği

---

## Kalite eşikleri

Her faz bunları bozmadan biter:

| Ölçüt | Hedef |
|---|---|
| Kare hızı | 10 oyuncu + 200 mermide sabit 60 fps |
| Simülasyon bütçesi | Tick başına < 2 ms (F3 ile ölçülüyor) |
| Girdi gecikmesi | Yerelde girdi → görüntü < 50 ms |
| Ağ trafiği | İstemci başına < 15 KB/s |
| Determinizm | Aynı tohum + aynı input = aynı dünya (testle korunuyor) |
| Test | Her yeni mekanik testle gelir; tümü yeşil |
| Platform | Her iş masaüstünde ve 375px genişlikte doğrulanır |

---

## Açık kararlar

Teknik değil, kaynak kararı — zamanı gelince sorulacak:

1. **Ses üretimi.** Sentezle bir yere kadar gidilir. Gerçek ses kütüphanesi mi
   alınacak, yoksa sentez derinleştirilecek mi?
2. **Sunucu barındırma.** Otoriter sunucu aylık maliyet çıkarır. Ne zaman ve
   hangi ölçekte?
3. **Kadro büyüklüğü.** Plan 24 karaktere kurulu. Daha ileri gidilecek mi?

---

## Çalışma düzeni

- Her faz kendi dalında geliştirilir, bitince `main`'e birleşir.
- Her commit öncesi: `npx tsc --noEmit` · `npm test` · `npm run build`
- Her oynanış değişikliği tarayıcıda, iki ekran boyutunda da denenir.
- Haftalık kullanım limiti **%96**'ya gelince çalışma durdurulur.
