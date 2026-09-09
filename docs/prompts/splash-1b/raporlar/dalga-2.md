# Dalga 2 raporu — Web ve masaüstü yüzeyi

Tarih: 2026-08-26 · Branch `uat` · commit yok.
Beş şeridin beşi de kapandı. Eski `AppStartupScreen` kaldırıldı; açılış ekranı artık tek yüzey.

---

## Ş7 · Ortak bileşen ailesi

**Yeni dosyalar:** `splash-visuals.ts`, `splash-parts.tsx`, `splash-screen.tsx` ve
`splash-screen.test.tsx` (23 test), hepsi `apps/web/src/components/splash/` altında.
**Stil:** `globals.css` sonuna ~800 satırlık `.whispr-splash-*` bloğu — Tailwind yardımcı
sınıfı SPEC'in 12.5/10.5/11.5px ondalıklarını taşıyamaz; değerler CSS'te birebir yazıldı,
renkler yalnız `hsl(var(--token))`.

- Animasyonlar SPEC §3.2'den birebir, `whispr-splash-` önekiyle: `drift`, `breathe`, `glow`, `dot`.
- **`auth-equalizer` global keyframe'ine dokunulmadı.** Ölçüldü: `.whispr-logo-icon-animated`
  kuralı zaten `2.1s cubic-bezier(.45,0,.2,1)` ve `transform-origin: center` veriyor — yani
  süre, eğri ve merkez SPEC §2 ile aynı. Farklı olan tek şey kare kümesiydi
  (`scaleY(.55)` @45%, opaklık .72), o yüzden splash yalnız `animation-name`i
  `whispr-splash-equalizer` ile değiştiriyor (`.5→1` @50%, `.68→1`). Giriş ekranı etkilenmiyor.
- Kontrast kuralı **tipe kazındı**: `SplashStateVisual.tone` metin rengi (daima okunur varyant),
  `tile` doygun tonun tint'i. İkisi ayrı alan olduğu için karıştırılamıyor.
- İpucu seçimi `useSyncExternalStore` ile istemcide bir kez yapılıyor: sunucu anlık görüntüsü
  boş, hidrasyondan sonra gerçek değer. Hidrasyon uyuşmazlığı da düzen sıçraması da yok.

## Ş8 · Web açılış ekranı ve devralma

- `wizards-shell.tsx` artık `SplashScreen surface={isDesktopRuntime ? "desktop" : "web"}` çiziyor.
- `use-shell-readiness.ts` Dalga 1'in motoruna bağlandı; `status` yerine `state` + `step` döner.
  `bootstrapRequestSettled` = `layoutSettingsQuery.isFetched || serversQuery.isFetched`
  (`isSuccess` değil: hataya düşen istek de bağlantının kurulduğunu kanıtlar).
- Ağ durumu için yeni `use-online-status.ts` (`navigator.onLine` + `online`/`offline` olayları).
- **Dar ekran (K12):** `useResponsiveLayout().isMobile` (767px eşiği, depoda zaten var) SPEC §6
  düzenine geçiriyor. Üçüncü düzen yazılmadı.
- **Devralma (K13) tamam:** `wizards-shell`, `/desktop/start`, masaüstü OAuth claim ve login
  masaüstü overlay'i yeni bileşene geçti. `app-startup-screen.tsx` + testi **silindi**,
  `startup.*` anahtarları tr/en'den **çıkarıldı**, `readiness.ts`'in ölü ihracatları
  (`AppStartupStatus`, `getShellReadinessStatus`, `SHELL_SPLASH_*`, `shouldMountShellSplash`,
  `shouldShowShellSplash`, `getShellSplashPhaseAfterMaxTimeout`, `isShellReady`) kaldırıldı.
  `session.ts` artık `SplashPhase` kullanıyor. Depoda `AppStartupScreen` için **sıfır** referans.

### React Compiler kapısının şekillendirdiği iki karar

