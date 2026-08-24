# Whispr · Etkinlikler ekranı (4B · Takvim şeridi) — uygulama planı

> Kaynak paket: `design_handoff/etkinlikler-paketi/`
> Otorite sırası: `referans/Etkinlikler-4B.dc.html` inline `style` **>** `referans/Etkinlikler-referans.html` **>** `SPEC-ETKINLIKLER.md` **>** `PROMPT.md`.
> Ölçek/token kuralları: `SPEC-ANA-SAYFA.md` §1 (token + tipografi) ve §8 (2K/4K).
> Dal: `uat`. Hedef: web + masaüstü (Tauri aynı Next.js kabuğunu sarar, ayrı iş yok).

---

## 1. Bugünkü durum — kod tabanı gerçekleri

Plan varsayım üstüne değil, taranan kod üstüne kuruldu. Doğrulanan noktalar:

| Konu                  | Bugün                                                                                                                      | Sonuç                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/events` rotası      | `apps/web/src/app/(main)/events/page.tsx` → `EventsScreen` (242 satır, Faz 6 liste + ay takvimi)                           | **Tamamen değişecek**; eski ekran ve `event-list-row.tsx` / `events-calendar-view.tsx` kaldırılacak                                                                  |
| Kabuk 3. sütunu       | `selectThirdColumn("/events")` → `null`                                                                                    | **Doğru, dokunulmayacak.** 4B'de sol filtre kolonu yok; 300 px ajanda rayı sayfanın kendi sağ sütunu                                                                 |
| Nav paneli saat ipucu | `useNextEventClock()` → `fetchHomeUpcomingEvents` (Ana Sayfa sorgusu)                                                      | **Tek kaynağa bağlanacak**: ipucu + başlık alt satırı + sekme pilleri + sağ ray aynı sayaç yanıtından beslenecek; canlı noktası ve hata durumunda gizlenme eklenecek |
| DB modeli             | `ScheduledEvent` (+ `ScheduledEventInterest` ikili ilgi)                                                                   | Genişletilecek — §3                                                                                                                                                  |
| Yetki                 | Etkinlik yazma `PermissionBits.MANAGE_SERVER`                                                                              | Yeni `MANAGE_EVENTS` biti (`1n << 24n`; en yüksek kullanılan bit bugün 23)                                                                                           |
| API                   | `GET /api/v1/events/{list,upcoming,calendar}` (yalnız cursor+limit), `/api/v1/servers/[serverId]/events` CRUD + `interest` | Yeni tek okuma ucu + RSVP/hatırlatma/oluşturma uçları — §4                                                                                                           |
| Socket                | Etkinlik olayı **yok** (`scheduled-event-service` yalnız `server:settings:updated` yayıyor)                                | 5 yeni olay — §5                                                                                                                                                     |
| `--info` token        | `globals.css:37` `--info: 199 89% 48%` **zaten var** (+ `--info-soft`, `--info-readable`)                                  | Yeni token **gerekmiyor**; PROMPT §1'in istisnası karşılanmış durumda                                                                                                |
| Ölçek motoru          | `useUiScale` + `lib/home/scale.ts` + `pxToRem`/`pxToEm`/`hairline`                                                         | Hazır, yeniden yazılmayacak — sadece tüketilecek                                                                                                                     |
| Bileşenler            | `ui/{avatar,badge,input,modal,skeleton,toggle-switch,segmented-control,context-menu,toast}`                                | Hazır, yeniden yazılmayacak                                                                                                                                          |
| Outbox                | `OutboxJob` (`idempotencyKey`, `availableAt`, `attempts`) + `lib/outbox/worker.ts`                                         | Hatırlatma teslimi buraya oturacak                                                                                                                                   |
| i18n                  | `lib/locale/messages/{tr,en}.ts`, `messages.test.ts` `events.` önekini zaten denetliyor                                    | 12 mevcut `events.*` anahtarının çoğu ölecek, ~90 yeni anahtar                                                                                                       |

---

## 2. Bağlayıcı kararlar (K1–K12)

Bunlar sorulup onaylandı; şeritler bunları tartışmaz, uygular.

| #       | Karar                                                                                                                                                                                                                                                        | Gerekçe / sonuç                                                                                                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **K1**  | RSVP `ScheduledEventInterest` satırına `status` enum (`GOING` / `MAYBE`) olarak eklenir. Mevcut satırlar `GOING`. `interestedCount` **anlamı `going`** olur, yanına `maybeCount` gelir.                                                                      | Tek tablo, tek unique key. Mobil `viewerInterested` (= `status != null`) semantiği ve `interestedCount` değeri kırılmaz.                                                                                                            |
| **K2**  | Yeni `ScheduledEventKind` enum kolonu (`VOICE / MEETING / GAME / LIVE / COMMUNITY / WORKSHOP`). `entityType` teknik bağlama olarak kalır.                                                                                                                    | 6 sunum türü ile 3 teknik türü aynı kolona sıkıştırmak "Oyun gecesi sesli mi harici mi" sorusunu cevapsız bırakırdı. Backfill: `VOICE→VOICE`, `STAGE→LIVE`, `EXTERNAL→MEETING`.                                                     |
| **K3**  | Herkese açık etkinlik = `isPublic` bayrağı; `serverId` zorunlu kalır.                                                                                                                                                                                        | Şemada null-FK deliği açılmaz. Tasarımdaki "Topluluk" kaynağı = izleyicinin **üye olmadığı** sunucunun `isPublic` etkinliği; kaynak tile'ı `TK` dilinde çizilir. Modaldaki "Topluluk keşfetinde listele" anahtarı bu bayrağı yazar. |
| **K4**  | Yeni `MANAGE_EVENTS` yetki biti (`1n << 24n`). Sahip + `MANAGE_SERVER` varsayılan taşır, rol ayarlarından dağıtılabilir. Yetkisi olmayanda `Oluştur` girişlerinin **üçü de** gizlenir.                                                                       | Her üyeye açmak sunucu geneli bildirim spam'i demekti; `MANAGE_SERVER`'da bırakmak tasarımdaki üç giriş noktasını çoğu kullanıcı için ölü yapardı.                                                                                  |
| **K5**  | Hatırlatma **tam uçtan uca**: `ScheduledEventReminder` satırı + `OutboxJob` (`availableAt = startsAt − minutesBefore`). Seçenekler 5 / 10 / 15 / 30 / 60 dk, varsayılan 10.                                                                                  | Etkinlik saati değişince iş yeniden zamanlanır; RSVP geri alınınca iptal edilir. `idempotencyKey = evt-reminder:{eventId}:{userId}:{startsAtEpoch}` — saat değişimi yeni anahtar üretir, eski iş `CANCELLED` olur.                  |
| **K6**  | Tekrar: `recurrenceRule` (RRULE metni) kolonu + karttaki etiketin bu kuraldan i18n ile türetilmesi. **Örnek üreten iş ve kurma UI'ı bu pakette yok** — modalın kendi alt metni de böyle diyor.                                                               | `TODO(api): recurrence generator` ile işaretlenir.                                                                                                                                                                                  |
| **K7**  | Başlıktaki zil = hesap seviyesinde **etkinlik bildirim tercihi** (`UserNotificationSettings.eventNotifications`). RSVP şeridindeki `Takvime ekle` = sunucudan üretilen tek etkinlik **`.ics` indirmesi**.                                                    | Harici servise veri gitmez, OAuth yok. Alt satırdaki `takvim bağlı / bağlı değil` metni zil durumundan okunur.                                                                                                                      |
| **K8**  | Arama kutusu **eklenmez**. `q` yalnız URL'den (`?q=`) okunur; giriş noktası mevcut global komut paleti.                                                                                                                                                      | 4B tasarımında arama kutusu yok ve başlık `nowrap` + 432 px daralma kuralı yer bırakmıyor. Filtre çipi ve `Tümünü temizle` çalışır.                                                                                                 |
| **K9**  | Hafta şeridi okları **hafta** adımlar. Etiket görünen haftanın ayını yazar; hafta iki ayı bölüyorsa `Ağu – Eyl 2026`.                                                                                                                                        | HTML `title` değerleri ("Önceki hafta") otorite. PROMPT'un "ay ileri/geri" kriteriyle çelişki `SPEC_DEVIATIONS`'a kayda geçer.                                                                                                      |
| **K10** | Oluştur modalı yer seçicisi: sunucu listesi = `MANAGE_EVENTS` taşıdığın sunucular; kanal listesi **türe göre** süzülür (`VOICE/GAME` → sesli, `LIVE/COMMUNITY` → sahne, `MEETING/WORKSHOP` → metin+sesli) + `Harici bağlantı` seçeneği (`externalLocation`). | "Yayına katıl" CTA'sının gideceği yer garanti altına alınır.                                                                                                                                                                        |
| **K11** | Kart boyutu `?size=large` (paylaşılabilir) **+** `localStorage` (cihaz tercihi). Zil sunucuda (hesap tercihi).                                                                                                                                               | Kart boyutu ekran genişliğine bağlı bir tercih; bildirim davranışı cihazlar arası aynı olmalı.                                                                                                                                      |
| **K12** | Mobil sözleşmesi **kırılmaz**: `/api/v1/mobile/...` uçları yeni alanları (`kind`, `rsvpStatus`, `isPublic`, `maybeCount`) **opsiyonel** döner, `interested` boolean türetilmiş alan olarak kalır. Mobil Etkinlikler ekranı ayrı pakette.                     | Eski mobil sürüm kırılmaz, yeni sürüm türü öğrenir.                                                                                                                                                                                 |

### Kayda geçen tasarım/spec sapmaları (`SPEC_DEVIATIONS`)

1. Hafta oklarının adımı — HTML `title` "hafta", PROMPT kabul kriteri "ay". → **hafta** (K9).
2. `SPEC §3.6` "tür pili `font:600 10px body`" — HTML aynı; `letter-spacing` HTML'de yok, SPEC'te de yok → sözlükte `null`.
3. `SPEC §4` sağ ray başlığı "Katılacağım", `.dc.html` sol filtre kolonunda "Katılımım" geçiyor (4A yönüne ait, 4B'de çizilmiyor) → **"Katılacağım"**.
4. `SPEC §3.1` başlık metni "aramada `Arama sonuçları`" diyor; HTML `feedTitle` ayrıca kaynak filtresi seçiliyken **kaynak adını** yazıyor (`SRC[s.source].label`) ve `time==='today'` iken `Bugün` yazıyor → HTML davranışı alınır, SPEC bu iki dalda sessiz.
5. `SPEC §8` `dayBucket` dört değer sayıyor (`Bugün/Yarın/Bu hafta/Geçmiş`); HTML grup sırası yalnız üçünü çiziyor (`Geçmiş` süzülüp atılıyor) → tip dörtte kalır, ızgara üçünü çizer.

---

## 3. Veri sözleşmesi

### 3.1 Prisma migration — `20260821140000_events_screen`

> Konum: `packages/db/prisma/rebaseline-migrations/` (Prisma bu klasörü okur — `prisma/migrations` değil).

```prisma
enum ScheduledEventKind {
  VOICE
  MEETING
  GAME
  LIVE
  COMMUNITY
  WORKSHOP
}

