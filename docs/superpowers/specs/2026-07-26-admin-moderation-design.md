# Moderasyon Kuyruğu ve Vaka Dosyası (Alt Proje D)

**Tarih:** 2026-07-26
**Dal:** uat
**Durum:** Tasarım yazıldı, onay bekliyor
**Bağımlılık:** B1 (capability haritası), B2 (rota kabuğu). A'ya bağımlı değil.
**Revizyon:** 2026-07-27 (spec-correction turu) — delil sözleşmesi boşluğu ve
cascade silme hatası nedeniyle D1/D2 olarak ikiye bölündü.

## Bağlam

Altı alt projeden dördüncüsü ve en büyük işlevsel boşluğu kapatanı.

Bugün kullanıcılar rapor gönderebiliyor ama bu raporlar hiçbir yerde
görünmüyor. Yani ürün kullanıcıya "bildirdin" diyor, karşılığında hiçbir şey
olmuyor. Bu bir eksik özellik değil, verilmiş ve tutulmayan bir söz.

Hedef kullanıcı: **platform operasyon ekibi**.

## Problem

### Doğrulanmış mevcut durum

**1. Raporlar yazılıyor, hiç okunmuyor.**

`packages/db/prisma/schema.prisma:612` — `UserReport`: `reporterId`,
`subjectId`, `reason` (`UserReportReason`: `HARASSMENT` / `SPAM` /
`INAPPROPRIATE` / `IMPERSONATION` / `OTHER`), `details` (`VarChar(500)`),
`createdAt`. İndeksler `[subjectId, createdAt]` ve `[reporterId, createdAt]`.

Yok olanlar: `status`, `assigneeId`, `resolution`, delil bağı (hangi mesaj?),
itiraz.

Tüm kod tabanında tek yazım noktası:
`apps/web/src/lib/social/mobile-user-profile-service.ts:409` — `create` çağrısı,
`{ reportId }` döndürüyor. **Tek bir okuma yolu yok.** Ne admin API'si, ne
panel bölümü, ne sorgu.

**2. Ban var ama vakadan kopuk.**

`apps/web/src/lib/admin/management.ts:392` — `setAdminUserBanState` çalışıyor:
kendini banlamayı engelliyor, sebebi 500 karaktere kırpıyor, transaction
içinde `User` güncelliyor (`bannedAt`, `bannedReason`, `isBanned`,
`sessionsRevokedAfter`, `status: OFFLINE`) ve `Session` kayıtlarını siliyor.

Ama bu işlem bir rapora, bir delile veya bir karara bağlanmıyor. "Bu kullanıcı
neden banlandı" sorusunun cevabı serbest metin bir `reason` alanı.

`ServerBan` (`schema.prisma:847`) ayrı bir şey: sunucu kapsamlı, `bannedById`
tutuyor, platform banı ile ilişkisi yok.

**3. Audit'te IP kolonu var, hiç yazılmıyor.**

`packages/db/prisma/schema.prisma:391` — `AdminAuditLog` alanları arasında
`ipHash` **var**.

`apps/web/src/lib/admin/access.ts:184` — `writeAdminAuditLog` yalnızca
`userAgentHash` yazıyor (`:197`). `ipHash` hiç doldurulmuyor. Kolon ölü.

`hashAnalyticsValue` (`apps/web/src/lib/analytics/client-info.ts:49`) ve
`getIpAddress` (`:68`) zaten mevcut — eksik olan yalnızca çağrı.

**4. `AuditLog` ile `AdminAuditLog` karıştırılmamalı.**
`schema.prisma:1360` `AuditLog` sunucu kapsamlı (`serverId` zorunlu), topluluk
moderasyonu için. `AdminAuditLog` (`:391`) platform kapsamlı. D ikincisini
kullanır.

**5. Rapor sözleşmesi delil taşımıyor — ne bugün, ne yeni raporlarda.**

`packages/types/src/mobile-social.ts:637` — `MobileUserReportRequestSchema`
`.strict()` ve yalnızca iki alan kabul ediyor:

```ts
{ details: string | null (max 500), reason: "harassment" | "spam" | ... }
```

Ne `messageId`, ne `dmMessageId`, ne `attachmentId`, ne kanal bağlamı.
`.strict()` olduğu için istemci ek alan gönderse doğrulamadan geçmez.

