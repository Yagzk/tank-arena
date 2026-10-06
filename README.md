# ⚡ BRAWL STARS 2D | 4-10 Kişilik Çok Oyunculu Web & Mobil Oyunu

Brawl Stars mekanikleriyle birebir tasarlanmış, **4 ila 10 oyuncu** destekleyen, devasa 2400x1800 haritada oynanan gerçek zamanlı web ve mobil uyumlu arena oyunu!

---

## 🥊 6 Orijinal Brawler ve Özel Güçleri

1. **SHELLY (Öncü Dövüşçü):** 
   - **Saldırı:** 5 saçmalı tüfek ateşi.
   - **ULTİ:** Duvarları ve çalıları paramparça eden devasa şok patlaması!
2. **COLT (Keskin Nişancı):**
   - **Saldırı:** 6 mermilik seri lazer taraması.
   - **ULTİ:** Duvarları delip geçen 12 mermilik süper yaylım ateşi!
3. **EL PRIMO (Lucha Libre Tankı):**
   - **Saldırı:** 4 hızlı ve sert yumruk (6200 Can!).
   - **ULTİ:** Duvarların üzerinden uçup hedeflenen noktaya deprem yaratarak inen Uçan Dirsek!
4. **BROCK (Roketçi):**
   - **Saldırı:** Uzun menzilli alan etkili roket.
   - **ULTİ:** Gökyüzünden 9 alev roketi yağdıran Roket Yağmuru!
5. **SPIKE (Efsanevi Kaktüs):**
   - **Saldırı:** Çarptığında 6 yöne iğne saçan kaktüs bombası.
   - **ULTİ:** Düşmanları %50 yavaşlatan ve sürekli hasar veren Diken Tarlası!
6. **LEON (Efsanevi Suikastçı):**
   - **Saldırı:** 4 döner ninja bıçağı.
   - **ULTİ:** 6 saniye boyunca rakiplere karşı **TAMAMEN GÖRÜNMEZ** olan Duman Bombası!

---

## 🎮 Oyun Mekanikleri

- **4 - 10 Oyuncu Desteği:** İster 4 kişi, ister 10 kişi oynayın. Eksik yerler akıllı AI botlarla doldurulabilir.
- **3 Cephane Barı (Ammo):** Her atış 1 cephane harcar; cephaneler otomatik olarak teker teker dolar.
- **Doğal Can Yenilenmesi:** 3 saniye boyunca çatışmadan uzak kalırsanız saniyede %13 can yenilenir.
- **Çalılar & Görünmezlik (Tall Grass):** Çalıya girdiğinizde dışarıdaki rakipler sizi göremez!
- **Güç Küpleri (🟩 Power Cubes):** Ahşap kutuları kırarak güç küpleri toplayın (+400 Can & +%10 Hasar).
- **Zehirli Gaz (Poison Smoke):** Süre geçtikçe harita kenarlarından yeşil gaz içeri doğru daralır.
- **Holografik Radar (Minimap):** Ekranın sağ üstünde haritayı, gaz sınırını ve oyuncuları gösteren canlı radar.

---

## 🏆 Oyun Modları

1. 💀 **SOLO SHOWDOWN (Hesaplaşma):** 10 Brawler, kutular, zehirli gaz ve son hayatta kalanın şampiyon olduğu Battle Royale modu!
2. 💎 **GEM GRAB (Elmas Kapmaca):** Ortadaki madenden çıkan mor elmasları toplayın. 10 elmasa ulaşan takım 15 saniyelik geri sayımı başlatır!

---

## 📱 Kontroller

* **PC (Klavye & Fare):**
  - `W, A, S, D`: Hareket
  - `Fare`: Nişan Al & Sol Tık ile Ateş Et
  - `Boşluk (Space)` veya `Sağ Tık`: **ULTİ**
  - `E`: Emoji / Pin
* **Mobil (Dokunmatik Ekran):**
  - Sol Altta: Mavi Hareket Joystick'i
  - Sağ Altta: Kırmızı Saldırı Joystick'i (Sürükleyip bırakarak ateş)
  - Sarı Kuru Kafa: **ULTİ Butonu**

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
