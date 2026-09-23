# D0 / Ş0 — Ölçüm temeli ve temel çizgi

Ön koşul: `00-ortak-baglam.md` okundu. K1, K2, K3 cevaplandı (README).
Tür: **uygulama** — yalnız ölçüm aracı yazar. Ürün davranışına dokunmaz, optimizasyon yapmaz.
Çıktı: ölçüm betikleri + `raporlar/00-baseline.json` + `raporlar/00-baseline-rapor.md` + `raporlar/olcum/` (ham çıktılar).

## Amaç

Sonraki her şerit bir sayıya atıf yapabilsin. Bugün Whispr web'de kullanıcı metriği toplanmıyor (`PerformanceObserver`/`web-vitals` yok), bundle bütçesi yok, masaüstü açılışı `NOT_RUN`. D0 bunları **tekrarlanabilir komutlara** çevirir ve bir kez koşar. D4 aynı komutları yeniden koşup önce/sonra tablosunu kurar; bu yüzden her araç **kalıcı** ve **testli** olmalı, scratchpad'de kaybolmamalı.

## Dokunabileceğin dosyalar

| Yol                                                                                                              | Ne                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/web/scripts/perf/**`                                                                                       | bundle raporu, sunucu ölçüm preload'u, yardımcılar + `*.test.mjs`            |
| `apps/web/playwright.perf.config.ts`                                                                             | ayrı Playwright config (emsal: `playwright.quality-dashboard.config.ts`)     |
| `apps/web/e2e/perf/**`                                                                                           | laboratuvar senaryoları (ana config'in `testDir: ./e2e/specs` dışında kalır) |
| `apps/web/package.json`                                                                                          | yalnız yeni `perf:*` script satırları                                        |
| `apps/desktop/scripts/measure-windows-desktop.ps1`, `measure-windows-desktop.contract.mjs`, `.contract.test.mjs` | `cold-start`/`warm-start`'ı `NOT_RUN`'dan çıkarmak                           |
| `scripts/quality/code-metrics.mjs` + `.test.mjs`                                                                 | statik kalite/mimari sayaçları (`pnpm test:toolchain` otomatik koşar)        |
| `docs/prompts/web-masaustu-performans-kalite-2026-09/raporlar/**`                                                | sonuçlar                                                                     |

Başka dosya gerekirse dur ve rapora yaz. Özellikle: ürün koduna ölçüm işareti (`performance.mark`, Tauri komutu) **ekleme**; gerekiyorsa `openQuestions`'a yaz, Ş7 karar verir.

## Hazırlık

1. `git status --short` + `treeFingerprint` (00 §1.3) kaydet.
2. `gh run list -L 5` — CI çalışıyor mu? Sonucu rapora yaz (K5 için girdi).
3. Ölçüm ortamını kaydet (00 §3 `env`).
4. Yerel servisler: Postgres, Redis, LiveKit dev (`ws://127.0.0.1:7880`, `devkey/secret` — `playwright.config.ts:45-47`). Hangisi ayakta, hangisi değil — yaz.
5. Güvenlik: ölçüm sunucusu süreç içi outbox/disappearing işçilerini başlatır (`server.ts:93,97`). Gerçek e-posta/push/depolama anahtarlarını süreç ortamında boşla ez; yalnız seed'li yerel DB (`E2E_DATABASE_URL`).

## Parça A — Bundle raporu (`M-BND-*`)

Principal F-08 yöntemini kalıcı araca çevir: `apps/web/scripts/perf/bundle-report.mjs`.

- Girdi: `next build` sonrası `.next` çıktısı. Yöntem: rota `*_client-reference-manifest.js` `entryJSFiles` ∪ `rootMainFiles` (Turbopack çıktı biçimi değiştiyse önce doğrula, sonra uyarla — varsayma).
- Her rota için: ham, gzip (-9) ve brotli (q11) toplam; chunk listesi; ortak kök (`M-BND-root`).
- En büyük 20 chunk için **baskın içerik tespiti**: source map varsa kaynak yolu, yoksa imza dizeleri (ör. `RTCPeerConnection` → livekit, `ZodError` → zod). Çıktıda `dominant: ["livekit-client", …]`.
- Rota listesi (sabit, D4 aynısını kullanır): `/login`, `/home`, `/messages/[conversationId]`, `/channels/[serverId]/[channelId]`, `/settings`, `/discover`, `/mentions`, `/admin` (varsa). Rota adı `M-BND-<kısa-ad>`.
- CSS: rota başına CSS baytı (`M-BND-<rota>-css`); font: kök layout'un preload ettiği font dosyası sayısı ve toplam baytı (`M-BND-fonts`) — 6 `localFont` (`src/app/layout.tsx:26-59`).
- Çıktı JSON'u + insan okunur tablo. `--budget <dosya>` bayrağını **şimdi yazma** (Ş8'in işi); ama çıktı biçimini Ş8'in okuyabileceği kadar kararlı tut.
- Test: sahte manifest fixture'ı ile rota toplama ve sıkıştırma hesabı. Testi nerede koşacağını açıkça bağla (00 §4.7: `apps/web/scripts/*.test.mjs` web `test`'inde koşmaz).
- `next build` `next-env.d.ts`'yi yeniden yazar — öncesini sakla, sonra geri yükle (00 §3).

## Parça B — Laboratuvar senaryoları (`M-LAB-*`)

`apps/web/playwright.perf.config.ts` + `apps/web/e2e/perf/*.perf.ts`. Mevcut e2e seed/auth yardımcılarını (`e2e/setup/`, `e2e/fixtures/test.ts`, `e2e/helpers/`) **yeniden kullan**, kopyalama.

Sunucu: **production build** (`pnpm --filter @wizards/web build` + `start`). Ses yolu gerçek olsun diye `NEXT_PUBLIC_E2E_VOICE_REAL_MEDIA=true` ile derle — aksi halde E2E modu `E2EVoiceProvider`'ı seçer (`voice-provider.tsx:4,50-65`) ve ölçülen uygulama gerçek uygulama değildir. Bu bayrağın başka neyi değiştirdiğini oku ve rapora yaz.

Ölçüm yalnız CDP ve standart web API'leriyle, **ürün koduna dokunmadan**:

- `PerformanceObserver` — `largest-contentful-paint`, `layout-shift`, `longtask`, `event` (`durationThreshold: 16`) — `page.addInitScript` ile sayfa açılmadan kurulur.
- Etkileşim süresi: tıklama anından hedef DOM durumunun oluştuğu ilk `requestAnimationFrame`'e kadar (`MutationObserver` + rAF, init script'te). INP vekili = senaryodaki `event` girdilerinin en uzunu.
- CDP: `Emulation.setCPUThrottlingRate`, `Network` (aktarılan bayt, istek sayısı, `Server-Timing` başlıkları), `Performance.getMetrics`, `HeapProfiler.collectGarbage` + `Runtime.getHeapUsage`.

Senaryolar (kimlikler sabit):

| #   | Senaryo                                                                                       | Ana ölçüler                                                                                                     |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| P1  | Oturumsuz soğuk yükleme `/login`                                                              | LCP, CLS, uzun görev toplamı, JS bayt                                                                           |
| P2  | Oturumlu soğuk yükleme `/home`                                                                | LCP, uzun görevler, istek sayısı, Server-Timing                                                                 |
| P3  | Oturumlu soğuk yükleme kanal rotası (200 mesajlık kanal)                                      | LCP, ilk mesaj satırı görünene kadar süre                                                                       |
| P4  | Kanal geçişi: kenar çubuğundan başka kanala tıkla → mesaj listesi dolu                        | etkileşim süresi, INP vekili, uzun görevler                                                                     |
| P5  | DM açma                                                                                       | etkileşim süresi                                                                                                |
| P6  | Mesaj gönder: A gönderir → A'da iyimser satır; B'de (ikinci context) satır görünür            | yerel geri bildirim süresi, uçtan uca teslim süresi (B3'ün yerel hali)                                          |
| P7  | 1.000 mesajlık kanalda en üste kadar kaydırma (sayfalı yükleme dahil)                         | uzun görevler, düşen kare (rAF aralığı > 50 ms sayısı)                                                          |
| P8  | Ayarlar açılışı (`/settings`, iki bölüm geçişi)                                               | etkileşim süresi                                                                                                |
| P9  | Ses odasına katılım (LiveKit dev, sahte cihaz) — "katıl" → bağlandı durumu; Krisp açık/kapalı | süre (B7'nin yerel hali). LiveKit yoksa `NOT_RUN` + neden                                                       |
| P10 | 5 dk açık kalma: ikinci context 300 mesaj + tepki + yazıyor olayı üretir                      | GC sonrası heap başlangıç/son, DOM düğüm sayısı, dinleyici sayısı (`Performance.getMetrics` `JSEventListeners`) |

- Her senaryo `masaustu` ve `dusuk` profilde, N ≥ 5 (+1 ısınma). Çıktı: `raporlar/olcum/lab-<tarih>.json`.
- Veri: 200 ve 1.000 mesajlık kanal için seed yardımcısı gerekiyorsa `e2e/perf/` altında yaz, mevcut seed'i **değiştirme** (başka e2e'ler ona bağlı).
- Script: `perf:lab` (`apps/web/package.json`). Kararsız senaryoyu gizleme; varyansı raporla.

## Parça C — Sunucu (`M-SRV-*`)

Ürün koduna dokunmadan:

- **Event loop gecikmesi:** `apps/web/scripts/perf/eld-preload.mjs` — `perf_hooks.monitorEventLoopDelay` histogramını açar, süreç kapanırken (SIGINT/SIGTERM) JSON'a döker. Sunucu `node --import ./scripts/perf/eld-preload.mjs --import ./dist/instrument.js dist/server.js` ile başlatılır. `M-SRV-ELD-p50/p99/max` P2–P10 koşusu boyunca.
- **Server-Timing:** Parça B'nin topladığı başlıklardan uç başına `total` ve alt kalemler (`M-SRV-<uç>-p50/p95`).
- **Fan-out:** `WORKSPACE_PERFORMANCE_METRICS=true` + `WORKSPACE_PERFORMANCE_METRICS_INTERVAL_MS=5000`; P6/P10 sırasında `[workspace-performance]` satırlarını yakala → `M-SRV-FANOUT-*` (runbook: `docs/operations/workspace-performance-monitoring.md`).
- Yük testi (B4) bu şeridin işi **değil**; Ş3 gerekirse yapar.

## Parça D — Masaüstü (`M-DSK-*`)

`measure-windows-desktop.ps1` bugün `cold-start`/`warm-start` için `NOT_RUN` yazıyor (`:85-86`). Ürün koduna köprü eklemeden doldur:

- K2-A: release build (`pnpm --filter @wizards/desktop` altındaki build yolu, `apps/desktop/scripts/run-tauri.mjs`), çalışma zamanında `WHISPR_DESKTOP_WEB_URL=https://whispr.team/login` (env derleme zamanı değerini ezer — `lib.rs:239-245`). Prod'a yalnız oturumsuz GET; giriş yapma, yazma yok.
- Etkileşime hazır sinyali: `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>` ile WebView2'nin CDP ucunu aç, `Runtime.evaluate` ile giriş formunun DOM'da ve etkileşime hazır olduğunu yokla. **Önce doğrula:** Tauri/wry kendi `additional_browser_args`'ını veriyorsa env'in ezilip ezilmediğini cargo registry'deki wry kaynağından oku; çalışmıyorsa alternatifi (UI Automation ile pencere içeriği) dene, yine olmuyorsa `NOT_RUN` + kanıt.
- Zaman damgaları: T0 süreç başlatma → T1 ana pencere görünür (`EnumWindows`/`MainWindowHandle`) → T2 `document.readyState === "complete"` → T3 form etkileşime hazır. `M-DSK-START-T1/T2/T3` p50/p95, N ≥ 10.
- "Soğuk" kelimesini dürüst kullan: yeniden başlatma sonrası ölçülmüyorsa metrik adı `start-noproc` (süreç yokken açılış) olur ve raporda "OS dosya önbelleği sıcak" yazar.
- Bellek: süreç ağacı (Whispr exe + tüm `msedgewebview2.exe` çocukları + minidump yardımcı süreci) WorkingSet ve Private Bytes toplamı; açılıştan 1, 5, 10 dk sonra boşta (`M-DSK-RSS-1m/5m/10m`). Süreç sayısı (`M-DSK-PROCS`).
- CPU: 5 dk boşta ortalama CPU yüzdesi, süreç ağacı toplamı (`M-DSK-CPU-idle`) — oyun algılama/sysinfo yoklaması burada görünür.
- Boyut: release exe, NSIS kurulum dosyası (`M-DSK-EXE-MB`, `M-DSK-NSIS-MB`).
- Sözleşme testini (`measure-windows-desktop.contract.test.mjs`) yeni metriklerle güncelle; mevcut sözleşmeyi bozma.
- K2-B seçildiyse debug build ölçer ve her metriğe `"representative": false` yazar. K2-C ise Parça D atlanır, gerekçe rapora.

## Parça E — Geliştirme döngüsü (`M-DEV-*`)

Her biri N = 3, sıcak önbellekle (ilk koşu atılır), süre `Measure-Command` veya `/usr/bin/time`:

`pnpm --filter @wizards/web typecheck` · `pnpm --filter @wizards/web lint` · `pnpm --filter @wizards/web test` · `pnpm --filter @wizards/web build` · `pnpm --filter @wizards/desktop lint:rust` · `cargo build --release` (`apps/desktop/src-tauri`, **ayrı `--target-dir` scratchpad'de**, mevcut `target/`'ı kirletme).

## Parça F — Statik kalite ve mimari sayaçları (`M-KOD-*`)

`scripts/quality/code-metrics.mjs` — bağımlılıksız, deterministik, JSON çıktı. Kapsam `apps/web/src` ve `apps/desktop/src-tauri/src`, test dosyaları ayrı sayılır:

- Dosya boyu dağılımı: > 500 / > 1000 / > 1500 satır sayısı, en büyük 25 (`M-KOD-files-gt1000` …).
- TS disiplini: `any` (tip konumunda), `as unknown as`, `@ts-expect-error`, `@ts-ignore`, `eslint-disable` (kural adıyla), non-null `!` sayısı.
- Import grafiği: `@/` alias çözümü, `import()` dinamik import'lar dahil (graphify bunları kaçırır). **Döngü sayısı ve döngüler** (`M-KOD-cycles`); `lib/**` → `components/**` ters yön import sayısı (`M-KOD-lib-to-components`); `route.ts` içinde doğrudan `prisma` kullanımı (`M-KOD-route-prisma`).
- Rust: `unwrap()`/`expect(` (test modülleri hariç), `panic!`, `#[tauri::command]` async/senkron sayısı.
- Test: Parça F'nin kendi testi küçük fixture ağaç üstünde döngü bulma ve sayaçları doğrular.

Sıcak nokta (churn) analizi burada değil, Ş5'te.

## Teslim

1. `raporlar/00-baseline.json`:

```jsonc
{
  "treeFingerprint": "…",
  "measuredAt": "2026-09-24",
  "env": {
    "cpu": "…",
    "ramGb": 32,
    "power": "…",
    "node": "26.10.0",
    "chromium": "…",
    "webview2": "…",
  },
  "ci": "gh run list sonucu özeti",
  "metrics": [
    {
      "id": "M-BND-home",
      "value": 1112,
      "unit": "KB-gz",
      "runs": 1,
      "method": "pnpm --filter @wizards/web perf:bundle",
      "treeFingerprint": "…",
    },
    {
      "id": "M-LAB-P4-interaction-dusuk",
      "median": 0,
      "p95": null,
      "min": 0,
      "max": 0,
      "mad": 0,
      "runs": 10,
      "unit": "ms",
      "method": "…",
    },
  ],
  "notRun": [{ "id": "M-LAB-P9-…", "reason": "LiveKit dev ayakta değil", "howToRun": "…" }],
}
```

2. `raporlar/00-baseline-rapor.md`: yöntem, ortam, metrik tablosu (grup başına), varyans notları, `NOT_RUN` listesi, F-08 sayılarıyla karşılaştırma (aynı yöntemse fark neden?), ürün koduna işaret eklenmesi gereken yerler (`openQuestions`).
3. Kalıcı script'ler: `perf:bundle`, `perf:lab`, `perf:server` (preload'lu start), masaüstü için mevcut `measure:windows`.

## Yapılmayacaklar

- Optimizasyon. Ölçerken gördüğün kusuru `openQuestions`'a veya ilgili D1 şeridine not olarak yaz.
- `next dev` ile ölçüm.
- Mevcut e2e seed'ini, ana Playwright config'ini, CI workflow'unu değiştirmek (ana config'e dokunmak `scripts/playwright-real-media-config.test.mjs` sözleşmesini kırabilir).
- Prod'a oturumlu istek, prod'a yazma.

## Kapı

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web lint
```

```bash
pnpm test:toolchain
```

```bash
pnpm --filter @wizards/desktop test
```

Ek:

```bash
node -e "const b=require('./docs/prompts/web-masaustu-performans-kalite-2026-09/raporlar/00-baseline.json');const bad=b.metrics.filter(m=>!m.id||!m.method||!m.unit||!m.runs||!(m.treeFingerprint||b.treeFingerprint));const groups=['M-BND','M-LAB','M-SRV','M-DSK','M-DEV','M-KOD'].map(g=>g+':'+b.metrics.filter(m=>m.id.startsWith(g)).length);console.log('metrik',b.metrics.length,'eksik alan',bad.length,groups.join(' '),'notRun',(b.notRun||[]).length)"
```

`eksik alan 0` olmalı; altı grubun her birinde en az bir metrik ya da `notRun` gerekçesi bulunmalı. `git status` ile `next-env.d.ts`'nin başlangıç haline döndüğünü doğrula.
