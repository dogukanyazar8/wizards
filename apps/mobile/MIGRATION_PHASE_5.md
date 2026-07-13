# Whispr Mobile — Faz 5 migrasyon ve modernizasyon kapanışı

## Sonuç

Faz 5; ses/görüntü çekirdeğini, cila katmanını ve store-hazırlık kapanışını tamamlar. Web davranışı ve sunucu authz sınırları değişmedi; yeni mobil davranışlar mevcut mobile namespace, LiveKit ve Expo sözleşmelerini kullanır. Bu fazda veritabanı migrasyonu yoktur.

## M1 — Ses ve görüntü çekirdeği

- Kamera, kullanıcı eyleminden sonra mevcut kamera izin sözleşmesiyle açılır; LiveKit React Native üzerinden yerel track yayınlanır, ön/arka kamera çevrilir ve en fazla altı yerel/uzak kamera tile'ı gösterilir.
- Uygulama arka plana geçtiğinde kamera ve ekran paylaşımı durdurulur; false heartbeat sunucuya iletilir.
- Audio input ID'leri `Room.getLocalDevices("audioinput")`, output ID'leri `AudioSession.getAudioOutputs()` ile alınır. Yalnız bounded ID ve gürültü bastırma boolean tercihi AsyncStorage'a yazılır; cihaz etiketi, kullanıcı verisi ve track bilgisi persist edilmez.
- Gürültü bastırma tercihi mikrofon track'ine WebRTC capture constraint olarak yeniden uygulanır; web'e özgü Krisp istemcisi mobil pakete eklenmez.
- `expo-haptics` ve `@react-native-community/netinfo` aynı tek native build'e dahil edildi. Bu build'den sonra native build veya prebuild çalıştırılmadı.

## M2 — Cila ve offline farkındalığı

- Kit button/context-menu etkileşimleri best-effort haptic üretir. Kullanıcı tercihi kapatılabilir; reduced-motion açıkken haptic çalışmaz.
- Stack geçişleri reduced-motion durumunda kapanır. Workspace ve üye listeleri gerçek loading durumunda `Skeleton`, gerçek boş sonuçta `EmptyState` gösterir.
- NetInfo yalnız `online|offline|unknown` durumunu bellekte tutar ve TanStack `onlineManager` ile paylaşır. Kaçırılmış Android connectivity callback'i uygulama yeniden öne geldiğinde `NetInfo.refresh()` ile toparlanır; sürekli polling veya harici reachability URL'si yoktur. Offline banner yeniden bağlantıda kalkar.
- Offline non-GET API isteği token çözümlemeden ve fetch'ten önce `MobileOfflineError` ile durur; bounded toast gösterilir. Offline queue veya query persistence eklenmedi.

## M3 — Privacy, performans ve erişilebilirlik

- AppState `inactive`, `background`, `extension` veya `unknown` olduğunda auth/app-lock katmanından bağımsız, opak `MobilePrivacyShield` tüm uygulamayı kaplar. `active` durumunda kalkar; ilk AppState henüz `null` iken cold start'ı kilitlemez.
- FlashList 2.0.2'nin kurulu API'sinde `onBlankArea` bulunmadığından desteklenen `onLoad({ elapsedTimeInMs })` kullanıldı. Channel/DM mesajları, DM inbox ve workspace listelerinin süreleri yalnız bounded, PII'siz ve memory-only snapshot olarak tutulur. İkinci UI frame'i aynı depoda `startup` metriğini üretir.
- Hot message row memoization ve image memory-disk cache sözleşmeleri korunur; kamera grid'i memoized ve altı tile ile bounded'dır.
- Kamera, cihaz, gürültü, haptic, offline ve voice kontrollerinde accessibility role/label/state, kararlı testID, en az 44px dokunma ve kontrollü font scaling doğrulanır.
- `.maestro/phase5-voice-polish.yml` kamera açıkken kanıt almaz; cihaz değerlerini, tokenları, claim/invite/2FA sırlarını kanıta yazmaz. Kamera kapatıldıktan sonra light/dark kanıt üretir, LiveKit'ten kontrollü çıkar ve app-wide offline/recovery helper'ı airplane mode'u kapanıştan önce geri kapatır.

## Phase 0-5 kısa kapanış özeti

- Faz 0: native shell, güvenli oturum, typed navigation, in-memory Query ve realtime yaşam döngüsü.
- Faz 1: semantik design system, light/dark/system tema, kit, reduced-motion ve platform yüzeyleri.
- Faz 2: mesajlaşma, optimistic cache, arama, thread, reaction/edit/delete ve güvenli media temeli.
- Faz 3: friends/presence/profile, 2FA, GIF, link preview, DM details ve settings IA.
- Faz 4: server create/join/invite, tek-kullanımlık media claim, server/channel/member yönetimi, mevcut rol atama/kaldırma ve kick.
- Faz 5: kamera yayını, audio device/noise, haptic, offline, privacy shield, performans metriği, erişilebilirlik ve store-hazırlık kapanışı.

## Bilinçli kapsam sınırları ve sonraki adımlar

- Rol CRUD + izin hiyerarşisi mobilde ertelendi. Mobil yalnız mevcut rollerin atama/kaldırma yetkisini sunar; servis katmanındaki “kim kimi atayabilir veya sunucudan atabilir?” authz kontrolünü genişletmez.
- Rol create/update/delete, izin matrisi ve role hierarchy istemcide yoktur.
- Kanal/kategori sıralama arayüzü (channel/category reorder UI) ertelendi.
- Persist edilmiş mutation kuyruğu (offline queue) özellikle kapsam dışıdır.
- Çok katılımcılı video yerleşimi/optimizasyonu (group video layout) sonraki üründür; mevcut kamera grid'i küçük ve bounded odalar içindir.

## Doğrulama ve işletim

Milestone kapanışında mobile typecheck, tüm Node contract testleri, tüm component suite'leri, quality/release/env kontrolleri, Expo dependency check ve moderate audit çalıştırılır. Cihaz kapanışı tek Maestro UAT akışıyla yapılır; redacted kanıtlar yalnız `artifacts/mobile/phase5/` altında ve git dışındadır.

2026-07-13 kapanış kanıtı: typecheck PASS; Node contract testleri 432/432 PASS; Jest component testleri 24 suite ve 109/109 test PASS; quality gate blocker sayısı 0; `.maestro/phase5-voice-polish.yml` Pixel_10_Pro üzerinde 106 saniyede 1/1 PASS. Akış gerçek UAT LiveKit odasında mikrofon, kamera publish/unpublish, cihaz yenileme/seçim, noise tercihi, light/dark yüzeyler, kontrollü leave ve offline→online recovery adımlarını tamamladı. Aktif kamera karesi ve hassas değerler screenshot'a alınmadı.

M1'de üretilen ve emulatora kurulan tek APK: `Whispr-Mobile-UAT-0.8.15-20260713-194657-x86_64-debug.apk`. Faz 5 migration'ı gerektirmediği için Railway tarafında `db:migrate:deploy` yeni bir şema değişikliği uygulamaz; normal UAT readiness/liveness kontrolleri korunur.
