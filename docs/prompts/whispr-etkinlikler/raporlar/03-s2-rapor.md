# Dalga 1 · Ş2 — Detay ucu, katılımcı rolleri, hatırlatma okuması · rapor

**Tarih:** 2026-08-21 · **Dal:** `uat` · **Commit:** yok (kural gereği)
**Kapsam:** `GET /api/v1/events/[eventId]`, `lib/events/detail-service.ts`,
`lib/events/attendee-roles.ts`, `lib/events/client.ts` → `// Ş2` bölümü.

Bu şerit ekran çizmedi. 326 px detay panelinin okuduğu tek ucu, rol çözümleyicisini ve
istemci sarmalayıcısını bıraktı.

---

## 1. Ne landed

| Dosya                                                          | Durum                                          |
| -------------------------------------------------------------- | ---------------------------------------------- |
| `apps/web/src/lib/events/attendee-roles.ts`                    | yeni — saf rol çözümleyici + imleç kodeki      |
| `apps/web/src/lib/events/attendee-roles.test.ts`               | yeni, **19 test**                              |
| `apps/web/src/lib/events/detail-service.ts`                    | yeni — okuma servisi                           |
| `apps/web/src/lib/events/detail-service.test.ts`               | yeni, **35 test**                              |
| `apps/web/src/lib/events/detail-contract.ts`                   | yeni — `EventDetailResponseSchema` (bkz. §2.1) |
| `apps/web/src/app/api/v1/events/[eventId]/route.ts`            | yeni                                           |
| `apps/web/src/app/api/v1/events/[eventId]/route-logic.ts`      | yeni — DI'lı                                   |
| `apps/web/src/app/api/v1/events/[eventId]/route-logic.test.ts` | yeni, **8 test**                               |
| `apps/web/src/lib/events/client.ts`                            | yalnız `// Ş2` bölümü (`fetchEventDetail`)     |
| `apps/web/src/lib/api-rate-limit.ts`                           | `+1` anahtar: `events:detail` (bkz. §2.2)      |

**Toplam 62 test, 62 yeşil.**

### 1.1 Erişim kuralı

Görünürlük **sorgunun kendi süzgeci**; sonucuna uygulanan ikinci bir kontrol yok:

```ts
where: {
  OR: [{ server: { members: { some: { userId: viewerId } } } }, { isPublic: true }],
  id: eventId,
}
```

Satır gelmezse `ApiError(404, "SCHEDULED_EVENT_NOT_FOUND")`. **403 hiçbir dalda atılmıyor** —
403, etkinliğin var olduğunu söylerdi. Test hem `status === 404` hem `status !== 403` iddiasını
ayrı ayrı taşıyor, ayrıca `where` gövdesinin iki dallı olduğunu doğruluyor (kural sorguda mı,
kodda mı sorusunun cevabı).

`findFirst` tek satır döndürdüğü için tuzak #6'nın (`UNION ALL` çift satır) karşılığı burada
yok; üyesi olduğun sunucunun herkese açık etkinliği bir kez gelir.

### 1.2 Roller — `attendee-roles.ts`

Modül **saf**: veritabanı, saat, istek bilmez.

- `EVENT_ATTENDEE_ROLE_ORDER = ["host", "listening", "going", "maybe"]` — dizinin sırası
  önceliğin kendisi; `eventAttendeeRoleRank` onu okur.
- `resolveEventAttendees(candidates)` kişiyi **tek satıra** indirger. Kazananı rol önceliği
  seçer, **giriş sırası değil** — test aynı iki adayı ters sırayla da veriyor ve iki koşuda da
  `listening` kazanıyor.
- Grup içi sıra `createdAt ASC`, eşitlikte kimlik. Kimlik bir süs değil: aynı saniyede yazılmış
  iki RSVP arasında kararsız bir sıra, ikinci sayfada tekrar eden satır demekti.
- `toEventInitials` hiçbir girdide boş dönmez (`"?"` düşer) — `EventAttendeeSchema.initials`
  `.min(1)` istiyor ve adsız bir satır panelin **tamamını** şemadan düşürürdü.
- İmleç kodeki (`encode/decodeEventAttendeeCursor`) burada, çünkü `rank|sortAt|id` anahtarı rol
  sırasının kendisi. Tanımadığı rol sırasını (`rank ≥ 4`) ve bozuk base64'ü `null` döner.

### 1.3 `SCHEDULED` etkinlikte VoiceState sorgusu

