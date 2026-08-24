# Faz 3 — Veri katmanı, migration ve uçlar

**Ön koşul:** Faz 2. **Sonraki:** Faz 4.
**Önce oku:** `00-ortak-baglam.md` — §3.6 modeller, §3.7 servisler, §3.8 uç boşlukları,
§3.10 migration yolu, **§5.1 güvenlik ve §5.2 performans bütçeleri**, §6.5–6.7 tuzakları.

Bu paketin en riskli fazı. Sekiz yeni okuma ucu, bir yazma ucu ve bir migration. Ekran yok —
çıktısı tipli, testli, yetkisi zorlanmış bir veri sözleşmesi.

---

## 0. Başlangıç

```
graphify query "presence görünürlük redaksiyonu ve invisible kullanıcı yolu"
graphify query "VoiceState heartbeat temizliği ve katılımcı kurulumu"
graphify query "notification servisi ve DTO serileştirme"
graphify query "API rate limit kayıt defteri ve requireApiUserId kullanımı"
```

---

## 1. Migration — odak modu

`packages/db/prisma/schema.prisma`, `model User`:

```prisma
  /// Süreli odak modunun bitiş anı. Null ise odak kapalı.
  statusExpiresAt DateTime?
  /// Odak bitince geri dönülecek durum. Odak açılırken o anki `status` buraya yazılır.
  statusRestoreTo UserStatus?
```

İndeks: süre dolmuşları toplu tarayan sweep için

```prisma
  @@index([statusExpiresAt])
```

Migration dosyası: `packages/db/prisma/rebaseline-migrations/<UTCtimestamp>_home_focus_mode/migration.sql`
(**`prisma/migrations` değil** — §3.10).

`packages/db` içindeki `scripts/schema-index-audit.test.mjs` yeni indeksi tanıyacak şekilde
güncellenir.

### 1.1 Süre dolumu — iki katmanlı

1. **Okuma anında (lazy):** kullanıcının presence'ı okunurken `statusExpiresAt <= now` ise
   `statusRestoreTo` uygulanır, iki alan da temizlenir. Bu, tek kullanıcı için anında doğru cevap
   verir.
2. **Süpürme (sweep):** mevcut outbox worker'a bağlı periyodik iş, süresi dolmuş satırları toplu
   günceller ve `presence:update` yayar. Böylece kullanıcı uygulamayı açmasa da arkadaşları doğru
   durumu görür.

Sweep saf mantığı test edilebilir bir fonksiyona çıkar: `resolveExpiredFocus(rows, now)` →
güncellenecek satırlar. Zaman `Date.now()` ile içeriden okunmaz, parametre gelir.

### 1.2 Geri alma

Migration `DROP COLUMN` ile geri alınabilir olmalı; veri kaybı sadece açık odak oturumlarıdır.
Rapora yaz.

---

## 2. Ortak tipler — `apps/web/src/lib/home/types.ts`

Her DTO için zod şeması **ve** ondan türeyen TypeScript tipi. Elle yazılmış ikinci tip yok.

```ts
export const HomePresenceSchema = z.enum(["ONLINE", "IDLE", "DND", "OFFLINE"]);

export const HomeActorSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  presence: HomePresenceSchema,
});
```

Paylaşılan kural: **DTO yalnız ekranın kullandığı alanı taşır** (§5.1.6). `select` ile sınırla.

### 2.1 Kart sözleşmeleri (SPEC §5)

