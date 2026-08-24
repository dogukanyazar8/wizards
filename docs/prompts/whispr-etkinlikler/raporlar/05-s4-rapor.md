# Dalga 1 · Ş4 — Socket olayları, realtime cache yaması, nav paneli saat ipucu · rapor

**Tarih:** 2026-08-21 · **Dal:** `uat` · **Commit:** yok (kural gereği)
**Kapsam:** beş `event:*` olayı, saf cache yaması, herkese açık oda aboneliği ve kabuğun
**tek** dokunulan yeri — `Etkinlikler` satırının saat ipucu.

Bu şerit ekran çizmedi, uç açmadı. Canlı hissi taşıyan katmanı bıraktı: bir başkası RSVP
verdiğinde sayaç kendiliğinden oynuyor, kaydırma konumu bozulmuyor.

---

## 1. Ne landed

| Dosya                                                     | Durum                                                |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `apps/web/src/lib/socket/events.ts`                       | +5 `ServerToClientEvents`, +2 `ClientToServerEvents` |
| `apps/web/src/lib/events/realtime.ts`                     | yeni, 5 yayın + 3 saf yama + cache uygulayıcı        |
| `apps/web/src/lib/events/realtime.test.ts`                | yeni, **19 test**                                    |
| `apps/web/src/hooks/use-events-realtime.ts`               | yeni, abonelik kancası                               |
| `apps/web/src/hooks/use-events-realtime.test.ts`          | yeni, **10 test**                                    |
| `apps/web/src/hooks/use-next-event-clock.ts`              | **yeniden yazıldı**                                  |
| `apps/web/src/hooks/use-next-event-clock.test.ts`         | yeni, **13 test**                                    |
| `apps/web/src/lib/socket/handlers/events.ts`              | yeni (bkz. §3 sapma 1)                               |
| `apps/web/src/lib/socket/handlers/events.test.ts`         | yeni, **3 test**                                     |
| `apps/web/src/lib/socket/handlers/index.ts`               | +2 satır (kayıt)                                     |
| `apps/web/src/lib/events/client.ts`                       | +Ş4 dilimi (bkz. §3 sapma 2)                         |
| `apps/web/src/components/shell/app-nav-panel.tsx`         | **yalnız** `events` satırının ipucu bloğu            |
| `apps/web/src/components/shell/app-nav-panel.test.tsx`    | +7 ipucu testi, fixture güncellendi                  |
| `apps/web/src/components/shell/wizards-shell.tsx`         | 3 satır (prop tipi + import + yorum)                 |
| `apps/web/src/components/messages/messages-rail.test.tsx` | 1 satır fixture                                      |
| `apps/web/src/lib/locale/messages/tr.ts` · `en.ts`        | +2 anahtar (`events.a11y.navHint*`)                  |

### 1.1 Olaylar

```ts
"event:created":      { eventId; isPublic; serverId }
"event:updated":      { eventId; serverId; startsAtChanged }
"event:rsvp":         { eventId; goingCount; maybeCount; serverId }
"event:live:started": { eventId; serverId }
"event:live:ended":   { eventId; serverId }
```

Yayın alanı `server:{serverId}`; `isPublic` etkinlikte ayrıca `events:public`. İki oda tek
`to(a).to(b)` zinciriyle hedeflenir — Socket.IO zinciri odaların **birleşimi**dir, iki odada
birden olan soket olayı bir kez alır. Ayrı iki `emit` çift teslimat demekti; test bunu oda
listesiyle kilitliyor.

`event:rsvp` **kimin** yanıtladığını taşımaz.

İstemci→sunucu tarafında iki olay: `events:public:watch` / `events:public:unwatch`
(`voice:states:watch` dilinde). Sunucu odaları üyelikten geliyor, ikinci abonelik istemiyor.

### 1.2 Yama kuralları

