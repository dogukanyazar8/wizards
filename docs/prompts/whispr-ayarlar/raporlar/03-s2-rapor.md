# Ş2 raporu — Bildirim merkezi API

**Dalga 1 / Ş2.** Dal `uat`. Commit atılmadı. Tarih 2026-08-24.

400 px bildirim panelinin veri katmanı: dört sekme, gün grupları, çevirme kipi, dörtlü sayaç,
keyset sayfalama ve `notification:read` olayı.

---

## 1. Ne yapıldı

### Yeni dosyalar

| Dosya                                                                            | İş                                                                                                 |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/notifications/panel-query.ts`                                  | Kova çözümü (TypeScript + SQL ikizi), sekme süzgeci, keyset imleç, sayfa ve sayaç sorgu kurucuları |
| `apps/web/src/lib/notifications/panel-query.test.ts`                             | 18 fikstür × kova, ayrıklık, SQL ikizi eşitliği, imleç gidiş dönüşü                                |
| `apps/web/src/lib/notifications/panel-grouping.ts`                               | `today` / `yesterday` / `older` kovası, izleyicinin saat diliminde, saf modül                      |
| `apps/web/src/lib/notifications/panel-grouping.test.ts`                          | Istanbul ↔ New York ayrımı, boş kova, bozuk damga, referans NOTIFS yeniden üretimi                 |
| `apps/web/src/app/api/v1/notifications/route-logic.ts` + `.test.ts`              | `?tab` ayraçlı çift sözleşme, Server-Timing, kimlik → bütçe → sorgu sırası                         |
| `apps/web/src/app/api/v1/notifications/[id]/read/route-logic.ts` + `.test.ts`    | Çevirme kipi, gövdesiz çağrı varsayılanı, sayaçlı yanıt                                            |
| `apps/web/src/app/api/v1/notifications/unread-count/route-logic.ts` + `.test.ts` | `{ count, counts }`, `count === counts.all`                                                        |

### Düzenlenen dosyalar

| Dosya                                                                                | Değişiklik                                                                                                                                                                         |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/notifications/service.ts`                                                       | `getNotificationCounts`, `listNotificationPanel`, `setRead`, `markAllReadWithCounts`, `withNotificationCounts` eklendi; `markRead` / `markAllRead` **imzasız** sarmalayıcıya döndü |
| `lib/notifications/service.test.ts`                                                  | `$queryRaw` stub'ı ortak yardımcıya girdi; sayfa / sayaç / çevirme için 15 test eklendi                                                                                            |
| `lib/notifications/types.ts`                                                         | `NotificationPanelQuerySchema`, `NotificationPageSchema`, `NotificationReadBodySchema`, `NotificationUnreadCountResponseSchema`, `NotificationCounts` takma adı                    |
| `lib/notifications/client.ts`                                                        | `fetchNotificationPage`, `fetchNotificationCounts`, `setNotificationRead`, `notificationsQueryKeys.panel/.counts`; `markAllNotificationsRead` artık sayaç döner                    |
| `lib/socket/events.ts`                                                               | `notification:read` olayı + `NotificationReadSocketPayload`; `NotificationSocketPayload.counts` (opsiyonel)                                                                        |
| `app/api/v1/notifications/route.ts` · `[id]/read/route.ts` · `unread-count/route.ts` | İnce Next kabuğuna indirildi; `[id]/read` **POST + PATCH** taşıyor                                                                                                                 |
| `app/api/v1/notifications/read-all/route.ts`                                         | Yanıta `counts` **eklendi** (alan kaldırılmadı)                                                                                                                                    |
| `app/api/v1/route-contract.test.ts`                                                  | `PATCH notifications/[id]/read` gövdesiz listesinden çıktı — uç artık gövde alıyor                                                                                                 |

**Şema değişmedi, migration yazılmadı.** `@@index([userId, read, createdAt])` zaten mevcut
(`schema.prisma:2287`) ve dörtlü sayaç tam olarak onun ön ekini okuyor.

---

## 2. Kabul listesi

