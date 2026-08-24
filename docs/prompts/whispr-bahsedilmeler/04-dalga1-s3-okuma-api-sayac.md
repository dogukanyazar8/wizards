# Dalga 1 · Ş3 — Okuma API'si, sayacın tek kaynağa taşınması, socket

**Ön koşul:** Dalga 0 kapısı yeşil. **Paralel:** Ş1, Ş2, Ş4.

Ekranın beslendiği bütün uçlar. Ş2'nin ürettiği veriye **beklemeden** yazılır: sözleşme
Dalga 0'da donmuştur, dört türün de sorgu dalı baştan yazılır ve boş veriyle test edilir.

---

## Sahiplenilen dosyalar

- `apps/web/src/lib/mentions/mentions-query.ts` (yeni — birleşik sorgu) + `.test.ts`
- `apps/web/src/lib/mentions/mentions-service.ts` (yeni — liste, sayaç, bağlam, okundu yazımı)
  - `.test.ts`
- `apps/web/src/lib/mentions/client.ts` (Ş1'in bıraktığı `// Ş3` sınırından sonrası)
- `apps/web/src/app/api/v1/mentions/route.ts` + `route-logic.ts` (mevcut — yeniden yazılır)
- `apps/web/src/app/api/v1/mentions/counts/route.ts` (yeni)
- `apps/web/src/app/api/v1/mentions/[mentionId]/context/route.ts` (yeni)
- `apps/web/src/app/api/v1/mentions/[mentionId]/state/route.ts` (yeni — PATCH: read/readLater/dismiss)
- `apps/web/src/app/api/v1/mentions/read-all/route.ts` (yeni — POST + POST `?undo=1`)
- `apps/web/src/lib/home/summary-service.ts` (yalnız `unreadMentions` hesabı)
- `apps/web/src/lib/socket/events.ts` (yalnız `mention:*` olayları)
- `apps/web/src/lib/mentions/realtime.ts` (yeni — yayın yardımcıları)

**Okunur, yazılmaz:** `lib/home/mentions-service.ts` (eski; Ş5 ekranı devraldıktan sonra
Dalga 3'te silinir), `notifications/service.ts`.

---

## İş

### 1. Birleşik sorgu (`mentions-query.ts`)

Dört dal, tek `UNION ALL`, `(occurredAt, id)` keyset imleci — mevcut
`lib/home/mentions-service.ts` deseninin genişletilmiş hâli. Dallar:

| Dal                 | Kaynak                                                                               | `stateKey`          |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------- |
| `SELF`/`ROLE` kanal | `MessageMention` (`kind` kolonuyla)                                                  | `CHANNEL` / `mm.id` |
| `SELF` DM           | `DMMessageMention`                                                                   | `DM` / `dmm.id`     |
| `EVERYONE`          | `Message.mentionEveryone = true`, izleyicinin görebildiği kanallar, yazar ≠ izleyici | `EVERYONE` / `m.id` |
| `THREAD`            | `ThreadFollow` ⋈ `Message.threadParentId`, yazar ≠ izleyici, takip `mutedAt IS NULL` | `THREAD` / `m.id`   |

Ortak kurallar:

- Görünürlük **sorgunun kendi süzgeci**dir, sonucuna uygulanan bir kontrol değil
  (mevcut servisin kuralı korunur): kanal erişimi `resolveHomeChannelAccess`, DM üyeliği
  `DMParticipant`, `historyFromAt` sınırı, `deletedAt`/`placeholderRemovedAt`/`expiresAt`.
- Pencere: `window=30d` (varsayılan) → `occurredAt > now - 30 gün`; `window=all` sınırsız (K7).
- `dismissedAt` dolu `MentionState` satırı olan bahsetme **listelenmez**.
- Sıralama: `readLaterAt` dolu olanlar **her zaman önce** (K5), sonra `occurredAt DESC, id DESC`.
  İmleç bu sıralamayı taşır (`(readLaterFirst, occurredAt, id)`).
- `tag` alanı sunucuda üretilir: `SELF` → `@{displayName ?? username}`, `ROLE` → `@{role.name}`,
  `EVERYONE` → `@herkes`, `THREAD` → bahsetme metnindeki ilk takı yoksa `@{displayName}`.
  Gövde `body` alanı **takı çıkarılmış** metindir (`buildMentionPreview` deseni).

### 2. Okundu durumu — geçiş kuralı

İki kaynak vardır ve **birleşik** okunur:

```
unread = (MentionState.readAt IS NULL)
         AND COALESCE(Notification.read, TRUE) = FALSE
```

- `MentionState` satırı yoksa `Notification` belirler (bugünkü davranış korunur, tuzak #2).
- `MentionState.readAt` yazıldığında hem o hem ilgili `Notification` satırı okunur — iki taraf
  asla ayrışmaz.
- `Okunmadı işaretle`: `MentionState.readAt = NULL` **ve** `Notification.read = false`.
  Bu yol `releaseChannelMention` sayaç kolonlarına **dokunmaz** (K4: sayaç artık oradan
  okunmuyor).

### 3. Uçlar

| Uç                                         | Girdi                                                               | Çıktı                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /api/v1/mentions`                     | `filter`, `source`, `q`, `window`, `group`, `cursor`, `limit` (≤50) | `MentionListResponse`                                                              |
| `GET /api/v1/mentions/counts`              | `window`                                                            | `MentionCounts` (`all/unread/me/role/everyone/thread/readLater/bySource`)          |
| `GET /api/v1/mentions/[mentionId]/context` | —                                                                   | `MentionContext` — bahsetmenin **±2** mesajı (kanal ve DM), `isMention` bayrağıyla |
| `PATCH /api/v1/mentions/[mentionId]/state` | `{ read?: boolean; readLater?: boolean; dismissed?: boolean }`      | güncel `Mention`                                                                   |
| `POST /api/v1/mentions/read-all`           | `{ }`                                                               | `{ affected: number; undoToken: string }`                                          |
| `POST /api/v1/mentions/read-all?undo=1`    | `{ undoToken }`                                                     | `{ restored: number }` — 10 dakikalık geçerlilik                                   |

- `mentionId` bileşiktir: `<source>:<refId>` (örn. `EVERYONE:9f3…`). Ayrıştırma
  `packages/types` şemasıyla yapılır, elle `split` yazılmaz.
- **`read-all` yalnız bahsetmeleri okur** (K11): `Notification` güncellemesi `MENTION` tipi ve
  bu ekranın ürettiği `dedupeKey` öneklerine kısıtlıdır; arkadaşlık/sistem/rozet bildirimleri
  **etkilenmez**. Geri alma için etkilenen `stateKey` listesi 10 dakikalık kısa ömürlü bir
  kayıtta (Redis) tutulur.
- **Arama sunucu tarafındadır.** `q` bahsetme metni, yazar adı/kullanıcı adı, kanal adı ve
  sunucu adı üzerinde `ILIKE`; istemci yüklenmiş sayfaları süzmez (bugünkü `MentionsFilter`
  tuzağının aynısı: sayfalı listede istemci süzgeci yalan söyler).

### 4. Sayacın tek kaynağa taşınması (K4)

`summary-service.ts` → `unreadMentions` artık `mentions-query`'nin `unread` sayımından gelir
(aynı görünürlük süzgeçleri, aynı pencere — **pencere yok**: sayaç `window=all` sayar, ekran
30 günü gösterir; ekran boş olup sayaç dolu kalmasın diye ekranın `Hepsi okundu` durumu
sayaca değil ekran penceresine bakar; bu ayrım rapora yazılır).

- `ChannelReadState.mentionCount` / `DMParticipant.mentionCount` **silinmez**: kanal ve DM
  satırlarındaki rozetler onları okumaya devam eder. Yalnız `unreadMentions` bağı kesilir.
- Sorgu maliyeti: `counts` ucu ile `summary` ucu aynı yardımcıyı çağırır; `summary` için
  30 saniyelik istek-içi bellek (`unstable_cache` değil, istek kapsamı) yeterli.
  Ölçüm rapora yazılır (hedef: p95 < 40 ms, mevcut sayım sorgusuyla aynı büyüklük sınıfı).

### 5. Socket olayları

`events.ts`'e üç olay:

```ts
"mention:new":      (payload: { mention: Mention; counts: MentionCounts }) => void;
"mention:state":    (payload: { mentionId: string; unread: boolean; readLater: boolean; dismissed: boolean; counts: MentionCounts }) => void;
"mention:read-all": (payload: { counts: MentionCounts }) => void;
```

- Hepsi `user:<id>` odasına yayınlanır.
- `mention:new` **her** türde yayınlanır (rol ve `@herkes` dahil) — Ş2'nin fan-out'undan
  sonra, alıcı başına bir kez.
- Mevcut `notification:new` olayı **kaldırılmaz**; bahsetme bildirimleri her ikisini de
  taşır (zil menüsü ve bahsetme ekranı ayrı yüzeyler).

---

## Kabul

- [ ] Dört tür de listede doğru `kind`, `tag`, `source` ve `unread` ile dönüyor.
- [ ] `window=30d` varsayılan; `window=all` eskileri getiriyor; imleç iki pencerede de tutarlı.
- [ ] `readLater` kartları filtre/gruplama ne olursa olsun listenin başında.
- [ ] `dismissed` kart listede yok ama mesaj kanalda duruyor (silinmedi).
- [ ] `Okunmadı işaretle` → `unread: true`, sayaç artıyor, tekrar okundu yapınca geri düşüyor;
      iki uçlu 20 tekrarda sayaç sapmıyor.
- [ ] `read-all` yalnız bahsetmeleri okuyor — testte kullanıcının okunmamış arkadaşlık isteği
      bildirimi **okunmamış kalıyor**.
- [ ] `read-all?undo=1` durumu geri getiriyor; token 10 dakika sonra reddediliyor.
- [ ] `counts` ve gezinme paneli rozeti aynı sayıyı veriyor (tek yardımcı).
- [ ] Arama sunucuda; 3 sayfa yüklenmiş listede arama sonucu 1. sayfadan bağımsız doğru.
- [ ] Görünürlüğü kaybedilen kanalın bahsetmesi listede yok (kanal erişimi sorgunun süzgeci).
- [ ] Sorgu planı ölçüldü: `EXPLAIN ANALYZE` çıktısı rapora eklendi, 30 günlük pencerede
      seq scan yok.

## Kapı

```
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web lint
pnpm --filter @wizards/web test
```