enum ScheduledEventRsvpStatus {
  GOING
  MAYBE
}

model ScheduledEvent {
  // ... mevcut alanlar korunur ...
  /// K2 — sunum türü. `entityType` teknik bağlamayı (sahne/sesli/harici) tutmaya devam eder.
  kind           ScheduledEventKind @default(MEETING)
  /// K3 — üye olmayanlar da görür, Keşfet'te listelenir.
  isPublic       Boolean            @default(false)
  /// K6 — RRULE metni. Örnek üreten iş bu pakette yok.
  recurrenceRule String?            @db.VarChar(255)
  /// K1 — `interestedCount` artık **going** sayacıdır; `maybeCount` onun ikizi.
  maybeCount     Int                @default(0)

  reminders ScheduledEventReminder[]

  /// Herkese açık akış: üyelik süzgeci olmadan zaman sıralı okuma.
  @@index([isPublic, status, scheduledStartAt])
}

model ScheduledEventInterest {
  // ... mevcut alanlar korunur ...
  /// K1 — mevcut satırlar GOING'e düşer, sayaç değeri değişmez.
  status ScheduledEventRsvpStatus @default(GOING)

  /// "Katılacağım" sekmesi ve `mine` filtresi bu indeksten okur.
  @@index([userId, status])
}

