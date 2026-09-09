# Dalga 2 — Web ve masaüstü yüzeyi

Önce `00-ortak-baglam.md`, sonra `docs/prompts/splash-1b/raporlar/dalga-1.md` oku.
Branch `uat`, commit yok. Dalga 1'in sözleşmeleri hazır kabul edilir; onlara **eklenmez**,
tüketilir. Dalga sonunda: web ve masaüstü açılış ekranı tasarımdaki hâliyle çalışır, dört durum
her iki yüzeyde çizilir, eski `AppStartupScreen` kaldırılmıştır.

Ölçü doğrulaması `design_handoff/splash-1b-paketi/referans.html` üzerinden yapılır;
sayılar SPEC §4/§5/§7'den okunur, ekrandan tahmin edilmez.

---

## Ş7 · Ortak splash bileşen ailesi

**Dosya:** yeni `apps/web/src/components/splash/*`, `apps/web/src/app/globals.css`
(yeni `@layer components` bloğu).

Tek bir bileşen ailesi üç düzeni de çizer; kopyala-yapıştır düzen yok.

1. **Stil katmanı** `globals.css` içinde `.whispr-splash-*` sınıfları olarak yazılır
   (`.whispr-logo-*` ve `.auth-*` ile aynı desen). Tailwind yardımcı sınıfı, SPEC'in
   ondalıklı ölçülerini (12.5px, 10.5px, 11.5px) taşıyamaz — bu değerler CSS'te birebir yazılır.
   Renkler yalnız `hsl(var(--token))`.
2. **Animasyonlar** SPEC §3.2'den birebir: `wdrift`, `wbreathe`, `wglow`, `wdot`.
   Ad çakışmasını önlemek için `whispr-splash-` öneki alır (`@keyframes whispr-splash-drift` …).
   **Mevcut `auth-equalizer` keyframe'i değiştirilmez** (giriş ekranı ona bağlı; süresi 1.7s,
   splash 2.1s ister) — splash kendi `@keyframes whispr-splash-equalizer`ını yazar:
   `0%,100% { transform: scaleY(.5); opacity:.68 } 50% { transform: scaleY(1); opacity:1 }`,
   `2.1s cubic-bezier(.45,0,.2,1) infinite`, çubuk gecikmeleri `0/.13/.26/.39/.52s`,
   `transform-origin: center` (global `auth-equalizer-bar` `bottom` kullanıyor — splash merkezden
   ölçekler, SPEC §2).
