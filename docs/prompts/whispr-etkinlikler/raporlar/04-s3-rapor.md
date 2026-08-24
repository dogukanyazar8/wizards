# Dalga 1 · Ş3 — Yazma yolu: oluşturma, RSVP, hatırlatma, `.ics`, canlı geçişi · rapor

**Tarih:** 2026-08-21 · **Dal:** `uat` · **Commit:** yok (kural gereği)
**Kapsam:** `interestedCount` anlam kayması + RSVP + oluşturma + hatırlatma + `.ics` + canlı geçişi.

Bu şerit paketin en riskli yeriydi: mevcut bir sayacın **anlamını** daraltıyor (K1) ve kuyruğa
**zamanlı** iş yazıyor (K5). İkisi de sessizce yanlış olabilecek türden, ikisi de artık sözleşme
testiyle kilitli.

---

## 1. İLK İŞ — `interestedCount` anlam kayması (tuzak #2)

`apps/web/src/lib/events/count-contract.test.ts` yazıldı, **kırmızı görüldü** (6 testin 5'i
düştü), sonra yeşile çevrildi. Kurgu her tüketicide aynı: **3 `GOING` + 2 `MAYBE`**.

### Tüketici tek tek doğrulandı

| Tüketici                                       | Bulunan                                                                                                                                                                             | Yapılan                                                                                                                                                                                                                                                                                             | Testteki literal                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `lib/home/events-service.ts`                   | Sayı doğru (`interestedCount`), **önizleme yanlış**: katılımcı avatar şeridi `status` süzgeci taşımıyordu. Kart "3 kişi katılıyor" yazıp yanına `MAYBE` veren birini çizebiliyordu. | İki okuma yolu da `GOING` ile süzüldü: `getHomeUpcomingEvents`'in `scheduledEventInterest.findMany`'si ve `listTopAttendees`'in ham SQL'i (`AND i."status" = CAST($n AS "ScheduledEventRsvpStatus")` — bağlı parametre, `Prisma.raw` değil). Süzgeç sabiti tek yerde: `HOME_EVENT_ATTENDEE_STATUS`. | `attendeeCount === 3`, önizleme `["going-1","going-2","going-3"]`, `interested === true` (izleyici `MAYBE`) |
| `lib/servers/server-public-profile-service.ts` | Kartı `getUpcomingServerScheduledEventWithDatabase` besliyor; sayı zaten `interestedCount` kolonundan geliyordu, yani K1 sonrası **doğru** ama eksik: `maybeCount` görünmüyordu.    | `SERVER_SCHEDULED_EVENT_SELECT`e `maybeCount`, `kind`, `isPublic` eklendi; `interests` alt-seçimi artık `status` de okuyor. `buildServerScheduledEvent` `maybeCount` ve `rsvpStatus` üretiyor, `viewerInterested` onun boolean izdüşümü.                                                            | `interestedCount === 3`, `maybeCount === 2`, `viewerInterested === true`, `rsvpStatus === "MAYBE"`          |
| `api/v1/mobile/servers/[serverId]/events/*`    | Yanıt `MobileServerScheduledEventResponseSchema.parse`ten geçiyor; zod `z.object` bilinmeyen anahtarı **düşürdüğü** için yeni alanlar şemaya girmeden mobile ulaşamazdı.            | `ServerScheduledEventSchema`ya dört **opsiyonel** alan: `maybeCount`, `kind`, `isPublic`, `rsvpStatus` (K12). `viewerInterested` aynı adla, aynı anlamda kaldı.                                                                                                                                     | Yanıt gövdesinde `interestedCount: 3`, `maybeCount: 2`, `viewerInterested: true`, `rsvpStatus: "MAYBE"`     |

### Dördüncü tüketici — PROMPT'un listesinde yoktu

