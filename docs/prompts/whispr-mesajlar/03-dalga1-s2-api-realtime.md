# Dalga 1 · Ş2 — API uçları, servisler, realtime

**Ön koşul:** Dalga 0 kapısı yeşil. **Paralel:** Ş1, Ş3, Ş4 ile aynı anda.

Amaç: Dalga 2'nin ihtiyaç duyacağı **her** sunucu yüzeyi. Bu şerit hiçbir React bileşenine
dokunmaz.

---

## Sahiplenilen dosyalar

```
apps/web/src/app/api/v1/polls/route.ts                            (yeni, POST)
apps/web/src/app/api/v1/polls/[pollId]/route.ts                   (yeni, GET)
apps/web/src/app/api/v1/polls/[pollId]/vote/route.ts              (yeni, PUT/DELETE)
apps/web/src/app/api/v1/polls/[pollId]/voters/route.ts            (yeni, GET)
apps/web/src/app/api/v1/polls/**/route-logic.ts + *.test.ts       (yeni)
apps/web/src/app/api/v1/dm/messages/search/route.ts               (yeni, GET — global)
apps/web/src/app/api/v1/dm/[conversationId]/pins/route.ts         (yeni, GET/POST)
apps/web/src/app/api/v1/dm/[conversationId]/pins/[messageId]/route.ts (yeni, DELETE)
apps/web/src/app/api/v1/friends/suggestions/route.ts              (yeni, GET)
apps/web/src/app/api/v1/friends/sort/route.ts                     (yeni, PUT)
apps/web/src/app/api/v1/dm/groups/route.ts                        (mevcut — 250 + LAST_7D + invite)
apps/web/src/lib/polls/**                                         (yeni servis)
apps/web/src/lib/dm/pins-service.ts                               (yeni)
apps/web/src/lib/friends/suggestions-service.ts                   (yeni)
apps/web/src/lib/messages/search-service.ts                       (global arama eklenir)
apps/web/src/lib/dm/client.ts, apps/web/src/lib/messages/search-client.ts  (istemci fonksiyonları)
apps/web/src/lib/socket/events.ts, schemas.ts, handlers/**, emitters.ts
apps/web/src/lib/api-rate-limit.ts
apps/web/src/app/api/v1/route-contract.test.ts
```

---

## Sözleşme (dışa verdiklerin)

Dalga 2 şeritleri **yalnız** şu istemci fonksiyonlarını çağırır — `fetch` yazmazlar:

```ts
// lib/polls/client.ts
createPoll(input: PollCreateRequest & { conversationId: string }): Promise<PollDto>
castPollVote(pollId: string, optionIds: string[]): Promise<PollDto>
clearPollVote(pollId: string): Promise<PollDto>
fetchPollVoters(pollId: string): Promise<PollVoterDto[]>      // anonymous ise 403

// lib/dm/client.ts
fetchConversationPins(conversationId): Promise<PinnedMessageDto[]>
pinDmMessage(conversationId, messageId): Promise<PinnedMessageDto>
unpinDmMessage(conversationId, messageId): Promise<void>

// lib/messages/search-client.ts
searchDmMessagesGlobal(input: { query, personId?, from?, to?, cursor? }): Promise<MessageSearchHitPage>

// lib/friends/client.ts
fetchFriendSuggestions(): Promise<FriendSuggestionDto[]>
updateFriendsSort(sort: FriendsSort): Promise<void>
```

---

## İş

### 1. Anket uçları (karar #1, #11, #12)

**Yetki, sorgunun içinde.** Her uç, `PollVote`/`Poll` satırına ulaşmadan önce görüntüleyenin
konuşmanın katılımcısı olduğunu **tek sorguda** doğrular:

```
Poll → dmMessage → conversation → participants.some(userId = viewer)
```

İki adımlı "önce anketi çek, sonra yetkiyi kontrol et" yazılmaz — sızıntı yüzeyi orada açılır.

- `POST /v1/polls` — gövde `PollCreateRequest` + `conversationId`. Sunucu:
  1. Katılımcılık + `permSendMessage` kontrolü.
  2. `closesAt` = `now + duration` (`1h`/`24h`/`3d`) — **sunucuda** hesaplanır, istemciden
     alınmaz.
  3. Tek transaction: `DMMessage` (içerik boş, `systemType` null) + `Poll` + `PollOption[]`.
  4. `dm:message:new` + `poll:created` yayını.
  - Tavan: 6 seçenek, 300 karakter soru, 80 karakter seçenek. Aşımda `400` + `messages.errors.*`
    anahtarı taşıyan kod.
