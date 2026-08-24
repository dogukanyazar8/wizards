# Dalga 1 · Ş2 raporu — üretim katmanı (rol, `@herkes`, thread takibi, `kind`)

Tarih: 2026-08-21 · Branch: `uat` · **Commit atılmadı.**

Kapı yeşil. Hiçbir React bileşenine dokunulmadı — tek istisna `message-input.tsx`'in rol
otomatik tamamlama dalı ve onu besleyen iki satırlık prop geçişi (aşağıda sapma olarak kayıtlı).

---

## Ne yapıldı

### 1. Ayrıştırıcı — `mention-parser.ts` (yeni)

`extractMentionUsernames` buraya **taşındı**, gövdesi değişmedi;
`message-notification-service` onu yeniden ihraç ediyor, bu yüzden mevcut testleri ve mevcut
çağıranları hiç değişmedi (tuzak #3).

Yeni yüzey:

| Fonksiyon                      | İş                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `parseMentionTokens`           | `{ usernames, roleNames, mass }` — iki desen ayrı, aynı token iki listede olabilir |
| `normalizeRoleMentionName`     | Bir rol adının **iki** karşılaştırma anahtarı                                      |
| `matchRoleNameCandidate`       | Token ↔ rol eşlemesi                                                               |
| `containsRoleMentionCandidate` | Gönderim yolunun saf-regex "iş kuyruklayayım mı" sorusu                            |
| `filterRolesByMentionQuery`    | Bestekar önerisi — sunucu tarafıyla **aynı** eşleşme kuralı                        |

**İki küçültme anahtarı, bilinçli.** `"IŞIK".toLowerCase()` → `işik`, ama kullanıcı `@ışık`
yazar; `"Info".toLocaleLowerCase("tr")` → `ınfo`, ama kullanıcı `@info` yazar. Tek kural her iki
yönde de bir rolü görünmez yapıyordu, bu yüzden hem `tr` hem `en-US` anahtarı üretiliyor ve arama
ikisini birden deniyor. Anahtarlar yalnız **aynı sunucunun** rol adları arasında arandığı için
yanlış pozitif riski yok.

Ayrıştırıcı token'ın rol mü kullanıcı mı olduğuna karar **vermez**; kararı veri veriyor.

### 2. Rol bahsetmesi (K1) — `role-mention-service.ts` (yeni)

`resolveRoleMentions` sırası: rol adı eşlemesi → belirsiz token'lar için gerçek `User.username`
sorgusu (kullanıcı kazanır) → `mentionable` süzgeci → `mentionable = false` roller için
`MENTION_EVERYONE`. İzin yoksa **hata atılmıyor**: mesaj gidiyor, o rol bahsetme üretmiyor.

`createRoleMentionNotifications` alıcı kümesi: rol üyeleri ∩ `VIEW_CHANNEL` − gönderen −
kanal/sunucu sessize alanlar − `suppressRoleMentions` − **bu mesajda adıyla bahsedilenler**.

Satır: `MessageMention { kind: ROLE, roleId }` + `Notification`
(`dedupeKey = channel-mention:<messageId>:<userId>`, mevcut önek korundu) +
`ChannelReadState.mentionCount` artışı.

### 3. `@herkes` / `@burada` (K2) — `createChannelEveryoneNotifications`

`Message.mentionEveryone` yazımına **dokunulmadı** (`message-service.ts:835` ve `:1022` aynı).
Yalnız `EVERYONE_MENTION_NOTIFICATIONS` işi kuyruklanıyor ve iş **hiç `MessageMention` satırı
yazmıyor** — sadece `Notification` (`dedupeKey = channel-everyone:<messageId>:<userId>`).

### 4. Thread takibi (K3) — `thread-follow-service.ts` (yeni) + uç

`ensureImplicitFollow` / `setExplicitFollow` / `listThreadFollowers` /
`listMutedThreadFollowerIds` / `isThreadFollowed`.

Tetikleyiciler:

| Sebep                                | Nerede yazılıyor                  |
| ------------------------------------ | --------------------------------- |
| `AUTHOR` (üst mesajın yazarı)        | `message-service` gönderim işlemi |
| `REPLY` (yanıtı yazan)               | `message-service` gönderim işlemi |
| `MENTION` (thread içinde bahsedilen) | thread yanıtı bildirim işi        |
| `EXPLICIT`                           | `PUT/DELETE .../thread-follow`    |

Uç: `apps/web/src/app/api/v1/channels/[channelId]/messages/[messageId]/thread-follow/route.ts`.
Gövdesiz — yön HTTP metodunun kendisi. `route-contract.test.ts`'in gövdesiz allowlist'ine
kaydedildi.

### 5. `kind` yazımı

`createChannelMentionNotifications` → `SELF` · `role-mention-service` → `ROLE + roleId` ·
`dm/realtime-service` → `SELF`. `backfill-mention-kind.ts` yıkıcı iş yapmıyor: sayıyor,
tutarsız satırı (`kind = ROLE` ama `roleId = null`) `--apply` ile `SELF`e döndürüyor.
Varsayılan `--dry-run`.

### 6. Fan-out disiplini (tuzak #9)

Üç yeni yol da outbox'a kuyruklanıyor, hiçbiri gönderim yolunda koşmuyor. İşler mesajı yazan
**işlemin içinde** yazılıyor — kuyruklama başarısızsa mesaj da yazılmıyor (var olan desen).
Rol ve `@herkes` fan-out'ları 500'lük partiler hâlinde yazılıyor.

Gönderim yolunun eklediği tek iş: `containsRoleMentionCandidate(content)` — saf regex, sorgu yok.

---

## Bağlayıcı kararların gerçekleşmesi

| Karar | Nasıl karşılandı                                                                        |
| ----- | --------------------------------------------------------------------------------------- |
| K1    | Ayrıştırıcı + izin + fan-out + bestekar önerisi + bildirim/sayaç + mobil uyum (aşağıda) |
| K2    | Tablo yazılmadı; yalnız `channel-everyone:` bildirimi                                   |
| K3    | Örtük 3 sebep + `EXPLICIT`; `mutedAt` dolu satır örtük kurallarla açılmıyor             |
| K6    | `mentionThreadReplies` varsayılanı kapalı ve yazar hariç kimse bildirim almıyor         |
| K8    | Mobil tarafta kod değişikliği **gerekmedi** — gerekçe aşağıda                           |

### K3 ↔ K6 çelişkisi ve çözümü

Ş2 metni "alıcı `listFollowers` sonucudur (… `mentionThreadReplies` kapalı olanlar hariç)"
diyor. Bu **birebir** uygulansaydı, `mentionThreadReplies` varsayılanı kapalı olduğu için (K6)
üst mesaj yazarı şerit yayına girdiği gün susardı — ve bu, aynı belgedeki
"bugün bildirim alan üst mesaj yazarını KAYBETME" kabul maddesini ihlal ederdi.

Uygulanan kural, iki maddeyi de karşılayan tek kural:

- **Üst mesaj yazarı**: bugünkü koşullarla bildirim alır. Tek istisna, thread'i **bilerek**
  kapatmış olması (`ThreadFollow.mutedAt` dolu).
- **Diğer takipçiler**: `mentionThreadReplies` açık olmalı, kanal/sunucu sessize alınmamış
  olmalı, ve bu yanıtta adıyla bahsedilmemiş olmalı (aksi halde aynı yanıt için iki bildirim).

Testler ikisini de kanıtlıyor:
`still notifies the parent author when nobody enabled thread replies` ve
`leaves other followers silent while the default is off`.

### K8 — mobil neden değişmedi

`push-sender.ts` bildirim **tipinden bağımsız**: `type` alanını olduğu gibi taşıyor. Rol ve
`@herkes` bildirimleri `type: "MENTION"` üretiyor, yani mobil tarafta
`notifications-screen-model.ts`'in `MENTION` dalına, `mobile-notification-realtime.ts`'in
`mentions` süzgecine ve `mobile-sunucular-model.ts`'in okunmamış sayımına **zaten** düşüyorlar.
Thread yanıtı `SYSTEM` kaldı (mobil yönlendirme onun metadata'sına bakıyor; ayrım
`metadata.parentMessageId`). Dolayısıyla `push-sender` ve `mobile/bootstrap` için yazılacak satır
çıkmadı; ikisi de okundu, değiştirilmedi.

---

## Sapmalar (hepsi bilinçli)

1. **`message-input.tsx` tek başına yetmedi.** Öneri listesini besleyen prop hiçbir yerden
   geçmiyordu; `chat-area.tsx` (bir `useMemo` + iki prop satırı) ve `thread-panel.tsx` (üç satır
   geçiş) düzenlendi. Aksi halde K1'in "bestekar otomatik tamamlama" maddesi ölü doğardı.
   Liste yalnız `mentionable && !isDefault` rolleri gösteriyor: `MENTION_EVERYONE` sahibi kısıtlı
   bir rolü elle yazabilir, ama listeye koymak izni olmayan herkese "buna dokunabilirsin" demek
   olurdu.
2. **Locale dosyalarına 9 anahtar eklendi** (`tr.ts` / `en.ts`): rol ve `@herkes` bildirim
   başlığı/gövdesi (+ push varyantları) ve bestekar `Bir rol etiketle` başlığı. Dalga 1'de hiçbir
   şerit locale dosyası sahiplenmiyor; mevcut `chat.mentions.notifyBody` kullanılsaydı `@herkes`
   bildirimi "seni etiketledi" diye yalan söylerdi. Kullanıcıyla onaylandı.
3. **`api-rate-limit.ts`'e bir anahtar**: `mentions:thread-follow` (60/dk). Yeni ucun
   `enforceApiRateLimit` çağrısının karşılığı yoktu.
4. **`route-contract.test.ts` gövdesiz allowlist'i**: `PUT`/`DELETE .../thread-follow`.
   Takip düğmesinin tek bilgisi yönü ve onu metot taşıyor; tek bit için şema yazmak gereksizdi.
5. **`mentionSelf` anahtarı SELF dalına bağlandı.** Prompt bunu istemiyordu, ama Ş0.2 kolonu
   ekledi ve Ş4 ayarı yazıyor; okuyan kimse olmasaydı ayarlar modalındaki
   `Bana özel bahsetmeler` anahtarı hiçbir şey yapmayan bir düğme olurdu. Varsayılan `true`,
   yani kimsenin bugünkü davranışı değişmiyor.
6. **Sessiz saatler TODO adapter'la değil, gerçek fonksiyonla bağlandı.** Prompt
   `quiet-hours.ts` yoksa `() => false` diyordu; şerit koşarken dosya **vardı** (Ş4 paralel
   tamamlandı) ve kendi başlığında "the fan-out path (Ş2) owns what it does with the answer"
   yazıyordu. Dört fan-out da `isWithinQuietHours` okuyor ve sessiz saatte **yalnız push**
   bastırılıyor — satır, sayaç ve socket olayı yerinde kalıyor. Bu yüzden bu şeritte hiç
   `TODO(api):` bırakılmadı.
7. **Betik `src/scripts/` altında** (prompt'un verdiği yol). `apps/web/scripts/` daha yaygın
   ama test koşucusu yalnız `src/**` tarıyor; betiği src altında tutmak testinin kapıda
   koşmasını sağlıyor.
8. **`@everyone` ile `@here` ayrımı tutulmuyor** (tek bayrak, K2'nin kendi kabulü). Tasarımdaki
   pil metni `@herkes`.
9. **Varsayılan rol (`isDefault`) rol dalından bahsedilmiyor.** O `@herkes`in kendisidir ve K2
   ona ayrı, satırsız bir dal tutuyor. Aksi halde tek bir `@herkes` mesajı hem K2 dalını hem
   üye-başına-satır yazan rol dalını tetiklerdi.
10. **`MentionState` satırı bu şeritte yazılmıyor.** Dalga 0 notu #2 tabloyu **tembel** ilan
    ediyor: satır kullanıcı bir bahsetmeye dokununca doğar. Yazma yolunda satır üretmek, tuzak
    #2'yi (bildirim satırı olmayan bahsetme okunmuştur) tersine çevirirdi.
11. **`editMessage` bildirim üretmiyor** — bugün de üretmiyordu. `mentionEveryone` bayrağı
    düzenlemede yazılmaya devam ediyor; düzenlemenin fan-out'u bu şeridin kapsamı dışında.
12. **Mobil `Takip` düğmesi bağlanmadı.** Ş2'nin §"Sahiplenilen dosyalar" listesi `apps/mobile/**`
    içermiyor ve kapı komutları web+db. Uç hazır, `message-thread-screen.tsx:108`'deki
    `isFollowingThread` hâlâ yerel state. Kullanıcıyla onaylandı — devri aşağıda.

---

## Kalan iş / devir

- **`TODO(mobile):`** `apps/mobile/src/app/screens/message-thread-screen.tsx` — `Takip` düğmesi
  `PUT/DELETE /api/v1/channels/{channelId}/messages/{messageId}/thread-follow` ucuna bağlanacak.
  Uç `{ following: boolean }` döner. Sonraki mobil şeridin işi.
- **Ş3'e:** `@herkes` dalı `Message.mentionEveryone` bayrağından + `channel-everyone:` önekli
  bildirimden türetilir; rol dalı `MessageMention.kind = ROLE` (+ `roleId`) satırından; thread
  dalı `channel-thread-reply:` önekli `SYSTEM` bildiriminden (`metadata.parentMessageId` ayrımı).
- **Ş3'e (sayaç):** `@herkes` `ChannelReadState.mentionCount`'u **artırmıyor** (K2 gereği satır
  yok). Mobil rozeti bugün bu kolonu okuyor, yani `@herkes` mobil rozete düşmüyor. K4'ün tek
  kaynağı (`Notification` + `MentionState`) bunu web'de kapatıyor; mobil rozetin aynı kaynağa
  taşınması ayrı bir iş.
- **Ş4'e:** `desktopMentionMode` fan-out'ta **okunmuyor** — masaüstü bildirimi socket olayından
  doğuyor ve o kip istemci tarafında uygulanacak. Sunucu tarafında okunacak bir yer yok.

---

## Yeni/değişen dosyalar

| Dosya                                                                                      | Durum                                                                                               |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/workspace/mention-parser.ts`                                             | yeni                                                                                                |
| `apps/web/src/lib/workspace/mention-parser.test.ts`                                        | yeni — 12 test                                                                                      |
| `apps/web/src/lib/workspace/role-mention-service.ts`                                       | yeni                                                                                                |
| `apps/web/src/lib/workspace/role-mention-service.test.ts`                                  | yeni — 11 test                                                                                      |
| `apps/web/src/lib/workspace/thread-follow-service.ts`                                      | yeni                                                                                                |
| `apps/web/src/lib/workspace/thread-follow-service.test.ts`                                 | yeni — 6 test                                                                                       |
| `apps/web/src/lib/workspace/message-notification-service.ts`                               | `SELF` yazımı, paylaşılan süzgeç/teslimat yardımcıları, `@herkes` dalı, thread dalı yeniden yazıldı |
| `apps/web/src/lib/workspace/message-notification-service.test.ts`                          | +8 test (2 `@herkes`, 6 thread)                                                                     |
| `apps/web/src/lib/workspace/message-service.ts`                                            | rol izni ölçümü + 2 yeni iş + örtük takip                                                           |
| `apps/web/src/lib/workspace/message-service.test.ts`                                       | +7 test                                                                                             |
| `apps/web/src/lib/dm/realtime-service.ts`                                                  | `kind: "SELF"`                                                                                      |
| `apps/web/src/lib/dm/realtime-service.test.ts`                                             | +1 test                                                                                             |
| `apps/web/src/lib/outbox/service.ts`                                                       | 2 iş tipi + 2 şema + 2 kuyruklayıcı + 2 dağıtım dalı                                                |
| `apps/web/src/lib/outbox/service.test.ts`                                                  | +2 test                                                                                             |
| `apps/web/src/app/api/v1/channels/[channelId]/messages/[messageId]/thread-follow/route.ts` | yeni                                                                                                |
| `apps/web/src/app/api/v1/route-contract.test.ts`                                           | gövdesiz allowlist +2 satır                                                                         |
| `apps/web/src/scripts/backfill-mention-kind.ts`                                            | yeni                                                                                                |
| `apps/web/src/scripts/backfill-mention-kind.test.ts`                                       | yeni — 4 test                                                                                       |
| `apps/web/src/lib/api-rate-limit.ts`                                                       | +1 anahtar                                                                                          |
| `apps/web/src/lib/locale/messages/tr.ts` · `en.ts`                                         | +9 anahtar                                                                                          |
| `apps/web/src/components/chat/message-input.tsx`                                           | rol öneri dalı (prop, memo, klavye, render)                                                         |
| `apps/web/src/components/chat/chat-area.tsx`                                               | `mentionableRoles` memo + 2 prop satırı                                                             |
| `apps/web/src/components/chat/thread-panel.tsx`                                            | prop geçişi (3 satır)                                                                               |

Yeni test sayısı: **51**.

---

## Kabul maddeleri

- [x] `@tasarım` rol üyelerine satır + bildirim üretiyor; `mentionable` olmayan rol izinsiz
      kullanıcıda hiç satır üretmiyor, mesaj yine gidiyor
      (`produces nothing for a non-mentionable role without MENTION_EVERYONE`).
- [x] Hem `@kullanıcı` hem `@rol` ile bahsedilen üyede tek satır, `kind = SELF`
      (`drops a member who is also mentioned by username so SELF stays the only row`).
      Çözüm **sıra bağımlılığı olmadan**: rol dalı o üyeyi hiç yazmıyor, dolayısıyla iki işin
      drenaj sırası sonucu değiştiremiyor.
- [x] `@everyone` bildirim üretiyor, `MessageMention` satırı üretmiyor
      (`writes notifications but never a MessageMention row`).
- [x] Thread yanıtı üst mesaj yazarını kaybetmiyor; yanıtlayanlar ve bahsedilenler takipçi
      oluyor; `mutedAt` dolu takipçi almıyor (4 test).
- [x] `mentionThreadReplies` varsayılanı kapalı, kimse beklenmedik bildirim almıyor
      (`leaves other followers silent while the default is off`).
- [x] 2.000 üyeli rol fan-out'u partili (`writes a 2000-member role in 500-row batches` —
      4 × 500, hiçbir parti 500'ü aşmıyor).
- [x] Fan-out senkron değil, outbox'a kuyruklanıyor
      (`queues the role fan-out instead of writing it on the send path`); gönderim yolunun
      eklediği tek iş bir regex.
- [x] `extractMentionUsernames` davranışı bit birebir aynı; mevcut üç testi **değişmeden**
      geçiyor.

---

## Kapı çıktısı

```
pnpm --filter @wizards/web typecheck   ✔ (çıktı yok)
pnpm --filter @wizards/web lint        ✔ 10/10 config testi + eslint temiz
pnpm --filter @wizards/web test        ✔ 3911 pass · 0 fail · 1 skip (3912 test, 893 suite)
pnpm --filter @wizards/db  db:generate ✔ Generated Prisma Client (7.9.1)
```

Şema değişikliği gerekmedi; yeni migration yazılmadı.