| Olay                 | Yama                                                                                                                         | Test     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- |
| `event:rsvp`         | Kartın `goingCount`/`maybeCount` yazılır. İzleyicinin `rsvp` alanına ve sayfa sayaçlarına **dokunulmaz**.                    | ✔ 3 test |
| `event:live:started` | Kart `isLive: true`, sayfa sayaçları ve hafif sayaç anahtarı `live +1`, `liveNow: true`.                                     | ✔        |
| `event:live:ended`   | Tersi; `live` 0'a inince `liveNow: false`, sayaç negatife düşmez.                                                            | ✔ 2 test |
| `event:updated`      | O etkinliğin **tek kartı** geçersiz kılınır (`eventsQueryKeys.details(id)`), liste değil. `startsAtChanged` ise sayaçlar da. | ✔ 2 test |
| `event:created`      | **Yalnız sayaçlar** geçersiz kılınır + "yeni etkinlik" sinyali. `items` dizisine dokunulmaz.                                 | ✔        |

Yama fonksiyonları saf ve React'sız: `applyEventRsvpToPages(pages, payload)`,
`applyEventLiveToPages(pages, payload, live)`, `applyEventLiveToCounts(counts, live)`. Cache
uygulayıcısı (`createEventsRealtimeHandlers`) **gerçek bir `QueryClient`** ile koşuyor, React
ağacı kurulmuyor. Kanca kendi `setQueryData`sını yazmıyor; test bunu kaynak üzerinden de
doğruluyor (`doesNotMatch(/setQueriesData|setQueryData/)`).

İki ek güvence prompt'ta yoktu, testle kilitlendi:

- **Değişiklik yoksa aynı referans** döner — her olayda yeni bir dizi döndürmek ekranda hiçbir
  sayı oynamadan render tetiklerdi.
- **`live:started` idempotent** — kart cache'te zaten canlıysa hiçbir şey yapılmaz. Yeniden
  bağlanmada tekrar gelen olay sayacı iki kez artırmamalı.

### 1.3 Nav paneli saat ipucu

```ts
useNextEventClock(): { clock: string | null; hidden: boolean; live: boolean }
```

- **Kaynak tek**: `GET /api/v1/events` yanıtının `counts` bloğu.
- `/events` açıkken sayfanın liste yanıtı **yeniden kullanılır** (`getQueriesData` ile açık
  liste anahtarı okunur) ve sorgu `enabled: false` olur → **ikinci istek çıkmaz**.
- Diğer rotalarda hafif anahtar: `eventsQueryKeys.counts` → `GET /api/v1/events?limit=0`.
- Cache okuması `useSyncExternalStore` + `queryCache.subscribe` ile abonelik: socket yaması
  sayaçları yazdığında ipucu ve canlı noktası kendiliğinden oynar.
- `hidden` → sorgu hatalıysa `true`; **elde bayat sayaç olsa bile** ipucu çizilmez. Yanlış bir
  saat, saatsiz bir satırdan kötüdür.