1. `set-state-in-effect` kuralı ipucu seçimini efektten çıkardı → `useSyncExternalStore`.
2. `refs` kuralı "render sırasında ref okuma"yı yasakladı; adımın geri saymaması
   `useState` + React'in "render sırasında durumu düzelt" kalıbıyla korundu.

## Ş9 · Masaüstü penceresi (K3, K4)

- `lib.rs`: `DESKTOP_SPLASH_WINDOW_WIDTH/HEIGHT` **432 × 292 → 648 × 474**.
  Görünen kabuk tam **630 × 420** (=420 × 280 CSS px); aradaki fark saydam gölge payıdır
  (6 yan / 4 üst / 32 alt CSS px). Dikey pay eşit değil çünkü gölge 26px aşağı kaymış:
  kök `padding-bottom: 28px` ile kabuğu yukarı itiyor.
- `prepare_desktop_start_window()` native gölgeyi kapatıyor (`set_shadow(false)`);
  `promote_desktop_window()` ana ölçüye terfi ederken geri açıyor.
- Pencere zaten `.transparent(true)` + `.decorations(false)` idi — K4 için yeni bayrak gerekmedi.
- Ölçek: `desktop-start-client.tsx` mount olduğu sürece `<html>` üzerine
  `whispr-splash-desktop-scale` sınıfı koyuyor; CSS `zoom: 1.5` uyguluyor
  (+ `@supports not (zoom: 1)` altında `transform: scale(1.5)` yedeği).
  **Hiçbir tasarım değeri elle 1,5 ile çarpılmadı.**
- Sürüklenebilirlik: kabuk `data-tauri-drag-region` taşıyor; düğmeler taşımıyor.
- Minimum görünme 760 ms → `SPLASH_TIMINGS.minVisibleMs` (600 ms).
- Adımlar gerçek: `Bağlanıyor` oturum çözümü uçarken, `Oturum doğrulanıyor` yanıt dönünce,
  `Sunucular yükleniyor` pencere terfi edip çalışma alanına gidilirken. Dördüncü adımı kabuk devralıyor.

### Canlı doğrulama (tarayıcıda, `/desktop/start`)

Yerel geliştirme sunucusunda ölçüldü:

| Ölçüm              | Beklenen                   | Bulunan                        |
| ------------------ | -------------------------- | ------------------------------ |
| `<html>` `zoom`    | 1.5                        | `1.5`                          |
| Kabuğun ilk çocuğu | aurora                     | `whispr-splash-aurora`         |
| Kolon zemini       | saydam                     | `rgba(0, 0, 0, 0)`             |
| İşaret kutusu      | 56 CSS px (=84 cihaz px)   | `84 × 84`                      |
| Halka              | 92 CSS px (=138)           | `138 × 138`                    |
| Panel              | 176 CSS px (=264)          | `264`                          |
| Kabuk köşesi       | 16px                       | `16px`                         |
| Çubuk animasyonu   | `2.1s` splash keyframe'i   | `whispr-splash-equalizer 2.1s` |
| Aurora             | `drift 15s`                | `whispr-splash-drift 15s`      |
| DS wordmark        | gizli                      | `display: none`                |
| Adımlar            | 1 onaylı, 2. aktif         | `done/current/pending/pending` |
| Rozet              | kanal `development` → UAT  | `UAT`                          |
| Sürüm              | build yok → parantez düşer | `Whispr 0.8.15 · Echo`         |

## Ş10 · Dört durum

Bileşen dört durumu da çiziyor: karo + 10px etiket + başlık + açıklama + eylem, aurora tek
radyale düşüyor, logo duruyor ve `opacity:.9` oluyor. Web ölçeği tek bir değişkenle
(`--whispr-splash-state-scale: 1.3`) türetiliyor; her durum için ayrı sayı yazılmadı.

**Üretici (producer) durumu — dürüst tablo:**

