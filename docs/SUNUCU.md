# Oyun Sunucusu

Odalar normalde **oyuncunun kendi tarayıcısında** kurulur (P2P): odayı kuran kişinin
bilgisayarı maçı çalıştırır, herkesin trafiğini taşır. Bu yüzden lag'i belirleyen
şey o kişinin ev internetidir, sizin sunucunuzun hattı değil. Bu sunucu odayı ve
maçı **sizin makinenizde** çalıştırır; herkes (odayı kuran dahil) ona bağlanır.

## Çalıştırma

Node 20+ gerekir.

```bash
npm ci
npm run server
```

Ayarlar ortam değişkenleriyle:

| Değişken          | Anlamı                                          | Varsayılan |
|-------------------|-------------------------------------------------|------------|
| `PORT`            | Dinlenen port                                   | `8787`     |
| `HOST`            | Bağlanılan adres                                | `0.0.0.0`  |
| `ALLOWED_ORIGINS` | İzinli siteler, virgülle (boş = herkese açık)   | boş        |
| `MAX_ROOMS`       | Aynı anda tutulan oda sayısı                    | `200`      |

Üretimde `ALLOWED_ORIGINS`'i kendi sitenize kısıtlayın:

```bash
PORT=8787 ALLOWED_ORIGINS=https://oyun.siteniz.com npm run server
```

Her dakika log'a bir durum satırı yazar (`rooms`, `matches`, `connections`,
`statesSkipped`). `statesSkipped` büyüyorsa bir oyuncunun bağlantısı yetişemiyor
demektir — sunucu o oyuncuya eski paketleri kuyruğa dizmek yerine atlıyor.

### Sürekli çalışması için (systemd)

```ini
# /etc/systemd/system/nova-arena.service
[Unit]
Description=Nova Arena oyun sunucusu
After=network.target

[Service]
WorkingDirectory=/opt/nova-arena
Environment=PORT=8787
Environment=ALLOWED_ORIGINS=https://oyun.siteniz.com
ExecStart=/usr/bin/npm run server
Restart=always
User=nova

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now nova-arena
```

## Güvenli bağlantı (wss) — burası önemli

Siteniz `https://` ile açılıyorsa tarayıcı **yalnızca `wss://`** adreslerine bağlanır;
düz `ws://` "karışık içerik" diye engellenir. Yani sunucunun önüne TLS koymanız
gerekir. En kolayı bir ters vekil:

**Caddy** (sertifikayı kendisi alır):

```
oyun.siteniz.com {
    reverse_proxy /ws* 127.0.0.1:8787
}
```

**nginx:**

```nginx
location /ws {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}
```

`proxy_read_timeout` önemli: varsayılan 60 sn'de sessiz bağlantıyı keser. Sunucu
her 15 sn'de bir kalp atışı yolluyor ama uzun bir değer yine de güvenlidir.

Vekilin arkasında **tüm bağlantılar tek IP'den** görünür (vekilin IP'si); sunucunun
IP başına bağlantı sınırı (30) bu durumda herkesi birlikte sayar. Gerçek
kullanıcı IP'sine göre sınır istiyorsanız bu bir sonraki iş.

## İstemciyi sunucuya yöneltme

İki yol:

1. **Derleme sırasında** (kalıcı):
   ```bash
   VITE_GAME_SERVER=wss://oyun.siteniz.com/ws npm run build
   ```
2. **Adres çubuğunda** (tek oturum, deneme için):
   `https://oyun.siteniz.com/?server=oyun.siteniz.com/ws`

Hiçbiri verilmezse oyun eskisi gibi P2P çalışır. Lobi hangi modda olduğunu
"Oda sunucuda kurulur" / "Oda senin bilgisayarında kurulur" rozetiyle gösterir.

## Kapasite (tahmin — yük testi yapılmadı)

- **Bant genişliği:** 10 oyunculu bir oda, oyuncu başına saniyede ~30 paket ×
  birkaç KB gönderir; oda başına çıkış yaklaşık 1–1,5 MB/s. 1 Gbit hat için bu,
  yüzlerce odalık bir üst sınır demek; pratikte işlemciye dayanırsınız.
- **İşlemci:** bir maç ölçümde tick başına ~0,2 ms harcıyor (saniyede 60 tick →
  oda başına çekirdeğin yaklaşık %1'i). Tek süreç tek çekirdek kullanır; onlarca
  oda rahat olmalı. Gerçek sayıyı yük testi verecek.
- Sunucu **tek süreç, tek makine**. Yeniden başlatınca odalar kaybolur; hesap veya
  kalıcılık yok.

## Bilinen sınırlar

- Kimlik doğrulama yok; oda kodunu bilen herkes girer.
- İstemci tarafı tahmin (client-side prediction) henüz yok: kendi hareketin
  sunucuya gidip gelen süre + 110 ms enterpolasyon kadar gecikmeli görünür.
  Sunucu bu gecikmeyi *tutarlı ve düşük* yapar, ortadan kaldırmaz.
- Bağlantı koparsa otomatik yeniden bağlanma yok; oyuncu odadan düşer ve
  karakteri bota devredilir.
