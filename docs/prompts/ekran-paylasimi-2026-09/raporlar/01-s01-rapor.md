# Ş0.1 — Sözleşme katmanı raporu

Tarih: 2026-09-17 · Dal: `uat` · Commit yok (uncommitted). Davranış yazılmadı; alan açıldı.

## 1. Oluşturulan alan / anahtar listesi (Dalga 1–2 bunu adıyla tüketir)

### 1.1 `@wizards/types` — `packages/types/src/screen-share.ts` (yeni, `index.ts`'ten export)

| Ad                                                                                                                                        | Tür                                                                                                       | Not                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `SCREEN_SHARE_RESOLUTIONS` / `ScreenShareResolutionSchema` / `ScreenShareResolution`                                                      | `["h720","h1080","h1440","h2160"]`                                                                        | K4                                            |
| `SCREEN_SHARE_FRAME_RATES` / `ScreenShareFrameRateSchema` / `ScreenShareFrameRate`                                                        | `15 \| 30 \| 60`                                                                                          | K4                                            |
| `SCREEN_SHARE_MODES` / `ScreenShareModeSchema` / `ScreenShareMode`                                                                        | `"text" \| "motion"`                                                                                      | K4/K7                                         |
| `DEFAULT_SCREEN_SHARE_RESOLUTION` `="h1080"`, `DEFAULT_SCREEN_SHARE_FRAME_RATE` `=60`, `DEFAULT_SCREEN_SHARE_MODE` `="text"`              | sabit                                                                                                     |                                               |
| `SCREEN_SHARE_RESOLUTION_DIMENSIONS`, `getScreenShareResolutionHeight(res)`                                                               | 1280×720 … 3840×2160                                                                                      | K2 `height ≥ 2160` kapısı                     |
| `ScreenSharePresetId`                                                                                                                     | `` `${res}fps${fps}` ``                                                                                   | 12 id                                         |
| `resolveScreenSharePresetId(res, fps)`                                                                                                    | → `h1080fps60`                                                                                            |                                               |
| `splitScreenShareQualityId(unknown)`                                                                                                      | → `{ resolution, frameRate } \| null`                                                                     | eski id + `h*fps30` alias'ı gerçek 30'a çözer |
| `SCREEN_SHARE_BITRATE_LADDER_KBPS`                                                                                                        | `Record<mode, Record<res, Record<fps, kbps>>>`                                                            | K5 iki harita                                 |
| `SCREEN_SHARE_MOTION_BITRATE_MULTIPLIER` `=1.3`, `SCREEN_SHARE_MAX_BITRATE_KBPS` `=24_000`                                                | sabit                                                                                                     | 2160p60 motion = 24 000                       |
| `getScreenShareBitrateKbps(mode, res, fps)`                                                                                               |                                                                                                           |                                               |
| `SCREEN_SHARE_STREAM_KINDS` / `ScreenShareStreamKindSchema`                                                                               | `"screen" \| "window" \| "game"`                                                                          | K8                                            |
| `ScreenShareStreamInfoSchema` / `ScreenShareStreamInfo`                                                                                   | `{ kind, gameId: string(1–128) \| null, label: string(1–64, kontrol karakteri yok) \| null }` `.strict()` | K8/K22; katalog/`custom:` regex'i Ş5'in       |
| `SCREEN_SHARE_STREAM_LABEL_MAX_LENGTH` `=64`, `SCREEN_SHARE_GAME_ID_MAX_LENGTH` `=128`, `SCREEN_SHARE_CUSTOM_GAME_ID_PREFIX` `="custom:"` | sabit                                                                                                     |                                               |
| `ScreenShareHealthDirectionSchema`                                                                                                        | `"send" \| "receive"`                                                                                     | K16                                           |
| `ScreenShareQualityLimitationReasonSchema`                                                                                                | `"none" \| "cpu" \| "bandwidth" \| "other"`                                                               |                                               |
| `ScreenShareQualityLimitationDurationsSchema`                                                                                             | `{ none, cpu, bandwidth, other }` ms, `.strict()`                                                         |                                               |
| `ScreenShareHealthSnapshotSchema` / `ScreenShareHealthSnapshot`                                                                           | bkz. §1.1.a                                                                                               | `.strict()`                                   |
| `SCREEN_SHARE_IMPLEMENTATION_NAME_PATTERN`                                                                                                | `/^[A-Za-z0-9 ._:/()-]{0,64}$/u`                                                                          | `*Implementation` allowlist                   |
| `parseScreenShareHealthSnapshot(unknown)`                                                                                                 | → snapshot \| null                                                                                        |                                               |
| `ScreenShareWatchersUpdateSchema` / `ScreenShareWatchersUpdate`                                                                           | `{ channelId, sharerUserId, count ≥ 0 int, sample: userId[] ≤ 5 }` `.strict()`                            | K11                                           |
| `SCREEN_SHARE_WATCHER_SAMPLE_MAX` `=5`                                                                                                    | sabit                                                                                                     |                                               |

