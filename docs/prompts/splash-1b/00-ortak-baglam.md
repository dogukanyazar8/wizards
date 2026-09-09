# Splash 1b “Işıklı panel” — ortak bağlam

Her dalga promptu bu dosyayı **önce** okur. Burada üç şey var: değişmeyen kurallar,
kullanıcının verdiği 12 bağlayıcı karar, ve kod tabanında bulunan (SPEC'in bilmediği)
gerçekler.

---

## 0. Kaynaklar

| Dosya                                            | Rol                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `design_handoff/splash-1b-paketi/SPEC.md`        | **Tek doğruluk kaynağı.** Ölçü, token, animasyon, metin, durum tablosu, kabul kriteri.                  |
| `design_handoff/splash-1b-paketi/referans.html`  | Çalışan referans. Ölçü/animasyon doğrulaması buradan. `zoom:1.5` bölümü masaüstünün üretim ölçeği (K3). |
| `design_handoff/splash-1b-paketi/ekranlar/*.png` | Onaylanan 8 kare.                                                                                       |
| `design_handoff/splash-1b-paketi/PROMPT.md`      | Tasarımcının 8 maddelik kural listesi.                                                                  |

Branch `uat`. **Commit yok** — kullanıcı açıkça istemedikçe hiçbir şey commit edilmez.
Codebase sorusu çıkarsa önce `graphify query "<soru>"`, sonra kaynak okuma.

## 1. Değişmez kurallar (PROMPT.md'den)

1. Renkler **daima** `hsl(var(--token))`; hex/rgb yazılmaz. SPEC §1 tablosu yalnız doğrulama içindir.
2. Logo `<BrandLogo animated interactive={false} />`. DS wordmark'ı gizlenir
   (`.whispr-logo-wordmark{display:none}`), wordmark ayrı metin düğümü olur.
   Büyütme **yalnız** `transform: scale()` ile — `h-*`/`w-*` bu ikonu büyütmez.
3. Aurora katmanı **pencere kökünün ilk çocuğu**; kolonlar opak zemin almaz.
4. Metinler birebir SPEC'teki gibi (TR). Kısaltma/yeniden yazma yok.
5. Adımlar sahte değil — gerçek başlatma aşamalarına bağlanır. `referans.html`'deki 1400 ms
   yalnız gösterim içindir ve **üretime taşınmaz**.
6. Ortam ve sürüm build-time env'den; pill ile sürüm satırı birlikte değişir.
7. Durum etiketi ve ikon konturu `-soft` tonda; doygun `--warning`/`--danger` yalnız karo tint'inde.
8. `prefers-reduced-motion: reduce` altında tüm animasyonlar `animation: none`.

## 2. Kullanıcının verdiği 12 bağlayıcı karar

| #   | Karar                                          | Sonuç                                                                                                                                                                                                                     |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Dört ek durum **üç yüzeyde de** çizilir        | Masaüstü birebir; web sağ kolonda; mobil alt blokta. §8 davranışı her yerde çalışır.                                                                                                                                      |
| K2  | Metinler **TR + EN anahtar**                   | TR değerleri SPEC'in birebir kopyası (kaynak); EN karşılıkları eklenir. i18n mimarisi korunur.                                                                                                                            |
| K3  | Masaüstü **1,5× ölçekte**                      | Pencere **630 × 420**. Değerler 420×280 olarak yazılır, kökte `zoom:1.5` uygulanır (referans dosyasındaki gibi). Hiçbir sabit elle 1,5 ile çarpılmaz. **Dört durum penceresi de 1,5×.**                                   |
| K4  | Masaüstü **saydam pencere**                    | Yuvarlak köşe (16px×1,5 = görünürde 24px) ve `0 26px 58px -26px` gölge CSS'ten çizilir; native gölge kapatılır.                                                                                                           |
| K5  | Mobile **Outfit + Figtree eklenir**            | Gereken ağırlıklar `apps/mobile/assets/fonts/`'a girer, font gate'e kaydedilir.                                                                                                                                           |
| K6  | Koyu temalar için **`-soft` ezilir**           | 25+ tema sınıfına açık `-soft` değerleri yazılır. Splash tema kodu içermez; tokenlar doğruyu söyler.                                                                                                                      |
| K7  | Adım eşlemesi **A**                            | 1 `Bağlanıyor` = ilk bootstrap isteği uçuşta · 2 `Oturum doğrulanıyor` = oturum + görünüm/düzen hidratasyonu · 3 `Sunucular yükleniyor` = sunucu listesi + rota verisi · 4 `Neredeyse hazır` = realtime soket + son kare. |
| K8  | **Yeni `BUILD_NUMBER` env'i**                  | `NEXT_PUBLIC_WHISPR_BUILD_NUMBER`. Yoksa parantez bloğu **tamamen düşer** (`Whispr 0.8.15 · Echo`) — boş parantez yazılmaz.                                                                                               |
| K9  | Kanal → pill eşlemesi                          | `production`, `stable` → **PROD**; `uat`, `development`, `beta`, `canary` ve tanınmayan her değer → **UAT**. Üçüncü pill yok.                                                                                             |
| K10 | Durum 3 **gerçek indirme olan yüzeylerde**     | Masaüstü: Tauri updater (`downloadAndInstall` `Progress` olayı). Mobil: **Android APK** indiricisi (gerçek bayt). Web ve iOS'ta durum 3 **hiç tetiklenmez**; diğer 3 durum oralarda da çalışır.                           |
| K11 | Native açılış katmanı **zemin + logo eşleşir** | Android `windowBackground` ve iOS launch screen zemini `--background`, ortadaki işaret 52px logo. Aurora/metin native'de yok.                                                                                             |
| K12 | Dar web **mobil düzenine geçer**               | `< 768px` viewport'ta web, SPEC §6 mobil düzenini çizer. Üçüncü düzen icat edilmez.                                                                                                                                       |
| K13 | Devralma **hepsi**                             | `AppStartupScreen`'in beş kullanım yeri de yeni splash'e geçer; eski bileşen ve `startup.*` anahtarları kaldırılır.                                                                                                       |
| K14 | Soket için **20 sn tavan**                     | `SPLASH_REALTIME_GRACE_MS = 20_000`. Bootstrap/oturum/çalışma alanı bittiği hâlde soket gelmediyse 20 sn'de uygulama canlı bağlantı olmadan açılır; tavan **yalnız** soketi affeder. SPEC'te yoktu, kullanıcı kararı.     |

**Bu 14 karar dışına çıkılmaz.** Yeni bir sapma gerekirse önce kullanıcıya sorulur.

## 3. Kod tabanında bulunanlar (SPEC'in bilmediği gerçekler)

Aşağıdakiler doğrulandı; prompt'lar bunlara dayanır.

### 3.1 Web

- `apps/web/src/components/brand/brand-logo.tsx` — `BrandLogo` **burada**, `@wizards/ui`'de değil.
  `LOGO_BAR_HEIGHTS = [17,25,34,24,18]` (SPEC ile aynı), `animationDelay = index * 0.13s`
  (SPEC ile aynı), `interactive={false}` → `<span role="img" aria-label="Whispr">`.
- `apps/web/src/app/globals.css:1198` — `@keyframes auth-equalizer` **mevcut ama farklı**:
  `scaleY(.55)` → `1` @45%, `opacity .72→1`, süre `1.7s`/`1.8s`.
  SPEC §2: `scaleY(.5)→1` @50%, `opacity .68→1`, süre **2.1s**, `cubic-bezier(.45,0,.2,1)`.
  → Splash kendi eğrisini/süresini uygular; global `auth-equalizer` **değiştirilmez**
  (giriş ekranı ona bağlı).
- Tokenlar: `--surface-card`, `--surface-soft`, `--text-secondary`, `--text-muted`, `--border`,
  `--primary`, `--success`, `--warning`, `--danger`, `--ring` her tema sınıfında tanımlı.
  `--success-soft` / `--warning-soft` / `--danger-soft` **yalnız `:root`'ta** (globals.css:22,25,28) →
  K6 bunu kapatır.
- Fontlar: Outfit ve Figtree `apps/web/src/app/fonts/` altında yerel (`localFont`), OFL lisansı var.
- `apps/web/src/lib/app-version.ts`: `NEXT_PUBLIC_WHISPR_VERSION` (vars. `0.8.15`),
  `NEXT_PUBLIC_WHISPR_RELEASE_CODENAME` (vars. `Echo`), `NEXT_PUBLIC_WHISPR_BUILD_ID`
  (vars. `development`), `NEXT_PUBLIC_WHISPR_RELEASE_CHANNEL` (vars. `beta`).
  `WHISPR_APP_VERSION` sürümü `0.8.15 "Echo"` biçiminde birleştirir — **splash bunu kullanmaz**,
  kendi biçimlendiricisini alır (K8).
- Mevcut açılış yüzeyi: `apps/web/src/components/app/app-startup-screen.tsx` +
  `apps/web/src/lib/app-startup/readiness.ts` (`session|workspace|realtime|ready`,
  min 400ms / max 5000ms / fade 260ms) + `apps/web/src/hooks/use-shell-readiness.ts`.
  Kullanım yerleri: `components/shell/wizards-shell.tsx:1500`,
  `app/desktop/start/desktop-start-client.tsx:86`,
  `app/desktop/oauth/claim/[token]/desktop-oauth-claim-client.tsx:53`,
  `app/(auth)/login/login-client.tsx:265`, ve testi `app-startup-screen.test.tsx`.
- i18n: `apps/web/src/lib/locale/messages/{tr,en}.ts:46-53` `startup.*` anahtarları.

### 3.2 Masaüstü (Tauri v2 — Electron **değil**)

> PROMPT.md “Electron, çerçevesiz pencere” diyor. Uygulama **Tauri v2**. Yüzey aynı
> (çerçevesiz webview penceresi), API farklı. Bu bilinen bir sapmadır, ayrıca sorulmadı.

- `apps/desktop/src-tauri/src/lib.rs`
  - `DESKTOP_SPLASH_WINDOW_WIDTH = 432.0`, `DESKTOP_SPLASH_WINDOW_HEIGHT = 292.0` (satır 117-118)
    → K3 ile **630 × 420** olur.
  - `DESKTOP_START_PATH = "/desktop/start"` (satır 95).
  - Ana pencere zaten `.decorations(false)` **ve `.transparent(true)`** (satır 838-839) → K4 için
    yeni bayrak gerekmez; `set_shadow(false)` + CSS köşesi yeter (`set_shadow` örneği satır 3726).
  - `prepare_desktop_start_window()` (satır 2796) splash ölçüsünü uygular ve pencereyi ortalar.
  - `on_page_load` splash yolunda pencereyi gösterir, başka yola geçince `promote_desktop_window`.
  - Init script'te `markWhisprDesktopChrome` zaten `/desktop/start` dalı taşıyor (satır ~71) ve
    `whispr-desktop-transparent-surface` sınıfını yönetiyor (globals.css:1103).
  - Bundle hedefi yalnız `nsis` → **Windows/WebView2**. `zoom` CSS özelliği desteklenir (K3).
- Updater: `tauri-plugin-updater = 2.10.1`, sarmalayıcı `apps/web/src/lib/desktop/updater.ts`
  (`onProgress`, `contentLength`, `Started|Progress|Finished`) → durum 3'ün gerçek yüzdesi buradan.

### 3.3 Mobil (React Native + Expo)

- Kök: `apps/mobile/src/app/whispr-mobile-root.tsx` → `MobileFontGate` → `MobileAppProviders` →
  `MobileProductApp`.
- `apps/mobile/src/design/mobile-font-gate.tsx`: fontlar yüklenene kadar `null` döner,
  `MOBILE_FONT_GATE_DEADLINE_MS = 600`. **İlk açılışta boş kare buradan geliyor** — splash'in
  gerçek yeri burasıdır.
- `apps/mobile/src/design/mobile-fonts.ts`: yalnız Plus Jakarta Sans (5 ağırlık) → K5.
- Tema: `apps/mobile/src/design/themes.ts` (`MobileThemeId = "dark" | "light"`),
  `theme.status.successSoft/warningSoft/dangerSoft`, `theme.surface.soft`, `theme.text.muted`.
  **Dikkat — ters anlam:** mobilde `palette.successSoft = "#F0FDF4"` (açık tint),
  `successSoftDark = "#052E16"`. Web'in `--success-soft`'u koyu metin tonudur. Mobil karşılık
  seçilirken tema kipine göre doğru varyant alınır; isim benzerliğine güvenilmez.
- Kütüphaneler mevcut: `expo-linear-gradient ~57.0.1`, `react-native-svg 15.15.4`,
  `react-native-reanimated 4.5.1`, `expo-updates ~57.0.13`.
- Android APK güncelleme indiricisi: `apps/mobile/src/about/android-apk-update-controller.ts`
  (`createDownloadResumable` + `onProgress(readBytes)`) → K10'un mobil ayağı.
  `expo-updates` bayt ilerlemesi vermez; iOS'ta durum 3 yok.
- Native açılış: `apps/mobile/android/app/src/main/res/values/styles.xml`
  (`Theme.App.SplashScreen` → `@drawable/splashscreen_logo`), `colors.xml`, `ic_launcher_background.xml`.
- Sürüm/kanal kaynağı: `apps/mobile/src/about/mobile-app-identity.ts`
  (`getMobileAppVersion`, `getMobileAppReleaseChannel`) — **bootstrap payload'ı değil**.

## 4. Ortak sözleşme adları

Dalga 1 bunları üretir, Dalga 2-3 tüketir. İsimler burada sabitlenir ki üç yüzey aynı şeyi konuşsun.

```
packages/types/src/splash.ts
  SplashStepId        = "connecting" | "session" | "servers" | "almostReady"
  SplashStateId       = "loading" | "slow" | "offline" | "updating" | "sessionExpired"
  SplashEnvironment   = "prod" | "uat"
  SplashSurface       = "desktop" | "web" | "mobile"
  SplashVersionInfo   = { version, buildNumber?, codename }
  SplashUpdateProgress= { downloadedBytes, totalBytes | null }
  resolveSplashEnvironment(channel: string): SplashEnvironment        // K9
  formatSplashVersionLine(info: SplashVersionInfo): string            // K8
  SPLASH_MIN_VISIBLE_MS = 600, SPLASH_FADE_OUT_MS = 180, SPLASH_SLOW_AFTER_MS = 10_000,
  SPLASH_REALTIME_GRACE_MS = 20_000
```

## 5. Kapı (gate) komutları

Her dalga sonunda çalışır, hepsi yeşil olmadan dalga kapanmaz:

```bash
pnpm --filter @wizards/types test
pnpm --filter @wizards/web test
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web lint
pnpm --filter @wizards/mobile typecheck
pnpm --filter @wizards/mobile test
```

Mobil bileşen testi: `apps/mobile` içinden `npx jest component-tests/<ad>.test.tsx`.
Mobil node testi: `apps/mobile` içinden `node --test --import tsx scripts/<ad>.test.ts`.
`typecheck`/`lint` **pnpm ile** başlatılır (npm ile runner sahte hata verir).
E2E (Dalga 2 sonu): `pnpm --filter @wizards/web exec playwright test --project=chromium e2e/specs/design/splash-parity.spec.ts`.
Rust tarafı (Dalga 2): `apps/desktop/src-tauri` içinden `cargo test` ve `cargo clippy -- -D warnings`.

## 6. Raporlama

Her dalga sonunda `docs/prompts/splash-1b/raporlar/dalga-<n>.md` yazılır:
dokunulan dosyalar, kapatılan kabul kriterleri, **kalan sapmalar** (varsa gerekçesiyle),
koşan/koşamayan komutlar. Koşamayan bir komut “yeşil” diye raporlanmaz.