| Kabul                                                                | Durum        | Kanıt                                                                                                         |
| -------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| `mentions` ve `replies` ayrık                                        | ✅           | `panel-query.test.ts` "mentions ve replies ayrık kümedir" — 18 fikstürün hiçbiri iki sekmede değil            |
| `metadata.kind` yokken kayıt `mentions`'a düşüyor                    | ✅           | "metadata.kind yokken MENTION satırı mentions'a düşer"                                                        |
| `system` sekmesi 7 türü kapsıyor; `DM` yalnız `all`'da               | ✅           | "system sekmesi yedi türü kapsar" + "DM yalnız `all` sekmesinde görünür"                                      |
| Gün grubu izleyicinin saat diliminde                                 | ✅           | 23:30 UTC kaydı Istanbul'da `today`, New York'ta `yesterday`                                                  |
| Sunucu Türkçe metin göndermiyor                                      | ✅           | `groups[].label ∈ { today, yesterday, older }`; `service.test.ts` `/Bugün\|Dün/` aramasıyla da kontrol ediyor |
| İmleç tutarlı, aynı bildirim iki sayfada yok                         | ✅           | İmleç son **döndürülen** satırı işaret ediyor, çekilen fazlalığı değil (`n6`, `n7` değil)                     |
| `POST [id]/read` gövdesiz `read: true` gibi davranıyor               | ✅           | `read/route-logic.test.ts` ilk test — `PATCH`, gövdesiz, `setRead(..., true)`                                 |
| `{ read: false }` çeviriyor                                          | ✅           | `updateMany` `{ where: { read: true }, data: { read: false, readAt: null } }`                                 |
| Sayaçlar yalnız okunmamışı sayıyor                                   | ✅           | SQL `WHERE "userId" = ? AND "read" = false`                                                                   |
| `GET /unread-count` hem `count` hem `counts`; `count === counts.all` | ✅           | `unread-count/route-logic.test.ts`                                                                            |
| `notification.read` yükü `counts` taşıyor                            | ✅           | `NotificationReadSocketPayload.counts` **zorunlu**                                                            |
| `notification.created` yükü `counts` taşıyor                         | ⚠️ **kısmi** | Alan eklendi ama **opsiyonel** — gerekçe §3 sapma 3                                                           |
| `EXPLAIN ANALYZE` rapora eklendi, index scan                         | ✅           | §5                                                                                                            |
| Mevcut mobil bildirim testleri değişmeden yeşil                      | ✅           | `app/api/v1/mobile/notifications/route-logic.test.ts` dosyaya **dokunulmadı**, 0 hata                         |

---

## 3. Kayda geçen sapmalar

### Sapma 1 — `replies` dalı `metadata.kind`'a değil, ürünün gerçekten yazdığı alana bakıyor

03 §1 `replies` sekmesini `type = MENTION` **ve** `metadata.kind ∈ { thread, reply }` diye
tanımlıyor. Kodda okundu: **`metadata.kind` hiçbir yerde yazılmıyor** ve thread yanıtı
`type = MENTION` de değil. `message-notification-service.ts:707` şunu yazıyor:

```ts
metadata: { channelId, messageId, parentMessageId, serverId, threadReplyPreview },
// Tip `SYSTEM` kalıyor: mobil yönlendirme bugün `SYSTEM` metadata'sına bakıyor ve ayrım
// `metadata.parentMessageId` ile yapılıyor. `MENTION`a çevirmek mobil yönlendirmeyi kırardı.
type: "SYSTEM" as const,
```

Prompt'un harfi uygulansaydı `Yanıtlar` sekmesi **daima boş** kalır, her thread yanıtı
`Sistem`e düşerdi. Uygulanan kural: tanınan bir `metadata.kind` varsa o kazanır (ileriye dönük
kapı), yoksa tür + üründe yazılan metadata karar verir —
`SYSTEM` + `parentMessageId`/`threadReplyPreview` ⇒ `reply`, `SYSTEM` + `eventId` ⇒ `event`
(`events/notifications.ts:16` ayrımı zaten böyle tanımlıyor).

### Sapma 2 — beşinci kova `other`, DM için