| Durum            | Web kabuğu                                      | Masaüstü açılış penceresi |
| ---------------- | ----------------------------------------------- | ------------------------- |
| `slow`           | ✅ 10 sn sayacı                                 | ✅ 10 sn sayacı           |
| `offline`        | ✅ `navigator.onLine` + otomatik yeniden deneme | ✅ aynı                   |
| `updating`       | — (K10: web'de indirilecek artıfakt yok)        | ⚠️ **üreticisi yok**      |
| `sessionExpired` | ⚠️ **üreticisi yok**                            | ⚠️ **üreticisi yok**      |

İki boşluk aşağıda "Açık kalan kararlar"da anlatıldı. Bileşen tarafı ikisi için de tam:
prop verildiğinde doğru çiziyor ve testleri var.

## Ş11 · Parity ve e2e

Yeni `apps/web/e2e/specs/design/splash-parity.spec.ts` — SPEC §10'un altı kriterini ölçüyor:
aurora kökte + kolonlar saydam, işaret 56×56 ve halkayla eş merkezli (≤0.5px) + `<a>` yok +
DS wordmark gizli, rozet/sürüm görünür, 630×420 penceresinde ipucu kırpılmıyor ve sürümle
aynı satırda değil, `-soft` tonları iki temada da ≥4.5:1, hareket azaltma altında çalışan
animasyon kalmıyor, dar görünüm alanı SPEC §6 düzenine geçiyor, Axe `critical/serious` sıfır.
Açılış ekranı geçici olduğu için spec ağ yanıtlarını bilerek geciktirip ekranı ayakta tutuyor.

**Koşulamadı** — yerel e2e ortamı (tohumlanmış DB + build) bu oturumda ayağa kaldırılmadı.

---

## Kapı komutları

| Komut                                                    | Sonuç                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm --filter @wizards/types test`                      | ✅ 565 test, 0 fail                                              |
| `pnpm --filter @wizards/web typecheck`                   | ✅ temiz                                                         |
| `pnpm --filter @wizards/web lint`                        | ✅ temiz                                                         |
| `apps/desktop/src-tauri` → `cargo test`                  | ✅ 30 test, 0 fail                                               |
| `apps/desktop/src-tauri` → `cargo clippy -- -D warnings` | ✅ temiz                                                         |
| `apps/desktop` → `node --test scripts/*.test.mjs`        | ✅ 96 test, 0 fail                                               |
| `apps/web` → splash + locale + app-startup testleri      | ✅ 48 + 23 test, 0 fail                                          |
| `pnpm --filter @wizards/web test`                        | ✅ 7305 test, 7302 pass, 0 fail, 3 skip (önceden de atlanıyordu) |
| `pnpm --filter @wizards/mobile test`                     | ✅ 1957 test, 0 fail                                             |
| `pnpm --filter @wizards/mobile typecheck`                | ✅ temiz                                                         |
| e2e `splash-parity.spec.ts`                              | ⛔ koşulamadı (yerel e2e ortamı yok)                             |

---

## Açık kalan iki karar (senin kararın)

> **Karar alındı (2026-08-26):** `updating` ve `sessionExpired` üreticileri **mobilde**
> kalıyor (Dalga 3); web ve masaüstünde bu iki durum tetiklenmiyor. Bileşen tarafı hazır,
> prop verildiğinde doğru çiziyor. Aşağıdaki iki bölüm gerekçe kaydı olarak duruyor.

### 1. `updating` durumunun üreticisi yok

SPEC §7/§8 açılışta bir güncelleme indirildiğini varsayıyor ("İndirme bitince uygulama kendini
yeniden başlatır"). Depoda güncelleme **kullanıcı tetikli**: `desktop-native-update-notifier`
ayrı bir masaüstü kontrol penceresini açıyor, indirme orada koşuyor. Açılışta otomatik
güncelleme kontrolü/indirmesi **yok** ve onu eklemek ürün davranışı değişikliği (splash tasarımı
değil). Bileşen prop verildiğinde gerçek yüzdeyi çiziyor;
`apps/web/src/lib/desktop/updater.ts`'in `onProgress` geri çağrısı doğrudan bağlanabilir.

Seçenekler: (a) açılışta güncelleme kontrolü + indirme akışı eklensin, (b) durum yalnız
mobil Android APK indirmesinde görünsün (Dalga 3), (c) şimdilik böyle kalsın.

### 2. `sessionExpired` durumunun üreticisi yok

Web kabuğu yalnız oturumu olan kullanıcıya çiziliyor; 401 kabuğa ulaşmadan auth katmanı
`/login`e yönlendiriyor. Masaüstü açılış penceresi oturumu çözüyor ama `authenticated === false`
"oturum bitti" değil, "hiç giriş yapılmamış" da olabilir — ilk kez açan kullanıcıya
"Oturumun sona erdi" demek yanlış olurdu. Ayırt etmek için "daha önce giriş yapılmıştı"
işareti gerekiyor (ör. masaüstünde kalıcı bir bayrak).

Seçenekler: (a) masaüstüne "daha önce giriş yapıldı" işareti eklensin ve 401'de durum 4
gösterilsin, (b) durum yalnız mobilde görünsün (mobil auth katmanında gerçek 401 var),
(c) şimdilik böyle kalsın.

## Bilinen sapmalar (Dalga 2'de doğanlar)

| Sapma                                            | Gerekçe                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Masaüstü kabuğunda **dış gölge çizilmiyor**      | Pencere tam 630 × 420 ve kabuk onu dolduruyor; `0 26px 58px -26px` gölgesi pencere kutusunun dışına düşerdi. Köşe (16px) ve 1px kenar var. Gölge istenirse pencereye saydam bir kenar payı eklenmeli (pencere ölçüsü büyür) — senin kararın. Ana pencere içindeki overlay varyantında (login/OAuth) gölge **çiziliyor**. |
| `updating` metni şablon                          | Dalga 1'de onaylandı; ek olarak sürüm/boyut bilinmiyorsa `splash.state.updating.descriptionUnknown` ile cümlenin yalnız ikinci yarısı yazılıyor.                                                                                                                                                                         |
| `updating` etiket tonu `--primary-readable`      | SPEC tablosu doygun `--primary` yazıyor; o beyaz kartta 3,4:1 veriyor ve §10'un 5. kriterini düşürüyordu. Depoda bu iş için türetilmiş token kullanıldı, karo tint'i değişmedi.                                                                                                                                          |
| `SplashUpdateProgress`'e `version` alanı eklendi | Durum metnindeki `{version}` gerçek veriden gelmeli; Dalga 1 sözleşmesi yalnız baytları taşıyordu.                                                                                                                                                                                                                       |
| Web'de üç nokta çizilmiyor                       | Referans dosyada web karesinde üç nokta yok (yalnız masaüstü ve mobil).                                                                                                                                                                                                                                                  |

## Dokunulan dosyalar

**Yeni:** `apps/web/src/components/splash/*` (3 modül + 1 test),
`apps/web/src/hooks/use-online-status.ts`, `apps/web/e2e/specs/design/splash-parity.spec.ts`.

**Değişen:** `apps/web/src/app/globals.css`, `apps/web/src/components/shell/wizards-shell.tsx`,
`apps/web/src/hooks/use-shell-readiness.ts`, `apps/web/src/lib/app-startup/{readiness.ts,readiness.test.ts,session.ts}`,
`apps/web/src/app/desktop/start/desktop-start-client.tsx`,
`apps/web/src/app/(auth)/login/login-client.tsx`,
`apps/web/src/app/desktop/oauth/claim/[token]/desktop-oauth-claim-client.tsx`,
`apps/web/src/lib/locale/messages/{tr,en}.ts`, `apps/mobile/src/locale/mobile-copy.ts`,
`packages/types/src/splash.ts` (+ testi), `apps/desktop/src-tauri/src/lib.rs`,
`.claude/launch.json` (yerel önizleme için).

**Silinen:** `apps/web/src/components/app/app-startup-screen.tsx` ve `.test.tsx`.

**Dokunulmadı:** `apps/mobile/src/**` (Dalga 3), `@keyframes auth-equalizer`, `.auth-*` sınıfları,
`app-update-notifier.tsx`'in `WHISPR_BUILD_ID` sözleşmesi.
