# 20 — Mobil: ses, medya ve kaynak yaşam döngüsü

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** 17 landed (ses provider'ı ayrıldıktan sonra ticker düzeltmesi daha net ölçülür).

## Sorun

Arka planda koşan tick'ler pili yiyor; asılan yüklemenin sonu yok; geçici dosyalar hiç silinmiyor.

## Kapsam

### 1. Ses seviyesi ticker'ı arka planda durmuyor

`apps/mobile/src/voice/use-mobile-voice-room.ts:928`, `:932`, `:871`, `:2012`, `:806`, `:969`, `:2025` · `mobile-voice-lifecycle-contract.ts:25`

90 ms'lik ticker yalnız odadan çıkışta, disconnect temizliğinde ve unmount'ta duruyor. AppState handler'ı (`:2012`) kamerayı ve ekran paylaşımını askıya alıyor ama ticker'a dokunmuyor. `useMobileVoiceRoom` uygulama genelinde mount olduğundan, cepteki telefon saniyede ~11 tick koşuyor; her tick sesi açık katılımcı başına bir native `getStats()` turu + tam katılımcı birleştirmesi. 10 kişilik odada ~110 native çağrı/sn, sıfır piksel.

Yap: AppState `active`'den çıkınca ticker'ı durdur, dönünce başlat — kamerayı askıya alan aynı effect içinde.

### 2. Geri basınç koruması yalnız yarısını koruyor

`apps/mobile/src/voice/use-mobile-voice-room.ts:929`, `:867`, `:860`

`void sampleRoomAudioActivity(gen).finally(() => { updateParticipantsFromRoom(gen); })` — `.finally` erken dönüş yolunda da çalışıyor. Yani stats okuması atlansa bile pahalı birleştirme ve state yazımı 11×/sn koşuyor. Yorum "yavaş cihaz daha düşük örnekleme hızına düşer" diyor; düşmüyor.

Yap: `updateParticipantsFromRoom`'u örnekleme fonksiyonunun başarı yoluna (`.then`) taşı. Atlanan tick gerçekten atlansın.

### 3. Ekran paylaşımı ses susturması her tick'te uygulanıyor

`apps/mobile/src/voice/use-mobile-voice-room.ts:563` · `mobile-screen-share-audio.ts:60`

`applyMobileScreenShareAudioMute` her `updateParticipantsFromRoom` çağrısında koşuyor — yani her seviye tick'inde — ve tüm uzak katılımcıları dolaşıp `setVolume` çağırıyor. Bir web paylaşımcısı varsa native `mediaStreamTrackSetVolume` 11×/sn, değişmemiş bir değer için.

Yap: yalnız susturma tercihi veya uzak katılımcı kümesi değiştiyse çağır.

### 4. Ses yolu yoklaması arka planda devam ediyor

`apps/mobile/src/voice/use-mobile-voice-room.ts:1916`, `:1911`, `:1921`, `:117`, `:734`

4 sn'lik `setInterval` yalnız `roomState.status !== "connected"` ile kapılanmış; aynı effect'te zaten `AppState` `active` olunca yeniden senkronize eden bir dinleyici var. Arka plandaki çağrı boyunca dakikada 15 native `AudioSession.getAudioOutputs()`, kimsenin göremediği bir ikon için.

Yap: AppState `active` değilken interval'i durdur; mevcut resume dinleyicisi doğruluğu zaten geri getiriyor.

### 5. Mesaj eki yüklemesinde watchdog yok

`apps/mobile/src/media/mobile-message-attachment-upload.ts:31` · `app/components/mobile-composer.tsx:542` · karşılaştır `use-mobile-feedback-attachment-upload.ts:88` · `mobile-upload-watchdog.ts:4`

`uploadFiles` yalnız `files`/`headers`/opsiyonel `signal` alıyor: ilerleme kanalı yok, süre sınırı yok. Sesli not çağıranı `signal` bile geçmiyor. UploadThing isteği uygulamanın kendi `onUploadComplete`'i cevaplayana kadar açık tutuyor; o kuyruk dönmezse composer'ın `uploading` durumu sonsuza kadar true, mikrofon düğmesi ölü, kullanıcıya hiçbir hata yok. `createMobileUploadWatchdog` tam bunun için yazılmış ama yalnız geri bildirim akışına bağlı.

Yap: geri bildirim hook'unun yaptığı gibi `createMobileUploadWatchdog` tarafından sürülen bir `AbortController` ile sar. Watchdog'un ilk-bayt sayacı kurulumda kurulduğundan ilerleme olayı olmadan da çalışır.

### 6. Görsel yüklemelerinde watchdog yok

`apps/mobile/src/media/use-mobile-image-upload.ts:49`, `:57`, `:31` · `mobile-image-upload-service.ts:28` · `mobile-uploadthing-client.ts:37`

Avatar, banner ve sunucu ikonu: `AbortController` yalnız unmount'ta tetikleniyor. Asılan yükleme `isBusy`'yi ve `activeOperationRef`'i kalıcı bırakıyor; sonraki her deneme "zaten yükleme var" diyor, ekran terk edilene kadar. Bağımlılık sözleşmesinde `onProgress` yok, oysa alt katman kabul ediyor.

Yap: `onProgress`'i `uploadFile` bağımlılığından geçir ve watchdog'u onunla sür.

### 7. Sesli not dosyası hiç silinmiyor

`apps/mobile/src/media/mobile-voice-message-recorder.ts:238`, `:224`, `:276`, `:26` · `mobile-composer.tsx:553`

Başarılı gönderim dosyayı döndürüp bırakıyor; yalnız "çok kısa" ve "vazgeç" yolları siliyor. `RecordingPresets.HIGH_QUALITY` ile cache dizininde ~1 MB/dk, uygulamanın ömrü boyunca birikiyor.

Yap: yükleme `ready` olduğunda yerel dosyayı sil (`draft` zaten `localUri` taşıyor).

### 8. Görsel sıkıştırma geçişleri dosya bırakıyor

`apps/mobile/src/media/mobile-image-compression.ts:187`, `:197`, `:200`, `:42` · `mobile-image-picker.ts:61`

Her yeniden kodlama geçişi diske gerçek bir dosya yazıyor; iki reddetme dalı da o `uri`'yi bırakıyor. Bir fotoğraf üç kurtarma geçişine kadar koşuyor → iki yetim megabaytlık dosya + saklanan. Yalnız native bitmap (`image.release()`) temizleniyor.

Yap: reddedilen geçişin çıktısını sil; yükleme oturduktan sonra optimize edilmiş dosyayı da sil.

### 9. Çoklu görsel seçiminde eşzamanlı decode

`apps/mobile/src/media/mobile-image-picker.ts:173`, `:59`, `:69` · `packages/types/src/mobile-feedback.ts:15`

`Promise.all` ile tüm seçilen görseller aynı anda decode ediliyor; her biri canlı bir native bitmap tutuyor. Geri bildirim akışı üçe kadar seçtiriyor — üç 12 MP fotoğraf ≈ 100 MB+ native bellek, düşük bellekli Android'de OOM.

Yap: sırayla işle (veya eşzamanlılığı 1'de sınırla).

### 10. Kayıt sırasında unmount ses modunu bırakmıyor

`apps/mobile/src/media/mobile-voice-message-recorder.ts:122`, `:142`, `:256`, `:283` · `mobile-audio-playback-session.ts:3`

Unmount temizliği yalnız metre zamanlayıcısını durduruyor: kayıt durdurulmuyor, dosya silinmiyor, `allowsRecording: true` modu playback'e geri verilmiyor. Sonraki sesli not oynatma kimsenin yeniden yapılandırmadığı bir oturumda koşuyor.

Yap: unmount temizliği uçuştaki kaydı iptal etsin — durdur, dosyayı sil, `ensureMobilePlaybackAudioMode()`.

### 11. Performans örneklem kuyruğu sınırsız

`apps/mobile/src/performance/mobile-performance-sample-persistence.ts:94`, `:66`, `:65` · `mobile-performance-metrics.ts:40`

Retry yolu `pending = [...batch, ...pending]` — tavan yok; `queuedIds` de küçülmüyor. SQLCipher kilitliyken 30 sn'ye kadar geri çekilirken her navigasyon ve liste yüklemesi ekliyor. Ölçmesi gereken bozuk cihazda sınırsız büyüyen enstrümantasyon.

Yap: `pending`'e tavan koy (en eskiyi düşür) — sağlık raporlayıcısının `MOBILE_HEALTH_QUEUE_CAP` deseni var.

## Yapılmayacak

- LiveKit sürümü veya ses motoru değişikliği.
- Yeni yükleme sağlayıcısı.
- Görsel sıkıştırma kalitesi/parametrelerini değiştirmek.
- Ses UI'ını yeniden tasarlamak.

## Kabul kriterleri

1. Uygulama arka plandayken seviye ticker'ı ve ses yolu yoklaması durmuş.
2. Atlanan bir seviye tick'i katılımcı birleştirmesi yapmıyor.
3. Asılan bir yükleme sonlanıyor ve kullanıcıya hata gösteriliyor; ekran terk edilmeden yeniden denenebiliyor.
4. Gönderilen sesli not ve reddedilen sıkıştırma geçişleri diskte dosya bırakmıyor.
5. Üç görsel seçimi sırayla işleniyor.
6. Kayıt sırasında ekrandan çıkmak ses modunu playback'e döndürüyor.
7. Örneklem kuyruğu tavanlı.

## Testler

- Ticker: AppState `background` olayında `clearInterval` çağrıldığı (sahte zamanlayıcı).
- Geri basınç: örnekleme reddedildiğinde birleştirmenin çağrılmadığı.
- Watchdog: ilerleme gelmezse abort edildiği ve hata sonucunun döndüğü.
- Dosya temizliği: başarılı gönderim sonrası silme çağrısının yapıldığı (sahte dosya sistemi).
- Görsel seçici: eşzamanlılığın 1 olduğu (çağrı sıralaması).
- Kuyruk tavanı: taşmada en eskinin düştüğü.

Jest'te sahte zamanlayıcı kullanırken unmount tuzağına dikkat — repo bunu daha önce yaşadı.

## Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/mobile test
```

```bash
cd apps/mobile && npx jest component-tests
```
