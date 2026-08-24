# Dalga 0 — Sözleşme katmanı · rapor

**Tarih:** 2026-08-21 · **Dal:** `uat` · **Commit:** yok (kural gereği)
**Kapsam:** Ş0.1 – Ş0.6, altı alt şeridin tamamı.

Bu dalga ekran çizmedi, uç açmadı. Donmuş sözleşmeler bıraktı: tip, şema, ölçü, adres, metin
ve yetki.

---

## 1. Ne landed

### Ş0.1 — `@wizards/types` sözleşmesi

| Dosya                                      | Durum                |
| ------------------------------------------ | -------------------- |
| `packages/types/src/events-screen.ts`      | yeni, 380 satır      |
| `packages/types/src/events-screen.test.ts` | yeni, 34 test        |
| `packages/types/src/index.ts`              | 1 satır dışa aktarım |

- Dokuz enum: `EventKind` (6), `EventRsvp` (2), `EventTab`, `EventTimeFilter`, `EventMineFilter`,
  `EventDayBucket`, `EventAttendeeRole`, `EventCardSize`, `EventReminderMinutes` (5/10/15/30/60).
- Üç harita **token adı** taşır, renk değil: `EVENT_KIND_TONE`, `EVENT_KIND_GLYPH`,
  `EVENT_ATTENDEE_ROLE_TONE`. Test her değerin `^--[a-z-]+$` kalıbına uyduğunu ve `#`/`hsl(`/`rgb(`
  içermediğini doğruluyor.
- Ana tipler: `EventAttendee`, `EventHost`, `EventReminder`, `WhisprEvent`, `EventCounts`,
  `EventWeekDay`, `EventsQuery`, `EventsListResponse`, `EventDetail`, `CreateEventInput`,
  `SetEventRsvp`, `SetEventReminder`.
- `EVENTS_UI_INITIAL_STATE` + `eventsUiReducer`; `closeTransient` merdiveni **tek yerde**:
  modal → panel → RSVP şeridi.

Kabul listesi:

- [x] `WhisprEvent` içinde görüntülenecek Türkçe metin alanı yok. Test `*Label` kalıbını tarıyor;
      tek eşleşme `channelLabel` ve o sunucudaki verinin kendisi (kanal başlığı), i18n cümlesi değil.
- [x] Ton/glif haritaları hex/`hsl(` içermiyor.
- [x] `CreateEventInput` `channelId` + `externalLocation` birlikte verilince reddediyor (`superRefine`).
- [x] `SetEventRsvp` `null` kabul ediyor.
- [x] `attendeePreview` 4 eleman verilince reddediyor (`.max(3)`).
- [x] `closeTransient` merdiveni test edildi: modal açıkken yalnız modal, modal kapalıyken yalnız panel.

### Ş0.2 — Migration + Prisma şeması

| Dosya                                                                                 | Durum                                  |
| ------------------------------------------------------------------------------------- | -------------------------------------- |
| `packages/db/prisma/schema.prisma`                                                    | 2 enum, 1 model, 8 kolon/ilişki/indeks |
| `packages/db/prisma/rebaseline-migrations/20260821150000_events_screen/migration.sql` | yeni                                   |
| `packages/db/prisma/schema-events-screen.test.mjs`                                    | yeni, 26 test                          |
| `packages/db/package.json`                                                            | test scriptine yeni dosya eklendi      |

- `ScheduledEventKind` (VOICE/MEETING/GAME/LIVE/COMMUNITY/WORKSHOP) + `ScheduledEvent.kind`
  `@default(MEETING)`; backfill `VOICE→VOICE`, `STAGE→LIVE`, `EXTERNAL→MEETING`.
- `ScheduledEventRsvpStatus` (GOING/MAYBE) + `ScheduledEventInterest.status` `@default(GOING)`;
  **backfill `UPDATE` yok**, migration bunu yorumla söylüyor.
- `ScheduledEvent.maybeCount` `@default(0)`; `interestedCount` **yeniden adlandırılmadı**,
  anlamı daraldı (K1) ve şema yorumu bunu yazıyor.
- `ScheduledEvent.isPublic` `@default(false)` + `@@index([isPublic, status, scheduledStartAt])`.
- `ScheduledEvent.recurrenceRule` `String? @db.VarChar(255)`.
- `ScheduledEventReminder` — `@@unique([eventId, userId])`, `@@index([userId])`, iki tarafta
  `onDelete: Cascade`.