`lib/discover/events-service.ts` **sayacı yazan tek yol** (`synchronizeInterestedCount`) ve
PROMPT §1'in üç maddelik listesinde geçmiyor. Okuma tarafı zaten `_count.interests where
status: GOING` ile K1 uyumluydu; yazma tarafı `interestedCount`u yeniden sayıp yazarken
`maybeCount`a hiç dokunmuyordu — web'de `MAYBE` verilmiş bir satırı Keşfet'in "ilgilenmiyorum"u
sildiğinde `maybeCount` bayat kalırdı.

Yazma yolu iki sayacı da yeniden sayıp eşitliyor (`countMaybe` + `synchronizeInterestedCount({
interestedCount, maybeCount })`). Delta değil yeniden sayım: Keşfet sildiği satırın önceki
yanıtını bilmiyor ve yeniden sayım kendini onaran tek biçim.

> Not: bu düzeltme çalışma ağacında **paralel bir şerit tarafından da** yapılmıştı; testi
> yazdığımda dosya zaten `countMaybe` taşıyordu. `count-contract.test.ts` onu artık literal
> beklentiyle kilitliyor (`[{ interestedCount: 3, maybeCount: 2 }]`), yani bir sonraki
> değişiklik sessizce geri alamaz.

### i18n

`serverSettings.events.interested` metni sayının yeni anlamına çevrildi:
`"{count} kişi ilgileniyor"` → **`"{count} kişi katılıyor"`** (`en`: `"{count} interested"` →
`"{count} going"`). Sayı `MAYBE` verenleri içermiyor; "ilgileniyor" demek onları da saydığını
iddia etmek olurdu.

**Kapanmadı:** `apps/mobile/src/locale/mobile-copy.ts` içindeki `serverEventInterestCount`
(`"{count} kişi ilgileniyor"`) aynı düzeltmeyi bekliyor. Bu şeridin kapısı `@wizards/web` ve
mobil Etkinlikler ekranı K12 gereği ayrı pakette; kayda geçirildi, **düzeltilmedi**.

---

## 2. Ne landed

### Yeni dosyalar

| Dosya                                                             | Ne                                                                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/events/count-contract.test.ts`                  | Dört tüketiciyi literal beklentiyle kilitler (6 test)                                                                 |
| `apps/web/src/lib/events/mutations.ts` + `.test.ts`               | RSVP çekirdeği + transaction gövdesi, K10/K3 kuralları, `createEvent` / `setEventRsvp` / `setEventReminder` (31 test) |
| `apps/web/src/lib/events/reminder-scheduler.ts` + `.test.ts`      | Outbox zamanlama/iptal/yeniden zamanlama (14 test)                                                                    |
| `apps/web/src/lib/events/ics.ts` + `.test.ts`                     | RFC 5545 tek etkinlik dışa aktarımı (18 test)                                                                         |
| `apps/web/src/lib/events/live-lifecycle.ts` + `.test.ts`          | `SCHEDULED ↔ ACTIVE ↔ COMPLETED` (16 test)                                                                            |
| `apps/web/src/lib/events/notifications.ts` + `.test.ts`           | İki outbox işinin gövdesi (13 test)                                                                                   |
| `apps/web/src/lib/events/write-contract.ts`                       | Yazma yanıtının ortak şeması (sunucu ↔ istemci)                                                                       |
| `apps/web/src/app/api/v1/events/[eventId]/rsvp/route*.ts`         | `PUT` (+7 test)                                                                                                       |
| `apps/web/src/app/api/v1/events/[eventId]/reminder/route*.ts`     | `PUT` (+6 test)                                                                                                       |
| `apps/web/src/app/api/v1/events/[eventId]/calendar.ics/route*.ts` | `GET` (+7 test)                                                                                                       |

### Değişen dosyalar

