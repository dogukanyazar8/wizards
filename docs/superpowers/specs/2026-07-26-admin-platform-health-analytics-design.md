# Platform Sağlık ve Analitik (Alt Proje C)

**Tarih:** 2026-07-26 · **Revizyon:** 2026-07-27 (spec-correction turu)
**Dal:** uat
**Durum:** Tasarım yazıldı, onay bekliyor
**Bağımlılık:** faza göre değişir — C3 bağımsız, C1/C2 B2'ye, C4 hem A'ya hem
B2'ye bağlı. Ayrıntı: Fazlar tablosu.

## Bağlam

Altı alt projeden üçüncüsü. Kullanıcının panelden asıl beklentisi burada
karşılanıyor: "her platformu ayrı ayrı gözlemleyip kontrol edebileceğimiz"
bir yüz.

**Revizyon notu.** İlk taslak dört ayrı sistemi (sağlık ingest, feature flag,
push telemetrisi, analitik) tek fazda topluyordu ve iki hatalı varsayım
içeriyordu: push sağlayıcısının FCM olduğu, ve funnel'ın her adımının
platforma göre kırılabileceği. Her ikisi de kodda yanlış çıktı. Spec dört
bağımsız teslim edilebilir faza bölündü; her fazın kendi bitti kanıtı var ve
biri diğerini beklemiyor.

Hedef kullanıcı: **platform operasyon ekibi**.

## Doğrulanmış mevcut durum

**1. İstemci sağlık verisi hiç sunucuya ulaşmıyor.**

`apps/mobile/src/performance/mobile-performance-metrics.ts` ölçüm altyapısı
içeriyor: `MobilePerformanceSurface` (`:1`), `MobilePerformanceMetric` (`:9`),
`recordMobilePerformanceMetric` (`:40`),
`getMobilePerformanceMetricsSnapshot` (`:49`).

`recordMobilePerformanceMetric` tüm mobil kodda **tek yerden** çağrılıyor:
`apps/mobile/src/app/components/mobile-startup-performance-marker.tsx:13`.
`getMobilePerformanceMetricsSnapshot` **hiçbir yerden** çağrılmıyor. Ölçüm
bellekte birikip uygulama kapanınca kayboluyor.

**2. Feature flag altyapısı yok.**
`featureFlag` / `feature_flag` / `FeatureFlag` desenleri `apps/web/src`,
`apps/mobile/src` ve `packages` altında hiç geçmiyor. Şemada karşılığı yok.

**3. Push sağlayıcısı Expo, FCM değil.**

`apps/web/src/lib/mobile/push-sender.ts:5` —
`EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send"`.
Toplu gönderim `EXPO_PUSH_BATCH_SIZE = 100`, yeniden deneme gecikmesi
`EXPO_PUSH_RETRY_DELAY_MS = 500`.

Expo iki aşamalı bir protokol kullanır ve bu ayrım metriğin şeklini belirler:

- **Ticket** — gönderim isteğinin anında dönen yanıtı. `ok` veya `error`.
  "Expo isteği kabul etti" demek, "cihaza ulaştı" demek **değil**.
- **Receipt** — ticket kimliğiyle sonradan sorgulanan gerçek teslim sonucu.
  Ayrı bir uç, ayrı bir zamanlama, ayrı hata kodları
  (`DeviceNotRegistered` gibi).

iOS token kaydı destekleniyor: `apps/web/src/lib/mobile/push-notifications.test.ts:109`
`platform: "ios"` yolunu test ediyor. `MobilePushToken.platform`
(`schema.prisma:1255`) `VarChar(16)`.

**4. Kampanya gönderimi push'u hiç çağırmıyor.**
`apps/web/src/lib/admin/notification-campaigns.ts:242` `sendNotificationCampaign`
yalnızca `prisma.notification.create` ve socket `notification:new` emit'i
yapıyor. Push gönderimi yok. Yani "kampanya push teslim oranı" bugün
ölçülecek bir şey değil — önce kampanyanın push göndermesi gerekir (E'nin
kararı).