**1.1.a Health snapshot alanları** (Ş0.2 doldurur): `direction`, `sampledAt` (epoch ms, int), `fps`, `width`,
`height`, `bitrateKbps`, `qualityLimitationReason`, `qualityLimitationDurationsMs`, `encoderImplementation`,
`decoderImplementation`, `powerEfficientEncoder`, `framesDropped`, `freezeCount`, `totalFreezesDurationMs`,
`jitterBufferDelayMs`, `packetsLost`, `roundTripTimeMs`. `direction` ve `sampledAt` dışında **her alan
nullable** (`null` = bu yönde ölçülmez / ilk örnekte delta yok). Sayılar sonlu ve ≥ 0; sayaçlar int.
`qualityLimitationDurationsMs` alan tarafta `null` olabilir.

### 1.2 `packages/types/src/mobile.ts`

- `MobileVoiceStateParticipantSchema.stream?: ScreenShareStreamInfo` (`isScreenSharing` yanı).
- `MobileVoiceScreenShareUpdateEventSchema.stream?: ScreenShareStreamInfo`.

### 1.3 Socket — `apps/web/src/lib/socket/schemas.ts`, `events.ts`

- `SocketVoiceScreenSharePayloadSchema` + `stream: ScreenShareStreamInfoSchema.optional()` (`.strict()` korundu).
- Yeni `SocketVoiceScreenShareWatchPayloadSchema { channelId, serverId, sharerUserId, watching: boolean }` `.strict()`.
- `ClientToServerEvents`: `voice:screenshare:update` payload'ına `stream?`; yeni `voice:screenshare:watch`.
- `ServerToClientEvents`: `voice:screenshare:update` payload'ına `stream?`; `voice:state:update`
  katılımcısına `stream?`; yeni `voice:screenshare:watchers:update (ScreenShareWatchersUpdate)`.
- Handler yok (Ş3).

### 1.4 Store — `apps/web/src/store/voice-store.ts`

Persist edilen (yeni): `screenShareResolution` (`"h1080"`), `screenShareFrameRate` (`60`),
`screenShareContentMode` (`"text"`) — **ad sapması, bkz. §4.1**.

Persist edilmeyen (yeni): `screenShare4kAllowed: boolean` (`false`), `screenShareHealth:
ScreenShareHealthSnapshot | null`, `screenShareViewerCounts: Record<sharerUserId, number>`,
`goLive: VoiceGoLiveSession | null` (`{ gameId, label }`), `screenShareStreamInfo: ScreenShareStreamInfo | null`.

Türetilmiş, persist edilmeyen: `screenShareQuality: ScreenShareQualityId` =
`toLegacyScreenShareQualityId(resolution)` (`h720→h720fps60`, `h1080→h1080fps60`, `h1440/h2160→h1440fps60`).
Bkz. §4.2.

Setter'lar: `setScreenShareResolution`, `setScreenShareFrameRate`, `setScreenShareContentMode`,
`setScreenShare4kAllowed`, `setScreenShareHealth`, `setScreenShareViewerCount(sharerUserId, count)`,
`clearScreenShareViewerCount(sharerUserId)`, `setGoLive`, `setScreenShareStreamInfo`. Eski
`setScreenShareQuality(id)` korundu: id'yi `splitScreenShareQualityId` ile iki eksene yazar.

Sıfırlama: `clearScreenShareState` → `goLive`, `screenShareStreamInfo` null; `screenShareHealth` yalnız
`direction === "send"` ise null (izlenen paylaşımın örneği kalır). `leave` → hepsi + `screenShareViewerCounts`.

Dışa açılan saf yardımcılar: `sanitizeScreenShareResolution/FrameRate/ContentMode`,
`toLegacyScreenShareQualityId`, `resolvePersistedScreenShareAxes`, `mergePersistedVoiceState`,
`partializeVoiceState` (persist `merge`/`partialize` artık adlandırılmış fonksiyon; test bunları doğrudan çağırır),
`VoiceStoreState` (export), `VoiceGoLiveSession`.

