# Whispr Mobile Faz 5 Voice/Video ve Store Cilası Tasarımı

## Amaç

Faz 5, mevcut mobil LiveKit ses altyapısını kamera görüntüsü, kamera yönü, giriş/çıkış cihazı seçimi ve kalıcı gürültü ayarıyla tamamlar; ardından haptic, offline farkındalığı, privacy shield, geçiş/yükleme cilası ve store kapanışını teslim eder. Faz 0-4 sözleşmeleri, auth/lockout sınırı, dar cache anahtarları ve mevcut mobile API davranışı değişmez.

## Doğrulanmış başlangıç durumu

- `use-mobile-voice-room.ts` zaten `setCameraEnabled()` ile yerel kamerayı publish ediyor ve heartbeat'e `selfVideo` yazıyor. Eksik kısım kamera track referanslarının UI'a taşınması, yerel/uzak video render, ön/arka çevirme ve background stop'tur.
- `AudioSession.selectAudioOutput()` ile `default` ve `speaker` seçimi zaten vardır. Eksik kısım `AudioSession.getAudioOutputs()`, `Room.getLocalDevices("audioinput")`, `Room.switchActiveDevice()` tabanlı cihaz listesi, BottomSheet ve kalıcılıktır.
- Mikrofon capture seçenekleri noise suppression'ı sürekli açık kabul eder. Faz 5 bunu kalıcı bir kullanıcı tercihine dönüştürür.
- Kit'te `Button`, `ContextMenu`, `Skeleton`, `EmptyState` ve `Toast` vardır; `ToastProvider` uygulama ağacında henüz mount edilmemiştir.
- TanStack Query focus entegrasyonu vardır; `onlineManager` entegrasyonu yoktur.
- App lock foreground dönüşünde çalışır; app switcher snapshot'ını anında örten bağımsız privacy shield yoktur.

## Yaklaşım seçenekleri

### A — Tek native build ile tam cihaz farkındalığı (seçilen)

M1'de `expo-haptics` ve `@react-native-community/netinfo` birlikte eklenir ve tek development APK build alınır. Kamera ve cihaz yönetimi mevcut LiveKit/WebRTC modüllerinde kalır. Bu yaklaşım gerçek internet erişilebilirliği ve erişilebilir haptic davranışı sağlar; maliyeti yalnız bir native build'dir.

### B — Haptic native, socket tabanlı offline

Yalnız `expo-haptics` eklenir; offline banner socket bağlantı durumundan türetilir. Daha az bağımlılık getirir fakat socket reconnect ile gerçek internet erişilebilirliğini ayıramaz ve HTTP mutasyonlarını güvenilir biçimde fail-fast yapamaz.

### C — Yeni native bağımlılık yok

Haptic ertelenir ve yalnız socket durumu kullanılır. Tek build gerektirmez fakat kullanıcının haptic kararını ve store-ready offline davranışını karşılamaz.

Seçim A'dır. Başka native modül eklenmez ve M1 build'inden sonra prebuild/run:android yapılmaz.

## Mimari

### Voice/video çekirdeği

`useMobileVoiceRoom` tek Room sahibi olarak kalır. Yeni saf sözleşmeler kamera yönünü, cihaz özetlerini ve gürültü tercihini normalize eder. Provider, AsyncStorage'dan yalnız bounded tercihleri yükler; cihaz etiketleri veya enumeration sonuçları loglanmaz ve query key'e girmez.

Kamera publication'ı `MobileVoiceTrackReference` olarak participant modeline eklenir. `MobileVoiceCameraGrid` yalnız mevcut, subscribed track'leri `VideoTrack` ile render eder. Kamera açma kullanıcı aksiyonundan önce mevcut media permission provider üzerinden izin ister. Flip işlemi yalnız aktif local camera track üzerinde `restartTrack({ facingMode })` çağırır. AppState active dışına çıktığında kamera ve screen share durur; heartbeat video/screen-share false gönderir.

`MobileVoiceSettingsSheet`, mikrofon girişlerini `Room.getLocalDevices("audioinput")`, ses çıkışlarını `AudioSession.getAudioOutputs()` ile yükler. Seçim Room/AudioSession üzerinde uygulanır; yalnız seçilen bounded ID ve noise boolean AsyncStorage'a yazılır. Geçersiz veya artık bulunmayan cihaz tercihi default'a düşer.