- `PUT /v1/polls/[pollId]/vote` — gövde `{ optionIds: string[] }`.
  - Anket kapandıysa (`closesAt <= now`) `409`.
  - `multi = false` iken `optionIds.length` 1 olmalı; oy **taşınır**: tek transaction'da
    `DELETE FROM "PollVote" WHERE "pollId" = $1 AND "userId" = $2` + `INSERT`.
  - `multi = true` iken gelen küme mevcut kümenin yerini alır (aynı transaction).
  - Yarış testi: aynı kullanıcıdan iki eşzamanlı istek → sonuçta **tek** satır, ikinci istek ya
    başarılı ya `409`, hiçbir durumda çift oy yok.
- `DELETE /v1/polls/[pollId]/vote` — oyu geri çeker.
- `GET /v1/polls/[pollId]/voters` — **`anonymous = true` ise `403`** (karar #11). Kimlikleri
  istemciye hiç göndermeyen tek yer burasıdır; `PollDto.canSeeVoters` de sunucuda `!anonymous`
  olarak hesaplanır.
- Kapanmış anket: sweep worker yok; `closed` alanı **okuma anında** `closesAt <= now` ile
  türetilir. `@@index([closesAt])` ileride bir kapanış bildirimi eklenirse hazır olsun diye var.

**Socket** (`lib/socket/events.ts`, `schemas.ts`, `handlers/`):

```ts
"poll:updated": (data: { conversationId: string; poll: PollDto }) => void;   // sunucu → istemci
```

Yalnız **bir** olay: oy verme, oy taşıma ve oy çekme aynı yükü yayınlar; istemci farkı kendi
hesaplamaz. Yük konuşma odasına gider (`dm:{conversationId}`), oy veren kimlikleri **taşımaz**.
Yayın, mesajın kendisi için `dm:message:new` ile aynı oda mekanizmasını kullanır — 00-ortak-baglam
§6.3'teki `socketsLeave` tuzağına dikkat.

**Rate limit:** oy `20/dk/kullanıcı`, anket oluşturma `5/dk/kullanıcı`.

### 2. Çoklu sabitleme uçları (karar #7)

- `GET /v1/dm/[conversationId]/pins` — `PinnedMessageDto[]`, `pinnedAt` azalan, en çok 50.
- `POST .../pins` — gövde `{ messageId }`. Yetki: `permPinMessage` (`ALL` → herkes,
  `ADMINS` → OWNER/ADMIN). 1:1 DM'de iki taraf da sabitleyebilir. Tavan 50 aşıldıysa `400`.
- `DELETE .../pins/[messageId]`.
- Her üçü `dm:conversation:updated` yayınına `pinnedCount` alanı ekler (mevcut olay genişletilir,
  yenisi açılmaz).
- Mevcut `POST /v1/dm/[conversationId]/pin` ucu **korunur** ve yeni tabloya yazar; eski
  `pinnedMessageId` kolonuna **yazmayı bırakır** (okumaya devam eden yer kalmadığı Dalga 3'te
  doğrulanır).
- `pinnedStripDismissedId` davranışı korunur: kullanıcı şeridi kapattığında en yeni sabitin id'si
  yazılır, yeni bir sabit gelince şerit tekrar görünür.

### 3. Global mesaj arama (karar #6)

`GET /v1/dm/messages/search?q=&personId=&from=&to=&cursor=`

- Kapsam: görüntüleyenin `DMParticipant` satırı olan **ve** `hiddenAt` null olan tüm konuşmalar.
- **Tarih tabanı zorunlu:** her konuşma için `historyFromAt` uygulanır — bir üyenin göremeyeceği
  geçmiş aramayla sızmaz. Bu, mevcut `search-service.ts`'in kanal tarafında yaptığı
  "görünür kanal kümesi" filtresinin DM karşılığıdır ve **sorgunun içinde** olur.
- `personId` filtresi = mesaj yazarı. Tasarımdaki `Kişi: Selin` çipi budur.
- Vurgu (`matchRange`) **sunucuda** hesaplanır ve DTO'da döner; istemci ikinci kez arama yapmaz.
  Çok baytlı Türkçe karakterlerde ofset hatası olmasın diye aralık **kod noktası** cinsindendir,
  bayt değil — test `yoğunluğu` kelimesiyle bunu doğrular.
- Sayfalama: mevcut base64 cursor biçimi.
- Sorgu bütçesi testi: 3 sonuç için **≤ 2** sorgu (arama + yazar toplu okuma), `N+1` yok.
- `EXPLAIN (ANALYZE, BUFFERS)` çıktısı raporda; seq scan görünürse indeks eklenir (Ş0.2 §6).
- Rate limit `30/dk/kullanıcı`.

### 4. Arkadaş önerileri ve sıralama (karar #8)

- `GET /v1/friends/suggestions` — ortak sunucudan gelen, henüz arkadaş olmayan kişiler.
  - Elenenler: mevcut arkadaşlar, `PENDING` istek olan iki yön, `BLOCKED` iki yön, kendisi,
    `FriendRequestPolicy` kapalı olanlar, `isBanned`.
  - Her satır: `{ user, viaServerName, mutualFriendCount }`. `viaServerName` = paylaşılan
    sunuculardan **en çok üyeli** olan (deterministik, `id` ile tie-break).
  - `mutualFriendCount` tek toplu sorguda hesaplanır (öneri başına sorgu **yok**).
  - Presence **dönmez** — öneri satırı tasarımda presence göstermiyor, göstermediğimizi
    redaksiyonla değil, alanı hiç koymayarak garanti ediyoruz.
  - Tavan 12 satır; sıralama `mutualFriendCount` azalan, sonra ad.
- `PUT /v1/friends/sort` — gövde `{ sort: FriendsSort }`, `UserSettings.friendsSort` yazar.
  `GET /v1/users/me/settings` yanıtına alan eklenir.

### 5. Grup kurma ucunun güncellenmesi (kararlar #3, #4, #9)

`POST /v1/dm/groups`:

- `userIds` tavanı 249 (`GROUP_SELECTABLE_MAX`).
- `avatarColor` artık token adı; `mapLegacyGroupAvatarColor` okuma yolunda uygulanır.
- `historyVisibility` `LAST_7D` kabul eder.
- `inviteEnabled: true` geldiğinde `GroupInvite` **aynı transaction'da** üretilir (bugün de öyle;
  varsayılanın açık olması davranışı değiştirmez, yalnız sıklığı artırır).