K20: `screenShareAudioEnabled: false`, `screenShareVolume: 100` store'da zaten öyleydi; ağaç ona çekildi.

### 1.5 Ayar ağacı — `apps/web/src/lib/settings/tree.ts`

- `e1` segment 4 seçenek: `settings.option.e1.1…4` (**etiketler** `720p` / `1080p` / `1440p` / `4K (kaynak)` —
  fps eki düştü çünkü fps artık `e8`). Yeni satır alanı `optionGateKeys: { 3: "settings.option.e1.4.disabled" }`
  (`SettingsRowDef.optionGateKeys?: Record<number, string>`; `collectSettingsCopyKeys()` toplar).
- Yeni `e8` segment (`settings.row.e8.title`, `settings.option.e8.1…3` = 15/30/60 fps, default 2).
- Yeni `e9` segment (`settings.row.e9.title`, `settings.option.e9.1…2` = Net metin / Akıcı görüntü, default 0).
- `e2` default `false`, `e3` default `100` (K20). `e7` korundu.
- `SETTINGS_TREE_COUNTS.rows` 151 → **153**; `tree.test.ts` av dağılımı `rows: 21 → 23`.

### 1.6 Köprü — `av-settings-bridge.tsx`

- Okuma: `e1` = `SCREEN_SHARE_RESOLUTION_ROW_ORDER.indexOf(resolution)`, `e8` = fps dizini, `e9` = mod dizini.
- Yazma: `e1 → setScreenShareResolution`, `e8 → setScreenShareFrameRate`, `e9 → setScreenShareContentMode`.
- K2 kapısı: `e1 === 3` (4K) ve `screenShare4kAllowed === false` → `SETTINGS_WRITE_INVALID:e1` fırlatır
  (kutu değeri geri alır, "Kaydedildi" demez). Dizin dışı seçenek de fırlatır.
- Export: `SCREEN_SHARE_RESOLUTION_ROW_ORDER`, `SCREEN_SHARE_FRAME_RATE_ROW_ORDER`,
  `SCREEN_SHARE_MODE_ROW_ORDER`, `SCREEN_SHARE_4K_OPTION_INDEX` (=3).
- `AvVoiceSnapshot` Pick'ine `screenShare4kAllowed`, `screenShareContentMode`, `screenShareFrameRate`,
  `screenShareResolution` girdi; `screenShareQuality` çıktı. `AvVoiceWriter`'dan `setScreenShareQuality` çıktı.

### 1.7 i18n web (`tr.ts` + `en.ts`, her ikisinde)

`voice.screenShare.mode.text`, `.mode.motion`, `.mode.text.description`, `.mode.motion.description`,
`voice.screenShare.fps.label`, `voice.screenShare.resolution.h2160`, `.resolution.h2160.requiresHardware`,
`.resolution.fallbackLabel` (`{resolution}`), `voice.screenShare.health.chip` (`{height}p · {fps} fps`),
`.health.limited.cpu`, `.health.limited.bandwidth`, `.health.encoder` (`{encoder}`),
`voice.screenShare.viewers.count` + `_one` + `_other` (`{count}`), `.viewers.none`,
`voice.screenShare.bar.sharing`, `.bar.switch`, `.bar.stop`, `.bar.goLive` (`{game}`),
`voice.goLive.cta` (`{game}`), `.cta.disabledOptIn`, `.pickerHint`, `.gameClosed`,
`.streamingTitle` (`{name} {game}`), `.streamingUnknown` (`{name}`), `voice.sidebar.streamingGame` (`{game}`),
`voice.screenShare.pip.enter`, `.pip.popOut`, `.pip.unsupported`, `voice.screenShare.fit.contain`,
`.fit.cover`, `.zoom.reset`, `screenShare.errors.hardwareRequired4k`, `screenShare.errors.gameGone`.

Ayar: `settings.option.e1.1…3` (yeniden etiketlendi), `settings.option.e1.4`, `settings.option.e1.4.disabled`,
`settings.row.e8.title`, `settings.option.e8.1…3`, `settings.row.e9.title`, `settings.option.e9.1…2`.
Tümü `settings-screen-copy.test.ts` `APPROVED_COPY_CHANGES`'e eklendi. Hiçbir metin donanım kodlayıcı markası anmaz.

