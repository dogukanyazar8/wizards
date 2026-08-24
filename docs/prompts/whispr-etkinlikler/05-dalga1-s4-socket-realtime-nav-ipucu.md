# Dalga 1 · Ş4 — Socket olayları, realtime cache yaması, nav paneli saat ipucu

**Ön koşul:** Dalga 0 kapısı yeşil. **Paralel:** Ş1, Ş2, Ş3.

Beş olay, bir cache yamacı ve kabuğun tek dokunulan satırı. Bu şerit ekranın "canlı" hissini
taşıyor: bir başkası RSVP verdiğinde sayaç kendiliğinden oynamalı, kaydırma konumu bozulmadan.

---

## Sahiplenilen dosyalar

- `apps/web/src/lib/socket/events.ts` — yalnız `event:*` olayları
- `apps/web/src/lib/events/realtime.ts` (yeni — yayın yardımcıları + istemci yaması) + `.test.ts`
- `apps/web/src/hooks/use-events-realtime.ts` (yeni) + `.test.ts`
- `apps/web/src/hooks/use-next-event-clock.ts` (yeniden yazılır)
- `apps/web/src/components/shell/app-nav-panel.tsx` — **yalnız** `events` satırının ipucu bloğu
  (`:252` civarı). Başka hiçbir satırına dokunulmaz.

**Okunur, yazılmaz:** `lib/events/client.ts` (Ş1'in `eventsQueryKeys`'i),
`lib/home/client.ts`, `components/providers/socket-provider.tsx`.

---

## İş

### 1. Olaylar

`events.ts`'e beş olay, mevcut isimlendirme diliyle:

```ts
"event:created":      (payload: { eventId: string; serverId: string; isPublic: boolean }) => void;
"event:updated":      (payload: { eventId: string; serverId: string; startsAtChanged: boolean }) => void;
"event:rsvp":         (payload: { eventId: string; serverId: string; goingCount: number; maybeCount: number }) => void;
"event:live:started": (payload: { eventId: string; serverId: string }) => void;
"event:live:ended":   (payload: { eventId: string; serverId: string }) => void;
```

Yayın alanı: `server:{serverId}` odası; `isPublic` etkinlikte ayrıca `events:public` odası.
`events:public` odasına abonelik `/events` rotasında açılır ve rotadan çıkınca kapanır — her
kullanıcıyı kalıcı olarak herkese açık etkinlik trafiğine bağlamak gereksiz.

`event:rsvp` **kimin** yanıt verdiğini taşımaz; yalnız yeni sayıları taşır. İzleyicinin kendi
yanıtı zaten `PUT /rsvp` cevabından geliyor, ikinci bir kaynak ayrışma üretir.

### 2. İstemci yaması (`realtime.ts` + `use-events-realtime.ts`)

**Liste yeniden çekilmez, cache yamalanır.** Kural:

| Olay                 | Yama                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event:rsvp`         | Cache'teki sayfada o kartın `goingCount`/`maybeCount` alanları yazılır. İzleyicinin kendi `rsvp` alanına **dokunulmaz**. Sayaçlar (`counts.going`) yalnız izleyicinin kendi yanıtı değiştiyse oynar — bu olaydan oynamaz. |
| `event:live:started` | Kartın `isLive` alanı `true`, `counts.live` +1, `counts.liveNow = true`. Nav ipucundaki canlı noktası açılır.                                                                                                             |
| `event:live:ended`   | Tersi. `counts.live` 0'a inerse `liveNow = false`.                                                                                                                                                                        |
| `event:updated`      | O etkinliğin cache satırı **geçersiz kılınır** (tek kart), liste değil. `startsAtChanged` ise sayaçlar da geçersiz (sıralama değişebilir).                                                                                |
| `event:created`      | Yalnız **sayaçlar** geçersiz kılınır ve akış başında "yeni etkinlik" sinyali üretilir. Liste kendiliğinden yeniden sıralanmaz — kaydırma konumu bozulur (PROMPT §7).                                                      |

Yama fonksiyonları `realtime.ts`'te **saf**: `(pages, payload) => pages`. Hook yalnız aboneliği
ve `queryClient.setQueryData` çağrısını taşır. Böylece yama mantığı React olmadan test edilir.

Sayfa kimliği: `eventsQueryKeys.list(routeState)`. Olay geldiğinde **açık olan bütün** liste
anahtarları yamanır (`queryClient.setQueriesData` ile önek eşleşmesi), yalnız aktif olan değil —
sekme değiştirince eski sayı görünmemeli.

### 3. Nav paneli saat ipucu (SPEC §2)

Bugün `useNextEventClock()` Ana Sayfa'nın `homeQueryKeys.upcoming(limit)` anahtarını
paylaşıyor ki kabuk ikinci istek çıkarmasın (tuzak #4). Yeni hâli:

```ts
export function useNextEventClock(): { clock: string | null; live: boolean; hidden: boolean };
```

- Kaynak: `GET /api/v1/events` yanıtının `counts` bloğu (`nextStartsAt`, `liveNow`).
- **Ama** kabuk her rotada çiziliyor; `/events` dışındaki rotalarda tam liste çekmek israf.
  Bu yüzden sayaçlar için **hafif bir anahtar** kullanılır: `eventsQueryKeys.counts` →
  `GET /api/v1/events?limit=0`. `limit=0` yalnız `counts` döndürür, `items` boş dizidir.
  Ş1 bu davranışı destekler (`limit` şeması `0` kabul eder).
- `/events` rotasındayken sayfa zaten tam listeyi çekiyor; hook o yanıtın `counts` bloğunu
  **yeniden kullanır** (`queryClient` üzerinden ilk eşleşen liste anahtarı okunur) ve ikinci
  istek çıkmaz. Bu davranış test edilir.
- `hidden` = sorgu hata durumundaysa `true` → **ipucu render edilmez** (SPEC §2).
- `live` → ipucundan önce 6 px `--danger` nokta.
- `clock` biçimi izleyicinin saat diliminde ve `locale`ında (`formatEventClock` deseni).

`app-nav-panel.tsx` değişikliği **yalnız** şu blok:

```tsx
{row.id === "events" && !nextEvent.hidden && nextEvent.clock ? (
  <span …>
    {nextEvent.live ? <span aria-hidden … /> : null}
    {nextEvent.clock}
  </span>
) : null}
```

Nokta `aria-hidden`; canlı bilgisi satırın `aria-label`ına metin olarak eklenir
(renk tek başına anlam taşımaz).

### 4. Ana Sayfa "Sıradaki" kartı

`homeQueryKeys.upcoming` **kalır** ve `/api/v1/events/upcoming` ucunu kullanmaya devam eder.
İki sorgu artık ayrı; kabuk `/home` rotasındayken ikisi de açılır. Ölçüm rapora yazılır: ikinci
istek `limit=0` olduğu için gövdesi küçük (< 1 KB) ve `staleTime` 60 sn.

Alternatif (daha temiz ama daha geniş): "Sıradaki" kartını da yeni sayaç ucuna taşımak.
**Bu paketin dışında** — rapora öneri olarak yazılır.

---

## Kabul

- [ ] Beş olay `events.ts`'te tipli; `ServerToClientEvents` genişledi.
- [ ] `events:public` aboneliği `/events` rotasında açılıyor, çıkınca kapanıyor.
- [ ] `event:rsvp` sayıları yamalıyor, izleyicinin kendi `rsvp` alanına dokunmuyor.
- [ ] `event:created` listeyi yeniden sıralamıyor; kaydırma konumu korunuyor (test:
      `setQueryData` çağrısı `items` dizisine dokunmuyor).
- [ ] Açık olan **bütün** liste anahtarları yamanıyor (iki sekme açıkken ikisi de).
- [ ] Yama fonksiyonları saf ve React'sız test edilebiliyor.
- [ ] `/events` rotasındayken saat ipucu **ikinci istek çıkarmıyor** (test: fetch sayımı).
- [ ] Hata durumunda ipucu render edilmiyor.
- [ ] Canlı etkinlik varken nokta çıkıyor ve `aria-label` canlı bilgisini metin olarak taşıyor.
- [ ] `app-nav-panel.tsx` diff'i yalnız ipucu bloğuna dokunuyor.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```
