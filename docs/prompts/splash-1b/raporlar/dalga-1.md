# Dalga 1 raporu — Sözleşme, token ve başlatma motoru

Tarih: 2026-08-26 · Branch `uat` · commit yok.
Altı şeridin altısı da kapandı. **Hiçbir ekran/bileşen dosyası çizilmedi** (kural gereği).

---

## Kapı komutları

| Komut                                     | Sonuç                                                            |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `pnpm --filter @wizards/types test`       | ✅ 565 test / 115 suite, 0 fail                                  |
| `pnpm --filter @wizards/web test`         | ✅ 7292 test, 7289 pass, 0 fail, 3 skip (önceden de atlanıyordu) |
| `pnpm --filter @wizards/web typecheck`    | ✅ temiz                                                         |
| `pnpm --filter @wizards/web lint`         | ✅ temiz (10 config testi dâhil)                                 |
| `pnpm --filter @wizards/mobile typecheck` | ✅ temiz                                                         |
| `pnpm --filter @wizards/mobile test`      | ✅ 1957 test / 363 suite, 0 fail                                 |
| Prettier (dokunulan dosyalar)             | ✅ `npx prettier --write` ile hizalandı                          |

> `node scripts/quality/prettier-changed.mjs` deponun tamamında **276 dosya** için kırmızı —
> bu dalga öncesinde de kırmızıydı (bekleyen başka işlerin biçimlenmemiş dosyaları).
> Bu dalganın dokunduğu dosyalar tek tek biçimlendirildi; genel biçim borcuna girilmedi.

## Ş1 · Splash sözleşmesi — `packages/types/src/splash.ts`

Yeni modül + testi (`splash.test.ts`, 20 test), `index.ts`'ten dışa aktarıldı.

- Kimlikler: `SplashStepId` (4), `SplashStateId` (5, `loading` dâhil), `SplashEnvironment`,
  `SplashSurface`, `SplashStepStatus` + zod şemaları.
- `resolveSplashEnvironment` (K9): `production`/`stable` → `prod`, **diğer her şey** → `uat`.
  Büyük/küçük harf ve boşluk duyarsız; `null`/`undefined` de UAT.
- `formatSplashVersionLine` (K8): `Whispr 2.4.1 (1187) · Resonance`. Eksik parça **bloğu**
  düşürür — `Whispr 0.8.15 · Echo`, `Whispr 0.8.15 (1204)`, `Whispr 0.8.15`. Ayırıcı U+00B7.
  `v` öneki ve `0.8.15 "Echo"` gibi süslenmiş girdiler normalize edilir.
- `getSplashStepStatus` / `advanceSplashStep`: adım listesi geri saymaz.
- `formatSplashUpdateProgress`: `%64 · 11,8 / 18,4 MB` (tr-TR, tek ondalık, ondalık MB = 10⁶,
  depodaki indirme kataloğuyla aynı ölçü). `totalBytes: null` → `null` (satır çizilmez).
  Fazla bildirilen indirme %100'e kırpılır.