3. **Bileşenler:**
   - `SplashAurora` — pencere kökünün **ilk çocuğu**. `data-surface` ile üç varyant
     (desktop `inset:-45%` / 15s, web `inset:-30%` / 18s, mobil-dar `inset:-25%` / 16s;
     gradyan oranları SPEC §3.1). Durum ekranlarında tek radyal (`wash` prop'u).
   - `SplashMark` — `ring` (92 / 190 / 150px) + `wglow` halkası + `wbreathe` sarmalayıcı +
     `markbox` (`display:grid; place-items:center; width:56px; height:56px`) +
     `<BrandLogo animated interactive={false} />`. Wordmark ayrı düğüm.
     Büyütme `transform: scale(2)` (web) / `scale(1.75)` (mobil-dar) ile — `h-*`/`w-*` **yasak**.
     `BrandLogo` `role="img" aria-label="Whispr"` üretiyor; SPEC §9 gereği sarmalayıcıya
     `aria-hidden="true"` konur.
   - `SplashSteps` — dört adım, `getSplashStepStatus` ile durum. Daire 16px (web 22px),
     iç nokta 6px (web 8px), etiket 12.5px (web 16px), satır aralığı 11px (web 18px).
     Tamamlanan: `--success` zemin + beyaz 10px onay ikonu (referanstaki `path` birebir).
     Aktif: `--primary/.16` zemin + `wdot .9s` nabız. Bekleyen: `--surface-soft`, ikon yok.
   - `SplashStepLine` — mobil/dar düzen için tek satır: üç nokta + `<adım>…`.
   - `SplashDots` — üç nokta, 5px (mobil 6px), `wdot 1.1s`, gecikme `0/.16/.32s`.
   - `SplashPill` — PROD/UAT. Ölçüler SPEC §3.3 (18/22/20px yükseklik, 6/7px köşe,
     9/10/9.5px font, `letter-spacing:.12em`, iç boşluk 7/9/8px). Renkler tablodan.
   - `SplashVersion` — `formatSplashVersionLine` çıktısı, tek satır, `--text-muted`,
     10.5/11.5/11px.
   - `SplashTip` — dört ipucundan biri. **Seçim istemcide yapılır**: sunucuda ipucu satırı
     yer ayırır ama boş çizilir, `useEffect` ilk karede rastgele birini koyar. Böylece
     hidrasyon uyuşmazlığı da düzen sıçraması da olmaz. `text-wrap: pretty`.
   - `SplashStatePanel` — SPEC §7'nin sağ kolonu: 24px karo (köşe 8px) + 10px uppercase etiket +
     15.5px başlık + 11.5px açıklama + eylem. Dört durumun ikon `path`'leri referanstan birebir.
     Düğme: 32px yükseklik, 15px yatay boşluk, 10px köşe, `600 12.5px`.
     İlerleme: 4px kanal (`--surface-soft`) + `--primary` dolgu + `formatSplashUpdateProgress`.
   - `SplashScreen` — düzen anahtarı. `surface: "desktop" | "web"` ve `state`/`step` alır,
     doğru iskeleti kurar.
4. **Kontrast kuralı** (SPEC §7 sonu): durum tonunun **metin** rengi daima `-soft`;
   doygun `--warning`/`--danger` yalnız karo zemininin tint'inde. Bu, bileşenin prop
   tipinde ayrılır (`tone` = `-soft` token adı, `tileBg` = doygun/.tint) ki karıştırılamasın.
5. **`prefers-reduced-motion: reduce`** altında tüm `.whispr-splash-*` animasyonları
   `animation: none` — düzen ve logo aynı kalır (SPEC §9).

**Kabul:** bileşen testleri (`apps/web` node koşucusu + mevcut React test kurulumu):
adım durumlarının doğru sınıfları verdiği, pill'in iki ortamda doğru token setini aldığı,
`tone`/`tileBg` karışırsa tipin derlenmediği, ipucunun dört metinden biri olduğu,
reduced-motion altında animasyon sınıflarının düştüğü.

---

## Ş8 · Web açılış ekranı (K12, K13)

**Dosya:** `apps/web/src/components/shell/wizards-shell.tsx`,
`apps/web/src/hooks/use-shell-readiness.ts`, `apps/web/src/app/(auth)/login/login-client.tsx`,
`apps/web/src/app/desktop/oauth/claim/[token]/desktop-oauth-claim-client.tsx`;
silinecek: `apps/web/src/components/app/app-startup-screen.tsx` + `.test.tsx`,
`startup.*` anahtarları (tr/en).

1. **Düzen (SPEC §5):** tam viewport. Panel `40%` (referans ölçüsü 512px @1280), kolon `60%`.
   Panel içeriği ortalı: 190px halka, `scale(2)` logo, `Whispr` 44px (üst boşluk 18px),
   `Sesli sohbet ve topluluk` 14.5px (üst boşluk 12px).
   Sağ kolon `padding: 0 72px`, dikey ortalı: `Hazırlanıyor` 10.5px + pill, adım listesi
   (üst boşluk 26px, aralık 18px). Alt bar `left:72px; right:72px; bottom:44px` — solda sürüm,
   sağda ipucu (sağa dayalı). Pencere köşesi 14px, kenar `hsl(var(--border)/.5)`.
   Kolonlar **opak zemin almaz**; aurora kökte.
2. **Dar ekran (K12):** `max-width: 767px` altında SPEC §6 düzeni çizilir — tek yüzey, ortada
   150px halka + `scale(1.75)` logo + `Whispr` 34px + tagline 13px; altta blok
   (`padding: 0 32px 42px`, 14px aralık): tek satır adım + ipucu + pill/sürüm satırı.
   Üçüncü bir düzen yazılmaz. Köşe yuvarlaklığı (44px) yalnız mobil **cihaz** çerçevesine aittir,
   tarayıcıda uygulanmaz.
3. **Bağlantı:** `use-shell-readiness` Dalga 1'in `splash-machine`ine geçer.
   `toSplashRuntimeInput` ile mevcut kabuk sinyalleri (`appearanceHydrated`,
   `layoutSettingsLoaded`, `serversLoading`, `activeServerDetailLoading`,
   `dmConversationsLoading`, `realtimeConnected`) K7 alanlarına eşlenir:
   - `bootstrapRequestSettled` — ilk bootstrap/oturum isteğinin uçuşta olup olmadığı
     (hangi sorgunun bunu temsil ettiği kodda bulunur ve yorumda yazılır; uydurulmaz).
   - `sessionHydrated` = `appearanceHydrated && layoutSettingsLoaded`
   - `workspaceLoaded` = `!serversLoading && !rota verisi yükleniyor`
   - `realtimeConnected` = mevcut alan
   - `online` = `navigator.onLine` + `online`/`offline` dinleyicileri
   - `sessionExpired` = 401 yakalayan mevcut oturum katmanından
   - `update` = **daima `null`** (K10: web'de indirilecek artıfakt yok)
     Zamanlar Dalga 1'in sabitleri (600 / 180 / 10 000). `readiness.ts`'in artık kimsenin
     okumadığı 400/260/5000 sabitleri ve `AppStartupStatus` tipi bu şeritte silinir.
4. **Devralma (K13):** dört kullanım yeri `SplashScreen`e geçer. `/desktop/start` Ş9'un işi.
   Login overlay'i ve OAuth claim ekranı `surface="desktop"` iskeletini kullanır
   (ikisi de masaüstü penceresinde açılır).
5. **Erişilebilirlik (SPEC §9):** kök `role="status" aria-live="polite"`; okunacak metin
   aktif adım etiketidir (tüm liste değil — her adımda dört satır okunmaz).
   Logo `aria-hidden`. Durum düğmeleri klavyeyle erişilebilir, `:focus-visible` halkası
   `--ring` tokenıyla.
6. Eski bileşen, testi ve `startup.*` anahtarları **silinir**; hiçbir dosyada artık referansı
   kalmaz (`grep -r "AppStartupScreen\|startup\." ile doğrula).

**Kabul:** `pnpm --filter @wizards/web test`, `typecheck`, `lint` yeşil.
`AppStartupScreen` deposunda sıfır referans. 1280×720'de ölçüler SPEC §5 ile,
767px'te SPEC §6 ile eşleşir.

---

## Ş9 · Masaüstü penceresi (K3, K4)

**Dosya:** `apps/desktop/src-tauri/src/lib.rs`,
`apps/web/src/app/desktop/start/desktop-start-client.tsx`, `apps/web/src/app/globals.css`.

1. **Ölçü:** `DESKTOP_SPLASH_WINDOW_WIDTH = 630.0`, `DESKTOP_SPLASH_WINDOW_HEIGHT = 420.0`
   (420×280 × 1,5). Sabitlerin yanına yorum: “tasarım 420×280 yazılır, kökte `zoom:1.5`
   uygulanır; bu sabitler o ölçeğin pencere karşılığıdır”.
2. **Ölçek:** splash kökü masaüstü yüzeyinde `zoom: 1.5` alır. **Hiçbir CSS değeri elle
   1,5 ile çarpılmaz** — panel 176px, kolon dolgusu 26/22/20px, halka 92px, wordmark 22px,
   adım dairesi 16px, pill 18px … hepsi SPEC §4'teki 1× değerleriyle yazılır.
   Bundle hedefi yalnız `nsis` (Windows/WebView2) olduğu için `zoom` güvenli; yine de
   `@supports not (zoom: 1)` dalında `transform: scale(1.5)` + `transform-origin: top left`
   yedeği yazılır.
3. **Saydam kabuk (K4):** ana pencere zaten `.transparent(true)` ve `.decorations(false)`.
   `prepare_desktop_start_window()` içine `set_shadow(false)` eklenir; pencere ana ölçüye
   terfi ederken (`promote_desktop_window`) gölge geri açılır.
   Köşe 16px ve `box-shadow: 0 26px 58px -26px hsl(var(--foreground)/.24)` CSS'ten çizilir;
   gövde zemini şeffaf kalır (init script'in `/desktop/start` dalı bunu zaten yönetiyor,
   gerekiyorsa `whispr-desktop-transparent-surface` sınıfı splash yolunda da açılır).
   Gölge alanı tıklama geçirmemeli: gölge, kabuğun **içinde** çizilir; pencere kutusu
   630×420'nin dışına taşan bir alan istemez.
4. **Sürüklenebilirlik:** splash kökü `data-tauri-drag-region` taşır; durum düğmeleri ve
   ilerleme çubuğu **taşımaz** (aksi hâlde tıklama sürüklemeye dönüşür).
   Kapatma/küçültme düğmesi yok (SPEC §4).
5. **Kapanış (SPEC §8):** minimum 600 ms görünme, ardından 180 ms `opacity` geçişi;
   geçiş bitince pencere ana ölçüye terfi eder ve rota değişir. `desktop-start-client.tsx`
   içindeki `DESKTOP_STARTUP_MIN_VISIBLE_MS = 760` **600'e** iner ve Dalga 1 sabitinden okunur.
6. `desktop-start-client.tsx` artık `SplashScreen surface="desktop"` çizer; adım ve durum
   Dalga 1 motorundan gelir (oturum çözümü `resolveDesktopStartDestination` ile aynı akışta).

**Kabul:** `cargo test` ve `cargo clippy -- -D warnings` (`apps/desktop/src-tauri`) yeşil.
Windows'ta elle: pencere 630×420, köşe yuvarlak, gölge var, sürükleme çalışıyor,
düğmeler tıklanıyor, kapanış 180 ms. Elle doğrulama yapılamadıysa **rapora “koşulamadı” yazılır**,
yeşil sayılmaz.

---

## Ş10 · Dört durum ekranı — web + masaüstü (K1, K10)

**Dosya:** `apps/web/src/components/splash/*` (Ş7'nin `SplashStatePanel`i),
`apps/web/src/lib/desktop/updater.ts` (yalnız tüketim), `wizards-shell.tsx`,
`desktop-start-client.tsx`.

1. **Masaüstü:** SPEC §7 birebir — 420×280 kabuğu (`zoom:1.5` ile 630×420), gölge
   `0 20px 44px -24px hsl(var(--foreground)/.18)`, sol panel aynı (animasyon durur,
   işaret `opacity:.9`), aurora tek radyal (`wash` tablodan).
2. **Web:** aynı içerik sağ kolonda adım listesinin yerine çizilir; sol panel, aurora, alt bar
   (sürüm + ipucu) korunur. Ölçüler web ölçeğine göre: karo 24px→32px, başlık 15.5px→20px,
   açıklama 11.5px→14px, düğme 32px→40px. **Bu ölçekleme oranı bir kez tanımlanır**
   (`--whispr-splash-state-scale`) ve dört durumda da aynı uygulanır; her durum için ayrı
   sayı yazılmaz.
3. **Durum kaynakları (K10):**
   - `slow` — `SPLASH_SLOW_AFTER_MS = 10_000`. Eylem `Yeniden başlat`: masaüstünde pencere
     yeniden yükler (`window.location.reload()` yerine mevcut masaüstü yeniden başlatma yolu
     varsa o), web'de sayfayı yeniler.
   - `offline` — ağ hatası/`navigator.onLine`. Eylem `Tekrar dene` (dolu düğme).
     Bağlantı gelince **otomatik** yeniden dener (`shouldRetryAfterReconnect`), kullanıcı
     düğmeye basmak zorunda değil (SPEC §8).
   - `updating` — **yalnız masaüstü.** `apps/web/src/lib/desktop/updater.ts`'in `onProgress`
     geri çağrısı `SplashUpdateProgress`e bağlanır; `contentLength` yoksa yüzde satırı
     çizilmez (Dalga 1 `null` döndürür). Web'de bu durum hiç tetiklenmez.
   - `sessionExpired` — 401. Eylem `Giriş yap` → giriş ekranı (masaüstünde mevcut
     `/desktop/start` → login akışı, web'de `/login`).
4. **Metinler** Ş5'in anahtarlarından okunur; bileşende sabit dize yok.
5. Bir durum aktifken adım listesi ve üç nokta **çizilmez** (SPEC §7 sağ kolonu onların yerini
   alır); alt satırdaki sürüm/pill korunur.

**Kabul:** dört durumun her biri için bileşen testi (doğru ton/karo/eylem eşleşmesi),
`updating`in web'de tetiklenemediği, `offline`dan çıkışın otomatik olduğu,
öncelik sırasının Dalga 1 motoruyla aynı kaldığı.

---

## Ş11 · Parity turu ve e2e

**Dosya:** yeni `apps/web/e2e/specs/design/splash-parity.spec.ts`,
`apps/web/e2e/helpers/design-parity.ts` (varsa yeniden kullanılır).

Mevcut parity desenini izle (`downloads-report-parity.spec.ts` örnek). İddia “ekran açılıyor”
değil; **ölçülen** sözleşme:

1. Aurora katmanı pencere kökünün ilk çocuğu; kolonların hesaplanmış `background-color`'ı
   saydam (kabul kriteri 1).
2. Logo işareti: DS wordmark'ı `display:none`; işaret kutusu 56×56 ve halkayla eş merkezli
   (merkez farkı ≤ 0.5px); tıklanınca rota değişmiyor (kabul kriteri 2).
3. Pill ve sürüm satırı **yedi karede de** görünür (masaüstü, web, dar-web + dört durum) ve
   PROD/UAT ile birlikte değişiyor (kabul kriteri 3).
4. 420px genişlikte (masaüstü 1× eşdeğeri) ipucu kırpılmıyor: `scrollWidth <= clientWidth`,
   pill ve sürümle aynı satırda değil (kabul kriteri 4).
5. Durum etiketlerinin kontrastı `theme-light` **ve** `theme-dark`'ta ≥ 4.5:1
   (kabul kriteri 5, K6 ile mümkün).
6. Metinler SPEC ile birebir — spec dosyasındaki sabitlerden okunur (kabul kriteri 6).
7. `prefers-reduced-motion: reduce` emülasyonu altında hiçbir `.whispr-splash-*` öğesinde
   çalışan animasyon kalmıyor.
8. a11y: `AxeBuilder` ile `wcag2a/wcag2aa/wcag21a/wcag21aa`; `critical`/`serious` sıfır.

**Kabul:**
`pnpm --filter @wizards/web exec playwright test --project=chromium e2e/specs/design/splash-parity.spec.ts`
yeşil. Yerel e2e ortamı kurulamazsa spec yine yazılır ve rapora **“koşulamadı”** yazılır.

---

## Dalga kapanışı

```bash
pnpm --filter @wizards/web test
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web lint
pnpm --filter @wizards/types test
# apps/desktop/src-tauri içinden:
cargo test && cargo clippy -- -D warnings
# e2e (mümkünse):
pnpm --filter @wizards/web exec playwright test --project=chromium e2e/specs/design/splash-parity.spec.ts
```

Rapor: `docs/prompts/splash-1b/raporlar/dalga-2.md` — kapatılan kabul kriterleri (6 madde tek tek),
Windows'ta elle doğrulanan/doğrulanamayan davranışlar, silinen dosyalar, kalan sapmalar.

**Bu dalgada dokunulmayacaklar:** `apps/mobile/**` (Dalga 3), `@keyframes auth-equalizer` ve
`.auth-*` sınıfları, `app-update-notifier.tsx`'in `WHISPR_BUILD_ID` sözleşmesi.
