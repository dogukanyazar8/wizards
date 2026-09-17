# Dalga 1 · Ş3 — İzleyen listesi: socket, Redis sayaç, fanout, sidebar, overlay

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 0 kapısı geçti (Ş0.1 `voice:screenshare:watch` şemaları + store alanı).

---

Whispr monorepo, `uat` dalı. Görev: bir paylaşımı **kimlerin izlediğini** saymak ve dağıtmak
(Discord "N izliyor"). Sunucu tarafı + istemci kancası + sidebar + masaüstü overlay. Sahne UI'ını
Ş2 çizer (store'dan okur); bu şerit sahne dosyalarına dokunmaz.

Önce oku: `00-ortak-baglam.md` §4 #9, #13, §5 K8, K11, §6 T17; `raporlar/01-s01-rapor.md`.
Emsal: `docs/prompts/denetim-2026-08/04-ses-ve-livekit-yetkisi.md` (rate limit + no-op erken
dönüş deseni), `apps/web/src/lib/socket/handlers/voice.ts:285-349`.
Kod için `graphify query "voice screenshare update socket handler redis rate limit"`.

## Sahiplenilen dosyalar

- `apps/web/src/lib/socket/handlers/voice.ts` + `.test.ts`
- `apps/web/src/lib/voice/screen-share-state.ts` + `.test.ts` (watchers anahtarları)
- `apps/web/src/lib/voice/service.ts` — **yalnız** ayrılma/temizlik yolunda watchers set'i silme
- `apps/web/src/hooks/use-screen-share-watch.ts` (yeni) + `.test.ts`
- `apps/web/src/components/shell/channel-item.tsx` (+ mevcut test dosyası)
- `packages/types/src/voice-mini.ts` + `.test.ts` (`screenShareViewerCount`, `isScreenSharing`),
  `apps/web/src/lib/desktop/voice-mini-snapshots.ts`, `apps/web/src/lib/desktop/game-overlay-state.ts`,
  overlay/voice-mini bileşenleri (yalnız çip ekleme)
- `apps/mobile/src/realtime/realtime-query-bridge.ts`, `mobile-realtime-contract.ts`,
  `apps/mobile/src/query/mobile-voice-states-query.ts` (+ testleri) — `watchers:update` önbelleğe

**Yazma:** `voice-room-primitives.tsx`, `server-voice-surface.tsx` (Ş2), `live-voice-provider.tsx`
(Ş1), `screen-share.ts`, i18n, mobil ekranlar (Ş7 çizer).

## Ne yapılacak

### 1. Sunucu — `voice:screenshare:watch`

- `checkRateLimit` (mevcut desen, limit 20/dk); şema `SocketVoiceScreenShareWatchPayloadSchema`;
  yetki: gönderen o ses kanalının katılımcısı (`socket.data.voiceRooms.has(channelId)`), paylaşan
  gerçekten paylaşıyor (`voice:screenshare:<channelId>:<sharerUserId>` anahtarı `"1"`).
- Redis SET `voice:screenshare:watchers:<channelId>:<sharerUserId>`: `watching:true` → `SADD` +
  `EXPIRE 120`; `false` → `SREM`. Değer değişmediyse (idempotent `SADD` 0 döner) fanout **yok**.
- Fanout `voice:screenshare:watchers:update { channelId, sharerUserId, count, sample }` kanal
  odasına (`getVoiceParticipantRoomName`) ve yetkili izleyici odasına (sidebar için).
- Temizlik: paylaşım `isScreenSharing:false` olunca set `DEL` + `count:0` fanout; kullanıcı
  ayrılınca/soket düşünce `SREM` (ayrılma yolu `service.ts`; `disconnect` handler'ı mevcut
  `voiceRooms` seti üzerinden).
- Analytics'e **girmez** (sayı yeterli; süre izleyen tarafında ölçülmez).

### 2. İstemci kancası — `use-screen-share-watch.ts`

- Girdi: `{ channelId, serverId, sharerUserId, visible }`. `visible` = sahne/fullscreen/pop-out'ta
  o paylaşım görünüyor (Ş2 `IntersectionObserver` + `document.visibilityState` ile besler; kanca
  yalnız protokolü bilir).
- `visible` değişince `watch { watching }`; `true` iken 60 s'de bir yeniler; unmount'ta `false`.
- `watchers:update` dinler → `setScreenShareViewerCount(sharerUserId, count)`; paylaşım bitince
  `0`.
- Kendi paylaşımını izleyen sayılmaz (sunucu `sharerUserId === userId` ise reddeder).

### 3. Sidebar — `channel-item.tsx:329-349`

LIVE çipi yanına küçük sayı (`voice-sidebar-screen-share-count-<username>`); Go Live'da çip
metni `voice.sidebar.streamingGame` (`stream.gameId` → `GAME_CATALOG` adı; yoksa `stream.label`; ikisi de yoksa mevcut
`liveChip`). Tooltip `voice.sidebar.screenSharing` korunur.

### 4. Overlay / voice-mini snapshot

`VoiceMiniSnapshotSchema`'ya `isScreenSharing: boolean` (yoksa) ve `screenShareViewerCount:
number` (yalnız **sayı**, T17). Yayıncı `voice-mini-snapshots.ts`; overlay/voice-mini bileşeni
"Yayında · N" çipi. Rust snapshot geçirici JSON'u opak taşıyor — Rust değişikliği gerekirse
raporla, bu şerit `lib.rs`'e yazmaz.

### 5. Mobil önbellek paritesi

`realtime-query-bridge.ts:557-570` deseniyle `watchers:update` → voice-states önbelleğine
`screenShareViewerCount`; `mobile-realtime-contract.ts` olay listesi; sözleşme testi. UI Ş7.

## Test

- Handler: rate limit; katılımcı değilken ret; paylaşmayan hedef için ret; idempotent `SADD`
  → fanout yok; `count`/`sample` doğru (≤5); paylaşım bitince `DEL` + `0`; disconnect `SREM`;
  kendini izleme reddi.
- Kanca: görünürlük geçişleri → doğru olaylar; 60 s yenileme (fake timers); unmount `false`;
  update → store.
- Sidebar RTL: sayı + Go Live çipi üç hâli.
- `voice-mini.test.ts`: yeni alanlar, eski snapshot parse olur (geriye uyum).
- Mobil: bridge patch testi, contract testi.

## Kapı

```bash
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/types test && pnpm --filter @wizards/mobile test
```

Rapor: `raporlar/04-rapor.md` — Redis anahtar/TTL şeması (Ş4 hosting belgesine girer), overlay
için Rust değişikliği gerekti mi.
