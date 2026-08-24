# Dalga 1 · Ş1 — Okuma servisi, `GET /api/v1/events`, sayaçlar, hafta noktaları

**Ön koşul:** Dalga 0 kapısı yeşil. **Paralel:** Ş2, Ş3, Ş4.

Ekranın ana kolonunu besleyen tek uç. Ş3'ün yazdığı veriye **beklemeden** yazılır: sözleşme
Dalga 0'da dondu, iki dal (üyelik + herkese açık) baştan yazılır ve boş veriyle test edilir.

---

## Sahiplenilen dosyalar

- `apps/web/src/lib/events/events-query.ts` (yeni — birleşik SQL) + `.test.ts`
- `apps/web/src/lib/events/events-service.ts` (yeni — projeksiyon, sayaç, hafta noktaları) + `.test.ts`
- `apps/web/src/lib/events/presentation.ts` (yeni — gün kovası, saat biçimi, süre, tekrar etiketi) + `.test.ts`
- `apps/web/src/lib/events/client.ts` (yeni — fetch sarmalayıcı + `eventsQueryKeys`) — **`// Ş2` ve
  `// Ş3` sınırlarıyla bölünür**, o bölümleri ilgili şeritler doldurur
- `apps/web/src/lib/events/density.ts` (yeni) + `.test.ts`
- `apps/web/src/app/api/v1/events/route.ts` + `route-logic.ts` + `route-logic.test.ts` (yeni)

