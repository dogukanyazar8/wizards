# Dalga 2 · Ş6 — Mobil iOS: `unsupported` kapısı (A) → Broadcast Upload Extension (B)

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 0 kapısı geçti. A ve B aynı oturumda, **A önce** ve tek başına yeşil.

---

Whispr monorepo, `uat` dalı. Görev: iOS'ta ekran paylaşımı bugün **sessizce boş yayın** yapıyor
(gerçek #21): buton çalışıyor, status `on`, herkes "X paylaşıyor" görüyor, kare gelmiyor. Önce
bunu dürüstçe kapat (A), sonra gerçek desteği kur (B).

Önce oku: `00-ortak-baglam.md` §4 #19–#25, §5 K12, K13, §6 T6–T9; `@livekit/react-native-webrtc`
`ios/RCTWebRTC/ScreenCaptureController.m`, `ScreenCapturePickerViewManager.m`, `ScreenCapturer.m`
(**kaynak**, README değil); `@livekit/react-native` README'nin iOS screen share bölümü.
Kod için `graphify query "mobile screen share toggle setScreenShareEnabled platform ios"`.

## Sahiplenilen dosyalar

- `apps/mobile/src/voice/use-mobile-voice-room.ts` — **yalnız** `toggleScreenShare` platform kapısı ve
  başlangıç `screenShareStatus`
- `apps/mobile/src/voice/mobile-screen-share-contract.ts` + `apps/mobile/scripts/mobile-screen-share-contract.test.ts`
- `apps/mobile/src/voice/mobile-screen-share-platform.ts` (yeni) + test
- `apps/mobile/src/permissions/mobile-native-capability-contract.ts` (+ test)
- `apps/mobile/src/app/screens/voice-screen.tsx`, `mobile-direct-call-screen.tsx`,
  `mobile-voice-room-panel.tsx` — **yalnız** paylaş butonunun `unsupported` hâli
- `apps/mobile/plugins/withIosBroadcastExtension.js` (yeni) + `apps/mobile/scripts/with-ios-broadcast-extension.test.ts`
- `apps/mobile/ios-extension/WhisprBroadcast/` (yeni: `SampleHandler.swift`, `Info.plist`,
  `WhisprBroadcast.entitlements`)
- `apps/mobile/app.config.js` (plugin kaydı, `ios.entitlements`, `infoPlist` anahtarları),
  `apps/mobile/eas.json` (extension credential notu), `apps/mobile/scripts/mobile-app-config-contract.test.ts`
- `apps/mobile/src/locale/mobile-copy.ts` — yalnız Ş0.1'in açtığı `voiceScreenShareUnsupportedIos`

**Yazma:** Android yolu, AppState politikası (Ş7), `mobile-screen-share.ts` presetleri (K12),
`voice-screen.styles.ts` geometrisi (T8).

## A — Kapı (zorunlu, küçük, önce)

1. `mobile-screen-share-platform.ts` (saf): `resolveMobileScreenShareSupport({ platform,
hasBroadcastExtension })` → `"supported" | "unsupported-ios-no-extension"`.
   `hasBroadcastExtension` = `Constants.expoConfig.ios.infoPlist.RTCAppGroupIdentifier` varlığı
   (B bunu açar); testte enjekte.
2. `use-mobile-voice-room.ts`: bağlantıda `screenShareStatus` `"unsupported"` (ilk kez atanıyor —
   gerçek #21); `toggleScreenShare` bu durumda **hiç** `setScreenShareEnabled` çağırmaz, heartbeat
   yazmaz, `errorMessage` yerine sessiz (buton zaten pasif).
3. Buton: üç ekranda `disabled` + `accessibilityHint = voiceScreenShareUnsupportedIos`; testID
   korunur (Maestro sözleşmesi).
4. `mobile-native-capability-contract.ts`: `screenShare` yeteneği platform başına (`android:
foundation-ready`, `ios: unsupported-until-extension`); sözleşme testi güncellenir.
5. Sözleşme testi: iOS'ta `unsupported` iken `setScreenShareEnabled` çağrılmaz (sahte room).

## B — Broadcast Upload Extension

1. **Plugin `withIosBroadcastExtension.js`** (`expo/config-plugins` `withXcodeProject` +
   `withEntitlementsPlist` + `withInfoPlist`): hedef `WhisprBroadcast` (Broadcast Upload
   Extension, bundle `<iosBundleIdentifier>.broadcast`), kaynaklar `ios-extension/WhisprBroadcast/`,
   iki hedefte app group `group.<iosBundleIdentifier>`, ana `Info.plist`'e
   `RTCAppGroupIdentifier = group.<id>` ve `RTCScreenSharingSocketFD = rtc_SSFD`, extension
   `Info.plist` `NSExtensionPointIdentifier = com.apple.broadcast-services-upload`,
   `RPBroadcastProcessMode = RPBroadcastProcessModeSampleBuffer`. Deployment target ana uygulamayla
   aynı. Plugin idempotent (iki kez koşunca tek hedef).
2. **`SampleHandler.swift`**: `@livekit/react-native-webrtc`'nin beklediği Unix socket protokolü
   (`SocketConnection`/`SampleUploader` eşleniği; kütüphanenin `ScreenCapturer.m` içindeki
   okuyucuyla **bire bir** — kaynağı oku, uydurma). Yalnız video; ses yok (K: mobil sistem sesi
   kapsam dışı). Bellek sınırı 50 MB — kare ölçekleme extension'da (1080p tavan, K12).
3. **Başlatma akışı**: iOS'ta `toggleScreenShare` önce `ScreenCapturePickerView`'i (kütüphane
   bileşeni, `preferredExtension` = extension bundle id) programatik tıklar → sistem "Yayını
   Başlat" → kullanıcı onaylar → `getDisplayMedia()` (kütüphane socket'e bağlanır) →
   `setScreenShareEnabled`. Consent guard (`beginCaptureConsentGuard`) picker sırasında açık.
4. **Durdurma**: kullanıcı Kontrol Merkezi'nden durdurursa `ScreenCapturer` `capturerDidEnd` →
   track `ended` → Ş7'nin `TrackEvent.Ended` dinleyicisi (Ş7 Android için yazıyor; iOS aynı yolu
   kullanır — Ş7 bitmediyse geçici olarak burada dinle, raporla).
5. **Arka plan**: iOS yayını uygulama arka plandayken sürer; `mobile-voice-background-media.ts`
   politikası iOS'ta paylaşım aktifken `inactive/background` için paylaşımı **durdurmaz** (Ş7
   Android kararıyla aynı saf fonksiyona platform parametresi; Ş7 ile aynı dosyaya yazmamak için
   bu şerit yalnız **istek** yazar: "iOS share-active istisnası", Ş7 uygular).
