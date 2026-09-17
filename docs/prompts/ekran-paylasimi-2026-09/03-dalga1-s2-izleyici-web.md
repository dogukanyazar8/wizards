# Dalga 1 · Ş2 — İzleyici deneyimi (web + masaüstü)

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 0 kapısı geçti.

---

Whispr monorepo, `uat` dalı. Görev: paylaşımı **izleyen** tarafın deneyimini Discord seviyesine
çıkarmak: fit/zoom/pan, tarayıcı PiP + Document PiP pop-out, çoklu paylaşım düzeni, "N izliyor"
çipi, voice görünümü dışında "paylaşıyorsun" barı, 4K/AV1 izleyici katman kuralı. Encoder'a
dokunmaz (Ş1), socket yazmaz (Ş3).

Önce oku: `00-ortak-baglam.md` §4 #5–#7, §5 K12, K17, K19, §6 T3, T5, T10;
`raporlar/01-s01-rapor.md` (store alanları: `screenShareViewerCounts`, `screenShareHealth`,
`goLive`). Kod için `graphify query "voice stage screen share fullscreen pip video quality ceiling"`.

## Sahiplenilen dosyalar

- `apps/web/src/lib/voice/video-viewport.ts` (yeni) + `.test.ts`
- `apps/web/src/lib/voice/screen-share-pip.ts` (yeni) + `.test.ts`
- `apps/web/src/lib/voice/video-subscription.ts` + `.test.ts` (paylaşım tavanı kuralı)
- `apps/web/src/components/voice/room/voice-room-primitives.tsx`
- `apps/web/src/components/voice/server/server-voice-surface.tsx` + `.test.tsx`
- `apps/web/src/components/voice/voice-channel-view.tsx`, `apps/web/src/components/dm/dm-call-view.tsx`
- `apps/web/src/components/voice/screen-share-status-bar.tsx` (yeni) + test; kabuğa montaj için
  **tek** import satırı (montaj noktasını raporla; kabuk dosyasında başka değişiklik yok)
- `apps/web/src/lib/shortcuts/catalog.ts` + `.test.ts` (zoom/fit kısayolları)
- `apps/web/e2e/specs/voice/voice.spec.ts` (sahte provider ile UI senaryoları)

**Yazma:** `screen-share.ts`, `live-voice-provider.tsx` (Ş1), `handlers/voice.ts`,
`channel-item.tsx` (Ş3), i18n (Ş0.1), `apps/mobile/**`.

## Ne yapılacak

### 1. `videoQualityMode` düzeltmesi (K17)

`voice-room-primitives.tsx:980-984` paylaşım tavanı çağrısına `videoQualityMode` geçer. Tek satır,
ilk commit'lik iş; test `video-subscription.test.ts`'de zaten var, primitives testine bir assert.

### 2. Viewport — `video-viewport.ts` (saf reducer)

Durum `{ fit: "contain"|"cover", zoom: 1..4, panX, panY }`; eylemler `toggleFit`, `zoomBy(delta,
originX, originY)`, `panBy`, `reset`, `fitToContent`. Pan sınırı: içerik kutu dışına çıkamaz
(clamp, kutu ve içerik boyutundan). Çift tık → `zoom 1 ↔ 2`; tekerlek + `ctrl` zoom; sürükle pan;
`0` reset; `F` fullscreen (mevcut çift tık korunur). Uygulama `ScreenShareVideo` (`:423-466`) CSS
`transform` ile (`will-change`), `object-fit` fit'ten. Paylaşım için varsayılan `contain` kalır
(V2 çerçeveleme sözleşmesi: paylaşım kırpılmaz — `cover` yalnız kullanıcı seçince).

### 3. PiP — `screen-share-pip.ts`

- `getPictureInPictureCapabilities(doc, win)` → `{ video: boolean, document: boolean }`
  (`document.pictureInPictureEnabled`, `"documentPictureInPicture" in window`).
- `enterVideoPictureInPicture(videoEl)` / `exit…`; `openDocumentPictureInPicture({ width, height })`
  → yeni pencereye stage kopyası taşınır (React portal; ses/kontroller ana pencerede kalır,
  pop-out yalnız video + durdur/kapat). Kapanınca stage geri gelir.
