# Kampanya Merkezi ve Ürün Sesi (Alt Proje E)

**Tarih:** 2026-07-26 · **Revizyon:** 2026-07-27 (spec-correction turu)
**Dal:** uat
**Durum:** Tasarım yazıldı, onay bekliyor
**Bağımlılık:** B1 (capability haritası). E2/E3 ayrıca B2 (rota kabuğu).
A, `CLIENT_TYPE` hedeflemesi için **işlevsel olarak zorunlu** — A olmadan o
segment yanlış kitleye gidiyor.

## Bağlam

Altı alt projeden beşincisi. İki konu tek spec'te: kullanıcıya bir şey söylemek
(kampanya) ve kullanıcıdan geleni dinlemek (geri bildirim).

**Revizyon notu.** İlk taslak zamanlama, sessiz saatler, A/B ve geri alma
öneriyordu — ama bunların üstüne kurulacağı gönderim yolunun kendisi
idempotent değil. Değerlendirme bunu yakaladı; incelerken mevcut kodda
**bugün canlı olan bir çift-gönderim hatası** bulundu. Spec, önce o hatayı
kapatacak şekilde yeniden düzenlendi. Sessiz saatler ve geri alma v1'den
çıkarıldı.

Hedef kullanıcı: **platform operasyon ekibi**.

## Doğrulanmış mevcut durum

### 1. Gönderim idempotent değil — canlı hata

`apps/web/src/lib/admin/notification-campaigns.ts:242` `sendNotificationCampaign`:

```ts
if (campaign.status !== "DRAFT" && campaign.status !== "FAILED") { throw ... }
const recipientIds = await getCampaignRecipientIds(segment);   // :259
await prisma.notificationCampaign.update({ data: { sentCount: 0, ... } });  // :261
// batch döngüsü: prisma.notification.create — dedupeKey YOK
```

Üç ayrı sorun, hepsi bugün üretimde:

- **Alıcı listesi gönderim anında yeniden çözülüyor** (`:259`). Önizlemede
  gösterilen kitle ile gerçekten gönderilen kitle aynı olmak zorunda değil.
- **`dedupeKey` yazılmıyor.** `Notification.dedupeKey` alanı `@unique`
  (`schema.prisma:1231`) — veritabanı tekilliği zorlayabilecek durumda, ama
  kampanya bu alanı hiç doldurmuyor.
- **`FAILED` kampanya yeniden gönderilebiliyor ve `sentCount` sıfırlanıyor**
  (`:261`). Kısmen gönderilmiş bir kampanya yeniden çalıştırıldığında
  **daha önce bildirim almış herkes ikinci kez alıyor.**

Ayrıca hata yolu tutarsız: batch `prisma.$transaction` içinde ve `catch` yok,
yani bir batch patlarsa fonksiyon fırlatıyor ve kampanya `SENDING` durumunda
kalıyor. `FAILED` durumu pratikte yalnızca `sentCount < recipientCount` olduğu
halde fırlatmayan bir senaryoda oluşuyor.

### 2. Kampanya push göndermiyor

`sendNotificationCampaign` yalnızca `prisma.notification.create` ve socket
`notification:new` emit'i yapıyor. `push-sender.ts` çağrılmıyor. Kampanya
bildirimleri uygulama kapalıyken cihaza ulaşmıyor.

### 3. Zamanlama kolonu ölü

`NotificationCampaign.scheduledAt` (`schema.prisma:1292`) şemada var;
`apps/web/src/` altında (testler dahil) **hiç geçmiyor**.
`NotificationCampaignCreateRequestSchema`
(`notification-campaign-input.ts:47`) `sendNow: boolean` alıyor, zamanlama
girdisi yok.

### 4. Onay yok

`NotificationCampaignStatus` (`schema.prisma:152`): `DRAFT`, `SENDING`,
`SENT`, `FAILED`, `CANCELLED`. Onay durumu yok.
`createNotificationCampaign` (`:177`) ve `sendNotificationCampaign` (`:242`)
aynı kişi tarafından çağrılabiliyor; `ALL_USERS` tek tıkla gidiyor.

