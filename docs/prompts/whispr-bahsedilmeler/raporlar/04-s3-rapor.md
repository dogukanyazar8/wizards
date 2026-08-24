# Ş3 raporu — okuma API'si, sayacın tek kaynağa taşınması, socket

Tarih: 2026-08-21 · Branch: `uat` · **Commit atılmadı.**

Dört dalın sorgusu da baştan yazıldı ve boş veriyle test edildi; Ş2 beklenmedi.

---

## Yazılan dosyalar

| Dosya                                                                                     | Durum                                                |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `apps/web/src/lib/mentions/mentions-query.ts`                                             | yeni — dört dal, `UNION ALL`, üç anahtarlı imleç     |
| `apps/web/src/lib/mentions/mentions-query.test.ts`                                        | yeni — 35 test                                       |
| `apps/web/src/lib/mentions/mentions-service.ts`                                           | yeni — liste, sayaç, bağlam, durum yazımı, read-all  |
| `apps/web/src/lib/mentions/mentions-service.test.ts`                                      | yeni — 30 test                                       |
| `apps/web/src/lib/mentions/realtime.ts`                                                   | yeni — üç yayın yardımcısı                           |
| `apps/web/src/lib/mentions/realtime.test.ts`                                              | yeni — 4 test                                        |
| `apps/web/src/lib/mentions/client.ts`                                                     | yeni — Ş1 bölümü + `// Ş3` sınırı sonrası            |
| `apps/web/src/app/api/v1/mentions/route.ts` + `route-logic.ts`                            | yeniden yazıldı                                      |
| `apps/web/src/app/api/v1/mentions/route-logic.test.ts`                                    | yeniden yazıldı — 10 test                            |
| `apps/web/src/app/api/v1/mentions/counts/route.ts` + `route-logic.ts` + test              | yeni — 6 test                                        |
| `apps/web/src/app/api/v1/mentions/[mentionId]/context/route.ts` + `route-logic.ts` + test | yeni — 7 test                                        |
| `apps/web/src/app/api/v1/mentions/[mentionId]/state/route.ts` + `route-logic.ts` + test   | yeni — 8 test                                        |
| `apps/web/src/app/api/v1/mentions/read-all/route.ts` + `route-logic.ts` + test            | yeni — 8 test                                        |
| `apps/web/src/lib/socket/events.ts`                                                       | `mention:new` · `mention:state` · `mention:read-all` |
| `apps/web/src/lib/home/summary-service.ts`                                                | yalnız `unreadMentions` hesabı (K4)                  |

**Sahiplenilen liste dışında dokunulan üç dosya** (hepsi gerekliydi, üçü de eklemeli):

