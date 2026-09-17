# 00 — Ortak bağlam

**Bu dosya uygulanmaz, okunur.** Her şerit prompt'u ilk satırında buraya işaret eder.

---

## 1. Kurallar

- Caveman ultra. `uat` dalı. **Commit yok**; her şey uncommitted kalır, kullanıcı commit'i kendisi atar.
- Her prompt'un "Sahiplenilen dosyalar" listesi bağlayıcıdır. Listede olmayan dosyaya **yazma, oku**.
  Paralel şeritler ortak dosyaya yazamaz; yazması gerekiyorsa şerit raporuna "istek" olarak düşer.
- Yeni davranış = önce test (mevcut TDD deseni: saf modül + `.test.ts`). Sözleşme testleri
  (`validate…Contract()` deseni) korunur, gevşetilmez; bilinçli değişen kilit yeni değere güncellenir ve
  raporda anılır.
- Kod, commit mesajı, i18n metni normal yazılır. Prompt metni caveman'dır.
- Ürün metni **iddia etmez**: NVENC/AMF/QuickSync/VideoToolbox seçtiğimizi söyleyen hiçbir copy
  yazılmaz (`apps/desktop/NATIVE_MEDIA_RESEARCH.md` §"Hardware Encode Reality"). Telemetri
  `encoderImplementation` değerini gösterir, tanıtım metni yazmaz.
- Telemetri PII taşımaz: pencere başlığı, kaynak adı, exe adı, kanal/sunucu/kullanıcı id'si medya
  telemetrisine girmez. Sayılar + codec/encoder implementasyon adı girer.
- Her şerit bitişinde `docs/prompts/ekran-paylasimi-2026-09/raporlar/NN-rapor.md` yazar.

## 2. Otorite sırası

Bir değer iki kaynakta farklıysa üstteki kazanır ve fark şerit raporuna yazılır.

1. Bu dosyanın §5 kararları.
2. Mevcut saf sözleşme dosyaları: `apps/web/src/lib/voice/screen-share.ts`, `video-quality.ts`,
   `video-subscription.ts`, `video-layout.ts`; `apps/mobile/src/voice/mobile-screen-share.ts`,
   `mobile-screen-share-contract.ts`, `mobile-video-quality.ts`, `mobile-video-subscription.ts`,
   `mobile-video-layout.ts`, `mobile-voice-background-media.ts`.
3. `livekit-client` 2.22.3 **kaynağı** (`apps/web/node_modules/livekit-client/dist/`) — doküman
   değil, kod. `@livekit/react-native` 2.12.0 + `@livekit/react-native-webrtc` 144.1.2 aynı şekilde.
4. Discord davranışı yalnız **referans**; birebir kopya hedef değil.

## 3. Kapsam

**Yapılacak:** ölçüm ve gerçek-medya testi; encoder sözleşmesi (codec probe, mod, fps, 4K); web
izleyici deneyimi; izleyen listesi; Go Live (masaüstü); mobil iOS kapısı + extension; mobil Android
arka plan + izleyici; ağ/yetki; native capture spike'ı (araştırma).

