# Dalga 3 raporu — Mobil yüzey, native açılış ve kapanış

Tarih: 2026-08-26 · Branch `uat` · commit yok. Dört şeridin dördü de kapandı.

---

## Ş12 · Mobil açılış ekranı

**Yeni:** `apps/mobile/src/app/screens/splash/{mobile-splash-model.ts,mobile-splash-screen.tsx}`,
`apps/mobile/src/app/mobile-splash-gate.tsx`.
**Değişen:** `mobile-font-gate.tsx`, `whispr-mobile-root.tsx`, `design/palette.ts`.

- **Motor paylaşıldı.** `getSplashStep` / `getSplashState` / `isSplashComplete` /
  `shouldRetryAfterReconnect` Dalga 2'de web'e özeldi; bu dalgada `@wizards/types`'e taşındı
  ve web `splash-machine`i onları yeniden dışa aktarıyor. Gerekçe K1: dört durum üç yüzeyde
  de çizilecekse "hangi durum kazanır" sorusunun tek bir cevabı olmalı.
- **İki katman, tek görüntü.** Fontlar yüklenirken `MobileFontGate` artık `null` değil
  açılış ekranının kendisini çiziyor (sistem yüzüyle; ölçüler px sabitlerine bağlı olduğu
  için kare bozulmuyor). Sağlayıcılar bağlandıktan sonra `MobileSplashGate` devralıyor ve
  gerçek sinyalleri okuyor. Böylece sinyalleri ağaçta yukarı taşıyan bir köprü gerekmedi.
- **Adım eşlemesi (K7):** `Bağlanıyor` = bootstrap isteği yanıtlanana kadar ·
  `Oturum doğrulanıyor` = auth `checking`ten çıkana kadar · `Sunucular yükleniyor` =
  bootstrap yükü gelene kadar · `Neredeyse hazır` = realtime soketi (20 sn tavanıyla, K14).
  Oturumsuz kullanıcı sunucu listesini beklemiyor — beklese giriş ekranı hiç açılmazdı.
- **Çizim:** aurora `react-native-svg` iki radyal gradyan + reanimated drift; işaret
  `expo-linear-gradient` üstünde 5 çubuk, `scaleY .5→1` + opaklık `.68→1`, 2.1s,
  `cubic-bezier(.45,0,.2,1)`, 130 ms kademeli gecikme; nefes 3.6s. Yeni bağımlılık yok.
- **Erişilebilirlik:** kök `accessibilityRole="progressbar"` +
  `accessibilityLiveRegion="polite"`; işaret `accessibilityElementsHidden`;
  `AccessibilityInfo.isReduceMotionEnabled()` true iken hiçbir animasyon **kurulmuyor**
  (durdurulmuyor — hiç başlamıyor).
- **Ton tuzağı kapatıldı.** Mobil temada `status.warningSoft` bir **yüzey**, web'in
  `--warning-soft`u ise **metin** tonu. Model metin için temanın erişilebilir ön plan
  tonlarını (`status.warning`, `status.dangerOnBase`, `accent.strong`, `text.secondary`),
  zemin için `*Soft` yüzeylerini kullanıyor; test ikisinin asla eşit olmadığını doğruluyor.

## Ş13 · Mobil dört durum

Durum panelinde karo + uppercase etiket + başlık + açıklama + eylem; adım satırının yerine
geçiyor, üst yarı (aurora + işaret + wordmark + tagline) kalıyor, işaret `opacity:.9`.

| Durum            | Mobil üretici                                                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slow`           | ✅ 10 sn sayacı                                                                                                                                                                                             |
| `offline`        | ✅ ağ anlık görüntüsü; bağlantı dönünce otomatik devam                                                                                                                                                      |
| `sessionExpired` | ✅ **gerçek**: oturum bu açılışta bir kez `signed-in` olduysa ve sonra `signed-out`a düştüyse. Soğuk açılıştaki `signed-out` "hiç giriş yapılmamış" olabilir; ona "Oturumun sona erdi" demek yanlış olurdu. |
| `updating`       | ⚠️ **açılışta üretici yok** — aşağıya bak                                                                                                                                                                   |

**Zorunlu sapmalar:** düğme yüksekliği 44px (SPEC 32px; dokunma hedefi alt sınırı),
alt dolgu `max(42, güvenli alan)` yerine sabit 42px + `SafeArea` dışı — SPEC §6 değeri
korundu, çentikli cihaz doğrulaması yapılamadı (cihaz yok).

## Ş14 · Native açılış katmanı (K11)

- `assets/whispr-splash.png` zaten Whispr işareti; Android'in `splashscreen_logo.png`'si
  **Expo'nun yer tutucusuydu** (gri ızgara + halkalar). Beş yoğunluğa (52/78/104/156/208 px)
  gerçek işaret yazıldı.
- `values/colors.xml` `splashscreen_background` `#FFFFFF` → **`#F6F7FB`** (`redesignLight.bg`),
  yeni `values-night/colors.xml` → **`#131529`** (`redesignDark.bg`).
- Yeni `drawable/splashscreen.xml` (renk + ortalanmış bitmap); `styles.xml`'in
  `windowBackground`u artık ona bakıyor — eskiden çıplak PNG'ye bakıyordu, yani zemin rengi
  hiç uygulanmıyordu.