| Dosya                                                     | Ne yapıldı                                                                                                                    | Neden                                                                                                                                               |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/api-rate-limit.ts`                      | 4 yeni eylem: `mentions:counts` (240/dk), `mentions:context` (120/dk), `mentions:state` (240/dk), `mentions:read-all` (20/dk) | Yeni uçların hız bütçesi olmadan `runHomeRoute` tip hatası verir; rota sözleşmesi de kayıtsız eylem kabul etmiyor                                   |
| `apps/web/src/lib/home/home-test-doubles.ts`              | `MODEL_NAMES`e `mentionState`, `threadFollow`, `dMMessage`, `dMMessageMention`, `role` eklendi                                | Sahte veritabanı yalnız listedeki modellere Proxy veriyor; eksik ad `undefined` olur ve test "model yok" demek yerine "satır tanımsız" diye kırılır |
| `apps/web/src/app/api/v1/app/summary/route-logic.test.ts` | K4 sözleşmesine göre güncellendi                                                                                              | `unreadMentions` kaynağı değişti; testin eski hâli artık var olmayan bir toplamı doğruluyordu                                                       |

---

## 1. Birleşik sorgu

Dört dal tek `UNION ALL`, sıralama **üç** anahtarlı: `(readLaterFirst, occurredAt, mentionId)`.

| Dal        | Sürücü tablo                              | `stateKey`          | `kind`         |
| ---------- | ----------------------------------------- | ------------------- | -------------- |
| `channel`  | `MessageMention` (`kind IN (SELF, ROLE)`) | `channel` / `mm.id` | `me` \| `role` |
| `dm`       | `DMMessageMention`                        | `dm` / `dmm.id`     | `me`           |
| `everyone` | `Message.mentionEveryone = TRUE`          | `everyone` / `m.id` | `everyone`     |
| `thread`   | `ThreadFollow` ⋈ `Message.threadParentId` | `thread` / `m.id`   | `thread`       |

**`THREAD` kanal dalından çıkarıldı.** `MentionKind` enum'unda `THREAD` var ama kanal dalı
`kind IN ('SELF','ROLE')` ile sınırlı: thread yanıtı `ThreadFollow` dalından geliyor ve iki dal
aynı satırı üretirse kart akışta iki kez çıkardı. **Ş2 için bağlayıcı:** thread yanıtına
`MessageMention` satırı yazılacaksa akış onu **görmeyecek**; takip `ThreadFollow` üzerinden
temsil edilmeli (karar K3 zaten bunu söylüyor).

**Görünürlük sorgunun kendi süzgeci.** Kanal erişimi `resolveHomeChannelAccess`ten gelen kimlik
listesi (`m."channelId" IN (...)`), DM üyeliği `DMParticipant` join'i, `historyFromAt` sınırı,
`deletedAt` / `placeholderRemovedAt` / `expiresAt`. Görünür kanal yoksa kanal dalları **hiç
kurulmuyor** — sonucu elemek değil, hiç sormamak. Filtre `dm` dışıysa ve kanal listesi boşsa
sorgu tümüyle atlanıyor (`buildMentionUnion` `null` döner).

**Sayfa iki sorgu ediyor:** birleşik sorgu, sonra sayfadaki thread üst mesajları için tek
`GROUP BY` yanıt sayımı. Yanıt sayısını dalın `SELECT`ine korelasyonlu alt sorgu olarak koymak,
`LIMIT` uygulanmadan **önce** eşleşen her satır için çalışması demekti.

---

## 2. Okundu durumu

```
unread = (MentionState.readAt IS NULL) AND COALESCE(Notification.read, TRUE) = FALSE
```

Dört dalın dördünde de aynı ifade. `MentionState` satırı yoksa `Notification` belirliyor;
bildirim satırı olmayan bahsetme **okunmuş** sayılıyor (tuzak #2 korundu).

`PATCH .../state` ile `read` yazıldığında `MentionState.readAt` **ve** ilgili `Notification`
satırı birlikte yazılıyor. `notifications/service.ts: markRead` yolundan bilerek geçilmedi:
o yol `releaseChannelMention` ile `ChannelReadState.mentionCount` sayacını da düşürür ve K4 o
sayacı kanal satırı rozetine bıraktı. Testte doğrulandı: yirmi kez okundu/okunmadı çevirmek
20 `mentionState.upsert` + 20 `notification.updateMany` üretiyor, `channelReadState.*` ve
`dMParticipant.*` **hiç** çağrılmıyor.

---

## 3. Uçlar

| Uç                                         | Hız bütçesi               | Not                                                                |
| ------------------------------------------ | ------------------------- | ------------------------------------------------------------------ |
| `GET /api/v1/mentions`                     | `mentions:list` 120/dk    | `filter`, `source`, `q`, `window`, `group`, `cursor`, `limit ≤ 50` |
| `GET /api/v1/mentions/counts`              | `mentions:counts` 240/dk  | `window`; varsayılan `30d`                                         |
| `GET /api/v1/mentions/[mentionId]/context` | `mentions:context` 120/dk | ±2 mesaj, `isMention` bayrağıyla                                   |
| `PATCH /api/v1/mentions/[mentionId]/state` | `mentions:state` 240/dk   | `{ read?, readLater?, dismissed? }` → güncel `Mention`             |
| `POST /api/v1/mentions/read-all`           | `mentions:read-all` 20/dk | `{ affected, undoToken }`                                          |
| `POST /api/v1/mentions/read-all?undo=1`    | aynı                      | `{ restored }`, 10 dakikalık jeton                                 |

`mentionId` bileşik ve `parseMentionId` ile çözülüyor; elle `split` yok. Tanınmayan kaynak
400 (`MENTION_ID_INVALID`), erişilemeyen bahsetme 404 ("yasak" değil, "yok"), süresi dolmuş
geri alma jetonu 410 (`MENTION_UNDO_EXPIRED`).

**`read-all` yalnız bahsetmeleri okuyor (K11).** Yazılan bildirim kimlikleri bahsetme
sorgusunun kendi `notificationId` kolonundan geliyor, yani `updateMany` `WHERE id IN (...)` ile
sınırlı — arkadaşlık isteği ya da sistem bildirimi bu listeye giremez. Testte açıkça doğrulandı.

Geri alma kaydı Redis'te `mentions:read-all-undo:<userId>:<token>`, TTL 600 sn, tek kullanımlık
(geri alındığında siliniyor). Anahtar kullanıcıya bağlı: başka bir kullanıcının jetonu 410 alır.

**Arama sunucu tarafında.** `ILIKE`; kanal dallarında mesaj metni + `username` + `displayName` +
kanal adı + sunucu adı, DM dalında mesaj metni + `username` + `displayName` + konuşma adı.
`%` ve `_` kullanıcı metninde veri olarak kaçırılıyor — kaçırılmasaydı `%` yazan biri bütün
satırları eşleştirir ve arama sessizce filtresiz kalırdı.

---

## 4. Sayaç (K4)

`app/summary` artık `unreadMentions` değerini `countMentionsInScope` ile bahsetme sorgusundan
okuyor. `ChannelReadState.mentionCount` ve `DMParticipant.mentionCount` **silinmedi**; kanal ve
DM satır rozetleri onları okumaya devam ediyor. Kesilen tek bağ summary'nin bağı.

`readCounters` artık yalnız `dmUnread` hesaplıyor. Kanal erişimi `getHomeSummary`nin ilk
adımında zaten çözüldüğü için sayaca **hazır geçiyor**; ikinci bir izin sorgusu tek bir sayı
için iki kat maliyet demekti. Sorgu bütçesi 4 → **5**, ve kanal adediyle büyümüyor (test bunu
40 sunucu × 25 kanal ile doğruluyor).

**Pencere ayrımı — rapora yazılması istenen madde.** Gezinme paneli rozeti `window=all` sayıyor
(30 günden eski bir okunmamış bahsetme hâlâ okunmamıştır ve rozet bir pencere değil bir borç
gösterir); `GET /mentions/counts` ise ekranın gösterdiği pencereyi sayıyor ve varsayılanı `30d`.
İkisi **aynı yardımcıyı** çağırıyor, yalnız pencere farklı. Ekranın `Hepsi okundu` durumu bu
yüzden sayaca değil kendi penceresine bakmalı (Ş5'in işi).

**30 saniyelik önbellek yazılmadı — bilinçli sapma.** Şerit metni `summary` için istek kapsamlı
30 sn'lik bir bellek öngörüyordu. Yazılmadı, çünkü süreç ömürlü 30 sn'lik bir önbellek
`Tümünü okundu işaretle`den hemen sonra bayat rozet gösterirdi — ve bu, K11'in geri alınabilir
kılmak istediği eylemin tam kendisi. `summary` istek başına bir kez çağrılıyor, yani istek
kapsamlı bir bellek zaten hiçbir çağrıyı tekrarlamıyordu. Ölçüm aşağıda: sayaç sorgusu 306 bin
satırlık `MessageMention` üzerinde **36 ms**.

---

## 5. Socket

`events.ts`'e üç olay, hepsi `user:<id>` odasına:

```ts
"mention:new":      (payload: { counts: MentionCounts; mention: Mention }) => void;
"mention:state":    (payload: { counts, dismissed, mentionId, readLater, unread }) => void;
"mention:read-all": (payload: { counts: MentionCounts }) => void;
```

`notification:new` **kaldırılmadı**. Sayaçlar olayın içinde geliyor: olayı alıp sayacı ayrıca
sorgulamak, iki istek arasındaki pencerede yanlış sayı göstermek demek.

`mention:new` yayıncısı (`publishMentionCreated`) yazıldı ama **çağıranı Ş3'te yok** —
fan-out Ş2'nin işi. Ş2 alıcı başına bir kez `publishMentionCreated(userId, mention, counts)`
çağırmalı.

---

## 6. `EXPLAIN ANALYZE`

Yerel veritabanı (`wizards@localhost:5432`) 4 mesaj taşıyor; o hacimde her plan seq scan çıkar
ve hiçbir şey kanıtlamaz. Ölçüm tek bir işlem içinde sentetik hacim yazıp `ANALYZE` ettikten
sonra alındı ve **geri alındı** — kalıcı satır bırakılmadı (ölçüm sonrası sayımlar: `Message` 4,
`MessageMention` 0, `MentionState` 0).

Hacim: `Message` 300 004 · `MessageMention` 306 000 (izleyicinin payı ≈ %2, gerçekçi dağılım) ·
`Notification` 152 729 · `MentionState` 60 000 · `DMMessage` 20 019 · `DMMessageMention` 5 000 ·
`ThreadFollow` 40.

### 6.1 Liste sorgusu — `window=30d`, `filter=all`, `limit=20`

```
Limit  (cost=20581.24..20583.68 rows=21 width=630) (actual time=36.666..38.160 rows=21 loops=1)
  ->  Gather Merge (Workers Launched: 2)
        ->  Sort  Sort Key: ((ms."readLaterAt" IS NOT NULL)) DESC, m."createdAt" DESC, ... DESC
              Sort Method: top-N heapsort  Memory: 41kB
              ->  Parallel Append  (actual time=6.670..14.817 rows=944 loops=3)
