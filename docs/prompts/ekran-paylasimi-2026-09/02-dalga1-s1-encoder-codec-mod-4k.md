# Dalga 1 · Ş1 — Encoder: codec probe, net/akıcı modu, fps merdiveni, 4K

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 0 kapısı geçti (Ş0.1 alanları + i18n, Ş0.2 health, Ş0.3 real-media suite).

---

Whispr monorepo, `uat` dalı. Görev: web + masaüstü (WebView2) ekran paylaşımının **encoder
sözleşmesini** Discord seviyesine çıkarmak: donanım farkında codec seçimi, `text`/`motion` modu,
15/30/60 fps, 4K katmanı, canlı geçiş. Bu şerit izleyici UI çizmez (Ş2), presence yazmaz (Ş3/Ş5).

Önce oku: `docs/prompts/ekran-paylasimi-2026-09/00-ortak-baglam.md` §4 #1–#7, §5 K2, K4–K7,
§6 T1–T4, T14; `raporlar/01-s01-rapor.md` (alan adları), `raporlar/01-s02-rapor.md` (baseline).
Kod tabanı için `graphify query "screen share capture publish encoding sender parameters"`.

## Sahiplenilen dosyalar

- `apps/web/src/lib/voice/screen-share.ts` + `.test.ts`
- `apps/web/src/lib/voice/screen-share-codec.ts` (yeni) + `.test.ts`
- `apps/web/src/lib/voice/screen-share-session.ts` + `.test.ts` (capture fabrikası)
- `apps/web/src/lib/voice/livekit-track-helpers.ts` + `.test.ts` (canlı geçiş yardımcıları)
- `apps/web/src/lib/voice/media-capabilities.ts` + `.test.ts`
- `apps/web/src/components/providers/live-voice-provider.tsx` — **yalnız** `requestScreenShare`,
  `stopScreenShare`, kalite/mod uygulama efektleri (`:1483-1538`, `:1693-1790`)
- `apps/web/src/components/settings/sections/av/screen-share-tab.tsx` (segmentlerin bağlanması)
- `apps/web/e2e/specs/voice/screen-share-real-media.spec.ts` (yeni senaryolar ekle)

**Yazma:** `voice-room-primitives.tsx`, `server-voice-surface.tsx`, `voice-channel-view.tsx`
(Ş2), `handlers/voice.ts` (Ş3), `livekit/server.ts` (Ş4), store alanları (Ş0.1 açtı; setter çağır),
i18n (Ş0.1 anahtarları), `apps/mobile/**`, kamera sözleşmeleri (`video-quality.ts`).

## Ne yapılacak

### 1. Codec probe — `screen-share-codec.ts` (saf)

`resolveScreenShareCodec({ mode, width, height, frameRate, bitrateKbps }, probe)`:

- `probe` = `navigator.mediaCapabilities.encodingInfo` sarmalayıcısı (enjekte edilir; test sahte
  verir). Adaylar sırayla (K6): `video/AV1` (`scalabilityMode: "L3T3_KEY"`), `video/VP9` (aynı),
  `video/H264` (`profile 42e01f`, simulcast). Her aday için `{ type: "webrtc", video: {
contentType, width, height, framerate, bitrate, scalabilityMode? } }`.
- Sonuç `{ codec: "av1"|"vp9"|"h264", hardware: boolean, scalabilityMode?: "L3T3_KEY",
simulcast?: boolean, reason: string }`. Hiçbiri `powerEfficient` değilse: `text` → `vp9`
  (yazılım, `hardware:false`), `motion` → `h264` (yazılım).
- `encodingInfo` yoksa / atarsa → `vp9`, `hardware: null`, `reason: "probe-unavailable"`.
- Oturum başına bir kez çözülür, sonuç store'a (`screenShareCodecChoice`, Ş0.1 alan açmadıysa
  raporla ve yerel ref'te tut) ve telemetriye (Ş0.2 `encoderClass`) gider.

### 2. Preset ve seçenek üretimi — `screen-share.ts`

- `getScreenSharePreset(resolution, frameRate, mode)` → `VideoPreset` (K5 merdiveni,
  `@wizards/types` tablosundan okunur; burada ikinci tablo **yok**).
- `getScreenShareCaptureOptions` imzası `{ resolution, frameRate, mode, shareSystemAudio,
excludeSelfWindow, allowSourceSwitch }` alır; `contentHint` moddan (K7); `resolution.frameRate`
  fps'ten.