SPEC §7 dört `kind` tanımlıyor (`mention | reply | event | system`) ama 03 §1 `DM`'in üç dar
sekmenin **hiçbirine** düşmemesini istiyor. `system` demek onu Sistem sekmesine sokardı.

Çözüm: iç kova beş değerli (`… | other`), dışarı çıkan `kind` dört değerli — `other` sunumda
`system` olur (referansın `S` ikonu), sekme üyeliği ise kovadan hesaplanır. DM satırı `Tümü`
dışında hiçbir sekmede yok. Bedeli: panelde bir DM satırı `S` ikonuyla çizilir; referansta DM
satırı hiç yok, SPEC'te de DM ikonu tanımlı değil.

### Sapma 3 — `notification:new` yükündeki `counts` **opsiyonel**

03 §6 `notification.created` yükünün de `counts` taşımasını istiyor. `notification:new` bugün
**on sekiz** ayrı yerden yayılıyor (`message-notification-service`, `role-mention-service`,
`dm/notification-service`, `events/notifications`, `friends/service`, `badge-service`,
`feedback-service`, `invite-service`, `member-service`, `moderation/*`, `attachments/scanner`,
`admin/notification-campaigns`) ve tek bir yaratma boğazı yok. Bunlardan en önemlisi —
bahsetme yolu — **Ş1'in dosyası** (`message-notification-service.ts`), yani bu şerit ona
dokunamaz.

Kısmi benimseme, tutarsız bir sözleşme demekti: bazı bildirimler sayaç taşır, bazıları taşımaz
ve istemci hangisinin hangisi olduğunu bilemez. Bunun yerine:

- `NotificationSocketPayload.counts` **opsiyonel** eklendi,
- `service.ts` `withNotificationCounts(payload)` yardımcısını dışa verdi,
- İstemci sözleşmesi: `counts` varsa oradan okur, yoksa `/unread-count`a düşer.

**Hiçbir durumda istemci sayacı kendisi artırmaz** — 03 §6'nın asıl kuralı korunuyor. Alanın
zorunluya çevrilmesi ve on sekiz yayımcının `withNotificationCounts`'tan geçirilmesi
**Ş11 / Ş13**'e bırakıldı; `TODO(api):` yerine tip yorumunda yazılı.

### Sapma 4 — uç `POST` **ve** `PATCH` taşıyor