| Uç                | Yanıt                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `app/summary`     | `{ greetingName, dateLabel, pendingReplies, unreadMentions, dmUnread, focus: { active, minutesLeft, totalMinutes } | null, presence }`                                                                                                         |
| `app/recent`      | `{ items: { id, kind: 'channel'                                                                                    | 'dm', name, serverName?, lastMessage: { authorName, authorAvatarUrl, text }, lastMessageAt, unreadCount, mentioned }[] }` |
| `app/awaiting`    | `{ total, newCount, items: { id, source: 'mention'                                                                 | 'reply'                                                                                                                   | 'friend_request'                                              | 'server_invite', user, context, occurredAt, reason, action: 'reply' | 'accept'                       | null, href }[] }` |
| `voice/live`      | `{ rooms: { id, kind: 'voice'                                                                                      | 'call', name, serverName?, href, speaker: { …actor, level }                                                               | null, participants: actor[], participantCount, caption }[] }` |
| `events/upcoming` | `{ next: { id, startAt, title, context, attendees: actor[], attendeeCount, interested }                            | null, upcoming: { id, startAt, title, context }[], totalCount }`                                                          |
| `events/calendar` | `{ days: { date, events: { id, startAt, title, context, serverId }[] }[] }`                                        |
| `mentions`        | `{ items: { id, messageId, channelId, serverId?, excerpt, author, occurredAt, href, read }[], nextCursor }`        |
| `search/command`  | `{ groups: { kind: 'server'                                                                                        | 'channel'                                                                                                                 | 'dm'                                                          | 'user'                                                              | 'command', items: {…}[] }[] }` |

**Zaman alanları ISO string olarak döner.** "2 dk", "1 sa", "dün" gibi göreli metinler **istemcide**
kullanıcının saat dilimi ve dil tercihine göre üretilir; sunucu biçimlenmiş metin döndürmez.

`dateLabel` istisnası: "18 Ağustos Pazartesi" istemcide `LocaleProvider` üzerinden üretilir; sunucu
yalnız ISO tarih gönderir.

---

## 3. Uçlar

Hepsi aynı iskelet: `requireApiUserId` → `enforceApiRateLimit` → zod parse → servis → `Response.json`
→ `jsonError`. Mevcut `app/api/v1/voice/states/route.ts` örnek alınır.

### 3.1 `GET /api/v1/app/summary`

- Kaynak: `User` (presence + odak), `DMParticipant.unreadCount` toplamı,
  `ChannelReadState.mentionCount` toplamı, bekleyen istek sayıları.
- Sorgu bütçesi: **≤ 4 sorgu**, hepsi aggregate. Kullanıcı başına satır taraması yok.
- Rate limit: `"app:summary"` — 120 / 60 sn.
- Cache: `Cache-Control: private, no-store`. Kullanıcıya özel.

### 3.2 `GET /api/v1/app/recent`

Kart: "Kaldığın yer".

- İki kaynak birleşir: (a) kullanıcının üyesi olduğu, **görme yetkisi olan** kanallardan son
  mesajlı olanlar; (b) `DMConversation` son mesaj sırasına göre.
- Her iki taraf da `take = limit` ile sınırlı çekilir, bellek içinde `lastMessageAt` sırasına göre
  birleştirilir, sonra `limit` kadar kesilir. **Tüm kanalları çekip sıralama yok.**
- `limit` zod ile 4–10 arası; istemci ölçek adımına göre 4/5/6/7 ister.
- Yetki: kanal görünürlüğü mevcut izin yardımcısıyla doğrulanır. Kullanıcının okuyamadığı kanal
  listeye giremez — **test şart**.
- Gizli/arşivlenmiş DM (`DMParticipant.hiddenAt`) hariç.
- Sorgu bütçesi: **≤ 5 sorgu**, `limit`'ten bağımsız sabit.
- Rate limit: `"app:recent"` — 120 / 60 sn.

### 3.3 `GET /api/v1/app/awaiting`

Kart: "Yanıt bekliyor" + Faz 6'daki Gelen kutusu. Karar #7'ye göre dört kaynak:

| Kaynak             | Nereden                                                       | Aksiyon  |
| ------------------ | ------------------------------------------------------------- | -------- |
| Bahsedilme         | `MessageMention` + okunmamış `ChannelReadState`               | `reply`  |
| Mesajıma yanıt     | `Message.replyToId` → benim mesajım, okunmamış                | `reply`  |
| Arkadaşlık isteği  | `FriendRequest.status = PENDING`, `receiverId = ben`          | `accept` |
| Sunucu daveti      | `Notification.type = SERVER_INVITE`, okunmamış                | `accept` |
| _(görüş bekleyen)_ | tasarımdaki "Görüşünü istiyor" satırı = aksiyonsuz bahsedilme | `null`   |

