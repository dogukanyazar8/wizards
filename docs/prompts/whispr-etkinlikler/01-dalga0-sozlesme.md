# Dalga 0 — Sözleşme katmanı

**Ön koşul:** yok. **Bloklayıcı:** Dalga 1 ve 2'nin tamamı bu dalganın kapısına bakar.

Altı alt şerit. Ş0.1 ile Ş0.2 birbirine bakar (tip ↔ şema), diğer dördü bağımsız; hepsi aynı
oturumda ya da paralel açılabilir. Bu dalga **ekran çizmez, uç açmaz** — yalnız donmuş
sözleşmeler bırakır.

---

## Ş0.1 — `@wizards/types` sözleşmesi

### Sahiplenilen dosyalar

- `packages/types/src/events-screen.ts` (yeni) + `events-screen.test.ts`
- `packages/types/src/index.ts` (yalnız dışa aktarım satırı)

### İş

`mentions-screen.ts` ile aynı dil: zod şema + `z.infer` tip + her sapma için yorum.
Dosya başına **§3.1'deki sapma gerekçesi** yazılır (sunucu metin göndermez, sayı+enum gönderir).

**Enumlar**

```ts
export const EventKindSchema = z.enum([
  "voice",
  "meeting",
  "game",
  "live",
  "community",
  "workshop",
]);
export const EventRsvpSchema = z.enum(["going", "maybe"]); // null = yanıt yok
export const EventTabSchema = z.enum(["all", "upcoming", "live", "going"]);
export const EventTimeFilterSchema = z.enum(["today", "week", "month", "past"]);
export const EventMineFilterSchema = z.enum(["going", "maybe", "host"]);
export const EventDayBucketSchema = z.enum(["today", "tomorrow", "week", "past"]);
export const EventAttendeeRoleSchema = z.enum(["host", "going", "maybe", "listening"]);
export const EventCardSizeSchema = z.enum(["medium", "large"]);
export const EventReminderMinutesSchema = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(15),
  z.literal(30),
  z.literal(60),
]); // K5
```

**Ton ve glif haritaları — token adı, renk değil**

```ts
export const EVENT_KIND_TONE: Record<EventKind, string> = {
  voice: "--primary",
  meeting: "--info",
  game: "--warning",
  live: "--danger",
  community: "--success",
  workshop: "--info",
};
export const EVENT_KIND_GLYPH: Record<EventKind, string> = {
  voice: "S",
  meeting: "T",
  game: "O",
  live: "C",
  community: "K",
  workshop: "A",
};
export const EVENT_ATTENDEE_ROLE_TONE: Record<EventAttendeeRole, string> = {
  host: "--primary",
  going: "--success",
  maybe: "--warning",
  listening: "--success",
};
```

Testi bunların **hex içermediğini** doğrular (`assert.ok(!/#|hsl\(/.test(value))`).

**Ana tipler**

- `EventAttendeeSchema` — `{ id, name, initials, avatarUrl: string|null, role: EventAttendeeRole }`
- `WhisprEventSchema` — `PLAN.md` §3.2'deki alanların tamamı. Zorunlu notlar:
  - `channelLabel` sunucudan gelir (`#tasarım-kritiği` / `Sahne · sesli oda` /
    `Topluluk sahnesi` / harici bağlantı başlığı); istemci kanal tipinden metin **üretmez**.
  - `viewerIsMember: boolean` — K3'ün kaynak tile'ı bundan `TK` diline düşer.
  - `attendeePreview` **en çok 3** (`.max(3)`); `goingCount` ayrı alandır, önizleme uzunluğundan
    türetilmez.
  - `startsInMinutes` yalnız **başlamak üzere olan** etkinlikte dolu (eşik `≤ 60`), aksi hâlde
    `null`. Eşik sunucuda uygulanır; istemci "60'tan küçükse yaz" kuralını tekrar etmez.
  - `viewerCanManage: boolean` — `MANAGE_EVENTS` (K4). Detay panelindeki düzenleme yüzeyi ve
    `Oluştur` girişleri buna bakar.
