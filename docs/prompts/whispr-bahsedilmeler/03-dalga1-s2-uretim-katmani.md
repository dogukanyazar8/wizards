# Dalga 1 · Ş2 — Üretim katmanı: rol, `@herkes`, thread takibi, `kind`

**Ön koşul:** Dalga 0 kapısı yeşil. **Paralel:** Ş1, Ş3, Ş4.

Paketin en derin şeridi. Tasarımın dört türünden üçünün **yazma yolu** burada doğar. Bu şerit
hiçbir React bileşenine dokunmaz.

---

## Sahiplenilen dosyalar

- `apps/web/src/lib/workspace/mention-parser.ts` (yeni) + `.test.ts`
- `apps/web/src/lib/workspace/role-mention-service.ts` (yeni) + `.test.ts`
- `apps/web/src/lib/workspace/thread-follow-service.ts` (yeni) + `.test.ts`
- `apps/web/src/lib/workspace/message-notification-service.ts` (mevcut — `kind` yazımı,
  rol fan-out çağrısı, thread takipçi fan-out'u)
- `apps/web/src/lib/workspace/message-service.ts` (yalnız: rol izni kontrolü çağrısı ve
  `threadFollow` kaydı; `mentionEveryone` mantığına **dokunulmaz**)
- `apps/web/src/lib/dm/realtime-service.ts` (yalnız `dMMessageMention.createMany` çağrısına
  `kind` eklenmesi)
- `apps/web/src/lib/outbox/service.ts` (yalnız yeni iş tipleri + dispatch dalları)
- `apps/web/src/app/api/v1/channels/[channelId]/messages/[messageId]/thread-follow/route.ts` (yeni)
- `apps/web/src/scripts/backfill-mention-kind.ts` (yeni, tek seferlik, idempotent)
- `apps/web/src/components/chat/message-input.tsx` — **yalnız** rol otomatik tamamlama listesi
  (mevcut kullanıcı önerisi mantığına ek dal; başka satır değişmez)

**Okunur, yazılmaz:** `permission-service.ts`, `permissions.ts`, `notifications/service.ts`.

---

## İş

### 1. Rol bahsetmesi (K1)

1. **Ayrıştırıcı** — `mention-parser.ts`:
   ```ts
   parseMentionTokens(content): { usernames: string[]; roleNames: string[]; mass: boolean }
   ```
   - Kullanıcı adı deseni mevcut `extractMentionUsernames` ile **aynı** kalır; o fonksiyon
     yeni modülden yeniden ihraç edilir, davranışı değişmez (tuzak #3).
   - Rol deseni ayrı: `@` + 1–32 karakter, Türkçe harfler ve boşluksuz (`\p{L}\p{N}_-`).
     Aynı token hem kullanıcı hem rol olabilir; çözüm **veri** ile yapılır, regex ile değil:
     önce `User.username` eşlemesi denenir, eşleşmeyen token `Role.name`
     (case-insensitive, sunucu kapsamında) ile denenir. İki tarafta da eşleşen token
     **kullanıcı** sayılır (kullanıcı adı benzersiz, rol adı değil).
   - `everyone` / `here` her iki listeden de dışlanır.
2. **İzin** — `role-mention-service.ts`:
   - Rol yalnız `Role.mentionable = true` ise bahsedilebilir.
   - `mentionable = false` bir rolü bahsetmek için `PermissionBits.MENTION_EVERYONE` gerekir
     (Discord'un kuralı; kanal düzeyinde `requireChannelPermissionForUser` ile ölçülür).
   - İzin yoksa **hata atılmaz** — mesaj gönderilir, o rol bahsetme üretmez. `assertCanMentionEveryone`
     davranışı (403) `@everyone` için olduğu gibi kalır.
3. **Fan-out** — outbox işi `ROLE_MENTION_NOTIFICATIONS`:
   - Alıcı kümesi: rolün üyeleri ∩ kanalı görebilenler (`filterUserIdsByChannelPermission`,
     `VIEW_CHANNEL`) − gönderen − kanal/sunucu sessize alanlar − `suppressRoleMentions`
     (yeni adıyla `mentionRole` kapalı) olanlar.
   - Her alıcı için `MessageMention { kind: ROLE, roleId }` satırı + `Notification`
     (`dedupeKey = channel-mention:<messageId>:<userId>`, mevcut önek **korunur** —
     `mentions-service` okuma tarafı bu anahtarı kullanıyor).
   - Bir kullanıcı hem `@kullanıcı` hem `@rol` ile bahsedilmişse **tek** satır kalır ve
     `kind = SELF` kazanır (`@@unique([messageId,userId])` zaten ikinciyi düşürür; sıralama
     bilinçli: önce SELF yazılır, sonra ROLE `skipDuplicates` ile).
   - Üye sayısı üst sınırı: tek rolde 2.000 alıcıdan fazlası varsa iş sayfalara bölünür
     (500'lük partiler), tek bir `createMany` ile 2.000 satır yazılmaz.
4. **Otomatik tamamlama** — `message-input.tsx`: `@` yazıldığında mevcut üye önerisinin altına
   **bahsedilebilir roller** bölümü eklenir (`Role.mentionable = true` + izin varsa hepsi).
   Rol satırı rol rengiyle işaretlenir. Mevcut üye önerisi mantığı değişmez.

### 2. `@herkes` / `@burada` (K2)

**Yeni tablo yazılmaz.** `Message.mentionEveryone` zaten gönderimde ve düzenlemede yazılıyor.
Bu şeridin işi:

1. `message-service.ts`'te bu bayrağın yazımına **dokunma** — doğrulama testi ekle
   (gönderim ve düzenleme yollarının ikisi de bayrağı doğru yazıyor).
2. Bildirim: `EVERYONE_MENTION_NOTIFICATIONS` outbox işi. Alıcı kümesi kanalı görebilen üyeler
   − gönderen − sessize alanlar − `mentionEveryone` anahtarı kapalı olanlar.
   **`MessageMention` satırı yazılmaz**; yalnız `Notification`
   (`dedupeKey = channel-everyone:<messageId>:<userId>`) yazılır. Akış kartını Ş3
   `Message.mentionEveryone` bayrağından türetir; okundu durumu `MentionState`
   (`source = EVERYONE`, `refId = messageId`) veya bildirim satırından gelir.
3. `@everyone` ile `@here` ayrımı tutulmaz (tek bayrak). Tasarımdaki pil metni `@herkes`.
   Bu bilinçli bir sapmadır; rapora yazılır.

### 3. Thread takibi (K3)

1. `thread-follow-service.ts`:
   ```ts
   ensureImplicitFollow(userId, parentMessageId, channelId, origin)  // AUTHOR | REPLY | MENTION
   setExplicitFollow(userId, parentMessageId, following: boolean)    // EXPLICIT
   listFollowers(parentMessageId): string[]                          // mutedAt IS NULL
   ```
   - Örtük kayıt `mutedAt` doluysa **yeniden açılmaz** (kullanıcı bilerek kapattı).
   - `ensureImplicitFollow` idempotent (`upsert` on `@@unique([userId,parentMessageId])`).
2. Tetikleyiciler (`message-service.ts`, thread yanıtı yolu):
   - Thread'in üst mesajını yazan → `AUTHOR`
   - Thread'e yanıt yazan → `REPLY`
   - Thread içinde bahsedilen → `MENTION`
3. Bildirim: mevcut `createChannelThreadReplyNotification` **genişletilir** —
   alıcı artık yalnız üst mesajın yazarı değil, `listFollowers` sonucudur (gönderen hariç,
   `mentionThreadReplies` anahtarı kapalı olanlar hariç).
   Her alıcı için `MessageMention { kind: THREAD }` **yazılmaz**; bunun yerine
   `Notification` (`dedupeKey = channel-thread-reply:<messageId>:<userId>`, mevcut anahtar) ve
   `MentionState` (`source = THREAD`, `refId = messageId`) kullanılır — Ş3 akışı bu
   bildirimlerden türetir.
   Bildirim tipi bugün `SYSTEM`; **`MENTION` olarak değiştirilmez** (mobil yönlendirme
   `SYSTEM` metadata'sına bakıyor). Ayrım `metadata.parentMessageId` ile yapılır.
4. Uç: `PUT/DELETE .../messages/[messageId]/thread-follow` → `setExplicitFollow`.
   Mobil `Takip` düğmesi (`message-thread-screen.tsx`) bu uca bağlanır — mobil ekranın
   yalnız bu tek düğmesi değişir (K8).

### 4. `kind` yazımı ve geri doldurma

- `createChannelMentionNotifications` → `kind: SELF`.
- `role-mention-service` → `kind: ROLE, roleId`.
- `dm/realtime-service.ts` → `kind: SELF`.
- `backfill-mention-kind.ts`: mevcut satırların hepsi zaten `SELF` varsayılanıyla doğru;
  betik yalnız **doğrular** ve sayı raporlar (yıkıcı iş yok). `--dry-run` varsayılan.

### 5. Mobil asgari uyum (K8)

- `push-sender` ve `mobile/bootstrap` yeni bildirim türlerini (rol, @herkes, thread) doğru
  sayaçlara düşürür; mobil bahsetme rozeti Ş3'ün tek kaynağıyla aynı sayıyı okur.
- Mobil ekran yeniden tasarlanmaz.

---

## Kabul

- [ ] `@tasarım` yazan mesaj rol üyelerine bahsetme satırı + bildirim üretiyor; `mentionable`
      olmayan rol için izinsiz kullanıcıda **hiç** satır üretmiyor ve mesaj yine de gidiyor.
- [ ] Hem `@kullanıcı` hem `@rol` ile bahsedilen üyede tek satır ve `kind = SELF`.
- [ ] `@everyone` bildirimi üretiliyor, `MessageMention` satırı üretmiyor.
- [ ] Thread yanıtı bugün bildirimi alan üst mesaj yazarını **kaybetmiyor**; ek olarak
      yanıtlayanlar ve içinde bahsedilenler alıyor; `mutedAt` dolu takipçi almıyor.
- [ ] `mentionThreadReplies` varsayılanı **kapalı** (K6) olduğu için hiçbir kullanıcı bu
      şeridin ardından beklenmedik bildirim yağmuru almıyor — test bunu kanıtlıyor.
- [ ] 2.000 üyeli rol fan-out'u partili; tek `createMany` ile yazılmıyor.
- [ ] Fan-out senkron değil, outbox işine kuyruklanıyor (tuzak #9); mesaj gönderme gecikmesi
      ölçülebilir biçimde artmıyor.
- [ ] `extractMentionUsernames` davranışı bit-birebir aynı (mevcut testleri değişmeden geçiyor).

## Kapı

```
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web lint
pnpm --filter @wizards/web test
pnpm --filter @wizards/db db:generate
```
