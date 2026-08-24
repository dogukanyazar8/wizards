# Dalga 1 · Ş1 — Okuma servisi, `GET /api/v1/events`, sayaçlar, hafta noktaları · rapor

**Tarih:** 2026-08-21 · **Dal:** `uat` · **Commit:** yok (kural gereği)
**Kapsam:** `02-dalga1-s1-okuma-api-sayac.md` §1–§7, kabul listesinin tamamı.

Ekranın ana kolonunu besleyen tek uç açıldı. Ş3'ün yazdığı veriye beklenmedi: sözleşme Dalga
0'da dondu, iki dal baştan yazıldı ve boş veriyle test edildi.

---

## 1. Ne landed

| Dosya                                                | Durum                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `apps/web/src/lib/events/events-query.ts`            | yeni, 5 sorgu kurucu + saat dilimi katmanı                        |
| `apps/web/src/lib/events/events-query.test.ts`       | yeni, **39 test**                                                 |
| `apps/web/src/lib/events/events-service.ts`          | yeni, projeksiyon + kova + hafta + yetki                          |
| `apps/web/src/lib/events/events-service.test.ts`     | yeni, **28 test**                                                 |
| `apps/web/src/lib/events/presentation.ts`            | yeni, saat / süre / `Başlamasına` / RRULE                         |
| `apps/web/src/lib/events/presentation.test.ts`       | yeni, **19 test**                                                 |
| `apps/web/src/lib/events/density.ts`                 | yeni, ölçek adımı → satır sayısı                                  |
| `apps/web/src/lib/events/density.test.ts`            | yeni, **5 test**                                                  |
| `apps/web/src/lib/events/client.ts`                  | yeni; **Ş1 bölümü** + `// Ş2` ve `// Ş3` sınırları                |
| `apps/web/src/app/api/v1/events/route-logic.ts`      | yeni (GET dalı)                                                   |
| `apps/web/src/app/api/v1/events/route.ts`            | yeni                                                              |
| `apps/web/src/app/api/v1/events/route-logic.test.ts` | yeni, **11 test** (GET dalı; Ş3 aynı dosyaya POST süitini ekledi) |

**102 test**, hepsi yeşil. Beş dosyanın beşi de **test önce** yazıldı ve kırmızı görüldü
(`ERR_MODULE_NOT_FOUND` × 5, §6.2).

### 1.1 Birleşik sorgu (`events-query.ts`)

İki dal, tek `UNION`:

| Dal      | Kapsam                                           | Ölçülen indeks                                        |
| -------- | ------------------------------------------------ | ----------------------------------------------------- |
| `member` | `serverId IN (izleyicinin üye olduğu sunucular)` | `ScheduledEvent_serverId_status_scheduledStartAt_idx` |
| `public` | `isPublic = TRUE` — üyelik aranmaz               | `ScheduledEvent_isPublic_status_scheduledStartAt_idx` |

- `Prisma.join(branches, " UNION ")` — **`UNION ALL` değil**. Test hem `" UNION "` varlığını hem
  `"UNION ALL"` yokluğunu iddia ediyor.
- **`viewerIsMember` iki dalda da aynı ifadeden gelir** (`memberExpression`). Bu tuzak #6'nın
  asıl yeri: `member` dalına `TRUE`, `public` dalına `FALSE` yazılsaydı aynı etkinlik iki
  **farklı** satır olur ve `UNION` onu tekilleştiremezdi. Test `TRUE AS "viewerIsMember"` ve
  `FALSE AS "viewerIsMember"` dizelerinin **yokluğunu** ve ifadenin tam iki kez geçtiğini
  doğruluyor.
- Görünürlük sorgunun kendi süzgeci: dal `WHERE`'i kapsamı **kuruyor**, sonuca uygulanan bir
  kontrol yok.
- Sunucusu olmayan izleyicide `member` dalı hiç kurulmuyor (`IN ()` geçersiz SQL); üye olunmayan
  bir kaynak süzgeci seçiliyken de kurulmuyor — her satırını eleyerek boşuna okunurdu.