Yani sorun geçmiş raporlarla sınırlı değil: **bugün gönderilen yeni raporlar
da delilsiz.** Rapor, "bu kullanıcıyı şu sebeple bildiriyorum" demekten
ibaret — profil raporu, içerik raporu değil.

Bu, ilk taslakta gözden kaçmıştı: spec delil snapshot'ı tasarlıyordu ama
delilin nereden geleceğini hiç söylemiyordu.

## Fazlar

Delil sözleşmesi olmadığı için D ikiye bölünür.

| Faz    | Kapsam                                                                                     | Ön koşul              |
| ------ | ------------------------------------------------------------------------------------------ | --------------------- |
| **D1** | Profil-raporu kuyruğu: vaka modeli, gruplama, üstlenme, aksiyon, audit `ipHash` düzeltmesi | B (capability)        |
| **D2** | İçerik raporu: rapor sözleşmesi genişletmesi, delil snapshot'ı, itiraz                     | D1 + istemci deploy'u |

**D1 delil olmadan da tam işlevli.** Bugün ürünün ürettiği rapor türü
profil raporu; kuyruk, üstlenme ve aksiyon o rapor için eksiksiz çalışır.
Vaka dosyası "raporlar + operatör notları + alınan aksiyonlar" zaman
çizelgesini gösterir; delil kartları D2'de eklenir.

**D2 ön koşulu bir istemci sözleşmesi değişikliği:**

```ts
// packages/types/src/mobile-social.ts — .strict() korunur, alanlar eklenir
export const MobileUserReportRequestSchema = z
  .object({
    details: z.string().trim().max(500).nullable().optional(),
    reason: MobileUserReportReasonSchema,
    // D2 — hepsi opsiyonel: profil raporu bunlarsız gelmeye devam eder
    attachmentId: MobileBoundedIdSchema.optional(),
    dmMessageId: MobileBoundedIdSchema.optional(),
    messageId: MobileBoundedIdSchema.optional(),
  })
  .strict();
```

Sunucu, gönderilen kimliğin **raporcunun gerçekten görebildiği** bir mesaja
ait olduğunu doğrular; aksi halde rapor uç noktası, kullanıcının erişemediği
mesajların içeriğini snapshot yoluyla sızdıran bir okuma aracına dönüşür.
Doğrulama başarısızsa alan yok sayılır, rapor yine kaydedilir.

Snapshot yalnızca doğrulama geçtiğinde yazılır.

## Hedefler

**D1:**

1. Her rapor bir vakaya düşer ve bir operatör tarafından görülür.
2. Vaka dosyası tek zaman çizelgesinde: raporlar, operatör notları, alınan
   aksiyonlar, durum değişiklikleri.
3. Her moderasyon aksiyonu audit'e IP ve cihaz bağlamıyla yazılır.
4. Raporu gönderen kullanıcı sonucu öğrenir.
5. Konu hesabı silinse bile vaka kaydı ve kararı okunabilir kalır.

**D2:**

6. Rapor, bildirilen mesajı/DM'i/eki taşır.
7. Delil, kaynak mesaj silinse bile 180 gün korunur.
8. İtiraz vakanın zaman çizelgesine düşer.

## Kapsam dışı

- **AutoMod kuralları.** Bilinçli erteleme: otomatik kuralın ürettiği
  "inceleme kuyruğuna at" sonucunu koyacak kuyruk henüz yok. Önce kuyruk,
  sonra kural. AutoMod kendi spec'ini alır.
- Sunucu sahiplerine moderatör yetkisi devri. Panel platform ekibi içindir.
- Mesaj içeriği üzerinde otomatik sınıflandırma / ML.
- Mobil ve desktop moderasyon yüzeyleri (F).
- Web istemcisinden içerik raporu. D2 mobil sözleşmesini genişletir; web
  raporlama akışı bugün yok ve bu spec onu eklemiyor.

## Tasarım

Aşağıdaki model D1 ve D2'yi birlikte tanımlar; D1'de `ModerationEvidence`
tablosu oluşturulur ama boş kalır.

### 1. Veri modeli