Planning Time: 11.285 ms
Execution Time: 38.662 ms
```

Dört dalın sürücü düğümleri:

| Dal        | Düğüm                                                                                                                                                                                                       | Satır  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `channel`  | `Parallel Bitmap Heap Scan on "MessageMention"` ← `Bitmap Index Scan on "MessageMention_userId_createdAt_idx"` (`Index Cond: userId = $1 AND createdAt > $window`), sonra `Index Scan using "Message_pkey"` | 1 483  |
| `everyone` | `Index Scan using "Message_mentionEveryone_channelId_createdAt_idx"` (`Index Cond: channelId = ANY(...) AND createdAt > $window`)                                                                           | 87     |
| `thread`   | `Parallel Index Scan using "Message_threadParentId_createdAt_idx"`                                                                                                                                          | 1      |
| `dm`       | `Index Scan using "DMMessage_conversationId_alsoSentToChannel_createdAt_idx"`, `DMMessageMention_messageId_userId_key` ile sonda                                                                            | 20 008 |

Yan tabloların hepsi indeksle: `Notification_dedupeKey_key` (nested loop, döngü başına
0.001 ms), `MentionState_userId_source_refId_key`, `MentionState_userId_readLaterAt_idx`,
`Message_pkey`, `Channel_pkey`, `DMConversation_pkey`.

**30 günlük pencerede büyük tabloların hiçbirinde seq scan yok.** Plandaki seq scan'ler yalnız
sözlük tablolarında: `User` (11 satır), `Server` (7), `Channel` (16), `Role` (21),
`DMParticipant` (9). Bu boyutta seq scan planlayıcının doğru seçimi — 1 sayfalık bir tabloya
indeksle gitmek daha pahalı.

### 6.2 Sayaç sorgusu — `window=30d`

```
Planning Time: 7.900 ms
Execution Time: 36.128 ms
```

Aynı dallar, aynı indeksler; `WITH mentions AS (...)` bir kez taranıyor ve yedi kova + `bySource`
oradan okunuyor.

### 6.3 `window=all` — ölçüldü, sınırı kayda geçiyor

```
Execution Time: 85.483 ms
->  Parallel Seq Scan on "Message" m_2     (rows=100 001 loops=3)
->  Parallel Seq Scan on "Notification" n_2 (rows=76 364 loops=2)
```

Pencere kalkınca planlayıcı kanal dalında hash join + seq scan'e geçiyor. Beklenen ve kabul
edilebilir: `all` "sınırsız" demek ve arşivi açan bir eylem (K7). Kabul ölçütü 30 günlük
pencereyi bağlıyor, o karşılanıyor. **Ama** gezinme paneli rozeti `window=all` sayıyor
(§4) — yani her `app/summary` isteği bu planı koşuyor. 300 bin mesajda 85 ms; ölçek büyüdüğünde
Dalga 3'te yeniden ölçülmeli.

### 6.4 Ölçülen iki takip maddesi

1. **DM dalının sürücüsü yanlış tarafta.** Planlayıcı `DMParticipant` (1 satır) → `DMMessage`
   (konuşmanın **tüm** 20 008 mesajı) → `DMMessageMention` sondasını seçiyor; yani maliyet
   izleyicinin bahsetme sayısıyla değil **konuşmanın büyüklüğüyle** ölçekleniyor. Burada 6.7 ms,
   2 milyon mesajlık bir konuşmada değil. `dmm."createdAt"` üzerindeki pencere yüklemi
   `DMMessageMention_userId_createdAt_idx`i sürebilirdi.
   **Denenmedi, bilerek:** aynı pencereyi `m."createdAt"` üzerine de yazmak planı düzeltirdi ama
   davranışı değiştirirdi — düzenlemeyle sonradan eklenen bir bahsetmede mesaj tarihi ile
   bahsetme tarihi ayrışır ve satır sessizce elenirdi. Doğruluk için plan feda edildi; Dalga 3'e
   madde.
2. **`window=all` sayaç planı** — §6.3.

---

## 7. Sapmalar ve `TODO(api):` notları

| #   | Konu                                                                                                                                                                                                                                                                                                                                                                                                 | Karar                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **`client.ts`nin Ş1 bölümü Ş3 tarafından yazıldı.** Şerit "Ş1'in bıraktığı `// Ş3` sınırından sonrasını yaz" diyordu; dosya iş başladığında **yoktu** ve Ş1 rayı `mentionsQueryKeys` + `fetchMentionCounts` + `MENTIONS_STALE_TIME_MS` ile birlikte landed etti. Sınır yorumu korunarak sınırın **öncesi** de yazıldı, Ş1'in bileşenlerinin beklediği üç ihraç birebir karşılandı (typecheck yeşil). | Ş1 dosyayı devralırsa sınırın üstünü değiştirebilir, altına dokunmamalı                                                                                                                                            |
| 2   | **`Notification.dedupeKey` önekleri `MENTION_DEDUPE_PREFIX` sabitinde donduruldu.** `channel-mention:` / `dm-message:` / `channel-thread-reply:` bugün üretiliyor; **`channel-everyone:` üretilmiyor**.                                                                                                                                                                                              | **Ş2 için bağlayıcı:** kitlesel çağrı bildirimi bu öneki kullanmalı. O gelene kadar `COALESCE(n."read", TRUE)` kuralı `@herkes` kartlarını okunmuş gösteriyor — doğru olan da bu, bekleyen bir bildirim hiç olmadı |
| 3   | **`TODO(i18n)`: `MENTION_EVERYONE_TAG = "@herkes"` sunucuda üretiliyor.** `Message.mentionEveryone` `@everyone` ile `@here` arasında ayrım tutmuyor (00-ortak-baglam §2.3), bu yüzden kart tek takı gösteriyor. Sözlükteki karşılığı `mentions.badge.everyone`                                                                                                                                       | Ekran çok dilli olduğunda takı sözlükten okunmalı                                                                                                                                                                  |
| 4   | **`TODO(api)`: "thread kapandı" bayrağı yok.** `thread.open` üst mesajın hâlâ duruyor olmasından türetiliyor (`BOOL_OR(parent."deletedAt" IS NULL)`). `mentions.card.threadClosed` metni sözlükte var ama arkasında gerçek bir kapatma kavramı yok                                                                                                                                                   | Uydurma uç yazılmadı                                                                                                                                                                                               |
| 5   | **`TODO(api)`: adsız grup DM'inin başlığı.** `COALESCE(conv."name", u."displayName", u."username")` — 1:1'de yazar zaten karşı taraf, adlı grupta ad kazanıyor, **adsız grupta** kart yazarın adını gösteriyor. Üye adlarından başlık türeten bir uç yok                                                                                                                                             | Ek sorgu yazmak yerine not bırakıldı                                                                                                                                                                               |
| 6   | **Mutasyon uçları `runHomeRoute` kullanmıyor.** `route-contract.test.ts` `parseJsonBody`nin dışa açılan işleyicinin `request`ini tükettiğini AST üzerinden izliyor ve bir geri çağrının içine gömülmüş çağrıyı göremiyor — göremediği şey "gövdesiz uç" listesine düşüyor. İki mutasyon ucu açık `try`/`catch` ile yazıldı; sıra aynı: kimlik → bütçe → gövde                                        | Alternatif (gövdeyi `runHomeRoute` öncesinde okumak) kimliği doğrulanmamış isteğin gövdesini okurdu                                                                                                                |
| 7   | **Eski `lib/home/mentions-service.ts` testleri taşındı.** Rota yeni sorguyu çağırdığı için eski servisin çağıranı kalmadı; testleri `apps/web/src/lib/home/mentions-service.test.ts` dosyasına taşındı (9 test, aynen). Dosya Dalga 3'te servisle birlikte silinecek                                                                                                                                 | Silinecek bir kodu testsiz bırakmak, silinene kadar kimsenin fark etmeyeceği bir bozulma demek                                                                                                                     |
| 8   | **`lib/home/client.ts: fetchMentions` ve `components/screens/mentions-screen.tsx` artık uyumsuz.** Rota yeni sözleşmeye geçti; eski ekran `/api/v1/mentions` yanıtını `MentionsResponseSchema` ile ayrıştırıyor ve çalışma anında kırılacak                                                                                                                                                          | Beklenen geçiş durumu: Ş5 ekranı devralıyor, Dalga 3 ikisini de siliyor. Kayda geçirildi                                                                                                                           |
| 9   | **`selectMentionBranches` filtre başına dal seçiyor.** `role` → `channel` + `everyone` (tek sekme, iki kaynak), `me` → `channel` + `dm`, `dm` → yalnız `dm`, `thread` → yalnız `thread`. Bir sunucu seçiliyken DM dalı hiç kurulmuyor                                                                                                                                                                | DM'lerin sunucusu yok; dal her satırını eleyerek boşuna okunurdu                                                                                                                                                   |