- İzleyicinin RSVP'si ve hatırlatması iki `LEFT JOIN` ile **aynı gidiş-dönüşte** geliyor;
  etkinlik başına ikinci sorgu yok.
- İmleç **dalın içinde** (`(scheduledStartAt, id)` demet karşılaştırması) — dışarı taşınsaydı her
  dal bütün geçmişini okuyup sonra kırpardı.

### 1.2 Sayaçlar — filtresiz (tuzak #3)

`WITH events AS (<UNION>)` üzerinden tek geçiş: `all`, `upcoming`, `live`, `going` ve
`nextStartsAt`. `liveNow = live > 0`.

`buildEventsCountsQuery` `time / serverId / mine / q / tab` süzgeçlerinin **hiçbirini** kurmuyor;
yalnız görünürlük dalları ve `status IN ('SCHEDULED','ACTIVE')` kalıyor. Test, dolu bir kapsamla
(`mine=going, q=oyun, serverId=s1, tab=live`) çağırıp üretilen metinde `ILIKE`,
`e."creatorId" =`, `e."status" = 'ACTIVE'` ve `e."serverId" = ` dizelerinin **hiçbirinin**
bulunmadığını iddia ediyor.

### 1.3 Hafta noktaları

`weekStart`ten yedi gün. Gruplama SQL'de (`GROUP BY localDate, kind`), `date` izleyicinin saat
diliminde üretiliyor (`to_char((… AT TIME ZONE 'UTC') AT TIME ZONE $tz, 'YYYY-MM-DD')`).

Şerit listenin süzgeçlerinden **bağımsız**: `tab`, `serverId`, `mine` ve `q` bu sorguya girmiyor
— şerit bir gezinme aracı, sonucun özeti değil.

Gün başına en çok **4 tür**, `firstStartAt ASC` sırayla; `count` o günün toplam etkinlik sayısı.
Yanıt her zaman **yedi kutu** taşıyor, boş gün de bir kutu.

### 1.4 Gün kovası ve saat dilimi (tuzak #7)

`dayBucket` **sunucuda** hesaplanıyor (`toDayBucket`), izleyicinin saat diliminde. İstemci
tarafında `presentation.ts` yalnız kovayı sözlük anahtarına çeviriyor (`EVENT_DAY_BUCKET_KEY`) —
kova kararı vermiyor. Bu ayrımın testi iki yönlü:

- `presentation.test.ts` yalnız harita eşlemesini doğruluyor; modülde kova hesaplayan bir işlev
  yok.
- `events-service.test.ts` aynı UTC anını (`2026-08-26T21:30Z`) iki bölgede ayrı ayrı
  kovalıyor: `Europe/Istanbul` → `tomorrow`, `America/New_York` → `today`.

Kova **takvim gününe** göre veriliyor, "şimdi"ye göre değil: bugün 09:00'da başlamış canlı bir
etkinlik saat 15:00'te hâlâ `Bugün` grubunda kalıyor. `past` yalnız dünden geriye düşüyor.

Bölge zinciri: hesap tercihi (`UserSettings.timeZone`) → verilen yedek → `Europe/Istanbul`.
`resolveAccountTimeZone` tanımadığı bölgeyi `UTC`ye düşürüyor; burada onun yerine ürünün
varsayılanı geçiyor, çünkü `UTC` hiçbir kullanıcının takvimi değil.

### 1.5 Zaman penceresi indeks dostu

Gün sınırları izleyicinin saat diliminde **JavaScript tarafında** çözülüp sorguya iki
`timestamp` parametresi olarak iniyor (`zonedDayStart`, iki geçişli — yaz saatine geçiş gecesi
tek geçiş bir saat kaydırırdı). `AT TIME ZONE` ile yazılmış bir sınır `scheduledStartAt`
indeksini kullanılamaz hâle getirirdi; §4'teki plan bunun ölçüsü.

