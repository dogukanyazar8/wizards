# Sunucu tipi + görünürlük — run-prompt paketi

Whispr'da sunucuları **kişisel** ve **topluluk** olarak ayırma, görünürlük açma, her sunucuya 2g profil kartı verme ve keşif/katılım akışı kurma işinin kalan bölümü.

## Dosyalar

| Dosya                          | Kapsam                                                                            | Ön koşul            |
| ------------------------------ | --------------------------------------------------------------------------------- | ------------------- |
| `00-ortak-baglam.md`           | Kurallar, doğrulanmış gerçekler, yüzey haritası. **Uygulanmaz, okunur.**          | —                   |
| `01-S1-kapanis.md`             | Presence kusurları (3 Critical + 2 Important), okuma modeli incelemesi, S1 kapısı | S1 görev 1–9 landed |
| `02-S2-sunucu-profil-karti.md` | 2g profil kartı, web + mobil                                                      | 01                  |
| `03-S3-kesif-ve-katilim.md`    | Keşif listesi, davetsiz katılım, görünürlük anahtarları                           | 02                  |
| `04-S4-topluluk-yonetimi.md`   | Terfi/indirme, rozet, öne çıkarma, admin konsolu, devredilen borçlar              | 03                  |

Sıra zorunludur. Her prompt bir öncekinin sözleşmesine dayanır.

## Nasıl koşulur

Her prompt **tek geçişte uygulanabilir bir dilim**dir. Alt görevlere bölme, görev başına ayrı ajan turu açma — önceki tur bu yüzden yavaştı.

```
1. 00-ortak-baglam.md oku
2. Prompt dosyasını oku
3. Uygula (test önce, RED kanıtı görev başına bir kez)
4. Promptun kapı komutlarını koş
5. docs/prompts/sunucu-tipi-gorunurluk/raporlar/<no>-rapor.md yaz
```

## Bu paket neden var

Önceki tur S1'in 10 görevini görev başına 3+ döngüyle (uygula → incele → düzelt) yürüttü. İnceleme dokuz gerçek kusur yakaladı — yedisi plan hatasıydı, uygulayıcı hatası değil. Yani zaman, keşfedilmesi gereken bilginin prompta yazılmamış olmasına gitti.

Bu pakette o bilgi `00`'da. Doğrulanmış gerçekler yeniden keşfedilmez; kırılgan noktalar (`route-contract.test.ts` kuralları, kapalı rate-limit union'ı, `assertSchemaBehaviorCoverage` fixture zorunluluğu, migration dizini tuzağı, üç dosyalı mobil navigasyon kaydı) önden sayılmıştır.

Ayrıca `00 §2` over-engineering yasağını somut maddelere bağlar ve her prompt kendi "Yapılmayacaklar" listesini taşır — kapsam kayması, kusurdan daha çok zaman yedi.

## Durum (2026-08-07)

S1 görev 1–9 landed ve commit'lendi. Açık:

- Task 8 presence kusurları — `01` Bölüm A–E
- Task 9 incelemesi — `01` Bölüm F
- S1 kapısı — `01` Bölüm G

Tasarım kaynağı: `design_handoff/design_handoff_whispr_hakkinda/Whispr Hakkında Ekranı.dc.html`, 2g bloğu satır 521–607.

Spec ve orijinal plan: `docs/superpowers/specs/2026-08-07-sunucu-tipi-ve-gorunurluk-s1-design.md`, `docs/superpowers/plans/2026-08-07-sunucu-tipi-ve-gorunurluk-s1.md`.