```prisma
enum ModerationCaseStatus {
  OPEN
  IN_REVIEW
  ACTIONED
  DISMISSED
  APPEALED
  CLOSED
}

enum ModerationCasePriority {
  LOW
  NORMAL
  HIGH
  URGENT
}

enum ModerationEventKind {
  REPORT_ADDED
  NOTE
  STATUS_CHANGED
  ASSIGNED
  ACTION_TAKEN
  APPEAL_OPENED
  APPEAL_RESOLVED
}

model ModerationCase {
  id           String                 @id @default(uuid())
  publicNumber Int                    @unique @default(autoincrement())
  subjectId    String?
  /// Konu hesabı silinse bile vakanın kime ait olduğu okunabilir kalsın diye
  /// karar anındaki kullanıcı adının kopyası. PII değil: zaten herkese açık.
  subjectHandle String                @db.VarChar(64)
  status       ModerationCaseStatus   @default(OPEN)
  priority     ModerationCasePriority @default(NORMAL)
  assigneeId   String?
  reportCount  Int                    @default(0)
  summary      String?                @db.VarChar(280)
  resolution   String?                @db.VarChar(1000)
  openedAt     DateTime               @default(now())
  firstSeenAt  DateTime?
  resolvedAt   DateTime?
  /// Delil snapshot'larının silineceği an. Vaka kaydı ve kararı kalır.
  evidencePurgeAt DateTime?
  updatedAt    DateTime               @updatedAt

  subject  User? @relation("ModerationCaseSubject", fields: [subjectId], references: [id], onDelete: SetNull)
  assignee User? @relation("ModerationCaseAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)

  reports  UserReport[]
  events   ModerationCaseEvent[]
  evidence ModerationEvidence[]

  @@index([status, priority, openedAt])
  @@index([assigneeId, status])
  @@index([subjectId, status])
  @@index([evidencePurgeAt])
}

model ModerationCaseEvent {
  id        String              @id @default(uuid())
  caseId    String
  actorId   String?
  kind      ModerationEventKind
  body      String?             @db.VarChar(1000)
  metadata  Json?
  createdAt DateTime            @default(now())

  case  ModerationCase @relation(fields: [caseId], references: [id], onDelete: Cascade)
  actor User?          @relation(fields: [actorId], references: [id], onDelete: SetNull)

  @@index([caseId, createdAt])
}

model ModerationEvidence {
  id       String @id @default(uuid())
  caseId   String
  reportId String?
  /// Kaynak kimlikleri yalnızca izlenebilirlik için tutulur; FK değil.
  /// Kaynak satır silindiğinde bu alanlar sarkar ve sarkması istenir —
  /// kararın dayanağı `snapshot`, kaynak satır değil.
  messageId    String?
  dmMessageId  String?
  attachmentId String?
  /// Rapor anındaki içerik kopyası. Kaynak mesaj silinse de vaka okunabilir kalır.
  snapshot   Json
  capturedAt DateTime @default(now())

  case   ModerationCase @relation(fields: [caseId], references: [id], onDelete: Cascade)
  report UserReport?    @relation(fields: [reportId], references: [id], onDelete: SetNull)

  @@index([caseId, capturedAt])
  @@index([reportId])
}
```

`UserReport` modeline iki ilişki eklenir:

```prisma
model UserReport {
  // mevcut alanlar korunur
  caseId   String?
  case     ModerationCase?      @relation(fields: [caseId], references: [id], onDelete: SetNull)
  evidence ModerationEvidence[]

  @@index([caseId])
}
```

**Karar: `messageId` / `dmMessageId` / `attachmentId` foreign key değil.**
FK olsalardı `Cascade` delili silerdi, `Restrict` kullanıcının kendi mesajını
silmesini engellerdi, `SetNull` ise zaten şu anki davranışı verirdi ama
şemaya gereksiz kısıt eklerdi. Bu alanlar birer iz; kararın dayanağı
`snapshot`.

**Karar: `publicNumber` serial, `Feedback` deseniyle aynı.**
`Feedback.publicNumber` (`schema.prisma:648`) zaten `WSP-{n}` olarak
gösteriliyor. Vakalar `MOD-{n}` olur. Sebep aynı: operatörler birbirine
konuşurken uuid okuyamaz.

**Karar: `subjectId` cascade değil `SetNull`.**
İlk taslak `onDelete: Cascade` diyordu ve bu 180 günlük delil saklama hedefiyle
doğrudan çelişiyordu: konu hesabı silinince vaka, olayları ve delili de
siliniyordu. Yani hakkında karar verilen kişi hesabını kapatarak kaydı yok
edebiliyordu. `SetNull` + `subjectHandle` kopyası vakayı ayakta tutar.

Aynı gerekçeyle `ModerationCaseEvent.actorId` ve `assigneeId` de `SetNull` —
ekipten ayrılan bir operatörün geçmiş kararları silinmemeli.