`listening` dalı `isLive && row.channelId` kapısının **içinde**; `SCHEDULED` etkinlikte sorgu
kurulmaz bile. Test sahte veritabanının çağrı defterini okuyup `voiceState.` ile başlayan
çağrıların **boş** olduğunu doğruluyor; `ACTIVE` testinde aynı defter `voiceState.findMany`
içeriyor.

### 1.4 Sayfalama ve `attendeeMoreCount`

Sıralı liste: `[sahip] + dinleyiciler + going + maybe`.

- Sahip ve dinleyiciler bir kez materyalize edilir (ikisi de sınırlı: sahip 1, dinleyici kanal
  kapasitesi kadar), sonra RSVP dalları `userId: { notIn: [...] }` ile **onları düşerek** okunur.
  Böylece aynı kişi ikinci kez ne sayılır ne de sayfa sınırını kaydırır.
- `attendeeMoreCount = (imleçten sonra kalan toplam) − (dönen)`. "Kalan" iki `count` sorgusuyla
  ölçülür ve imleç süzgecini **aynen** taşır; global toplamdan offset çıkarmak gerekmiyor.
- Test 13 kişilik bir etkinlikte iki sayfa çekiyor: birinci sayfa 8 kişi + `attendeeMoreCount 5`,
  ikinci sayfa 5 kişi + `0` + `attendeeNextCursor: null`, kesişim **boş**.
- Sahte veritabanı keyset ve `notIn` süzgeçlerini **gerçekten uyguluyor**; taklit etseydi imleç
  sınanmamış olurdu (ilk sürümü taklit ediyordu ve testi yanlış yere yeşil yapıyordu).

Sorgu bütçesi: 1 (etkinlik + üyelik + roller + kanal override + kendi RSVP'si + kendi
hatırlatması) + 1 (izleyici tercihleri) + 2 (sayım) + 1–2 (sayfa) + `ACTIVE` ise 1 (VoiceState).

### 1.5 Hatırlatma

`reminders` izleyiciyle süzülmüş sınırlı alt seçimle **aynı gidiş dönüşte** gelir. Satır yoksa
`reminder: null`. `UserNotificationSettings.eventNotifications === false` ise satır **gerçek**
döner ve yanıt ayrıca `reminderSuppressed: true` taşır — tercihin kendisi kaybolmaz, panel
yalnız bildirimlerin kapalı olduğunu söyleyebilir.

### 1.6 CTA — sunucu metin göndermez

Yanıt `canJoinLive` · `joinHref` · `rsvp` taşır; hiçbiri metin değil.

| Alan          | Kural                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------- |
| `canJoinLive` | `status === 'ACTIVE'` **ve** bağlı kanal var **ve** izleyici o kanala girebiliyor             |
| `joinHref`    | `/channels/<serverId>/<channelId>` — kanal yoksa ya da izleyici kanalı **göremiyorsa** `null` |
| `rsvp`        | izleyicinin kendi `ScheduledEventInterest.status`u (`going` / `maybe` / `null`)               |

Kanal erişimi `resolveChannelPermissions` + `hasPermission` + `canUseLockedChannelPermission`
ile çözülüyor: `VIEW_CHANNEL` görmeye, sesli/sahne kanalında ayrıca `CONNECT_VOICE` bağlanmaya
yetiyor. **Üye olmayan izleyicide izin çözümü hiç çalıştırılmıyor** — varsayılan rolün maskesi
ona ait değil; K3 herkese açık etkinliğinde `canJoinLive: false`, `joinHref: null`.

`joinHref` sunucuda üretiliyor çünkü bu erişim izleyiciye göre değişiyor; istemci
`/channels/...` yolunu kendisi kurmuyor (`client.ts` yorumları bunu yazıyor).

İstemci tarafı metin eşlemesi `client.ts` `// Ş2` bölümünde yorumla duruyor:
`rsvp === "going"` → `events.detail.leave`, `canJoinLive` → `events.detail.joinLive`, diğer →
`events.card.join`. Metin anahtarlarının üçü de Ş0.5'te yazılmış durumda.

### 1.7 Saat dilimi (tuzak #7)

`dayBucket` **sunucuda**, izleyicinin bölgesinde hesaplanıyor. Sıra: hesap tercihi
(`UserSettings.timeZone`, `"AUTO"` değilse) → isteğin taşıdığı bölge → `Europe/Istanbul`.
Test 21:30 UTC başlayan bir etkinliği `Europe/Istanbul`da `tomorrow`, `America/New_York`ta
`today` görüyor ve hesap tercihinin istek başlığını ezdiğini ayrıca doğruluyor.

---

## 2. Kayda geçen sapmalar