- `newCount` = son okuma damgasından sonra gelenler; tasarımdaki "2 yeni" pill'i bunu gösterir.
- Sıralama `occurredAt` azalan.
- `href` sunucu tarafında üretilir ve **yalnız uygulama içi göreli yol** olabilir (§5.1.7).
- Sorgu bütçesi: **≤ 6 sorgu**.
- Rate limit: `"app:awaiting"` — 120 / 60 sn.
- **Aksiyonlar yeni uç değil.** "Kabul et" mevcut `friends/request/[id]` ve sunucu katılma
  uçlarını çağırır. "Yanıtla" gezinmedir.

### 3.4 `GET /api/v1/voice/live`

Kart: "Şu an canlı". Karar #6.

- Kaynak A: kullanıcının üyesi olduğu sunucuların sesli kanallarındaki `VoiceState` satırları.
  `lastHeartbeat` bayat olanlar **elenir** — eşik `@/lib/voice/service.ts` içindeki mevcut cleanup
  sabitinden okunur, yeniden tanımlanmaz (§6.6).
- Kaynak B: kullanıcının katılabileceği devam eden DM/grup aramaları (mevcut çağrı durumu
  kaynağı).
- İkisi tek DTO'ya normalize edilir. `kind` alanı ikon seçimini belirler (kulaklık / oyun kolu).
- Yetki: kanalı göremeyen kullanıcı odayı göremez. Sunucudan atılmış kullanıcı için boş döner —
  **test şart**.
- Presence redaksiyonu: katılımcı listesi `redactPresenceCollectionForViewer` üzerinden geçer;
  görünmez kullanıcı katılımcı yığınında görünmez.
- `speaker`: konuşan kişi anlık veridir; ilk yükte `null` dönebilir, socket
  (`voice:audio-level:update`) ile dolar. Sunucu tarafında ses seviyesi saklamaya çalışma.
- `participants` en fazla 4 döner, `participantCount` gerçek toplamı taşır ("+8" çipi bundan
  hesaplanır).
- Sorgu bütçesi: **≤ 4 sorgu**.
- Rate limit: `"voice:live:list"` — 60 / 60 sn.

### 3.5 `GET /api/v1/events/upcoming`

Kart: "Sıradaki".

- Kullanıcının üyesi olduğu sunucuların `ScheduledEvent` satırları, `status = SCHEDULED`,
  `scheduledStartAt >= now`, artan sıra, `take = 1 + limit`.
- `@@index([serverId, status, scheduledStartAt])` mevcut — sorgu bu indeksi kullanmalı. Çok
  sunuculu `IN` sorgusunda plan doğrulanır (`EXPLAIN` çıktısı rapora).
- `next.attendees`: `ScheduledEventInterest` üzerinden ilk 3 + toplam.
- `interested`: kullanıcının kendi ilgi kaydı var mı — "Hatırlat" butonunun durumu.
- `totalCount`: "6 etkinlik" sayısı.
- Sorgu bütçesi: **≤ 4 sorgu**.
- Rate limit: `"events:upcoming"` — 120 / 60 sn.

### 3.6 `GET /api/v1/events/calendar?from=&to=`

Faz 6 takvim görünümü. Aynı yetki kuralları. `from`–`to` aralığı zod ile en fazla 62 gün.
Rate limit `"events:calendar"` — 60 / 60 sn.

### 3.7 `GET /api/v1/mentions?cursor=&limit=`

Faz 6 Bahsedilmeler ekranı.

