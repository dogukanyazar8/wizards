# Dalga 2 · Ş7 — Mobil Android paylaşım + mobil izleyici

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 1 Ş3 (watchers önbelleği) geçti; Ş6 ile paralel (ayrık dosyalar; Ş6'nın
> "istek" satırlarını raporundan oku ve uygula).

---

Whispr monorepo, `uat` dalı. Görev: Android'de paylaşım Discord gibi **arka planda sürsün**, OS
durdurmasını duysun, ölü consent/banner bileşenleri bağlansın; mobil izleyici pinch/pan +
landscape + doğru katman alsın; "N izliyor" çizsin. Yayın tavanı 1080p30 **değişmez** (K12).

Önce oku: `00-ortak-baglam.md` §4 #19–#25, #28–#31, §5 K12, K14–K16, §6 T5–T9;
`raporlar/04-rapor.md`, `raporlar/07-rapor.md` (Ş6 istekleri).
Kod için `graphify query "mobile voice room screen share appstate background media stage fullscreen"`.

## Sahiplenilen dosyalar

- `apps/mobile/src/voice/use-mobile-voice-room.ts` — AppState bölümü (`:2046-2061`), track
  `Ended` dinleyicisi, watch emit; **Ş6'nın platform kapısı satırlarına dokunma**
- `apps/mobile/src/voice/mobile-voice-background-media.ts` + test (share-active istisnası, platform)
- `apps/mobile/src/voice/mobile-screen-share-contract.ts` + test (yeni copy sözleşmeleri)
- `apps/mobile/src/voice/mobile-video-layout.ts` + test (21:9), `mobile-video-subscription.ts` + test (≤1080p katman)
- `apps/mobile/src/voice/mobile-screen-viewport.ts` (yeni, saf gesture reducer) + test
- `apps/mobile/src/app/screens/voice-screen.tsx` (fullscreen viewer, consent sheet + banner
  montajı, izleyen çipi, `permission-denied` copy), `mobile-direct-call-screen.tsx` (paylaşım-sesi
  toggle paritesi), `apps/mobile/src/voice/mobile-voice-settings-sheet.tsx`
- `apps/mobile/plugins/withScreenShare.js` (+ `mobile-app-config-contract.test.ts`) — `microphone` FGS tipi (K14)
- `apps/mobile/src/locale/mobile-copy.ts` — Ş0.1 anahtarlarının metni gerekirse düzeltme
- `apps/mobile/component-tests/voice-screen-components.test.tsx`
- `.maestro/phase6-screen-share.yml` (Ş0.3 akışını genişlet)

