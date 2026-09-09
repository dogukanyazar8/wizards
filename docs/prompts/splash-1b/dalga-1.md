# Dalga 1 — Sözleşme, token ve başlatma motoru

Önce `00-ortak-baglam.md` oku. Branch `uat`, commit yok.
**Bu dalgada hiçbir ekran dosyası çizilmez** — piksel işi Dalga 2 ve 3'ün. Dalga sonunda:
splash sözleşmesi üç yüzeyde import edilebilir, tokenlar 25+ temada doğruyu söyler,
sürüm satırı env'den gerçek değeri üretir, dört adım gerçek başlatma sinyallerinden türer,
metinler tr/en'de hazırdır ve mobil font dosyaları yerindedir.

Referans olarak `design_handoff/splash-1b-paketi/SPEC.md` ve `referans.html` açık tutulur.

---

## Ş1 · Splash sözleşmesi (`packages/types`)

**Dosya:** yeni `packages/types/src/splash.ts`, mevcut `packages/types/src/index.ts`.

Üç yüzeyin ortak dili. React yok, platform importu yok, saf TypeScript + zod.

1. **Kimlikler** (`00-ortak-baglam.md` §4'teki adlar birebir):
   - `SplashStepId = "connecting" | "session" | "servers" | "almostReady"` — sıra
     **anlamlıdır** ve `SPLASH_STEP_ORDER` olarak dışa aktarılır (SPEC §3.5 sırası).
   - `SplashStateId = "loading" | "slow" | "offline" | "updating" | "sessionExpired"`
     (`loading` = normal splash, diğer dördü SPEC §7 tablosunun satırları).
   - `SplashEnvironment = "prod" | "uat"`, `SplashSurface = "desktop" | "web" | "mobile"`.
   - `SplashStepStatus = "done" | "current" | "pending"` (SPEC §3.5 üç satırı).
2. **`resolveSplashEnvironment(channel: string): SplashEnvironment`** — K9.
   `production`/`stable` → `"prod"`; başka **her** değer (`uat`, `development`, `beta`,
   `canary`, boş dize, tanınmayan) → `"uat"`. Büyük/küçük harf duyarsız, `trim()`'li.
   Gerekçe yorumda: PROD rozetini yanlışlıkla göstermek, UAT rozetini yanlışlıkla
   göstermekten pahalıdır.
3. **`formatSplashVersionLine(info): string`** — K8. Biçim `Whispr <semver> (<build>) · <kod adı>`.
   - `buildNumber` yoksa/boşsa parantez bloğu **tamamen düşer**: `Whispr 0.8.15 · Echo`.
   - `codename` yoksa `·` ayırıcısı da düşer: `Whispr 0.8.15 (1204)`.
   - Ayırıcı **U+00B7** (`·`), etrafında birer boşluk. `-` veya `•` kullanılmaz.
   - Sürüm dizesi `v` önekinden ve tırnaktan arındırılır (`app-version.ts`'in
     `0.8.15 "Echo"` biçimi buraya **girmez**; ham parçalar girer).
4. **`getSplashStepStatus(step, activeStep): SplashStepStatus`** — sıra karşılaştırması;
   aktifin öncesi `done`, kendisi `current`, sonrası `pending`. Geriye gidiş yok:
   `advanceSplashStep(current, next)` yalnız ileri taşır (ağ dalgalanmasında adım listesi
   geri saymaz).
5. **Zamanlar** (SPEC §8): `SPLASH_MIN_VISIBLE_MS = 600`, `SPLASH_FADE_OUT_MS = 180`,
   `SPLASH_SLOW_AFTER_MS = 10_000`.
6. **`SplashUpdateProgress = { downloadedBytes: number; totalBytes: number | null }`** +
   `formatSplashUpdateProgress(progress, locale)` → `%64 · 11,8 / 18,4 MB`.
   - Yüzde başta ve `%` **önde** (TR biçimi, SPEC §7 satır 3).
   - MB tek ondalık, ondalık ayırıcı **virgül**; `Intl.NumberFormat("tr-TR")` ile.
   - `totalBytes === null` iken satır **üretilmez** (`null` döner) — uydurma toplam yazılmaz.
7. **Metin anahtarları:** `SPLASH_TEXT_KEYS` — Ş5'in yazacağı i18n anahtarlarının tek listesi
   (`splash.step.connecting`, `splash.state.offline.title` …). Böylece üç yüzey aynı anahtar
   kümesini kullanır ve eksik anahtar tip hatasına dönüşür.
8. `packages/types/src/index.ts`'ten hepsi dışa aktarılır.

**Kabul:** `pnpm --filter @wizards/types test` yeşil. Yeni testler
(`packages/types/src/splash.test.ts`): `resolveSplashEnvironment` için 8 giriş (2 PROD + 6 UAT),
`formatSplashVersionLine` için 4 kombinasyon (tam / build yok / kod adı yok / ikisi de yok),
`formatSplashUpdateProgress` için SPEC'teki `%64 · 11,8 / 18,4 MB` karesinin birebir üretimi ve
`totalBytes: null` → `null`, `advanceSplashStep` için geri gitmeme kanıtı.

---

## Ş2 · Koyu tema `-soft` tokenları (K6)

**Dosya:** `apps/web/src/app/globals.css`, yeni `apps/web/src/lib/splash/contrast.test.ts`.

Bugün `--success-soft`, `--warning-soft`, `--danger-soft` yalnız `:root`'ta (satır 22/25/28) ve
koyu değerler (`154 46% 16%` gibi). 25+ tema sınıfının hiçbiri bunları ezmiyor → koyu temada
durum etiketi zemine gömülüyor. SPEC §7'nin kontrast kuralı ancak tokenlar tema başına doğru
olursa tutar.

1. **Her koyu tema sınıfına** (`html.theme-dark`, `theme-ash`, `theme-graphite`, `theme-onyx`,
   `theme-midnight`, `theme-forest-dark`, `theme-crimson-dark`, `theme-midnight-navy`,
   `theme-mauve-dark`, `theme-slate-dark`, `theme-deep-purple-gradient`,
   `theme-blue-purple-gradient` ve globals.css'te koyu `--surface-card` taşıyan diğerleri)
   üç `-soft` tokenı eklenir. Kural: **aynı ton (hue), doygunluk korunur, açıklık yükseltilir**
   (başlangıç önerisi `--success-soft: 154 55% 76%`, `--warning-soft: 39 80% 76%`,
   `--danger-soft: 352 80% 78%`). Değerler kontrast testinden geçene kadar ayarlanır.
2. Açık temalarda mevcut koyu değerler **korunur** — SPEC §1 tablosu bunları doğruluyor.
3. Hangi temanın “koyu” sayıldığı elle karar değildir: temanın `--surface-card` açıklığı
   `< %50` ise koyudur. Bu kural teste kodlanır ki yeni tema eklendiğinde kapı düşsün.
4. Splash'e **hiçbir tema kodu yazılmaz** (SPEC §1). Bu şerit yalnız token katmanını düzeltir.

**Kabul:** yeni node testi `globals.css`'i okur, her tema bloğu için
`--surface-card` zemininde `--success-soft`/`--warning-soft`/`--danger-soft` metin kontrastını
WCAG formülüyle hesaplar ve **her biri ≥ 4.5:1** olduğunu doğrular; ayrıca
“`--surface-card` açıklığı < %50 olan her tema bloğu üç `-soft` tokenını **kendi içinde**
tanımlamalı” kuralını doğrular. Test `apps/web` node koşucusuna dahil olur
(`pnpm --filter @wizards/web test` içinde görünür).

---

## Ş3 · Sürüm ve ortam kaynağı (K8, K9)

**Dosya:** `apps/web/src/lib/app-version.ts`, `apps/web/src/lib/env.ts`,
yeni `apps/web/src/lib/splash/splash-identity.ts`, `.env.example` / dev-env sözleşmesi
(`apps/web/scripts/dev-env-contract.test.mjs` neyi bekliyorsa oraya).

1. Yeni env: **`NEXT_PUBLIC_WHISPR_BUILD_NUMBER`** (opsiyonel, dize). `app-version.ts`'e
   `WHISPR_BUILD_NUMBER` olarak eklenir. Mevcut `WHISPR_BUILD_ID` **korunur** — o güncelleme
   bildiricisinin (`app-update-notifier.tsx`) sözleşmesi, splash'inki değil.
2. `splash-identity.ts` iki saf fonksiyon dışa aktarır:
   - `getSplashVersionInfo()` → `{ version: WHISPR_VERSION_NUMBER, buildNumber: WHISPR_BUILD_NUMBER || undefined, codename: WHISPR_RELEASE_CODENAME }`.
     **`WHISPR_APP_VERSION` kullanılmaz** (o `0.8.15 "Echo"` üretir, SPEC'in biçimi değil).
   - `getSplashEnvironment()` → `resolveSplashEnvironment(WHISPR_RELEASE_CHANNEL)`.
     Modül `"use client"` değildir; hem sunucuda hem istemcide okunabilir olmalı
     (`process.env.NEXT_PUBLIC_*` derleme anında gömülür).
3. `env.ts` sözleşmesine `NEXT_PUBLIC_WHISPR_BUILD_NUMBER` opsiyonel olarak eklenir; eksikliği
   **hata değildir** (K8: parantez düşer).
4. Deploy tarafına dokunulmaz; env'in nasıl doldurulacağı Dalga 3 raporunda not edilir.

**Kabul:** `pnpm --filter @wizards/web test` yeşil; `splash-identity` için env kombinasyonlarını
kapsayan test (build var/yok, kanal 6 değer). `pnpm --filter @wizards/web lint` yeşil.

---

## Ş4 · Adım ve durum motoru (K7, K1, K10)

**Dosya:** yeni `apps/web/src/lib/splash/splash-machine.ts` + testi,
mevcut `apps/web/src/lib/app-startup/readiness.ts`.

Mevcut `readiness.ts` üç sinyal biliyor (appearance/layout, servers, realtime) ve dört _statü_
üretiyor. K7 dört _adım_ istiyor ve sıraları farklı. Bu şerit motoru saf fonksiyon olarak yazar;
React bağlantısı Dalga 2'de.

1. **Giriş tipi** `SplashRuntimeInput`:
   ```
   bootstrapRequestSettled: boolean   // ilk bootstrap/oturum isteği yanıtlandı mı
   sessionHydrated: boolean           // oturum + görünüm + düzen tercihleri yerinde
   workspaceLoaded: boolean           // sunucu listesi + rotanın verisi
   realtimeConnected: boolean
   online: boolean                    // navigator.onLine / ağ dinleyicisi
   sessionExpired: boolean            // 401 yakalandı
   update: SplashUpdateProgress | null
   elapsedMs: number                  // splash göründüğünden beri
   ```
2. **`getSplashStep(input): SplashStepId`** — K7 eşlemesi:
   `!bootstrapRequestSettled` → `connecting`; `!sessionHydrated` → `session`;
   `!workspaceLoaded` → `servers`; aksi hâlde `almostReady`.
   `almostReady` **realtime'ı bekler**: `realtimeConnected` false iken adım `almostReady`de kalır,
   true olunca kabuk hazır sayılır.
3. **`getSplashState(input): SplashStateId`** — öncelik sırası **kesin**:
   `sessionExpired` > `update !== null` > `!online` > `elapsedMs >= SPLASH_SLOW_AFTER_MS` >
   `loading`. Gerekçe yorumda: oturum bitmişken “bağlantı hatası” göstermek kullanıcıyı
   yanlış düğmeye yollar.
4. **`getSplashPhase(...)`** — `showing | hiding | dismissed`, `SPLASH_MIN_VISIBLE_MS = 600`
   ve `SPLASH_FADE_OUT_MS = 180` ile (SPEC §8). Mevcut `readiness.ts`'teki 400/260/5000
   sabitleri **splash için kullanılmaz**; `readiness.ts` dokunulmadan bırakılır ve Dalga 2'de
   `use-shell-readiness` yeni motora bağlanınca eskiyen sabitler silinir.
   Bu şeritte `readiness.ts`'e yalnız `SplashRuntimeInput`'a besleyecek türetme fonksiyonu eklenir
   (`toSplashRuntimeInput(shellInput, extras)`), mevcut dışa aktarımlar bozulmaz.
5. **Otomatik yeniden deneme** (SPEC §8): `shouldRetryAfterReconnect(prevState, input)` —
   `offline` iken `online` true olduğunda `true`. Zamanlayıcı yok, sinyal güdümlü.
6. **`update` alanı yüzey bağımlıdır** (K10): motor `update`'i sadece taşır; hangi yüzeyin
   ilerleme üretebildiği Dalga 2/3'ün işi. Web'de `update` **daima `null`** verilir.

**Kabul:** saf fonksiyon testleri — 4 adımın her biri için en az bir giriş, durum önceliği için
5 çatışma senaryosu (401+offline, update+slow, …), `almostReady`in realtime'ı beklediği,
adımın geri gitmediği, min görünme/fade zamanlaması. `pnpm --filter @wizards/web test` yeşil.

---

## Ş5 · Metinler (K2)

**Dosya:** `apps/web/src/lib/locale/messages/tr.ts`, `.../en.ts`,
`apps/mobile/src/locale/` altındaki karşılık dosyası (mobil kopya sözlüğü neredeyse oraya).

1. **TR değerleri SPEC'in birebir kopyasıdır.** Tek karakter değişmez — noktalama, üç nokta,
   `Ctrl + K` boşlukları dâhil:
   - Adımlar: `Bağlanıyor` · `Oturum doğrulanıyor` · `Sunucular yükleniyor` · `Neredeyse hazır`
   - Üst satır: `Hazırlanıyor` (uppercase CSS'ten gelir, metin böyle yazılır)
   - Tagline: `Sesli sohbet ve topluluk`
   - Dört ipucu (SPEC §3.6, sırası korunur)
   - Dört durumun etiket/başlık/açıklama/eylem metinleri (SPEC §7 tablosu)
2. **EN karşılıkları eklenir.** Anlamı korur, uydurma özellik anlatmaz
   (`Ctrl + K` kısayolu EN'de de `Ctrl + K`).
3. Anahtar adları Ş1'deki `SPLASH_TEXT_KEYS` listesiyle **birebir** aynı.
4. Mobil kopya sözlüğü aynı metinleri alır; mobil kendi anahtarını icat etmez.
5. Eski `startup.*` anahtarları bu dalgada **silinmez** (Dalga 2 bileşeni kaldırınca silinir);
   yalnız “Dalga 2'de silinecek” notu düşülür.

**Kabul:** tr ve en anahtar kümeleri eşit (locale testi zaten bunu ölçüyorsa yeşil kalır;
ölçmüyorsa bu şerit küçük bir eşitlik testi ekler). Metinler SPEC ile karakter karakter eşleşir —
doğrulama için SPEC'ten kopyalanır, elle yazılmaz.

---

## Ş6 · Mobil font varlıkları (K5)

**Dosya:** `apps/mobile/assets/fonts/*`, `apps/mobile/src/design/mobile-fonts.ts`,
`apps/mobile/src/design/tokens.ts` (yalnız splash tipografi bloğu).

Web'de Outfit ve Figtree **değişken** woff2 olarak var (`apps/web/src/app/fonts/outfit-latin.woff2`
400–700, `figtree-latin.woff2` 400–900, OFL lisansı `OFL.txt` ile aynı klasörde). React Native
woff2 ve değişken eksen okumaz → statik TTF gerekir. İnternetten indirme **yok**; dosyalar
depodaki kaynaktan üretilir (`fontTools` yerelde kurulu, sürüm 4.63.0).

1. Üretim (her ağırlık için, `<python>` = `graphify-out/.graphify_python` içindeki yorumlayıcı):
   ```bash
   <python> -c "from fontTools.ttLib import TTFont; f=TTFont('apps/web/src/app/fonts/outfit-latin.woff2'); f.flavor=None; f.save('outfit-var.ttf')"
   <python> -m fontTools.varLib.instancer outfit-var.ttf wght=600 -o apps/mobile/assets/fonts/Outfit-SemiBold.ttf
   <python> -m fontTools.varLib.instancer outfit-var.ttf wght=700 -o apps/mobile/assets/fonts/Outfit-Bold.ttf
   ```
   Figtree için aynısı: `wght=400/500/600/700` → `Figtree-Regular/Medium/SemiBold/Bold.ttf`.
   Ara `*-var.ttf` dosyaları depoya **girmez**.
2. `mobile-fonts.ts`'e altı yüz kaydedilir: `WhisprOutfit_600SemiBold`, `WhisprOutfit_700Bold`,
   `WhisprFigtree_400Regular/500Medium/600SemiBold/700Bold`. Mevcut Jakarta kayıtları
   **kaldırılmaz** — uygulamanın geri kalanı onlara bağlı.
3. `MOBILE_FONT_GATE_DEADLINE_MS = 600` **değişmez**. Altı yüz daha yüklemek gate'i uzatırsa
   fallback yolu zaten var; splash fallback yüzünde de çizilebilir olmalı (Dalga 3 bunu doğrular).
4. `tokens.ts`'e `mobileSplashTypography` bloğu eklenir: SPEC §6 ölçüleri
   (wordmark 34px/700 Outfit, tagline 13px, adım satırı 13px/500, ipucu 11.5px,
   pill 9.5px/700, sürüm 11px/500) — **ekran dosyası yazılmaz**, yalnız sabitler.
5. Lisans: `apps/mobile/assets/fonts/OFL.txt` olarak kopyalanır (aynı OFL metni).

**Kabul:** `pnpm --filter @wizards/mobile typecheck` yeşil; `apps/mobile` içinden
`node --test --import tsx scripts/mobile-splash-typography.test.ts` — `mobileSplashTypography`
değerlerinin SPEC §6 ile eşleştiğini ve altı font anahtarının `mobile-fonts.ts`'te kayıtlı
olduğunu doğrular. TTF dosyaları depoda mevcut ve 0 baytlık değil.

---

## Dalga kapanışı

```bash
pnpm --filter @wizards/types test
pnpm --filter @wizards/web test
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web lint
pnpm --filter @wizards/mobile typecheck
pnpm --filter @wizards/mobile test
```

Rapor: `docs/prompts/splash-1b/raporlar/dalga-1.md`.
Şunları ayrıca yaz: koyu temalarda seçilen `-soft` üçlüleri ve ölçülen kontrast oranları;
üretilen TTF dosyalarının boyutları; `NEXT_PUBLIC_WHISPR_BUILD_NUMBER`'ın hangi deploy
ortamlarında doldurulması gerektiği.

**Bu dalgada dokunulmayacaklar:** hiçbir `.tsx` ekran/bileşen dosyası,
`app-startup-screen.tsx`, `wizards-shell.tsx`, `desktop-start-client.tsx`,
`apps/desktop/src-tauri/**`, `globals.css`'in `-soft` blokları dışındaki her yeri.