### 2.1 `EventDetailResponseSchema` `packages/types`e değil, `lib/events/detail-contract.ts`e yazıldı

Ş2 §3 ve §4 iki alan istiyor — `reminderSuppressed` ve katılımcı sayfalamasının ikinci
sayfa imleci — ama Dalga 0'ın `EventDetailSchema`sı ikisini de taşımıyor. `packages/types`
bu şeridin sahiplendiği dosyalar arasında **değil**, o yüzden genişletme uygulama tarafında
duruyor:

```ts
export const EventDetailResponseSchema = EventDetailSchema.extend({
  attendeeNextCursor: z.string().nullable(),
  reminderSuppressed: z.boolean(),
});
```

**Neden ayrı bir dosya:** şemayı `detail-service.ts` içinde bırakmak, `client.ts`in
(`"use client"`) servis modülünü içeri almasını gerektiriyordu; o zincir `Buffer` kullanan
imleç kodeki ile yetki matematiğini tarayıcı paketine taşırdı. `Buffer` tarayıcıda tanımlı
değil. Sözleşme iki tarafın da ucuzca okuyabildiği kendi dosyasına alındı;
`detail-service.ts` onu yeniden ihraç ediyor, bu yüzden uç ve testler tek modül adı biliyor.

**Ş10'a devir:** iki alan `packages/types/src/events-screen.ts`e taşınabilirse
`detail-contract.ts` silinir.

### 2.2 `events:detail` hız anahtarı sahiplenilen dosya listesinin dışında

`lib/api-rate-limit.ts` Ş2'nin dosyası değil ama Ş2 §5 rate limit anahtarını **adıyla**
istiyor (`events:detail`). Tek satırlık ekleme yapıldı: `{ limit: 120, windowSeconds: 60 }` —
listeyle aynı bütçe, çünkü panel kart tıklamasıyla açılıyor ve `{n} kişi daha` bağlantısı
8'erlik sayfalar çekiyor.

### 2.3 `WhisprEvent` projeksiyonu Ş1'i beklemeden yazıldı

`EventDetail`, `WhisprEvent`i genişletiyor; yani detay ucu `kind` / `dayBucket` /
`durationMinutes` / `startsInMinutes` / `channelLabel` / `goingCount` alanlarının **tamamını**
üretmek zorunda. Bu projeksiyon Ş1'in `events-service.ts` dosyasının işi ve o dosya bu şerit
başladığında yoktu (paralel koşuyorlar). Projeksiyon `detail-service.ts` içinde yazıldı.

Üretilen kurallar, Ş1'in aynı alanları yazarken **eşleşmesi gereken** kararlar:

| Alan                        | Ş2'nin kuralı                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `dayBucket`                 | izleyicinin bölgesindeki takvim gününü bugün / yarın ile karşılaştırır; geçmiş gün `past`   |
| `durationMinutes`           | `scheduledEndAt − scheduledStartAt`, pozitif değilse `null`                                 |
| `startsInMinutes`           | `Math.ceil`, yalnız `0 ≤ dk ≤ 60` aralığında dolu (eşik sunucuda)                           |
| `channelLabel`              | metin türü kanallarda `#ad`, sesli/sahne kanalında düz `ad`, kanal yoksa `externalLocation` |
| `goingCount` / `maybeCount` | `interestedCount` / `maybeCount` sütunları, `Math.max(0, …)` ile                            |
| `attendeePreview`           | katılımcı listesinin ilk 3'ü (ayrı sorgu değil)                                             |

**Ş10'a devir:** iki projeksiyon tek yere indirilmeli; bugün ayrışmıyorlar ama ayrışabilirler.

### 2.4 `events-query.ts`in dallarından türetilemedi

Ş2 §1 "kural `events-query.ts`'in dallarından türetilir" diyor. O dosya bu şerit başladığında
yoktu; aynı iki dal (`MEMBER` üyelik / `PUBLIC` bayrak) detay sorgusunun kendi `where`ine
yazıldı. Anlamsal olarak aynı kural, fiziksel olarak ikinci bir yazım. Ş10 temizliğinde tek
kaynağa indirilebilir.

### 2.5 `home-test-doubles.ts` genişletilmedi

`createFakeDatabase` model listesi `userNotificationSettings` ve `scheduledEventReminder`
taşımıyor. O dosya da sahiplenilen listede olmadığı için `detail-service.test.ts` kendi
sahte veritabanını taşıyor — çağrı defteri aynı desende (`model.operation` + argümanlar),
"bu uç kaç sorgu açıyor" sorusu aynı şekilde sorulabiliyor.

