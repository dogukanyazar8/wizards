# Dalga 0 — sözleşme · telemetri · gerçek-medya test altyapısı

> **Üç paralel şerit.** Her biri ayrı Claude Code oturumuna verilir. Dalga 0 bitmeden Dalga 1
> başlamaz. Kapı: `pnpm --filter @wizards/types test`, web typecheck + test, mobil typecheck +
> test, real-media baseline raporu.

Önce oku: `docs/prompts/ekran-paylasimi-2026-09/00-ortak-baglam.md` (tamamı).
Kod tabanı için `graphify query "screen share capture publish quality store settings"`.

---

## Ş0.1 — Sözleşme katmanı

Whispr monorepo, `uat` dalı. Görev: Dalga 1–2 şeritlerinin paylaşacağı **tipleri, store
alanlarını, ayar satırlarını ve i18n anahtarlarını** yazmak. Bu şerit davranış yazmaz; alan açar.

### Sahiplenilen dosyalar

- `packages/types/src/screen-share.ts` (yeni) + `.test.ts`; `packages/types/src/index.ts` (export)
- `packages/types/src/mobile.ts` (`:495`, `:519` `isScreenSharing` yanına opsiyonel `stream`)
- `apps/web/src/lib/socket/schemas.ts` (paylaşım payload'ı + watch şemaları), `events.ts` (tipler)
- `apps/web/src/store/voice-store.ts` (+ `voice-store.test.ts`)
- `apps/web/src/lib/settings/tree.ts` (screen-share sekmesi) + `functional-coverage.test.ts`,
  `apps/web/src/components/settings/sections/av/av-settings-bridge.tsx` (+ test)
- `apps/web/src/lib/locale/messages/tr.ts`, `en.ts`
- `apps/mobile/src/locale/mobile-copy.ts` (yalnız yeni `voiceScreenShare*` anahtarları)

**Yazma:** `screen-share.ts` (web lib — Ş1'in), `live-voice-provider.tsx`, `components/voice/**`,
`handlers/voice.ts`, `apps/mobile/src/voice/**`.

### Ne yapılacak

1. **`@wizards/types` `screen-share.ts`** — zod + tip:
   - `ScreenShareResolutionSchema = z.enum(["h720","h1080","h1440","h2160"])`,
     `ScreenShareFrameRateSchema = z.union([15,30,60])`, `ScreenShareModeSchema = z.enum(["text","motion"])`.
   - `SCREEN_SHARE_BITRATE_LADDER_KBPS` (K5 tablosu, `text` + `motion` iki harita) ve
     `resolveScreenSharePresetId(resolution, frameRate)` → `h{res}fps{fps}`,
     `splitScreenShareQualityId(id)` → `{ resolution, frameRate } | null` (eski `h1080fps60` ve
     alias'lı `h*fps30` id'leri çözer).
   - `ScreenShareStreamInfoSchema = { kind: "screen"|"window"|"game", gameId: z.string().nullable(), label: z.string().max(64).nullable() }`
     — `gameId` katalog id'si **veya** `custom:<12 hex>` (K22; regex sözleşmesi Ş5'in
     `game-activity.ts`'inde), `label` yalnız kayıtlı oyunlarda dolu.
   - `ScreenShareHealthSnapshotSchema` (Ş0.2 doldurur): `direction: "send"|"receive"`, `sampledAt`,
     `fps`, `width`, `height`, `bitrateKbps`, `qualityLimitationReason: "none"|"cpu"|"bandwidth"|"other"|null`,
     `qualityLimitationDurationsMs { none, cpu, bandwidth, other }`, `encoderImplementation: string|null`,
     `decoderImplementation: string|null`, `powerEfficientEncoder: boolean|null`, `framesDropped`,
     `freezeCount`, `totalFreezesDurationMs`, `jitterBufferDelayMs`, `packetsLost`, `roundTripTimeMs`.
     Tümü sayısal/enum; serbest metin yalnız `*Implementation` (allowlist regex testi: `^[A-Za-z0-9 ._:/()-]{0,64}$`).
   - `ScreenShareWatchersUpdateSchema = { channelId, sharerUserId, count, sample: userId[] (≤5) }`.
   - Testler: merdiven monoton (çözünürlük↑ ve fps↑ → kbps düşmez), `motion ≥ text` her hücrede,
     2160p60 motion = 24_000, split/resolve gidiş-dönüş, alias çözümü, health şeması PII regex'i.
2. **Socket şemaları:** `SocketVoiceScreenSharePayloadSchema` + `stream: ScreenShareStreamInfoSchema.optional()`
   (`.strict()` korunur); yeni `SocketVoiceScreenShareWatchPayloadSchema { channelId, serverId,
sharerUserId, watching: boolean }`; `events.ts`'e `voice:screenshare:watch` (client→server) ve
   `voice:screenshare:watchers:update` (server→client) tip girişleri. Handler Ş3 yazar.
   `schemas.test.ts` her şema için geçerli/geçersiz örnek.
3. **Store (`voice-store.ts`):** yeni alanlar + setter'lar:
   `screenShareResolution` (varsayılan `h1080`), `screenShareFrameRate` (`60`),
   `screenShareMode` (`text`), `screenShare4kAllowed: boolean` (persist edilmez, probe yazar),
   `screenShareHealth: ScreenShareHealthSnapshot | null` (persist edilmez),
   `screenShareViewerCounts: Record<string /* sharerUserId */, number>` (persist edilmez),
   `goLive: { gameId: string; label: string } | null` (persist edilmez; `gameId` katalog veya `custom:<id>`),
   `screenShareStreamInfo: ScreenShareStreamInfo | null`.
   Rehydrate: eski `screenShareQuality` → `splitScreenShareQualityId` ile iki alana ayrıştır,
   sonra eski alanı **sil** (`partialize`'dan çıkar). `screenShareQuality` getter'ı geçiş süresince
   `resolveScreenSharePresetId(resolution, frameRate)` döndürür (Ş1 tüketicileri buna geçirir).
   K20: `screenShareAudioEnabled` `false`, `screenShareVolume` `100` — tree ile hizalanır.
   Test: migration (`h1080fps60` → `h1080` + `60`; `h720fps30` alias → `h720` + `60` **değil**,
   `h720` + `30` — alias artık gerçek 30fps'e çözülür, raporda not).
4. **Ayar ağacı:** e1 → çözünürlük segmenti 4 seçenek (`settings.option.e1.4` = "4K (kaynak)");
   yeni `e8` fps segmenti (15/30/60), `e9` mod segmenti (Net metin / Akıcı görüntü); e2 default
   `false`, e3 default `100`; e7 korunur. `av-settings-bridge` yazma yolları; iki test dosyası
   satır sayısını günceller (T18). 4K seçeneği `screenShare4kAllowed` false iken `disabled` +
   açıklama anahtarı (`settings.option.e1.4.disabled`).
5. **i18n (tr + en)** — anahtar listesi (Dalga 1–2 bunları **adıyla** tüketir):
   `voice.screenShare.mode.text`, `.mode.motion`, `.mode.text.description`, `.mode.motion.description`,
   `voice.screenShare.fps.label`, `voice.screenShare.resolution.h2160`, `.resolution.h2160.requiresHardware`,
   `.resolution.fallbackLabel` ("Kaynak {resolution}"), `voice.screenShare.health.chip`
   ("{height}p · {fps} fps"), `.health.limited.cpu`, `.health.limited.bandwidth`, `.health.encoder`,
   `voice.screenShare.viewers.count` ("{count} izliyor" / çoğul), `.viewers.none`,
   `voice.screenShare.bar.sharing`, `.bar.switch`, `.bar.stop`, `.bar.goLive` ("Yayında: {game}"),
   `voice.goLive.cta` ("Yayına geç: {game}"), `.cta.disabledOptIn`, `.pickerHint`, `.gameClosed`,
   `.streamingTitle` ("{name} {game} yayınlıyor"), `.streamingUnknown` ("{name} bir oyun yayınlıyor"),
   `voice.sidebar.streamingGame` ("Yayında · {game}"), `voice.screenShare.pip.enter`, `.pip.popOut`,
   `.pip.unsupported`, `voice.screenShare.fit.contain`, `.fit.cover`, `.zoom.reset`,
   `screenShare.errors.hardwareRequired4k`, `screenShare.errors.gameGone`.
   Mobil: `voiceScreenShareUnsupportedIos`, `voiceScreenShareBackgroundContinues`,
   `voiceScreenShareStoppedBySystem`, `voiceScreenSharePermissionDenied`, `voiceScreenShareViewers`
   ("{count} izliyor"), `voiceScreenShareZoomHint`, `voiceScreenShareStreamingTitle` ("{name} {game}
   yayınlıyor"). Mevcut `voiceScreenShareUnavailable` ("Paylaşım
   yok") **değişmez**.

### Test / Kapı

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```

Rapor: `raporlar/01-s01-rapor.md` — alan/anahtar listesi (Dalga 1 bunu okur), migration kararı.

---

## Ş0.2 — Telemetri: gerçek fps / bitrate / limit sebebi

Whispr monorepo, `uat` dalı. Görev: ekran paylaşımı için **ölçüm** katmanı. Bugün video için
`getStats` hiç okunmuyor (gerçek #8). Sonraki her dalga kazancını bu şeridin sayılarıyla kanıtlar.

### Sahiplenilen dosyalar

- `apps/web/src/lib/voice/screen-share-health.ts` (yeni) + `.test.ts`
- `apps/web/src/lib/voice/performance.ts` (yeni operasyonlar)
- `apps/web/src/components/providers/live-voice-provider.tsx` — **yalnız** yeni `useScreenShareHealthSampler`
  çağrısı (tek satır) ; örnekleyici ayrı dosyada: `apps/web/src/hooks/use-screen-share-health.ts` (yeni) + test
- `apps/web/src/components/voice/voice-channel-view.tsx:356-368` (çip verisi preset'ten gerçek değere)
- `apps/web/src/lib/telemetry/client-health-service.ts`, `client-health-rollup.ts` (+ testler),
  `apps/web/src/components/app/web-health-reporter.tsx`, `apps/web/src/lib/admin/snapshots/health.ts`
- `apps/web/src/lib/analytics/service.ts` (yalnız yeni olay fonksiyonu)
- `apps/mobile/src/voice/mobile-screen-share-health.ts` (yeni) + `apps/mobile/scripts/mobile-screen-share-health.test.ts`
- `apps/mobile/src/voice/use-mobile-voice-room.ts` — **yalnız** ticker içine örnekleme çağrısı + state alanı
- `apps/mobile/src/voice/mobile-voice-room-contract.ts` (`screenShareHealth` alanı)
- `apps/mobile/src/app/providers/mobile-health-reporter-bridge.tsx`

**Yazma:** `screen-share.ts`, `voice-room-primitives.tsx`, `server-voice-surface.tsx`, store (Ş0.1
alan açtı; sen yalnız setter'ı çağırırsın), i18n (Ş0.1 anahtarları hazır).

### Ne yapılacak

1. **`screen-share-health.ts` (saf):** `collectScreenShareHealthFromStats(report, direction,
previousSample)` → `ScreenShareHealthSnapshot`. Kaynaklar: `outbound-rtp` (`framesPerSecond`,
   `frameWidth/Height`, `bytesSent` deltası → kbps, `qualityLimitationReason`,
   `qualityLimitationDurations`, `encoderImplementation`, `powerEfficientEncoder`,
   `totalEncodeTime/framesEncoded`), `remote-inbound-rtp` (`roundTripTime`, `packetsLost`),
   `inbound-rtp` (`framesDecoded`, `framesDropped`, `freezeCount`, `totalFreezesDuration`,
   `jitterBufferDelay/jitterBufferEmittedCount`, `decoderImplementation`, `framesPerSecond`).
   SVC/simulcast'te birden çok `outbound-rtp` olabilir: `active` ve en yüksek `frameHeight` olan
   seçilir. Chrome ve react-native-webrtc rapor şekilleri için iki fixture.
2. **`use-screen-share-health.ts`:** yerel paylaşım varken `track.sender.getStats()`, izlenen
   paylaşım varken `RemoteVideoTrack.receiver.getStats()`; 2 s aralık (K16); in-flight guard; store
   `setScreenShareHealth`. Hiç paylaşım yokken `null`.
3. **Çip gerçeğe döner:** `voice-channel-view.tsx:356-368` preset etiketi yerine
   `screenShareHealth` (`{height}p · {fps} fps`), limit varsa `health.limited.cpu/bandwidth` eki;
   health `null` ise eski preset etiketi (bağlanmadan önce).
4. **`performance.ts`:** operasyonlar `screen_share_start` (tık → yerel track `live`),
   `screen_share_first_remote_frame` (izleyici: subscribe → ilk `framesDecoded > 0`),
   `screen_share_stop_cleanup`, `screen_share_mode_switch`. Mevcut `recordVoicePerformanceMetric`
   deseni; env kapısı aynı.
5. **client-health genişlemesi:** batch şemasına opsiyonel `value: number` + `unit:
"ms"|"fps"|"kbps"|"count"|"pct"` (geriye uyumlu: `valueMs` kalır). Yeni metrik adları:
   `screen_share.send.fps`, `.send.bitrate_kbps`, `.send.limit_cpu_pct`, `.send.limit_bw_pct`,
   `.send.height`, `.recv.fps`, `.recv.freeze_count`, `.recv.jitter_buffer_ms`,
   `.encoder` (kategori: `hw|sw|unknown`, string değil). Rollup p50/p95/p99 sayısal alan üzerinden.
   Gönderim: oturum başına başlangıç + her 60 s + bitiş özeti (K16), `CLIENT_HEALTH_MAX_BYTES`
   içinde. Admin sağlık snapshot'ına satır.
6. **Analytics:** `recordScreenShareEvent(userId, { event: "start"|"stop"|"fail"|"mode_change"|"quality_change",
reason?, mode?, resolution?, frameRate?, codec?, encoderClass? })` — süre sayacı
   (`setVoiceScreenShareUsage`) dokunulmaz. Kanal/sunucu id'si **girmez** (kural).
7. **Mobil:** `mobile-screen-share-health.ts` aynı saf sözleşme (RN stats şekli:
   `sender.getStats()` / `receiver.getStats()` livekit-client'ta public — gerçek #23). Örnekleme
   mevcut 90 ms ticker'ında sayaçla (her 22 tick ≈ 2 s), yeni timer **yok** (T7). State alanı
   `screenShareHealth`; fullscreen viewer başlığında `{height}p · {fps} fps`. Reporter bridge
   60 s özet.

### Test

- Saf modül: Chrome fixture'ı → doğru alanlar; SVC 3 `outbound-rtp` → aktif en yüksek katman;
  delta bitrate; `previousSample` yokken `bitrateKbps: null`; PII regex; RN fixture.
- Hook: 2 s kadans (fake timers), in-flight guard, paylaşım bitince `null`.
- Çip: health varken gerçek değer, yokken preset etiketi (RTL).
- client-health: eski `valueMs` batch hâlâ parse olur; yeni `value/unit` rollup p95 doğru;
  32 KiB sınırı.
- Mobil: ticker 22 tick'te bir örnekler; timer bütçesi testi (`timerBudgetCount === 2`) yeşil.

### Kapı

```bash
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/mobile typecheck && pnpm --filter @wizards/mobile test
```

Rapor: `raporlar/01-s02-rapor.md` — referans makinede 1 dk paylaşım için ölçülen
`encoderImplementation`, fps, limit sebebi (bu, Ş1'in "önce/sonra" tabanıdır).

---

## Ş0.3 — Gerçek-medya test altyapısı

Whispr monorepo, `uat` dalı. Görev: ekran paylaşımını **gerçek** `getDisplayMedia` + **gerçek**
LiveKit ile iki tarayıcı bağlamı arasında test eden altyapı. Bugün hiçbir test LiveKit'e bağlanmıyor
(gerçek #15–16).

### Sahiplenilen dosyalar

- `apps/web/playwright.config.ts` (yeni proje), `apps/web/package.json` (script), `apps/web/e2e/README.md`
- `apps/web/src/components/providers/voice-provider.tsx` (real-media bayrağı kapısı — T13)
- `apps/web/src/app/e2e/screen-pattern/page.tsx` (yeni, yalnız `NEXT_PUBLIC_E2E_TEST_MODE` altında)
- `apps/web/e2e/specs/voice/screen-share-real-media.spec.ts` (yeni), `apps/web/e2e/fixtures/screen-share.ts` (yeni)
- `.github/workflows/ci.yml` (Playwright E2E job'una LiveKit servisi + adım), yeni
  `.github/workflows/screen-share-network-nightly.yml`
- `.maestro/phase6-screen-share.yml` (yeni), `apps/mobile/scripts/mobile-maestro-testid-contract.test.ts`
- `apps/web/scripts/playwright-real-media-config.test.mjs` (yeni)

**Yazma:** ürün kodu (provider bayrağı hariç), `e2e-voice-provider.tsx`, `voice.spec.ts`.

### Ne yapılacak

1. **Proje `chromium-real-media`:** `launchOptions.args`: `--use-fake-ui-for-media-stream`,
   `--use-fake-device-for-media-stream`, `--auto-select-desktop-capture-source=Entire screen`,
   `--window-size=1920,1080`, `--autoplay-policy=no-user-gesture-required`. `testMatch:
"**/voice/screen-share-real-media.spec.ts"`. Env: `NEXT_PUBLIC_E2E_VOICE_REAL_MEDIA=true` →
   `voice-provider.tsx` bu bayrakla `E2EVoiceProvider`'ı **takmaz** (diğer e2e davranışı
   değişmez). `LIVEKIT_URL=ws://127.0.0.1:7880`, `LIVEKIT_API_KEY=devkey`,
   `LIVEKIT_API_SECRET=secret` (`--dev` varsayılanları). Script `e2e:real-media`.
2. **CI:** `Playwright E2E` job'una `livekit` servis konteyneri (`docker-compose.yml`'daki **aynı**
   image+digest, `--dev --bind 0.0.0.0 --node-ip 127.0.0.1`, portlar 7880/7881 tcp, 7882 udp).
   Yeni adım "Run screen share real-media tests" — `e2e:realtime` ile aynı kapı (`uat/main/staging`
   push, `workflow_dispatch e2e_scope: realtime`) + `schedule` nightly. PR'da koşmaz (K18).
3. **Desen sayfası** `/e2e/screen-pattern`: yüksek kontrast metin ızgarası (12/16/24 px) + **ikili
   saat şeridi** (üstte 24 kare, `performance.now()` ms değerini siyah/beyaz bit olarak çizer, her
   kare 40×40 px). OCR yok: alıcı `<video>`'dan `canvas.drawImage` ile örneklenen piksellerden ms
   okunur → glass-to-glass gecikme. `--auto-select-tab-capture-source-by-title="Whispr screen
pattern"` ile ayrı bir spec grubu bu sekmeyi yakalar.
4. **Spec (`screen-share-real-media.spec.ts`)** — iki bağlam A (paylaşan) ve B (izleyen), aynı
   ses kanalı (mevcut `openLoggedInPage` fixture'ı, `voice.spec.ts:41-47` deseni):
   - A paylaşır → B'de `video-stage-screen` `videoWidth > 0` ve 3 s içinde `framesDecoded` artar
     (B tarafında `page.evaluate` ile `RTCPeerConnection.getStats` — livekit `room.engine`'e
     `window.__whisprVoiceRoom` test kancası üzerinden; kanca yalnız real-media bayrağında).
   - Çözünürlük sözleşmesi: A'nın `outbound-rtp.frameHeight` seçili preset'e eşit (1080).
   - A durdurur → B'de track 2 s içinde biter; A kaynağı değiştirir → B akmaya devam eder.
   - İki paylaşım cap'i: üçüncü bağlam C `maxReached` hatası alır.
   - Desen grubu: SSIM ≥ 0.9 (statik metin; `pixelmatch` + gri ton) ve gecikme < 300 ms (LAN),
     rapora yazılır, eşik ilk turda **soft** (log), Ş9 sertleştirir.
5. **Ağ nightly'si:** `screen-share-network-nightly.yml` ubuntu-24.04, `sudo tc qdisc add dev lo
root netem delay 40ms loss 2% rate 2mbit` sonra desen spec'i `text` modunda (Ş1 sonrası `motion`
   da) → `frameHeight` korunur, fps ≥ 5. Ş1 gelene kadar yalnız mevcut davranışı kaydeder.
6. **Maestro `phase6-screen-share.yml`** (Android emülatör, API 34+): giriş helper'ı → ses
   kanalına katıl → `tapOn: id: "mobile-voice-screen-share"` → sistem diyaloğu `tapOn: text:
".*(Start now|Şimdi başlat).*"` → `assertVisible: id: "mobile-voice-stage-screen-self"` (Ş7
   testid'i sabitler; şimdilik mevcut sahne tile testid'i) → tekrar tıkla → `assertNotVisible`.
   testid sözleşme testine ekle.
7. **Baseline:** suite'i bir kez koştur, `raporlar/01-s03-rapor.md`'ye CI yazılım encoder'ında
   ölçülen fps/bitrate/`qualityLimitationReason` değerlerini yaz (Ş0.2 çipi/health'i kullanarak).

### Test

`playwright-real-media-config.test.mjs`: proje adı, dört bayrak, `testMatch`; `voice-provider`
kapısı için birim test (bayrak açık → gerçek provider). Spec'in kendisi kapıdır.

### Kapı

```bash
pnpm --filter @wizards/web e2e:real-media
```

```bash
pnpm --filter @wizards/web test
```

Rapor: `raporlar/01-s03-rapor.md` — baseline sayılar, headless'ta çalışmayan adımlar (`test.skip`
listesi), CI süresi.
