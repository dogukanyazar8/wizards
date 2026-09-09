# Dalga 1 · Ş2 — Bildirim merkezi API: sekmeler, gün grupları, çevirme, sayaçlar, socket

**Ön koşul:** Ş0 kapısı yeşil. **Paralel:** Ş1, Ş3, Ş4.

400 px panelin tek veri kaynağı. Panel 4 sekme, gün grubu, satır bazında **çevirme** ve dört ayrı
okunmamış sayacı istiyor; bugünkü uç bunların hiçbirini bilmiyor.

Önce `00-ortak-baglam.md` okunur.

---

## Sahiplenilen dosyalar

- `apps/web/src/lib/notifications/service.ts` (**düzenlenir**) + `service.test.ts`
- `apps/web/src/lib/notifications/panel-query.ts` (yeni — sekme süzgeci + keyset imleç) + `.test.ts`
- `apps/web/src/lib/notifications/panel-grouping.ts` (yeni — gün kovası) + `.test.ts`
- `apps/web/src/app/api/v1/notifications/route.ts` + `route-logic.ts` + `route-logic.test.ts` (**düzenlenir**)
- `apps/web/src/app/api/v1/notifications/[id]/read/route.ts` (**düzenlenir** — çevirme kipi)
- `apps/web/src/app/api/v1/notifications/unread-count/route.ts` (**düzenlenir** — dörtlü sayaç)
- `apps/web/src/lib/notifications/client.ts` (**düzenlenir**) + `types.ts`
- `apps/web/src/lib/socket/events.ts` (`notification.read` olayı eklenir)

**Okunur, yazılmaz:** `lib/notifications/prefs-service.ts` (Ş1), `components/shared/notification-bell.tsx`.

---

## İş

### 1. Sekme eşlemesi

Panelin 4 sekmesi `Notification.type` enum'undan **sunucuda** türetilir; istemci enum bilmez.

| Sekme      | Kapsam                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `all`      | Hepsi                                                                                             |
| `mentions` | `MENTION` **ve** `metadata.kind` yok ya da `mention`                                              |
| `replies`  | `MENTION` **ve** `metadata.kind ∈ { 'thread', 'reply' }`                                          |
| `system`   | `SYSTEM`, `MODERATION`, `FEEDBACK`, `BADGE`, `SERVER_INVITE`, `FRIEND_REQUEST`, `FRIEND_ACCEPTED` |

`DM` türü `all` içinde kalır, üç dar sekmenin hiçbirine düşmez — tasarımda DM için sekme yok.

**`mentions` ve `replies` ayrık kümedir**; aynı kayıt ikisine birden düşmez. Ayrım
`metadata.kind` üzerinden yapılır ve yazan taraf (`message-notification-service`) bu alanı
doldurmuyorsa `mention` varsayılır. Bu varsayım test ile kilitlenir.

`AppNotification.kind` (SPEC §7 `'mention' | 'reply' | 'event' | 'system'`) aynı eşlemeden türer;
`event` = `metadata.kind === 'event'` olan `SYSTEM` kaydı.

### 2. Gün grupları (tuzak #7)

Gruplama **sunucuda**, izleyicinin saat diliminde (`resolveQuietHoursTimeZone` ile çözülen bölge).
İstemci **tekrar hesaplamaz**.

```ts
type NotificationGroup = { label: "today" | "yesterday" | "older"; items: AppNotification[] };
```

Etiket metni istemcide (`notif.panel.group.today` …). Sunucu **Türkçe metin göndermez**.

Referans yalnız `Bugün` / `Dün` çiziyor; üçüncü kova sonsuz kaydırmada gerekiyor (K10).
Panel ilk sayfada `older` grubu boşsa çizmez.

### 3. Sayfalama ve sonsuz kaydırma (K10)

- `?limit` varsayılan **6** (tasarımın panel örneği), üst sınır 50.
- İmleç `(createdAt, id)` keyset, `DESC`.
- `?tab` her sayfada aynı; imleç yönü yanıtta taşınır.
- Panel liste alanı dibe gelince sonraki sayfayı çeker. `/inbox` silindiği için (K10) sistem ve
  etkinlik bildirimlerinin **tek** tam görünümü budur; 6 kayıttan sonra durmaz.

`useInfiniteQuery` tüketicisi için: efekt bağımlılıkları **ilkel** olmalı
(`[hasNextPage, isFetchingNextPage]`), sorgu nesnesi değil — aksi hâlde `IntersectionObserver`
her render'da sökülüp kurulur ve her render bir sayfa daha çeker.