- `MessageMention` bugün yalnız `@@index([userId])` taşıyor (§6.5). Zamana göre sıralamak için
  `Message.createdAt` üzerinden join gerekiyor. **Bileşik indeks ekle:**
  `@@index([userId, messageId])` yetmez — pratik çözüm `Message` tarafında
  `@@index([channelId, createdAt])` zaten varsa mention join'i ondan yararlanır; yoksa
  `MessageMention` üstünde `messageId` sırası (uuid) zaman sırası vermez.
  **Karar gerektiren nokta:** ya `MessageMention` üstüne `createdAt` denormalize edilir
  (`@@index([userId, createdAt])`), ya da sorgu `Message` tarafından sürülür.
  **Ölçmeden seçme** — iki planı da `EXPLAIN` ile karşılaştır, sonucu rapora yaz, gerekiyorsa
  kullanıcıya sor.
- Cursor tabanlı sayfalama (offset yok).
- Yetki: bahsedildiği kanalı artık göremiyorsa satır düşer.
- Rate limit: `"mentions:list"` — 120 / 60 sn.

### 3.8 `GET /api/v1/search/command?q=`

⌘K paleti (Faz 5).

- Kaynaklar: sunucu adları, kullanıcının görebildiği kanallar, DM konuşmaları, arkadaşlar.
- `q` zod: 1–64 karakter, trim'li. Boş sorguda **son ziyaretler** döner, tüm veri tabanı değil.
- Her grup en fazla 5 sonuç.
- Yetki: görünmeyen kanal sonuçta yok. Arkadaş olmayan kullanıcı gizlilik ayarına göre filtrelenir.
- Rate limit: `"search:command"` — **60 / 60 sn** ve **istek başına debounce istemcide 200 ms**.
- Komut listesi sunucudan gelmez; istemcide statik + yetki kontrollü (§5.1.8).

### 3.9 `PATCH /api/v1/users/me/presence`

Tek yazma ucu.

```ts
BodySchema = z.object({
  presence: z.enum(["ONLINE", "DND", "IDLE", "INVISIBLE"]).optional(),
  focus: z
    .union([
      z.object({ enabled: z.literal(true), minutes: z.number().int().min(5).max(240) }),
      z.object({ enabled: z.literal(false) }),
    ])
    .optional(),
});
```

- `focus.enabled = true`: `statusRestoreTo = mevcut status` (zaten DND ise önceki değer korunur —
  üst üste açma kendini ezmez), `status = DND`, `statusExpiresAt = now + minutes`.
- `focus.enabled = false`: `status = statusRestoreTo ?? ONLINE`, iki alan temizlenir.
- Yazımdan sonra `presence:update` yayılır.
- **Idempotent:** aynı gövde iki kez gelirse ikinci çağrı süreyi uzatmaz — süre uzatma ayrı bir
  niyet, ayrı çağrı.
- `INVISIBLE` istemciden gelir, depoda `OFFLINE`'a çevrilir (mevcut davranış — §6.7).
- Rate limit: `"user:presence:update"` — 30 / 60 sn.

---

## 4. Rate limit kaydı

`apps/web/src/lib/api-rate-limit.ts` `API_RATE_LIMITS` içine dokuz anahtar eklenir. Anahtar adları
mevcut düzene uyar (`alan:işlem`). Tip `ApiRateLimitAction` otomatik genişler.

---

## 5. İstemci katmanı — `apps/web/src/lib/home/client.ts`

- `homeQueryKeys` nesnesi (mevcut `dmQueryKeys` / `notificationsQueryKeys` düzeninde).
- Her uç için `fetchX` — yanıt **zod ile parse edilir**, doğrulanmamış JSON bileşene geçmez.
- `HomeClientError` sınıfı (`DMClientError` örneğinde).
- `staleTime` önerileri: `summary` 30 sn, `recent` 20 sn, `awaiting` 20 sn, `live` 10 sn,
  `upcoming` 60 sn. Socket olayı geldiğinde ilgili anahtar invalidate edilir — polling yok.

---

## 6. Realtime köprüsü

Mevcut olaylara abone olan tek hook: `useHomeRealtime`.

