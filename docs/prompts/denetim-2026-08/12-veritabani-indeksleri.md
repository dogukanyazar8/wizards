# 12 — Veritabanı: eksik indeksler, gereksiz indeksler, cascade

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok. **Migration yazılır, koşturulmaz.**

**Ön koşul:** 08–11 landed olması iyi olur (sorgu şekilleri sabitlensin). Zorunlu değil.

## Sorun

Sekiz sıcak sorgu şeklinin indeksi yok; dokuz indeks unique kısıtın birebir kopyası; bir cascade kuralı davet bağlantılarını yok ediyor; iki migration dizini Prisma'nın hiç okumadığı yerde duruyor.

## Kural

Tek migration, `packages/db/prisma/rebaseline-migrations/<zaman>_denetim_indeksleri/migration.sql`. Prisma **yalnız** bu dizini okur.

Her indeks için commit mesajı değil, **şemada yorum** bırak: hangi sorgu bunu istiyor. Bir sonraki denetimde "bu neden var" sorusu sorulmasın.

## Kapsam — eklenecek indeksler

Her satırda: model, indeks, onu isteyen sorgu.

| Model               | Eklenecek                                                      | İsteyen sorgu                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppSession`        | `@@index([userId, lastSeenAt])`                                | `apps/web/src/lib/friends/last-seen.ts:18` — kullanıcı başına `_max: { lastSeenAt }`. Mevcut `[userId, startedAt]` max'ı çözemiyor, her satır heap'ten çekiliyor.                               |
| `AppSession`        | `@@index([startedAt])`                                         | `apps/web/src/lib/admin/snapshots/activity.ts:72`, `:77`, `:84`, `:91`, `:98` ve `health.ts:84`, `:89` — çıplak `startedAt` aralığı. Mevcut indekslerin hiçbiri bu kolonla başlamıyor.          |
| `ChannelReadState`  | `@@index([channelId, lastReadAt])`                             | `apps/web/src/lib/outbox/service.ts:470` — kanal bahsi teslimatında `{ channelId, lastReadAt: { gte } }`. Mevcut `[userId, channelId, lastReadAt]` `userId` kısıtlanmadığı için kullanılamıyor. |
| `FriendRequest`     | `@@index([senderId, status])`, `@@index([receiverId, status])` | `apps/web/src/lib/friends/queries.ts:81` ve `service.ts:369`, `:422` — `status: "ACCEPTED"` + iki yönlü OR. `status` hiçbir indekste yok.                                                       |
| `ClientHealthEvent` | `@@index([createdAt])`                                         | `apps/web/src/lib/telemetry/client-health-rollup.ts:110`, `:151` — çıplak `createdAt < cutoff`, saatte iki tam tarama.                                                                          |
| `Notification`      | `@@index([userId, read, createdAt])`                           | `apps/web/src/lib/notifications/service.ts:133` — okunmamış filtresi + `createdAt` sıralaması; mevcut iki indeksten hiçbiri ikisini birden karşılamıyor.                                        |
| `Attachment`        | `@@index([userId])`                                            | `apps/web/src/lib/account/privacy-service.ts:211`, `:496` — Postgres FK kolonlarını otomatik indekslemez; veri dışa aktarma ve hesap silme tam tarıyor, silme işlem içinde kilit tutarak.       |
| `Session`           | `@@index([expiresAt])`                                         | 01 no'lu promptta eklenen süresi geçmiş oturum süpürmesi. Kardeş token tabloları bu indeksi taşıyor.                                                                                            |

### Trigram indeksleri (ayrı, ölçülmeli)

`User` arama (`apps/web/src/lib/friends/service.ts:670`) ve `DMMessage` içerik araması (`apps/web/src/lib/messages/search-service.ts:426`) `ILIKE '%…%'` kullanıyor; B-tree çözemez. Repo `pg_trgm`'i `Message.content` için zaten kurmuş (`20260810180000_message_content_trgm_index`).

Yap:

- `DMMessage.content` için aynı koşullu `CREATE INDEX … USING GIN (… gin_trgm_ops)` — mevcut migration'ın birebir eşi, kopyala.
- `User` için `lower(username)` ve `lower(displayName)` üzerinde GIN trigram. Sorgu `mode: "insensitive"` kullandığından ifade indeksinin sorguyla eşleştiğini **doğrula** — eşleşmiyorsa sorguyu `lower()` ile hizala veya indeksi sorguya uydur. Eşleşmeyen ifade indeksi ölü ağırlıktır.

## Kapsam — kaldırılacak indeksler

Dokuzu da unique kısıtın birebir kopyası veya öneki. Unique zaten B-tree'dir; kopyası yalnız yazma maliyeti ve vacuum yükü.

| Model          | Kaldırılacak              | Zaten karşılayan                       |
| -------------- | ------------------------- | -------------------------------------- |
| `User`         | `@@index([email])`        | `email @unique`                        |
| `User`         | `@@index([username])`     | `username @unique`                     |
| `Session`      | `@@index([token])`        | `token @unique`                        |
| `Session`      | `@@index([refreshToken])` | `refreshToken @unique`                 |
| `Server`       | `@@index([inviteCode])`   | `inviteCode @unique`                   |
| `ServerInvite` | `@@index([code])`         | `code @unique`                         |
| `Reaction`     | `@@index([messageId])`    | `@@unique([messageId, userId, emoji])` |
| `DMReaction`   | `@@index([messageId])`    | `@@unique([messageId, userId, emoji])` |
| `Role`         | `@@index([name])`         | `name @unique`                         |

`Session` ve `Reaction`/`DMReaction` en sık yazılan tablolar — kazanç oradan geliyor.

Şema yazarı aynı gerekçeyi `GroupInvite` üzerinde kendisi yazmış (`schema.prisma:1558`); o yorumu referans ver.

## Kapsam — cascade ve dizin

### Davet, kanal silinince yok oluyor

`packages/db/prisma/schema.prisma:1124` · `apps/web/src/lib/workspace/invite-service.ts:106`

`ServerInvite.channel` `onDelete: Cascade`, oysa davetin zorunlu hedefi `serverId` ve çağıran kanal vermezse otomatik fallback atanıyor — pratikte her davet bir `channelId` taşıyor. Bayat bir karşılama kanalını silen admin paylaşılmış ve kalıcı davet bağlantılarının hepsini sessizce yok ediyor.

Yap: `onDelete: SetNull`. Davet sunucuya çözülmeye devam etsin, iniş kanalı yoksa sunucunun varsayılanına düşsün.

### Kaybelen mesaj FK'si

`packages/db/prisma/schema.prisma:1513`

08 no'lu prompt kod tarafını (silmeden önce NULL'lama) kapattı. Şema tarafında `DMMessage.reply` `onDelete: SetNull` yapılırsa kod tarafındaki adım gereksizleşir — **ikisini birden yapma.** 08 landed ise burada dokunma, yalnız şemaya "kod tarafında NULL'lanıyor" yorumu düş.

### Prisma'nın okumadığı migration dizinleri

`packages/db/prisma.config.ts:7` · `packages/db/prisma/migrations/` (37 klasör) · `packages/db/prisma/migrations_backup_20260427_151913/`

Şu an zararsız — hepsi rebaseline'dan eski. Risk ileriye dönük: alışkanlıkla oraya yazılan bir migration sessizce hiç koşmaz ve `prisma migrate status` temiz gösterir.

Yap: iki dizini Prisma'nın ve insanın karıştıramayacağı bir ada taşı (`_archive-pre-rebaseline/`) veya sil. **Silme kararını kullanıcıya sor** — geçmiş migration'lar arşiv değeri taşıyor olabilir.

## Yapılmayacak

- Sorgu yeniden yazma — bu prompt yalnız şema. Sorgu değişiklikleri 13/14'te.
- Yeni model, yeni kolon.
- Veri taşıma (backfill).
- `prisma migrate` koşturmak.
- Partition, materialized view, okuma replikası.

## Kabul kriterleri

1. Tek migration dosyası, doğru dizinde, `IF NOT EXISTS` ile güvenli.
2. Şemadaki her yeni indeksin yanında onu isteyen sorguyu adlandıran bir yorum var.
3. Dokuz gereksiz indeks düşüyor.
4. `ServerInvite.channel` `SetNull`.
5. Sözleşme testi: şemadaki indeks kümesi beklenen listeyle eşleşiyor.

## Testler

- `packages/db` veya `apps/web` altında bir şema sözleşme testi: `schema.prisma` metnini okuyup bu promptun listesindeki indekslerin varlığını/yokluğunu iddia et. Denetimin `20260725000000_uat_schema_baseline` ile karşılaştırma yapan mevcut testleri varsa aynı deseni kullan.
- Cascade testi yazılamıyorsa (DB gerekiyor) yerine şema metni üzerinde `onDelete: SetNull` iddiası yeterli.

## Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```

Migration'ın uygulanması ayrı iş: UAT deployment'ı sırasında koşacak. Bu prompt **koşturmaz**.