### 4. Çevirme kipi

`POST /api/v1/notifications/[id]/read` gövde alır:

```ts
{
  read: boolean;
}
```

Gövde yoksa `{ read: true }` varsayılır — **eski istemciler kırılmaz** (mobil bu ucu kullanıyor).

`markRead(userId, id)` yerine `setRead(userId, id, read)`; `readAt` `read ? now : null`.
Yanıt güncel dörtlü sayacı taşır ki istemci ikinci istek atmasın.

### 5. Dörtlü sayaç

```ts
type NotificationCounts = { all: number; mentions: number; replies: number; system: number };
```

Yalnız **okunmamış** kayıtları sayar (SPEC §1). Tek geçişte:

```sql
SELECT
  COUNT(*)                                   AS all,
  COUNT(*) FILTER (WHERE <mentions dalı>)     AS mentions,
  COUNT(*) FILTER (WHERE <replies dalı>)      AS replies,
  COUNT(*) FILTER (WHERE <system dalı>)       AS system
FROM "Notification" WHERE "userId" = $1 AND read = false;
```

`[userId, read, createdAt]` indeksinden okur. `EXPLAIN ANALYZE` çıktısı rapora eklenir.

Bu yanıt **zil noktasının da kaynağıdır** — `counts.all > 0` ⇒ nokta. İkinci bir sorgu yok.

`GET /unread-count` bugün tek sayı dönüyor; **geriye uyumlu** kalması için `{ count, counts }`
döner (`count === counts.all`).

### 6. Socket — `notification.read`

```ts
type NotificationReadPayload = { id: string; read: boolean; counts: NotificationCounts };
```

Mevcut `notification.created` yükü de `counts` taşımaya başlar. Böylece sayaç istemcide
artırılmaz, **sunucudan okunur** — iki sekme açıkken sayaç ayrışmaz.

`markAllRead` sonrası `{ id: null, read: true, counts }` yayılır.

### 7. İstemci sözleşmesi

`lib/notifications/client.ts`:

```ts
export const notificationsQueryKeys = {
  panel: (tab: NotificationTab) => ["notifications", "panel", tab] as const,
  counts: ["notifications", "counts"] as const,
};
export function fetchNotificationPage(tab, cursor?, limit?): Promise<NotificationPageDTO>;
export function fetchNotificationCounts(): Promise<NotificationCounts>;
export function setNotificationRead(id: string, read: boolean): Promise<NotificationCounts>;
export function markAllNotificationsRead(): Promise<NotificationCounts>;
```

Eski `fetchNotifications(limit)` ve `markNotificationRead(id)` **kalır** — `notification-bell.tsx`
Ş11'e kadar onları kullanıyor; Ş11 geçince kaldırılır (temizliği Ş13 doğrular).

---

## Kabul

- [ ] `mentions` ve `replies` ayrık; hiçbir kayıt ikisinde birden.
- [ ] `metadata.kind` yokken kayıt `mentions`'a düşüyor (varsayım testi).
- [ ] `system` sekmesi 7 türü kapsıyor; `DM` yalnız `all`'da.
- [ ] Gün grubu izleyicinin saat diliminde; `Europe/Istanbul` ve `America/New_York` için 23:30
      kaydının kovası ayrı ayrı doğru.
- [ ] Sunucu **Türkçe metin göndermiyor**; grup etiketi enum.
- [ ] İmleç tutarlı: aynı bildirim iki sayfada görünmüyor; `limit=6` ile 3 sayfa geziliyor.
- [ ] `POST [id]/read` gövdesiz çağrıldığında `read: true` gibi davranıyor (eski istemci).
- [ ] `POST [id]/read { read: false }` okunmuşu okunmamışa **çeviriyor** ve sayaçları artırıyor.
- [ ] Sayaçlar yalnız okunmamışı sayıyor; okunmuş kayıt hiçbir sayaca girmiyor.
- [ ] `GET /unread-count` hem `count` hem `counts` dönüyor; `count === counts.all`.
- [ ] `notification.created` ve `notification.read` yükleri `counts` taşıyor.
- [ ] `EXPLAIN ANALYZE` çıktısı rapora eklendi; sayaç sorgusu index scan.
- [ ] Mevcut mobil bildirim testleri değişmeden yeşil.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

Rapor: `docs/prompts/whispr-ayarlar/raporlar/03-s2-rapor.md`