/// K5 — kişi başına hatırlatma tercihi. Teslim `OutboxJob` üzerinden.
model ScheduledEventReminder {
  id            String   @id @default(uuid())
  eventId       String
  userId        String
  minutesBefore Int      @default(10)
  enabled       Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  event ScheduledEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user  User           @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([eventId, userId])
  @@index([userId])
}

model UserNotificationSettings {
  // ... mevcut alanlar korunur ...
  /// K7 — başlıktaki zil. `false` iken alt satır "takvim bağlı değil" yazar ve
  /// hatırlatma işleri kuyruğa **hiç** yazılmaz.
  eventNotifications Boolean @default(true)
}
```

Yetki: `apps/web/src/lib/workspace/permissions.ts` → `MANAGE_EVENTS: 1n << 24n`; `MODERATOR_PERMISSIONS` ve `SERVER_ADMIN_PERMISSIONS` maskeleri güncellenir. Migration **veri taşımaz** (yetki maskeleri kod tarafında türetiliyor); rol satırlarında saklı maskeler için ayrı bir backfill **gerekmez** çünkü `MANAGE_SERVER` taşıyan rol `ensureEventPermission` içinde de geçer.

Şema sözleşme testi: `packages/db/prisma/schema-events-screen.test.mjs` (mevcut `schema-mentions-screen.test.mjs` dili) — enum değerleri, varsayılanlar, indeksler ve `onDelete` davranışları.

### 3.2 `packages/types/src/events-screen.ts`

`mentions-screen.ts` ile aynı dil: zod şema + `z.infer` tip + her sapma için yorum.

```ts
export const EventKindSchema = z.enum([
  "voice",
  "meeting",
  "game",
  "live",
  "community",
  "workshop",
]);
export const RsvpSchema = z.enum(["going", "maybe"]).nullable();
export const EventTabSchema = z.enum(["all", "upcoming", "live", "going"]);
export const EventTimeFilterSchema = z.enum(["today", "week", "month", "past"]);
export const EventMineFilterSchema = z.enum(["going", "maybe", "host"]);
export const EventDayBucketSchema = z.enum(["today", "tomorrow", "week", "past"]);
export const EventAttendeeRoleSchema = z.enum(["host", "going", "maybe", "listening"]);