---

## 3. Paralel şeritlerle çakışma — `client.ts`

`lib/events/client.ts` Ş1'in dosyası; Ş2 yalnız `// Ş2` sınırının içini yazıyor. Ş1, Ş3 ve Ş4
bu şeritle **aynı anda** koştu ve dosya üç kez yeniden yazıldı:

1. Ş2 dosyayı bulamadı (o an yoktu) ve iskeleti + `// Ş2` bölümünü yazdı.
2. Ş4 dosyayı sayaç anahtarlarıyla (`counts`, `lists`, `fetchEventCounts`) yeniden kurdu.
3. Ş1 kendi nihai sürümünü yazdı; `// Ş2` bölümü yer tutucu yoruma döndü.
4. Ş2 (bu şerit) **yalnız** `// Ş2` bloğunu Ş1'in dosyasına geri ekledi ve başka hiçbir satıra
   dokunmadı — anahtar sözlüğü, `requestJson`, `fetchEvents` ve `// Ş3` yer tutucusu Ş1'in.

Nihai durumda Ş2'nin bıraktığı tek şey `fetchEventDetail` ve onun şema içe aktarımı.
`eventsQueryKeys.detail(eventId)` ile `EVENTS_STALE_TIME_MS.detail` **Ş1'in** yazdığı hâlde
duruyor; Ş2 kendi sürümlerini eklemedi.

**Ş1 ↔ Ş4 arasında kapanmamış bir çakışma var ve Ş2'ye ait değil:**
`hooks/use-next-event-clock.ts` `EVENTS_COUNTS_STALE_TIME_MS`, `eventsQueryKeys.lists` ve
`fetchEventCounts` içe aktarıyor; Ş1'in nihai `client.ts`i bu üçünü taşımıyor. İki şerit
anahtar sözlüğünün şeklinde anlaşmalı.

---

## 4. Bırakılan `TODO(api):` notları

Yok. Bu şerit karşılığı olmayan bir alan üretmedi; `EventDetail`in her alanı ya bir kolondan ya
bir yetki hesabından geliyor.

`recurrenceRule` ham RRULE metni olarak geçiyor — Dalga 0'ın `TODO(api): recurrence generator`
notu hâlâ şemada ve etiketi istemci kuraldan türetiyor (K6).

---

## 5. Kabul listesi

- [x] Üye olmayan izleyici `isPublic` etkinliğin detayını görüyor; kapalı etkinlikte **404**
      (403 hiçbir dalda atılmıyor, test ikisini de ayrı ayrı iddia ediyor).
- [x] Rol öncelik sırası: hem `GOING` hem `VoiceState` olan kişi tek satırda ve `listening`;
      öncelik giriş sırasından bağımsız.
- [x] `SCHEDULED` etkinlikte `VoiceState` sorgusu hiç açılmıyor — sahte veritabanı çağrı
      defteriyle doğrulandı.
- [x] `attendeeMoreCount` = kalan − dönen; ikinci sayfa aynı kişiyi tekrarlamıyor (13 kişilik
      etkinlikte 8 + 5, kesişim boş).
- [x] `canJoinLive` yalnız `ACTIVE` + bağlı kanal + izleyici kanala girebiliyorken `true`;
      `VIEW_CHANNEL` yokken de `CONNECT_VOICE` yokken de `false`.
- [x] `joinHref` harici etkinlikte `null`; kanalı göremeyen izleyicide de `null`.
- [x] Hatırlatma satırı yokken `reminder: null`; varken `minutesBefore` doğru.
- [x] `eventNotifications=false` iken `reminderSuppressed: true` **ve** satır gerçek.
- [x] Yanıt hiçbir görüntülenecek Türkçe metin taşımıyor: `durationLabel` / `startsInLabel` /
      `dayLabel` / `recurrenceLabel` anahtarları yanıtta yok, `dayBucket` enum.

---

## 6. Kapı çıktısı

Kapı, Ş1 · Ş3 · Ş4 **koşarken** alındı; üç şerit de aynı dosya ağacına yazıyor. Aşağıdaki
kırmızıların hiçbiri Ş2'nin diff'inde değil.

```
pnpm --filter @wizards/web typecheck
  apps/web/src/app/api/v1/events/[eventId]/rsvp/route-logic.test.ts(70,46): TS2339 'counts' … 'never'
  apps/web/src/components/discover/discover-page.tsx(754,17): TS2322 'string | null' → 'string'
  apps/web/src/components/discover/discover-page.tsx(760,17): TS2322 'string | null' → 'string'
```

