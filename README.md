# ⚡ TANK ARENA 2D | 4-Player P2P Online Game

Vercel üzerinde **0 TL maliyetle** ve hiçbir harici sunucuya ihtiyaç duymadan hostlayabileceğiniz, 4 kişilik gerçek zamanlı web tabanlı tank savaşı oyunu!

---

## 🎮 Özellikler

- **P2P Çok Oyunculu (WebRTC / PeerJS):** Oyuncular doğrudan birbirlerine bağlanır. Sunucu gerekmez, sıfır gecikme!
- **Mermi Sekmesi Mekaniği:** Mermiler duvarlardan 2 kez seker; köşelerin arkasından taktiksel atışlar yapabilirsiniz.
- **Taktiksel Mayınlar:** Sağ tık veya `E` tuşu ile rakiplerin geçtiği yollara mayın döşeyebilirsiniz.
- **Kırılabilir Kutular & Güçlendirmeler:**
  - 🛡️ **Enerji Kalkanı:** 1 ölümcül vuruşu emer.
  - 🚀 **Turbo Hız:** %50 hareket hızı artışı.
  - 💥 **Üçlü Atış:** 3 mermiyi aynı anda fırlatır.
  - ⚡ **Lazer Raygun:** Delici ve ışık hızında atış.
  - 🔋 **Hızlı Şarjör:** Anında tam cephane.
- **Yapay Zeka (AI Botlar):** 4 kişi toplanana kadar boş slotlara bot ekleyebilir ya da tek başınıza antrenman yapabilirsiniz.
- **Dahili Ses Sentezleyici:** Web Audio API ile tamamen kod üzerinden üretilen patlama, mermi, sekme ve zafer sesleri (harici ses dosyası yükleme derdi yok).
- **Tek Tıkla Davet:** Oda kurduğunuzda davet linkini kopyalayarak arkadaşınıza gönderebilirsiniz (`?room=XXXX`).

---

## 🕹️ Kontroller

| Tuş | Eylem |
|---|---|
| `W, A, S, D` veya `Yön Tuşları` | Tankı ileri/geri sür ve döndür |
| `Fare` | Namluyu hedefe çevir |
| `Sol Tık` veya `Boşluk (Space)` | Ateş Et |
| `Sağ Tık` veya `E` / `Q` / `Shift` | Mayın Döşe |

---

## 🚀 Yerel Olarak Çalıştırma

```bash
# Proje dizinine gidin
cd tank-arena

# Bağımlılıkları yükleyin (zaten yüklüyse gerekmez)
npm install

# Geliştirici sunucusunu başlatın
npm run dev
```

Tarayıcınızda `http://localhost:5173` adresine giderek hemen test edebilirsiniz!

---

## 🌐 Vercel'e Nasıl Yüklenir (Deploy)?

### Yöntem 1: Vercel CLI ile 1 Dakikada Dağıtım (En Hızlı)
```bash
# Vercel CLI'ı doğrudan çalıştırın
npx vercel
```
Ekrana gelen sorulara `Enter` tuşuna basarak devam edin. Birkaç saniye içinde oyununuz canlı linke (`https://tank-arena-xxx.vercel.app`) kavuşacaktır!

### Yöntem 2: GitHub ile Dağıtım (Otomatik Güncellemeler İçin)
1. Projeyi bir GitHub reposuna yükleyin:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/KULLANICI_ADINIZ/tank-arena.git
   git push -u origin main
   ```
2. [vercel.com](https://vercel.com) adresine gidin.
3. **"Add New Project"** butonuna tıklayın ve GitHub reponuzu seçin.
4. **Framework Preset:** `Vite` olarak otomatik algılanacaktır.
5. **Deploy** butonuna basın!