**Karar: silme politikası iki katmanlı.**
`evidencePurgeAt` dolduğunda **yalnızca `ModerationEvidence` satırları**
silinir; `ModerationCase` ve `ModerationCaseEvent` kalır. Yani "ne oldu ve
neden" kalıcı, "ham içerik" süreli. Vaka kapandığında `evidencePurgeAt` =
kapanış + 180 gün olarak yazılır. Temizlik `OutboxJob` kuyruğuna günlük iş.

**Karar: delil FK değil, snapshot.**
`messageId` referans olarak tutulur ama karar `snapshot` alanına dayanır.
Kullanıcı raporlanan mesajı silerse delil kaybolmamalı — yoksa en kötü
davranış en kolay temizlenen davranış olur. Snapshot rapor anında yazılır:
mesaj metni, gönderen, kanal, zaman, ek dosya URL'leri.

**Ama snapshot bugünkü rapor sözleşmesiyle üretilemez** — bkz. §0.

**Karar: mevcut `UserReport` yeniden yazılmaz, genişletilir.**
Tek alan eklemek geçmiş raporları korur. Migration mevcut raporları da
gruplayarak vaka üretir (aşağıda).

### 2. Rapordan vakaya gruplama

Yeni rapor geldiğinde:

1. Aynı `subjectId` için `status` `OPEN` / `IN_REVIEW` / `APPEALED` olan vaka
   var mı? Varsa rapor ona bağlanır, `reportCount` artar,
   `REPORT_ADDED` olayı yazılır.
2. Yoksa yeni vaka açılır.

**Karar: gruplama zamana değil duruma bağlı.** "Son 7 gün" gibi bir pencere
yerine açık vaka ölçütü kullanılır. Sebep: kapanmış bir vaka yeniden
açılmamalı; yeni rapor yeni vakadır ve tekrar eden ihlal ayrı bir kayıt
olarak görünür.

Öncelik otomatik türetilir ve operatör elle değiştirebilir:

- `reportCount >= 5` veya farklı 3+ raporcu → `HIGH`
- `reason = IMPERSONATION` → `HIGH`
- Aksi halde `NORMAL`

Türetme ilk atamada yapılır; operatör değiştirdiyse otomatik kural artık
o vakaya dokunmaz (`metadata.priorityOverriddenBy` işareti).

### 3. Migration: geçmiş raporlar

Mevcut `UserReport` satırları `subjectId` başına gruplanır ve her grup için
bir `ModerationCase` üretilir:

- `status = OPEN`
- `openedAt` = grubun en eski raporunun `createdAt` değeri
- `firstSeenAt = null` (henüz kimse görmedi)
- `reportCount` = gruptaki rapor sayısı

Delil snapshot'ı geriye dönük üretilemez (rapor hangi mesaj için verildiğini
zaten kaydetmiyordu). Bu vakalar `evidence` olmadan açılır ve arayüzde
"geçmiş rapor, delil kaydı yok" etiketiyle görünür.

### 4. Kuyruk ekranı (`/admin/moderation`)

Sütunlar: vaka no, konu (kullanıcı), durum, öncelik, rapor sayısı, atanan,
açılış yaşı.

Filtreler: durum, öncelik, atanan (bana atanmış / atanmamış / herkes), sebep.
Varsayılan görünüm: `OPEN` + `IN_REVIEW`, öncelik azalan, en eski önce.

**Yaş göstergesi:** ilk raporun üzerinden geçen süre. 24 saati aşan `OPEN`
vakalar vurgulanır. Bu bir SLA taahhüdü değil, görünürlük aracı — kimse
kuyruğun dibinde unutulmuş bir rapor bırakmasın diye.

**Üstlenme:** "Üstlen" tek tık, `assigneeId` = aktör, `status` → `IN_REVIEW`,
`firstSeenAt` ilk kez doluyorsa yazılır. İki operatör aynı anda üstlenirse
ikincisi "zaten X üstlendi" uyarısı alır (koşullu güncelleme, son yazan
kazanmaz).

### 5. Vaka dosyası (`/admin/moderation/[caseId]`)

Tek zaman çizelgesi, kronolojik. İçinde:

- Raporlar (kim, ne zaman, sebep, açıklama) — D1
- Operatör notları — D1
- Alınan aksiyonlar — D1
- Durum değişiklikleri — D1
- Delil kartları (snapshot; kaynak silinmişse "kaynak silinmiş" rozeti) — **D2**
- İtiraz ve sonucu — **D2**