### Haptic ve offline

`MobileHapticsProvider`, kullanıcı tercihi ve `AccessibilityInfo.isReduceMotionEnabled()` sonucunu birleştirir. Haptic çağrıları best-effort'tur; native hata kullanıcı aksiyonunu engellemez ve hata detayı loglanmaz. Button tap selection, destructive/confirmation notification, context-menu long press impact üretir. Kullanıcı ayarlardan haptic'i kapatabilir.

`MobileNetworkProvider`, NetInfo'dan yalnız `online | offline | unknown` durumunu üretir ve TanStack `onlineManager`'ı günceller. SSID, IP, BSSID, device detail veya bağlantı etiketi tutulmaz. Uygulama root'unda offline banner gösterilir. `MobileApiClient`, online durumu kesin offline iken GET dışı isteği fetch'e göndermeden bounded `MobileOfflineError` ile reddeder; aynı olay Toast provider'a iletilir. Mutasyon kuyruğu, replay veya disk persist eklenmez.

### UI cilası ve privacy

Native stack geçişleri reduced-motion kapalıyken platform slide animasyonu, açıkken `none` kullanır. Mevcut mesaj skeleton'ları korunur; workspace/member/notification ilk yüklemeleri kit Skeleton, gerçek boş sonuçları EmptyState kullanır.

`MobilePrivacyShield`, AppState `inactive|background` olduğunda uygulama içeriğinin üstüne opak, erişilebilir bir yüzey koyar. Shield auth tokenına dokunmaz ve app lock yerine geçmez; foreground'da app lock varsa lock ekranı shield kalktıktan sonra görünür.

### Performans ve gözlemlenebilirlik

FlashList sıcak yüzeyleri mevcut memoized render sözleşmesini korur. Faz 5 testleri yeni video/device UI'ın bounded render ettiğini, liste callback'lerinin stable olduğunu ve raw device verisinin log/evidence'e girmediğini doğrular. Sentry React Native app-start instrumentation korunur; release dokümanı mevcut `<=2500ms` startup ve `<=700ms` warm resume bütçelerini ve cihaz koşusu sonucunu raporlar.

## Hata ve güvenlik davranışı

- Kamera/mikrofon izin reddi bounded, yerelleştirilmiş UI durumuna döner; native hata, token, device label veya LiveKit URL loglanmaz.
- Kamera flip veya cihaz switch başarısız olursa önceki seçim korunur ve voice room redacted hata gösterir.
- Background kamera/screen-share kapatma best-effort çalışır; heartbeat false yine gönderilir.
- NetInfo `null` değerleri `unknown` sayılır; bilinmeyen durum online kabul edilerek kullanıcı haksız yere engellenmez.
- Offline mutasyonlar fetch'e ulaşmaz, sıraya alınmaz ve bounded Toast gösterir.
- Privacy shield bütün signed-in içeriği örter; DM metni app switcher görüntüsüne bırakılmaz.
- Kamera açıkken veya hassas içerik görünürken Maestro screenshot alınmaz.

## Kapsam dışı

- Offline mutation queue/persist/replay.
- Rol CRUD, izin matrisi ve rol hiyerarşisi.
- Kanal/kategori reorder UI.
- Grup video grid optimizasyonu, active-speaker pagination ve PiP.
- Yeni server endpoint'i veya DB migration.
- Haptic dışında oyun/medya titreşim desenleri.

## Test ve teslim

Her davranış red-green TDD ile geliştirilir. M1, M2 ve M3 sonunda typecheck, tüm contract testleri, tüm component testleri, quality ve audit çalışır. M1 sonunda tek development APK build alınır; M2/M3 JS-only kalır. Faz sonunda `.maestro/phase5-voice-polish.yml` bir UAT koşusunda voice join, mic/camera, camera kapatma, cihaz sheet, noise toggle, offline banner ve leave davranışını doğrular; light/dark screenshot'lar kamera kapalı ve hassas içerik yokken `artifacts/mobile/phase5/` altına yazılır.

Üç commit sınırı:

1. `feat(mobile): add camera publishing and audio device controls`
2. `feat(mobile): add haptics, transitions and offline awareness`
3. `feat(mobile): complete phase 5 voice and polish`