### 5. `CLIENT_TYPE` hedeflemesi yanlış kitleye gidiyor

`notification-campaign-input.ts:26` `CampaignSegment` zaten
`clientType: z.enum(["WEB", "DESKTOP", "MOBILE"])` hedeflemesi sunuyor;
alıcılar `AppSession.clientType` üzerinden çözülüyor (`:123`).

A spec'inde belgelendiği gibi `AppSession.clientType` bugün pratikte hep `WEB`.
Yani "mobil kullanıcılara gönder" seçeneği **çalışan bir özellik gibi görünüyor
ama yanlış kitleye gidiyor**.

### 6. Zaman dilimi verisi yok

`UserSettings` (`schema.prisma:506`) `theme` ve `locale` tutuyor. Timezone
kolonu yok. Kullanıcının yerel saatini bilmenin tek dolaylı yolu
`AppSession.countryCode`.

### 7. Geri bildirim tarafı olgun

`Feedback` (`schema.prisma:648`): `publicNumber` (WSP-{n}), `rating`, `topic`,
`message`, `diagnostics` (Json), `status`, `roadmapItemId`, `statusChangedAt`,
ekler. `RoadmapItem` (`:695`), `RoadmapVote` (`:713`) tam.
`NotificationType.FEEDBACK` (`:40`) durum bildirimi için ayrılmış.

Eksik olan: kümeleme, tekrar tespiti, sürüm ilişkisi.

## Fazlar