- `app.config.js`'e `splash` bloğu eklendi (açık/koyu zemin + aynı işaret) ki iOS prebuild
  aynı kareyi üretsin. iOS klasörü depoda yok; doğrulama prebuild'de yapılmalı.

## Ş15 · Kabul kriterleri

| #   | Kriter                                                        | Kanıt                                                                                                                                    |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Aurora pencere kökünde, kolonlar opak değil                   | web: canlı ölçüm + bileşen testi + e2e spec'i · mobil: aurora kökün ilk çocuğu, `StyleSheet.absoluteFill`                                |
| 2   | Logo sadece ikon, halkayla eş merkezli, hareketli, tıklanamaz | web: canlı ölçüm (56×56 kutu, wordmark `display:none`, `<a>` yok) · mobil: işaret 150px halkanın ortasında, `Pressable` yok              |
| 3   | Rozet + sürüm yedi karede                                     | web bileşen testi yedi kareyi tek tek geziyor; mobil bileşen testi rozet + sürümü doğruluyor                                             |
| 4   | 420px'te ipucu kırpılmıyor                                    | e2e spec'i yazıldı, **koşulamadı**                                                                                                       |
| 5   | Durum etiketleri okunur, ≥4.5:1                               | web: `splash-contrast.test.ts` (25 palet, açık + koyu, karo ve kart zemininde) · mobil: ton ≠ zemin testi + temanın erişilebilir tonları |
| 6   | Metinler birebir                                              | `splash-copy.test.ts` (web) + `mobile-splash-model.test.ts` (mobil)                                                                      |

## Kapı komutları

| Komut                                             | Sonuç                                   |
| ------------------------------------------------- | --------------------------------------- |
| `pnpm --filter @wizards/types test`               | ✅ 565 test, 0 fail                     |
| `pnpm --filter @wizards/web test`                 | ✅ 7306 test, 7303 pass, 0 fail, 3 skip |
| `pnpm --filter @wizards/web typecheck` / `lint`   | ✅ temiz                                |
| `pnpm --filter @wizards/mobile test`              | ✅ 1970 test, 0 fail                    |
| `pnpm --filter @wizards/mobile typecheck`         | ✅ temiz                                |
| `npx jest component-tests/mobile-splash.test.tsx` | ✅ 7 test, 0 fail                       |
| `cargo test` / `cargo clippy -- -D warnings`      | ✅ 30 test, temiz                       |
| e2e `splash-parity.spec.ts`                       | ⛔ koşulamadı (yerel e2e ortamı yok)    |
| Cihazda mobil doğrulama                           | ⛔ koşulamadı (cihaz/emülatör yok)      |

### Yol boyunca düzeltilen iki kapı

1. `mobile-design-contract.test.ts` sunum kaynaklarında ham renk yasaklıyor; işaretin
   gradyanı (SPEC §2'de sabit renk) `design/palette.ts`'e taşındı — kural da tasarım da korundu.
2. `pnpm --filter @wizards/web lint` bu oturumda üretilmiş `playwright-report/` klasöründeki
   paketlenmiş üçüncü parti JS'i tarayıp 3038 hata sayıyordu. `.gitignore` onu zaten dışarıda
   tutuyordu; eslint'in `globalIgnores` listesine `playwright-report/**`, `test-results/**` ve
   `coverage/**` eklendi.

## Açık kalan tek üretici: `updating`

Açılış anında yürüyen bir indirme yok. Mobilde APK indirmesi Hakkında ekranından, uygulama
zaten açıkken başlıyor (`android-apk-update-controller.ts`); masaüstünde güncelleme ayrı bir
kontrol penceresinde koşuyor. Splash bileşeni prop verildiğinde gerçek yüzdeyi ve `MB`
satırını doğru çiziyor (testleri var) — eksik olan, açılışta bir indirme başlatan **akış**.
Onu eklemek güncelleme politikasını değiştirir; tasarım kararı değil, ürün kararıdır.

## Dokunulan dosyalar

**Yeni:** `apps/mobile/src/app/screens/splash/{mobile-splash-model.ts,mobile-splash-screen.tsx}`,
`apps/mobile/src/app/mobile-splash-gate.tsx`,
`apps/mobile/scripts/mobile-splash-model.test.ts`,
`apps/mobile/component-tests/mobile-splash.test.tsx`,
`apps/mobile/android/app/src/main/res/values-night/colors.xml`,
`apps/mobile/android/app/src/main/res/drawable/splashscreen.xml`.

**Değişen:** `packages/types/src/splash.ts` (+ testi), `apps/web/src/lib/splash/splash-machine.ts`,
`apps/mobile/src/design/{mobile-font-gate.tsx,palette.ts}`,
`apps/mobile/src/app/whispr-mobile-root.tsx`, `apps/mobile/app.config.js`,
`apps/mobile/android/app/src/main/res/{values/colors.xml,values/styles.xml,drawable-*/splashscreen_logo.png}`,
`apps/mobile/scripts/mobile-design-contract.test.ts` bağlamı (değişmedi, kural karşılandı),
`apps/web/eslint.config.mjs`.