- `clock` izleyicinin `locale`i ve `resolveAccountTimeZone(preferences.timeZone)` ile biçimlenir
  (tuzak #7: kova/saat hesabı **tek yerde**).

---

## 2. Kapsam kanıtı — `app-nav-panel.tsx`

Dosyada değişen **her** yer, `events` satırının ipucuna ait:

| Yer                | Değişiklik                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| import ×2          | `EVENTS_METRICS` (ölçü sözlüğü), `type NextEventClock`                                                                    |
| modül başı         | `const { navHint } = EVENTS_METRICS;`                                                                                     |
| `AppNavPanelProps` | `nextEventClock: string \| null` → `NextEventClock`                                                                       |
| satır gövdesi      | `const eventsClock = row.id === "events" && !nextEventClock.hidden ? … : null`                                            |
| `<Link>`           | `aria-label={eventsClock ? … : undefined}` — `eventsClock` yalnız `events` satırında dolu, diğer dört satırda `undefined` |
| ipucu bloğu        | nokta + saat, ölçüler `navHint`ten                                                                                        |

`Diğer dört satır dokunulmadı` bir **test** olarak duruyor: `home`/`messages`/`mentions`/
`discover` bağlantı gövdelerinde `app-nav-next-event`, `--danger` ve `aria-label` aranıyor,
üçü de yok. Sunucu rayı ve kullanıcı barı dosyalarına hiç dokunulmadı.

**`aria-label` neden `<Link>` üzerinde:** kabul kriteri "canlı bilgisi satırın `aria-label`ında
metin olarak" diyor ve `aria-label` satırın erişilebilir adının **tamamını** ezer, o yüzden
satır etiketi de içine alınır (`Etkinlikler · sıradaki etkinlik 19:30 · şu anda canlı etkinlik
var`). Öznitelik `row.id === "events"` kapısının arkasında; diğer satırların çıktısı bit bit
aynı kaldı.

**Ölçü ve renk:** ipucu `EVENTS_METRICS.navHint` okuyor (11.5 px / 600 / gap 5 / nokta 6 px) —
`HOME_METRICS.panel.trailingTimeFontSize` de 11.5'ti, sayı değişmedi, **kaynak** değişti. Renk:
aktif satırda ipucu satırın kendi rengini (`--primary-readable`) miras alır (SPEC §2 aktif satırı
çiziyor), pasif satırda eskisi gibi `--text-muted`. Nokta `hsl(var(--danger))`, `aria-hidden`.
Çıplak px yok; `reads every measure from HOME_METRICS` testi (px taraması) yeşil kaldı.

---

## 3. Kayda geçen sapmalar

1. **Sunucu tarafı oda kayıtçısı sahiplenilen dosya listesinde yoktu.** Prompt `events.ts` için
   "yalnız `event:*` olayları" diyor ve `events:public` aboneliğini kabul kriteri yapıyor; ama
   `events:public:watch` yayan bir istemcinin karşılığında **odaya alan** bir kayıtçı yoksa oda
   hiç kurulmaz ve `publishEvent*`in herkese açık dalı boşa yayılır. Uydurma uç bırakmamak için
   `lib/socket/handlers/events.ts` (22 satır) yazıldı ve `handlers/index.ts`'e 2 satırla
   kaydedildi. Yetki kapısı yok: odanın içeriği tanım gereği `isPublic`.

2. **`lib/events/client.ts` — üç şeritli paylaşımlı dosya.** Prompt onu "okunur, yazılmaz"
   diyor; Ş4 koştuğunda dosya **yoktu**, sonra Ş2 paralel olarak `ortak önek → Ş1 → Ş2 → Ş3`
   bölmeli hâlini yazdı. Ş4 kendi dilimini o yapıya **ekledi**, üzerine yazmadı:
   `eventsQueryKeys.counts`, `.list(...)`, `.lists`, `.details(...)`,
   `EVENTS_COUNTS_STALE_TIME_MS`, `fetchEventCounts`. Ayrı bir anahtar sözlüğü yazmak
   `setQueriesData` önek eşleşmesini sessizce kırardı — yama yalnız kendi yazdığı anahtarı
   bulurdu.

3. **`eventsQueryKeys.details(eventId)` eklendi.** Ş2'nin `detail(eventId, attendeeCursor)`
   anahtarı imleci de taşıyor; `event:updated` imleci bilmiyor. İmleçli anahtarı geçersiz kılmak
   yalnız ilk katılımcı sayfasını tazelerdi, o yüzden **ön ek** hedefi ayrı bir isimle duruyor.

4. **Prompt'un iki varsayımı kodda yanlıştı.**
   - "`limit` şeması `0` kabul eder (Ş1 destekler)" — `EventsQuerySchema.limit` bugün `.min(1)`
     (Dalga 0). Kayıt `TODO(api):` olarak `client.ts`'te duruyor; Ş1 açtığı uçta `.min(0)`
     yazmazsa hafif istek 400 döner. `packages/types` Ş4'ün sahiplenilen dosyası olmadığı için
     **değiştirilmedi**.
   - "`app-nav-panel.tsx:252` civarı" — ipucu bloğu bugünkü dosyada `:252` değil, `:249`
     civarında; satır numarası değil `row.id === "events"` kapısı otorite alındı.

5. **`useEventsRealtime` bir kez mount edilir.** Kart yamaları idempotent ama **hafif sayaç
   anahtarı** olayın kendisini tanımıyor: iki kopya aynı anda dinlerse `event:live:*` sayacı iki
   kez oynar. Kanca bunu doküman yorumuyla söylüyor. Kabukta mount **edilmedi** (bkz. §6).

---

## 4. Bırakılan `TODO(api):` notları

| Not                                           | Yer                                                                       | Ne bekliyor                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `TODO(api): Ş1 … limit şeması 0 kabul etmeli` | `apps/web/src/lib/events/client.ts` → `EVENTS_COUNTS_STALE_TIME_MS` bloğu | `EventsQuerySchema.limit` `.min(1)` → `.min(0)`; aksi hâlde `?limit=0` 400 döner. |

Başka `TODO(api):` bırakılmadı. `fetchEventCounts` hem `{ counts }` zarfını hem çıplak sayaç
gövdesini tanıyor — `limit=0` yanıtının şekli Ş1'in elinde ve bu okuma o kararı beklemeden
doğru kalıyor.

---

## 5. Ölçüm — ikinci istek

Prompt §4'ün istediği ölçüm:

|                                                                 | Değer                                                |
| --------------------------------------------------------------- | ---------------------------------------------------- |
| `/events` rotasında ek istek                                    | **0** (test: `fetch` sayımı, gerçek `QueryObserver`) |
| Diğer rotalarda ek istek                                        | 1 (`GET /api/v1/events?limit=0`)                     |
| Yanıt gövdesi — yalnız `counts`                                 | **99 B**                                             |
| Yanıt gövdesi — `{items:[], nextCursor, counts, week}` zarfıyla | **777 B** (7 günlük hafta, gün başına 4 tür)         |
| `staleTime`                                                     | **60 sn** (`EVENTS_COUNTS_STALE_TIME_MS`)            |

İkisi de < 1 KB. Ana Sayfa'nın "Sıradaki" kartı `homeQueryKeys.upcoming` anahtarında ve
`/api/v1/events/upcoming` ucunda **kaldı**; kabuk artık o anahtarı paylaşmıyor, yani `/home`
rotasında iki sorgu birden açık.

**Öneri (bu paketin dışında):** "Sıradaki" kartını da yeni sayaç ucuna taşımak. O zaman `/home`
rotasında tek sorgu kalır ve `/api/v1/events/upcoming` ucu Ş10'da `list`/`calendar` ile birlikte
silinebilir. Bugün taşınmadı çünkü kart Ana Sayfa'nın sahiplenilen yüzeyi ve `upcoming` yanıtı
`counts`ta olmayan alanlar (kart gövdesi) taşıyor.

---

## 6. Kapı çıktısı

```
pnpm --filter @wizards/db db:generate
  ✔ Generated Prisma Client (7.9.1)
```

```
pnpm --filter @wizards/web lint
  ℹ tests 10  pass 10  fail 0 · eslint temiz (çıktı yok)
```

```
pnpm --filter @wizards/web typecheck
```

**Tam yeşil değil.** Ş4'ün dosyalarında **0 hata**; kalan altı hatanın hepsi çalışma ağacında
paralel koşan şeritlerden geliyor:

| Hata                                                              | Dosya                                      | Kaynak                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cannot find module './route-logic'` (+2 türev)                   | `app/api/v1/events/route-logic.test.ts`    | **Ş1**, test-önce kırmızısı; modül henüz yazılmamış.                                                                                                                                                           |
| `Cannot find name 'DiscoverGridSlotProps'` (+1)                   | `components/discover/discover-page.tsx`    | Keşfet paketi.                                                                                                                                                                                                 |
| `exactOptionalPropertyTypes` ×2                                   | `lib/discover/servers-service.test.ts`     | Keşfet paketi.                                                                                                                                                                                                 |
| `'@wizards/db' has no exported member 'ScheduledEventRsvpStatus'` | `lib/workspace/scheduled-event-service.ts` | **Ş3**; `packages/db/src/index.ts` yeni enum'u dışa aktarmıyor. Şemada ve üretilen istemcide **var** (`db:generate` koştu), eksik olan tek satırlık re-export. Ş3'ün sahiplenilen dosyası, burada kapatılmadı. |

```
pnpm --filter @wizards/web test
```

Ş4'ün sahiplendiği süitlerin tamamı yeşil (tek tek koşuldu, **45/45**):

```
✔ events realtime — saf yamalar            (9)
✔ events realtime — yayın                  (4)
✔ events realtime — cache uygulayıcı       (6)
✔ events socket handlers                   (3)
✔ useEventsRealtime — herkese açık oda     (3)
✔ useEventsRealtime — abonelik             (7)
✔ useNextEventClock — sayaç kaynağı        (6)
✔ useNextEventClock — ipucu durumu         (5)
✔ useNextEventClock — kabuk sözleşmesi     (2)
✔ AppNavPanel                             (27, 7'si yeni ipucu testi)
```

Tam süit koşusu bu raporun yazıldığı sırada arka planda; sonucu §6.1'e işlenecek.

### 6.1 Süreç — test önce

| Adım                           | Kırmızı                                       | Yeşil |
| ------------------------------ | --------------------------------------------- | ----- |
| `realtime.test.ts`             | `ERR_MODULE_NOT_FOUND: @/lib/events/realtime` | 19/19 |
| `use-next-event-clock.test.ts` | 1 fail (kabuk sözleşmesi)                     | 13/13 |
| `use-events-realtime.test.ts`  | 1 fail (yama mantığı kancada)                 | 10/10 |
| `app-nav-panel.test.tsx`       | 1 fail (kapsam sınırı testi)                  | 27/27 |

İki kırmızı gerçek kusur değildi, **testin kendi kusuruydu**: kaynak taraması yorum metnini de
okuyordu (`homeQueryKeys.upcoming` bir açıklama cümlesinde geçiyordu). İki test dosyası artık
yorumları soyuyor — bir kuralı anlatan yorum, o kuralı çiğneyen kod sanılmamalı.

---

## 7. Dalga 2'ye devreden

- **`useEventsRealtime()` mount edilmedi.** Kanca hazır ama çağıran yok: ekranın kökü
  (Ş6/Ş7'nin `events-page.tsx`'i) onu **bir kez** çağırmalı. Kabukta mount edilmedi, çünkü
  `wizards-shell.tsx` Ş4'ün sahiplenilen dosyası değil ve ekran da mount ederse çift abonelik
  `event:live:*` sayacını iki kez oynatır (§3.5).
- **`newEventCount`** akış başındaki "yeni etkinlik" sinyalini taşıyor; şeridi çizen kim olursa
  `resetNewEvents()` ile temizler.
- **Yayın çağrıları bağlanmadı.** `publishEvent*` fonksiyonları hazır; onları çağıracak yerler
  Ş3'ün (RSVP/oluşturma uçları) ve Ş5'in (canlı yaşam döngüsü) işi. `defaultEventRealtimePublisher`
  tek nesne olarak dışa aktarıldı ki rota testleri beş ayrı sahte yazmasın.
- **`event:updated` yayarken `isPublic`** ikinci argümanla verilir (`{ isPublic }`); olay
  gövdesine konmadı çünkü payload sözleşmesi prompt'ta sabit.
- **Kabuk-istemci paketi riski (Ş2):** `lib/events/client.ts` (`"use client"`) artık
  `lib/events/detail-service.ts`'ten **değer** (`EventDetailResponseSchema`) alıyor ve o dosya
  `@/lib/workspace/...` üzerinden sunucu koduna bağlanıyor. `useNextEventClock` kabukta her
  rotada çalıştığı için bu zincir istemci paketine sunucu kodu çekebilir. Şemayı paylaşılan bir
  tip modülüne taşımak Ş2'nin işi; Ş4 dosyayı yeniden yapılandırmadı.

**Commit atılmadı.**