Yan panelde konu kullanıcısının bağlamı: hesap yaşı, doğrulama durumu, geçmiş
vaka sayısı, mevcut ban durumu, üye olduğu sunucu sayısı. Konu hesabı
silinmişse yan panel `subjectHandle` ve "hesap silinmiş" rozetini gösterir.

**Aksiyonlar** — hepsi karar nedeni (`resolution`) zorunlu:

| Aksiyon       | Faz    | Uygulama                                                                        |
| ------------- | ------ | ------------------------------------------------------------------------------- |
| Uyar          | D1     | `Notification` (`type: MODERATION`) gönderilir                                  |
| Platform banı | D1     | Mevcut `setAdminUserBanState` (`management.ts:392`) çağrılır — yeniden yazılmaz |
| Reddet        | D1     | `status: DISMISSED`                                                             |
| Mesaj sil     | **D2** | İlgili `Message.deletedAt` işaretlenir                                          |

**"Mesaj sil" D1'de yok.** Vaka hangi mesaja ait olduğunu taşımıyor (rapor
sözleşmesi `messageId` göndermiyor); silinecek mesajı operatörün elle
bulması gerekirdi. Delil sözleşmesi geldiğinde aksiyon da gelir.

Her aksiyon iki kayıt üretir: `ModerationCaseEvent` (vaka içi anlatı) ve
`AdminAuditLog` (platform genelinde arama).

**Yetki:** aksiyonlar B'nin capability haritasına bağlanır —
`case.read` (`OWNER`, `ADMIN`, `SUPPORT`, `MODERATOR`),
`case.action` (`OWNER`, `ADMIN`, `MODERATOR`),
`user.ban` (mevcut, `OWNER`, `ADMIN`, `MODERATOR`).
`ANALYST` moderasyon uçlarının hiçbirine erişemez.

### 6. Audit'in IP boşluğunu kapatma

`writeAdminAuditLog` (`access.ts:168`) `ipHash` yazacak şekilde düzeltilir.
`getAnalyticsClientInfo` zaten hem `ipHash` hem `userAgentHash` üretiyor
(`client-info.ts:178`, `:180`) — çağrı `headers`'ı ona verip iki alanı da
alacak şekilde sadeleşir.

Bu düzeltme D'de yapılır çünkü moderasyon aksiyonları IP bağlamına en çok
ihtiyaç duyan kayıtlar. Etkisi tüm admin işlemlerini kapsar.

### 7. İtiraz — D2

Banlanan kullanıcı itiraz edebilir. İtiraz vakayı `APPEALED` durumuna alır ve
`APPEAL_OPENED` olayı yazar. Sonuç `APPEAL_RESOLVED` olayı ve `ACTIONED` veya
`DISMISSED` durumu üretir.

**Karar: itiraz ayrı kuyruk değil, vakanın durumu.** İki kuyruk iki yerde
bakılması gereken iş demek; küçük ekip için tek kuyruk doğru.

**Neden D2:** itiraz için kullanıcı tarafında bir giriş noktası gerekiyor
(banlanmış hesap hangi ekrandan itiraz edecek?) ve o ekran bugün yok. D1
banlama gerekçesini kaydeder; itiraz akışı D2'de eklenir. `APPEALED` durumu
ve olay türleri D1 migration'ında tanımlanır ki D2 şema değişikliği
gerektirmesin.

### 8. Raporcuya geri bildirim

Vaka `ACTIONED` veya `DISMISSED` olduğunda raporculara `Notification`
(`type: MODERATION`) gider. İçerik sonucu söyler, ayrıntı vermez — hangi
aksiyonun alındığı konu kullanıcısının mahremiyetidir.

Bu, `Feedback` tarafındaki durum bildirimi deseniyle aynı (`NotificationType.FEEDBACK`,
`schema.prisma:40` yorumunda anlatılan gerekçe).

## Test planı

**D1:**

1. **Gruplama:** aynı konuya ikinci rapor açık vakaya bağlanmalı,
   `reportCount` 2 olmalı, yeni vaka açılmamalı.
2. **Kapanmış vaka yeniden açılmaz:** `CLOSED` vakası olan konuya yeni rapor
   yeni vaka üretmeli.
3. **Üstlenme yarışı:** iki eşzamanlı üstlenme isteğinde biri başarılı, diğeri
   çakışma hatası almalı; `assigneeId` ilk kazananda kalmalı.