export const WhisprEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: EventKindSchema,
  serverId: z.string(),
  serverName: z.string(),
  /** `null` = harici; kart "kaynak › kanal" satırı o zaman `externalLocation` yazar. */
  channelId: z.string().nullable(),
  channelLabel: z.string(),
  isPublic: z.boolean(),
  /** İzleyici o sunucunun üyesi mi — kaynak tile'ı "Topluluk" diline bundan düşer (K3). */
  viewerIsMember: z.boolean(),
  startsAt: z.string(), // ISO
  endsAt: z.string().nullable(),
  durationMinutes: z.number().int().positive().nullable(),
  dayBucket: EventDayBucketSchema,
  host: z.object({
    id: z.string(),
    name: z.string(),
    initials: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  goingCount: z.number().int().nonnegative(),
  maybeCount: z.number().int().nonnegative(),
  attendeePreview: z.array(EventAttendeeSchema).max(3),
  rsvp: RsvpSchema,
  isLive: z.boolean(),
  /** Dakika. Kart `Başlamasına {n} dk` metnini bundan kurar; sunucu metni **yazmaz**. */
  startsInMinutes: z.number().int().nullable(),
  recurrenceRule: z.string().nullable(),
  description: z.string(),
  reminder: z.object({ enabled: z.boolean(), minutesBefore: z.number().int() }).nullable(),
  viewerCanManage: z.boolean(),
});
```

> **Sözleşme kuralı:** SPEC §8 taslağında `durationLabel`, `dayBucket: 'Bugün'`, `startsInLabel`, `recurrenceLabel` gibi **görüntülenecek Türkçe metinler** var. Ürün karşılığında sunucu metin göndermez; **sayı ve enum** gönderir, metni istemci i18n ile kurar. Aksi hâlde `en` sözlüğü hiçbir zaman doğru olamaz ve K12'deki mobil uyumu Türkçeye çivilenir. Bu, taslak sözleşmeden **bilinçli sapmadır** ve `events-screen.ts` başında yorumla kayda geçer.

Ayrıca: `EventsQuerySchema`, `EventsListResponseSchema` (items + `nextCursor` + `counts`), `EventCountsSchema` (`all/upcoming/live/going`, `liveNow`, `nextStartsAt`), `EventDetailSchema` (attendees + roller + `moreCount`), `CreateEventInputSchema`, `SetEventRsvpSchema`, `SetEventReminderSchema`, `EventKindToneSchema` (`kind → token adı`, renk değil), `EVENT_KIND_GLYPH` (`S·T·O·C·K·A`).

---

## 4. API yüzeyi

Hepsi `apps/web/src/app/api/v1/events/...`, mevcut `route.ts` + `route-logic.ts` + `route-logic.test.ts` üçlüsüyle (bağımlılık enjeksiyonlu, `runHomeRoute` dili).

| Uç                                           | İş                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/events`                         | Tek okuma ucu: `tab`, `time`, `serverId`, `mine`, `q`, `cursor`, `limit`, `weekStart`. Döner: `items[]`, `nextCursor`, `counts` (4 sekme + `liveNow` + `nextStartsAt`), `weekDots` (7 gün × ≤4 tür). **Sayaçlar burada üretilir** — nav ipucu, başlık alt satırı, sekme pilleri ve sağ ray hepsi bu yanıttan okur (PROMPT §8 "tek kaynak"). |
| `GET /api/v1/events/[eventId]`               | Detay: açıklama, katılımcı listesi + rol pilleri, hatırlatma durumu. `listening` rolü bağlı sesli kanalın `voiceStates` kayıtlarından gelir.                                                                                                                                                                                                |
| `POST /api/v1/events`                        | Oluşturma. `MANAGE_EVENTS` şart. Gövde: `kind`, `title`, `startsAt`, `durationMinutes`, `serverId`, `channelId                                                                                                                                                                                                                              | externalLocation`, `isPublic`. |
| `PUT /api/v1/events/[eventId]/rsvp`          | Gövde **hedef durum** taşır (`{"rsvp":"going"                                                                                                                                                                                                                                                                                               | "maybe"                        | null}`), toggle değil — iki yarışan tık aynı sonuca yakınsar (mevcut `interest` ucundaki duruşun aynısı). Sayaçlar tek transaction'da. |
| `PUT /api/v1/events/[eventId]/reminder`      | `{ enabled, minutesBefore }`. Outbox işini yeniden zamanlar.                                                                                                                                                                                                                                                                                |
| `GET /api/v1/events/[eventId]/calendar.ics`  | K7 — tek etkinlik `.ics`. `Content-Disposition: attachment`.                                                                                                                                                                                                                                                                                |
| `PUT /api/v1/account/notifications` (mevcut) | `eventNotifications` alanı eklenir (zil).                                                                                                                                                                                                                                                                                                   |

**Kaldırılacak:** `GET /api/v1/events/list` ve `/calendar` (eski ekranın uçları). `/upcoming` **kalır** — Ana Sayfa "Sıradaki" kartı onu kullanıyor, ama nav ipucu artık ondan değil yeni sayaçtan beslenir.

**Sorgu planı notu:** `tab=all` + üyelik süzgeci `ScheduledEvent(serverId, status, scheduledStartAt)` indeksinden okunur; `isPublic` dalı yeni `[isPublic, status, scheduledStartAt)` indeksinden. İki dal `UNION` ile birleşir — Bahsedilmeler Ş3'te dört dalın tek `UNION`'a indirgenmesiyle aynı duruş. `q` araması `title` üzerinde `ILIKE`; eşik aşılırsa ayrı bir tam metin indeksi ayrı iş olarak açılır.

---

## 5. Socket olayları

`apps/web/src/lib/socket/events.ts` içine, mevcut isimlendirme dili korunarak:

| Olay                 | Yayın alanı                                          | Payload                                         |
| -------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| `event:created`      | `server:{serverId}` + `events:public` (isPublic ise) | `{ eventId, serverId }`                         |
| `event:updated`      | aynı                                                 | `{ eventId, serverId, startsAtChanged }`        |
| `event:rsvp`         | aynı                                                 | `{ eventId, serverId, goingCount, maybeCount }` |
| `event:live:started` | aynı                                                 | `{ eventId, serverId }`                         |
| `event:live:ended`   | aynı                                                 | `{ eventId, serverId }`                         |