```
pnpm --filter @wizards/web lint
  ℹ tests 10   pass 10   fail 0        (eslint sözleşme testleri)
  eslint: 7 hata — src/components/discover/discover-page.tsx, src/lib/events/mutations.ts
```

```
pnpm --filter @wizards/web test
  ℹ tests 4742   pass 4737   fail 4   (1 atlandı)
```

**Ş2'nin sahiplendiği yüzeylerin tamamı yeşil:**

```
✔ events attendee roles — öncelik sırası
✔ events attendee roles — bir kişi tek satırda
✔ events attendee roles — ad ve baş harfler
✔ events attendee roles — imleç
✔ events attendee roles — sözleşme
✔ events detail — erişim kuralı
✔ events detail — katılımcı rolleri
✔ events detail — katılımcı sayfalaması
✔ events detail — hatırlatma okuması
✔ events detail — CTA durumu
✔ events detail — yanıt sözleşmesi
✔ GET /api/v1/events/[eventId]
```

`typecheck` ve `lint` Ş2'nin dosyalarında **temiz**: sekiz dosyanın hiçbiri iki listede de yok.

### 6.1 Kırmızıların kaynağı

| Kırmızı                                                                                | Dosya                                | Kaynak                                                                                                                                                    |
| -------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requires mutating routes to either parse JSON centrally or be documented as bodyless` | `api/v1/route-contract.test.ts`      | Mobil `thread-follow` rotaları sözleşme listesinde yok. **Devralındı** — Dalga 0 raporu §4 aynı kırmızıyı taşıyor. Bahsedilmeler/thread işinden.          |
| `components/dm bütçeyi aşmaz` + `components/dm bütçesi gerçekten harcanmış`            | `lib/messages/audit-budget.test.ts`  | `components/dm/group-create-dialog.tsx` token borcu. **Devralındı** — Dalga 0 raporu §4. Mesajlar dalgasından.                                            |
| `hafif istek \`limit=0\` ile gider (gövde \`items\` taşımaz)`                          | `hooks/use-next-event-clock.test.ts` | **Ş1 ↔ Ş4 çakışması** (§3). Ş4'ün testi `client.ts` kaynağında `/api/v1/events?limit=0` arıyor; Ş1'in nihai `client.ts`i hafif sayaç okumasını taşımıyor. |
| `rsvp/route-logic.test.ts(70,46)` TS2339                                               | `api/v1/events/[eventId]/rsvp/`      | **Ş3'ün** yazma yolu. Rota `[eventId]` klasörünün altında ama Ş2'nin dosyası değil.                                                                       |
| `discover-page.tsx` × 5                                                                | `components/discover/`               | Keşfet paketi.                                                                                                                                            |
| `lib/events/mutations.ts` lint                                                         | Ş3                                   | `import type` kuralı.                                                                                                                                     |

Ş2 hiçbir kırmızıyı kapatmadı: dördü de başka şeritlerin sahiplendiği dosyalarda ve orada
düzeltilmeleri gerekiyor.

---

## 7. Dalga 2'ye devreden

- **`EVENT_ATTENDEE_PAGE_SIZE = 8`** ve `attendeeNextCursor` hazır. Ş7'nin `{n} kişi daha`
  bağlantısı imleci `fetchEventDetail({ eventId, attendeeCursor })` ile geri verir; anahtara
  kendi halkasını eklemeli (`[...eventsQueryKeys.details(id), cursor]`), yoksa ikinci sayfa
  birincinin üstüne biner.
- **CTA metni Ş7'nin işi.** Üç anahtar hazır: `events.detail.leave` · `events.detail.joinLive` ·
  `events.card.join`. Sunucu hiçbirini göndermiyor.
- **`reminderSuppressed`** bayrağı üretiliyor ama karşılığında **çizilecek metin anahtarı
  yok**: Ş0.5 `events.detail.reminderOn` ve `events.notifications.*` yazdı, "bildirimlerin
  kapalı" cümlesi yok. Ş7 ya mevcut bir anahtarı kullanır ya yeni anahtar ister.
- **Yazma yolu Ş3'te.** `ScheduledEventReminder` bu şeritte yalnız **okunuyor**.
- **`live-lifecycle`** (Ş3) `ACTIVE` geçişini yazınca `canJoinLive` ve `listening` rolü
  kendiliğinden doğru olur; bugün `ACTIVE` yazan yok, o yüzden `listening` dalı üretimde henüz
  hiç koşmuyor.

**Commit atılmadı.**