**Okunur, yazılmaz:** `lib/home/events-service.ts` (eski; Ş10'da temizlenir),
`lib/home/route-runner.ts`, `lib/workspace/scheduled-event-service.ts`.

---

## İş

### 1. Birleşik sorgu (`events-query.ts`)

İki dal, tek `UNION` (**`ALL` değil** — tuzak #6), `(scheduledStartAt, id)` keyset imleci.

| Dal      | Kapsam                                                                          |
| -------- | ------------------------------------------------------------------------------- |
| `MEMBER` | `serverId IN (izleyicinin üye olduğu sunucular)` — `listViewerServerIds` deseni |
| `PUBLIC` | `isPublic = true` — üyelik aranmaz                                              |

Ortak kurallar:

- **Görünürlük sorgunun kendi süzgecidir**, sonucuna uygulanan bir kontrol değil (mevcut
  `home/events-service.ts` kuralı korunur).
- `status IN ('SCHEDULED','ACTIVE')` varsayılan; `time='past'` dalında `COMPLETED` de girer ve
  `scheduledStartAt < now`.
- `MEMBER` dalı `[serverId, status, scheduledStartAt]` indeksinden, `PUBLIC` dalı Ş0.2'de
  eklenen `[isPublic, status, scheduledStartAt]` indeksinden okur. `EXPLAIN ANALYZE` çıktısı
  rapora eklenir; 30 günlük pencerede seq scan olmamalı.
- İzleyicinin RSVP'si ve hatırlatması **bounded sub-select** ile aynı gidiş-dönüşte gelir
  (`interests: { take: 1, where: { userId } }` deseni), etkinlik başına ikinci sorgu yok.
- `attendeePreview` en çok 3 kişi: `ScheduledEventInterest` `status='GOING'`, `createdAt ASC`.
  Sunucu sahibi önizlemede **ayrıcalıklı değil** (tasarımda host ayrı satırda yazıyor).

### 2. Süzgeçler

| Parametre                 | Etki                                                                      |
| ------------------------- | ------------------------------------------------------------------------- |
| `tab=all`                 | süzgeç yok                                                                |
| `tab=upcoming`            | `status='SCHEDULED'` (canlı olanlar düşer — HTML `!e.live`)               |
| `tab=live`                | `status='ACTIVE'`                                                         |
| `tab=going`               | izleyicinin `status='GOING'` RSVP'si var                                  |
| `time=today`              | izleyicinin saat diliminde bugün                                          |
| `time=week`               | `weekStart`..`weekStart+7g`                                               |
| `time=month`              | `weekStart`in ayı                                                         |
| `time=past`               | `scheduledStartAt < now`, en son 30 gün                                   |
| `serverId`                | kaynak filtresi                                                           |
| `mine=going\|maybe\|host` | RSVP durumu / `creatorId = viewer`                                        |
| `q`                       | `name ILIKE` **+ sunucu adı + kanal adı** üzerinde — **sunucu tarafında** |

**Arama sunucudadır.** İstemci yüklenmiş sayfaları süzmez; sayfalı listede istemci süzgeci yalan
söyler (Bahsedilmeler'de ölçülen tuzak).

### 3. Sayaçlar — filtresiz (tuzak #3)

`EventCounts` `tab` dışındaki **hiçbir** süzgeci uygulamaz. Dört sayı + `liveNow` + `nextStartsAt`:

```sql
-- tek geçiş, aynı görünürlük dallarıyla
SELECT
  COUNT(*)                                             AS all,
  COUNT(*) FILTER (WHERE status = 'SCHEDULED')         AS upcoming,
  COUNT(*) FILTER (WHERE status = 'ACTIVE')            AS live,
  COUNT(*) FILTER (WHERE rsvp = 'GOING')               AS going,
  MIN(scheduled_start_at) FILTER (WHERE status = 'SCHEDULED' AND scheduled_start_at >= now())
                                                       AS next_starts_at
```

`liveNow = live > 0`. Bu yanıt **nav paneli ipucunun da kaynağıdır** (Ş4 buradan okur) —
PROMPT §8 "sayaçlar tek kaynaktan gelir".

### 4. Hafta noktaları (`week`)

`weekStart`ten 7 gün. Her gün: o günün etkinlik **türleri**, `startsAt ASC` sırayla, **en çok 4**
(SPEC §3.2). `isToday` izleyicinin saat diliminde hesaplanır. `count` gün başına toplam etkinlik.

Bu, listenin süzgeçlerinden **bağımsızdır** (hafta şeridi bir gezinme aracıdır, sonucun özeti
değil) — `serverId` ve `q` uygulanmaz, `tab` uygulanmaz.

### 5. Gün kovası ve saat dilimi (tuzak #7)

`dayBucket` **sunucuda** hesaplanır, izleyicinin saat diliminde (`resolveAccountTimeZone` ile
çözülen bölge; hesap tercihi yoksa istek başlığındaki bölge, o da yoksa `Europe/Istanbul`).
İstemci **tekrar hesaplamaz** — iki taraf da hesaplarsa gece yarısına yakın etkinlik iki kovaya
birden düşer.

`presentation.ts` yalnız **istemci tarafı biçimlendirmeyi** taşır (saat metni, süre metni,
`Başlamasına {n} dk`, RRULE → `Her çarşamba`) ve `Intl` ile çalışır; kova kararı vermez.

### 6. Sayfalama ve yoğunluk

- `limit` varsayılan 24, üst sınır 50.
- İmleç `(scheduledStartAt, id)` — `time=past` dalında sıra `DESC`, diğerlerinde `ASC`; imleç
  yönü yanıtta taşınır ki istemci yön kuralını tekrar etmesin.
- `density.ts`: ölçek adımına göre ajanda rayı ve "Katılacağım" satır sayısı
  (`×1: 4/3 · ×1.15: 5/4 · ×1.5: 6/5 · ×2: 8/6`), `lib/home/density.ts` dili.

### 7. Uç

| Uç                   | Girdi                                                                  | Çıktı                |
| -------------------- | ---------------------------------------------------------------------- | -------------------- |
| `GET /api/v1/events` | `tab`, `time`, `serverId`, `mine`, `q`, `weekStart`, `cursor`, `limit` | `EventsListResponse` |

`route-logic.ts` bağımlılık enjeksiyonlu (`runHomeRoute("events:list", …)` deseni);
`route.ts` yalnız varsayılan bağımlılıkları geçirir. Rate limit anahtarı `events:list`.

---

## Kabul

- [ ] Üye olunan sunucunun etkinliği **ve** üye olunmayan sunucunun `isPublic` etkinliği listede;
      üye olunmayan sunucunun **kapalı** etkinliği listede **yok**.
- [ ] Üye olunan sunucunun `isPublic` etkinliği listede **bir kez** görünüyor (`UNION`, tuzak #6).
- [ ] `viewerIsMember` iki dalda da doğru.
- [ ] `tab` dört değerde de doğru süzüyor; `upcoming` canlı olanı düşürüyor.
- [ ] Sayaçlar **filtresiz**: `serverId` filtresi açıkken `counts.all` değişmiyor.
- [ ] `week` 7 gün, gün başına en çok 4 tür, `isToday` izleyicinin saat diliminde.
- [ ] `q` sunucuda: 3 sayfa yüklenmiş listede arama sonucu 1. sayfadan bağımsız doğru.
- [ ] `attendeePreview` en çok 3; `goingCount` önizleme uzunluğundan bağımsız.
- [ ] `startsInMinutes` yalnız `≤ 60` dk kalan etkinlikte dolu.
- [ ] `dayBucket` `Europe/Istanbul` ve `America/New_York` için ayrı ayrı doğru (sınır testi:
      23:30 başlayan etkinlik).
- [ ] İmleç `past` dalında da tutarlı; aynı etkinlik iki sayfada görünmüyor.
- [ ] `EXPLAIN ANALYZE` çıktısı rapora eklendi, iki dalda da index scan.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```
