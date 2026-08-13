# 09 — Sayaçlar ve bildirimler: sönmeyen rozetler

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** yok. 08 ile paralel koşabilir.

## Sorun

Bir sayaç hiç sıfırlanmıyor, biri fazla sıfırlanıyor, bir bildirim türü hiç görünmüyor, bir temizleme yolu sayaçları bırakmıyor ve push kesintisi sessiz.

Kök neden aynı: **okundu/temizle davranışı üç ayrı yerde ayrı ayrı yazılmış** (servis, web rotası, mobil rotası) ve üçü aynı fikirde değil.

## Kapsam

### 1. `DMParticipant.mentionCount` hiç sıfırlanmıyor

`apps/web/src/lib/dm/realtime-service.ts:169` (tek yazıcı) · `apps/web/src/lib/dm/service.ts:1442` · `apps/web/src/lib/notifications/service.ts:443`, `:451`

Repo genelinde bu sayacı düşüren tek bir yazma yok. Değer web kenar çubuğuna (`dm-sidebar.tsx:469`) ve mobil bootstrap'e (`bootstrap/route.ts:204`) servis ediliyor. 40 kez bahsedilen kullanıcı, sohbeti açarak/okuyarak/temizleyerek **asla** silemediği bir `@40` rozeti görüyor.

Yap:

- `markDirectMessageRead`'e `mentionCount: 0` ekle.
- `releaseAllDirectMessageUnread`'e ekle.
- `releaseDirectMessageUnread`'de, okunan bildirimin metadata'sı viewer'ı bahsedilen olarak işaretliyorsa azalt.
- Mobil okuma yolu ayrı yazıyorsa onu da hizala.

### 2. Toplu bırakma sessize alınmış DM'lerin sayacını da sıfırlıyor

`apps/web/src/lib/notifications/service.ts:450` · `apps/web/src/lib/dm/realtime-service.ts:148` · `apps/web/src/lib/dm/notification-service.ts:51`

`unreadCount` artışı mute'a bakmıyor ama bildirim satırı üretimi bakıyor. Sonuç: sessize alınmış grupta yüzlerce okunmamış var, sıfır bildirim satırı var. Alakasız bir beslemede "tümünü okundu" o grubu da sıfırlıyor ve kullanıcı taşındığını hiç görmüyor.

Yap: toplu sıfırlamayı, gerçekten okundu işaretlenen bildirim satırlarının adlandırdığı `conversationId` kümesine daralt.

### 3. `markRead` yarışı sayacı eksiltiyor

`apps/web/src/lib/notifications/service.ts:457`, `:466`, `:479`

Okuma bir ifadede, yazma başka ifadede ve yazma koşullu değil. Çift dokunuş veya istemci retry'ı bir bahis için iki birim `mentionCount` düşürüyor. `gt: 0` tabanı negatifi engelliyor ama eksik saymayı değil.

Yap: koruma yazmanın içine girsin — `updateMany({ where: { id, userId, read: false }, … })`; rozet bırakmayı yalnız `count === 1` iken çalıştır.

### 4. Web "tüm bildirimleri temizle" sayaçları bırakmıyor

`apps/web/src/app/api/v1/notifications/clear/route.ts:11` · `apps/web/src/lib/notifications/service.ts:500` · `mobile/notifications/route-logic.ts:103`

Rota paylaşılan servisi çağırmak yerine doğrudan `deleteMany` yapıyor; iki bırakma adımı atlanıyor. Kardeş "tümünü okundu" rotası servisi çağırıyor — iki eylem birbirine zıt.

Yap: `await clearNotifications(userId)`. Rotada iş mantığı bırakma (SRP).

### 5. `FEEDBACK` bildirimleri görünmez

`apps/web/src/lib/notifications/service.ts:34` · `apps/web/src/lib/feedback/feedback-service.ts:531` · `notifications/types.ts:12`

`FEEDBACK` canlı bir tür; yazılıyor, emit ediliyor, push'lanıyor — ama `VISIBLE_NOTIFICATION_TYPES` içinde değil. Kullanıcı push ve toast alıyor, uygulamayı açıyor, satır yok.

Yap: türü listeye ve union'a ekle. Mobil `getMobileVisibleNotificationTypes` kapısıyla çakışmadığını doğrula.

### 6. Push kesintisi "hiç cihaz yok"tan ayırt edilemiyor

`apps/web/src/lib/mobile/push-sender.ts:179`, `:162`, `:243`

Expo 429/5xx dışı bir hata dönerse (400 bozuk payload, 401 kimlik rotasyonu) parti log'suz, `pushDeliveryAttempt` satırsız atlanıyor. Sonuç meşru "token yok" erken dönüşüyle byte-byte aynı. Tüm push'lar sessizce durabilir.

Yap: başarısız partiyi logla ve sentetik `errorCode` ile `stage: "TICKET"` satırı yaz.

### 7. Toplu bahis bırakma sunucu başına fan-out yapıyor

`apps/web/src/lib/notifications/service.ts:425`, `:400` · `apps/web/src/lib/workspace/unread-service.ts:690`, `:725`

Sunucu başına bir `emitServerUnreadUpdateToUser`, her biri 2+ sorgu, yanıt gönderildikten sonra `void` ile ve `.catch(() => undefined)` ile. 20 sunuculu kullanıcıda 40 sorgu, hatası hiç loglanmıyor. Aynı dosyada partili bir varyant zaten var.

Yap: partili okuyucuyu kullan; hatayı yut**ma**, logla.

## Yapılmayacak

- Yeni bildirim türü.
- Rozet UI'ını değiştirme.
- Push sağlayıcısını değiştirme.
- `Notification` indeksi eklemek — 12 no'lu promptun işi (not bırak).

## Kabul kriterleri

1. Grup DM'de bahsedilen kullanıcı sohbeti okuduğunda `@N` rozeti sönüyor.
2. "Tümünü okundu", okundu işaretlenmeyen sessize alınmış konuşmanın sayacına dokunmuyor.
3. Aynı bildirim iki kez okundu işaretlenirse rozet bir kez düşüyor.
4. Web ve mobil "temizle" uçları aynı sayaç etkisini üretiyor.
5. `FEEDBACK` bildirimi listede ve okunmamış sayısında görünüyor.
6. Expo 400 dönen bir parti log ve teslimat denemesi satırı bırakıyor.

## Testler

- `markDirectMessageRead`: `mentionCount` sıfırlanması.
- Toplu bırakma: sessize alınmış konuşmanın dokunulmadığı.
- `markRead` idempotansı: iki çağrı, tek düşüş.
- `clearNotifications` çağrı zinciri: rotanın servisi çağırdığı.
- `VISIBLE_NOTIFICATION_TYPES` ↔ `NotificationType` kapsama testi: yazılan her tür ya görünür ya bilinçli dışlanmış listede.
- Push: 400 durumunda denemenin kaydedildiği.

## Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```