### 1.8 Mobil copy (`mobile-copy.ts`, tr + en)

`voiceScreenShareUnsupportedIos`, `voiceScreenShareBackgroundContinues`, `voiceScreenShareStoppedBySystem`,
`voiceScreenSharePermissionDenied`, `voiceScreenShareViewers` (`{count}`), `voiceScreenShareZoomHint`,
`voiceScreenShareStreamingTitle` (`{name} {game}`). `voiceScreenShareUnavailable` değişmedi.

## 2. Migration kararı

- Rehydrate (`resolvePersistedScreenShareAxes`): `screenShareResolution` **veya** `screenShareFrameRate`
  geçerliyse yeni eksenler kazanır (eksik olan varsayılana düşer). İkisi de yoksa eski `screenShareQuality`
  `splitScreenShareQualityId` ile ayrıştırılır; tanınmazsa varsayılan (`h1080` + `60`).
- `h720fps30` alias'ı artık **gerçek 30 fps**'e çözülür (`h720` + `30`), 60'a değil: kare hızı ayrı eksen ve 30
  geçerli bir seçim; kullanıcının kaydettiği değer korunur.
- `partialize` eski `screenShareQuality` anahtarını **yazmaz**; ilk yazımda localStorage'dan düşer.
- Store'daki `screenShareQuality` alanı türetilmiş kalır (bkz. §4.2). Store versiyon numarası eklenmedi;
  `merge` alan bazlı sanitize ettiği için gerekmedi.

## 3. Test sonuçları