- Firefox: yalnız video PiP; WebView2: ikisi (Chromium 116+). `pip.unsupported` copy'si.
- Butonlar stage araç çubuğunda (`voice-stage-pip`, `voice-stage-pop-out` testid'leri).

### 4. Çoklu paylaşım

Cap 2 kalır (T14). İki paylaşım varken düzen: odak + sağda küçük resim şeridi (tıkla → odak
değişir; mevcut `setActiveScreenShareId`). Küçük resim `MEDIUM` tavan, odak `HIGH` (mevcut
`isStage` kuralı). "Active shares" listesi (`:1162-1199`) korunur.

### 5. 4K / AV1 izleyici katmanı (K12 web karşılığı)

`video-subscription.ts`'e `resolveScreenShareViewerQuality({ elementHeightPx, dpr, sourceHeight,
decodeSmooth })`: kanal odasında adaptive stream zaten kutu boyutuna göre ister; DM'de
(`adaptiveStream: false`) kural elle: `elementHeightPx * dpr < sourceHeight / 2` → `MEDIUM`,
`< sourceHeight / 4` → `LOW`; `decodeSmooth === false` (AV1 4K `mediaCapabilities.decodingInfo`
`smooth:false`) → en az bir katman aşağı. Kaynak yüksekliği `publication.dimensions` yoksa
`<video>` `loadedmetadata` (T3).

### 6. "N izliyor" + sunucu/LIVE çipi

`server-voice-surface.tsx:862-913` sunucu çipinin yanına `voice-stage-viewer-count`
(`viewers.count`, 0 ise `viewers.none` yalnız paylaşanın kendi sahnesinde). Veri
`screenShareViewerCounts[sharerUserId]` (Ş3 doldurur; Ş3 bitene kadar `0`). Go Live başlığı:
`goLive`/`screenShareStreamInfo` doluysa `goLive.streamingTitle`, `label` varsa etiketle
`streamingTitle` (kayıtlı oyun), `gameId` ve `label` ikisi de yoksa `streamingUnknown`, hiç
`stream` yoksa mevcut "{name} is sharing".

### 7. Global bar — `screen-share-status-bar.tsx` (K19)

`isScreenSharing` ve voice görünümü görünür değilken üstte sabit bar: "Ekranını paylaşıyorsun ·
N izliyor · Kaynağı değiştir · Durdur"; Go Live'da `bar.goLive`. Bağlantı `reconnecting`
durumunda mevcut `screenShare.reconnecting` anahtarı. Masaüstü voice-mini penceresine dokunulmaz
(Ş3 overlay snapshot'ı üzerinden sayı alır).

### 8. Kısayollar

`catalog.ts`'e `voice.screenShare.zoomIn/zoomOut/zoomReset/toggleFit` (yalnız stage odaktayken);
mevcut `Cmd/Ctrl+Shift+S` korunur.

## Test

- `video-viewport.test.ts`: clamp, çift tık döngüsü, zoom origin altındaki nokta sabit kalır,
  reset, fit değişince pan sıfırlanır.
- `screen-share-pip.test.ts`: capability matrisi (Chromium/Firefox sahte `document`/`window`),
  `exit` idempotent, pop-out kapanınca callback.
- `video-subscription.test.ts`: DM 4K kuralı; `decodeSmooth:false` bir katman aşağı; kanal
  odasında fonksiyon adaptive'i **ezmez** (tavan).
- `server-voice-surface.test.tsx`: viewer count çipi 0/1/çoğul; Go Live başlığı üç hâli;
  PiP butonları capability'e göre.
- Global bar RTL: voice görünümü açıkken çizilmez; paylaşım yokken çizilmez; `reconnecting`.
- `voice.spec.ts` (sahte provider): fit toggle, zoom kısayolu, iki paylaşım küçük resim şeridi,
  bar görünür/gizli (sekme değiştirme). PiP e2e `test.skip` (T10).

## Kapı

```bash
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web e2e:realtime
```

Rapor: `raporlar/03-rapor.md` — barın kabuğa montaj noktası, Document PiP'in WebView2'de elle
doğrulandığı (evet/hayır + sürüm), Firefox'ta hangi butonların gizlendiği.