- Zamanlar: `SPLASH_MIN_VISIBLE_MS 600`, `SPLASH_FADE_OUT_MS 180`, `SPLASH_SLOW_AFTER_MS 10 000`,
  `SPLASH_REALTIME_GRACE_MS 20 000` (K14 — SPEC'te yok, kullanıcı kararı).
- `SPLASH_TEXT_KEYS` — 27 anahtar; sözlükteki eksik anahtar artık testte yakalanıyor.
- `pickSplashTipKey(random)` — rastgelelik dışarıdan verilir (test edilebilir, SSR'da zorlanmaz).

## Ş2 · Koyu tema `-soft` tokenları — `globals.css`

**Bulgu:** `--success-soft` / `--warning-soft` / `--danger-soft` (+ `--info-soft`) yalnız
`:root`'ta ve koyu değerlerdeydi; 20 koyu tema seçicisinin hiçbiri ezmiyordu. Ölçüldü:
`theme-graphite` kartında koyu yeşil metin **1,3:1**.

Tek bir blok eklendi (20 seçici, 4 token). Seçilen değerler ve en kötü ölçüm — her tonun
**kendi tint'li karosu** ve **çıplak kart zemini** üstünde, 20 koyu paletin hepsinde:

| Token            | Koyu palet değeri | rgb         | En kötü kontrast |
| ---------------- | ----------------- | ----------- | ---------------- |
| `--success-soft` | `154 55% 76%`     | 160,227,198 | **5,80:1**       |
| `--warning-soft` | `39 80% 82%`      | 246,220,172 | **5,09:1**       |
| `--danger-soft`  | `352 80% 82%`     | 246,172,182 | **4,85:1**       |
| `--info-soft`    | `199 70% 78%`     | 160,213,238 | **5,25:1**       |

En kötü hâl her seferinde `html.theme-ash, html.theme-graphite` (kart %27 L).
Açık paletlerde mevcut koyu değerler korundu (en kötü 10,70:1).
Karo alfaları SPEC'ten: `--warning/.22` (karo) ve `/.18` (pill), `--danger/.18`,
`--success/.14`, `--info/.16`.

Yeni test `apps/web/src/lib/splash/splash-contrast.test.ts` `globals.css`'i ayrıştırıp
üç şeyi doğruluyor: (1) 20'den fazla palet okundu, (2) `--surface-card` açıklığı %50'nin
altındaki **her** palet dört `-soft` tokenını kendi bloğunda tanımlıyor, (3) her ton hem
karosunda hem kart zemininde ≥ 4,5:1. Yeni koyu tema eklenirse kapı düşer.

`-soft` tokenlarının **hiçbir mevcut tüketicisi yoktu** (yalnız tanım satırları) — bu değişiklik
bugün görünen hiçbir ekranı değiştirmez, splash'in ihtiyacını karşılar.

## Ş3 · Sürüm ve ortam kaynağı

- `next.config.ts`: `WHISPR_BUILD_NUMBER` → `NEXT_PUBLIC_WHISPR_BUILD_NUMBER` eşlemesi eklendi.
  **Ek olarak** `WHISPR_RELEASE_CODENAME` → `NEXT_PUBLIC_WHISPR_RELEASE_CODENAME` eşlemesi de
  eklendi: kod adı bugüne kadar `WHISPR_*` deploy sözleşmesinden ayarlanamıyordu, `app-version`
  onu doğrudan `NEXT_PUBLIC_*`'tan okuyordu. Geri düşüş zinciri korundu (`… ?? "Echo"`), yani
  ayarlanmadığında davranış değişmez.
- `app-version.ts`: `WHISPR_BUILD_NUMBER` eklendi, `WHISPR_VERSION_NUMBER` dışa aktarıldı.
  `WHISPR_BUILD_ID` **dokunulmadı** — o güncelleme bildiricisinin `x-whispr-client-build`
  sözleşmesi; splash'in parantezi ayrı bir sayıdır.
- Yeni `apps/web/src/lib/splash/splash-identity.ts`: `buildSplashVersionInfo` (saf, test edilir),
  `getSplashVersionInfo`, `getSplashVersionLine`, `getSplashEnvironment`.
  `WHISPR_APP_VERSION` bilerek kullanılmadı (`0.8.15 "Echo"` biçimi SPEC'in biçimi değil).
- `.env.example`: `WHISPR_BUILD_NUMBER=` ve `WHISPR_RELEASE_CODENAME=` satırları.
- `env.ts` sözleşmesine dokunulmadı: iki değişken de opsiyonel ve eksikliği hata değil,
  o dosyadaki listeler ise zorunlu/tipli değişkenler için.

## Ş4 · Adım ve durum motoru — `apps/web/src/lib/splash/splash-machine.ts`

Saf modül + 20 test. `Date.now()` okumaz, zamanlayıcı kurmaz.

- `SplashRuntimeInput` — 8 alan (K7 eşlemesi + ağ/401/indirme/geçen süre).
- `getSplashStep`: ilk **bitmemiş** aşamayı döner (bootstrap → oturum → sunucular → soket).
- `getNextSplashStep`: sinyal geri düşerse adım geri gitmez.
- `getSplashState`: öncelik `sessionExpired > updating > offline > slow > loading`.
- `isSplashComplete`: dördü de bitti (**realtime dâhil**), ama soket için 20 sn tavan (K14).
- `getNextSplashPhase` / `getSplashPhaseAfterFadeOut` / `shouldMountSplash` / `shouldShowSplash`
  ve `getRemainingSplashVisibilityMs` — 600 ms minimum, 180 ms sönme.
- `shouldRetryAfterReconnect`: `offline` iken ağ dönünce bir kez `true`.
- `readiness.ts`'e yalnız `toSplashRuntimeInput(shellInput, extras)` eklendi (+3 test);
  mevcut dışa aktarımların hiçbiri bozulmadı, 400/260/5000 sabitleri Dalga 2'ye bırakıldı.

## Ş5 · Metinler (K2)

- `tr.ts` ve `en.ts`'e 27'şer `splash.*` anahtarı. TR değerleri SPEC'ten **kopyalandı**,
  elle yazılmadı.
- Mobil kopya sözlüğü (`mobile-copy.ts`) aynı metinleri camelCase anahtarlarla aldı
  (`splashStepConnecting` …). `mobile-copy-parity.test.ts` yeşil.
- Yeni `apps/web/src/lib/locale/splash-copy.test.ts` (5 test): TR değerleri SPEC ile karakter
  karakter eşleşiyor, her sözleşme anahtarı iki sözlükte de var, PROD/UAT iki dilde aynı.
- Eski `startup.*` anahtarları **silinmedi** — Dalga 2 bileşeni kaldırınca silinecek.

## Ş6 · Mobil font varlıkları (K5)

Outfit ve Figtree mobile'a eklendi. **İnternetten indirme yok**: ikili dosyalar depodaki
`apps/web/src/app/fonts/{outfit,figtree}-latin.woff2` değişken yüzlerinden üretildi
(`fontTools 4.63.0`, `varLib.instancer`).

| Dosya                  | Aile                        | Ağırlık | Boyut    |
| ---------------------- | --------------------------- | ------- | -------- |
| `Outfit-SemiBold.ttf`  | `WhisprOutfit_600SemiBold`  | 600     | 44.640 B |
| `Outfit-Bold.ttf`      | `WhisprOutfit_700Bold`      | 700     | 44.572 B |
| `Figtree-Regular.ttf`  | `WhisprFigtree_400Regular`  | 400     | 31.952 B |
| `Figtree-Medium.ttf`   | `WhisprFigtree_500Medium`   | 500     | 31.960 B |
| `Figtree-SemiBold.ttf` | `WhisprFigtree_600SemiBold` | 600     | 31.964 B |
| `Figtree-Bold.ttf`     | `WhisprFigtree_700Bold`     | 700     | 31.984 B |

Toplam **~217 KB**. Glif kapsamı doğrulandı: `ğĞşŞıİçÇöÖüÜâî` ve `·` `…` altı yüzün hepsinde var
(latin alt kümesi Türkçeyi kesmiyor).

- `mobile-fonts.ts` altı yüzü daha kaydediyor; Jakarta kayıtları korundu.
- `assets/fonts/manifest.json` yeniden yapılandırıldı: tek `source` yerine `sources` sözlüğü
  (3 kaynak) + her dosyada `source` alanı; 11 dosyanın SHA-256'sı yazıldı.
- `assets/fonts/OFL.txt`'e Outfit ve Figtree telif satırları eklendi.
- `tokens.ts`: `mobileSplashTypography` (11 blok) ve `mobileSplashMetrics` (22 ölçü) eklendi;
  `mobileTypography` **değişmedi**.
- `mobile-font-contract.test.ts` yeni yapıya göre güncellendi. Eski
  `runtimeSource.includes("Outfit") === false` kuralı kaldırıldı — o kural Google barındırmalı
  Outfit'i yasaklıyordu; yerine `@expo-google-fonts`, `fonts.googleapis.com` ve
  `fonts.gstatic.com` yasakları ve lisans dosyasında üç projenin telif satırı zorunluluğu geldi.
- Yeni `mobile-splash-typography.test.ts` (6 test): SPEC §6 ölçüleri, işaret çubukları,
  alt blok ızgarası, 44px düğme sapması, ailelerin yalnız vendored olması, iki dilde kopya.

---

## Onaylanan sapma

**`splash.state.updating.description` sabit metin olamadı** — kullanıcı şablonu onayladı.
SPEC §7 satırı `Sürüm 2.5.0 · 18,4 MB. İndirme bitince uygulama kendini yeniden başlatır.`
diye veriyor. Sürüm ve boyut gerçek indirmeden gelen veridir; sabit yazılsaydı her
güncellemede **yanlış** sürüm ve **yanlış** boyut gösterirdi — PROMPT.md kural 5'in
("adımlar sahte olmayacak") tam tersi. Anahtar şablona çevrildi:

```
"Sürüm {version} · {size}. İndirme bitince uygulama kendini yeniden başlatır."
```

Cümlenin kalanı birebir aynı; yalnız iki veri alanı yer tutucu oldu.

## Dalga 2'ye devredilen uyarılar

1. **Realtime kapanışı kapıyor, ama 20 sn tavanı var (K14).** `isSplashComplete` soketi de
   bekliyor (K7); soket gelmezse `SPLASH_REALTIME_GRACE_MS = 20_000` sonunda uygulama canlı
   bağlantı olmadan açılır. Tavan **yalnız soketi** affeder — bootstrap, oturum ve çalışma
   alanı hâlâ beklenir. Kullanıcı 10 sn'de `Uzun sürüyor` durumunu görür, 20 sn'de içeri girer.
   (Eski davranış 5 sn'de splash'i koşulsuz kapatıyordu; o sabit Dalga 2'de silinecek.)
2. **`bootstrapRequestSettled`'ın kaynağı henüz seçilmedi.** Motor alanı tanımlıyor;
   hangi sorgunun "ilk bootstrap isteği" sayıldığı Dalga 2'de kodda bulunup yorumlanacak.
3. **`--text-muted` SPEC'ten farklı.** SPEC §1 `220 11% 52%` yazıyor, depoda `220 11% 46%`
   (kontrast düzeltmesiyle bilerek koyulaştırılmış). Splash `hsl(var(--text-muted))` okuduğu
   için otomatik olarak 46% alacak — daha okunur, tasarımdan 6% sapma.
4. **`auth-equalizer` süresi 1.7s, SPEC 2.1s ister** ve global keyframe alttan ölçekliyor
   (SPEC merkezden). Dalga 2 splash'e ayrı keyframe yazacak, globali değiştirmeyecek.

## Açık dış bağımlılık

`WHISPR_BUILD_NUMBER` PROD ve UAT deploy ortamlarında doldurulmalı. Doldurulmazsa sürüm satırı
doğru ama kısa çıkar: `Whispr 0.8.15 · Echo`.

## Dokunulan dosyalar

**Yeni:** `packages/types/src/splash.ts`, `packages/types/src/splash.test.ts`,
`apps/web/src/lib/splash/{splash-identity,splash-machine}.ts`,
`apps/web/src/lib/splash/{splash-identity,splash-machine,splash-contrast}.test.ts`,
`apps/web/src/lib/locale/splash-copy.test.ts`,
`apps/mobile/scripts/mobile-splash-typography.test.ts`,
`apps/mobile/assets/fonts/{Outfit-SemiBold,Outfit-Bold,Figtree-Regular,Figtree-Medium,Figtree-SemiBold,Figtree-Bold}.ttf`.

**Değişen:** `packages/types/src/index.ts`, `apps/web/src/app/globals.css`,
`apps/web/next.config.ts`, `apps/web/src/lib/app-version.ts`,
`apps/web/src/lib/app-startup/readiness.ts` + testi,
`apps/web/src/lib/locale/messages/{tr,en}.ts`, `.env.example`,
`apps/mobile/src/design/{mobile-fonts.ts,tokens.ts}`, `apps/mobile/src/locale/mobile-copy.ts`,
`apps/mobile/scripts/mobile-font-contract.test.ts`,
`apps/mobile/assets/fonts/{manifest.json,OFL.txt}`.

**Dokunulmadı:** hiçbir `.tsx` ekran/bileşen dosyası, `app-startup-screen.tsx`,
`wizards-shell.tsx`, `desktop-start-client.tsx`, `apps/desktop/src-tauri/**`.
