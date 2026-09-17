# Dalga 2 · Ş5 — Go Live (masaüstü): oyun algılama → "Yayına geç: {oyun}"

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 1 kapısı geçti — Ş1 (mod + capture fabrikası), Ş2 (sahne başlığı + bar),
> Ş3 (presence `stream` alanı yolu + izleyen sayısı).

---

Whispr monorepo, `uat` dalı. Görev: Discord "Go Live" eşleniği. Masaüstünde oyun algılanınca
paylaş butonu "Yayına geç: Valorant" olur; tıklayınca `motion` modunda, pencere ipucuyla, odak
oyuna geri verilerek paylaşım başlar; presence "Yayında: Valorant" yayar; oyun kapanınca yayın
durur. Algılama altyapısı **var** (gerçek #12); bu şerit onu paylaşımla evlendirir ve kataloğu
büyütür.

Önce oku: `00-ortak-baglam.md` §4 #3, #7, #12, #13, §5 K1, K3, K8–K10, §6 T4, T15, T16;
`apps/desktop/GAME_OVERLAY.md` (gizlilik sözleşmesi); `raporlar/02-rapor.md` (capture
fabrikası imzası), `raporlar/04-rapor.md`.
Kod için `graphify query "game activity detect catalog desktop foreground process screen share"`.

## Sahiplenilen dosyalar

- `packages/types/src/game-catalog.json`, `packages/types/src/game-activity.ts` + `.test.ts`
- `apps/desktop/src-tauri/src/game_activity.rs` (+ mevcut testler), `apps/desktop/src-tauri/src/lib.rs`
  — yeni komutlar `get_desktop_go_live_candidate`, `list_desktop_running_applications`,
  `registered_games` ayarı (K22) ve kayıt satırları
- `apps/web/src/lib/desktop/controls.ts` (komut sarmalayıcı), `apps/web/src/lib/desktop/game-overlay-process.ts`
  (whitelist kataloğa bağlanır) + testleri
- `apps/web/src/lib/voice/go-live.ts` (yeni) + `.test.ts`
- `apps/web/src/hooks/use-go-live-candidate.ts` (yeni) + `.test.ts`
- `apps/web/src/components/providers/live-voice-provider.tsx` — **yalnız** `requestScreenShare`
  içinde `goLive` dalı + oyun kapanınca durdurma efekti
- `apps/web/src/components/voice/server/server-voice-surface.tsx` (`:1173-1182` buton etiketi),
  `voice-room-primitives.tsx` (DM butonu), `voice-channel-view.tsx`, `dm-call-view.tsx` — yalnız CTA
- `apps/web/src/lib/socket/handlers/voice.ts` — `stream` alanının `GameSharingSettings` ile
  sunucu tarafında kırpılması (K8) + `.test.ts`
- `apps/web/src/components/providers/e2e-voice-provider.tsx` (sahte `goLive` desteği) ve
  `apps/web/e2e/specs/voice/voice.spec.ts`
- `apps/web/src/components/settings/sections/desktop/native-settings-rows.tsx` (opt-in satırı
  açıklamasına Go Live cümlesi, "Kayıtlı oyunlar" satırı)
- `apps/desktop/GAME_OVERLAY.md` (gizlilik satırı, K22)
- `apps/web/src/lib/game-activity/service.ts` + `.test.ts`, `apps/web/src/app/api/v1/users/me/game-activity/route.ts`
  (+ mobil ve `[userId]` okuma uçlarının şeması), `apps/web/src/components/shared/user-game-activity.tsx`,
  `apps/web/src/lib/desktop/settings-client.ts`, `apps/web/src/components/desktop/desktop-game-activity.tsx`

**Yazma:** `screen-share.ts` (Ş1 bitti; gerekiyorsa istek), `game_overlay_lifecycle.rs`, overlay
bileşenleri (Ş3 çipi yeter), mobil.

## Ne yapılacak

### 1. Katalog genişletme (T15)

- `game-catalog.json`'a ≈90 başlık: Steam/Epic/Riot/Blizzard/EA/Ubisoft en popüler 60 + Türkiye
  pazarı (Zula, Metin2, Knight Online, Point Blank, Wolfteam, Rust, CS:GO legacy, Roblox, Among
  Us, Rocket League, Overwatch 2, Diablo IV, WoW, Hearthstone, EA FC, Elden Ring, GTA Online,
  Warzone/MW, R6 Siege, Palworld, Genshin, Honkai, Marvel Rivals, Deadlock, The Finals, Helldivers
  2, Baldur's Gate 3, Stardew, Terraria, Phasmophobia, Lethal Company, Dead by Daylight, Escape
  from Tarkov, War Thunder, World of Tanks, Teamfight Tactics, Osu!). Yalnız **oyun exe'leri**;
  launcher'lar (`steam.exe`, `riotclientservices.exe`, `epicgameslauncher.exe`, `battle.net.exe`,
  `eadesktop.exe`, `upc.exe`) **girmez** — Rust testi `recognizes_catalog_on_all_platforms_without_launchers`
  bunu zorlar. Liste **onay beklemez** (K23); rapora tablo olarak yine yazılır.