| Dosya                                                        | Değişiklik                                                                                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/api/v1/events/route.ts` + `route-logic.ts` | **Yalnız `POST`** eklendi; `GET` Ş1'in, dokunulmadı (+6 test)                                                                 |
| `apps/web/src/lib/events/client.ts`                          | Yalnız `// Ş3` sınırının altı: `setEventRsvp`, `setEventReminder`, `createEvent`, `eventCalendarIcsHref`                      |
| `apps/web/src/lib/outbox/service.ts`                         | `OUTBOX_JOB_TYPES` +2 tip, `processOutboxJob` +2 dal                                                                          |
| `apps/web/src/lib/workspace/scheduled-event-service.ts`      | `status` yazımı ortak çekirdeğe taşındı; güncelleme yolu hatırlatmaları yeniden zamanlıyor, iptal yolu bekleyenleri kapatıyor |
| `apps/web/src/lib/home/events-service.ts`                    | Katılımcı önizlemesi `GOING` ile süzüldü (tuzak #2)                                                                           |
| `apps/web/src/lib/discover/events-service.ts`                | `maybeCount` de eşitleniyor                                                                                                   |
| `apps/web/src/lib/api-rate-limit.ts`                         | `events:create` / `events:rsvp` / `events:reminder` / `events:ics`                                                            |
| `apps/web/src/lib/locale/messages/{tr,en}.ts`                | 4 bildirim anahtarı + `serverSettings.events.interested` metni                                                                |
| `packages/types/src/workspace.ts`                            | `ServerScheduledEventSchema` +4 opsiyonel alan (K12)                                                                          |
| `apps/web/src/lib/workspace/scheduled-event-service.test.ts` | Yeni çağrı sırasına göre güncellendi, +2 K1 testi                                                                             |

### RSVP çekirdeği — sayaçlar neden sapmıyor

`resolveEventRsvpDelta(previous, next)` dokuz geçişin tamamını taşıyan **saf** tablo. Yazma yolu
(`writeEventRsvpRow`) önceki durumu okuyup yazmıyor; **gözlüyor**:

1. `rsvp === null` → iki ayrı `deleteMany` (`status: "GOING"`, sonra `"MAYBE"`); hangi sayacın
   düşeceğini etkilenen satır sayısı söyler.
2. Aksi hâlde önce **karşı yanıttaki** satırı çevirmeyi dener (`updateMany`); `count > 0` ise
   geçiş `MAYBE → GOING` (ya da tersi) ve iki sayaç aynı transaction'da oynar.
3. Çevrilecek satır yoksa `createMany` + `skipDuplicates`; `count > 0` ise yeni satır,
   `count === 0` ise satır zaten bu yanıtı taşıyordu — delta sıfır.

Her adım tek atomik deyim, dolayısıyla iki eşzamanlı `going` isteğinde biri satırı yaratır,
diğeri atlar: **tek satır, tek artış**. Okuma-sonra-yazma bunu iki artışa çevirirdi.

`applyEventRsvpCounters` delta sıfırken **hiç deyim çıkarmaz**: değişmeyen bir tık satır kilidi
almaz.

---

## 3. Kabul listesi

- [x] `count-contract.test.ts` üç tüketiciyi de (ve dördüncüsünü) literal beklentiyle kilitliyor.
- [x] `going → maybe → null → going` döngüsü **20 tekrarda** sayaçları sapmadan bırakıyor
      (`{ going: 1, maybe: 0 }`, tek satır).
- [x] İki eşzamanlı `going` tek satır ve tek artış üretiyor; eşzamanlı `maybe → going` ikilisi
      tek geçiş üretiyor.
- [x] `going` verince varsayılan hatırlatma satırı (`enabled: true, minutesBefore: 10`) ve outbox
      işi oluşuyor; `null`'a düşünce satır `enabled: false` oluyor ve iş `CANCELLED`.
- [x] Etkinlik 5 dk sonraysa ve tercih 10 dk ise **iş yazılmıyor**, yanıt `scheduled: false`
      taşıyor. Sınır dâhil: `availableAt === now` de yazılmıyor.
- [x] Etkinlik saati değişince eskiler toplu `CANCELLED`, yeni anahtarla yeni iş `PENDING`.
      Sıra bağlayıcı: **önce** iptal, **sonra** yazma.
- [x] `eventNotifications = false` kullanıcı için hiç iş yazılmıyor — ne RSVP yolunda, ne
      yeniden zamanlamada, ne de teslim anında (worker tercihi yeniden okuyor).
- [x] `MANAGE_EVENTS` olmayan üye `POST /events` → **403** (`ensureEventPermission`, K4).
- [x] Tür ↔ kanal kuralı ihlalinde **422** (`live` metin kanalına konamıyor; `voice` sahneye
      konamıyor; `meeting`/`workshop` ikisinde de kurulabiliyor).
- [x] `isPublic` yalnız `COMMUNITY` sunucuda kabul ediliyor, aksi hâlde **422**.
- [x] `.ics` çıktısı `BEGIN:VEVENT` taşıyor, `DTSTART` UTC (`20260901T150000Z`), Türkçe başlık
      **oktet** üzerinden katlanıyor, satır sonu CRLF ve tek başına `\n` hiç geçmiyor.
- [x] Sesli kanala ilk giriş `ACTIVE` yapıyor; kanal boşalınca `COMPLETED`; iki eşzamanlı giriş
      tek geçiş (`updateMany` + `where: { status: <önceki> }`, ikinci çağrı 0 satır günceller).
- [x] Mobil uç eski sözleşmeyle çalışıyor: `viewerInterested` boolean aynı adla, aynı anlamda
      dönüyor; yeni alanların hepsi opsiyonel.

### Bir kabul maddesinin gerçeği: canlı geçişinin **çağrı yeri bağlanmadı**

`live-lifecycle.ts` yazıldı, sözleşmesi 16 testle kilitlendi ve idempotent. Ama onu çağıracak
yer `lib/voice/service.ts` (`upsertVoiceState` / `clearVoiceState` /
`detachUserFromVoiceSurface`) ve PROMPT §"Sahiplenilen dosyalar" `lib/voice/*`ı **okunur,
yazılmaz** diyor.

Modül `syncEventLiveStateForChannel(client, { channelId, now })` olarak duruyor; doluluktan
türetiyor, olay dinlemiyor, tek satırlık bir çağrıyla takılıyor. Dosyanın içinde
`TODO(Ş4):` notu üç çağrı yerini adıyla sayıyor. **Bugün üretimde hâlâ kimse `ACTIVE`
yazmıyor** — testler modülün doğru olduğunu kanıtlıyor, ürünün canlıya geçtiğini değil.

---

## 4. Kayda geçen sapmalar

`lib/events/metrics.ts` içindeki `SPEC_DEVIATIONS` dizisine **dokunulmadı** (Ş0.3'ün sahiplendiği
artefakt ve `parity.test.ts` beş kaydı sayıyor). Bu şeridin sapmaları burada:

| #   | Sapma                                                                                                                                                                                                                                                    | Karar ve gerekçe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Outbox işleyicisinin yeri.** PROMPT `lib/outbox/worker.ts — yalnız yeni iş tipinin işleyicisi` diyor. Kod tabanında işleyiciler `worker.ts`te değil, `service.ts`teki `processOutboxJob` içinde; `worker.ts` yalnız drenaj döngüsü ve bakım görevleri. | İşleyici dalı `service.ts`e kondu (akranlarının yanına), gövdeler `lib/events/notifications.ts`e. `service.ts` bugün dokuz iş tipinin gövdesini taşıyor; etkinlik metinlerini de oraya koymak dosyayı ikinci kez şişirirdi. `worker.ts`e **hiç dokunulmadı**.                                                                                                                                                                                                                                                                                             |
| 2   | **Metin kanalı → `entityType: EXTERNAL`.** PROMPT üç dal sayıyor (sahne → `STAGE`, sesli → `VOICE`, harici → `EXTERNAL`) ama K10 `meeting`/`workshop` için **metin** kanalına da izin veriyor; enum'da metnin karşılığı yok.                             | `EXTERNAL` seçildi: `entityType` **canlı yüzeyi** anlatır ve metin kanalının canlı yüzeyi yok. `VOICE`/`STAGE` yazmak `attendeeCount`u (`channel._count.voiceStates`) ve `canJoinLive`ı yalan yapardı. `channelId` ve `externalLocation: null` korunuyor, kart yerini kanal adından yazıyor. **Uç:** `apps/mobile/.../server-event-form-screen.tsx` `entityType === "EXTERNAL"`u "kanal yok" diye okuyor; metin kanallı bir etkinliği düzenlerken harici bağlantı alanını gösterir. Okuma yollarında karşılığı yok, yalnız o düzenleme formunda kozmetik. |
| 3   | **Bildirim tipi `SYSTEM`.** `NotificationType` enum'unda etkinlik üyesi yok ve bu şerit şemayı sahiplenmiyor.                                                                                                                                            | `SYSTEM` + `metadata.eventId`; thread yanıtı bildirimlerinin bugün izlediği desenin aynısı. Ayrı bir tip migration ister.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4   | **`write-contract.ts` eklendi** (sahiplenilen dosya listesinde yok).                                                                                                                                                                                     | `detail-contract.ts`in aynı gerekçesi: yazma yanıtının şeması hem sunucuda hem istemcide gerekli ve `client.ts`in `mutations.ts`i içeri alması Prisma'yı tarayıcı paketine taşımak olurdu.                                                                                                                                                                                                                                                                                                                                                                |
| 5   | **`scheduled-event-service.test.ts` güncellendi** (listede yok).                                                                                                                                                                                         | RSVP çağrı sırası K1 ile değişti (`updateMany` → `createMany`, iki `deleteMany`); mevcut üç test eski sırayı iddia ediyordu. +2 yeni K1 testi.                                                                                                                                                                                                                                                                                                                                                                                                            |
| 6   | **`lib/events/notifications.ts` eklendi** (listede yok).                                                                                                                                                                                                 | Bkz. sapma 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 7   | **`ServerScheduledEventSchema` genişletildi** (`packages/types`, listede yok).                                                                                                                                                                           | K12'nin kendisi bunu istiyor: yeni alanlar mobil uçtan **opsiyonel** dönmeli ve zod `z.object` bilinmeyen anahtarı düşürür — şemaya girmeden `maybeCount` mobile ulaşamazdı.                                                                                                                                                                                                                                                                                                                                                                              |
| 8   | **`ScheduledEventRsvpStatus` tipi elle türetildi.** Üretilen Prisma istemcisi bu enum'u adlandırılmış dışa aktarım olarak vermiyor (`ScheduledEventStatus` var, `...RsvpStatus` yok).                                                                    | `Prisma.ScheduledEventInterestGetPayload<{ select: { status: true } }>["status"]` — `detail-service.ts`in Ş2'de kullandığı biçimin aynısı. `mutations.ts` dışa aktarıyor, `scheduled-event-service.ts` oradan alıyor.                                                                                                                                                                                                                                                                                                                                     |

---

## 5. Bırakılan `TODO` notları

| Not                                     | Yer                            | Ne bekliyor                                                                                                                                                                                                                                              |
| --------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TODO(Ş4):` canlı geçişi çağrı yeri     | `lib/events/live-lifecycle.ts` | `syncEventLiveStateForChannel`ı sesli yaşam döngüsüne bağla (`upsertVoiceState`, `clearVoiceState`, `detachUserFromVoiceSurface`) ve dönen geçişleri `event:live:started` / `event:live:ended` olarak yayınla. `lib/voice/*` bu şeritte okunur-yazılmaz. |
| `TODO(Ş4):` etkinliğe özgü socket olayı | `lib/events/notifications.ts`  | Bildirimler bugün genel `notification:new` kanalından yayılıyor; `event:created` / `event:rsvp` Ş4'ün sözlüğünde.                                                                                                                                        |

Uydurma endpoint yok; karşılığı olmayan alan üretilmedi.

---

## 6. Bilinçli sınırlar (bunlar `TODO` değil)

- **Harici etkinlikte otomatik canlı geçişi yok.** Sayacak kanal yok ve bir bağlantıya kimin
  girdiğini Whispr bilmiyor. Sahibi `PUT /events/[eventId]` ile elle başlatır/bitirir.
  `resolveEventLiveTransition` `EXTERNAL` için her zaman `null` döner ve testi var.
- **`maybe` hatırlatmayı iptal etmez.** PROMPT yalnız `null`'a düşüşte iptal diyor; "belki"
  diyen biri de hatırlatılmak isteyebilir.
- **İkinci `Katıl` tıkı hatırlatma dakikasını sıfırlamaz.** Satır `upsert` + `update: {}` ile
  yazılıyor; kullanıcının 30 dakikaya çektiği tercih 10'a dönmez.
- **Teslim anındaki tercih kazanır.** Worker `minutesBefore`u satırdan okuyor; yükteki sayı bir
  yedek, otorite değil. Testi var.

---

## 7. Kapı çıktısı

```
pnpm --filter @wizards/web typecheck    → exit 0, çıktı yok
```

```
pnpm --filter @wizards/web lint         → ℹ tests 10  pass 10  fail 0
                                          eslint: 1 error — DEVRALINAN (bkz. aşağı)
```

```
pnpm --filter @wizards/web test         → ℹ tests 4758  pass 4753  fail 4  (1 atlandı)
```

**Web kapısı tam yeşil değil: 4 kırmızı var ve dördü de bu şeridin diff'inin dışından geliyor.**

### Devralınan kırmızılar — bu şeridin diff'inde yok

| Kırmızı                                                                                | Dosya                                        | Kaynak                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requires mutating routes to either parse JSON centrally or be documented as bodyless` | `src/app/api/v1/route-contract.test.ts`      | Çalışma ağacındaki **izlenmeyen** `mobile/channels/[channelId]/messages/[messageId]/thread-follow` rotaları `BODYLESS_MUTATING_METHOD_PATHS` listesine eklenmemiş. Bahsedilmeler/thread işinden; Dalga 0 raporunda da kayıtlı. Bu şeridin **dört yeni rotası aynı testten geçiyor** — tek eksik satır o iki mobil rota.                                                                                       |
| `components/dm bütçeyi aşmaz` (×2)                                                     | `src/lib/messages/audit-budget.test.ts`      | `components/dm/group-create-dialog.tsx:608` token borcu. Mesajlar dalgasından; Dalga 0 raporunda da kayıtlı.                                                                                                                                                                                                                                                                                                  |
| `hafif istek limit=0 ile gider`                                                        | `src/hooks/use-next-event-clock.test.ts:126` | **Ş1 ↔ Ş4 sözleşme çelişkisi.** Ş4'ün testi `client.ts` kaynağında `/api/v1/events?limit=0` arıyor; Ş1'in `fetchEventCounts`i `"/api/v1/events?tab=all&limit=0"` yazıyor (`client.ts:194`). İki dosya da bu şeritte **okundu, o satıra dokunulmadı** — Ş3 yalnız `// Ş3` sınırının altını yazdı. Çözüm iki şeritten birine ait: ya regex `tab=all`i kabul edecek ya `fetchEventCounts` parametreyi düşürecek. |

Lint tarafında da bir devralınan kırmızı var:

| Kırmızı                           | Dosya                                           | Kaynak                                                                          |
| --------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `react-hooks/set-state-in-effect` | `src/components/discover/discover-page.tsx:414` | Dosya çalışma ağacında **izlenmeyen** (`??`); Keşfet paketinin uncommitted işi. |

Bu şerit `components/dm` altına, `discover-page.tsx`e, `use-next-event-clock.*`a ve `client.ts`in
Ş1 bölümüne dokunmadı. Beşi de kendi paketlerine/şeritlerine ait: **kapatılmadı, kayda geçirildi.**

Bu şeridin sahiplendiği dosyalar `typecheck` ve `eslint`ten temiz geçiyor.

Bu şeridin sahiplendiği süitlerin hepsi yeşil:

```
✔ etkinlik sayaç sözleşmesi — interestedCount = going (K1)     6/6
✔ events mutations — saf kurallar + writeEventRsvpRow          24/24
✔ events reminder-scheduler — K5 outbox zamanlaması            14/14
✔ events ics — RFC 5545 tek etkinlik dışa aktarımı             18/18
✔ events live-lifecycle — SCHEDULED ↔ ACTIVE ↔ COMPLETED       16/16
✔ events notifications — hatırlatma + fan-out                  13/13
✔ PUT /api/v1/events/[eventId]/rsvp                             7/7
✔ PUT /api/v1/events/[eventId]/reminder                         6/6
✔ GET /api/v1/events/[eventId]/calendar.ics                     7/7
✔ POST /api/v1/events                                           6/6
✔ scheduled-event-service (K1 sonrası)                         14/14
✔ outbox service + worker                                      25/25
```

---

## 8. Süreç — test önce

| Modül                | Kırmızı görüldü mü                                                                         | Yeşil |
| -------------------- | ------------------------------------------------------------------------------------------ | ----- |
| `count-contract`     | ✔ 6 testin 5'i düştü (`maybeCount` `undefined`, ham SQL'de `status` yok, `rsvpStatus` yok) | 6/6   |
| `ics`                | ✔ `ERR_MODULE_NOT_FOUND: ics`                                                              | 18/18 |
| `live-lifecycle`     | ✔ `ERR_MODULE_NOT_FOUND: live-lifecycle`                                                   | 16/16 |
| `mutations`          | ✔ `ERR_MODULE_NOT_FOUND: mutations`                                                        | 31/31 |
| `notifications`      | ✔ `ERR_MODULE_NOT_FOUND: notifications`                                                    | 13/13 |
| `reminder-scheduler` | ✘ **modül yazıldıktan sonra koşuldu** — kırmızı gözlenmedi                                 | 14/14 |
| rota testleri        | ✔ (modüller yoktu)                                                                         | 26/26 |

`reminder-scheduler` dışında hepsinde kırmızı önce görüldü. Onda sıra kaçtı; test dosyası
modülden **önce** yazıldı ama ilk koşu modül yazıldıktan sonra oldu.

**Commit atılmadı.**

---

## 9. Ş4'e / sonraki dalgaya devreden

- **Canlı geçişinin çağrı yeri** (§5). Bu bağlanmadan `Canlı` sekmesi, ajanda rayındaki nokta
  ve gezinme panelindeki `--danger` işareti hiç dolmaz.
- **`event:live:started` / `event:live:ended` / `event:created` / `event:rsvp`** yayıncıları.
- **Mobil kopya:** `apps/mobile/src/locale/mobile-copy.ts` → `serverEventInterestCount`
  `"{count} kişi ilgileniyor"` hâlâ eski anlamı yazıyor.
- **`readEventCounts` ve `EventWriteResponse`** `lib/events/mutations.ts`te duruyor ve Ş1'in
  sayaç sorgusunu (`buildEventsCountsQuery`) kullanıyor — ikinci bir toplama yazılmadı. Ş1 ile
  aynı nesneden okuyorlar; ayrışma riski yok.
- **`recurrenceRule`** hâlâ üretici iş beklemiyor (K6, Dalga 0'ın `TODO(api)`si). Oluşturma ucu
  bu alanı **yazmıyor**; modalda karşılığı yok.
- **Ş1 ↔ Ş4 `limit=0` çelişkisi** (§7). Sayaç ucunun adresi iki şeritte iki farklı biçimde
  yazılmış; ikisinden biri diğerine uymalı.
- **`CreateEventInputSchema` `description` taşımıyor.** Oluşturma ucu bu yüzden açıklama
  yazmıyor ve yeni etkinliğin `description`ı `null` doğuyor (`getEventDetail` onu `""`e
  çeviriyor). Tasarımdaki oluştur modalında da açıklama alanı yok; Dalga 2 modal şeridi bir
  alan isterse sözleşme (Ş0.1) genişlemeli.