6. **EAS**: extension için ayrı provisioning profile / app group capability; `eas.json` notu;
   build `uat` profilinde. TestFlight cihaz doğrulaması olmadan `hasBroadcastExtension` üretimde
   `false` kalır (K13).

## Test

- Saf: platform çözümü matrisi; A kapısı `setScreenShareEnabled` çağırmaz.
- `with-ios-broadcast-extension.test.ts`: plugin sahte config üzerinde hedef/entitlement/plist
  anahtarlarını üretir; idempotent.
- `mobile-app-config-contract.test.ts`: plugin kayıtlı; `RTCAppGroupIdentifier` ve app group
  eşleşiyor; extension bundle id ana id + `.broadcast`.
- Jest bileşen: iOS `unsupported` buton pasif + hint; Android etkilenmez.
- Cihaz (manuel, TestFlight): paylaş → picker → yayın → web'de kare; Kontrol Merkezi'nden durdur →
  status `off`; arka plana al → sürer. Sonuç rapora, ekran görüntüsüyle.

## Kapı

```bash
pnpm --filter @wizards/mobile typecheck && pnpm --filter @wizards/mobile test && pnpm --filter @wizards/mobile test:components
```

Rapor: `raporlar/07-rapor.md` — A'nın kapattığı davranış, B'nin cihazda doğrulanma durumu
(doğrulanmadıysa `hasBroadcastExtension` nasıl kapalı tutuluyor), Ş7'ye istekler.