- `name` artık **zorunlu** (karar: `canSubmitGroup` ad ister). Boş gelirse `400`.
- **250 katılımcı ölçümü** (karar #3): 250 üyeli grup fikstürüyle
  1. kurma isteğinin sorgu sayısı ve süresi,
  2. tek mesajın fan-out'unda yazılan `DMParticipant.unreadCount` satır sayısı ve süresi,
  3. `dm:message:new` yayınının soket sayısı
     ölçülür ve rapora yazılır. Fan-out tek `UPDATE ... WHERE conversationId = $1 AND userId <> $2`
     ile yapılmalı; katılımcı başına döngü varsa **bu şeritte** düzeltilir.

### 6. Sesli mesaj yükleme yolu (karar #5, Ş4'ün ihtiyacı)

- `Attachment` yazımına `durationMs` + `waveform` alanları eklenir; DTO'ya taşınır.
- Doğrulama: `waveform` en çok 64 eleman, her biri 0–100 tamsayı; `durationMs` ≤ 5 dk.
  Aşımda `400` — istemciye güvenilmez.
- MIME beyaz listesine `audio/webm`, `audio/mp4`, `audio/ogg` eklenir (`lib/messages/
attachment-rules.ts`).

### 7. Sözleşme testi

`app/api/v1/route-contract.test.ts` yeni uçları listeler: yöntem, kimlik doğrulama zorunluluğu,
rate-limit kaydı, zod şeması. Kayıtsız uç testi kırar.

---

## Test

- Her yeni uç için `route-logic.test.ts`: yetkisiz erişim `403`, tavan aşımı `400`, mutlu yol.
- Anket yarış testi (iki eşzamanlı `PUT vote`).
- Anonim ankette `GET voters` → `403` **ve** `PollDto.canSeeVoters === false`.
- Global aramada başka konuşmanın mesajı sızmıyor; `historyFromAt` öncesi mesaj dönmüyor.
- Öneri ucunda engellenen/istekli/arkadaş elenmiş.
- Sorgu bütçesi testleri (mevcut sayaç yardımcısı ile).

## Kapı

```bash
pnpm --filter @wizards/web test -- --test-name-pattern "(polls|pins|suggestions|search|route-contract)"
pnpm typecheck && pnpm lint
pnpm --filter @wizards/web e2e:api
```

Rapor: `raporlar/03-rapor.md`. §"Sözleşme değişikliği" istemci fonksiyon imzalarını ve `poll:updated`
yükünü **birebir** yazar — Ş6 ve Ş7 bunu okuyacak.