- `getScreenSharePublishOptions({ preset, codecChoice, mode })`: `videoCodec`, AV1/VP9 →
  `scalabilityMode: "L3T3_KEY"`, `backupCodec: true`; H264 → `simulcast: true`,
  `screenShareSimulcastLayers: [yarım, çeyrek]` (kaynaktan türetilen `VideoPreset`'ler, lazy —
  T6 web'de geçerli değil ama aynı disiplin), `backupCodec: false`;
  `degradationPreference` moddan; `screenShareEncoding: preset.encoding`.
- `isScalableScreenShareEncoding` / `applyScreenShareEncodingToSender` korunur; simulcast yolunda
  tüm girdiler yazılır (T2).
- Eski `ScreenShareQualityId` API'si: `getScreenShareQualityPreset(id)` geçiş için kalır ve
  `splitScreenShareQualityId` üzerinden yeni yola delege eder; tüketici kalmayınca **silinir**
  (raporda hangi çağrı yerlerinin kaldığı).

### 3. 4K kapısı (K2)

- Ön ipucu: `screen.width * devicePixelRatio >= 3840 || screen.height * devicePixelRatio >= 2160`
  ve codec probe'u 2160p'de `hardware: true` → `setScreenShare4kAllowed(true)`; ayarlar e1
  dördüncü seçenek etkin.
- Capture sonrası gerçek: `video.mediaStreamTrack.getSettings()` `height < 2160` ise preset bir
  alt katmana düşer, çip `resolution.fallbackLabel` gösterir, `screenShareResolution` tercihi
  **değişmez** (kullanıcı 4K monitöre geçince yine 4K).
- Feature flag `screenShare4k` (mevcut feature-flag altyapısı; yoksa `NEXT_PUBLIC_SCREEN_SHARE_4K`
  env + raporla). Flag kapalıyken seçenek görünmez.
- `applyConstraints({ width, height })` ile 4K → 1440p canlı düşürme (K7) desteklenir; yükseltme
  yeniden capture ister (raporla, Discord da yeniden başlatıyor).

### 4. Canlı geçiş — `livekit-track-helpers.ts`

- `applyScreenShareModeToTrack(track, mode)`: `mediaStreamTrack.contentHint`,
  `sender.setParameters({ ...params, degradationPreference })` (parametrelerin diğer alanlarını
  spread ile koru; SVC girdisine dokunma — T2).
- `applyScreenShareFrameRateToTrack(track, frameRate, preset)`: `applyConstraints({ frameRate: {
ideal, max } })` + `applyScreenShareEncodingToSender(sender, preset.encoding)`.
- `applyScreenShareResolutionToTrack(track, preset)`: `applyConstraints({ width: { ideal },
height: { ideal } })` + encoding.
- Hepsi best-effort: `applyConstraints` reddi paylaşımı **durdurmaz**, `qualityFailed` mesajı +
  telemetri `mode_change` `result: "error"`.

### 5. Provider

- `requestScreenShare`: store'dan üç eksen okunur; probe çözülür; `screenShareSession.start`
  yeni `capture` parametresi **fonksiyon** olabilir (`() => Promise<LocalTrack[]>`) — Ş5 Go Live
  kendi `getDisplayMedia`'sını bu kancadan verecek; varsayılan fabrika
  `room.localParticipant.createScreenTracks(options)`.
- Tercih efektleri: `screenShareMode`/`screenShareFrameRate`/`screenShareResolution` değişince
  canlı track'e uygula (`:1507-1538` mevcut kalite efekti genişler). Codec değişimi uygulanmaz
  (K6), raporda.
- Hata haritası: 4K seçili ama probe reddetti → `screenShare.errors.hardwareRequired4k`.

### 6. Ayar sekmesi

`screen-share-tab.tsx`: e1 çözünürlük (4K disabled + açıklama), e8 fps, e9 mod segmentleri store
setter'larına bağlanır; "canlı" olduklarını açıklayan mevcut satır altyazısı deseni.

## Test

- `screen-share-codec.test.ts`: probe matrisi — AV1 HW → av1+SVC; yalnız VP9 HW → vp9; yalnız
  H264 HW → h264+simulcast+`backupCodec:false`; hiç HW yok `text` → vp9 SW, `motion` → h264 SW;
  probe yok → vp9 + `probe-unavailable`; probe atar → aynı; 2160p'de HW yoksa `hardware:false`.
- `screen-share.test.ts`: mod → `contentHint`/`degradationPreference` tablosu; preset merdiveni
  `@wizards/types` ile aynı (tek kaynak); H264 simulcast katmanları kaynağın yarısı/çeyreği;
  4K düşüş etiketi; eski id delegasyonu.
- `livekit-track-helpers.test.ts`: mod geçişi `setParameters` diğer alanları korur; fps geçişi
  `applyConstraints` + encoding; simulcast'te tüm girdiler, SVC'de ilk girdi.
- `screen-share-session.test.ts`: capture fabrikası ile başlatma; fabrika atarsa temizlik aynı.
- Real-media: (a) `text` 1080p30 → `frameHeight 1080`, `qualityLimitationReason` `none` (CI
  yazılım encoder'ında 30 fps hedefi soft); (b) `motion` geçişi sonrası `contentHint === "motion"`
  ve `degradationPreference === "maintain-framerate"` (`page.evaluate` ile sender parametreleri);
  (c) fps 60 → 15 geçişi `framesPerSecond` düşer; (d) `--window-size=3840,2160` ayrı test:
  4K flag açık + probe sahte HW → `frameHeight 2160` (T12: fps assert edilmez);
  (e) netem nightly: `text` çözünürlük korur, `motion` fps ≥ 24 (Ş0.3 job'una iki senaryo).

## Kapı

```bash
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web e2e:real-media
```

Rapor: `raporlar/02-rapor.md` — referans makinede (NVIDIA + Intel iGPU + dizüstü) probe sonucu,
`encoderImplementation`, 1080p60 `motion` ölçülen fps önce/sonra (Ş0.2 baseline'ına karşı),
4K'nın hangi makinede açıldığı, kalan `ScreenShareQualityId` tüketicileri.
