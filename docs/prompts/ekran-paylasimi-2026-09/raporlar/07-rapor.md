# Ş6 — iOS / Dalga 2

2026-09-17. Kullanıcı kararı: **şimdilik kapalı; cihaz testi sonra**.

## Kapı

iOS paylaşımı `unsupported`. Kanal, DM ve panel butonları pasif; erişilebilirlik açıklaması var. Hook `setScreenShareEnabled` çağırmaz ve boş yayın presence'ı başlatmaz. Android yolu açık kalır.

Destek için App Group bilgisi **ve** `extra.iosBroadcastValidated === true` birlikte gerekir. `app.config.js` bu bayrağı sabit `false` tutar; extension kaynaklarının bulunması desteği açmaz.

## Hazırlanan kaynak

- `withIosBroadcastExtension.js`: `WhisprBroadcast` upload target, `.broadcast` bundle, ortak App Group, `rtc_SSFD`, entitlements/plist, Swift kaynağı; ikinci çalışmada duplicate target yok.
- `SampleHandler.swift`: kurulu RCTWebRTC okuyucusuna uygun HTTP başlık + JPEG socket aktarımı; video-only, en çok bir bekleyen kare, nonblocking I/O, 30 FPS/1080p ölçekleme, kısmi yazım ve bağlantı kapanış temizliği. **50 MB cihaz bellek ölçümü yapılmadı.**
- EAS extension hedefi ve entitlement metadata'sı `extra.eas.build.experimental.ios.appExtensions` içinde. Expo'nun [app-extension sözleşmesi](https://docs.expo.dev/build-reference/app-extensions/) gereği bu bilgi app config'tedir; `eas.json` içine desteklenmeyen yorum/alan eklenmedi.
- Ş7'nin arka plan paylaşım istisnası ve `TrackEvent.Ended` temizliği iOS yolunu da kapsar.

## Doğrulama / kalan

- Platform, kapı, disabled buton, App Group/socket/bundle, Android ile ayrım testleri PASS.
- Native/app config/release odaklı son küme: **17 PASS**.
- Gerçek `xcode@3.0.1` parser ile Expo bare proje fixture'ına iki uygulama sonunda tek `WhisprBroadcast` target üretildi. Bu, Xcode derlemesi değildir.
- **NOT RUN:** Swift/Xcode build, signing/provisioning, TestFlight, cihazda kare alma/OS durdurma/arka plan/50 MB ölçümü.
- **Ertelendi:** native picker başlatma köprüsü ve yayın başlatma akışı. Bayrak açılmadan önce bu akış tamamlanmalı; tek başına `iosBroadcastValidated` değiştirmek yeterli değildir.
- Ana uygulama ve extension için Apple Developer App Group/capability ve ayrı provisioning profile cihaz kabulünde doğrulanmalı. Bu oturum Apple/EAS hesabında değişiklik yapmadı.

Ş6 A kapısı tamamlandı. Ş6 B kaynak hazırlığıdır; yayın desteği tamamlandı sayılmaz.