- `ScheduledEventInterest` yeni indeks `@@index([userId, status])`.
- `UserNotificationSettings.eventNotifications` `@default(true)`.
- `User.scheduledEventReminders` + `ScheduledEvent.reminders` ilişkileri.

Kabul listesi:

- [x] `pnpm --filter @wizards/db db:generate` temiz (Prisma Client 7.9.1).
- [x] Migration yerel DB'de koştu; `prisma migrate status` → `Database schema is up to date!`
- [x] Backfill sonrası `kind` içinde `MEETING` dışı değer var: yerel DB'deki tek satır
      `entityType='VOICE'` idi ve `kind='VOICE'` oldu. `STAGE→LIVE` ve `EXTERNAL→MEETING` dalları
      **geri alınan** bir işlem içinde sonda satırla ayrıca kanıtlandı (`tmp-stage → LIVE`,
      `tmp-ext → MEETING`), sonrasında DB'de artık satır kalmadı (`left behind: 0`).
- [x] Mevcut `ScheduledEventInterest` satırlarının hepsi `GOING` (2/2).
- [x] Şema testi yeşil (26/26).
- [x] Migration `rebaseline-migrations` altında (tuzak #1).

### Ş0.3 — Ölçü sözlüğü + parity kapısı

| Dosya                                    | Durum                         |
| ---------------------------------------- | ----------------------------- |
| `apps/web/src/lib/events/metrics.ts`     | yeni, 13 blok                 |
| `apps/web/src/lib/events/parity.test.ts` | yeni, 18 test / **110 iddia** |

- `pxToRem` / `pxToEm` / `hairline` yeniden ihraç edildi; tüketiciler `lib/home/metrics`'e
  doğrudan bakmaz.
- Bloklar: `shell`, `columns`, `feedHeader`, `weekStrip`, `filterBar`, `rsvpStrip`, `grid`,
  `card`, `agendaRail`, `detailPanel`, `createModal`, `emptyState`, `errorState`, `navHint`.
- `EVENTS_DENSITY` — ölçek adımı başına sayfalama tavanı (Ş5 tüketecek).

Kabul listesi:

- [x] Sözlükte renk yok. Test yorumları soyup `hsl(|#hex|rgb(` arıyor, sonuç boş.
- [x] `parity.test.ts` 110 iddia taşıyor (asgari 20), hepsi yeşil.
- [x] `SPEC_DEVIATIONS` beş kaydı `{ field, html, spec }` biçiminde taşıyor.
- [x] `pxToRem` / `pxToEm` / `hairline` yeniden ihraç edilmiş.

### Ş0.4 — URL durum sözleşmesi

| Dosya                                    | Durum         |
| ---------------------------------------- | ------------- |
| `apps/web/src/lib/events/routes.ts`      | yeni          |
| `apps/web/src/lib/events/routes.test.ts` | yeni, 32 test |

`parseEventsRouteState`, `buildEventsHref(state, patch)`, `mondayOf`, `parseEventWeekStart`,
`readStoredCardSize` / `writeStoredCardSize` / `resolveEventCardSize`, `matchesEventsRoute`,
`toggleEventTimeFilter`.

Kabul listesi:

- [x] `?tab=zzz` → `all`; `?time=zzz` → filtre yok; `?size=zzz` → `medium`.
- [x] `?week=2026-08-27` (çarşamba) → `2026-08-24` (pazartesi). Pazar da içinde bulunduğu haftaya
      düşüyor, ay ve yıl sınırı geçiliyor (`2027-01-01` → `2026-12-28`).
- [x] `buildEventsHref` varsayılanı URL'e yazmıyor; `tab=all` verince parametre düşüyor.
- [x] `panel` + `modal` birlikte verilince `modal` kazanıyor, `panel` düşüyor.
- [x] `localStorage` yokken (SSR) ve erişilemezken (gizli mod, kota) patlamıyor.

### Ş0.5 — i18n sözlüğü

| Dosya                                                | Durum                        |
| ---------------------------------------------------- | ---------------------------- |
| `apps/web/src/lib/locale/messages/tr.ts`             | **+132** `events.*` anahtarı |
| `apps/web/src/lib/locale/messages/en.ts`             | aynı 132 anahtar             |
| `apps/web/src/lib/locale/events-screen-copy.test.ts` | yeni, 11 test                |

Aileler: `title.*`, `tabs.*`, `sub.*`, `kind.*`, `day.*`, `week.*`, `weekday.*`, `filters.*`,
`rsvp.*`, `card.*`, `duration.*`, `grid.*`, `agenda.*`, `detail.*`, `create.*`, `empty.*`,
`error.*`, `notifications.*`, `a11y.*`, `header.create`.

Kabul listesi:

- [x] TR metinleri SPEC'te geçenlerle karakter karakter aynı — test 102 anahtarı literal
      karşılaştırıyor (boş durum gövdesi, hata gövdesi, RSVP alt satırı dâhil).
- [x] `tr.ts` ve `en.ts` anahtar kümeleri eşit (`messages.test.ts` yeşil).
- [x] Mevcut 12 `events.*` anahtarı **silinmedi**; test onların varlığını ayrıca doğruluyor.

### Ş0.6 — `MANAGE_EVENTS` yetki biti

| Dosya                                                       | Durum                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/web/src/lib/workspace/permissions.ts`                 | `MANAGE_EVENTS: 1n << 24n`, `EVENT_MANAGE_PERMISSIONS`, `requireEventPermission` |
| `apps/web/src/lib/workspace/permissions.test.ts`            | +9 test                                                                          |
| `apps/web/src/lib/workspace/access-context.ts`              | `ensureEventPermission(access)`                                                  |
| `apps/web/src/lib/workspace/scheduled-event-service.ts`     | üç çağrı yeri taşındı                                                            |
| `packages/types/src/workspace.ts`                           | `WorkspacePermissionKeySchema` +1                                                |
| `apps/web/src/components/shell/server-settings-overlay.tsx` | moderatör hazır ayarı + moderasyon grubu + etiket                                |
| `apps/web/src/lib/workspace/permission-service.ts`          | ayrıcalıklı izin önbellek listesine +1 (bkz. §2 ek sapma 5)                      |

Kabul listesi:

- [x] `ALL_PERMISSIONS` yeni biti içeriyor; `PERMISSION_KEYS` uzunluğu 24 → **25**.
- [x] `MANAGE_SERVER` taşıyan rol `requireEventPermission`'dan geçiyor (regresyon testi) —
      bu yüzden migration'da rol maskesi backfill'i **gerekmedi**.
- [x] Yalnız `MANAGE_EVENTS` taşıyan rol de geçiyor; sahip ve `ADMINISTRATOR` da geçiyor.
- [x] Hiçbiri olmayan üye 403 / `FORBIDDEN` alıyor.
- [x] Rol ayarları listesinde yeni satır var (`Etkinlikleri yonet` / `Manage events`).

---

## 2. `SPEC_DEVIATIONS`'a giren sapmalar

`apps/web/src/lib/events/metrics.ts` içindeki dizi, PLAN §3.2'deki beş kaydı taşıyor:

| #   | `field`                        | `html`          | `spec`        | Sonuç                                                                                                                                                  |
| --- | ------------------------------ | --------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `weekStrip.arrowStep`          | `"week"`        | `"month"`     | **hafta** (K9). HTML `title="Önceki hafta"` otorite; PROMPT'un "ay ileri/geri" kriteri düşüyor.                                                        |
| 2   | `card.kindPillLetterSpacing`   | `null`          | `null`        | Sözlükte `null`; SPEC de HTML de sessiz.                                                                                                               |
| 3   | `agendaRail.goingSectionLabel` | `"Katılacağım"` | `"Katılımım"` | **"Katılacağım"**. `"Katılımım"` `.dc.html` içinde bir kez geçiyor ve o dize 4A'nın sol filtre kolonunda; 4B onu çizmiyor. Test bu tekliği doğruluyor. |
| 4   | `feedHeader.titleBranches`     | `5`             | `3`           | HTML davranışı alındı: `feedTitle` kaynak filtresi seçiliyken kaynak adını, `time === 'today'` iken `Bugün` yazıyor.                                   |
| 5   | `grid.dayBucketCount`          | `3`             | `4`           | Tip dört kova taşır (`EventDayBucketSchema`), ızgara üç grup çizer (`grid.dayGroupCount = 3`).                                                         |

### Kayda geçen ek sapmalar (PLAN'da yoktu, uygulamada çıktı)

1. **Migration zaman damgası.** PLAN `20260821140000_events_screen` diyordu; o damga
   `20260821140000_discover_category_languages_channel_activity` tarafından **zaten alınmış**.
   Aynı damgayı paylaşan iki migration'ın uygulanma sırası belirsiz kalırdı, o yüzden
   `20260821150000_events_screen` kullanıldı. Şema testi bunu bir iddia olarak kilitliyor.
2. **`MobilePermissionKeySchema` genişletilmedi.** Ş0.6 "packages/types içindeki yetki anahtarı
   listesi (varsa)" diyor; iki liste var. Web listesi (`WorkspacePermissionKeySchema`) genişledi,
   mobil listesi **bilerek** genişlemedi: `toMobileServerRole` mobil enum'un tanımadığı anahtarları
   zaten düşürüyor, dolayısıyla eski mobil sürüm kırılmıyor (K12). `.max(24)` sınırı da böylece
   geçerli kalıyor.
3. **"undefined" okuması.** Ş0.4 kabul listesi `?time=zzz` sonucunu "undefined" diye anıyor;
   uygulamada bu `null`. Kastedilen "filtre yok"tur ve `lib/mentions/routes.ts` deseni tüm yokluk
   eksenlerinde `null` kullanıyor; iki farklı yokluk tipi taşımamak için `null` seçildi.
4. **Ayrıcalıklı izin önbelleği.** Ş0.6'nın sahiplenilen dosya listesinde yok ama
   `permission-service.ts` içindeki `PRIVILEGED_PERMISSION_CACHE_PERMISSIONS` listesine
   `MANAGE_EVENTS` eklendi. Liste, kanal izni okumalarının önbellek penceresini 15 saniyeye
   kısan moderatör seviyesi bitleri sayıyor; yeni bit oraya konmasaydı geri alınmış bir
   `MANAGE_EVENTS` rolü `MENTION_EVERYONE`den daha uzun süre bayat kalırdı. Bugün etkinlik
   yolları o önbelleği kullanmıyor (sunucu seviyesi `AccessContext` okuyorlar), yani davranış
   değişmiyor; değişen tek şey yeni bitin akranlarıyla aynı kuralı taşıması.
5. **`SPEC-ETKINLIKLER.md` §8 taslak sözleşmesi.** `durationLabel` / `dayBucket: 'Bugün'` /
   `startsInLabel` / `recurrenceLabel` alanları ürüne **girmedi**; yerlerine `durationMinutes`,
   `dayBucket` enum'u, `startsInMinutes` ve `recurrenceRule` geçti. Gerekçe
   `packages/types/src/events-screen.ts` başında yorumla duruyor (00-ortak-baglam §3.1).

---

## 3. Bırakılan `TODO(api):` notları

| Not                               | Yer                                                                  | Ne bekliyor                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `TODO(api): recurrence generator` | `packages/db/prisma/schema.prisma` → `ScheduledEvent.recurrenceRule` | K6: RRULE kolonu var, örnek üreten iş ve kurma UI'ı bu pakette yok. Kart etiketi kuraldan i18n ile türetilir. |

Başka `TODO(api):` bırakılmadı — bu dalga uç açmadığı için karşılığı olmayan bir alan da üretmedi.

---

## 4. Kapı çıktısı

```
pnpm --filter @wizards/db db:generate && pnpm --filter @wizards/db test
  ✔ Generated Prisma Client (7.9.1)
  ℹ tests 25   pass 25   fail 0      (tsx: prisma/seed sözleşmeleri)
  ℹ tests 109  pass 109  fail 0      (node --test: şema sözleşmeleri, 26'sı Etkinlikler)
```

```
pnpm --filter @wizards/types test
  ℹ tests 508  pass 508  fail 0
```

```
pnpm --filter @wizards/web typecheck    → exit 0, çıktı yok
pnpm --filter @wizards/web lint         → ℹ tests 10  pass 10  fail 0 · eslint temiz
pnpm --filter @wizards/web test         → ℹ tests 4276  pass 4272  fail 3   (1 test atlandı)
```

**Web kapısı tam yeşil değil: 3 kırmızı var ve üçü de bu dalganın dışından geliyor.**
Etkinlikler'in sahiplendiği süitlerin hepsi yeşil:

```
✔ events parity — ölçü sözlüğü ↔ referans HTML
✔ events parity — sözlük renk taşımaz
✔ events parity — kayda geçen SPEC sapmaları
✔ events routes — (6 süit)
✔ Etkinlikler metin sözleşmesi
✔ workspace permissions — MANAGE_EVENTS (K4)
✔ workspace permissions — requireEventPermission (K4)
```

Devralınan üç kırmızı:

| Test                                                                                   | Dosya                                   | Kaynak                                                                                                                                                                          |
| -------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requires mutating routes to either parse JSON centrally or be documented as bodyless` | `src/app/api/v1/route-contract.test.ts` | Çalışma ağacındaki **izlenmeyen** `api/v1/mobile/channels/[channelId]/messages/[messageId]/thread-follow` rotaları sözleşme listesine eklenmemiş. Bahsedilmeler/thread işinden. |
| `components/dm bütçeyi aşmaz`                                                          | `src/lib/messages/audit-budget.test.ts` | `components/dm/group-create-dialog.tsx:608` — `background: hsl(${PRESENCE_TONE[...]})`. Dosya çalışma ağacında **değişmiş** (Mesajlar dalgası), token borcu 1 > 0.              |
| `components/dm bütçesi gerçekten harcanmış`                                            | aynı dosya                              | Aynı borç kaydının ikinci yüzü.                                                                                                                                                 |

Bu dalga hiçbir API rotası açmadı ve `components/dm` altına dokunmadı; iki dosya da Dalga 0'ın
diff'inde yok. Düzeltmeleri ilgili paketlere ait, bu yüzden burada **kapatılmadı** — kayda
geçirildi.

### 4.1 Not: `@wizards/types` kırmızısı gerçek değildi

İlk koşuda types paketi 5 kırmızı verdi (`ServerPublicProfileFriendSchema rejected its valid
fixture`, mobil profil `category`/`languages`). Kaynağı **bayat Prisma client**'tı: çalışma
ağacındaki Keşfet işi şemaya kolon eklemiş ama `db:generate` koşmamıştı. Ş0.2'nin generate'inden
sonra aynı komut 508/508 yeşil döndü. Etkinlikler değişiklikleriyle ilgisi yok.

### 4.2 Süreç

Altı şeridin altısı da **test önce** yazıldı ve kırmızı görüldü:

| Şerit | Kırmızı                               | Yeşil |
| ----- | ------------------------------------- | ----- |
| Ş0.1  | `ERR_MODULE_NOT_FOUND: events-screen` | 34/34 |
| Ş0.2  | 18/26 fail                            | 26/26 |
| Ş0.3  | `ERR_MODULE_NOT_FOUND: metrics`       | 18/18 |
| Ş0.4  | `ERR_MODULE_NOT_FOUND: routes`        | 32/32 |
| Ş0.5  | 7/11 fail                             | 11/11 |
| Ş0.6  | derleme hatası (`MANAGE_EVENTS` yok)  | 22/22 |

**Commit atılmadı.**

---

## 5. Dalga 1'e devreden

- `EVENTS_DENSITY` tablosu sözlükte duruyor ama `lib/events/density.ts` **yazılmadı** — Ş5'in işi.
- `EventCounts` **filtresizdir** (tuzak #3). Ş1'in sayaç ucu `time/source/mine/q` uygulamamalı;
  şema yorumu bunu söylüyor ama testi ucun kendi sözleşme testinde olacak.
- `useNextEventClock` hâlâ `homeQueryKeys.upcoming(limit)` anahtarını paylaşıyor (tuzak #4).
  Ş4 yeni sayaç ucuna taşırken bu paylaşımın karşılığını korumak zorunda.
- `interestedCount`un üç tüketicisi (`home/events-service.ts`,
  `servers/server-public-profile-service.ts`, `api/v1/mobile/servers/[serverId]/events/*`) bu
  dalgada **doğrulanmadı**; anlam daralması (K1) Ş3'te tek tek doğrulanıp sözleşme testiyle
  kilitlenecek.
- `ensureEventPermission` yalnız `scheduled-event-service.ts`'in üç yazma yolunda kullanılıyor.
  Yeni uçlar (Ş3) aynı kapıdan geçmeli; `ensureServerPermission(access, MANAGE_SERVER)` yazan
  yeni bir etkinlik yolu sapmadır.
