# Dalga 1 · Ş3 — Yazma yolu: oluşturma, RSVP, hatırlatma, `.ics`, canlı geçişi

**Ön koşul:** Dalga 0 kapısı yeşil. **Paralel:** Ş1, Ş2, Ş4.

Bu paketin en riskli şeridi: mevcut bir sayacın anlamını daraltıyor (K1) ve kuyruğa zamanlı iş
yazıyor (K5). İkisi de sessizce yanlış olabilecek türden; ikisi de sözleşme testiyle kilitlenir.

---

## Sahiplenilen dosyalar

- `apps/web/src/lib/events/mutations.ts` (yeni — oluşturma, RSVP, hatırlatma) + `.test.ts`
- `apps/web/src/lib/events/reminder-scheduler.ts` (yeni — outbox zamanlama/iptal) + `.test.ts`
- `apps/web/src/lib/events/ics.ts` (yeni — tek etkinlik `.ics`) + `.test.ts`
- `apps/web/src/lib/events/live-lifecycle.ts` (yeni — `SCHEDULED ↔ ACTIVE ↔ COMPLETED`) + `.test.ts`
- `apps/web/src/lib/events/client.ts` — yalnız `// Ş3` sınırı içindeki bölüm
- `apps/web/src/app/api/v1/events/route.ts` — yalnız `POST` (GET Ş1'in)
- `apps/web/src/app/api/v1/events/[eventId]/rsvp/route*.ts` (yeni)
- `apps/web/src/app/api/v1/events/[eventId]/reminder/route*.ts` (yeni)
- `apps/web/src/app/api/v1/events/[eventId]/calendar.ics/route.ts` (yeni)
- `apps/web/src/lib/outbox/service.ts` — yalnız `OUTBOX_JOB_TYPES` yeni tip
- `apps/web/src/lib/outbox/worker.ts` — yalnız yeni iş tipinin işleyicisi
- `apps/web/src/lib/workspace/scheduled-event-service.ts` — `status` alanının yazılması ve
  `ensureEventPermission`e geçiş
- `apps/web/src/lib/events/count-contract.test.ts` (yeni — `interestedCount` tüketicilerini kilitler)

**Okunur, yazılmaz:** `lib/voice/*`, `lib/notifications/service.ts`, `lib/servers/server-public-profile-service.ts`.

---

## İş

### 1. `interestedCount` anlam kayması (tuzak #2) — önce bu

K1 sayacın **adını** değiştirmiyor, **anlamını** daraltıyor: "ilgili" → "katılıyor (`GOING`)".

Üç tüketici var; üçü de bu şeritte tek tek doğrulanır:

| Tüketici                                       | Ne yapılacak                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/home/events-service.ts`                   | Sayı `going` olarak okunur; Ana Sayfa "Sıradaki" kartının alt satırı bu anlamı taşıyor mu kontrol edilir                                          |
| `lib/servers/server-public-profile-service.ts` | Sunucu profil kartındaki sayı `going`; `maybe` verenler **düşer** — bu doğru davranış, ama i18n metni "ilgileniyor" diyorsa "katılıyor"a çevrilir |
| `api/v1/mobile/servers/[serverId]/events/*`    | `interestedCount` aynı alanda kalır, `maybeCount` **opsiyonel** eklenir; `interested` boolean `status != null` olarak türetilir (K12)             |

`count-contract.test.ts` üçünü de sabitler: sahte veriyle 3 `GOING` + 2 `MAYBE` verildiğinde
her tüketicinin ne gördüğü **literal** olarak yazılır. Bir sonraki değişiklik bu testi kırar.

### 2. RSVP (`PUT /api/v1/events/[eventId]/rsvp`)

Gövde **hedef durum** taşır (`{ "rsvp": "going" | "maybe" | null }`), toggle değil — iki yarışan
tık aynı sonuca yakınsar. Mevcut `interest` ucundaki duruşun aynısı.

Tek transaction:

1. `ScheduledEventInterest` upsert / delete (`@@unique([eventId, userId])`).
2. Sayaç deltaları: `interestedCount` ve `maybeCount` **yalnız satır gerçekten değiştiyse**
   oynar (mevcut şema yorumunun kuralı).
3. `going` yazıldıysa ve izleyicinin hatırlatma satırı yoksa **varsayılan hatırlatma** oluşturulur
   (`enabled: true, minutesBefore: 10`) ve outbox işi zamanlanır (K5). `null`'a düşüldüğünde
   hatırlatma satırı `enabled: false` yapılır ve iş iptal edilir.
4. Yanıt güncel `WhisprEvent` + güncel `EventCounts` taşır — istemcinin ikinci istek atmasına
   gerek kalmaz (kart kenarı, buton metni, sağ ray listesi ve başlık sayacı **aynı anda** döner).

Erişim: listedeki görünürlük kuralı. `isPublic` etkinliğe üye olmayan da RSVP verebilir (K3'ün
amacı bu). Kapalı etkinlikte 404.

`maybe` → `going` geçişinde iki sayaç aynı transaction'da oynar; ara durumda toplam yanlış
görünmez.

### 3. Oluşturma (`POST /api/v1/events`)

- Yetki: `ensureEventPermission` (Ş0.6). Yoksa **403**.
- Gövde `CreateEventInputSchema`. `channelId` verilmişse kanal **o sunucuya ait** ve tür
  kuralına uygun olmalı (K10): `voice/game` → sesli, `live/community` → sahne,
  `meeting/workshop` → metin veya sesli. Uymuyorsa 422.
- `entityType` `kind`'dan türetilir: sahne kanalı → `STAGE`, sesli kanal → `VOICE`,
  `externalLocation` → `EXTERNAL`.
- `startsAt` geçmişte olamaz (5 dakikalık tolerans).
- `isPublic` yalnız sunucu **COMMUNITY** tipindeyse `true` olabilir; değilse 422 ve i18n'li hata
  (`ServerType` kontrolü mevcut şemada var).
- Sunucu üyelerine bildirim: **outbox** üzerinden (fan-out senkron yazılmaz). Yeni iş tipi
  `SCHEDULED_EVENT_CREATED_NOTIFICATIONS`.
- Yanıt `201` + `WhisprEvent`.

### 4. Hatırlatma (`PUT /api/v1/events/[eventId]/reminder`)

- Gövde `{ enabled, minutesBefore }`; `minutesBefore` ∈ {5,10,15,30,60}.
- `ScheduledEventReminder` upsert.
- `reminder-scheduler.ts`:
  - `idempotencyKey = evt-reminder:{eventId}:{userId}:{startsAtEpochMs}`
  - `availableAt = startsAt − minutesBefore`
  - **`availableAt <= now` ise iş yazılmaz** (tuzak #8). Yanıt `scheduled: false` taşır; panel
    "etkinlik çok yakın" durumunu gösterebilir.
  - `enabled: false` → mevcut `PENDING` iş `CANCELLED`'a çekilir.
  - Etkinlik saati değişirse (`scheduled-event-service` güncelleme yolu) **bütün** hatırlatma
    işleri yeniden zamanlanır: eski anahtarlar `startsAt`i taşıdığı için otomatik olarak farklı
    anahtar üretilir; eskiler toplu `CANCELLED`.
  - `UserNotificationSettings.eventNotifications = false` olan kullanıcı için iş **hiç** yazılmaz.
- Worker işleyicisi mevcut bildirim yolunu kullanır (push + uygulama içi `Notification` satırı).
  Bildirim metni i18n anahtarından, kullanıcının diliyle.

### 5. `.ics` (`GET /api/v1/events/[eventId]/calendar.ics`)

`ics.ts` saf fonksiyon: `WhisprEvent` → RFC 5545 metni.

```
BEGIN:VCALENDAR / VERSION:2.0 / PRODID:-//Whispr//Events//TR
BEGIN:VEVENT
UID:<eventId>@whispr
DTSTAMP / DTSTART / DTEND   → UTC, 'YYYYMMDDTHHMMSSZ'
SUMMARY / DESCRIPTION       → satır katlama (75 oktet) ve kaçış (\, ; , \n)
URL:<uygulama içi etkinlik bağlantısı>
LOCATION:<sunucu › kanal> veya <externalLocation>
END:VEVENT / END:VCALENDAR
```

`Content-Type: text/calendar; charset=utf-8`,
`Content-Disposition: attachment; filename="<slug>.ics"`.
Satır sonları **CRLF**. Türkçe karakterler UTF-8 ve katlama sınırı **oktet** üzerinden (karakter
değil) — `ı`, `ğ`, `ş` iki oktet.

Erişim: detay ucunun kuralı.

### 6. Canlı geçişi (`live-lifecycle.ts`)

`ScheduledEventStatus.ACTIVE` bugün hiç yazılmıyor. Bu şerit yazar:

- Etkinliğe bağlı sesli/sahne kanalına **ilk kişi girdiğinde** ve `now >= startsAt − 15 dk`
  (mevcut `SERVER_SCHEDULED_EVENT_JOIN_WINDOW_MS` sabiti) → `SCHEDULED → ACTIVE`.
- Kanal boşaldığında **veya** `now > startsAt + durationMinutes + 15 dk` → `ACTIVE → COMPLETED`.
- Geçişler idempotent (`updateMany` + `where: { status: <önceki> }`), yarışan iki katılım tek
  geçiş üretir.
- Harici etkinlikte (`EXTERNAL`) otomatik geçiş **yok**; sahibi elle başlatır/bitirir
  (`PUT /events/[eventId]` mevcut ucu üzerinden). Bu bir `TODO(api):` değil, bilinçli sınır —
  rapora yazılır.

Geçiş `event:live:started` / `event:live:ended` yayınlar (olay tanımları Ş4'ün, bu şerit
**yayıncıyı çağırır**; Ş4 gelmeden önce çağrı `TODO(Ş4):` ile bırakılabilir ama tercih edilen,
iki şeridin sıralanmasıdır).

---

## Kabul

- [ ] `count-contract.test.ts` üç tüketiciyi de literal beklentiyle kilitliyor.
- [ ] `going → maybe → null → going` döngüsü 20 tekrarda sayaçları sapmadan bırakıyor.
- [ ] İki eşzamanlı `going` isteği tek satır ve tek artış üretiyor.
- [ ] `going` verince varsayılan hatırlatma satırı ve outbox işi oluşuyor; `null`'a düşünce iş
      `CANCELLED`.
- [ ] Etkinlik 5 dk sonraysa ve tercih 10 dk ise **iş yazılmıyor**, yanıt `scheduled: false`.
- [ ] Etkinlik saati değişince eski iş `CANCELLED`, yeni anahtarla yeni iş `PENDING`.
- [ ] `eventNotifications=false` kullanıcı için hiç iş yazılmıyor.
- [ ] `MANAGE_EVENTS` olmayan üye `POST /events` → 403.
- [ ] Tür ↔ kanal kuralı ihlalinde 422 (canlı yayın metin kanalına konamıyor).
- [ ] `isPublic` yalnız COMMUNITY sunucuda kabul ediliyor.
- [ ] `.ics` çıktısı `BEGIN:VEVENT` taşıyor, `DTSTART` UTC, Türkçe başlık doğru katlanıyor,
      CRLF satır sonu.
- [ ] Sesli kanala ilk giriş `ACTIVE` yapıyor; kanal boşalınca `COMPLETED`; iki eşzamanlı giriş
      tek geçiş.
- [ ] Mobil uç eski sözleşmeyle çalışıyor (`interested` boolean hâlâ dönüyor).

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```
