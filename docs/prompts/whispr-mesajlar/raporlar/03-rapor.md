# Dalga 1 · Ş2 — API uçları, servisler, realtime — rapor

**Tarih:** 2026-08-20 · **Branch:** `uat` · **Durum:** kapı yeşil, commit edilmedi.

---

## Ne yapıldı

### Çoklu sabitleme (karar #7)

`lib/dm/pins-service.ts` + 13 test. Üç uç: `GET/POST /v1/dm/[conversationId]/pins`,
`DELETE .../pins/[messageId]`.

- **Yetki sorgunun içinde:** `loadContext` konuşmayı `participants: { some: { userId } }` ile
  çeker; katılımcı olmayan hiçbir satır bulamaz ve 403 aynı ifadeden düşer.
- **1:1 DM'de her iki taraf sabitleyebilir.** Eski `setPinnedMessage` `assertGroupConversation`
  istiyordu; SPEC §5.2 DM'de de "1 sabitlenen mesaj" gösteriyor.
- Okumada iki eleme: silinmiş mesaj çizilmez (şeritte alıntılamak silinmiş içeriği geri koyardı),
  `historyFromAt` öncesi sabit gizlenir (sabitlenmiş olması onu okunabilir kılmaz).
- Tavan 50; **zaten sabitli** bir mesajı yeniden sabitlemek tavanda reddedilmez — hiçbir şey
  eklenmiyor.
- Yayın (`dm:conversation:pins`) yalnız **sayıyı** taşır: liste görüntüleyene göre süzülüyor, tek
  bir yükü herkese göndermek birinin göremeyeceği alıntıyı diğerinin ekranına koyardı.

### Anket (karar #1, #11, #12)

`lib/polls/{presentation,service}.ts` + 18 test. Dört uç: `POST /v1/polls`,
`GET /v1/polls/[pollId]`, `PUT|DELETE .../vote`, `GET .../voters`.

- **Anket bir mesajdır ve tek gönderim yolundan geçer.** `createPollMessage`
  `sendDirectMessage`'ı çağırır; gönderme izni, engel kontrolü ve kaybolan mesaj penceresi orada
  yaşıyor ve ikinci bir yazma yolu onları ikinci kez unutmak olurdu.
- Anket satırları mesajla **aynı transaction'da** yazılır (`createRealtimeDMMessage`): seçenekleri
  commit edemeyen bir anket mesajı, oy verilecek şeyi olmayan bir kart olurdu — ve gönderim o
  noktada zaten duyurulmuştur.
- `closesAt` **sunucuda** hesaplanır. İstemciden gelen bir kapanma anı, saati ileri alınmış bir
  istemcinin hiç kapanmayan anketi demek olurdu.
- Oy **tam küme** olarak yazılır (fark değil): iki tık aynı anda uçarken istemci ile sunucunun
  önceki duruma dair anlaşması gerekmez. Yazım tek transaction'da `deleteMany` + `createMany`;
  tek seçimlide oy **taşınır**, iki eşzamanlı istek voter'ı iki seçenekte bırakamaz.