**Yazma:** `mobile-screen-share.ts` presetleri, `voice-screen.styles.ts` geometri kilitleri (yeni
stil girdisi token'la eklenebilir), Ş6 dosyaları, web.

## Ne yapılacak

### 1. Arka plan politikası (K14)

- `shouldSuspendVoiceMediaOnAppStateChange` → `{ suspendCamera, suspendScreenShare }` döner:
  paylaşım aktifken gerçek `background` → `suspendCamera: true`, `suspendScreenShare: false`
  (Android **ve** iOS — Ş6 isteği). Consent guard davranışı aynen. `MOBILE_SCREEN_SHARE_BACKGROUND_STOP_MESSAGE`
  artık yalnız politika `suspendScreenShare:true` döndüğünde (yalnız kullanıcı kararı geri
  alınırsa) kullanılır; sözleşme testi metni korur.
- Paylaşım başlamadan önce tek seferlik bilgilendirme (`voiceScreenShareBackgroundContinues`):
  consent sheet'in açıklamasına satır (aşağıda 3).
- `withScreenShare.js`: `FOREGROUND_SERVICE_MICROPHONE` izni; `MediaProjectionService`
  `foregroundServiceType="mediaProjection|microphone"` — kütüphane servisi arka planda mikrofonu
  bu tipte tutar (Android 14+). Play Console FGS beyanı rapora (kullanıcı kararı 2026-09-17: evet). Mikrofon FGS'i
  yalnız paylaşım servisiyle geliyorsa ses-yalnız arka plan çağrısı **bu şeridin kapsamı dışında**
  (bugünkü davranış neyse kalır; raporla).

### 2. OS durdurma (K15)

`room.localParticipant` `LocalTrackPublished` sonrası `publication.track.on(TrackEvent.Ended)` →
`screenShareStatus: "off"`, `selfScreenShareEnabled:false`, heartbeat `false`, toast
`voiceScreenShareStoppedBySystem`. Bildirimden/OS'tan durdurma ve pencere kapanma aynı yolu
kullanır. Polling yedek kalır.

### 3. Consent sheet + banner + hata ayrımı

- `ScreenShareConsentSheet` gerçekten mount edilir: paylaş → sheet (gizlilik + "ses paylaşılmaz"
  ve arka plan cümlesi) → onay → sistem diyaloğu. Discord'daki sistem diyaloğu zaten var; sheet
  gizlilik bilgilendirmesidir; "bir daha gösterme" tercihi `MobileVoiceDevicePreferences`'a
  (yeni AsyncStorage anahtarı, mevcut `screenShareQualityId` deseni).
- `ScreenShareActiveBanner` sahne üstünde: "Ekran paylaşımı açık · N izliyor · Durdur".
- `permission-denied` → `voiceScreenSharePermissionDenied` metni; `error` → mevcut redakte mesaj.
- DM ekranı `mobile-voice-settings-sheet`'e paylaşım-sesi toggle'ını **geçer** (parite).

### 4. İzleyici

- `mobile-screen-viewport.ts`: web `video-viewport.ts` ile aynı reducer sözleşmesi (fit, zoom
  1..4, pan clamp, double-tap 1↔2). Fullscreen overlay `react-native-gesture-handler` Pinch, Pan
  ve Tap (bağımlılık mevcut) + Reanimated transform; `ScrollView` zoom kaldırılır. Hint
  `voiceScreenShareZoomHint` ilk açılışta.
- Landscape: overlay açılınca `expo-screen-orientation` `unlockAsync()` / kapanınca
  `lockAsync(PORTRAIT_UP)`; `app.config.js` `orientation: "portrait"` **değişmez**. Paket yoksa
  ekle (raporla). Emülatör/cihaz testi.
- Aspect clamp üst sınır 16:9 → **21:9** yalnız `kind === "screen"` tile'ları için
  (`mobile-video-layout.ts`; kamera kuralı değişmez).
- Katman (K12): `mobile-video-subscription.ts` `resolveMobileScreenShareLayer({ dimensions,
isFullscreen })` → `dimensions.height > 1080 ? MEDIUM : (isFullscreen ? HIGH : MEDIUM)`; 4K
  SVC'de MEDIUM = 1080p. `publication.dimensions` yoksa mevcut kural.
- İzleyen çipi: watchers önbelleği (Ş3 bridge) → fullscreen başlığında `voiceScreenShareViewers`;
  izleme emit'i: fullscreen/sahne görünürken `voice:screenshare:watch` (mevcut socket istemcisi,
  60 s yenileme; `AppState` background'da `false`).
- Fullscreen başlığı Go Live'da `voiceScreenShareStreamingTitle` ("{name} {game} yayınlıyor"):
  `stream.gameId` katalogtaysa katalog adı, `custom:` ise `stream.label`; yoksa mevcut başlık.

### 5. Maestro

`phase6-screen-share.yml`: paylaş → consent sheet onay (`mobile-voice-screen-share-consent-confirm`)
→ sistem diyaloğu → banner görünür → uygulamayı arka plana al (`pressKey: HOME`) → geri gel →
banner hâlâ görünür (K14) → durdur → banner yok. testid sözleşme testine ekle.

## Test

- `mobile-voice-background-media.test.ts`: share-active matrisi (Android/iOS × background/inactive
  × consent); politika kapalıyken eski davranış.
- Ended: sahte publication `Ended` → state + heartbeat + toast.
- Viewport reducer: web testinin aynısı (paylaşılan fixture değil, kopya — mobil bağımsız).
- Layout: 21:9 yalnız screen; subscription: 4K → MEDIUM.
- Jest: consent sheet akışı, "bir daha gösterme", banner + çip, permission-denied copy, DM toggle
  paritesi, fullscreen gesture handler'ları mount (jest mock ile `props` doğrulama — T6 deseni).
- `mobile-app-config-contract.test.ts`: `microphone` FGS tipi + izin.
- `timerBudgetCount === 2` yeşil; design-contract kilitleri yeşil.

## Kapı

```bash
pnpm --filter @wizards/mobile typecheck && pnpm --filter @wizards/mobile test && pnpm --filter @wizards/mobile test:components
```

Rapor: `raporlar/08-rapor.md` — cihazda arka plan davranışı (Android 13 / 14+ ayrı), landscape
paketi eklendi mi, Play FGS beyanı metni, Ş6 isteklerinin durumu.