| Olay                                              | Etki                                                       |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `presence:update`                                 | `summary` + `friends` cache'i yamalanır                    |
| `friends:updated`, `friends:voice:update`         | arkadaş şeridi ve canlı odalar                             |
| `voice:state:update`                              | `voice/live` invalidate                                    |
| `voice:audio-level:update`                        | konuşan kişi + dalga formu (cache yazımı yok, yerel state) |
| `notification:new`                                | `awaiting` + `summary` sayaçları                           |
| `server:unread:update`, `dm:conversation:updated` | `recent` + nav rozetleri                                   |

Kurallar:

- Olay başına **tam invalidate değil, hedefli yamalama** tercih edilir; invalidate yalnız yapı
  değiştiğinde.
- Yüksek frekanslı `voice:audio-level:update` React Query'ye **yazılmaz** — kart içi yerel state,
  animasyon karesi başına en fazla bir güncelleme.
- Yeni socket olayı ancak mevcutlardan türetilemiyorsa eklenir (§3.9).

---

## 7. Testler

Her uç için en az beş test:

1. **Mutlu yol** — beklenen DTO şekli, zod parse geçiyor.
2. **Kimlik** — oturumsuz istek 401.
3. **Yetki** — yetkisiz kullanıcı boş/403 alıyor; başkasının kanalı/odası sızmıyor.
4. **Redaksiyon** — invisible kullanıcı çevrimiçi görünmüyor, last-seen sızmıyor.
5. **Sorgu bütçesi** — Prisma çağrı sayısı sabitlenmiş; `limit` artınca artmıyor.

Ek:

- `resolveExpiredFocus` saf fonksiyon testi (süresi dolan / dolmayan / null).
- `PATCH presence` idempotentlik testi.
- `href` üretiminin yalnız göreli yol verdiği testi (açık yönlendirme koruması).

---

## 8. Kapı

```bash
pnpm --filter @wizards/db test
pnpm --filter @wizards/web test
pnpm typecheck
pnpm lint
pnpm --filter @wizards/web e2e:api
```

**Geçme koşulları:**

- [ ] Migration `rebaseline-migrations/` altında; `db:migrate:status` temiz.
- [ ] İndeks denetim testi güncel ve yeşil.
- [ ] Dokuz uç için 5×9 = **45 test** yeşil.
- [ ] Her uç `API_RATE_LIMITS` kaydında; tip hatası yok.
- [ ] Sorgu bütçeleri §3'teki sayıların altında — ölçülen değerler raporda tablo hâlinde.
- [ ] `events/upcoming` ve `mentions` için `EXPLAIN` çıktısı raporda; indeks kullanılıyor.
- [ ] Presence redaksiyonu dört uçta da doğrulandı (`voice/live`, `app/recent`, `app/awaiting`,
      `search/command`).
- [ ] Yanıtlarda ekranın kullanmadığı alan yok (DTO ↔ SPEC §5 karşılaştırması yapıldı).
- [ ] `TODO(api):` işaretli hiçbir alan kalmadı — kaldıysa listesi raporda.

## 9. Tuzaklar

- **Migration yolu** `packages/db/prisma/rebaseline-migrations/` (§3.10). `prisma/migrations`
  yazılırsa Prisma görmez, deploy sessizce eski şemayla çalışır.
- `VoiceState.lastHeartbeat` filtresi unutulursa ölü oturumlar "canlı oda" olur (§6.6).
- `Notification.metadata` istemci kaynaklı olabilir; parse etmeden ekrana bağlama (§5.1.7).
- `app/recent` içinde "önce hepsini çek sonra sırala" tuzağı — sunucu sayısı arttıkça patlar.
- Göreli zaman metnini sunucuda üretme; kullanıcının saat dilimi sunucuda bilinmez.
- `INVISIBLE` → `OFFLINE` dönüşümü zaten var; ikinci kez uygulamak "görünmez" kullanıcıyı
  gerçekten çevrimdışı yapar.
- Odak modunu üst üste açmak süreyi sıfırlamamalı; `statusRestoreTo` ilk açılıştaki değeri tutar.
