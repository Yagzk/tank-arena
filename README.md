# ⚡ NOVA ARENA | 4-10 Kişilik Çok Oyunculu Web & Mobil Arena

Tepeden bakışlı, gerçek zamanlı, 4 ila 10 oyuncu destekleyen web ve mobil uyumlu arena oyunu. Tüm karakterler, görseller ve yetenek isimleri özgündür; oyunda hiçbir üçüncü taraf varlığı kullanılmaz — karakter sanatı tamamen kod içinde vektör olarak üretilir.

---

## 🥊 Kadro

| Karakter | Rol | Saldırı | Şarjlı Yetenek |
|---|---|---|---|
| **MİRA** | Yakın mesafe avcısı | 5 saçmalı hurda tüfeği | **Yıkım Salvosu** — duvarları söker, savurur, sersemletir |
| **RIVET** | Nişancı | 6 mermilik seri atış | **Delici Yaylım** — engellerden geçen 12 mermi |
| **BOULDER** | Tank | 4 seri yumruk (6000 Can) | **Göktaşı İnişi** — duvar aşırı sıçrayış ve sarsıntı |
| **FUSE** | Topçu | Alan hasarlı roket | **Roket Yağmuru** — 9 roket + alev havuzları |
| **THORN** | Alan kontrolü | 6 yöne diken saçan tohum bombası | **Diken Tarlası** — %50 yavaşlatır, sürekli hasar |
| **WISP** | Suikastçı | 4 dönen bıçak | **Sis Perdesi** — 6 sn görünmezlik, hız ve can yenilenmesi |

Her karakterin ayrıca bir **aksesuarı** (3 kullanım) ve bir **yıldız gücü** (pasif) vardır.

---

## 🎮 Oyun Mekanikleri

- **4 - 10 Oyuncu:** Eksik yerler AI botlarla doldurulabilir.
- **3 Cephane Yuvası:** Her atış bir yuva harcar; yuvalar teker teker dolar ve atışlar arasında ayrı bir bekleme süresi vardır.
- **Can Yenilenmesi:** 4 saniye çatışma dışı kalırsanız saniyede %6 can yenilenir.
- **Çalılar:** Çalıya girdiğinizde dışarıdaki rakipler sizi göremez.
- **Güç Küpleri:** Sandıkları kırarak toplayın (+400 Can & +%10 Hasar).
- **Zehirli Gaz:** Süre geçtikçe harita kenarlarından içeri doğru daralır.
- **Radar:** Sağ üstte harita, gaz sınırı ve oyuncular.

---

## 🏆 Oyun Modları

1. 💀 **HESAPLAŞMA (Showdown):** Kutular, zehirli gaz ve son hayatta kalanın kazandığı battle royale.
2. 💎 **ELMAS KAPMACA (Gem Grab):** Ortadaki madenden çıkan elmasları toplayın. 10 elmasa ulaşan takım 15 saniyelik geri sayımı başlatır.

---

## 📱 Kontroller

* **PC:** `W A S D` hareket · Fare ile nişan, sol tık ateş · `Boşluk` veya sağ tık **şarjlı yetenek** · `E` aksesuar · `Q` emoji
* **Mobil:** Sol alt hareket joystick'i · Sağ alt saldırı joystick'i (sürükle-bırak ateş) · Şarjlı yetenek ve aksesuar butonları

---

## 🧱 Mimari (Teknik)

Simülasyon, render ve ağ katmanları ayrıldı. Çekirdek `src/core/` altında, oyundan bağımsız ve tekrar kullanılabilir:

| Modül | Sorumluluk |
|---|---|
| `core/loop.ts` | **Sabit timestep** döngü (60 Hz) + render interpolasyonu. Oyun artık 60 Hz ve 144 Hz ekranda birebir aynı oynuyor; arka plana atılan sekme dünyayı ileri sarmıyor. |
| `core/collision.ts` | **Swept (sürekli) çarpışma**. Hareketli çember ↔ AABB / çember / köşe. Mermi ne kadar hızlı olursa olsun hedefin veya duvarın içinden geçemiyor. |
| `core/spatialHash.ts` | Uniform grid broadphase. Çarpışma sorguları yalnızca ilgili hücreleri geziyor. |
| `core/rng.ts` | Tohumlu PRNG (mulberry32). Simülasyon `Math.random()` çağırmıyor; aynı tohum + aynı input = aynı maç. |
| `core/math.ts` | Tahsisat üretmeyen vektör/açı/easing yardımcıları. |

### Bu sürümde düzeltilen davranışlar

- **Mermi tünellemesi:** `v * dt` ile zıplayıp sonra kesişim arayan eski yöntem, 800 px/s mermilerin 22 px yarıçaplı gövdelerin ve 35 px duvarların içinden geçmesine yol açıyordu.
- **Seri atışta nişan kilidi:** `burstAimAngle` yazılıp hiç okunmuyordu; Colt ve Leon'un serisi fareyle birlikte süpürüyordu.
- **Kendine hasar:** El Primo süper inişinde kendine 1300, Brock gadget'ında kendine patlama hasarı veriyordu. Spike kendi Diken Tarlasında, Brock kendi alevinde yanıyordu.
- **Yanma hasarı öldüremiyordu** (`Math.max(1, ...)`).
- **Gem Grab spawn/takım uyuşmazlığı:** oyuncuların yarısı rakip üste doğuyordu.
- **Süper şarjı** vuruş başına sabit yerine **verilen hasara oranlı**: Shelly'nin tek tetik çekişi süperin %52'sini doldurmuyor artık.
- **Can yenilenmesi** %13/sn → %6/sn (4 sn sonra).
- **Cephane** kesirli sayaç yerine slot slot doluyor; atışlar arasında ayrı bir bekleme süresi var.
- **Hareket** ani hız yerine ivme/yavaşlama eğrisiyle; duvar boyunca kayma eksen bazında çözülüyor.
- **Kamera** sanal çözünürlükle ölçekleniyor ve `devicePixelRatio` uygulanıyor — her cihaz arenanın benzer bir dilimini net görüyor.
- **Botlar** görüş hattı olmadan ateş etmiyor.
- React artık saniyede 60 kez değil, HUD için ~12 kez render ediliyor; canvas motoru doğrudan okuyor.