- `GameIdSchema` JSON'dan türetilir: `z.enum(catalog.map(g => g.id) as [string, ...string[]])`;
  `GameId` literal daralması kaybolur — tüketiciler (`user-game-activity.tsx`,
  `desktop-game-activity.tsx`, `game-activity/service.ts`) derlenmeli. JSON tek kaynak (Rust
  `include_str!`).
- `DESKTOP_GAME_OVERLAY_EXECUTABLE_NAMES` kataloğun exe'lerinden türetilir (ayrı liste silinir);
  `MAX_DESKTOP_GAME_OVERLAY_GAME_SETTINGS = 64` sınırı korunur (ayar haritası, whitelist değil).

### 2. Aday çözümü — `go-live.ts` (saf)

`resolveGoLiveCandidate({ isDesktop, gameDetectionEnabled, detectedGameId, foregroundExecutable,
isScreenSharing })` → `{ kind: "game", gameId, label } | { kind: "opt-in-required" } | null`:

- Masaüstü değilse `null`.
- Opt-in kapalıysa `opt-in-required` (CTA normal "Paylaş", altında `goLive.cta.disabledOptIn`
  ipucu bir kez; ayara link — T16).
- `detectedGameId` var **ve** `foregroundExecutable` o oyunun exe'lerinden biri **veya**
  `foregroundExecutable` null (odak Whispr'da) → aday. Foreground başka bir oyunun exe'siyse o
  oyun kazanır (kullanıcı ona bakıyor). Kayıtlı oyunlar katalogla aynı kurala girer.
- Label `GAME_CATALOG` adı; kayıtlı oyunda kullanıcının etiketi (`gameId: "custom:<id>"`, K22).

### 3. Tauri komutu — `get_desktop_go_live_candidate`

`get_desktop_detected_game` + `desktop_foreground_process_name` tek komutta: `{ enabled, gameId,
foregroundIsGame: bool }`. Exe adı **web'e dönmez** (sözleşme: yalnız `gameId` + bool). 15 s
önbellek aynen. `assert_desktop_main_command_window`.

### 4. Kanca — `use-go-live-candidate.ts`

Voice'a bağlıyken 15 s'de bir komut (mevcut `desktop-game-activity.tsx` ritmiyle aynı; iki poll
birleştirilebiliyorsa birleştir, raporla) → `setGoLive(candidate)`. Paylaşım aktifken ve
`screenShareStreamInfo.kind === "game"` iken **iki ardışık** `gameId: null` → `stopScreenShare` +
toast `goLive.gameClosed` (K10). `displaySurface === "monitor"` seçilmişse kural pasif.

### 5. Başlatma dalı (K9)

`requestScreenShare({ goLive: true })`:

- Mod `motion` zorlanır (kullanıcı tercihi ezilmez; oturum boyunca `motion`, bitince tercih
  geri), fps tercih (varsayılan 60), çözünürlük tercih (4K kapısı Ş1 kuralı).
- Capture fabrikası: `navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "window",
width/height/frameRate ideal }, audio: shareSystemAudio ? {...} : false, preferCurrentTab:
false, selfBrowserSurface: "exclude", surfaceSwitching: "include", systemAudio: "include",
controller })` — `controller = new CaptureController()` varsa ve
  `controller.setFocusBehavior("focus-captured-surface")` (Chromium 109+; yoksa atla). Dönen
  `MediaStream` track'leri `LocalVideoTrack`/`LocalAudioTrack`'e sarılır (`livekit-client`
  `createLocalTracks` değil; `new LocalVideoTrack(mediaStreamTrack, undefined, false)` +
  `source: ScreenShare`) ve `ScreenShareSession.start`'a fabrika olarak verilir; `contentHint`
  `motion`.
- Capture sonrası `getSettings().displaySurface` okunur → `screenShareStreamInfo = { kind:
"window"|"monitor"→"screen"|"browser"→"screen", gameId }`; `kind: "game"` yalnız `window` +
  aday varsa. Presence `voice:screenshare:update` payload'ına `stream` eklenir (Ş0.1 şeması).
- Seçici ipucu copy'si (`goLive.pickerHint`) seçici açılmadan önce 2 s'lik toast: "Seçicide oyun
  penceresini seç; tam ekran oyunlarda Ekran sekmesi".

### 6. Sunucu kırpması (K8)

`handlers/voice.ts` `voice:screenshare:update`: `stream.gameId` yalnız gönderenin
`GameSharingSettings.enabled` ise fanout'a girer; değilse `gameId: null` (`kind` kalır). Redis
durum anahtarı değeri `"1"` yerine JSON `{ stream }` olur mu? **Hayır** — anahtar `"1"` kalır,
`stream` yalnız fanout + voice-states DTO'ya (`isScreenSharing` yanına) yazılır; mobil DTO
`packages/types/src/mobile.ts` alanı Ş0.1 açtı.

### 7. CTA

`server-voice-surface.tsx:1173-1182`: `goLive` doluysa label `goLive.cta` (`{game}`), glyph
aynı, `pressed` paylaşımda; paylaşım `kind: "game"` iken label `bar.goLive`. DM butonu aynı kural.
`opt-in-required` hâlinde normal label + tek seferlik ipucu (localStorage `whispr:go-live:hint-seen`).

### 8. E2E sahte provider

`E2EVoiceProvider`: localStorage `whispr:e2e:detected-game=<gameId>` → `goLive` adayı;
`toggleScreenShare` `stream: { kind: "game", gameId }` yazar; iki bağlam testi: Bob'un sidebar'ında
`voice-sidebar-screen-share-alice` çipi "Yayında · Valorant".

### 9. Kayıtlı oyunlar — Discord "Oyununu göremiyor musun? Ekle" (K22)

- **Rust:** `list_desktop_running_applications` → `[{ executable, displayName }]` (basename +
  exe'den türetilmiş ad; yalnız pencere sahibi süreçler; Whispr, launcher'lar ve sistem süreçleri
  hariç). Yalnız ana pencere komutu, `game_detection_enabled` açıkken; sonuç **hiçbir yerde
  saklanmaz**. `registered_games` güvenli cihaz ayarlarında (mevcut guarded settings deseni):
  `{ executable, label, id: "custom:<sha256(executable)[:12]>" }`, en çok 64 kayıt.
  `game_activity::detect` katalogla birlikte kayıtlı listeyi de tarar; `identify` önce katalog,
  sonra kayıtlı. Rust testi: kayıtlı exe → `custom:` id; launcher yine reddedilir.
- **Tipler:** `game-activity.ts` `GameIdSchema` → `z.union([CatalogGameIdSchema,
z.string().regex(/^custom:[a-f0-9]{12}$/)])`; `GameActivityUpdateSchema` + `label:
z.string().min(1).max(64).nullable()` (yalnız `custom:` ile); `GameActivitySchema` + `label`.
  Sunucu (`service.ts`): kontrol karakteri/boşluk temizler, `custom:` değilse `label` atar, Redis
  HSET'e `label` ekler; okuma DTO'suna `label`.
- **UI:** `native-settings-rows.tsx` "Kayıtlı oyunlar" satırı: liste, "Ekle" → çalışan uygulamalar
  seçici (modal), ad düzenle (inline), kaldır. `user-game-activity.tsx` `custom:` için `label`
  gösterir. Go Live CTA/başlık/sidebar `label` kullanır (Ş2/Ş3 anahtarları hazır).
- **Gizlilik:** exe basename yalnız cihazda; ağa `custom:<hash>` + kullanıcı etiketi gider;
  `GAME_OVERLAY.md`'ye satır: "Kayıtlı oyunlar: exe adı yerel, etiket kullanıcı yazımı, telemetri
  yok". Overlay yine yalnız foreground exe okur (değişmez).
- **Sınır:** Discord gibi doğrulama/moderasyon yok; kötüye kullanım mevcut kullanıcı raporu yoluyla.

## Test

- `game-activity.test.ts`: enum JSON ile eşit; launcher yok; id benzersiz; exe küçük harf.
- Rust: mevcut testler yeşil; yeni test `identify` ile katalogtaki her exe → id; komut şekli.
- `go-live.test.ts`: aday matrisi (masaüstü değil / opt-in yok / algılama var + foreground
  Whispr / foreground başka oyun / paylaşım açıkken).
- Kanca: 15 s ritmi; iki ardışık null → durdur; `monitor` yüzeyinde durdurma yok.
- Provider dalı (birim, sahte `getDisplayMedia`): `displaySurface` ipucu, `CaptureController`
  varsa `setFocusBehavior`, `contentHint === "motion"`, `stream` payload'ı; iptal → sessiz.
- Handler: `GameSharingSettings.enabled=false` → `gameId:null` ve `label:null`.
- Kayıtlı oyunlar: Rust `list_desktop_running_applications` Whispr/launcher hariç tutar, kayıt
  64 sınırı, `custom:` id deterministik; `game-activity.test.ts` `custom:` regex + `label` kuralı;
  `service.test.ts` etiket temizleme, `custom:` dışı `label` atılır, `GameSharingSettings`
  kapalı → `label:null`; RTL: ayar satırı ekle/düzenle/kaldır; `go-live.test.ts` kayıtlı aday.
- `voice.spec.ts`: CTA etiketi, Bob'un çipi, oyun kapanınca (bayrağı sil) 30 s içinde durur
  (fake timer yok; e2e'de kanca aralığı `NEXT_PUBLIC_E2E_TEST_MODE`'da 2 s'ye kısalır).
- Real-media (Ş0.3 suite'i, `--auto-select-desktop-capture-source` ile `displaySurface` ipucu
  yok sayılır): yalnız "Go Live dalı gerçek `getDisplayMedia` ile başlar ve B kare alır".

## Kapı

```bash
pnpm --filter @wizards/types test && pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web test
```

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

```bash
pnpm --filter @wizards/web e2e:realtime
```

Rapor: `raporlar/06-rapor.md` — katalog tablosu (onay için), Windows'ta WebView2 seçicisinin
`displaySurface: "window"` ipucunu ve `CaptureController` odak geri vermeyi uygulayıp uygulamadığı
(elle, sürümle), exclusive fullscreen oyunda pencere yakalamanın siyah kare verip vermediği
(bilinen Chromium sınırı; sonuç copy'ye girer).