| Faz    | Kapsam                                                                                                   | Bağımlılık |
| ------ | -------------------------------------------------------------------------------------------------------- | ---------- |
| **E1** | Gönderim güvenliği: `CampaignDelivery`, dondurulmuş alıcı listesi, idempotent yeniden deneme, onay akışı | B          |
| **E2** | Zamanlama (E1'in üstünde güvenli hale gelir) + teslimat raporu                                           | E1         |
| **E3** | Geri bildirim zekâsı: kümeleme, sürüm ilişkisi                                                           | B          |

E1 **mevcut hatayı kapattığı için** yeni özellik eklenmese bile tek başına
değerli. E3 kampanya tarafından bağımsız, paralel gidebilir.

---

## E1 — Gönderim güvenliği

### Model

```prisma
enum CampaignDeliveryStatus {
  PENDING
  SENT
  SKIPPED
  FAILED
}

enum CampaignSkipReason {
  FREQUENCY_CAP
  NOT_DELIVERABLE
  OPTED_OUT
}

/// Kampanya başına kişi başına tek satır. Gönderimin idempotent olmasını
/// sağlayan kayıt: liste dondurulduğunda yazılır, gönderim onu tüketir.
model CampaignDelivery {
  id         String                 @id @default(uuid())
  campaignId String
  userId     String
  status     CampaignDeliveryStatus @default(PENDING)
  skipReason CampaignSkipReason?
  error      String?                @db.VarChar(280)
  sentAt     DateTime?
  createdAt  DateTime               @default(now())

  campaign NotificationCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  user     User                 @relation("CampaignDeliveryUser", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([campaignId, userId])
  @@index([campaignId, status])
}
```

```prisma
model User {
  campaignDeliveries CampaignDelivery[] @relation("CampaignDeliveryUser")
}

model NotificationCampaign {
  deliveries   CampaignDelivery[]
  approvedById String?
  approvedAt   DateTime?
  approvedBy   User? @relation("NotificationCampaignApprover", fields: [approvedById], references: [id], onDelete: SetNull)
  /// Liste dondurulduğu an. Null ise kampanya henüz gönderime girmemiş.
  frozenAt     DateTime?
}
```

### Gönderim akışı — iki aşama

**Aşama 1: dondurma (freeze).** Kampanya gönderime girdiğinde alıcı listesi
**bir kez** çözülür ve `CampaignDelivery` satırları `PENDING` olarak yazılır.
`frozenAt` damgalanır. Frekans limitine takılanlar aynı anda `SKIPPED` +
`skipReason: FREQUENCY_CAP` olarak yazılır — düşürülmez, kaydedilir.

**Aşama 2: gönderim.** Döngü **yalnızca `PENDING` satırları** okur. Her
başarılı gönderim satırı `SENT` yapar. `Notification.dedupeKey` =
`campaign:{campaignId}:{userId}` yazılır — veritabanı tekilliği ikinci
savunma hattı olur.

**Karar: `getCampaignRecipientIds` gönderim anında bir daha çağrılmaz.**
Bugünkü davranışın tersi. Sonuç: önizlemede görülen kitle ile gönderilen kitle
aynı; gecikmiş veya yeniden denenmiş iş yeni kişilere yayılmaz.

**Karar: yeniden deneme `PENDING` üzerinden.** `FAILED` bir kampanya yeniden
çalıştırıldığında `SENT` satırlara dokunulmaz. Mevcut çift-gönderim hatası
bununla kapanır. `sentCount` artık sıfırlanmaz; `CampaignDelivery` sayımından
türetilir.

**Karar: `sentCount` / `failedCount` türetilmiş değer.** `NotificationCampaign`
üzerindeki sayaçlar `CampaignDelivery` sayımından yazılır, elle artırılmaz.
İki gerçek kaynağı olan sayaç er geç ayrışır.

### Onay akışı

`NotificationCampaignStatus`'a `PENDING_APPROVAL` eklenir.

Önizlenen alıcı sayısı **1000'i aşan** kampanyalar onay ister; onaylayan
`OWNER` veya `ADMIN` olmalı ve **oluşturan kişi olamaz**. Eşik altındakiler
doğrudan gönderilebilir — küçük ekipte her duyuru için ikinci imza akışı
öldürür.

**Karar: eşik alıcı sayısına bağlı, segment tipine değil.** `USER_IDS` ile
5000 kişi seçmek `ALL_USERS` kadar risklidir.

Yetki B'nin capability haritasından: `campaign.create` (`OWNER`, `ADMIN`),
`campaign.approve` (`OWNER`, `ADMIN`), `campaign.send` (`OWNER`, `ADMIN`).

### Frekans limiti

Bir kullanıcı 24 saatte en fazla 2 kampanya bildirimi alır. Sayım
`CampaignDelivery` üzerinden yapılır (`status: SENT`, son 24 saat) — dondurma
anında değerlendirilir ve aşanlar `SKIPPED` yazılır.

`MODERATION` tipi bildirimler limitten muaf; güvenlik uyarısı susturulamaz.

**Karar: atlanan alıcı silinmez, `SKIPPED` olarak kaydedilir.** Raporda
"hedeflenen 5000, gönderilen 4200, frekans limiti 800" okunur. İlk taslakta
atlananlar görünmez oluyordu ve rapor kampanyanın kapsamını yanlış gösteriyordu.

### Push kapsamı

Kampanya bugün push göndermiyor (§2). **v1 bunu değiştirmiyor** — kampanya
uygulama içi bildirim + socket olarak kalır.

Sebep: push eklemek teslimat semantiğini değiştirir (Expo ticket/receipt, bkz.
C3) ve E1'in asıl işi mevcut çift-gönderim hatasını kapatmak. Push eklenecekse
`CampaignDelivery` satırı üzerinden gider ve C3'ün `PushDeliveryAttempt`
tablosuyla `campaignId` üzerinden eşleşir — model şimdiden buna hazır.

### E1 bitti kanıtı

`FAILED` durumdaki bir kampanya yeniden gönderildiğinde daha önce bildirim
almış kullanıcılar **ikinci bildirim almıyor**. `CampaignDelivery` tablosunda
kampanya başına kişi başına tek satır var. Rapor "frekans limitine takılan"
sayısını ayrı gösteriyor.

---

## E2 — Zamanlama ve teslimat raporu

E1'in dondurulmuş listesi üzerine kurulur; onsuz güvenli değil.

**Zamanlama:** `apps/web/src/lib/outbox/service.ts` zaten kuyruk, kilitleme,
yeniden deneme ve drain metriği içeriyor. `OutboxJob.availableAt` zamanlamayı
doğrudan destekliyor.

Yeni iş türü `campaign.send`. Kampanya `scheduledAt` ile oluşturulduğunda
`availableAt = scheduledAt` olan job yazılır. **Liste zamanlama anında değil,
job çalıştığında dondurulur** — aksi halde bir hafta önceden planlanan kampanya
o haftanın yeni kullanıcılarını hiç görmez.

**Karar: yeni zamanlayıcı altyapısı yazılmaz.** Kuyruk çalışıyor, gözlemleniyor,
yeniden deneme mantığı test edilmiş. Cron eklemek ikinci bir hata kaynağı olur.

İptal: `CANCELLED` durumu drain sırasında kontrol edilir, job atlanır.

**Teslimat raporu** — `CampaignDelivery` üzerinden:

| Gösterge       | Kaynak                                                     |
| -------------- | ---------------------------------------------------------- |
| Hedeflenen     | `CampaignDelivery` toplam satır                            |
| Gönderilen     | `status: SENT`                                             |
| Frekans limiti | `status: SKIPPED`, `skipReason: FREQUENCY_CAP`             |
| Hata           | `status: FAILED` + `error`                                 |
| Açılma oranı   | `Notification.read = true` / `SENT`, `campaignId` filtreli |

### v1'den çıkarılanlar

**Sessiz saatler — v2.** `UserSettings.timeZone` kolonu yok (§6). Ülke kodundan
tahmin etmek yanlış saatte bildirim göndermeye açık ve doğrulaması zor. Timezone
kolonu bağımsız bir iş; geldiğinde sessiz saat `CampaignDelivery` üzerine
`SKIPPED`/erteleme olarak eklenir.

**Geri alma (recall) — kaldırıldı.** İlk taslak gönderilmiş kampanyanın
okunmamış bildirimlerini silmeyi öneriyordu. Üç sorun: (a) push cihaza
ulaştıysa geri alınamaz, arayüz yanıltıcı olur; (b) `Notification` silmek
açılma oranı paydasını bozar; (c) frekans limiti sayımı da bozulur — silinen
bildirim "hiç gönderilmemiş" sayılır ve kullanıcı fazladan bildirim alır.

Yerine: **gönderim öncesi iptal**. `DRAFT`, `PENDING_APPROVAL` ve zamanlanmış
kampanyalar `CANCELLED` yapılabilir. Gönderim başladıktan sonra durdurma
`PENDING` satırların işlenmesini keser — gönderilmişler gönderilmiş kalır.

**A/B test — kapsam dışı.** Varyant dağıtımı, anlamlılık ve kazanan seçimi ayrı
bir iş. C2'nin feature flag altyapısı geldiğinde daha ucuza gelir.

---

## E3 — Geri bildirim zekâsı

**Kümeleme:** `topic` + normalize edilmiş metin benzerliği ile aday gruplar.
Normalize: küçük harf, noktalama temizliği, Türkçe/İngilizce stop word
çıkarımı; benzerlik trigram örtüşmesi.

**Karar: kümeleme öneri üretir, otomatik birleştirmez.** Operatör onaylar.
Yanlış birleştirilmiş iki farklı şikâyet, ayrı duran iki tekrardan daha
zararlı.

**Sürüm ilişkisi:** `Feedback.diagnostics` zaten Json ve mobil tanılama
bilgisini tutuyor. A'nın `appVersion` sözleşmesi geldiğinde geri bildirim
sürümle etiketlenir. "Bu hata 0.8.15'te başladı" böyle cevaplanır.

**Yol haritası bağı:** mevcut `roadmapItemId` kullanılır. Bir kümeyi yol
haritası maddesine bağlamak kümedeki tüm geri bildirimleri bağlar.

**Durum bildirimi:** `Feedback.status` değiştiğinde gönderene
`NotificationType.FEEDBACK` gider — mevcut desen korunur.

---

## Test planı

**E1 (regresyon testleri önce):**

1. **Çift gönderim yok:** kısmen gönderilmiş `FAILED` kampanya yeniden
   çalıştırıldığında `SENT` satırlar atlanmalı; o kullanıcılar ikinci
   `Notification` almamalı. _(Bugünkü kodda bu test kırmızı.)_
2. **Liste dondurulmuş:** dondurma ile gönderim arasında yeni kullanıcı
   eklendiğinde o kullanıcı kampanyayı almamalı.
3. **`dedupeKey`:** aynı (kampanya, kullanıcı) için ikinci `Notification`
   oluşturma denemesi veritabanı tekilliğine takılmalı.
4. **Sayaç türetilmiş:** `sentCount` `CampaignDelivery` sayımıyla eşleşmeli;
   yeniden gönderim sonrası sıfırlanmamalı.
5. **Onay eşiği:** 1001 alıcı `PENDING_APPROVAL`; 999 doğrudan gönderilebilir.
6. **Onaylayan ≠ oluşturan:** kendi kampanyasını onaylama reddedilmeli.
7. **Frekans limiti:** 24 saatte 2 kampanya almış kullanıcı üçüncüsünde
   `SKIPPED` + `FREQUENCY_CAP` yazılmalı; `MODERATION` bildirimi etkilenmemeli.
8. **Yetki:** `ANALYST` kampanya uçlarına 403.

**E2:**

9. **Zamanlama:** `scheduledAt` gelene kadar gönderilmemeli; zamanı gelince
   drain almalı.
10. **Dondurma anı:** liste job çalıştığında dondurulmalı, oluşturma anında
    değil (arada eklenen kullanıcı kampanyayı almalı).
11. **İptal:** `CANCELLED` kampanyanın job'ı drain'de atlanmalı.
12. **Açılma oranı:** payda `SENT` satır sayısı olmalı, hedeflenen değil.

**E3:**

13. **Kümeleme:** aynı konudan iki benzer metin aday grup üretmeli; farklı
    `topic` asla birleşmemeli.
14. **Otomatik değil:** onaysız küme geri bildirimleri birleştirmemeli.

## Riskler

| Risk                                           | Etki                                 | Karşılık                                                                                                                                                             |
| ---------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mevcut çift-gönderim hatası E1 gecikirse sürer | Kullanıcı tekrarlı bildirim alır     | E1 yeni özellik değil hata düzeltmesi; ilk sırada                                                                                                                    |
| A gecikirse `CLIENT_TYPE` yanlış kitleye gider | Kampanya hedefi şaşar                | Hedefleme ekranında `CLIENT_TYPE` seçeneği A tamamlanana kadar uyarı rozetiyle gösterilir                                                                            |
| Drain durursa zamanlı kampanya gitmez          | Sessiz başarısızlık                  | Mevcut `outbox_drain` metriği izlenir; geciken job kampanya listesinde "gecikmiş" rozeti alır                                                                        |
| `CampaignDelivery` büyük kampanyalarda şişer   | Satır sayısı                         | Kampanya başına alıcı sayısı kadar satır; `ALL_USERS` bile bugünkü kullanıcı sayısında yönetilebilir. Kapanmış kampanyaların satırları 90 gün sonra özete indirgenir |
| Frekans limiti meşru duyuruyu keser            | Kullanıcı bilgilendirilmez           | Limit yalnızca kampanyalara; atlananlar raporda sayıyla görünür                                                                                                      |
| Kümeleme yanlış birleştirir                    | Farklı sorunlar tek maddede kaybolur | Otomatik birleştirme yok; test 14 sabitler                                                                                                                           |

## Sonraki adım

Onaydan sonra `writing-plans`. E1 ayrı plan alır ve önce koşar — mevcut bir
hatayı kapatıyor. Kod değişikliği plan onayından önce başlamaz.