**5. Funnel'ın ilk iki adımı platforma göre kırılamaz.**
`User` modeli (`schema.prisma:277`) `createdAt`, `emailVerified`,
`emailVerifiedAt` tutuyor; **platform bilgisi yok**. Kayıt ve e-posta
doğrulama olayları hangi istemciden geldiğini kaydetmiyor.

A bunu çözmez — A oturum ve günlük metrik boyutunu ekler, kayıt olayını
değil.

**6. Analitik tek boyutlu.**
`apps/web/src/lib/admin/dashboard.ts:136` `buildDailyMetricSeries`
`UserDailyMetric` satırlarından zaman serisi üretiyor. Kohort, retention ve
funnel hesaplayan hiçbir kod yok.

## Fazlar

Dört faz. Her biri bağımsız teslim edilebilir, kendi bitti kanıtı var.

| Faz    | Kapsam                                              | Bağımlılık | Neden ayrı                                                          |
| ------ | --------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| **C1** | İstemci sağlık olayları (ingest + ekran)            | B          | Kendi tablosu, kendi hacim/saklama profili                          |
| **C2** | Feature flag + kill-switch                          | B          | Veri toplama değil, kontrol düzlemi. Diğerlerinden bağımsız değerli |
| **C3** | Push telemetrisi (Expo ticket, sonra receipt)       | —          | Expo protokolüne bağlı; admin panelinden bağımsız çalışır           |
| **C4** | Analitik: platform serileri, kohort, sınırlı funnel | A, B       | A'nın boyutu olmadan anlamsız                                       |

---

## C1 — İstemci sağlık olayları

### Model

```prisma
enum ClientHealthKind {
  STARTUP
  SCREEN_LOAD
  CRASH
  ERROR
  API_LATENCY
}

model ClientHealthEvent {
  id         String              @id @default(uuid())
  userId     String?
  clientType AnalyticsClientType @default(UNKNOWN)
  appVersion String?             @db.VarChar(32)
  os         String?             @db.VarChar(32)
  kind       ClientHealthKind
  surface    String?             @db.VarChar(64)
  valueMs    Int?
  context    Json?
  createdAt  DateTime            @default(now())

  user User? @relation("ClientHealthEventUser", fields: [userId], references: [id], onDelete: SetNull)

  @@index([kind, createdAt])
  @@index([clientType, kind, createdAt])
  @@index([appVersion, kind, createdAt])
}
```

**`User` modeline eklenecek ters ilişki** (Prisma her ilişkinin iki tarafını
da ister — ilk taslakta eksikti, bu haliyle doğrudan uygulanabilir):

```prisma
model User {
  clientHealthEvents ClientHealthEvent[] @relation("ClientHealthEventUser")
}
```

**Karar: ayrı tablo, `UserDailyMetric`'e eklenmiyor.** Hacim, şekil ve saklama
süresi farklı. Sağlık olayları seyrek ama patlamalı — bir crash dalgası
dakikada binlerce satır yazabilir. Günlük metrikler kullanıcı başına günde bir
satır. İkisini birleştirmek günlük metrik sorgularını crash hacmine bağımlı
kılar.

**Karar: `userId` opsiyonel ve `SetNull`.** Crash oturum açılmadan da gelebilir;
kullanıcı silinince olay kimliksizleşir ama kaybolmaz.

**Saklama:** ham olaylar 30 gün. Sonrası günlük özete indirgenir
(`kind` + `clientType` + `appVersion` başına sayı, p50, p95). Temizlik mevcut
`OutboxJob` kuyruğuna günlük iş olarak yazılır — yeni zamanlayıcı gerekmez.

### Taşıma

Yeni uç: `POST /api/v1/telemetry/client-health`. Batch gövde, en fazla 50 olay,
en fazla 32 KB.