4. **Öncelik türetme:** 5 rapor `HIGH` yapmalı; operatör `LOW`'a çektiyse 6. rapor önceliği geri yükseltmemeli.
5. **Aksiyon audit'i:** ban aksiyonu hem `ModerationCaseEvent` hem
   `AdminAuditLog` satırı yazmalı; audit satırında `ipHash` **dolu** olmalı.
6. **Ban yeniden yazılmadı:** vaka üzerinden ban, mevcut
   `setAdminUserBanState`'i çağırmalı (oturum iptali ve kendini banlama
   koruması korunmalı).
7. **Konu silinince vaka yaşar:** konu kullanıcısı silindiğinde vaka,
   olayları ve kararı ayakta kalmalı; `subjectId` null, `subjectHandle` dolu
   olmalı. (Cascade regresyonunu yakalar.)
8. **Operatör silinince karar yaşar:** `actorId` null olsa bile
   `ModerationCaseEvent` satırı kalmalı.
9. **Migration:** mevcut raporlar konu başına tek vakada toplanmalı;
   `openedAt` en eski rapor tarihini almalı; delil boş olmalı.
10. **Raporcu bildirimi:** vaka `DISMISSED` olduğunda raporcuya bildirim
    gitmeli, alınan aksiyon ayrıntısı içermemeli.
11. **Yetki:** `ANALYST` moderasyon API uçlarına 403 almalı (B capability
    matrisinin bir satırı).

**D2:**

12. **Sözleşme geriye dönük uyumlu:** yalnızca `reason` + `details` gönderen
    eski mobil sürüm rapor gönderebilmeye devam etmeli.
13. **Erişim doğrulaması:** raporcunun göremediği bir `messageId`
    gönderildiğinde alan yok sayılmalı, snapshot **yazılmamalı**, rapor yine
    kaydedilmeli. (Rapor ucunun okuma aracına dönüşmesini engeller.)
14. **Delil dayanıklılığı:** snapshot yazıldıktan sonra kaynak `Message`
    silinse bile vaka dosyası içeriği göstermeli.
15. **Delil temizliği:** `evidencePurgeAt` geçtiğinde `ModerationEvidence`
    silinmeli, `ModerationCase` ve olayları kalmalı.

## Bitti kanıtı

**D1:** mobil uygulamadan gönderilen bir profil raporu `/admin/moderation`
kuyruğunda 60 saniye içinde görünüyor. Vaka dosyasından ban alındığında
kullanıcının oturumları düşüyor ve `AdminAuditLog` satırında `ipHash` dolu.
Konu hesabı silindikten sonra vaka hâlâ okunabiliyor.

**D2:** mobil uygulamadan bir mesaj raporlandığında vaka dosyasında delil
kartı görünüyor; kaynak mesaj silindikten sonra kart içeriği göstermeye devam
ediyor.

## Riskler

| Risk                                        | Etki                             | Karşılık                                                                                |
| ------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| Delil sözleşmesi olmadan D1 "yarım" görünür | Beklenti uyuşmazlığı             | D1 bugünkü rapor türü (profil raporu) için tam işlevli; arayüz içerik raporu vaat etmez |
| Rapor ucu okuma aracına dönüşür             | Erişilemeyen mesaj içeriği sızar | D2 test 13: erişim doğrulanmadan snapshot yazılmaz                                      |
| Snapshot kişisel veri saklar                | KVKK kapsamı genişler            | `evidencePurgeAt` = kapanış + 180 gün; yalnızca delil silinir, karar kalır              |
| Konu hesabını silip kaydı yok eder          | Yaptırım kaçağı                  | `SetNull` + `subjectHandle`; test 7 sabitler                                            |
| Gruplama yanlış birleştirir                 | İlgisiz raporlar tek vakada      | Gruplama yalnızca aynı `subjectId` üzerinden; farklı konu asla birleşmez                |
| Geçmiş raporlar kuyruğu doldurur            | İlk açılışta yüzlerce vaka       | Migration'da üretilen vakalar "geçmiş" etiketli; varsayılan filtre dışında              |
| İki operatör aynı vakada çakışır            | Çelişen karar                    | Üstlenme koşullu güncelleme; test 3 sabitler                                            |

## Sonraki adım

Onaydan sonra `writing-plans`. Kod değişikliği plan onayından önce başlamaz.
AutoMod ayrı bir spec olarak D tamamlandıktan sonra ele alınır.