### 1.6 Uç

`GET /api/v1/events` · `tab`, `time`, `source`, `mine`, `q`, `week`, `cursor`, `limit` →
`EventsListResponse`. Rate limit anahtarı `events:list` (Dalga 0'da zaten kayıtlı, 120/60 sn).

`route-logic.ts` bağımlılık enjeksiyonlu (`runHomeRoute("events:list", …)`), `route.ts` yalnız
varsayılanları geçiriyor. Ayrıştırma **`lib/events/routes.ts` üzerinden**: adres çubuğunu okuyan
ekran ile uç aynı kuralları kullanıyor, `?tab=zzz` iki tarafta da `all`.

---

## 2. Kayda geçen kararlar ve sapmalar

### 2.1 İmleç yönü **yanıtta değil, imlecin içinde** taşınıyor

PROMPT §6: "imleç yönü yanıtta taşınır ki istemci yön kuralını tekrar etmesin."

`EventsListResponseSchema` Dalga 0'da donduruldu ve içinde yön alanı **yok** (`items`,
`nextCursor`, `counts`, `week`). Sözleşmeyi genişletmek Ş0.1'i geri açmak demekti; istemcinin
yönü kendi tarafında türetmesi de aynı kuralın iki yerde yaşaması.

Üçüncü yol uygulandı: imleç `base64url("asc|<iso>|<id>")` biçiminde **yönü kendi içinde**
taşıyor. İstemci onu opak bir dize olarak geri veriyor; yön kuralı tek yerde
(`resolveEventsOrderDirection`) yaşıyor ve `ORDER BY` ile imleç aynı satırdan okunuyor.

### 2.2 `channelLabel` tanım cümlesi taşımıyor

SPEC §8 `channel` alanına üç örnek veriyor: `#tasarım-kritiği`, `Sahne · sesli oda`,
`Topluluk sahnesi`. İkincisi ve üçüncüsü **Türkçe tanım cümlesi**; sunucudan gönderilseydi
00-ortak-baglam §3.1'in kuralını (sunucu metin göndermez) ve K12'nin mobil uyumunu kırardı.

Ürün karşılığı: `channelLabel` = sunucudaki **verinin kendisi**.

| Kanal tipi                                   | Değer              |
| -------------------------------------------- | ------------------ |
| `TEXT` / `ANNOUNCEMENT` / `FORUM` / `THREAD` | `#<kanal adı>`     |
| `VOICE` / `STAGE`                            | `<kanal adı>`      |
| kanal yok (harici)                           | `externalLocation` |