İstemci tarafı `lib/events/realtime.ts` (Bahsedilmeler `realtime.ts` dili): olay geldiğinde **liste yeniden çekilmez**, cache'teki sayfa yamanır; yalnız `event:created` sayfanın başında yer değiştirebileceği için sayaçları geçersiz kılar. Kaydırma konumu bozulmaz (PROMPT §7).

---

## 6. Şerit planı

Dalgalar sıralı; dalga içindeki şeritler paralel koşulabilir (dosya kesişimi yok).

### Dalga 0 — Sözleşme (tek şerit, bloklayıcı)

| Ş        | İş                           | Dosyalar                                                                                                                                                   |
| -------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ş0.1** | Tip + zod sözleşmesi         | `packages/types/src/events-screen.ts` (+`.test.ts`), `packages/types/src/index.ts` dışa aktarım                                                            |
| **Ş0.2** | Migration + şema testi       | `packages/db/prisma/schema.prisma`, `rebaseline-migrations/20260821140000_events_screen/migration.sql`, `schema-events-screen.test.mjs`                    |
| **Ş0.3** | Ölçü sözlüğü + parity kapısı | `apps/web/src/lib/events/metrics.ts` (+`parity.test.ts`) — **her px `Etkinlikler-4B.dc.html`'den**, `SPEC_DEVIATIONS` listesi §2'deki 5 kaydı taşır        |
| **Ş0.4** | URL durum sözleşmesi         | `apps/web/src/lib/events/routes.ts` (+test) — `tab/time/source/mine/q/size/week/panel/modal` parse+build; bilinmeyen değer varsayılana düşer               |
| **Ş0.5** | i18n                         | `lib/locale/messages/tr.ts` + `en.ts` — SPEC §9 anahtarları **birebir TR metinle** + ~80 ek anahtar; `messages.test.ts` `events.` önekini zaten denetliyor |
| **Ş0.6** | Yetki biti                   | `lib/workspace/permissions.ts` `MANAGE_EVENTS` + maskeler + testler                                                                                        |

**Kapı:** `pnpm --filter @wizards/types test`, `pnpm --filter @wizards/db test`, migration yerel DB'de koşar.

### Dalga 1 — Veri katmanı (4 paralel şerit)

| Ş      | İş                                                                                                            | Ana dosyalar                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ş1** | Okuma servisi + `GET /api/v1/events` + sayaçlar + `weekDots`                                                  | `lib/events/events-query.ts`, `lib/events/events-service.ts`, `app/api/v1/events/route*.ts`                                                    |
| **Ş2** | Detay ucu + katılımcı rolleri (`listening` = voiceStates)                                                     | `lib/events/detail-service.ts`, `app/api/v1/events/[eventId]/route*.ts`                                                                        |
| **Ş3** | Yazma: `POST /events`, `PUT /rsvp`, `PUT /reminder`, `.ics` + outbox zamanlayıcı + `MANAGE_EVENTS` kapısı     | `lib/events/mutations.ts`, `lib/events/reminder-scheduler.ts`, `lib/events/ics.ts`, ilgili route üçlüleri, `lib/outbox/worker.ts` yeni iş tipi |
| **Ş4** | Socket olayları + istemci realtime yamacı + `useNextEventClock` yeniden bağlama (canlı noktası, hata gizleme) | `lib/socket/events.ts`, `lib/events/realtime.ts`, `hooks/use-next-event-clock.ts`, `components/shell/app-nav-panel.tsx` (yalnız ipucu satırı)  |

**Kapı:** her şerit kendi `route-logic.test.ts` + servis testleriyle yeşil; `pnpm --filter @wizards/web test`.

### Dalga 2 — Ekran (4 paralel şerit)

| Ş      | İş                                                               | Ana dosyalar                                                                                                                             |
| ------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Ş5** | Sayfa iskeleti + akış başlığı + hafta şeridi + daralma kuralı    | `components/events/events-page.tsx`, `events-feed-header.tsx`, `event-week-strip.tsx`                                                    |
| **Ş6** | `EventCard` + ızgara + gün grupları + skeleton + boş/hata durumu | `event-card.tsx`, `event-grid.tsx`, `event-day-group.tsx`, `event-card-skeleton.tsx`, `events-empty-state.tsx`, `events-error-state.tsx` |
| **Ş7** | Sağ ajanda rayı (300 px) + detay paneli (326 px)                 | `event-agenda-rail.tsx`, `event-detail-panel.tsx`, `event-attendee-row.tsx`, `event-reminder-strip.tsx`                                  |
| **Ş8** | Oluştur modalı (560 px) + filtre şeridi + RSVP onay şeridi       | `event-create-modal.tsx`, `event-filter-bar.tsx`, `event-rsvp-strip.tsx`, `event-place-picker.tsx`                                       |

Ş5 sayfayı yazar ve diğer üçünü **slot** olarak yerleştirir (Bahsedilmeler `mentions-page.tsx` deseni): Ş6–Ş8 kendi bileşenlerini bağımsız test eder.

**Kapı:** bileşen testleri + `events-page.test.tsx` yerleşim testi.

### Dalga 3 — Kapanış (tek şerit)

