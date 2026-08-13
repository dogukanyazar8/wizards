# 17 — Mobil: provider kimlik kaçakları

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** yok.

## Sorun

Uygulama kökünde duran üç provider, her soket olayında veya her 90 ms'de yeni bir context değeri yayınlıyor. Bunun için yazılmış tüm memo'lar ölü. Tek bir kişinin yazması, kimsenin bakmadığı bir kanalda, tüm ürün ağacını yeniden render ediyor.

Kalıp aynı: **bağımlılık dizisinde nesnenin kendisi var, kararlı referans yerine.** Düzeltme de aynı: `.mutate` al, `voiceRoom` yerine okunan alanları al, sayaçları ref'e taşı.

## Kapsam

### 1. Realtime provider her olayda dispatch ediyor

`apps/mobile/src/app/providers/mobile-realtime-provider.tsx:282`, `:609` · `apps/mobile/src/realtime/mobile-realtime-state.ts:102` · `apps/mobile/src/app/mobile-product-app.tsx:97`

`event-received` reducer'ı `eventCount`, `lastEvent`, `lastSeenAt` ile yeni nesne üretiyor; `connection` context değerinin bağımlılığı. Dosyanın kendi başlık yorumu, yazma göstergesinin **tam olarak bu yüzden** kendi store'una taşındığını yazıyor — `event-received` o olayları geri sokuyor. Navigator memoize değil, o da render oluyor.

Yap:

- `eventCount`/`lastEvent`/`lastSeenAt` bir ref'e veya tanı panelinin abone olduğu ayrı bir store'a taşınsın.
- Reducer yalnız gerçek durum/görünürlük geçişlerinde dispatch etsin, böylece `connection` bağlantı hızında değişsin, olay hızında değil.
- Başlık yorumunu gerçeğe getir.

### 2. `retryFailedMessage` mutation nesnesini dep tutuyor

`apps/mobile/src/app/features/use-mobile-messaging-feature.ts:634`, `:623` · `apps/mobile/src/query/use-mobile-message-mutations.ts:797`, `:605` · `mobile-product-app.tsx:304`, `:380`, `:236`

TanStack `useMutation` her render yeni sonuç nesnesi döndürüyor. Sonuç: iki kök screen-props memo'su (`messagesScreenProps`, `overviewScreenProps`) **hiç** tutmuyor; koddaki "yalnız kendi girdileri değişince render olur" yorumu pratikte yanlış.

Yap: dep dizisine `mutation` yerine `mutation.mutate` koy (observer'a bağlı, kararlı). İki yerde.

Aynı hata: `apps/mobile/src/app/features/use-mobile-group-chat.ts:103` — `dismissPinnedStrip` mutation nesnesi. Aynı düzeltme.

### 3. Ses provider'ı `voiceRoom` nesne literaline bağlı

`apps/mobile/src/app/providers/mobile-voice-provider.tsx:125`, `:115` · `apps/mobile/src/voice/use-mobile-voice-room.ts:2051`, `:928` · `mobile-voice-lifecycle-contract.ts:25`

`useMobileVoiceRoom` düz nesne literali döndürüyor (memoize değil) ve provider tüm uygulamayı sarıyor. Çağrı bağlıyken ve biri konuşurken katılımcı durumu ~11×/sn commit ediliyor; her commit ürün kökünü ve tüm ses context tüketicilerini render ediyor. `enableFreeze(true)` yalnız blurred ekranları koruyor.

Yap: runtime'ı ikiye ayır — **kararlı eylemler** context'i ve **oda durumu** store'u (veya `useSyncExternalStore`). Seviye tick'i yalnız seviye çizen yüzeylere ulaşsın.

Bu, bu promptun en büyük maddesi. Yeni bir store kütüphanesi kurma; repo `zustand` kullanıyorsa onu kullan, kullanmıyorsa `useSyncExternalStore` yeter.

### 4. Ses ekran-props memo'su tüm runtime'ı dep tutuyor

`apps/mobile/src/app/features/use-mobile-voice-screen-props.ts:93`, `:92`

`voiceRuntime` her render yeni (yukarıdaki madde). `voiceRoomState` zaten listede ve güncellemeyi meşru şekilde sürüyor.

Yap: `voiceRuntime`'ı dep'ten çıkar, katkı yaptığı tek tek kararlı callback'leri listele. #3 çözülünce bu kendiliğinden düzelmez — ayrıca yapılmalı.

### 5. Push yanıt köprüsü her olayda yeniden kayıt oluyor

`apps/mobile/src/app/providers/mobile-push-response-bridge.tsx:42` · `mobile-realtime-provider.tsx:595` · `apps/mobile/src/notifications/mobile-push-response-runtime.ts:49`, `:62`

Effect'in tek bağımlılığı, realtime context değeriyle birlikte yeniden üretilen bir satır içi ok. Sonuç: `setNotificationHandler` yeniden atanıyor ve native bildirim-yanıt aboneliği söküp takılıyor — dakikada yüzlerce kez. Bu, bir push'un ön planda gösterilip gösterilmeyeceğine karar veren yol.

Yap: decline çağrısını bir ref üzerinden geçir, effect'i boş dep dizisiyle çalıştır. Dosyanın kendi yorumu "bir kez mount edilir" diyor — o sözleşmeyi geri getir.

### 6. Overlay registry'nin dedup koruması erişilemez

`apps/mobile/src/app/components/kit/overlay-surface.tsx:205`, `:198` · `apps/mobile/src/app/components/kit/overlay-registry.ts:108`, `:105` · `mobile-product-app.tsx:469`

`useLayoutEffect` dep dizisiz ve her render registry'ye **satır içi üretilmiş** bir React elementi yazıyor. Registry'nin kimlik karşılaştırması hiçbir zaman tutmuyor (React elementi render'lar arası referans-eşit olmaz). Açık her overlay'in sahibi render oldukça hem `MobileOverlayHost` hem de tüm uygulama ağacını saran `MobileOverlayContentScope` bildiriliyor.

Yap: `hostedNode`'u memoize et (`bridgedValues` + `surface` üzerinden) veya ucuz bir imza karşılaştır; `set` çağrısını gerçek girdilere bağla.

## Yapılmayacak

- Yeni state yönetimi kütüphanesi eklemek.
- Provider ağacını yeniden düzenlemek.
- `enableFreeze` ayarına dokunmak.
- Ekran bileşenlerine dokunmak — 18'in işi.

## Kabul kriterleri

1. Bir `typing:update` ürün kökünü render etmiyor.
2. `messagesScreenProps` ve `overviewScreenProps` kendi girdileri değişmedikçe aynı referansı koruyor.
3. Çağrı sırasında seviye tick'i yalnız seviye çizen bileşenleri render ediyor.
4. Bir soket olayı `setNotificationHandler`'ı yeniden atamıyor.
5. Açık bir overlay'in sahibinin alakasız render'ı registry'yi bildirmiyor.

## Testler

- Kimlik testleri saf ve ucuz: hook'u iki kez render et, dönen referansın aynı olduğunu iddia et. `component-tests` altında küçük bir sonda bileşen yeterli.
- Realtime provider: iki olay dispatch edildikten sonra context değerinin referansının değişmediği.
- Push köprüsü: iki olay sonrası `setNotificationHandler` çağrı sayısının 1 kaldığı (sahte modül ile).
- Overlay: aynı içerikle iki render sonrası registry `set` sayısının 1 kaldığı.

## Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
cd apps/mobile && npx jest component-tests
```

```bash
pnpm --filter @wizards/mobile test
```
