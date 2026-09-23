# 00 — Ortak bağlam (her şerit bunu önce okur)

Bu dosya uygulanmaz. `01`–`11` arasındaki her prompt buradaki kuralları, gerçekleri ve şemaları **veri** kabul eder. Buradaki bir gerçek yanlış çıkarsa düzeltilir ve şerit raporuna yazılır; yeniden keşif için zaman harcanmaz.

**Rol:** Discord/Slack sınıfı bir masaüstü + web gerçek zamanlı iletişim ürününü işletmiş Principal Engineer — tarayıcı performansı (Chromium/WebView2 iç işleyişi, React 19 + React Compiler), Node gerçek zaman sunucuları, Rust/Tauri ve yazılım mimarisinde derin. Görev: Whispr web ve masaüstünü ölçülebilir biçimde o sınıfa taşımak.

**Hedefin tanımı.** "En üst seviye" = aşağıdaki üç eksende ölçülen, D4'te kapıyla korunan iyileşme:

| Eksen           | Kullanıcının hissettiği                                                                            | Ölçü (D0'da tanımlanır)                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Performans      | Uygulama anında açılır, kanal geçişi takılmaz, yazarken gecikme yok, saatlerce açık kalınca şişmez | ilk yükleme JS'i, LCP/CLS/INP vekili, etkileşim süreleri, uzun görevler, heap eğimi, masaüstü açılış + RSS |
| Kod kalitesi    | Değişiklik hızlı ve güvenli yapılır                                                                | sıcak nokta puanı, dosya/fonksiyon büyüklüğü, tip ve hata disiplini, test hızı ve kırılganlığı             |
| Sistem tasarımı | Özellik eklemek bir yeri bozmaz; ölçek büyüyünce çökmez                                            | modül sınırı ihlali, döngü sayısı, kopya iş mantığı, durum sahipliği, süreç modeli                         |

Kamuya açık eşikler referanstır, uydurma değil: Core Web Vitals "iyi" eşiği p75'te LCP ≤ 2,5 sn, INP ≤ 200 ms, CLS ≤ 0,1 `[public-ref: web.dev/vitals]`; girdiye 100 ms içinde görsel yanıt (RAIL) `[public-ref: web.dev/rail]`; uzun görev = ana iş parçacığında > 50 ms `[public-ref: Long Tasks API]`. Whispr'a özgü bütçeler D2'de ölçülen temel çizgiden türetilir.

---

## 1. Çalışma kuralları

### 1.1 Git ve dosya disiplini

- Dal `main`. **Commit, push, `git add`, `git stash`, `git reset`, `git checkout -- <dosya>`, branch değişimi yok.** Kullanıcı commit'i kendisi atar.
- Analiz şeritleri (D1: Ş1–Ş6, D2: Ş7) **salt okunur**: yalnız `docs/prompts/web-masaustu-performans-kalite-2026-09/raporlar/` altına yazar. Kusur görülür, düzeltilmez.
- Uygulama şeritleri (D0 Ş0, D3 `U-*`, D4 Ş8) yalnız kendi promptunda / `08-plan.json`'daki `touches` listesinde adı geçen dosyalara yazar. Liste dışı bir dosyaya dokunma ihtiyacı çıkarsa dur, gerekçeyi rapora yaz.
- **Paralel oturumlar var.** Başlarken ve bitirirken `git status --short` al; senin dokunmadığın bir dosya aradan değiştiyse raporda belirt, o dosyaya dokunma.
- **EOL tuzağı:** repo CRLF/LF karışık; `core.autocrlf=false`. Git Bash `sed -i` dosyayı LF'ye çevirir ve tüm dosya diff'lenir. Düzenleme = Edit aracı veya EOL koruyan node betiği. Bitişte `git diff --stat` ile yalnız hedef satırların değiştiğini doğrula.
- Migration yazma, `prisma migrate` koşma. Şema değişikliği gerekirse bulgu/karar olarak yaz.
- Yeni bağımlılık ekleme (K3 aksini demedikçe). Ölçüm yardımcıları scratchpad'de ya da repodaki mevcut araçlarla.

### 1.2 Dil

- Kullanıcıya dönen sohbet metni **caveman ultra**: artikel/dolgu yok, parça cümle serbest, teknik terim birebir.
- Rapor dosyaları (`raporlar/*.md`) okunur, düz Türkçe — başka bir oturum onları tek başına anlayabilmeli.
- Kod, kod yorumu, commit mesajı önerisi normal yazılır. Yorum dili çevredeki kodun dili (yeni kodda Türkçe _neden_ yorumu yaygın).

### 1.3 Ağaç durumu ve parmak izi

Çalışma ağacı kirli (~207 dosya, 2026-09-23). K1 kararı:

- **K1-A (önerilen):** kullanıcı bekleyen işi commit'ler; temel çizgi temiz bir SHA'dır.
- **K1-B:** temel çizgi = HEAD + WIP. Parmak izi zorunlu.

Her ölçüm kaydı ağaç parmak izini taşır:

```bash
git rev-parse HEAD
git diff HEAD | git hash-object --stdin
```

İkisi birlikte `treeFingerprint` = `<head>+<diffHash>`. D3'te önce/sonra ölçümü **aynı şerit içinde, arka arkaya** alınır; aradaki tek fark şeridin kendi diff'idir. D0 temel çizgisi genel ilerlemenin referansıdır, şerit kazancının değil.

### 1.4 Hız

- Her prompt tek oturumda bitirilebilecek bir dilimdir. Alt görevlere, ek turlara bölme.
- Aynı dosyayı iki kez okuma. Başka şeridin raporundaki gerçeği yeniden türetme, oradan oku.
- Kapı komutları prompt sonunda bir kez koşar.

---

## 2. Analiz disiplini

Platform denetimi paketinin (`platform-denetimi-2026-08/00` §2) kuralları aynen geçerli:

1. **Kanıtsız bulgu yasak.** Her bulgu ≥ 1 `file:line` + satırdan alıntı taşır.
2. **Genel tavsiye yasak.** "Memo ekleyin", "cache koyun" bulgu değildir. Bulgu = _bu kod, bu girdide, bu ölçülen/izlenebilir maliyeti üretir_.
3. **Uydurma sayı yasak.** Ölçülmeyen süre/boyut yazılmaz; `openQuestions`'a koşulabilir komutla gider. Bayt sayısı ölçülmüşse süre etkisi yine **hipotez** olarak etiketlenir.
4. **Rakip iç verisi uydurmak yasak.** Discord/Slack/Teams hakkında yalnız kamuya açık, doğrulanabilir bilgi `[public-ref]`; çıkarım `[assumption]`. Etiketsiz iddia silinir.
5. **Çerçeve belgesi tekrarı yasak.**

**Çürütme zorunlu.** Yazmadan önce bulguyu çürütmeyi dene (guard, test, derleyici davranışı, çağıran yok mu?). Sonuç `refutation` alanına. `confidence`: `confirmed` (kod yolu izlendi veya ölçümle üretildi) · `probable` (güçlü sinyal, tüm çağıranlar izlenemedi — nedeni yazılır). Daha zayıfı `openQuestions`.

**React Compiler açık** (`apps/web/next.config.ts:111` `reactCompiler: true`). "Eksik `useMemo`/`useCallback`" bulgusu ancak derleyicinin o bileşeni **derlemediği** (bail-out, `"use no memo"`, kural ihlali) kanıtlanırsa yazılır. Aksi halde gereksiz render iddiası ölçümle (React Profiler / trace) desteklenmek zorunda.

---

## 3. Ölçüm disiplini

- **Yalnız production build ölçülür.** `next dev` ve Tauri debug build performans verisi değildir (K2-B istisnası rapora yazılır).
- Her metrik: `id`, `value`, `unit`, `runs` (N), `median`, `p95` (N ≥ 10 ise) veya `min/max`, `method` (**aynen koşulabilir komut**), `env`, `treeFingerprint`, `measuredAt`.
- `env` kaydı: CPU modeli, çekirdek, RAM, güç planı, Node sürümü, Chromium/WebView2 sürümü, throttle profili, arka planda açık ağır uygulama var mı.
- **Profiller:** `masaustu` (throttle yok) ve `dusuk` (CDP `Emulation.setCPUThrottlingRate` = 4). Ağ throttle'ı yalnız ilk yükleme senaryolarında, kayıtlı profille.
- **Tekrar:** laboratuvar senaryoları N ≥ 5 (tercihen 10), ilk koşu ısınma sayılıp atılır. Masaüstü açılış N ≥ 10, koşular arası ≥ 20 sn bekleme.
- **Gürültü eşiği:** bir değişiklik "kazanç" sayılırsa fark hem ≥ %5 hem ≥ 2 × MAD (median absolute deviation) olmalı ve tekrar koşuda yön korunmalı. Aksi halde "gürültü içinde".
- **Yan etkiler:**
  - `next build` izlenen `apps/web/next-env.d.ts`'yi yeniden yazar. Build öncesi içeriği sakla, build sonrası birebir geri yükle, `git status` ile doğrula.
  - `apps/web/server.ts:93` `startOutboxWorker()` ve `:97` `startDisappearingMessageWorker()` web süreci içinde başlar. Yerel `.env` gerçek üçüncü taraf anahtarları taşıyabilir. Ölçüm sunucusunu başlatmadan önce e-posta/push/depolama anahtarlarını süreç ortamında boş değerle ez, yerel seed'li DB kullan; hiçbir ölçüm gerçek kullanıcıya e-posta/push gönderemez.
  - Yerel `apps/web/.env` içindeki `E2E_TEST_PASSWORD` yalnız rakamsa yeni parola politikası kayıt akışını kırar (CI base64url üretir). Ölçüm kullanıcısını seed ile oluştur.
  - Node 26 `localStorage`'ı global tanımlar (değeri undefined olabilir); `apps/web/src/lib/browser-local-storage.ts` bu yüzden var. Sunucu tarafı ölçüm betiklerinde tarayıcı API'si varsayma.

---

## 4. Doğrulanmış gerçekler (2026-09-23, HEAD `95493d28` + WIP)

### 4.1 Platform haritası

- **Masaüstü kendi UI'ını taşımaz.** Tauri 2 kabuğu uzak web içeriğini yükler: `WebviewUrl::External(initial_main_url)` (`apps/desktop/src-tauri/src/lib.rs:1113`), voice-mini/overlay/ek pencereler de External (`lib.rs:4832,4999,5109`), ayarlar kontrol düzlemi `WebviewUrl::CustomProtocol` (`lib.rs:4625-4628`). İçerik performansı = web performansı; masaüstüne özgü yüzey = kabuk açılışı, IPC, WebView2 süreç ağacı, arka plan iş parçacıkları, yayın boyutu.
- `configured_app_url()` (`lib.rs:5500`): önce çalışma zamanı env `WHISPR_DESKTOP_WEB_URL`, sonra derleme zamanı `option_env!`; release build'de boşsa panic, `https` değilse panic (`lib.rs:5519-5521`); debug'da varsayılan `http://localhost:3000`.
- `tauri.conf.json`: `frontendDist: "https://whispr.invalid"`, `devUrl: http://localhost:3000`, `removeUnusedCommands: true`, bundle hedefi yalnız `nsis` (Windows). macOS/Linux kapsam dışı.
- Web sunucusu Next değil, özel `apps/web/server.ts` (101 satır): HTTP + Socket.IO (Redis adapter) + süreç içi outbox ve disappearing-message işçileri. Ayrıca ayrı outbox worker servisi (`start:outbox-worker`).

### 4.2 Web ölçeği

| Ölçü                                              | Değer                                                                                  | Nasıl                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `apps/web/src` test dışı ts/tsx                   | 1.774 dosya / ~309k satır                                                              | `find … ! -name '*.test.*' \| xargs cat \| wc -l` |
| `route.ts`                                        | 339                                                                                    | `find apps/web/src/app/api -name route.ts`        |
| `page.tsx` / `layout.tsx`                         | 62 / 5                                                                                 | find                                              |
| `"use client"` dosyası                            | 545                                                                                    | `grep -rl '"use client"' apps/web/src`            |
| `next/dynamic` kullanan dosya                     | 4 (`emoji-picker`, `command-palette-provider`, `settings-sections`, …)                 | grep                                              |
| `@tanstack/react-virtual` kullanan                | 3: `chat/message-list.tsx`, `mentions/mentions-feed.tsx`, `dm/group-create-dialog.tsx` | grep                                              |
| zustand store dosyası / `useQuery` kullanan dosya | 5 / 88                                                                                 | grep                                              |
| Web birim testi                                   | ~8,8k test, ~94 sn (principal 09-21)                                                   | `pnpm --filter @wizards/web test`                 |

En büyük test dışı dosyalar (satır): `locale/messages/tr.ts` 5.656 · `en.ts` 5.611 · `providers/live-voice-provider.tsx` 3.306 · `shell/channel-sidebar.tsx` 2.134 · `chat/message-input.tsx` 2.093 · `dm/service.ts` 2.070 · `servers/metrics.ts` 2.011 · `shell/wizards-shell.tsx` 1.997 · `settings/tree.ts` 1.962 · `chat/message-item.tsx` 1.711 · `chat/chat-area.tsx` 1.658 · `workspace/server-service.ts` 1.605 · `dm/group-service.ts` 1.574 · `friends/friends-view.tsx` 1.543 · `desktop/desktop-experience.tsx` 1.357.

### 4.3 Web performans gerçekleri ve adaylar

Gerçek (okundu):

- Next 16.3.5 Turbopack, React 19.3, `reactCompiler: true`, `reactStrictMode: true`, `experimental.cpus: 4` (`next.config.ts`). `@next/bundle-analyzer` yalnız `ANALYZE=true` ile (`next.config.ts:72`).
- QueryClient varsayılanı: `staleTime: 60_000`, `gcTime: 10 dk`, `refetchOnWindowFocus: false` (`apps/web/src/lib/query-client.ts:4-12`). "Odakta toplu refetch" bulgusu **yazılmaz**; yalnız tekil sorgular bunu ezerse.
- Sentry istemci `tracesSampleRate: 0.05` (`src/instrumentation-client.ts:12`), sunucu 0.1. Saha Web Vitals verisi Sentry'de olabilir; erişim doğrulanmadı.
- `apps/web/src` içinde `web-vitals`, `PerformanceObserver`, `performance.mark` kullanımı **yok**. Repoda bundle bütçesi yok; kök `tests/performance/` boş.
- `Server-Timing` başlığı 10 sıcak rota dosyasında var (kanal/DM mesajları, `dm`, `events`, `notifications`, mobil bootstrap…).
- Principal F-08 ölçümü (09-21, tek örnek, gzip -6): `/messages/[conversationId]` ilk yükleme 1.265 KB gz · `/channels/[serverId]/[channelId]` 1.240 · `/home` 1.112 · `/settings` ~667 · `/login` 472 · ortak kök 313. Kökte zod ağırlıklı 89 KB gz chunk; livekit-client 139 KB gz sesle ilgisiz rotalarda eager; Krisp WASM 1,9 MB gz lazy (`live-voice-provider.tsx:222-229`).

Aday (kanıt var, etki doğrulanmadı — ilgili şerit doğrular veya çürütür):

- **LiveKit her oturumlu sayfada:** `components/providers/voice-provider.tsx:5` `LiveVoiceProvider`'ı statik import eder; `authenticated-app-providers.tsx:72` onu tüm oturumlu ağaca sarar. (Ş1)
- **İki dil birden istemcide olabilir:** `locale-provider.tsx:27,31` dil dosyalarını dinamik import eder, ama `src/lib/locale.ts:7-8` ikisini statik import eder ve `@/lib/locale`'i import eden 5 `"use client"` dosyası var. (Ş1)
- **Kök layout 6 `localFont`** (`src/app/layout.tsx:26-59`), hiçbirinde `preload` ayarı yok (varsayılan açık). Her sayfada kaç font dosyası preload ediliyor ölçülmeli. (Ş1)
- `channel-sidebar.tsx:1149,1431` kanal önizleme `prefetchChannel` — tetik sıklığı ve maliyeti. (Ş1/Ş2)

### 4.4 Sunucu ve gerçek zaman

- `docs/operations/workspace-performance-monitoring.md`: `WORKSPACE_PERFORMANCE_METRICS=true` ile `[workspace-performance]` log'u; `emitChannelMessageFanout` her gönderimde iki küme çapı `fetchSockets()` bekler.
- Principal F-09: fan-out mantığı iki yolda kopya (`socket/handlers/message.ts:114-139` ≡ `workspace/channel-message-send-service.ts:40-65`). F-10: mesaj başına O(çevrimiçi üye) iş, `recordMessageSendFanoutMetric` ölçüyor.
- `bcryptjs` 9 dosyada; sıcak çağrılar async `bcrypt.compare/hash` (saf JS, event loop'ta CPU yakar — Ş3 ölçer).

### 4.5 Masaüstü

- Rust: 12 dosya / 8.288 satır; **`lib.rs` 6.476 satır**. 38 `#[tauri::command]`'ın hepsi `lib.rs`'te; **13'ü `async fn`, 25'i senkron.** Tauri 2'de `async` olmayan komut, `#[tauri::command(async)]` denmedikçe ana iş parçacığında koşar `[public-ref: v2.tauri.app/develop/calling-rust]` — her birinin iş yükü Ş4'te okunur.
- `lib.rs` içinde `std::thread::spawn` (`:3470`, `:5252`), eşzamanlı `std::fs::read*` (`:3551`, `:3806`, `:3908`).
- `Cargo.toml`'da **`[profile.release]` yok** (LTO/codegen-units/strip varsayılan). Bağımlılıklar: tauri 2 (`tray-icon`, `macos-private-api`), sentry 0.49.3 (`minidump` — ikinci süreç), sysinfo 0.39.6, tauri-plugin-notification, Windows'a özgü crate'ler.
- `apps/desktop/scripts/measure-windows-desktop.ps1:85-86`: `cold-start` ve `warm-start` metrikleri **`NOT_RUN`** — "No native interactive-ready acknowledgement bridge is available." WorkingSet örneklemesi var (`:297-304`).
- Test: `lib.rs` içinde 38 `#[test]`, `src-tauri/tests/glib_variant_security.rs`; `apps/desktop/scripts/*.test.mjs` (release/manifest/ölçüm sözleşmeleri).
- `docs/desktop/desktop-native-evolution.md`: hedef mimari (paketlenmiş yerel kontrol düzlemi, uzak içeriğe en az yetki). `apps/desktop/NATIVE_MEDIA_RESEARCH.md`: native medya araştırma kapılı.

### 4.6 Kod ve mimari

- Import döngüleri (principal F-16, kaynakta doğrulandı): `analytics/service → badges/badge-triggers → badges/badge-service → workspace/workspace-events → voice/service → analytics/service`; `account/privacy-service → outbox/service → attachments/scanner → account/privacy-service`; üçüncüsü (`socket/context ↔ runtime ↔ rooms`) doğrulanmadı.
- `packages/ui` ~147 satır, fiilen kullanılmıyor. `@wizards/types` `exports` → `./src/index.ts` (build'siz).
- ESLint'te sınır kuralı tek `no-restricted-imports` bloğu (`apps/web/eslint.config.mjs:48`).
- Ölü kod turu 2026-09-20'de uygulandı (241 export, 9 dosya); kalanlar kullanıcı kararında (`.design-sync`, 958 ölü web i18n anahtarı, 318 gereksiz `import React`). Tekrar tarama; yalnız referans ver.

### 4.7 Araç zinciri ve kapılar

- Node 26.10.0 (WIP), pnpm 12.5.1, TypeScript 7.0.2 (tsgo), Rust 1.98.1, Tauri 2.11.6, Playwright 1.63.
- `apps/web/scripts/run-node-tests.mjs` yalnız `apps/web/src/**/*.test.ts(x)` toplar. `apps/web/scripts/*.test.mjs` **web `test`'inde koşmaz**; `lint` script'i dört tanesini adıyla koşar. Yeni betik testi eklerken nerede koşacağını açıkça bağla.
- Playwright: ana config `testDir: "./e2e/specs"` (`playwright.config.ts:115`); ayrı config emsali `playwright.quality-dashboard.config.ts` (`testDir: ./e2e/local-quality-dashboard`). Projeler: `chromium`, `chromium-real-media`, `firefox`, `webkit`.
- Yerel kapı: `scripts/quality/Invoke-LocalGate.ps1` + `local-gate-profiles.json` (`Fast`, `Standard`, `CI`, `Desktop`, `E2ESmoke`, `E2ERealtime`, `E2EFull`, …). `pnpm test:toolchain` = `node --test scripts/quality/*.test.mjs`.
- GitHub Actions 2026-09-20'de fatura nedeniyle kilitliydi (her job 0 dk `failure`). Başlarken `gh run list -L 5` ile doğrula; CI yoksa yerel kapı kanonik.

---

## 5. Önceki işlerle mutabakat

Her analiz şeridi kendi alanındaki önceki bulguların durumunu yazar: `acik` · `kapandi` · `kismen` · `gecersiz` + kanıt. Aynı kusuru yeni kimlikle yeniden bulgulamak yasak; `priorRef` ile bağla.

| Kaynak                                                                                                      | İlgili kimlikler                                                                       | Not                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/denetim/2026-09-21-principal-inceleme/01-ana-rapor.md`, `04-yol-haritasi.md`                          | F-01…F-17, yol haritası #1–#15, B1–B9                                                  | F-01–F-05 WIP'te uygulandı (`06-ilk-bes-bulgu-uygulama.md`), commit'lenmedi. "Korunması gereken kararlar" ve "Önerilmeyenler" bu pakette de bağlayıcı. |
| `docs/prompts/platform-denetimi-2026-08/raporlar/A*.findings.json`                                          | A1-001…006, A2-001…005, A4-001…003, A6-001                                             | A2-003 (mesaj listesi sanallaştırma) bugün `message-list.tsx`'te react-virtual var — durum doğrulanmalı.                                               |
| `docs/prompts/denetim-2026-08/15-web-istemci-render.md`, `16-web-sanallastirma-ve-paket.md`, `13-…`, `14-…` | ölü memo, kaçan queryKey, sanallaştırma, LiveKit bölme, `fetchSockets`, sınırsız okuma | Uygulanıp uygulanmadığı kodla doğrulanır.                                                                                                              |
| `docs/reports/react-compiler-eslint10-performance.md`                                                       | —                                                                                      | React Compiler kararı.                                                                                                                                 |
| `docs/operations/workspace-performance-monitoring.md`, `coverage-ratchet.md`                                | —                                                                                      | Mevcut metrik ve ratchet mekanizmaları; yenisini yazmadan önce bunlar.                                                                                 |
| `docs/prompts/ekran-paylasimi-2026-09/`                                                                     | Ş1–Ş9                                                                                  | Ekran paylaşımı yayını onların; burada yalnız referans.                                                                                                |

---

## 6. Graphify

- Kök `graphify-out/graph.json` 2026-09-20'de `95493d28`'den üretildi (44k düğüm, 107k kenar). Analiz şeritleri `graphify update .` **koşmaz**; uygulama şeritleri kod değiştirdikten sonra koşar.
- Doğal dil `query` gürültülü: `query "web client rendering performance"` test dosyalarına ve mobile savruldu (2026-09-23 denendi). **Gerçek sembol/dosya adı ver**, `explain "<sembol>"` ve `path "<A>" "<B>"` tercih et; kapsam iddiası için `--budget 8000` ve çıktıda `showing N of N`.
- Grafik AST tabanlı: `import("x").then(...)` ve `new Worker(new URL(...))` kenarlarını kaçırır (~377 kenar, ölü kod turunda ölçüldü). Paket ve döngü analizinde dinamik import'ları ayrıca `rg` ile tara.
- Grafik test düğümlerini de taşır; performans/mimari yorumunda `.test.` düğümlerini ayır.
- Kullanılan her sorgu `generatedFrom` alanına aynen yazılır.

---

## 7. Metrik kataloğu (D0 tanımlar, herkes kullanır)

Kimlik biçimi sabittir; D0 değerleri doldurur, sonraki şeritler yalnız bu kimliklere atıf yapar veya kendi yeni metriğini aynı biçimle **ekler**.

| Önek                         | Anlam                                                | Örnek                                |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------ |
| `M-BND-<rota>`               | Rota ilk yükleme JS, gzip + brotli                   | `M-BND-home`, `M-BND-root`           |
| `M-LAB-P<n>-<ölçü>-<profil>` | Laboratuvar senaryosu                                | `M-LAB-P4-interaction-dusuk`         |
| `M-SRV-<uç>-<ölçü>`          | Sunucu: Server-Timing, event loop gecikmesi, fan-out | `M-SRV-ELD-p99`                      |
| `M-DSK-<ölçü>`               | Masaüstü: açılış, RSS, CPU, boyut                    | `M-DSK-START-p50`, `M-DSK-RSS-10m`   |
| `M-DEV-<ölçü>`               | Geliştirme döngüsü süreleri                          | `M-DEV-typecheck-s`                  |
| `M-KOD-<ölçü>`               | Statik kalite/mimari sayaçları                       | `M-KOD-cycles`, `M-KOD-files-gt1000` |

---

## 8. Bulgu şeması

Her analiz şeridi `raporlar/S<n>.findings.json` yazar. Şema platform denetimininkinin genişletilmişidir; `Ş7` birleştirmeyi mekanik yapar.

```jsonc
{
  "lane": "S1",
  "laneTitle": "Web yükleme ve paket",
  "treeFingerprint": "95493d28…+3fa1c2…",
  "generatedAt": "2026-09-24",
  "generatedFrom": [
    "graphify explain \"LiveVoiceProvider()\"",
    "rg -n 'from \"livekit-client\"' apps/web/src",
  ],
  "surfaceCoverage": [
    {
      "surface": "rota ilk yükleme",
      "unitsTotal": 8,
      "unitsInspected": 8,
      "method": "…",
      "notCovered": [],
    },
  ],
  "priorStatus": [
    {
      "ref": "F-08",
      "status": "kismen",
      "evidence": "apps/web/…:12 — livekit hâlâ eager; bütçe betiği yok",
    },
  ],
  "findings": [
    {
      "id": "S1-001",
      "kind": "perf", // perf | quality | design
      "title": "Kusuru söyleyen başlık — çözümü değil",
      "severity": "high",
      "confidence": "confirmed",
      "platforms": ["web", "desktop"], // web | desktop | backend | infra
      "category": "bundle",
      "evidence": [
        { "file": "apps/web/src/…", "line": 5, "quote": "import { LiveVoiceProvider } from …" },
      ],
      "metricRefs": ["M-BND-home", "M-LAB-P2-lcp-dusuk"],
      "failureScenario": "Somut durum → ölçülen/izlenen maliyet.",
      "impact": "Kim, ne kadar, hangi metrikte. Bayt ölçüldüyse süre etkisi 'hipotez' diye etiketli.",
      "expectedGain": { "metric": "M-BND-home", "delta": "-139 KB gz", "basis": "measured-bytes" }, // measured-bytes | measured-time | hypothesis
      "fix": {
        "summary": "Tek cümle yön",
        "effort": "M",
        "risk": "med",
        "touches": ["apps/web/src/…"],
      },
      "behaviorChange": false,
      "priorRef": ["F-08"],
      "refutation": "Çürütme denemesi ve sonucu.",
    },
  ],
  "metrics": [
    {
      "id": "M-BND-home-modules",
      "value": 0,
      "unit": "…",
      "method": "aynen komut",
      "treeFingerprint": "…",
      "runs": 1,
    },
  ],
  "openQuestions": ["Şu ölçüm şu komutla yapılmalı: …"],
}
```

Alan kuralları: `id` = `S<n>-<3 hane>`, sonradan değişmez. `evidence` ≥ 1. `touches` gerçek yol veya glob; Ş7 bununla dosya çakışması hesaplar. `behaviorChange: true` ise kullanıcıya görünen davranış değişiyor demektir (Ş7 kararlar listesine taşır).

### 8.1 Puanlama

- **severity:** `critical` (üretimde toplu bozulma, veri kaybı) · `high` (düzenli algılanan yavaşlık/takılma, ölçülmüş ölçek duvarı, her değişikliği yavaşlatan yapısal borç) · `medium` (belirli akışta ölçülebilir maliyet, kırılgan sınır) · `low` (tek yüzeyde küçük maliyet, tutarsızlık).
- **effort:** `S` ≤ 1 gün · `M` ≤ 3 gün · `L` ≤ 2 hafta · `XL` > 2 hafta.
- **risk:** düzeltmenin regresyon riski — `low` (yerel, testli) · `med` (çok dosya, paylaşılan sözleşme) · `high` (gerçek zaman protokolü, kimlik, veri modeli, Tauri güven sınırı).
- **ROI** (Ş7 hesaplar): `etki / effort`, `confidence` ve `risk` ile ayarlanır; formül `08-plan.json` başına yazılır.

---

## 9. Tasarım ilkeleri (uygulama şeritleri için bağlayıcı)

- **Ölç, sonra değiştir, sonra yine ölç.** Performans amaçlı değişiklik gürültü eşiğini geçmiyorsa geri alınır — daha basit kod kazanır.
- **Tek tanım.** Aynı karar iki yerde yazılmışsa (F-09 sınıfı) düzeltme = tek tanım + iki çağıran. Yeni katman değil.
- **Yeni soyutlama üçüncü çağrı yerinde doğar.** İki yerde kopyala.
- **Var olan kapıya giriş ekle** (rate limit tablosu, invalidasyon tablosu, sınır kuralı); yanına ikinci kapı yazma.
- **DI deseni:** servis bağımlılıkları `dependencies` nesnesiyle enjekte edilir (`route-logic.ts` deseni); testte DB'ye ihtiyaç duyan kod yazma.
- **Refactor yalnız planlı bölme şeritlerinde** (K4) ve davranış korunarak. "Bu arada şunu da temizleyeyim" yok.
- **Yorum *neden*i anlatır.** Düzeltilen her tuzağa "eskiden şöyleydi, şu yüzden yanlıştı" yorumu.
- **Korunacak kararlar** (principal 04): izin filtreli `user:` odası fan-out'u; `auth-session` odasıyla anlık iptal; nonce + `strict-dynamic` CSP; link önizleme DNS pinleme; Postgres outbox + ayrı worker; ince `route.ts` + DI'li `route-logic`; `clientNonce` idempotensi; Tauri navigasyon/origin guard'ları ve updater imzası.
- **Önerilmeyenler:** mikroservis, framework değişimi, yeni veri deposu/kuyruk, kendi SFU, Socket.IO'dan göç, ölçümsüz yeni cache katmanı.

---

## 10. Repo tuzakları (ihlali test kırar veya sahte sonuç verir)

- `typecheck`/`lint` **pnpm üzerinden**: `scripts/quality/typescript-project-runner.mjs` `pnpm exec tsc --version` bekler; `npm run` ile derlemeden ölür (sahte hata).
- **Kaynak-metin sözleşme testleri:** bu repoda `*-contract.test.ts` ve benzerleri kaynak dosya içeriğinde sembol, testID, yol, sürüm arar. Dosya taşıma, sembol yeniden adlandırma, satır bölme tip kontrolünden geçer ama bu testleri kırar. Taşımadan/silmeden önce: `git grep -n "<sembol|dosya adı>" -- '*.test.*'`. Sürüm pinleyen testler regex-escaped olabilir (`/^\^?10\.10\.0$/u`) — düz grep kaçırır.
- Migration yalnız `packages/db/prisma/rebaseline-migrations/`; `prisma/migrations/` bayat.
- `@wizards/types` build'siz `src`'den okunur; tip değişikliği anında mobili de etkiler.
- Test çerçevesi `node:test` + `node:assert/strict` (web, types, db, desktop betikleri). Vitest yok. Web birim testinde DB yok.
- Rust değişikliğinden sonra `pnpm --filter @wizards/desktop lint:rust` (`cargo clippy -D warnings`) ve `cargo test`. `windows` crate 0.62 / webview2-com 0.39'a geçiş Tauri 0.61/0.38 istediği için **bloke** — önerme.

## 11. Doğrulama komutları

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web lint
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/desktop test
```

```bash
pnpm --filter @wizards/desktop lint:rust
```

```bash
pnpm test:toolchain
```

```bash
pnpm --filter @wizards/web e2e:smoke
```

Kod değiştiyse en son:

```bash
graphify update .
```

## 12. Kapı — analiz şeritleri (Ş1–Ş6)

1. JSON geçerli ve şemaya uyuyor:

```bash
node -e "const f=require('./docs/prompts/web-masaustu-performans-kalite-2026-09/raporlar/S1.findings.json');const req=['id','kind','title','severity','confidence','platforms','category','evidence','metricRefs','failureScenario','impact','fix','refutation'];const bad=f.findings.filter(x=>req.some(k=>x[k]===undefined)||!x.evidence.length||!x.fix.touches);console.log('bulgu',f.findings.length,'sema disi',bad.length,bad.map(x=>x.id).join(','));console.log('prior',(f.priorStatus||[]).length)"
```

2. Her kanıt dosyası var ve satır dosyanın içinde:

```bash
node -e "const fs=require('fs');const f=require('./docs/prompts/web-masaustu-performans-kalite-2026-09/raporlar/S1.findings.json');let bad=0;for(const x of f.findings)for(const e of x.evidence){if(!fs.existsSync(e.file)){console.log('YOK',x.id,e.file);bad++;continue}const n=fs.readFileSync(e.file,'utf8').split('\n').length;if(e.line>n){console.log('SATIR',x.id,e.file,e.line,'>',n);bad++}}console.log('kanit hatasi',bad)"
```

3. Her `metricRefs` kimliği ya `00-baseline.json`'da ya şeridin kendi `metrics` listesinde var.
4. `surfaceCoverage[].unitsInspected` dolu; `notCovered` gerekçeli.

`S1` yerine şeridin kendi numarası. Dördü geçmeden şerit "tamam" denmez.

## 13. Şerit bitiş raporu (kullanıcıya, caveman ultra)

1. Ne üretildi (dosya yolları).
2. En ağır 3–5 bulgu/değişiklik: kimlik + `file:line` + sayı.
3. Önce/sonra tablosu (uygulama şeritleri) — metrik, önce, sonra, fark, gürültü içinde mi.
4. Kapsam dışı bırakılanlar ve nedeni.
5. Kapı çıktısı (karar veren satırlar aynen).
6. "Commit atılmadı" notu + `git status --short` özetinde bu şeridin dosyaları.