| Ş       | İş                                                                                                                                                                                                                                                                                                 |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ş9**  | Klavye (`←/→/↑/↓` ızgara gezinme, `Enter` detay, `K` katıl, `Esc` merdiveni modal → panel), focus tuzağı, `aria-label`'lar, `article` semantiği, renk-tek-başına-anlam-taşımaz denetimi                                                                                                            |
| **Ş10** | Ölçek adımları (×1/×1.15/×1.5/×2) + §11 küçük ekran kırılımları (`<1100` panel overlay, `<960` şerit yatay kaydırma + tek kolon, `<720` ray kalkar + katlanır "Bugün")                                                                                                                             |
| **Ş11** | Eski ekranın kaldırılması (`screens/events-screen.tsx`, `event-list-row.tsx`, `events-calendar-view.tsx`, `lib/home/side-screens.ts`'in etkinlik parçası, ölü `events.*` anahtarları, `/events/list` + `/calendar` uçları) — Ana Sayfa'daki `/events?view=calendar` bağlantısı yeni rotaya taşınır |
| **Ş12** | Parity + QA: token denetimi (yeni hex araması temiz), 4 çözünürlük × 2 tema ekran görüntüsü, `screens/01…11-durum.png` ile karşılaştırma, e2e                                                                                                                                                      |

---

## 7. Ölçü sözlüğü — çıkarılacak ana değerler

`lib/events/metrics.ts` **renk taşımaz**; yalnız ölçü/yarıçap/boşluk/ağırlık/süre. Doğrudan `.dc.html`'den alınacak bloklar:

```
shell:        radius 26, border α.55, shadow 0 40px 100px -55px α.85
columns:      rail 74*, nav 228*, agendaRail 300, detailPanel 326, createModal 560   (*dokunulmaz)
feedHeader:   padding 15/24, gap 14, borderBottom α.45
              title 600/16.5/1.2 display, sub 500/12/1 body, titleBlock flex 1 1 170
              tabGroup padding 4 radius 13 border α.55 · tab h33 padX 13 radius 10 · font 600/12.5
              tabPill minW 17 h17 radius 6 font 600/10 display · aktif zemin hsl(0 0% 100%/.22)
              iconButton 34×34 radius 11, gap 5
weekStrip:    padding 13/24, gap 12, arrow 28×28 radius 9 border α.7, monthLabel minW 112 600/13
              grid 7 × 1fr gap 6 · dayBox padding 8/4/7 radius 13 · dow 600/9.5 ls .12em
              num 600/17 · dotRow h6 gap 3 · dot 5×5 · bugün zemin α.14 kenar α.45
filterBar:    padding 11/24, label 600/10.5 ls .14em, chip padding 5/8/5/11 radius 999
              chipRemove 16×16 radius 5 · clearAll 600/11.5
rsvpStrip:    margin 14/24/0, padding 12/14, radius 14, icon 30×30 radius 10
              title 600/13, sub 11.5 · addButton h32 · close 28×28
grid:         scroll padding 16/24/20, gap 4 · groupHeader padding 6/2/10
              label 600/10.5 ls .14em · autoFill minmax 280 (büyük 340) gap 12
card:         radius 18 · top padding 13/14/0 gap 11 · kindTile 42×42 radius 14 glif 600/15
              kindPill padding 3/8 radius 999 600/10 · livePill dot 5 · meta 500/10.5
              title 600/15/1.3 ls -.02em · timeRow padding 10/14/0 icon 13 600/12
              srcTile 16×16 radius 5 · place 500/11.5
              attendees padding 11/14/0 avatar 24 overlap -8 ring 2
              actions marginTop 12 padding 11/14/13 borderTop α.5
              joinButton h32 radius 10 · maybeButton h32 padX 12
agendaRail:   header padding 15/16/13 · title 600/14.5 · sub 500/11.5
              body padding 14/16 · hourCol 44 · rule 1.5 · card radius 13 stripe 3
              cardTitle 600/12.5 · cardSub 11 · liveDot 6
              goingRow radius 13 tile 30×30 chevron 14
              footer button h36 borderTop α.5
detailPanel:  header padding 15/16/13 · kindTile 38×38 radius 13 · title 600/15.5 · close 30×30
              body gap 15 padding 15/16 · infoCard radius 14 · hostAvatar 20
              description 12.5/1.6 · attendeeAvatar 28 · reminderStrip zemin α.8
              footer CTA flex 1 h36 borderTop α.5
createModal:  overlay α.62 · card radius 22 shadow 0 40px 90px -40px
              header icon 38×38 · title 600/17 · close 32×32
              body gap 15 padding 19/24 · kindGrid 3 kolon · kindBox radius 13 tile 26×26 ad 600/12
              input h40 radius 12 · durationSegment 3 · placeRow chevron
              toggle 44×26 topuz 20 (açık offset 21, kapalı 3)
              footer İptal + Oluştur h38 radius 12 padX 17–18
emptyState:   icon 78×78 radius 26 border α.3, glif 34 · title 600/20
errorState:   icon α.13 danger · title 600/20 · codeLine 11.5 α.85
```

`parity.test.ts` bu değerleri `.dc.html` metni içinde **birebir arar** (Bahsedilmeler `assertReferenceContains` dili). Sözlük ile referans ayrışırsa test kırmızı olur — pixel sapması bir sonraki dalgaya taşınamaz.

---

## 8. Tür tonları ve glifler

Ton **token adıdır**, renk değil (`lib/events/contracts.ts`):

| Tür           | Token       | Glif | i18n                    |
| ------------- | ----------- | ---- | ----------------------- |
| Sesli buluşma | `--primary` | `S`  | `events.kind.voice`     |
| Toplantı      | `--info`    | `T`  | `events.kind.meeting`   |
| Oyun gecesi   | `--warning` | `O`  | `events.kind.game`      |
| Canlı yayın   | `--danger`  | `C`  | `events.kind.live`      |
| Topluluk      | `--success` | `K`  | `events.kind.community` |
| Atölye        | `--info`    | `A`  | `events.kind.workshop`  |

Soft zemin `hsl(var(--token)/0.14)`, metin `hsl(var(--token))`. **Renk tek başına anlam taşımaz** — her tür pili metnini de taşır (PROMPT §5).

Katılımcı rol pilleri: `Sahibi` → `--primary`, `Katılıyor` → `--success`, `Belki` → `--warning`, `Dinliyor` → `--success`.

---

## 9. Erişilebilirlik ve klavye

- Kart = `<article>`; içindeki `Katıl` / `Belki` gerçek `<button>`; karta tıklama ayrı bir `button` katmanı değil, `article` üzerinde `onClick` **değil** — başlık bir `<button>` olarak sarılır ki klavye hedefi tek olsun.
- İkon-only butonların hepsinde `aria-label` (`Oluştur`, `Kart boyutu`, `Etkinlik bildirimleri`, `Önceki hafta`, `Sonraki hafta`, `Kapat`).
- Sayaçlar metin karşılığı taşır (`aria-label="8 etkinlik"`), pil tek başına sayı göstermez.
- Modal ve panel: `Esc` kapatır (merdiven: modal → panel), focus tuzağı, açılışta ilk odaklanabilir öğe, kapanışta focus tetikleyiciye döner. Merdiven **tek yerde** tanımlanır (`eventsUiReducer` `closeTransient`), iki çağrı yerinde tekrarlanmaz.
- Izgara: `←/→` yatay, `↑/↓` dikey (kolon sayısı ölçülen `auto-fill` sonucundan okunur), `Enter` detay, `K` katıl. İmleç `roving tabindex`.
- Focus stili `ring-ring` token'ından.
- `prefers-reduced-motion`: hover `translateY(-2px)` ve panel geçişi kapanır (`use-prefers-reduced-motion` mevcut).

---

## 10. Ölçekleme ve performans

- Tüm px değerleri `pxToRem` ile rem; **arbitrary px sınıfı yasak** (`w-[300px]` yerine `w-[18.75rem]` değil — sözlükten `style` ile rem). İkonlar `pxToEm`, hairline `hairline()`.
- Ölçek adımı `useUiScale` motorundan gelir; ekran kendi adımını yazmaz. Yoğunluk: ajanda rayı ve "Katılacağım" listesi adım başına daha çok satır gösterir (`lib/events/density.ts`, Ana Sayfa `density.ts` deseni).
- Kolonlar bağımsız yüklenir: ızgara `EventCardSkeleton` (3 kart) çizerken sağ ray kendi verisiyle gelir.
- Izgara sayfalanır (`useInfiniteQuery`, `PAGE_SIZE = 24`); yeni içerik kaydırma konumunu bozmaz (`IntersectionObserver` sentinel, Bahsedilmeler `mentions-feed` deseni — bağımlılıklar **ilkel** olacak, aksi hâlde her render bir sayfa daha çeker).
- Sanallaştırma: kart yüksekliği değişken (başlık 1–2 satır) olduğu için ilk sürümde **sayfalama**; ölçülen kart sayısı 200'ü aşarsa sanallaştırma ayrı iş olarak açılır ve `log` edilir.
- Detay paneli açıldığında ajanda rayı **unmount** olur (aynı anda tek panel kuralı, PROMPT §8).

---

## 11. Kabul kriterleri (PROMPT'un listesi + eklenenler)

- [ ] Sol taraf (sunucu rayı 74, gezinme paneli 228, kullanıcı çubuğu) diff'te **yok**; tek dokunuş `Etkinlikler` satırının ipucu.
- [ ] Nav ipucu + canlı noktası etkinlik verisinden; hata durumunda ipucu render edilmiyor.
- [ ] Yeni hex **yok** (`grep -nE '#[0-9a-fA-F]{3,8}'` yalnız `#fff` beyaz metin için, tasarımdaki gibi).
- [ ] Tipografi `--font-display` / `--font-sans` üzerinden; hiçbir bileşende sabit font adı yok.
- [ ] Başlık tek satır; detay paneli açıkken sekme grubu **ve** ikon grubu `display:none`.
- [ ] Hafta şeridi: 7 gün, ≤4 nokta, bugün vurgulu, hafta ileri/geri çalışıyor (K9), etiket görünen haftanın ayını yazıyor.
- [ ] Kart: tür tile + tür pili doğru ton; canlıda `Canlı` pili + nokta; tekrarda tekrar metni; yaklaşanda `Başlamasına N dk`; avatar yığını 24 px / −8 px / 2 px halka; `Katıl` / `Belki` durumları.
- [ ] Kartta üç nokta menüsü **yok**.
- [ ] `Katıl` → kart kenarı `--success/0.4`, buton `Katılıyorsun`, sağ ray listesi **ve** başlık sayacı **aynı anda** güncelleniyor (iyimser güncelleme + socket doğrulaması).
- [ ] Ajanda rayı 300 px; 44 px saat kolonu + 1,5 px çizgi; canlıda saat yerine `Canlı` + `--danger` nokta.
- [ ] Detay paneli 326 px; ajanda rayının yerini alıyor; rol pilleri; CTA `Katıl` / `Yayına katıl` / `Katılımı geri al`.
- [ ] Oluştur modalı 560 px; 6 tür, başlık, tarih-saat, süre segmenti, yer seçici (K10), `Topluluk keşfetinde listele` anahtarı; `Esc` kapatıyor.
- [ ] Filtre şeridi yalnız aktif filtre varken; her çipin kaldır düğmesi + `Tümünü temizle` çalışıyor; durum URL'de.
- [ ] Boş ve hata durumu metinleri **birebir**; hata kodu satırı var.
- [ ] Tema anahtarı çalışıyor; hiçbir parça tek temaya sabit değil.
- [ ] 1360×920 · 1920×1080 · 2560×1440 · 3840×2160'ta kaydırma/kırpma yok.
- [ ] **Ek:** hatırlatma gerçekten gönderiliyor (outbox işi yazılıyor, saat değişince yeniden zamanlanıyor, RSVP geri alınınca iptal ediliyor).
- [ ] **Ek:** `.ics` indirmesi geçerli dosya üretiyor (`BEGIN:VEVENT`, UTC `DTSTART`, `UID` = eventId).
- [ ] **Ek:** `MANAGE_EVENTS` yetkisi olmayan kullanıcıda üç `Oluştur` girişi de gizli; `POST /events` 403 dönüyor.
- [ ] **Ek:** mobil uçlar eski sözleşmeyle çalışmaya devam ediyor (K12 sözleşme testi).
- [ ] `parity.test.ts` yeşil; `SPEC_DEVIATIONS` 5 kaydı taşıyor.
- [ ] Tip kontrolü, lint, testler geçiyor; placeholder/lorem yok.

---

## 12. Doğrulama komutları

```bash
pnpm --filter @wizards/db db:generate && pnpm --filter @wizards/db test
```

```bash
pnpm --filter @wizards/types test && pnpm --filter @wizards/web test
```

```bash
pnpm typecheck && pnpm lint && pnpm format
```

```bash
pnpm --filter @wizards/web e2e:smoke && pnpm --filter @wizards/web e2e:a11y
```

---

## 13. Riskler ve bilinen tuzaklar

1. **Migration yolu** — Prisma bu depoda `prisma/rebaseline-migrations` okur; `prisma/migrations` altına yazılan migration hiç koşmaz.
2. **`interestedCount` anlam kayması** — K1 sayacın adını değiştirmiyor ama anlamını daraltıyor (`going`). `server-public-profile-service` ve mobil uçlar bu sayacı okuyor; her okuma yeri şerit Ş3'te tek tek doğrulanmalı, aksi hâlde profil kartı "8 ilgili" yerine "8 katılıyor" der ve `maybe` verenler sayıdan düşer. Sözleşme testi bu iki tüketiciyi kilitler.
3. **Sekme sayaçları ile ızgara ayrışması** — sekme pilleri **filtresiz** toplamı gösterir (HTML `EVENTS.length` kullanıyor), ızgara filtreliyi. Sayaç ucunun `time/source/mine/q` uygulamaması bilinçlidir; aksi hâlde "Canlı 1" pili canlı filtre açıkken "1", kapalıyken "1" ama `Tümü` pili filtreye göre oynardı ve sekmeler tıklanamaz görünürdü.
4. **`useNextEventClock` çift sorgu** — hook bugün Ana Sayfa'nın `upcoming` sorgu anahtarını paylaşıyor. Yeni sayaç ucuna geçerken Ana Sayfa "Sıradaki" kartı **aynı** anahtarda kalmalı, yoksa kabuk her rotada ikinci bir istek çıkarır.
5. **`auto-fill minmax` ile klavye gezinme** — kolon sayısı CSS'ten geliyor, JS'in bilmediği bir sayı. `↑/↓` için kolon sayısı `ResizeObserver` + ilk iki kartın `offsetTop` karşılaştırmasıyla ölçülür; tahmin edilmez.
6. **`isPublic` + üyelik `UNION`** — iki dal aynı etkinliği döndürebilir (üye olduğun sunucunun herkese açık etkinliği). `UNION` (`ALL` değil) veya `DISTINCT ON (id)` şart.
7. **Saat dilimi** — gün grupları ve hafta şeridi **izleyicinin** saat diliminde hesaplanır (`resolveAccountTimeZone`, Bahsedilmeler'de mevcut). Sunucu UTC ISO gönderir, kova hesabı istemcide veya sunucuda ama **tek yerde** yapılır; ikisi de yaparsa gece yarısına yakın etkinlikler iki kovaya birden düşer.
8. **Outbox idempotency** — `availableAt` geçmişte kalan bir hatırlatma (etkinlik 5 dk sonra, tercih 10 dk) kuyruğa **yazılmaz**; worker'ın "geçmiş işi hemen gönder" davranışı kullanıcıya "başlamasına 10 dk" diyen bir bildirimi etkinlik başladıktan sonra gönderirdi.

---

## 14. Sonraki adım

Bu plan onaylanınca `docs/prompts/whispr-etkinlikler/` altına şerit başına run-prompt dosyaları (`00-ortak-baglam.md` + `01…12`) yazılır ve Dalga 0 koşulur.
