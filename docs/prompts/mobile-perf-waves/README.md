# Mobil mesajlaşma performansı — dalga paketi

Altı bağımsız çalıştırma promptu. Her biri temiz bir oturuma yapıştırılır, sırayla koşar.

## Sıra bağlayıcı

```
W0 → W1 → W2 → W3 → W4 → W5
```

W0 atlanamaz: ondan önceki hiçbir sayı güvenilir değil (DM açılışlarının **hiçbiri** ölçülmüyor).
W5 kanıt gelmeden başlamaz.

| Dalga                          | Konu               | Beklenen kazanım                                                      | Cihaz koşusu |
| ------------------------------ | ------------------ | --------------------------------------------------------------------- | ------------ |
| [W0](w0-olcum-onarimi.md)      | Ölçüm onarımı      | Kazanım değil — diğer beşini mümkün kılar. İlk kez DM verisi          | 1            |
| [W1](w1-istemci-sicak-yolu.md) | İstemci sıcak yolu | Cached açılış p95 461 → **150-220ms**                                 | 1            |
| [W2](w2-birikmeyi-durdur.md)   | Bellek ve iptal    | Uzun oturum retained bellek **−%20-50**; tık/prefetch çakışması biter | 1            |
| [W3](w3-dm-api-diyeti.md)      | DM GET diyeti      | Tipik **20-80ms**, tail'de daha fazla                                 | paylaşımlı   |
| [W4](w4-ack.md)                | Gönderim ack       | Ack p95 1237 → **250-450ms**                                          | 1            |
| [W5](w5-railway-kanit.md)      | Railway kapasite   | Kanıta bağlı; körlemesine çoğaltma yok                                | 1            |

## Ölçülen taban (2026-07-31, release APK, uat)

| Metrik              | p95  | Bütçe | Durum   |
| ------------------- | ---- | ----- | ------- |
| `startup`           | 455  | 2500  | ✅      |
| `resume`            | 302  | 700   | ✅      |
| `send-echo`         | 42.9 | 50    | ✅      |
| `chat-open-cached`  | 461  | 100   | ❌ 4.6x |
| `chat-open-network` | 1347 | 500   | ❌ 2.7x |
| `send-ack`          | 1237 | 300   | ❌ 4.1x |

Açılış kırılımı: `bundle 76 → cache-hydrated 154 → auth 168 → first-frame 195 → navigator-ready 296 → content 420 → interactive 631`.

Sohbet açılış fazları (dokunuştan): `navigated 106 · mounted 104 · content 461` → **mount sonrası ~337ms**.

Railway edge (24s): Channel GET p50 64 / p95 391 · DM GET p50 72 / p95 337 · Channel POST p50 103 / p95 394. GET payload p50 ~21KB. Web: 1 replica, 1 CPU, 2GB, `europe-west4` (Amsterdam). RTT İstanbul → 127-198ms TTFB. Sunucu ve DB aynı bölgede, sleep kapalı.

## Yapılmayacaklar (her dalgada geçerli)

Framework değişimi · mikroservis bölme · ölçmeden raw SQL · auth cache ile güvenlik gevşetme · rastgele index · Amsterdam'dan uzak multi-region · startup iyiyken `inlineRequires` · ölçmeden `drawDistance` oynatma.

## Kabul protokolü (W1'den sonra her dalga)

Sabit release SHA, aynı cihaz ve ağ, senaryo başına **en az 30 tekrar**, her örnekte sıra numarası. n=5-7 ile p95 konuşmak istatistik değil, en kötü tek örnektir.