---

## Kabul ölçütleri

- [x] Dört tür de listede doğru `kind`, `tag`, `source` ve `unread` ile dönüyor
- [x] `window=30d` varsayılan; `window=all` eskileri getiriyor; imleç iki pencerede de tutarlı
- [x] `readLater` kartları filtre/gruplama ne olursa olsun listenin başında (imleç bayrağı taşıyor)
- [x] `dismissed` kart listede yok ama mesaj kanalda duruyor; tek bahsetme okuması onu gösteriyor
- [x] `Okunmadı işaretle` iki tarafı da geri alıyor; 20 tekrarda sayaç sapmıyor
- [x] `read-all` yalnız bahsetmeleri okuyor — yazım sorgunun döndürdüğü bildirim kimlikleriyle sınırlı
- [x] `read-all?undo=1` durumu geri getiriyor; jeton tek kullanımlık, kullanıcıya bağlı, 10 dakikalık
- [x] `counts` ve gezinme paneli rozeti aynı yardımcıdan okuyor (pencere farkı §4'te)
- [x] Arama sunucuda; istemci yüklenmiş sayfaları süzmüyor
- [x] Görünürlüğü kaybedilen kanalın bahsetmesi listede yok — dal hiç kurulmuyor
- [x] `EXPLAIN ANALYZE` alındı; 30 günlük pencerede büyük tablolarda seq scan yok

---

## Kapı çıktısı

```
pnpm --filter @wizards/web typecheck   ✔ (çıktı yok)
pnpm --filter @wizards/web lint        ✔ 10/10 config testi + eslint temiz
pnpm --filter @wizards/web test        3873 test · 3871 pass · 1 fail · 1 skip
```

**Tek başarısız test Ş3'e ait değil:** `src/lib/notifications/mention-settings-service.test.ts`
→ "binds the Settings page toggles to the same endpoint the modal uses". Dosya Ş4'ün
(paralel şerit) ve rapor yazılırken hâlâ landing hâlinde. Ş3'ün dosyaları ayrı koşturulduğunda
tamamı yeşil:

```
src/lib/mentions/mentions-query.test.ts     35 pass
src/lib/mentions/mentions-service.test.ts   30 pass
src/lib/mentions/realtime.test.ts            4 pass
src/app/api/v1/mentions/**/route-logic.test  39 pass
src/app/api/v1/app/summary/route-logic.test   8 pass
src/app/api/v1/route-contract.test.ts        41 pass
```

Yeni test sayısı: **108**.