03 §4 `POST /api/v1/notifications/[id]/read` diyor; üründeki metot `PATCH` ve
`notification-bell.tsx` (Ş11'e kadar yaşıyor) onu çağırıyor. İkisi de aynı gövdeyi okuyor ve
aynı mantığa gidiyor. `PATCH` çağrısının kalmadığını Ş13 doğrular.

### Sapma 5 — `?tab` ayraçlı çift sözleşme

`GET /api/v1/notifications` `tab` almadığında **eski diziyi** döndürüyor, aldığında sayfa
nesnesini. `tab` bilerek varsayılansız: `all` varsayılan olsaydı, bu şerit yayına girdiği anda
zil menüsü kırılırdı (03 §7 "eski `fetchNotifications(limit)` kalır"). Dizi dalı Ş11'de ölür.

### Sapma 6 — geri alma rozetleri geri getirmiyor

`read: true` bir bahsetmenin kanal rozetini (`ChannelReadState.mentionCount`) ve bir DM'in
`DMParticipant.unreadCount` payını düşürüyor. `read: false` onları **artırmıyor**.

Aradan geçen sürede kullanıcı kanalı gerçekten okumuş olabilir ve rozet zaten sıfırlanmıştır;
geri artırmak kullanıcıya görmediği bir borç yazardı. Bildirim satırının okunmamışlığı geri
gelir, kanalın rozeti gelmez. Testle kilitli ("geri alma kanal ve DM rozetlerini geri
getirmez").

### Sapma 7 — `read-all` yanıtına `counts` eklendi

PLAN §196 "`POST /api/v1/notifications/read-all` aynen kalır" diyor; 03 §7 ise
`markAllNotificationsRead(): Promise<NotificationCounts>` istiyor. Metot, yol ve mevcut alanlar
korundu, yanıta yalnız `counts` **eklendi**. Bugünkü istemci boş nesneyi okumaya devam ediyor.

---

## 4. Bırakılan `TODO(api):`

**Yok.** Bu şeridin uçlarının tamamı gerçek veriye bağlı. Devredilen tek iş sapma 3'teki
yayımcı benimsemesi ve o bir uydurma uç değil, tip yorumunda yazılı bir genişletme sırası.

---

## 5. `EXPLAIN ANALYZE`

Geliştirme veritabanında `Notification` **35 satır** taşıyor; o hacimde planlayıcı her koşulda
seq scan seçer ve indeksin işe yarayıp yaramadığı görünmez. Ölçüm, aynı tablo ve aynı beş
indeksle kurulan geçici bir kopyada yapıldı: **400.000 satır / 2.000 kullanıcı**, kullanıcı
başına 200 bildirim, metadata şekilleri üründe gerçekten yazılan şekiller. Kopya ölçümden sonra
düşürüldü.

Sorgu metni `buildNotifUnreadCountsQuery` / `buildNotifPanelPageQuery` **çıktısından** üretildi,
elle yazılmadı.

### Dörtlü sayaç — `GET /unread-count`, `listNotificationPanel`

```
Aggregate  (cost=200.00..200.02 rows=1 width=16) (actual time=0.963..0.964 rows=1.00 loops=1)
  Buffers: shared hit=203
  ->  Bitmap Heap Scan on "Notification"  (cost=4.94..193.50 rows=50 width=52) (actual time=0.037..0.792 rows=200.00 loops=1)
        Recheck Cond: (("userId" = 'user-8'::text) AND (NOT read))
        Heap Blocks: exact=200
        Buffers: shared hit=203
        ->  Bitmap Index Scan on "Notification_userId_read_createdAt_idx"  (cost=0.00..4.92 rows=50 width=0) (actual time=0.020..0.021 rows=200.00 loops=1)
              Index Cond: (("userId" = 'user-8'::text) AND (read = false))
              Index Searches: 1
              Buffers: shared hit=3
Planning Time: 0.636 ms
Execution Time: 0.660 ms
```

**Okuma:** tek `Aggregate`, tek tarama, `Notification_userId_read_createdAt_idx` üzerinden —
400.000 satırlık tabloda 200 okunmamışa 3 indeks bloğuyla iniyor. Dört ayrı `COUNT` yazılsaydı
bu tarama dört kez tekrarlanırdı. `COUNT(*) FILTER` dalları indeks taramasından sonra, zaten
elde olan 200 satır üzerinde çalışıyor.

### Panel sayfası — `?tab=system&limit=6`

```
Limit  (cost=710.07..710.08 rows=2 width=94) (actual time=0.157..0.158 rows=7.00 loops=1)
  ->  Sort  (cost=710.07..710.08 rows=2 width=94) (actual time=0.156..0.156 rows=7.00 loops=1)
        Sort Key: "createdAt" DESC, id DESC
        Sort Method: top-N heapsort  Memory: 26kB
        ->  Bitmap Heap Scan on "Notification"  (cost=5.92..710.06 rows=2 width=94) (actual time=0.026..0.109 rows=200.00 loops=1)
              Recheck Cond: ("userId" = 'user-8'::text)
              Filter: (CASE WHEN (type = 'DM') THEN 'other' … ELSE 'system' END = ANY ('{system,event}'))
              Heap Blocks: exact=200
              ->  Bitmap Index Scan on "Notification_userId_read_createdAt_idx"  (cost=0.00..5.92 rows=199 width=0) (actual time=0.011..0.011 rows=200.00 loops=1)
                    Index Cond: ("userId" = 'user-8'::text)
                    Index Searches: 1
Planning Time: 0.154 ms
Execution Time: 0.189 ms
```

**Okuma:** sayfa da aynı indeksten giriyor; `CASE` süzgeci ve `top-N heapsort` kullanıcının
kendi 200 satırı üzerinde çalışıyor, tablo üzerinde değil. `rows=7` beklenen: `limit + 1` — fazla
satır "sonraki sayfa var" demek için çekiliyor ve yanıta girmiyor.

**Bilinen sınır:** sekme süzgeci ifadeye dayalı olduğu için sıralama indeksten **okunamıyor**;
kullanıcının satır sayısı büyürse (binlerce bildirim) `top-N heapsort` maliyeti artar. Bugünkü
dağılımda (kullanıcı başına yüzlerce satır) 0,2 ms. Gerekirse çare bir ifade indeksidir
(`(userId, <bucket ifadesi>, createdAt DESC)`), ama şema bu şeridin sahipliğinde değil ve ölçüm
onu gerektirmiyor.

---

## 6. Kapı çıktısı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

**Ş2 dosyalarında sıfır hata.** Paylaşılan kapı, aynı anda koşan diğer şeritlerin yarım
dosyaları yüzünden kırmızı.

### typecheck

Ş2'nin dokunduğu 15 dosyada **0 hata**. Kalan hatalar ve sahipleri:

| Dosya                                                                                                  | Şerit |
| ------------------------------------------------------------------------------------------------------ | ----- |
| `lib/notifications/prefs-service.ts` (3)                                                               | Ş1    |
| `lib/notifications/mention-settings-service.ts` (2)                                                    | Ş1    |
| `lib/security/security-event-service.ts` (2) · `lib/auth/two-factor.ts` (2) · `two-factor.test.ts` (1) | Ş3    |
| `lib/settings/search.test.ts` (1) · `lib/settings/search-index.test.ts` (sözdizimi)                    | Ş4    |

### lint

Ş2'nin 15 dosyasında **temiz** (`npx eslint …` çıktısı boş).

### test

Tüm paket: **5363 test · 5354 geçti · 8 kırık.** Sekiz kırığın tamamı diğer şeritlerin
dosyalarında:

```
src\lib\locale\settings-screen-copy.test.ts          (Ş4)
src\lib\notifications\desktop-mention-policy.test.ts (Ş1)
src\lib\security\security-event-service.test.ts      (Ş3)
src\lib\workspace\message-notification-service.test.ts × 4 (Ş1)
src\lib\workspace\role-mention-service.test.ts       (Ş1)
```

Ş2 kapsamı izole koşuldu — `panel-query`, `panel-grouping`, `service`, üç rota mantığı ve
`route-contract`:

```
ℹ tests 101
ℹ suites 13
ℹ pass 101
ℹ fail 0
```

`app/api/v1/mobile/notifications/route-logic.test.ts` (dokunulmadı) ve
`app/api/v1/notifications/clear/route-logic.test.ts` de yeşil.

---

## 7. Sonraki şeritlere devir

| Kime            | Ne                                                                                                                                                                                                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ş11** (panel) | `fetchNotificationPage` / `fetchNotificationCounts` / `setNotificationRead`; `notificationsQueryKeys.panel(tab)`. Sonsuz kaydırmada `IntersectionObserver` efektinin bağımlılıkları **ilkel** olmalı (`[hasNextPage, isFetchingNextPage]`) — sorgu nesnesi geçilirse gözlemci her render'da sökülüp kurulur ve her render bir sayfa daha çeker. |
| **Ş11**         | `notification-bell.tsx` `POST`a ve `setNotificationRead`e geçince `fetchNotifications` / `markNotificationRead` ölür.                                                                                                                                                                                                                           |
| **Ş11 / Ş13**   | Sapma 3: on sekiz `notification:new` yayımcısını `withNotificationCounts`tan geçirip `counts`u zorunluya çevirmek.                                                                                                                                                                                                                              |
| **Ş13**         | `PATCH notifications/[id]/read` çağrısı kalmadığını ve `?tab` almayan dizi dalının ölü olduğunu doğrulamak.                                                                                                                                                                                                                                     |
| **İstemci**     | Grup etiketi enum geliyor; metin `notif.panel.group.today` / `.yesterday` / `.older` anahtarlarından. Sunucu Türkçe göndermiyor.                                                                                                                                                                                                                |
