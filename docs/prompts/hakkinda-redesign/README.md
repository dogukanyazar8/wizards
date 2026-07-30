# Whispr "Hakkında" yeniden tasarımı — uygulama prompt paketi

Kaynak tasarım: `design_handoff/design_handoff_whispr_hakkinda/`
(13 ekran · `PROMPT.md` · `Whispr Hakkında Ekranı.dc.html` · `screenshots/*.png`)

Bu klasördeki her dosya, **tek başına ayrı bir Claude Code oturumunda** çalıştırılabilecek
bir uygulama promptudur. Sıra bağlayıcıdır: `01` ve `02` bitmeden ekran promptları
çalıştırılamaz (paylaşılan token, bileşen, rota ve veri katmanı orada kurulur).

## Çalışma kuralları (her prompt için geçerli)

- Branch: `uat`. **Commit atılmayacak, push edilmeyecek.** Değişiklikler çalışma ağacında kalır.
- Tasarım otoritesi sırası: `screenshots/*.png` → HTML inline stil → `PROMPT.md` metni.
  Üçü çelişirse ekran görüntüsü kazanır; PROMPT.md §0 kuralı gereği **hiçbir değer uydurulmaz**.
- Her prompt kendi doğrulama komutlarını çalıştırmadan "bitti" demez.

## Sıra ve bağımlılıklar

| #   | Dosya                            | Kapsam                                                                                          | Ön koşul           |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------ |
| 00  | `00-ortak-baglam.md`             | Repo gerçekleri, token/test/rota kuralları, ortak bileşen sözleşmesi. **Okunur, uygulanmaz.**   | —                  |
| 01  | `01-veri-katmani-db-api.md`      | Prisma modelleri, migration, `@wizards/types` şemaları, mobil API uçları                        | 00                 |
| 02  | `02-mobil-temel-katman.md`       | Tema token'ları, i18n anahtarları, ortak bileşenler, rotalar, query katmanı, `UpdateController` | 01                 |
| 03  | `03-1a-1b-1e-hakkinda-ekrani.md` | 1a + 1b + 1e (tek scroll ekran + koyu tema)                                                     | 02                 |
| 04  | `04-1c-yenilikler.md`            | 1c yenilikler / sürüm notları listesi                                                           | 02, 03             |
| 05  | `05-1d-guncelleme-akisi.md`      | 1d güncelleme kartı + indirme sayfası                                                           | 02, 03             |
| 06  | `06-2a-tam-surum-notu.md`        | 2a tek sürüm detayı                                                                             | 02, 04             |
| 07  | `07-2b-surum-gecmisi.md`         | 2b 38 sürüm, arama + yıl grupları                                                               | 02, 04             |
| 08  | `08-2c-guncelleme-kanali.md`     | 2c kanal seçici                                                                                 | 02, 03             |
| 09  | `09-2d-beta-onayi.md`            | 2d beta onay sheet'i                                                                            | 02, 03, 08         |
| 10  | `10-2e-yardim-merkezi.md`        | 2e yardım merkezi                                                                               | 01, 02             |
| 11  | `11-2f-sorun-bildir.md`          | 2f sorun bildir formu                                                                           | 01, 02, 10         |
| 12  | `12-2g-topluluk-sunucusu.md`     | 2g topluluk davet ekranı                                                                        | 02, 03             |
| 13  | `13-2h-puanlama.md`              | 2h puanlama sheet'i                                                                             | 02, 03             |
| 14  | `14-admin-icerik-yonetimi.md`    | Admin panelde sürüm notu + yardım makalesi + hata raporu yönetimi                               | 01                 |
| 15  | `15-dogrulama-ve-kabul.md`       | 36 kabul kriterinin tek tek doğrulanması, regresyon taraması                                    | 03–13              |
| 16  | `16-ota-guncelleme-altyapisi.md` | Katman A: kendi manifest sunucumuzdan `expo-updates` OTA, kod imzalama, R2 bundle'ları          | 01, 02, 05         |
| 17  | `17-android-apk-guncelleme.md`   | Katman B: Android APK'yı uygulama içinden indir → doğrula → kur, R2 + CI + zorunlu güncelleme   | 01, 02, 05, 14, 16 |

Paralel çalıştırılabilir gruplar (02 bittikten sonra):
`{04}` → `{06, 07}` · `{05, 08}` → `{09}` · `{10}` → `{11}` · `{12}` · `{13}` · `{14}`

16 ve 17 ayrı bir iş kolu: 05 bittikten sonra ekran promptlarıyla paralel yürütülebilir,
ama 17 kendi içinde 16'yı bekler (`updateKind` kararı parmak izi karşılaştırmasına dayanır).

## Alınan kararlar (bağlayıcı)

1. **Sürüm notu verisi:** yeni Prisma tabloları + `/api/v1/mobile/app/releases` uçları.
   Manifest yok; içerik admin panelden yazılır.
2. **Güncelleme akışı:** UI birebir çizilir, arkasına `MobileUpdateController` arayüzü konur.
   Her adaptör yalnız gerçekten bildiği şeyi raporlar; sahte yüzde/ETA üretilmez.
   Prompt 03–15 kapsamında OTA yapılandırması **değiştirilmez** (`Updates.isEnabled === false`,
   ekran bunu dürüstçe gösterir). Gerçek güncelleme mekanizması ayrı iş koludur:
   **16** (OTA, kendi manifest sunucumuz) ve **17** (Android APK indir-kur).
   iOS'ta mağaza dışı kurulum Apple tarafından mümkün olmadığı için iOS yalnız OTA alır;
   TestFlight yönlendirmesi kapsam dışı.
3. **Yardım merkezi:** yeni `HelpArticle` tablosu + `/api/v1/mobile/help/*` uçları.
4. **Sorun bildir:** mevcut feedback akışına dokunulmaz; ayrı `BugReport` tablosu +
   `/api/v1/mobile/support/report` ucu, `#WSP-` takip numarası, 90 gün saklama.

## Kapsam dışı (bilerek)

- EAS Update / OTA kurulumu, yeni native build gerektiren bağımlılıklar
  (`expo-store-review` dahil — mağaza değerlendirmesi `Linking.openURL` ile açılır).
- Mevcut `mobile-feedback-*` akışının tasarımı ve rotaları.
- Web (Next.js) tarafındaki son kullanıcı "Hakkında" sayfası.