| Komut                                                                                                                                                       | Sonuç                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @wizards/types test`                                                                                                                         | 653 / 653 geçti (yeni `screen-share.test.ts`: 19 test)                                                                                                     |
| `pnpm --filter @wizards/types typecheck`                                                                                                                    | exit 0                                                                                                                                                     |
| `pnpm --filter @wizards/web typecheck`                                                                                                                      | benim dosyalarımda 0 hata; **6 hata yalnız Ş0.3 WIP** `apps/web/e2e/specs/voice/screen-share-real-media.spec.ts` (Playwright `skip` imzası / implicit any) |
| `pnpm --filter @wizards/web test`                                                                                                                           | 8720 test / 1946 suite: 8712 geçti, 0 kırık (8 skip/todo), exit 0 — Ş0.2/Ş0.3'ün o andaki WIP dosyaları dahil                                              |
| Hedefli web (store, schemas, av-bridge, tree, functional-coverage, settings-screen-copy, messages, search-index, render-settings-tab, setting-custom-block) | 140 / 140 geçti                                                                                                                                            |
| `pnpm --filter @wizards/mobile typecheck`                                                                                                                   | exit 0                                                                                                                                                     |
| `pnpm --filter @wizards/mobile test`                                                                                                                        | 2001 / 2001 geçti                                                                                                                                          |

Yeni/uzatılan testler: `packages/types/src/screen-share.test.ts` (merdiven monoton, motion ≥ text her hücre,
2160p60 = 24 000, split/resolve gidiş-dönüş 12 id, alias, PII allowlist, `.strict()` sızma, mobil `stream`),
`voice-store.test.ts` (+7: varsayılanlar/K20, türetilmiş legacy id, legacy setter, sanitize, migration,
merge/partialize, oturum alanları), `schemas.test.ts` (+3), `av-settings-bridge.test.tsx` (+5),
`functional-coverage.test.ts` (`e8 e9`), `tree.test.ts` (av 23), `settings-screen-copy.test.ts` (onaylı metinler).

## 4. Sapmalar

1. **`screenShareMode` adı alınamadı.** Store'da `screenShareMode: "dm" | "voice" | null` zaten var ve
   `live-voice-provider.tsx`, `e2e-voice-provider.tsx`, `lib/voice/page-exit.ts` (hepsi yasak) onu okuyor.
   Yeni tercih **`screenShareContentMode`** (`ScreenShareMode` tipi, `setScreenShareContentMode`). Types'taki
   şema adı spec'teki gibi `ScreenShareModeSchema`. Ayar satırı `e9` bu alana yazar.
2. **`screenShareQuality` getter'ı tam preset id döndürmüyor.** `voice-context.tsx:70` alanı üç değerli
   `ScreenShareQualityId` tipinde okuyor (yasak dosya); `h2160fps15` gibi bir değer typecheck'i kırardı.
   Geçiş süresince alan `toLegacyScreenShareQualityId(resolution)` ile eski merdivene kırpılır (fps hep 60,
   4K → 1440p60). Tam id için `resolveScreenSharePresetId(state.screenShareResolution, state.screenShareFrameRate)`.
3. **Sahiplenilen liste dışı iki test dosyası güncellendi:** `apps/web/src/lib/settings/tree.test.ts`
   (av `rows: 21 → 23`, tek satır) ve `apps/web/src/lib/locale/settings-screen-copy.test.ts`
   (`APPROVED_COPY_CHANGES` + 14 giriş). İkisi de ağacı/sözlüğü kilitleyen sözleşme testleri; başka şerit sahibi
   yok; güncellenmeseydi `pnpm --filter @wizards/web test` kapısı kırmızı kalırdı (00 §1: "bilinçli değişen
   kilit yeni değere güncellenir ve raporda anılır").
4. **`e1` seçenek etiketleri** `720p60/1080p60/1440p60` → `720p/1080p/1440p`: fps artık `e8`'de; referans
   HTML'den sapma onaylı liste ile kaydedildi.
5. **4K seçeneği tek başına `disabled` çizilemiyor.** `SettingSegment` / `render-settings-tab.tsx` /
   `SettingsRowRuntime` seçenek bazlı `disabled` bilmiyor ve sahiplenilen listede değil. Sözleşme ağaçta
   (`optionGateKeys`) ve köprüde (yazma düşer) hazır; çizim İstek §5.1.
6. **`screenShareStreamInfo` persist edilmiyor** (spec bunu belirtmemişti): canlı paylaşımın presence
   bilgisi oturum durumudur; `clearScreenShareState`/`leave` sıfırlar.
7. `ScreenShareStreamInfoSchema.gameId` `z.string().min(1).max(128)` — spec'teki `z.string()`'e alt/üst sınır
   eklendi; katalog/`custom:` regex'i Ş5'in `game-activity.ts`'inde kalır.
8. Health snapshot'ta ölçüm alanları `nullable` (spec listesi nullability vermiyordu; Ş0.2 bölümü
   `bitrateKbps: null` istiyor, alan/gönderim yönleri farklı alan doldurur).

## 5. İstekler

1. **Ş1 (`setting-segment.tsx`, `render-settings-tab.tsx`, `use-setting-value.ts`):**
   `SettingsRowRuntime.disabledOptions?: Record<rowKey, number[]>` + `SettingSegment` seçenek bazlı
   `disabled` ve `row.optionGateKeys[index]` açıklaması. Köprü `disabledOptions: { e1: screenShare4kAllowed ? [] : [3] }`
   verecek; o zaman köprüdeki `SETTINGS_WRITE_INVALID:e1` fırlatması yalnız savunma olarak kalır.
2. **Ş1 (`voice-context.tsx`, `live-voice-provider.tsx`, `voice-channel-view.tsx`, `dm-call-view.tsx`,
   `lib/voice/screen-share.ts`):** `screenShareQuality` yerine `screenShareResolution` + `screenShareFrameRate`
   - `screenShareContentMode` okuyun; `ScreenShareQualityId`'yi 12 preset'e genişletince store'daki türetilmiş
     alan ve `toLegacyScreenShareQualityId` silinir.
3. **Ş1/Ş3 (`live-voice-provider.tsx`, `e2e-voice-provider.tsx`, `page-exit.ts`):** oturum yüzeyi alanı
   `screenShareMode` → `screenShareSurface` olarak yeniden adlandırılırsa tercih alanı spec'teki
   `screenShareMode` adını alabilir.
4. **Ş3 (`handlers/voice.ts`):** `stream` alanını `GameSharingSettings.enabled`'a göre temizleyip
   `voice:screenshare:update` fanout'una geçir; `voice:screenshare:watch` handler'ı + Redis SET; paylaşım
   bitince `count: 0` yay.
5. **Ş0.3:** `screen-share-real-media.spec.ts` `test.skip(({ browserName }, testInfo) => …)` imzası
   web typecheck'i kırıyor (6 hata); sahibi Ş0.3.
6. `packages/types/src/settings.ts` `SettingsScreenShareSchema.quality: z.enum(["720p60","1080p60","1440p60"])`
   (sunucu ayar DTO'su) bu paketin eksenlerini bilmiyor; bu şeridin listesinde olmadığı için dokunulmadı.
   Dalga 1 tüketirse `resolution/frameRate/mode`'a genişletilmeli.