Tanım cümlesi gerekiyorsa kart onu `kind` alanından kendi sözlüğüyle kurar (`events.kind.*`
zaten Ş0.5'te hazır). Sunucu "sesli oda" kelimesini üretmiyor.

### 2.3 `limit = 0` bir kip: yalnız sayaçlar

Ş4 (paralel şerit) `use-next-event-clock.ts` içinde `fetchEventCounts` ve `?limit=0` bekliyordu;
gezinme panelindeki saat ipucu her rotada çiziliyor ve `/events` dışında karta ihtiyacı yok.

`limit = 0` reddedilmedi, bir kip yapıldı: sayfa sorgusu, katılımcı sorgusu ve hafta sorgusu
**hiç kurulmuyor**; tek `$queryRaw` koşuyor. Ayrıca `week` bu kipte **boş** dönüyor, yedi boş
kutu değil — yedi boş kutu "bu hafta hiç etkinlik yok" demektir ve o soru hiç sorulmadı.

Negatif ve 50 üstü değerler hâlâ 400.

### 2.4 `attendeePreview` rolü: sahibi `host` yazıyor

PROMPT §1: "Sunucu sahibi önizlemede **ayrıcalıklı değil**." Bu bir **sıralama** kuralı ve öyle
uygulandı: önizleme `createdAt ASC` ile katılma sırasını gösteriyor, düzenleyen öne alınmıyor.

Rol **etiketi** ayrı bir eksen: önizlemedeki kişi etkinliğin `creatorId`si ise `role: "host"`,
değilse `role: "going"`. `EventAttendeeRole` bu değeri taşıyor ve doğru olan da bu — sıralamaya
dokunmuyor.

### 2.5 Sorgu metnindeki `COALESCE`

Kabul metni "`name ILIKE` + sunucu adı + kanal adı" diyor. Kanal ve harici bağlantı **nullable**;
`NULL ILIKE` `NULL` döndürür ve `OR` zincirinde sessizce kaybolur. Uygulama
`COALESCE(c."name", '') ILIKE …` yazıyor (harici bağlantı da aynı şekilde aranıyor).

### 2.6 `client.ts` sözleşmesi paralel şeritlerle uzlaştırıldı

Ş1 dosyayı sahipleniyor ama Ş4 çalışma ağacına **önce** indi ve derlenmiş kod dört isim
bekliyordu. Anahtar sözlüğü buna göre yazıldı:

| İsim                          | Neden                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `eventsQueryKeys.lists`       | `setQueriesData` / `getQueriesData` **önek** eşleşmesi; açık olan bütün liste sorguları aynı anda yamanıyor |
| `eventsQueryKeys.counts`      | `?limit=0` kipinin önbellek yeri (ayrı bir uç değil)                                                        |
| `eventsQueryKeys.details(id)` | Ş4'ün `event:updated` yamasının geçersiz kıldığı anahtar                                                    |
| `EVENTS_COUNTS_STALE_TIME_MS` | sorgu seçeneği tek `staleTime` alanı istiyor → nesne değil sayı                                             |

`eventsQueryKeys.list(input)` alanları **opsiyonel** yapıldı: Ş4'ün testleri
`list({ tab: "all" })` ile çağırıyor ve anahtarın arity'si zaten sabit.

Ş2 kendi bölümünü (`fetchEventDetail`) `// Ş2` sınırının altına, Ş3 yazma yollarını `// Ş3`
sınırının altına bu iş sürerken ekledi — sınır yorumları amacına hizmet etti. Ş2'nin
yorumundaki `eventsQueryKeys.detail(eventId)` referansı `details(eventId)` olarak düzeltildi
(tek kelimelik yorum düzeltmesi, kod değişmedi).

---

## 3. Bırakılan `TODO(api):` notları

**Yok.** Bu şeritte karşılığı olmayan bir alan üretilmedi: `WhisprEvent`in her alanı ya bir
kolondan, ya bir `JOIN`den, ya da yetki çözümleyicisinden geliyor.

Dalga 0'ın `TODO(api): recurrence generator` notu yerinde duruyor; `presentation.ts` yalnız
kolondaki RRULE metnini etikete çeviriyor, örnek üretmiyor.

---

## 4. `EXPLAIN ANALYZE` — iki dalda da index scan

Ölçüm gerçek veriyle yapıldı: **24 000 etkinlik**, 60 sunucu, izleyici 6 sunucunun üyesi,
etkinliklerin %12,5'i `isPublic`, başlangıçlar −120…+120 güne yayılmış, 150 RSVP satırı. Kurulum
tek bir işlemde yapıldı, `ANALYZE` koşturuldu ve işlem **geri alındı**
(`left behind: 0` — yerel veritabanında satır kalmadı).

Özet — beş sorgunun onu da (iki dal × beş sorgu) indeks taraması:

| Sorgu                              | `member` dalı                                              | `public` dalı                                              | Süre        |
| ---------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | ----------- |
| sayfa · `tab=all` (süzgeçsiz)      | `Bitmap Index Scan … serverId_idx`                         | `Bitmap Index Scan … isPublic_status_scheduledStartAt_idx` | 9,0 ms      |
| sayfa · `time=week`                | `Bitmap Index Scan … serverId_status_scheduledStartAt_idx` | `Index Scan … isPublic_status_scheduledStartAt_idx`        | **0,79 ms** |
| sayfa · `time=past` (30 gün, DESC) | `Bitmap Index Scan … serverId_status_scheduledStartAt_idx` | `Bitmap Index Scan … isPublic_status_scheduledStartAt_idx` | 1,6 ms      |
| sayaçlar (filtresiz)               | `Bitmap Index Scan … serverId_idx`                         | `Bitmap Index Scan … isPublic_status_scheduledStartAt_idx` | 3,2 ms      |
| hafta noktaları                    | `Bitmap Index Scan … serverId_status_scheduledStartAt_idx` | `Index Scan … isPublic_status_scheduledStartAt_idx`        | 0,45 ms     |

`ScheduledEvent` üzerinde **hiçbir sorguda seq scan yok**. 30 günlük pencerede (`time=past`) da,
7 günlük pencerede de her iki dal indeksten okuyor.

### 4.1 `time=week` — ana kolonun sıcak yolu, iki dal yan yana

```
===== sayfa · time=week (7 günlük pencere) =====
Limit (actual time=0.626..0.631 rows=25.00 loops=1)
  ->  Sort (actual time=0.626..0.629 rows=25.00 loops=1)
        Sort Key: e."scheduledStartAt", e.id
        Sort Method: top-N heapsort  Memory: 34kB
        ->  Unique (actual time=0.551..0.601 rows=192.00 loops=1)
              ->  Sort (actual time=0.550..0.557 rows=204.00 loops=1)
...
  -- member dalı
  ->  Bitmap Heap Scan on "ScheduledEvent" e (actual time=0.045..0.056 rows=84.00 loops=1)
        Recheck Cond: (("serverId" = ANY ('{explain-s1,…,explain-s6}'::text[]))
                       AND (status = ANY ('{SCHEDULED,ACTIVE}'::"ScheduledEventStatus"[]))
                       AND ("scheduledStartAt" >= '2026-08-20 21:00:00'::timestamp without time zone)
                       AND ("scheduledStartAt" <  '2026-08-27 21:00:00'::timestamp without time zone))
        ->  Bitmap Index Scan on "ScheduledEvent_serverId_status_scheduledStartAt_idx"
              (actual time=0.037..0.037 rows=168.00 loops=1)
              Index Searches: 12

  -- public dalı
  ->  Index Scan using "ScheduledEvent_isPublic_status_scheduledStartAt_idx" on "ScheduledEvent" e_1
        (actual time=0.025..0.057 rows=120.00 loops=1)
        Index Cond: (("isPublic" = true)
                     AND (status = ANY ('{SCHEDULED,ACTIVE}'::"ScheduledEventStatus"[]))
                     AND ("scheduledStartAt" >= '2026-08-20 21:00:00'::timestamp without time zone)
                     AND ("scheduledStartAt" <  '2026-08-27 21:00:00'::timestamp without time zone))
Execution Time: 0.789 ms
```

İki gözlem:

1. **Pencere sınırları `timestamp` sabiti olarak indeks koşuluna girmiş** (`2026-08-20
21:00:00` = Istanbul'da 21 Ağustos gece yarısı). Bölge hesabı JavaScript'te yapıldığı için
   planlayıcı sınırı görebiliyor; `AT TIME ZONE` ile yazılsaydı bu satır `Filter` olur ve indeks
   yalnız `serverId + status` kadar daralırdı.
2. **`Unique` düğümü tuzak #6'nın ölçüsü:** 204 satır giriyor, **192** çıkıyor. Aradaki 12 satır,
   izleyicinin üye olduğu sunucuların herkese açık etkinlikleri — iki dala birden düşen ve
   `UNION` tarafından tekilleştirilen satırlar. `UNION ALL` yazılsaydı ızgara o 12 kartı iki kez
   çizerdi.

### 4.2 Sayaç sorgusu

```
===== sayaçlar (filtresiz) =====
Aggregate (actual time=4.489..4.491 rows=1.00 loops=1)
  ->  HashAggregate (actual time=3.886..4.192 rows=4986.00 loops=1)
        Group Key: e.id, ((e.status)::text), e."scheduledStartAt", ((i.status)::text)
        ->  Append (actual time=0.103..2.670 rows=5280.00 loops=1)
              ->  Bitmap Index Scan on "ScheduledEvent_serverId_idx" (rows=2400.00)
              ->  Bitmap Index Scan on "ScheduledEvent_isPublic_status_scheduledStartAt_idx" (rows=2940.00)
Execution Time: 3.214 ms
```

Burada da `HashAggregate` 5280 → 4986: 294 çift satır tekilleştirildi. Sayaç `UNION ALL`
kullansaydı `counts.all` üye olunan sunucuların herkese açık etkinliklerini **iki kez** sayardı
ve sekme pili ızgaradaki kart sayısından fazla gösterirdi.

### 4.3 Ölçülen ve kayda geçen: süzgeçsiz `tab=all` en pahalı dal

`tab=all` + zaman süzgeci yokken sorgunun `scheduledStartAt` üzerinde hiçbir sınırı yok:
`member` dalı `serverId_idx`e düşüyor (bileşik indeksin `status` ve `scheduledStartAt`
sütunları kullanılamıyor), 5280 satır toplanıp `top-N` ile 24'e iniyor — 24 000 satırda 9 ms.

Bu **bir hata değil**, ekranın sözleşmesi: `Tümü` sekmesi arşiv dışındaki her şeyi gösteriyor ve
hafta şeridi bir gezinme aracı, bir süzgeç değil (K9). Kayda geçiriliyor ki ölçek büyüdüğünde
tartışma "neden yavaş" değil "varsayılan bir zaman penceresi ister miyiz" olsun. Ş5 ekranı
kurarken varsayılan `time` seçmezse bu maliyet üretimde de geçerli olacak.

### 4.4 Ham sorguda `timestamp` çözümü — ölçüldü, varsayılmadı

`ScheduledEvent.scheduledStartAt` Postgres'te `timestamp(3) **without** time zone`. Ham sorguda
bunun JavaScript'e nasıl döndüğü bu şeridin bütün kova hesabını belirliyor: `node-postgres`
varsayılanı bu tipi **sürecin yerel saatinde** `Date`e çevirir ve öyle olsaydı `dayBucket`,
`startsInMinutes` ve `startsAt` ISO dizesi sunucunun saat dilimi kadar kayardı.

Ölçüm (süreç `UTC+3`'te, yani kayma olsaydı görünürdü):

```
process TZ offset minutes: -180
a typeof: Date
a iso:    2026-08-26T13:00:00.000Z     <- SELECT TIMESTAMP '2026-08-26 13:00:00'
b iso:    2026-08-21T15:27:35.485Z     <- SELECT NOW()::timestamp
real now: 2026-08-21T15:27:35.487Z
```

Prisma'nın pg adaptörü tipi **UTC** olarak çözüyor; kayma yok. Yazma yönü de simetrik: §4.1'deki
plan, Istanbul'da gece yarısı olan `2026-08-20T21:00:00Z` anını indeks koşuluna
`'2026-08-20 21:00:00'::timestamp without time zone` olarak koymuş.

İki ölçüm betiği de (`EXPLAIN` kurulumu ve bu sonda) geçici dosyalardı; çalıştırıldıktan sonra
silindiler, diff'te yoklar.

---

## 5. Kabul listesi

- [x] **Üye olunan sunucunun etkinliği ve üye olunmayan sunucunun `isPublic` etkinliği listede;
      üye olunmayan sunucunun kapalı etkinliği listede yok.** Dal kapsamı sorgu metniyle kilitli
      (`e."serverId" IN (…)` / `e."isPublic" = TRUE`); §4'teki plan iki dalın da gerçek veride
      kurulduğunu gösteriyor. Kapalı ve üye olunmayan bir etkinliğin düşeceği üçüncü bir dal
      yok.
- [x] **Üye olunan sunucunun `isPublic` etkinliği listede bir kez görünüyor.** `UNION`, ve
      `EXPLAIN` çıktısındaki `Unique` düğümü 204 → 192 (§4.1).
- [x] **`viewerIsMember` iki dalda da doğru.** Tek ifade, iki dalda aynı; test sabit yazımın
      yokluğunu iddia ediyor.
- [x] **`tab` dört değerde de doğru süzüyor; `upcoming` canlı olanı düşürüyor**
      (`status = 'SCHEDULED'`, `ACTIVE` dışarıda).
- [x] **Sayaçlar filtresiz: `serverId` filtresi açıkken `counts.all` değişmiyor.** Sayaç sorgusu
      kaynak süzgecini hiç kurmuyor; hem sorgu testi hem servis testi (`$queryRaw` çağrısının
      metnini okuyarak) doğruluyor.
- [x] **`week` 7 gün, gün başına en çok 4 tür, `isToday` izleyicinin saat diliminde.**
- [x] **`q` sunucuda.** Süzgeç `WHERE`in parçası; istemci yüzeyinde sayfa süzen tek satır kod yok
      (`client.ts` `q`yu parametre olarak geçiyor).
- [x] **`attendeePreview` en çok 3; `goingCount` önizleme uzunluğundan bağımsız.** `ROW_NUMBER()
… rn <= 3`; test 3 önizleme + `goingCount: 42` ile ayrıklığı iddia ediyor.
- [x] **`startsInMinutes` yalnız ≤ 60 dk kalan etkinlikte dolu.** 12 dk → 12, tam 60 dk → 60,
      61 dk → `null`, başlamış → `null`.
- [x] **`dayBucket` `Europe/Istanbul` ve `America/New_York` için ayrı ayrı doğru (23:30 sınır
      testi).** Istanbul'da `tomorrow`, New York'ta `today`.
- [x] **İmleç `past` dalında da tutarlı; aynı etkinlik iki sayfada görünmüyor.** İmleç yönü
      taşıyor, `ORDER BY` ile aynı kaynaktan okunuyor, demet karşılaştırması sıraya birebir
      denk.
- [x] **`EXPLAIN ANALYZE` çıktısı rapora eklendi, iki dalda da index scan** (§4).

---

## 6. Kapı çıktısı

```
pnpm --filter @wizards/web typecheck
```

Ş1'in sahiplendiği **on iki dosyanın hiçbirinde hata yok**. Ağaçta iki kırmızı kaldı ve ikisi de
aynı eksik satırdan geliyor, ikisi de bu şeridin dışından:

```
apps/web/src/lib/events/mutations.ts(1,42):
  error TS2724: '"@wizards/db"' has no exported member named 'ScheduledEventRsvpStatus'.
apps/web/src/lib/workspace/scheduled-event-service.ts(1,37):
  error TS2724: '"@wizards/db"' has no exported member named 'ScheduledEventRsvpStatus'.
```

Kök neden: `packages/db/src/index.ts` üretilen enum'ları **elle** yeniden ihraç ediyor
(`ScheduledEventEntityType`, `ScheduledEventStatus` listede) ve Ş0.2'nin eklediği
`ScheduledEventRsvpStatus` ile `ScheduledEventKind` o listeye girmemiş. Prisma client yeniden
üretildi (`db:generate`, 7.9.1) — sorun üretimde değil, ihraç listesinde. Düzeltme tek satır ama
`packages/db/src/index.ts` ve `mutations.ts` **Ş3'ün** dosyaları ve Ş3 şu anda aynı ağaçta
çalışıyor; §"Sahiplenilen dosyalar" bağlayıcı olduğu için burada kapatılmadı, kayda geçirildi.

```
pnpm --filter @wizards/web lint
```

Ş1 dosyalarında **temiz**. Ağaçtaki iki kırmızı yine dışarıdan:
`components/discover/discover-page.tsx` (4 × `react-hooks/refs`, Keşfet paketi) ve
`lib/events/mutations.ts` (1 × `consistent-type-imports`, Ş3).

```
pnpm --filter @wizards/web test
```

Ş1'in sahiplendiği beş süitin beşi de yeşil:

```
src/lib/events/events-query.test.ts        tests 39  pass 39  fail 0
src/lib/events/events-service.test.ts      tests 28  pass 28  fail 0
src/lib/events/presentation.test.ts        tests 19  pass 19  fail 0
src/lib/events/density.test.ts             tests  5  pass  5  fail 0
src/app/api/v1/events/route-logic.test.ts  tests 17  pass 17  fail 0
   ├─ GET  /api/v1/events (Ş1)              tests 11  pass 11  fail 0
   └─ POST /api/v1/events (Ş3)              tests  6  pass  6  fail 0
                                           ------------------------
   Ş1'in sahiplendikleri                    tests 102 pass 102 fail 0
```

**Tam süit (`4000+` test) bu raporun yazıldığı anda hâlâ koşuyordu:** aynı çalışma ağacında Ş2,
Ş3, Ş4 ve Keşfet paketi paralel çalışıyor ve dördü de aynı süiti aynı anda çalıştırıyor. Ş1'in
sahiplendiği beş süit tek tek koşuldu ve yukarıdaki sonucu verdi; ağaçtaki bilinen kırmızılar
yukarıda tek tek adlandırıldı.

### 6.2 Süreç — test önce

| Modül               | Kırmızı                                | Yeşil |
| ------------------- | -------------------------------------- | ----- |
| `events-query.ts`   | `ERR_MODULE_NOT_FOUND: events-query`   | 39/39 |
| `events-service.ts` | `ERR_MODULE_NOT_FOUND: events-service` | 28/28 |
| `presentation.ts`   | `ERR_MODULE_NOT_FOUND: presentation`   | 19/19 |
| `density.ts`        | `ERR_MODULE_NOT_FOUND: density`        | 5/5   |
| `route-logic.ts`    | `ERR_MODULE_NOT_FOUND: ./route-logic`  | 11/11 |

**Commit atılmadı.**

---

## 7. Dalga 1'in kalanına devreden

- **`packages/db/src/index.ts` ihraç listesi.** `ScheduledEventRsvpStatus` ve
  `ScheduledEventKind` eksik; iki dosyanın derlemesini bu kilitliyor (§6). Ş3'ün işi.
- **`route.ts` POST dalı.** Ş3 `export function POST` ekledi ve `./route-logic`ten
  `eventCreateRoute` bekliyor. GET dalı ve `defaultEventsDependencies` Ş1'in; `eventCreateRoute`
  Ş3 tarafından aynı dosyaya eklenecek. İkisi aynı `runHomeRoute` iskeletini paylaşmalı,
  yazma yolu `ensureEventPermission`ten geçmeli (Dalga 0 devir notu).
- **Varsayılan zaman penceresi kararı.** §4.3: süzgeçsiz `Tümü` sekmesi ölçülen en pahalı dal.
  Ş5 ekranı kurarken bir varsayılan `time` seçerse (ya da seçmemeye karar verirse) bu kayıt
  gerekçe olur.
- **`week: []` kipi.** `limit=0` sayaç kipinde hafta boş dönüyor (§2.3). Ş5 ızgarayı kurarken
  `limit`i yoğunluk tablosundan (`selectEventsDensity(...).gridPageSize`) alacak; `0` yalnız
  kabuk ipucunun değeri.
- **`presentation.ts` `formatEventDayLabel`.** Takvim günü dizesi (`YYYY-MM-DD`) verildiğinde
  `UTC`de biçimlendiriyor — o dize zaten izleyicinin takviminde üretilmiş bir gün, ikinci bir
  bölge çevrimi onu bir gün kaydırırdı. `Date` verildiğinde bölge uygulanıyor. Ş5 grup
  başlıklarını kurarken gün dizesini geçmeli, `Date` değil.