**Yapılmayacak (dokunma):** ses odası tasarımı (5a/5b, DM parite), kamera sözleşmeleri V1–V4
(değişmez; paylaşım onların üstüne biner), Krisp/gürültü bastırma, mesajlaşma, admin konsolu.
macOS/Linux masaüstü (bundle yalnız NSIS — gerçek #24). Özel kaynak seçici (thumbnail'lı) yalnız Ş8
spike'ı; üretim yolu Chromium seçicisidir. Teams "kontrolü ver" / annotation, 8K, Discord "stream
preview" küçük resimleri.

## 4. Doğrulanmış kod tabanı gerçekleri

Aşağıdakiler 2026-09-17'de dosyadan okundu. Varsayım değil, kayıt. Satır numaraları o güne aittir.

**Web / masaüstü capture + publish**

1. `apps/web/src/lib/voice/screen-share.ts`: presetler `h720fps60` 3.5 Mbps, `h1080fps60` 6 Mbps
   (varsayılan), `h1440fps60` 12 Mbps; hepsi 60 fps. `h*fps30` id'leri 60'a alias (`:32-36`).
   Capture: `contentHint: "detail"` sabit, `selfBrowserSurface`, `surfaceSwitching`, opsiyonel
   `audio + systemAudio + suppressLocalAudioPlayback` (`:140-173`). Publish: `videoCodec: "vp9"`,
   `scalabilityMode: "L3T3_KEY"`, `backupCodec: true`, `degradationPreference:
"maintain-resolution"` (`:180-198`). `applyScreenShareEncodingToSender` SVC'de yalnız ilk
   encoding'i yazar, `scalabilityMode` korur (`:236-265`).
2. `screen-share-session.ts`: `ScreenShareSession` start/switch/stop serileştirir; capture ilk
   `await`'ten önce çağrılır (kullanıcı aktivasyonu); `replace` eski kaynağı seçici başarana kadar
   tutar; yalnız **video** track'inin `ended` olayı paylaşımı durdurur; `NotAllowedError/AbortError`
   ve sıfır track = sessiz iptal. 10 yaşam döngüsü testi var.
3. `live-voice-provider.tsx` (3102 satır): `requestScreenShare` `:1693-1777` — oda `Connected` +
   session `idle` kapısı, `isScreenShareSupported()` = `getDisplayMedia` varlığı, oda genelinde
   **2 paylaşım cap'i** (`countActiveScreenShares(activeRoom) >= 2`), `getScreenShareCaptureOptions`
   ve `getScreenSharePublishOptions` çağrıları, `onEnded → stopScreenShare`. Oda seçenekleri
   `:2007-2015` (`getVoiceRoomSubscriptionOptions` + kamera `publishDefaults`). Presence emit
   `voice:screenshare:update` `:643-648`, heartbeat `:777-788`.
4. `livekit-client` 2.22.3 bundle'ında `suppressLocalAudioPlayback` ve `displaySurface` **geçmiyor**
   (grep boş). `suppressLocalAudioPlayback` bu yüzden capture sonrası `applyConstraints` ile
   uygulanıyor (`livekit-track-helpers.ts:84-109`). `ScreenShareCaptureOptions` tipi
   `preferCurrentTab`, `systemAudio`, `surfaceSwitching`, `selfBrowserSurface`, `contentHint` taşıyor;
   `displaySurface` ve `monitorTypeSurfaces` **yok**.
5. `video-subscription.ts`: kanal odası `adaptiveStream {pauseVideoInBackground, pixelDensity:
"screen"}`, DM `false`; `dynacast` hep açık; sahne `HIGH`, köşe `MEDIUM`;
   `setVoiceVideoQualityCeiling` bir **tavan**dır (adaptive açıkken küçük olan kazanır).
6. `voice-room-primitives.tsx`: `ScreenShareVideo` `:423-466` düz `<video object-contain>`; fit
   toggle yok. Kamera tavanı `videoQualityMode` alıyor (`:974-978`), **paylaşım tavanı almıyor**
   (`:980-984`). Fullscreen çift tık `:1052-1058`; "Active shares" listesi `:1162-1199`; paylaşım
   ses slider'ı `:1333-1375`; stage kalite `<select>` `:1262-1282`. `requestPictureInPicture`,
   `documentPictureInPicture`, `window.open` voice kodunda **yok**.
7. `server-voice-surface.tsx`: paylaş butonu `ControlButton testId="server-voice-control-share"`
   `:1173-1182` (label `server.voice.controls.share/stopShare`); sunucu + LIVE çipi `:862-913`;
   fullscreen butonu `:965-982`; kalite `SettingSelect` `:924-944`. Kablolama
   `voice-channel-view.tsx:533-535`; DM `dm-call-view.tsx:220`.
8. Telemetri: `getStats` yalnız `audio-health.ts` (packetsLost/jitter/RTT/audioLevel). Video için
   `qualityLimitationReason`, `framesPerSecond`, `freezeCount`, `encoderImplementation` **hiçbir
   yerde** (web + mobil). fps çipi preset etiketi (`voice-channel-view.tsx:356-368`, dosya içi
   yorum bunu söylüyor). `ConnectionQuality` yalnız gecikme çipi (`:124-153`, `:354`).
   `recordVoicePerformanceMetric` 11 operasyon, video yok (`lib/voice/performance.ts:7-18`).
   client-health satırı `{ metric, valueMs }` (`lib/telemetry/client-health-rollup.ts:9-19`),
   batch `CLIENT_HEALTH_MAX_EVENTS = 50`, `MAX_BYTES = 32 KiB` (`client-health-service.ts:7-8`).
   Analytics `setVoiceScreenShareUsage` yalnız süre (`lib/analytics/service.ts:485-521`).
9. Socket: `SocketVoiceScreenSharePayloadSchema { channelId, isScreenSharing, serverId }`
   (`lib/socket/schemas.ts:116-121`); handler `handlers/voice.ts:285-349` rate limit
   `VOICE_SCREEN_SHARE_RATE_LIMIT = 10`, `PermissionBits.STREAM` kontrolü, Redis anahtarı
   `voice:screenshare:<channelId>:<userId>` TTL 120 s (`screen-share-state.ts`). Sidebar LIVE çipi
   `components/shell/channel-item.tsx:329-349`, testid `voice-sidebar-screen-share-<username>`.
10. Ayarlar: `lib/settings/tree.ts:647-705` satırlar e1 (segment 3 seçenek), e2 (toggle, tree
    default `true`), e3 (slider, tree default `60`), e4, e5, e7 (action). Store varsayılanları
    `screenShareAudioEnabled: false`, `screenShareVolume: 100` (`store/voice-store.ts:517-518`) —
    **tree ile çelişiyor**. Yazma yolu `av-settings-bridge.tsx:100-178`; persist `partialize`
    `:881-885`; rehydrate `:850-855`. i18n tek çift: `lib/locale/messages/tr.ts` + `en.ts`.
11. Masaüstü: `apps/desktop/src-tauri/tauri.conf.json` `bundle.targets: ["nsis"]` → yalnız
    Windows / WebView2. Capture yolu tarayıcıyla **aynı**; native capture, sistem sesi, custom track,
    HW encode `research_gated` (`lib.rs:1944-1975`, `NATIVE_MEDIA_RESEARCH.md`).
    `screen_capture_picker.rs` yalnız consent testi (`GraphicsCapturePicker`, kare almaz).
    `DesktopActivityStatus::Streaming` pencere başlığı "Whispr - Screen sharing" (`lib.rs:662,672`).
    `windows_media_permissions.rs` 0 test.
12. Oyun algılama **var**: `game_activity.rs` `detect_cached()` 15 s önbellek, `sysinfo` ile
    process taraması, katalog `packages/types/src/game-catalog.json` (**9 oyun**: cs2, valorant,
    league-of-legends, dota-2, fortnite, pubg, minecraft, gta-v, apex-legends) + Minecraft Java
    heuristiği; launcher'lar oyun sayılmaz (Rust testi `:145-175`). Tauri komutu
    `get_desktop_detected_game` (`lib.rs:2008-2029`) cihaz başına opt-in
    `game_detection_enabled`. Web `components/desktop/desktop-game-activity.tsx` `POST
/api/v1/users/me/game-activity` `{ gameId, sessionId }`; `lib/game-activity/service.ts` Redis
    `game-activity:<userId>` HSET, TTL 70 s, `sessionId` sahipliği (Lua script), görünürlük
    `GameSharingSettings.enabled`. `packages/types/src/game-activity.ts` `GameIdSchema` **sabit
    enum** (9 literal), `GAME_CATALOG` JSON'dan türetiliyor. Foreground exe adı komutu
    `get_desktop_foreground_process_name` (`lib.rs:1995`).
    `lib/desktop/game-overlay-process.ts` overlay için ayrı 10'luk exe whitelist'i taşıyor.
13. Overlay: compositor overlay, yalnız sanitize edilmiş ses snapshot'ı alır
    (`packages/types/src/voice-mini.ts` `VoiceMiniSnapshotSchema`, `lib/desktop/voice-mini-snapshots.ts`).
    Gizlilik sözleşmesi `apps/desktop/GAME_OVERLAY.md`: yalnız foreground exe adı okunur, telemetri
    yok, overlay'e Tauri komut izni yok.
14. LiveKit sunucu: `lib/livekit/server.ts` `createRoom({ maxParticipants, name })` — `emptyTimeout`
    yok (`:240-253`); grant `canPublishSources: [MICROPHONE, CAMERA, SCREEN_SHARE,
SCREEN_SHARE_AUDIO]` **herkese** (`:18-23`, `:336-344`), TTL `1h`; mobil token aynı grant
    (`api/v1/mobile/voice/token/route-logic.ts`). Bölge uçları `lib/livekit/rtc-regions.ts`.
    `docker-compose.yml:35-56` `livekit/livekit-server:v1.13.7 --dev`, `LIVEKIT_CONFIG` yalnız
    `audio:` bloğu. TURN/ICE config repoda **yok**. UAT/prod LiveKit = **LiveKit Cloud** (kullanıcı, 2026-09-17); proje/bölge/env yeri belgeli **değil**
    (CSP `*.livekit.cloud` ipucu; `isLiveKitCloudUrl` Krisp için kullanılıyor).

**Test altyapısı**

15. `apps/web/playwright.config.ts:81-88` chromium `--use-fake-device-for-media-stream
--use-fake-ui-for-media-stream`; `--auto-select-desktop-capture-source` **yok**; webkit voice
    spec'i `testIgnore`; firefox CI'da koşmuyor. `E2E_TEST_MODE` → `voice-provider.tsx:147-149`
    `E2EVoiceProvider`'ı takar (857 satır, `getDisplayMedia`/`srcObject` çağrısı **sıfır**;
    `toggleScreenShare` `:504-546` yalnız store yazar). `voice.spec.ts` 20 test; paylaşım
    senaryoları `:332,:361,:408,:430,:618,:671` (izin reddi localStorage bayrağı
    `whispr:e2e:deny-screen-share`).