- `EventCountsSchema` — `{ all, upcoming, live, going, liveNow: boolean, nextStartsAt: string|null }`.
  **Filtresizdir** (tuzak #3); şema yorumu bunu söyler.
- `EventWeekDaySchema` — `{ date: 'YYYY-MM-DD', kinds: EventKind[] (max 4), isToday, count }`
- `EventsQuerySchema` — `{ tab, time?, serverId?, mine?, q?, weekStart?, cursor?, limit? }`
- `EventsListResponseSchema` — `{ items, nextCursor: string|null, counts, week: EventWeekDay[] }`
- `EventDetailSchema` — `WhisprEvent` + `{ attendees: EventAttendee[], attendeeMoreCount: number,
reminder, canJoinLive: boolean, joinHref: string|null }`
- `CreateEventInputSchema` — `{ kind, title (1..120), startsAt (ISO, gelecek), durationMinutes
(30|45|60 segment ama şema 5..1440 kabul eder), serverId, channelId?|externalLocation?,
isPublic }`. `channelId` ile `externalLocation` **birlikte verilemez** (`superRefine`).
- `SetEventRsvpSchema` — `{ rsvp: EventRsvp | null }` — **hedef durum**, toggle değil.
- `SetEventReminderSchema` — `{ enabled: boolean, minutesBefore: EventReminderMinutes }`

**UI durum indirgeyicisi** (Bahsedilmeler `MENTIONS_UI_INITIAL_STATE` deseni):

```ts
export const EVENTS_UI_INITIAL_STATE = {
  panel: null,
  createOpen: false,
  cursor: null,
  rsvpBanner: null,
};
export function eventsUiReducer(state, action); // 'openPanel' | 'openCreate' | 'closeTransient' | 'setCursor' | 'showRsvpBanner' | 'dismissRsvpBanner'
```

`closeTransient` merdiveni **tek yerde**: modal → panel → RSVP şeridi. Sayfa bu fonksiyonu
çağırır, sırayı kendi yazmaz.

### Kabul

- [ ] `WhisprEvent` içinde **hiçbir** görüntülenecek Türkçe metin alanı yok (`*Label` yasağı).
- [ ] Ton/glif haritaları hex veya `hsl(` içermiyor.
- [ ] `CreateEventInput` `channelId` + `externalLocation` birlikte verilince reddediyor.
- [ ] `SetEventRsvp` `null` kabul ediyor (yanıtı geri alma).
- [ ] `attendeePreview` 4 eleman verilince reddediyor.
- [ ] `eventsUiReducer` `closeTransient` merdiveni: modal açıkken yalnız modalı, modal kapalı
      panel açıkken yalnız paneli kapatıyor.

---

## Ş0.2 — Migration + Prisma şeması

### Sahiplenilen dosyalar

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/rebaseline-migrations/20260821140000_events_screen/migration.sql` (yeni)
- `packages/db/prisma/schema-events-screen.test.mjs` (yeni)

### İş

`PLAN.md` §3.1'deki şema. Bağlayıcı noktalar:

1. **`ScheduledEventKind` enum** + `ScheduledEvent.kind` (`@default(MEETING)`).
   Backfill `UPDATE`: `entityType='VOICE' → VOICE`, `'STAGE' → LIVE`, `'EXTERNAL' → MEETING`.
2. **`ScheduledEventRsvpStatus` enum** + `ScheduledEventInterest.status` (`@default(GOING)`).
   Mevcut satırlar varsayılanla `GOING` olur — **ayrı bir backfill `UPDATE` gerekmez**, ama
   migration bunu yorumla söyler (bir sonraki okuyucu "backfill unutulmuş" sanmasın).
3. **`ScheduledEvent.maybeCount`** (`@default(0)`). `interestedCount` **yeniden adlandırılmaz**;
   anlamı daralır (K1) ve şema yorumu bunu yazar.
4. **`ScheduledEvent.isPublic`** (`@default(false)`) + `@@index([isPublic, status, scheduledStartAt])`.
5. **`ScheduledEvent.recurrenceRule`** (`String? @db.VarChar(255)`).
6. **`ScheduledEventReminder`** — `@@unique([eventId, userId])`, `@@index([userId])`,
   `onDelete: Cascade` iki tarafta.
7. **`ScheduledEventInterest`** yeni indeks: `@@index([userId, status])`.
8. **`UserNotificationSettings.eventNotifications`** (`@default(true)`).
9. `User` ve `ScheduledEvent` tarafında `reminders` ilişkileri.

`schema-events-screen.test.mjs` (`schema-mentions-screen.test.mjs` dili): enum değerleri,
varsayılanlar, `@@unique`, `@@index` ve `onDelete` davranışlarını **şema metninden** doğrular.

### Kabul

- [ ] `pnpm --filter @wizards/db db:generate` temiz.
- [ ] Migration yerel DB'de koşuyor; `prisma migrate status` temiz.
- [ ] Backfill sonrası `ScheduledEvent.kind` içinde `MEETING` dışı değer var (STAGE/VOICE olan
      satırlar taşınmış) — yoksa yerel DB'de örnek satır oluşturup doğrula.
- [ ] Mevcut `ScheduledEventInterest` satırlarının hepsi `GOING`.
- [ ] Şema testi yeşil.
- [ ] Migration `rebaseline-migrations` altında (tuzak #1).

---

## Ş0.3 — Ölçü sözlüğü + parity kapısı

### Sahiplenilen dosyalar

- `apps/web/src/lib/events/metrics.ts` (yeni)
- `apps/web/src/lib/events/parity.test.ts` (yeni)

### İş

`lib/mentions/metrics.ts` ile **birebir aynı dil**: `pxToRem`/`pxToEm`/`hairline` yeniden ihraç,
`SPEC_DEVIATIONS` dizisi, sonra `EVENTS_METRICS` nesnesi.

**Sözlük renk taşımaz** — yalnız ölçü, yarıçap, boşluk, ağırlık, satır yüksekliği, süre.
Gölge kayıtlarındaki `alpha` bir opaklıktır, renk değil.

Kapsanacak bloklar (`PLAN.md` §7 tam listeyi veriyor): `shell`, `columns`, `feedHeader`,
`weekStrip`, `filterBar`, `rsvpStrip`, `grid`, `card`, `agendaRail`, `detailPanel`,
`createModal`, `emptyState`, `errorState`.

**Her değer `Etkinlikler-4B.dc.html` inline `style`'ından okunur.** SPEC ile çelişirse HTML
kazanır ve satır `SPEC_DEVIATIONS`'a girer. §3.2'deki beş kayıt baştan yazılır.

`parity.test.ts` `assertReferenceContains(fragment)` ile referans HTML metninde **birebir arar**.
Tohum iddialar (kodda okunmuş, doğrulanmış):

```
`width:${columns.agendaRailWidth}px;flex:none`                       → width:300px;flex:none
`width:${columns.detailPanelWidth}px;flex:none`                      → width:326px;flex:none
`width:${createModal.width}px;max-width:100%`                        → width:560px;max-width:100%
`border-radius:${shell.radius}px;border:1px solid hsl(var(--border)/.55)`
`height:${feedHeader.tabHeight}px;padding:0 ${feedHeader.tabPaddingX}px`   → height:33px;padding:0 13px
`width:${feedHeader.iconButtonSize}px;height:${feedHeader.iconButtonSize}px`
`min-width:${weekStrip.monthLabelMinWidth}px;text-align:center`      → min-width:112px
`grid-template-columns:repeat(7,1fr);gap:${weekStrip.gridGap}px`     → gap:6px
`padding:${weekStrip.dayPaddingTop}px ${weekStrip.dayPaddingX}px ${weekStrip.dayPaddingBottom}px`  → 8px 4px 7px
`repeat(auto-fill,minmax(var(--e-min),1fr));gap:${grid.gap}px`       → gap:12px
`height:${card.actionHeight}px;padding:0 ${card.maybePaddingX}px`    → height:32px;padding:0 12px
`box-shadow:0 0 0 ${card.avatarRing}px hsl(var(--surface-card))`     → 0 0 0 2px
`width:${createModal.toggleWidth}px;height:${createModal.toggleHeight}px` → 44px / 26px
`border-radius:${createModal.cardRadius}px`                          → 22px
```

Ayrıca `--e-min` değişkeninin iki değerini (`280px` / `340px`) sözlükten doğrula
(`grid.minColumnWidth` / `grid.minColumnWidthLarge`).

**`detailPanel` zemini `--surface-panel`** (HTML `:483`), `--surface-card` değil — SPEC bu
noktada sessiz, sözlüğe not düşülür.

### Kabul

- [ ] Sözlükte hiçbir renk yok (`grep -nE "hsl\(|#[0-9a-f]{3}" metrics.ts` boş).
- [ ] `parity.test.ts` en az 20 iddia taşıyor ve yeşil.
- [ ] `SPEC_DEVIATIONS` §3.2'deki beş kaydı taşıyor, her biri `{ field, html, spec }` biçiminde.
- [ ] `pxToRem`/`pxToEm`/`hairline` yeniden ihraç edilmiş (tüketiciler `lib/home/metrics`'e
      doğrudan bakmaz).

---

## Ş0.4 — URL durum sözleşmesi

### Sahiplenilen dosyalar

- `apps/web/src/lib/events/routes.ts` (yeni) + `.test.ts`

### İş

`lib/mentions/routes.ts` deseni. **Tek doğruluk kaynağı URL** (PROMPT §8): filtre paylaşılabilir
olmalı ve geri tuşu her ekseni **tek adım** geri almalı.

```
/events?tab=live&time=today&source=<serverId>&mine=going&q=oyun&week=2026-08-24&size=large&panel=<eventId>&modal=create
```

- `parseEventsRouteState(searchParams): EventsRouteState` — bilinmeyen değer **varsayılana
  düşer**, hata fırlatmaz (mistyped bir parametre yüzünden ekran çizilmemesi yanlış tür katılık).
- `buildEventsHref(state, patch): string` — kısmi yama; `null` verilen eksen silinir.
- Varsayılanlar URL'e **yazılmaz** (`tab=all`, `size=medium`, `week=<bu hafta>` parametresiz).
- `week` `YYYY-MM-DD` biçiminde ve **haftanın pazartesisi**dir; başka bir gün verilirse o günün
  pazartesisine yuvarlanır (K9).
- `size` URL'de yoksa `localStorage` okunur; ikisi de yoksa `medium` (K11). Okuma yardımcısı
  (`readStoredCardSize` / `writeStoredCardSize`) burada durur, bileşende değil.
- `matchesEventsRoute(pathname)` — `/events` ve altı.

### Kabul

- [ ] `?tab=zzz` → `all`; `?time=zzz` → `undefined`; `?size=zzz` → `medium`.
- [ ] `?week=2026-08-27` (çarşamba) → `2026-08-24` (pazartesi).
- [ ] `buildEventsHref` varsayılanı URL'e yazmıyor; `tab=all` verince parametre düşüyor.
- [ ] `panel` + `modal` aynı anda verilince `modal` kazanıyor ve `panel` düşüyor
      (aynı anda tek yüzey kuralı — merdivenin URL karşılığı).
- [ ] `localStorage` erişilemez ortamda (`SSR`, gizli mod) `readStoredCardSize` patlamıyor.

---

## Ş0.5 — i18n sözlüğü

### Sahiplenilen dosyalar

- `apps/web/src/lib/locale/messages/tr.ts` (yalnız `events.*` bloğu)
- `apps/web/src/lib/locale/messages/en.ts` (aynı blok)
- `apps/web/src/lib/locale/events-screen-copy.test.ts` (yeni — `mentions-screen-copy.test.ts` dili)

### İş

Bugün 12 `events.*` anahtarı var (`events.calendar.*`, `events.empty`, `events.remind`,
`events.reminded`, `events.title`, `events.view.*`). `events.title` **kalır**; geri kalanı
Ş10'da silinecek — bu şerit **silmez**, yalnız yenilerini ekler (eski ekran hâlâ ayakta).

TR metinleri `SPEC-ETKINLIKLER.md` §3, §4, §5, §6, §7, §9 ve `.dc.html` veri modelinden
**birebir** alınır. Yeniden yazma, kısaltma, "iyileştirme" yok.

Anahtar aileleri (~90 anahtar):

```
events.title / events.title.live / events.title.going / events.title.search / events.title.today
events.tabs.{all,upcoming,live,going}
events.sub.count            {count} etkinlik
events.sub.grouped          Güne göre gruplu
events.sub.searchResults    “{query}” için {count} sonuç
events.sub.live             {count} canlı
events.sub.going            {count} katılım
events.sub.calendarOn       takvim bağlı
events.sub.calendarOff      takvim bağlı değil
events.sub.emptyLine        Yaklaşan etkinlik yok · filtreleri temizleyebilirsin
events.sub.errorLine        Son eşitleme {time} · yerel hatırlatmalar çalışıyor
events.sub.offline          Bağlantı yok
events.kind.{voice,meeting,game,live,community,workshop}
events.day.{today,tomorrow,week,past}
events.week.previous / events.week.next / events.week.dow.{mon…sun}
events.filters.label        AKTİF FİLTRELER
events.filters.clearAll     Tümünü temizle
events.filters.remove       {label} filtresini kaldır
events.filters.mine.{going,maybe,host}
events.filters.time.{today,week,month,past}
events.rsvp.bannerTitle     {title} etkinliğine katılıyorsun
events.rsvp.bannerSub       {day} {time} · başlamadan {minutes} dk önce hatırlatma gönderilecek
events.rsvp.addToCalendar   Takvime ekle
events.card.join / joined / maybe / live / attendees / startsIn / recurrence.weekly …
events.card.sizeToggle      Kart boyutu
events.card.open            {title} etkinliğini aç
events.grid.footer          Geçmiş etkinlikler 30 gün arşivde tutulur
events.agenda.title         Bugün
events.agenda.sub           {date} · {count} etkinlik · {live} canlı
events.agenda.goingLabel    KATILACAĞIM
events.agenda.create        Etkinlik oluştur
events.detail.{hostedBy,description,attendees,more,reminderOn,reminderBefore,reminderChange,
               joinLive,leave,share,close}
events.detail.role.{host,going,maybe,listening}
events.create.{title,subtitle,kindLabel,titleLabel,titlePlaceholder,whenLabel,durationLabel,
               placeLabel,placeExternal,public,publicSub,footerNote,cancel,submit}
events.create.duration.{30,45,60}
events.empty.{title,body,create,clearFilters}
events.error.{title,body,retry,status,code}
events.notifications.toggle Etkinlik bildirimleri
events.a11y.{grid,card,tabList,weekStrip,agendaRail,detailPanel}
```

`en.ts` karşılıkları doğal İngilizce; interpolasyon adları **aynı**.
`messages.test.ts` `events.` önekini zaten denetliyor — iki sözlüğün anahtar kümesi eşit olmalı.

### Kabul

- [ ] TR metinleri SPEC'te geçenlerle **karakter karakter** aynı (test bunu birkaç kritik
      anahtarda literal karşılaştırmayla doğrular: boş durum gövdesi, hata gövdesi, RSVP alt satırı).
- [ ] `tr.ts` ve `en.ts` anahtar kümeleri eşit.
- [ ] Hiçbir anahtar JSX'te sabit metin olarak da tekrarlanmıyor (Ş5–Ş8 bunu tüketecek).
- [ ] Mevcut 12 anahtar **silinmedi** (eski ekran hâlâ ayakta).

---

## Ş0.6 — `MANAGE_EVENTS` yetki biti

### Sahiplenilen dosyalar

- `apps/web/src/lib/workspace/permissions.ts` + ilgili test
- `packages/types` içindeki yetki anahtarı listesi (varsa)
- Rol ayarları arayüzünün yetki listesi (`components/shell/server-settings-overlay.tsx` veya
  eşdeğeri — **yalnız yeni satırın eklenmesi**)

### İş

```ts
MANAGE_EVENTS: 1n << 24n,
```

- `MODERATOR_PERMISSIONS` maskesine eklenir.
- `ensureEventPermission(access)` yardımcısı: `ADMINISTRATOR` **veya** `MANAGE_SERVER`
  **veya** `MANAGE_EVENTS` geçer. Böylece migration'da rol maskesi backfill'i **gerekmez**;
  bugün `MANAGE_SERVER` taşıyan roller yetkiyi kaybetmez.
- Rol ayarları arayüzüne yeni yetki satırı + i18n anahtarı.
- `scheduled-event-service.ts`'deki üç `ensureServerPermission(access, PermissionBits.MANAGE_SERVER)`
  çağrısı `ensureEventPermission(access)`'a taşınır (`:219`, `:303`, `:337`).

### Kabul

- [ ] `ALL_PERMISSIONS` maskesi yeni biti içeriyor; `PERMISSION_KEYS` uzunluğu 1 arttı.
- [ ] `MANAGE_SERVER` taşıyan bir rol `ensureEventPermission`'dan geçiyor (regresyon testi).
- [ ] Yalnız `MANAGE_EVENTS` taşıyan bir rol de geçiyor.
- [ ] Hiçbiri olmayan üye 403 alıyor.
- [ ] Rol ayarları listesinde yeni satır görünüyor ve i18n anahtarı var.

---

## Dalga 0 kapısı

```
pnpm --filter @wizards/db db:generate && pnpm --filter @wizards/db test
```

```
pnpm --filter @wizards/types test
```

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

Üçü de yeşil olmadan Dalga 1 açılmaz.
