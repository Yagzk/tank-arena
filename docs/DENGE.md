# Denge ve Brawl Stars uyumu

Bu belge iki soruya cevap verir: karakterler birbirine göre dengeli mi, ve oyun
Brawl Stars ile mekanik olarak ne kadar aynı. İkisinde de neyin ölçüldüğünü,
neyin ölçülemediğini açıkça yazıyorum.

## 1. Denge

### Nasıl ölçülüyor

`npm run balance` her karakteri her karakterle bire bir (açık zeminde) ve rastgele
3'e 3 maçlarda (gerçek haritalarda, `wipeout`) botlarla oynatır, kazanma oranını yazar.
Bire bir sonuç %30, takım sonucu %70 ağırlıkla birleştirilir; çünkü destek ve
lob atan karakterler açık alanda botlara karşı doğru ölçülemez.

Her karakterin tek bir **denge düğmesi** vardır: kitindeki `traits.damageScale`.
Karakterin verdiği bütün hasar (mermi, patlama, taret, mayın, zincir) bununla
çarpılır. Canı `types/brawl.ts` içindeki `maxHp`. Yeni bir denge turu bu iki sayıyı
değiştirmekten ibarettir.

### Sonuç

İlk ölçümde kazanma oranı sapması (%50'den standart sapma) **%20,6** idi:
Mıknatıs %87, Boulder, Rivet ve Fuse %60+; Sis, Tiktak, Fisilti, Filiz %30'un altında.
Otomatik ayar ve elle düzeltmeden sonra **%4** (ölçüm gürültüsünün olduğu yer).

Yapılan elle düzeltmeler (ayarın tek başına çözemediği şeyler):

- **Mıknatıs**: yansıtma botlar karşısında ölçüsüzdü. Süper 3,2 → 2,2 sn,
  yansıyan mermi hasarının %60'ını taşıyor, gadget artık yansıtmıyor (sadece kalkan).
- **Işınlanma sonrası aynı listedeki patlama** eski konumda patlıyordu (Gölge'nin
  süperi hiç vurmuyordu). `followBody` ile düzeltildi.
- Yeni 12 karakterin ilk sayıları eski altı karaktere göre 3–4 kat zayıftı;
  `damageScale` 1,0–2,0 arasına çıktı. Üst sınır 2,0 — daha fazlası, sayıyla değil
  tasarımla çözülmeli demektir.

### Bilinen zayıf noktalar

| Karakter | Durum | Neden |
|---|---|---|
| Fisilti, Devir | takımda %37–38 | Atılış/kombo botların elinde iyi kullanılmıyor; insan elinde daha iyi olması beklenir |
| Lumen | birebirde %14, takımda %65 | Bekleyip vuran nişancıyı bot açık alanda ıskalatıyor; takımda siperden vuruyor |
| Boulder | birebirde %83, takımda %36 | Tank: tek hedefe güçlü, kalabalıkta zayıf. Beklenen bir arketip farkı |
| Mira | takımda %39 | Yakın mesafe saçmacı, bot takımlarında yakına giremiyor |

Dürüst sınır: bu bot dengesidir. Botlar siper kullanmıyor, süper zamanlamıyor,
birbirini ezmiyor. "Hiç kimse umutsuz değil, hiç kimse ezici değil" demenin
iyi bir ölçüsüdür; sıralama listesi değildir. Gerçek denge için insan maçlarının
verisi gerekir (kupa/kazanma oranı toplama Faz 7'de).

## 2. Brawl Stars ile uyum

Karakterler **orijinaldir** — adları, sayıları ve çizimleri Brawl Stars'ınki değil
(bilerek: telifli isim ve görsel kopyalanmıyor). Bu yüzden "karakterler aynı mı"
sorusunun cevabı hayır; aynı olması gereken şey **sistemler** ve burada uyum şöyle.

Kaynak notu: kuralları internetten araştırdım (hayran wikileri, rehberler).
Resmi sayfalara erişemedim; bazı sayılar 2017–2021 tarihli ve değişmiş olabilir.
Doğrulayamadıklarımı "?" ile işaretledim.

### Aynı çalışanlar

| Sistem | Bizde | Brawl Stars |
|---|---|---|
| Cephane | 3 yuva (kitte değişir), yuva yuva dolar | aynı |
| Süper | verilen hasarla dolar, karakter başına vuruş sayısı | aynı |
| Çalılık | içindekini gizler, saldırınca/hasar alınca görünür, 2 kare görüş | aynı (2 kare) |
| Hesaplaşma | güç küpleri, zehirli gaz, canlanma yok | aynı |
| İkili Hesaplaşma | eşin 15 sn sonra, diğeri hayattaysa yanında döner | aynı |
| Elmas Kapmaca | 10 elmas, 15 sn geri sayım, ölünce elmas düşer, 3 sn canlanma | aynı |
| Brawl Ball | 2 gol, taşıyan atakları kaybeder (vuruş olur), süper/gadget kapalı, sersemleme/ölüm/itme topu düşürür, beraberlikte engeller kalkıp altın gol | aynı |
| Nakavt | canlanma yok, 2 tur kazanan | aynı |
| Soygun | kasa, kırılan kazanır, süre bitince kasaya daha çok hasar veren | aynı |
| Ödül Avı | öldürmek kurbanın yıldızını kazandırır, tavan 7, ölünce sıfırlanır | büyük ölçüde aynı |
| Dokunarak otomatik nişan | en yakın düşmana, takım arkadaşı hariç | aynı |

### Farklı olanlar

| Konu | Bizde | Brawl Stars | Düzeltilebilir mi |
|---|---|---|---|
| Karakterler | 26 orijinal | yüzün üstünde, telifli | Kasıtlı fark |
| Sıcak Bölge | tek bölge, saniyede 1 puan, 100 puan | birden çok bölge, yüzde ile | Evet — çoklu bölge haritası |
| Ödül Avı | öldürenin başı +1; ortada bedava yıldız yok; 2:00 | bazı kaynaklar "kurbandan 1 fazla" ve ortada yıldız diyor; süre 2:30–3:00 ? | Kaynaklar çelişiyor |
| Gadget | 3 hak, 4,5 sn bekleme, tek gadget | seçilebilir 2 gadget, 3 hak | Faz 3 |
| Yıldız gücü | sadece metin, çalışmıyor | seçilir, işe yarar | Faz 3 |
| Güç seviyeleri | yok | 1–11 | Faz 3 |
| Can yenilenmesi | 4 sn sonra saniyede %6 | var, sayısı doğrulanamadı ? | — |
| Düello modu | yok | var | Sırada |
| Kupa / meta | yok | var | Faz 7 |

### En çok işe yarayacak bir sonraki adım

Faz 3 (seçilebilir gadget + çalışan yıldız gücü + güç seviyeleri): oyunun
"aynı zevki" vermesinde karakter sayısından çok bu eksik.