16. `.github/workflows/ci.yml`: `Playwright E2E` job `:327-419` GitHub-hosted `ubuntu-24.04`,
    servis konteynerleri postgres + redis, **LiveKit yok**; voice spec'i yalnız `main/staging/uat`
    push'unda veya `workflow_dispatch e2e_scope: realtime` ile (`pnpm --filter @wizards/web
e2e:realtime` → `playwright test --project=chromium e2e/specs/realtime e2e/specs/voice`).
    `e2e/README.md:156,245` gerçek medya kalitesinin kapsam dışı olduğunu yazıyor.
17. Maestro akışları repo kökünde `.maestro/` (`phase5-voice-polish.yml` mute/kamera/cihaz
    sheet'i; **paylaşım adımı yok**). Detox yok. Nightly cihaz kapısı committed kanıta bakıyor,
    emülatör koşturmuyor.
18. Masaüstü QA `apps/desktop/QA.md:126-139` manuel liste (paylaş, kalite değiştir, durdur, izin
    reddi, kapatınca temizlik). Rust testleri: `screen_capture_picker.rs` 1, `media_permissions.rs` 7.

**Mobil**

19. `mobile-screen-share.ts`: `h720fps30` 2 Mbps (varsayılan), `h1080fps30` 4 Mbps tavan; `h264`,
    `backupCodec: false`, `maintain-resolution`, `audio: false`, `contentHint: "detail"`. Sözleşme
    testi 1440p60'ı ve >30 fps'i **yasaklıyor** (`validateMobileScreenShareQualityContract`).
    `screenShareSimulcastLayers` verilmiyor → oda varsayılanı `simulcast: true` + livekit'in
    yarı-çözünürlük katmanı devreye giriyor (`mobile-video-quality.ts:106-126` yorumları).
20. `@livekit/react-native-webrtc` `getDisplayMedia()` **kısıt almaz** (Android/iOS native); capture
    options'taki çözünürlük/fps native'de yok sayılır, yalnız encoder cap çalışır.
21. **iOS sessiz kırık:** `ScreenCaptureController.m:42-45` `RTCAppGroupIdentifier` yoksa
    `startCapture` sessizce döner; `WebRTCModule+RTCMediaStream.m` track'i `readyState: "live"`
    ile resolve eder. App'te Broadcast Upload Extension, app group, `ScreenCapturePickerView`,
    `Platform.OS` kapısı **yok**; `screenShareStatus: "unsupported"` hiç atanmıyor
    (`mobile-voice-room-contract.ts:25-26`; `use-mobile-voice-room.ts:421` yalnız okuyor).
22. Android foreground service **doğru kurulu**: `@livekit/react-native-expo-plugin`
    `LiveKitExpoPackage` → `LiveKitApplicationLifecycleListener.onCreate` →
    `LiveKitReactNative.setup()` → `WebRTCModuleOptions.enableMediaProjectionService = true`;
    `MediaProjectionService.launch` consent sonucunda çağrılır (`GetUserMediaImpl.java:81`).
    Manifest `plugins/withScreenShare.js` (`FOREGROUND_SERVICE_MEDIA_PROJECTION`,
    `foregroundServiceType="mediaProjection"`). Bildirim kütüphane sahipli
    (`MediaProjectionNotification.java`: `setOngoing(false)`, aksiyon yok, metin özelleştirilemez).
    `android/` gitignored (prebuild).
23. `use-mobile-voice-room.ts`: `toggleScreenShare` `:1611-1670` (`beginCaptureConsentGuard`,
    `setScreenShareEnabled(true, capture, publish)`); AppState `:2046-2061` arka planda paylaşımı
    **durdurur** (`MOBILE_SCREEN_SHARE_BACKGROUND_STOP_MESSAGE`); bağlantı geçişi `:1390-1393`
    sıfırlar; OS tarafından durdurma için dinleyici **yok** (durum `getTrackPublication` polling'i
    `:405-406, 591-613`). `getStats` yalnız ses ölçer (`:282,:295`). Timer bütçesi 2
    (`summarizeMobileVoiceLifecycleMatrix().timerBudgetCount`).
24. `voice-screen.tsx`: paylaş butonu `:365-377` testid `mobile-voice-screen-share`; fullscreen
    `VoiceStageScreenFullscreen` `:1160-1234` `ScrollView maximumZoomScale={3}` (**iOS-only**);
    `objectFit="contain"` `:1885`; başlık "{name} ekranını paylaşıyor" `:1829-1830`.
    `ScreenShareActiveBanner` `:1735`, `ScreenShareConsentSheet` `:1771`, `MobileScreenShareViewer`
    `:1890` **export edilip hiç render edilmiyor** (yalnız `voice-screen-components.test.tsx`).
    `app.config.js:224` `orientation: "portrait"`. Aspect clamp 9:16…16:9
    (`mobile-video-layout.ts:29-55`). Kalite seçici `mobile-voice-settings-sheet.tsx:722-755`,
    DM ekranı paylaşım-sesi kapatma toggle'ını **geçmiyor** (`mobile-direct-call-screen.tsx:303-326`).
    Mobil copy anahtarları `voiceScreenShare*` (`mobile-copy.ts:1725-1847`, en `4679-…`).
25. Mobil bileşen testi yolu `pnpm --filter @wizards/mobile test:components` (jest-expo, RNTL 14
    async render). Saf testler `apps/mobile/scripts/*.test.ts` (node).

**Hafızadan taşınan, koddan türetilemeyen gerçekler**

26. `Room.publishDefaults` ekran paylaşımıyla **ortaktır**: `videoCodec/scalabilityMode/
degradationPreference/backupCodec` oda seviyesine konursa paylaşımın codec'i de değişir. Bu
    yüzden her publish çağrısında açıkça geçilir; oda varsayılanı yalnız `videoEncoding` +
    `videoSimulcastLayers` taşır. Mobil "no silent inheritance" testi bunu kilitler.
27. `TrackEvent.VideoDimensionsChanged` livekit-client'ta tanımlı ama **hiç emit edilmiyor** —
    abone olma. Web'de `Track.dimensions` yok; kaynak oranı `mediaStreamTrack.getSettings()` +
    `<video>` `loadedmetadata/resize`.
28. `pauseVideoInBackground` React Native'de **inert** (`isWeb()` kapısı); `setVideoQuality(HIGH)`
    adaptiveStream'i **ezmez** (küçük kazanır). `pixelDensity: "screen"` RN'de `PixelRatio.get()`.
29. Modül yükleme anında `VideoPresets` / `VideoQuality` okumak jest suitlerini düşürür
    (`mobile-direct-call-runtime.test.tsx` livekit-client'ı elle mock'lar) — lazy oku.
30. `mobile-design-contract.test.ts` ses odası geometrisini kilitler; `voice-screen.styles.ts`
    içinde hex renk **yasak** (yalnız token).
31. Mobilde `audioLevel` hızlı yolu 90 ms ticker'a bindirildi; yeni zamanlayıcı **eklenemez**.
32. Speaking ring için LiveKit `audio.update_interval 100 / smooth_intervals 1` yalnız
    docker-compose'da; dağıtık düğümlerde aynı ayar gerekir (Ş4 hosting belgesi bunu da kapsar).
33. Kamera V1–V4 sözleşmeleri (codec/bitrate, çerçeveleme, abonelik, ekran paylaşımı paritesi)
    landed ve uncommitted; bu paket onları **değiştirmez**, üstüne biner.
34. Kullanıcı: audit/plan görevlerinde dosya yazılmaz; uygulama şeritleri yalnız kullanıcı bu
    paketi koşturunca dosya yazar. Commit her zaman kullanıcıda.

## 5. Bağlayıcı kararlar

İkisi kullanıcının kendi isteğidir (K1, K2); kalanı bu paketin kararıdır ve şeritler arası
sözleşmedir. Bir şerit karara **uymuyorsa** kodu değiştirmez, raporuna yazar. `README` "Kararlar" bölümü 2026-09-17'de kullanıcı tarafından kapatıldı (K21–K23 o kararları
taşır).

- **K1 — Go Live istendi.** Discord'daki gibi: oyun algılanınca "Yayına geç: {oyun}" CTA, presence
  "Yayında: {oyun}", oyun kapanınca yayın durur. Algılama mevcut opt-in `game_detection_enabled` +
  `GameId` kataloğu üzerinden; exe adı / pencere başlığı **asla** yayınlanmaz (GAME_OVERLAY sözleşmesi).
- **K2 — 4K istendi.** Yeni katman `h2160` (3840×2160), 15/30/60 fps. Yalnız (a) seçilen codec için
  `mediaCapabilities.encodingInfo({type:"webrtc"})` `powerEfficient === true` **ve** (b) capture
  sonrası `getSettings()` yüksekliği ≥ 2160 ise etkindir; aksi halde bir alt katmana **sessizce
  değil, etiketle** düşer ("Kaynak 1440p"). Her zaman SVC (AV1/VP9) veya simulcast (H264) ile
  yayınlanır ki izleyiciler 1080p katmanı alsın. Feature flag `screenShare4k` (UAT açık,
  prod kapalı; kullanıcı kararı 2026-09-17).
- **K3 — Capture yolu `getDisplayMedia` kalır.** Özel seçici, uygulama başına ses, exclusive
  fullscreen yakalama yalnız Ş8 spike'ında (**koşar**, kullanıcı kararı 2026-09-17). Chromium
  seçicisinin thumbnail'ları bu paketin üretim deneyimidir.
- **K4 — Kalite tercihi üç eksene ayrılır:** `screenShareResolution` (`h720|h1080|h1440|h2160`),
  `screenShareFrameRate` (`15|30|60`), `screenShareMode` (`text|motion`). Eski
  `screenShareQuality` id'si (`h1080fps60` vb.) rehydrate'te ikiye **ayrıştırılır**, atılmaz.
  Preset id şeması `h{res}fps{fps}` korunur (mobil sözleşme aynı şemayı okuyor).
- **K5 — Bitrate merdiveni (Mbps), `text` modu:** 720p 15/30/60 → 1.5/2.5/3.5; 1080p → 2.5/4/6;
  1440p → 4/7/12; 2160p → 8/12/20. `motion` modu ×1.3 (yuvarlanır), 2160p60 **24 Mbps tavan**.
  Merdiven monoton (çözünürlük ve fps arttıkça düşmez) — sözleşme testi kilitler.
- **K6 — Codec probe sırası:** AV1 HW > VP9 HW > H264 HW > VP9 yazılım (`text`) / H264 yazılım
  (`motion`). "HW" = `encodingInfo(...).powerEfficient`. AV1/VP9 → `scalabilityMode: "L3T3_KEY"` +
  `backupCodec: true`; H264 → `simulcast: true` + `screenShareSimulcastLayers` (yarım ve çeyrek
  çözünürlük). Codec paylaşım oturumu boyunca sabittir; değişiklik bir sonraki paylaşımda.
  Kullanıcıya codec seçtirilmez, telemetride görünür.
- **K7 — Mod canlı değişir, yeniden yayınlamaz.** `text`: `contentHint "detail"` +
  `maintain-resolution`; `motion`: `contentHint "motion"` + `maintain-framerate`. Geçiş:
  `mediaStreamTrack.contentHint`, `sender.setParameters({ degradationPreference })`,
  `applyConstraints({ frameRate })` + encoding `maxFramerate`. Çözünürlük değişimi
  `applyConstraints({ width, height })` ile (Chromium ölçekler); codec değişimi yeniden paylaşım.
- **K8 — Go Live presence `stream` alanı:** `voice:screenshare:update` payload'ına opsiyonel
  `stream: { kind: "screen" | "window" | "game", gameId: GameId | null }`. `gameId` yalnız
  kullanıcının `GameSharingSettings.enabled` tercihi açıkken sunucu tarafından yayılır; kapalıysa
  sunucu `gameId: null` yazar, `kind: "game"` kalır ("Bir oyun yayınlıyor"). Payload ayrıca
  `label: string | null` (≤ 64) taşır: kayıtlı (kullanıcı eklediği) oyunlarda `gameId` `custom:<id>`,
  `label` kullanıcının yazdığı ad; sunucu etiketi kırpar/temizler, exe adı hiç gelmez (K22).
- **K9 — Go Live kaynak seçimi Chromium seçicisiyle.** `getDisplayMedia` doğrudan çağrılır
  (`displaySurface: "window"` ipucu, `preferCurrentTab: false`), `CaptureController` varsa
  `setFocusBehavior("focus-captured-surface")` ile odak oyuna geri verilir; dönen track
  `ScreenShareSession.start`'a **capture fabrikası** olarak girer, `publishTrack(track, {source:
ScreenShare, ...})` ile yayınlanır. Otomatik kaynak seçimi tarayıcıda yok; copy bunu söyler
  ("Seçicide oyun penceresini seç; tam ekran oyunlarda Ekran sekmesini kullan").
- **K10 — Oyun kapanınca yayın durur.** Pencere kapanınca track `ended` zaten durduruyor. Ek:
  Go Live aktifken `get_desktop_detected_game` 15 s döngüsü **iki ardışık** `null` verirse (≈30 s)
  paylaşım durdurulur + toast. Oyun dışı kaynak seçilmişse (`getSettings().displaySurface ===
"monitor"`) bu kural **uygulanmaz**; presence `kind` gerçek yüzeyi yazar.
- **K11 — İzleyen listesi socket ile, LiveKit abonelik olayıyla değil.** Yeni olay
  `voice:screenshare:watch { channelId, serverId, sharerUserId, watching }`; sunucu Redis SET
  `voice:screenshare:watchers:<channelId>:<sharerUserId>` TTL 120 s (mevcut TTL ile hizalı);
  izleyici 60 s'de bir yeniler; fanout `voice:screenshare:watchers:update { channelId,
sharerUserId, count, sample }` (`sample` ≤ 5 userId). Paylaşım bitince set silinir.
- **K12 — Mobil yayın tavanı 1080p30 kalır.** Mobil 4K yayınlamaz; 4K izlerken telefon en fazla
  1080p katmanı ister (`publication.dimensions.height > 1080` → `MEDIUM`). Mobil sözleşme testi
  değişmez.
- **K13 — iOS iki adım.** A: extension yokken `Platform.OS === "ios"` → `screenShareStatus:
"unsupported"`, buton pasif, copy açıklar. **A zorunlu ve önce.** B: Broadcast Upload Extension +
  app group + `ScreenCapturePickerView`; TestFlight'ta cihazla doğrulanmadan "destekleniyor" denmez.
- **K14 — Android arka planda paylaşım sürer.** Paylaşım aktifken `background` → kamera durur,
  paylaşım ve mikrofon sürer. Bunun için `FOREGROUND_SERVICE_MICROPHONE` + `foregroundServiceType`
  `microphone|mediaProjection` gerekir (Android 14+). Kullanıcı kararı 2026-09-17: **evet**. Play
  Console FGS beyanı Ş7 raporuna; paylaşım öncesi bilgilendirme copy'si yine eklenir.
- **K15 — OS durdurma dinlenir.** `TrackEvent.Ended` (LocalTrackPublication) → status `off`,
  heartbeat `false`, toast. Polling yedek olarak kalır.
- **K16 — Telemetri örnekleme:** sahne/paylaşım aktifken 2 s'de bir `getStats`, store'da son
  örnek; client-health'e oturum başına özet (başlangıç, her 60 s, bitiş) — 2 s'lik örnekler sunucuya
  **gitmez**. Mobilde örnekleme mevcut 90 ms ticker'ına sayaçla biner (her ≈22 tick).
- **K17 — `videoQualityMode` paylaşıma da uygulanır** (`voice-room-primitives.tsx:980-984`, Ş2).
- **K18 — Gerçek-medya e2e ayrı Playwright projesi** `chromium-real-media`; PR'da koşmaz; `uat`
  push + nightly + `workflow_dispatch`. LiveKit CI servis konteyneri docker-compose ile **aynı
  digest**.
- **K19 — Global "paylaşıyorsun" barı** voice görünümü dışında da çizilir (uygulama kabuğu);
  "N izliyor", "Kaynağı değiştir", "Durdur". `screenShare.reconnecting` mevcut anahtarı kullanılır.
- **K20 — Ayar ağacı varsayılanları store'a çekilir:** e2 `false`, e3 `100`. Tree değil store
  otoritedir (persist edilen o).
- **K21 — LiveKit Cloud (kullanıcı, 2026-09-17).** TURN/TLS 443 dahili: Ş4 yalnız UDP-kapalı ağdan
  doğrular, `turn` config yazmaz. `LIVEKIT_CONFIG` Cloud'a uygulanamaz: `audio` observer ayarı
  (gerçek #32) yalnız yerel docker'da; canlı speaking ring istemci ölçümüne dayanır (mevcut). CI
  yerel `--dev` sunucuyla koşar, Cloud'a bağlanmaz. Egress Cloud'da GB bazlı: 4K izleyici maliyeti
  Ş4 belgesinde formül olarak. `RoomServiceClient.createRoom` seçenekleri (`emptyTimeout` vb.)
  Cloud'da geçerli.
- **K22 — Kayıtlı oyunlar, Discord "Add it!" gibi.** Masaüstü ayarlarında "Kayıtlı oyunlar":
  kullanıcı çalışan uygulamalar listesinden seçer (liste yalnız o anda, yalnız yerelde; exe
  basename'leri asla ağa/telemetriye gitmez), ad exe'den türer ve düzenlenebilir, kayıt cihazda
  güvenli ayarlarda (`{ executable, label, id: "custom:<sha256(exe)[:12]>" }`). Algılama kataloğu
  ve kayıtlı oyunları birlikte tarar; presence "Oynuyor: {label}", Go Live "Yayına geç: {label}",
  presence `stream.label`. Sunucu etiketi doğrular (1–64, kontrol karakteri yok) ve
  `GameSharingSettings.enabled` kapalıysa `label: null`. Ayrı moderasyon yok (Discord da yapmıyor);
  kötüye kullanım mevcut kullanıcı raporu yoluyla.
- **K23 — Katalog onaysız işlenir.** Ş5'in ≈100'lük listesi (Türkiye pazarı dahil) doğrudan
  girer; rapora tablo yine yazılır, kullanıcı sonradan eler. Discord modeli: kürated katalog ve
  kullanıcı eklemesi kuyruğu kapatır.

## 6. Tuzaklar

- **T1** `publishDefaults` paylaşımı da etkiler (gerçek #26). Codec/degradation her publish'te açık.
- **T2** SVC'de encoding tek girdi; `applyScreenShareEncodingToSender` yalnız ilk girdi +
  `scalabilityMode` korunur. H264 simulcast'e geçince **tüm** girdiler yazılır — fonksiyon iki
  yolu da biliyor, testleri var; bozma.
- **T3** `VideoDimensionsChanged` emit edilmiyor; `getSettings()` + `loadedmetadata`.
- **T4** livekit-client `createScreenTracks` `displaySurface` ve `suppressLocalAudioPlayback`
  geçmiyor → Go Live kendi `getDisplayMedia` çağrısını yapar (K9); ses bastırma hack'i kalır.
- **T5** `pauseVideoInBackground` RN'de inert; `setVideoQuality` tavan, taban değil (gerçek #28).
- **T6** Jest: modül yüklenirken `VideoPresets`/`VideoQuality` okuma (gerçek #29).
- **T7** Mobil timer bütçesi 2 (gerçek #31) — telemetri ticker'a biner.
- **T8** `mobile-design-contract.test.ts` geometri kilitleri + hex yasağı (gerçek #30).
- **T9** `android/` gitignored; manifest doğrulaması `mobile-app-config-contract.test.ts` ile.
- **T10** Headless Chromium'da `requestPictureInPicture` / Document PiP açılmaz → e2e'de
  `test.skip`, davranış saf modül testiyle kilitlenir.
- **T11** CDP `emulateNetworkConditions` WebRTC UDP'yi **etkilemez** → `tc netem` (Ş0.3).
- **T12** `--auto-select-desktop-capture-source` headless'ta sanal ekranı yakalar; boyut
  `--window-size` ile; 4K için `--window-size=3840,2160` (yazılım encode, yalnız çözünürlük
  sözleşmesi doğrulanır, fps değil).
- **T13** `E2E_TEST_MODE` sahte provider'ı takar; real-media projesi bunu **kapatan** ayrı bir
  bayrakla koşar, aksi halde LiveKit'e hiç gidilmez.
- **T14** `countActiveScreenShares >= 2` cap'i `requestScreenShare` ve `canPublish` içinde iki yerde.
- **T15** `GameIdSchema` sabit enum; katalog büyüyünce enum JSON'dan türetilmezse Rust ve TS
  ayrışır. Rust `include_str!` JSON'u okuyor — JSON tek kaynak kalır.
- **T16** `get_desktop_detected_game` yalnız `DESKTOP_CONTROL`/ana pencere komutu; 15 s önbellek;
  opt-in kapalıysa `gameId: null` — Go Live CTA opt-in kapalıyken **görünmez**, kullanıcıyı ayara
  yönlendiren copy gösterilir.
- **T17** Overlay Tauri komut izni almaz; izleyen sayısı snapshot'a **sayı** olarak eklenir,
  isim/id eklenmez (`sample` overlay'e gitmez).
- **T18** Ayar ağacı `functional-coverage.test.ts` ve `av-settings-bridge.test.tsx` satır
  anahtarlarını (e1…e7) sayıyor; yeni satır eklenince ikisi de güncellenir.

## 7. Sözlük

- **Katman** (`resolution tier`): `h720 | h1080 | h1440 | h2160`.
- **Mod**: `text` (okunurluk; çözünürlük korunur) / `motion` (akıcılık; fps korunur).
- **Preset id**: `h{res}fps{fps}`, örn. `h2160fps60`.
- **Go Live**: oyun algılanmış + paylaşım `kind: "game"`.
- **Kayıtlı oyun**: kullanıcının eklediği uygulama (`custom:<id>` + etiket), K22.
- **HW**: `encodingInfo(...).powerEfficient === true`.
- **Real-media**: sahte provider kapalı, gerçek `getDisplayMedia` + gerçek LiveKit.

## 8. Discord referans davranışları (ne kopyalanıyor, ne kopyalanmıyor)

Kopyalanıyor: çözünürlük ve fps ayrı seçiciler; "akıcı / net" ikilisi; oyun algılanınca CTA'nın oyun
adını alması; yayın bitince presence'ın düşmesi; izleyen sayısı; pop-out; sistem sesi (Windows,
Chromium seçicisi üzerinden). Kopyalanmıyor: özel seçici (Ş8), uygulama başına ses (Ş8), stream
preview küçük resmi, Nitro tarzı ödeme kapısı (feature flag yeter), anti-cheat hook'ları (asla).