Mobil: `getMobilePerformanceMetricsSnapshot()` çıktısı uygulama arka plana
geçtiğinde ve 60 saniyede bir flush edilir. Gönderim başarısızsa olaylar
bellekte kalır; kuyruk 200 olayda kapaklanır (en eskiler düşer).

Web/desktop: `window.onerror` ve `unhandledrejection` yakalanıp `ERROR` olayı
üretilir.

**Karar: `clientType` ve `appVersion` gövdeye yazılmaz.** Sunucu A'nın kurduğu
`getAnalyticsClientInfo(request.headers)` üzerinden okur. İstemcinin kendi
platformunu gövdede beyan etmesi A'nın başlık sözleşmesini ikinci bir gerçek
kaynağıyla çatallar.

Hız sınırı: mevcut `enforceApiRateLimit`
(`apps/web/src/lib/api-rate-limit.ts:190`). Crash dalgası paneli düşürmemeli.

### Ekran

`/admin/health` — platform başına kart: aktif oturum, açılış süresi p50/p95,
crash oranı (crash / oturum), hata sıklığı, sürüm dağılımı.

### C1 bitti kanıtı

Üç platform için de sıfırdan farklı açılış süresi p95 görünüyor. Mobil
uygulama arka plana alındığında `ClientHealthEvent` satırı yazılıyor.

---

## C2 — Feature flag ve kill-switch

```prisma
model FeatureFlag {
  key            String                @id @db.VarChar(64)
  description    String?               @db.VarChar(280)
  enabled        Boolean               @default(false)
  /// Boş ise tüm platformlar. Doluysa yalnızca listedekiler.
  clientTypes    AnalyticsClientType[]
  /// 0-100. userId hash'ine göre stabil dağıtım.
  rolloutPercent Int                   @default(100)
  updatedById    String?
  updatedAt      DateTime              @updatedAt
  createdAt      DateTime              @default(now())

  updatedBy User? @relation("FeatureFlagUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
}
```

```prisma
model User {
  featureFlagUpdates FeatureFlag[] @relation("FeatureFlagUpdatedBy")
}
```

**Karar: sunucu tarafında değerlendirilir, istemci SDK'sı yok.** Bayrak durumu
oturum bootstrap yanıtına eklenir; istemci sonucu okur. Küçük ekip için en az
hareketli parça, mantık tek yerde.

**Karar: yüzde dağıtımı `userId` hash'ine göre stabil.** Aynı kullanıcı her
istekte aynı sonucu alır; yoksa özellik kullanıcının gözünde titrer.

**Kill-switch:** `enabled = false` anında etkili. Bootstrap yanıtı
önbelleklenmez; socket üzerinden `feature-flags:changed` yayınlanır, açık
istemciler yeniden okur.

Değişiklik yazma yetkisi B'nin capability haritasında `flag.write`
(`OWNER`, `ADMIN`). Her değişiklik `writeAdminAuditLog` ile kaydedilir:
aktör, anahtar, eski/yeni değer, neden.

### C2 bitti kanıtı

Bir bayrak kapatıldığında açık mobil istemci **yeniden başlatılmadan**
özelliği kaybediyor. `AdminAuditLog`'da eski ve yeni değer görünüyor.

---

## C3 — Push telemetrisi (Expo)

Bu faz Expo'nun iki aşamalı protokolünü izler. **v1 yalnızca ticket
aşamasını ölçer.**

```prisma
enum PushAttemptStage {
  TICKET
  RECEIPT
}

model PushDeliveryAttempt {
  id             String           @id @default(uuid())
  userId         String?
  campaignId     String?
  notificationId String?
  platform       String           @db.VarChar(16)
  stage          PushAttemptStage @default(TICKET)
  /// Expo ticket kimliği; receipt sorgusu bununla eşlenir.
  ticketId       String?          @db.VarChar(64)
  success        Boolean
  errorCode      String?          @db.VarChar(64)
  createdAt      DateTime         @default(now())

  user     User?                 @relation("PushDeliveryAttemptUser", fields: [userId], references: [id], onDelete: SetNull)
  campaign NotificationCampaign? @relation("PushDeliveryAttemptCampaign", fields: [campaignId], references: [id], onDelete: SetNull)

  @@index([campaignId, success])
  @@index([platform, stage, createdAt])
  @@index([errorCode, createdAt])
  @@index([ticketId])
}
```