- **Anonimlik uçta zorlanır** (karar #11): `GET /voters` `anonymous` iken **403** verir ve
  `loadVoters` hiç çağrılmaz; anketi açan da göremez. `canSeeVoters` sunucuda türetilir, istemci
  `!anonymous` diye hesaplamaz.
- Katılımcı olmayana **404**, 403 değil: "var ama senin değil" demek yine var olduğunu söylemek.

### Global mesaj arama (karar #6)

`lib/messages/{global-dm-search-service,match-ranges}.ts` + 16 test.
`GET /v1/dm/messages/search`.

- Üyelik ve geçmiş penceresi **tek sorguda**: `INNER JOIN "DMParticipant" p ON ... AND p."userId"
= $viewer` + `(p."historyFromAt" IS NULL OR m."createdAt" >= p."historyFromAt")`. Konuşma
  listesini önce çekip `IN (...)` yazmak iki yerde iki kural olurdu ve taban konuşma başına
  değişiyor.
- **İki sorgu**, plandaki bütçeyle uyumlu: arama + sayfadaki konuşmaların adları.
- Vurgu aralıkları sunucuda (`findMatchRanges`) ve **kod noktası** cinsinden.

### Arkadaş önerileri ve sıralama (karar #8)

`lib/friends/suggestions-service.ts` + 10 test. `GET /v1/friends/suggestions`,
`PUT /v1/friends/sort`.

- Eleme tek okumada: `FriendRequest` arkadaşlığı, iki yönlü bekleyen isteği **ve** engeli aynı
  tabloda taşıyor.
- Ortak arkadaş sayısı aday başına sorgu **değil**: görüntüleyenin arkadaş kimlikleri bir kez,
  sonra tek toplu okuma.
- Öneri satırı **presence taşımaz**. Tasarım durum noktası çizmiyor; görünmemesini redaksiyona
  bırakmak yerine alanı hiç koymamak görünürlük ayarını yanlış uygulama ihtimalini kaldırır.
- `viaServerName` en kalabalık ortak sunucu, eşitlikte kimliğe göre — iki istek "hangi sunucudan
  geldi" sorusuna farklı cevap veremez.

### Sözleşme ve altyapı

- `DMMessagePayload.poll?: PollDTO | null` — yalnız anketi olan mesajda dolu.
- Socket: `dm:conversation:pins`, `poll:updated`. Tek `poll:updated`; oy verme, taşıma ve geri
  çekme aynı yükü yayınlar ve `myOptionIds` **boş** gider (kendi seçimi alıcıya özel).
- Hız sınırları: `dm:messages:search` 30/dk, `dm:pins:list` 120, `dm:pins:write` 30,
  `friend:suggestions` 30, `friend:sort` 60, `poll:create` 5, `poll:read` 120, `poll:vote` 20.
- `lib/messages/screen-client.ts` — Dalga 2'nin çağıracağı **tek** istemci yüzeyi; yanıtlar zod
  ile ayrıştırılıyor.
- `DMConversation.avatarColor` `VarChar(7)` → `VarChar(16)` (Dalga 0 raporunun açık kalanı).

---

## Sözleşme değişikliği

`lib/messages/screen-client.ts` dışa verdikleri (Dalga 2 bunları çağırır, `fetch` yazmaz):

```ts
fetchConversationPins(conversationId): Promise<PinnedMessageDTO[]>
pinDmMessage(conversationId, messageId): Promise<PinnedMessageDTO[]>
unpinDmMessage(conversationId, messageId): Promise<PinnedMessageDTO[]>
createPoll(input: PollCreateRequest & { content?, conversationId }): Promise<DMMessagePayload>
fetchPoll(pollId): Promise<PollDTO>
castPollVote(pollId, optionIds): Promise<PollDTO>
clearPollVote(pollId): Promise<PollDTO>
fetchPollVoters(pollId): Promise<PollVoterDTO[]>   // anonimde 403
searchDmMessagesGlobal(input): Promise<MessageSearchPage>
fetchFriendSuggestions(): Promise<FriendSuggestionDTO[]>
updateFriendsSort(sort): Promise<void>
```

Socket yükleri:

```ts
"dm:conversation:pins": { conversationId: string; pinnedCount: number }
"poll:updated":         { conversationId: string; poll: PollDTO }  // poll.myOptionIds === []
```

---

## Plandan sapmalar

1. **`poll:updated` anket oluşturulurken yayınlanmaz.** Mesajın kendisi `dm:message:new` ile
   odaya zaten ulaşıyor ve anketi içinde taşıyor; ikinci bir olay kartı iki kaynaktan iki kez
   çizdirirdi.
2. **`totalLabel` sayfanın uzunluğudur**, tüm eşleşmelerin sayısı değil. Toplam sayım ayrı ve
   pahalı bir `COUNT(*)` olurdu ve panel onu hiçbir yerde göstermiyor.
3. **Vurgu iki aşamalı ve ikincisi bir sezgiseldir.** Tasarım `yoğunluk` sorgusu için
   `yoğunluğu` kelimesini vurguluyor; ünsüz yumuşaması yüzünden ne alt dize ne önek.
   `findMatchRanges` önce tam alt dizeyi arar, bulamazsa **ortak önek** kuralına düşer
   (terimin ≥%75'i, en az 4 karakter). Eşleşmeyi getiren sorgu (İngilizce tsvector **veya**
   `ILIKE`) ile vurguyu koyan kural aynı şey değil; ayrıldıkları yerde vurgu **eksik** kalır,
   yanlış kalmaz.

---

## Ölçüm ve gözlem

- **Fan-out zaten set tabanlı.** `createRealtimeDMMessage` okunmamış sayaçlarını tek
  `updateMany` ile yazıyor; kodun kendi yorumu eski hâli "32 serialised round trip" diye
  anıyor. Karar #3'ün 250 üye endişesi bu katmanda **çözülmüş durumda**.
- **Ama socket yayını hâlâ katılımcı başına döngü.** `sendDirectMessage` her katılımcı için ayrı
  `mapDMMessagePayload` + `emit` yapıyor; 250 üyeli grupta 250 eşleme ve 250 yayın. Ölçülmedi —
  gerçek veritabanı gerekiyor. **Dalga 3 §5'in performans bütçesinde ölçülecek** ve gerekirse
  oda yayınına (`io.to("dm:{id}")`) çevrilecek; engel, yükün alıcıya özel `clientNonce` taşıması.

---

## Kapı çıktısı

```
pnpm typecheck                   ✔ 5/5
pnpm lint                        ✔ 5/5
pnpm --filter @wizards/web test  ✔ 3409 / 3409
route-contract.test.ts           ✔ yeni 5 uç kayıtlı
```

---

## Açık kalanlar

- **Migration koşulmadı** (Dalga 0 ile aynı sebep). `avatarColor` genişletmesi aynı dosyaya
  eklendi.
- **Yarış testi gerçek veritabanı ister.** "Aynı kullanıcıdan iki eşzamanlı oy" senaryosu birim
  testinde `replaceVote` sahtesiyle değil, `e2e:api` ile doğrulanmalı — Dalga 3 §6.1'e taşındı.
- **`EXPLAIN (ANALYZE, BUFFERS)` alınmadı**: 10k mesajlık fikstür için canlı veritabanı gerekiyor.
  Dalga 3 §5'te.
