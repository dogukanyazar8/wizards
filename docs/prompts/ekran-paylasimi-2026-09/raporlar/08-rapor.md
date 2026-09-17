# Ş7 — Android ve mobil izleyici / Dalga 2

2026-09-17. Kaynak ve yerel testler tamamlandı; native cihaz kabulü açık.

## Uygulama

- Aktif paylaşım Android/iOS arka planında sürer; kamera kapanır. Consent guard korunur. Ses-yalnız arka plan çağrısı bu değişikliğin kapsamı değildir.
- Android manifest `mediaProjection|microphone`, `FOREGROUND_SERVICE_MICROPHONE`. Manifest tek başına yeterli olmadığı için kurulu `@livekit/react-native-webrtc@144.1.2` servisine pnpm patch eklendi: `startForeground` çağrısında mikrofon izni varsa ilgili runtime bit'i de geçilir.
- `TrackEvent.Ended`: durum off, self paylaşım false, kanal heartbeat false ve sistem mesajı. Yayından kaldırma/room cleanup listener'ı söker; çift tıklama ve eski room'dan geç dönen işlemler korunur.
- Kanal/DM consent sheet gerçekten bağlı. Gizlilik/ses paylaşılmaz/arka plan açıklaması, bir daha gösterme, aktif banner/durdur ve izin-hata ayrımı. Tercih yeni cihaz-yerel AsyncStorage anahtarında ayrı saklanır; bütün voice preference nesnesini yeniden yazmaz. DM paylaşım-sesi kontrolü bağlı.
- Fullscreen Pinch/Pan/double-tap: 1–4 zoom, sınırlandırılmış pan, 1↔2 çift dokunma; reducer web sözleşmesiyle uyumlu. Landscape açılır, kapanışta portrait geri gelir.
- `expo-screen-orientation@~57.0.2` mevcut Expo 57'ye uygun eklendi; lockfile/lisans manifesti güncellendi. Native uygulamanın yeniden derlenmesi gerekir; yalnız OTA yeterli değildir.
- Ekran aspect üst sınırı 21:9; kamera 16:9. 1080p'den yüksek kaynaklar MEDIUM, fullscreen diğer kaynaklar HIGH; gerçek alıcı çözünürlüğü cihaz/codec katmanlarına bağlıdır, fiziksel ölçüm yapılmadı.
- Görünür sahne/inline/fullscreen aynı ekran yüzeyini kullanır; yinelenen izleyen kaydı refcount ile tekilleşir. Var olan voice ticker ile 60 saniye yenileme; yeni timer yok. Arka plan, sayfa odağı kaybı, unmount izlemeyi kapatır.
- Roster/socket Go Live etiketi ve izleyen sayısı runtime'a bağlandı. Maestro akışı consent, HOME, geri dönüş, banner ve stop'u içerir.

## Doğrulama

- Mobil Node tam küme **2020 PASS / 0 FAIL**.
- Mobil Jest tam küme **142 suite / 1380 PASS**. Bu koşuda worker teardown uyarısı var; bütün test assertion'ları geçti. Son stage düzeltmesi sonrası odaklı **3 suite / 53 PASS**; tam küme yeniden koşulmadı.
- Son regresyon: 4K ana sahne HIGH istiyordu. Test önce `Expected: 1 / Received: 2` ile kırıldı; ortak yüzey sonrası MEDIUM doğrulandı.
- Mobil typecheck PASS; scoped ESLint 0 hata (önceden var olan realtime-provider hook dependency uyarıları ayrı).
- Native/app config/release son küme **17 PASS**; Android plugin idempotence ve kurulu SDK patch varlığı kontrol edildi.
- **NOT RUN:** Android 13 ve Android 14+ cihaz/emülatör; Maestro; gerçek arka plan ses/video, sistem bildiriminden durdurma, landscape ve native gesture performansı.
- `adb devices` çalıştırıldı: bağlı cihaz/emülatör yok. Cihaz kabulü bu ortamda **ENV BLOCKED**; native APK derlemesi yapılmadı.
- Loglar `%TEMP%/wizards-wave2-mobile-node-final.log`, `wizards-wave2-mobile-all-components.log`, `wizards-wave2-mobile-components-final.log`.

## Play Console FGS beyanı için metin

Media projection: Kullanıcının çağrı içindeki paylaş komutuyla başlayan, sistem onayından sonra aktif bildirimle süren ekran aktarımı. Kullanıcı uygulamadan veya sistem kontrolünden durdurabilir.

Microphone: Aynı kullanıcı tarafından başlatılan ekran paylaşımı sırasında çağrı mikrofonunu arka planda sürdürür; RECORD_AUDIO iznine bağlıdır. Sistem sesi yayınlama iddiası yoktur. Bu metin hazırlanmıştır; Play Console'a gönderilmedi.

## Kabul sırası

1. Native Android yeniden build; 13 ve 14+ üzerinde kamera/mikrofon/paylaşım izinleri.
2. Paylaş, HOME, mikrofon ve görüntünün sürmesi; sistemden durdur, karşı tarafta yayın kapanması.
3. 4K/ultrawide kaynağı mobilde aç; katman/zoom/pan/landscape ve izleyen sayısını karşı taraftan doğrula.
4. Maestro; cihaz kanıtını bu rapora ekle. iOS cihaz kabulü kullanıcı kararıyla sonraya kaldı.