```prisma
model User {
  pushDeliveryAttempts PushDeliveryAttempt[] @relation("PushDeliveryAttemptUser")
}

model NotificationCampaign {
  pushDeliveryAttempts PushDeliveryAttempt[] @relation("PushDeliveryAttemptCampaign")
}
```

**Karar: v1 metriği "Expo kabul etti / reddetti".**
`push-sender.ts` Expo'ya gönderim yaptığında dönen ticket sonucu satır olarak
yazılır. Ekranda gösterilen etiket **"Expo kabul oranı"** — "cihaza teslim
oranı" **değil**. İkisini karıştırmak paneli yanlış güven verir hale getirir.

**Receipt aşaması v2.** Gerçek teslim için ticket kimlikleri saklanıp Expo'nun
receipt ucundan sonradan sorgulanmalı: ayrı bir kuyruk işi, ayrı hata kodu
kümesi, ayrı zamanlama. `stage` ve `ticketId` alanları şimdiden konuyor ki v2
migration gerektirmesin.

**Yan kazanç:** `DeviceNotRegistered` hata kodu geçersiz token'ları işaret
eder; `MobilePushToken` temizliği bu satırlardan beslenir.

**Kampanya kapsamı:** kampanya gönderimi bugün push çağırmıyor
(`notification-campaigns.ts:242`). `campaignId` alanı, E kampanyalara push
eklemeye karar verirse dolar; almazsa `null` kalır ve tablo yalnızca mention/DM
gibi mevcut push yollarını ölçer. C3 bu kararı beklemez.

### C3 bitti kanıtı

Bir mention push'undan sonra `PushDeliveryAttempt` satırı `stage: TICKET` ile
yazılıyor; panelde platform başına Expo kabul oranı görünüyor. Geçersiz token
`DeviceNotRegistered` ile işaretleniyor.

---

## C4 — Analitik

### Platform serileri

`buildDailyMetricSeries` (`dashboard.ts:136`) `clientType` parametresi alacak
şekilde genişletilir. Filtre yokken tüm platformlar toplanır.

**A'dan devralınan kesim kuralı:** `UNKNOWN` ayrı seri olarak çizilir,
`WEB`'e katlanmaz. `AppSession` tarafında `attributionVerified = false`
satırlar da `UNKNOWN` kovasına düşer. Grafik altında "A migration'ından önceki
veri platformsuz kaydedildi" notu görünür.

### Kohort / retention

`User.createdAt` haftalık kohort, `UserDailyMetric` varlığı aktiflik ölçütü.
D1 / D7 / D30. **Platform kırılımı mümkün** — aktiflik satırları A'dan sonra
platform taşır.

### Funnel — kısıtlı

Adımlar: kayıt → e-posta doğrulama → ilk oturum → ilk mesaj.

| Adım              | Platform kırılımı | Sebep                                                                  |
| ----------------- | ----------------- | ---------------------------------------------------------------------- |
| Kayıt             | **Hayır**         | `User` modelinde platform kolonu yok                                   |
| E-posta doğrulama | **Hayır**         | Aynı                                                                   |
| İlk oturum        | Evet              | `AppSession.clientType` (A sonrası, `attributionVerified` filtresiyle) |
| İlk mesaj         | Evet              | `UserDailyMetric.clientType` (A sonrası)                               |

**Karar: eksik olan uydurulmaz.** İlk iki adım "tüm platformlar" olarak
gösterilir ve arayüzde bunun bir kısıt olduğu yazılır. Kayıt olayına platform
eklemek `User` modeline yeni kolon + kayıt akışının değişmesi demek — ayrı bir
iş, C4'ün kapsamı değil. İhtiyaç doğarsa kendi spec'ini alır.

Bu kısıt ilk taslakta gözden kaçmıştı; "her adım platforma göre kırılabilir"
ifadesi veriyle desteklenmiyordu.

### C4 bitti kanıtı

`/admin/analytics` platform filtresi `MOBILE` seçildiğinde mesaj serisi toplam
seriden farklı çıkıyor (A'nın çalıştığının kanıtı). Funnel'ın ilk iki adımı
"platform kırılımı yok" etiketiyle görünüyor.

---

## Kapsam dışı (tüm fazlar)

- Öneri motoru ("7 gündür moderatör yanıtı yok" gibi). Sinyaller C'de
  toplanıyor; öneri üretimi ayrı iş.
- A/B test altyapısı. C2 bayrak açar/kapatır, varyant dağıtmaz.
- Sunucu ve kanal seviyesinde metrik kırılımı.
- Gerçek zamanlı alarm/bildirim (F).
- Expo receipt korelasyonu (C3 v2).
- Kayıt olayına platform eklemek (ayrı spec).

## Test planı

**C1:** batch sınırları (50 olay / 32 KB) aşımında 400; gövdedeki `clientType`
yok sayılıp başlıktan okunmalı; mobil flush arka planda kuyruğu boşaltmalı,
hata durumunda korumalı, 200 olayda en eskiler düşmeli; crash oranı paydası
`AppSession` sayısı olmalı ve sıfır oturumda bölme hatası değil "veri yok"
dönmeli; 30 günden eski ham olaylar silinip özet kalmalı.

**C2:** aynı `userId` + aynı `rolloutPercent` ardışık 100 değerlendirmede aynı
sonucu vermeli; `enabled=false` sonrası bootstrap kapalı döndürmeli ve socket
olayı yayınlanmalı; her değişiklik eski/yeni değerle `AdminAuditLog` yazmalı;
`ANALYST` bayrak yazamamalı (B capability testi).

**C3:** Expo `error` ticket'ı `success=false` + `errorCode` yazmalı;
`DeviceNotRegistered` token temizliğini tetiklemeli; ekran etiketi "Expo kabul
oranı" olmalı — "teslim" kelimesi geçmemeli (metin sözleşme testi); `ticketId`
saklanmalı (v2 receipt için).

**C4:** `UNKNOWN` platform serisi ayrı dizi dönmeli, `WEB`'e eklenmemeli;
`attributionVerified=false` oturumlar `UNKNOWN`'a düşmeli; kohort D1/D7 sabit
veri kümesinde elle hesaplananla eşleşmeli; funnel'ın ilk iki adımı platform
filtresi uygulandığında da toplam değeri döndürmeli (filtre sessizce yanlış
sayı üretmemeli).

## Riskler

| Risk                                   | Etki                     | Karşılık                                                               |
| -------------------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| "Expo kabul" ile "teslim" karıştırılır | Panel yanlış güven verir | Etiket sözleşme testi; receipt v2'ye açıkça ayrıldı                    |
| Crash dalgası ingest'i boğar           | Panel yavaşlar           | Hız sınırı + batch sınırı + istemcide 200 olay kapağı                  |
| Sağlık tablosu şişer                   | DB maliyeti              | 30 gün ham + özet indirgeme, OutboxJob temizliği                       |
| Funnel kısıtı gözden kaçar             | Yanlış karar             | Arayüzde etiket + test: filtre uygulandığında ilk iki adım değişmemeli |
| A gecikirse C4 anlamsız                | Ekranlar yanıltıcı       | C1, C2, C3 A'yı beklemez; yalnızca C4 bağımlı                          |

## Sonraki adım

Onaydan sonra `writing-plans`. Dört faz ayrı plan alır. Kod değişikliği plan
onayından önce başlamaz.
