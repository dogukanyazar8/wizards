# Faz 1 — Veri katmanı ve yetki omurgası

**Ön koşul:** yok. **Sonraki faz:** 02.
**Önce oku:** `00-ortak-baglam.md`.

```bash
graphify query "DM conversation participant group service permissions"
```

---

## A. Neden bu faz var

2a–2f'nin istediği on üç veri parçasının hiçbiri bugün yok (§3.1). Bunlar ekran yazılırken keşfedilirse her ekran fazı üç tura çıkar. Bu faz **tek bir migration**, **tek bir guard modülü** ve **tek bir DTO genişletmesi** ile tüm grup yönetimi verisini kapatır.

Bu fazda **hiçbir mobil ekran dosyası değişmez.** Mobil tarafta değişen tek şey `packages/types` üzerinden gelen tiplerdir.

Bu faz kapsamına **girmeyen** üç şey Faz 2'ye aittir: davet bağlantısı, kaybolan mesajlar, grup çağrısı.

---

## B. Görevler

### B1 — Migration: `group_dm_v2`

Dizin **`packages/db/prisma/rebaseline-migrations/<UTCzaman>_group_dm_v2/migration.sql`** (§4.1 tuzağı — `migrations/` dizini ölüdür).

**Yeni enum'lar:**

```prisma
enum DMParticipantRole {
  OWNER
  ADMIN
  MEMBER
}

enum DMNotifyLevel {
  ALL
  MENTIONS
  NONE
}

enum GroupPermissionLevel {
  ALL
  ADMINS
}

enum GroupHistoryVisibility {
  NONE
  LAST_24H
  LAST_30D
  ALL
}
```

**`DMConversation` eklenen alanlar:**

| Alan                | Tip                        | Varsayılan | Kaynak                         |
| ------------------- | -------------------------- | ---------- | ------------------------------ |
| `description`       | `String? @db.VarChar(120)` | —          | 2c §5                          |
| `avatarColor`       | `String? @db.VarChar(7)`   | —          | 2c §2 (5 renk)                 |
| `pinnedMessageId`   | `String?`                  | —          | 2d §2 / 2e §4                  |
| `pinnedById`        | `String?`                  | —          | denetim izi                    |
| `pinnedAt`          | `DateTime?`                | —          | denetim izi                    |
| `permSendMessage`   | `GroupPermissionLevel`     | `ALL`      | 2f §3                          |
| `permAddMembers`    | `GroupPermissionLevel`     | `ALL`      | 2f §3 / 2c §7                  |
| `permEditInfo`      | `GroupPermissionLevel`     | `ADMINS`   | 2f §3                          |
| `permPinMessage`    | `GroupPermissionLevel`     | `ADMINS`   | 2f §3                          |
| `historyVisibility` | `GroupHistoryVisibility`   | `LAST_30D` | 2c §7 (tasarımda seçili değer) |

`pinnedMessageId` **gerçek foreign key** olur:

```prisma
pinnedMessage DMMessage? @relation("DMConversationPinnedMessage", fields: [pinnedMessageId], references: [id], onDelete: SetNull)
```

ve `DMMessage` tarafına karşı ilişki eklenir:

```prisma
pinnedInConversations DMConversation[] @relation("DMConversationPinnedMessage")
```

Sebep: mesaj silinince sabitleme kendiliğinden düşer. Uygulama katmanında temizlik yazmak yerine veritabanına bırakılır.

**`DMParticipant` eklenen alanlar:**

| Alan                     | Tip                     | Varsayılan | Kaynak                                         |
| ------------------------ | ----------------------- | ---------- | ---------------------------------------------- |
| `role`                   | `DMParticipantRole`     | `MEMBER`   | 2e §6 rol çipi                                 |
| `notifyLevel`            | `DMNotifyLevel`         | `ALL`      | 2f §2                                          |
| `nameColor`              | `String @db.VarChar(7)` | —          | §11.0/1 (backfill ile dolu gelir)              |
| `pinnedAt`               | `DateTime?`             | —          | 2a SABİTLENEN (V3)                             |
| `historyFromAt`          | `DateTime?`             | —          | 2c §7 zorlaması                                |
| `pinnedStripDismissedId` | `String?`               | —          | 2d §2 "kapatma yalnız o kullanıcı için gizler" |

**Yeni indeksler:**

```prisma
@@index([userId, pinnedAt])          // DMParticipant — 2a sabitlenen bölümü
@@index([conversationId, role])      // DMParticipant — yönetici sayımı
@@index([pinnedMessageId])           // DMConversation
```

**Backfill SQL (migration içinde, aynı dosyada):**

1. `role`: konuşmanın `ownerId`'sine eşit katılımcı → `OWNER`, kalan → `MEMBER`.
2. `notifyLevel`: `muted = true` → `NONE`, değilse `ALL`.
3. `nameColor`: konuşma başına `joinedAt, userId` sırasına göre pencere fonksiyonuyla beş renk döngüsel dağıtılır:

```sql
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "conversationId" ORDER BY "joinedAt", "userId") - 1 AS idx
  FROM "DMParticipant"
)
UPDATE "DMParticipant" p
SET "nameColor" = (ARRAY['#C2185B','#C77A2B','#1B8A55','#8A46C7','#4F46E5'])[(ranked.idx % 5) + 1]
FROM ranked WHERE ranked.id = p.id;
```

Kolon önce `NULL` kabul ederek eklenir, backfill koşar, sonra `SET NOT NULL` yapılır. Üç adım tek migration dosyasında.

4. `historyFromAt`: `NULL` bırakılır — mevcut üyeler tüm geçmişi görmeye devam eder.

**Yapılmayacak:** `muted` kolonu **silinmez** (§4.2).

### B2 — Tip katmanı: `packages/types/src/group-dm-settings.ts`

Yeni dosya. Web ve mobilin **aynı** kuralı çağırması için saf.

```ts
export const GROUP_MEMBER_NAME_COLORS = [
  "#C2185B",
  "#C77A2B",
  "#1B8A55",
  "#8A46C7",
  "#4F46E5",
] as const;
export const GROUP_AVATAR_COLORS = ["#4F46E5", "#1B8A55", "#C77A2B", "#C2185B", "#1E2235"] as const;
export const GROUP_DM_DESCRIPTION_MAX_LENGTH = 120;
```

Zod şemaları: `DMNotifyLevelSchema`, `GroupPermissionLevelSchema`, `GroupHistoryVisibilitySchema`, `GroupAvatarColorSchema` (yalnız beş değer), `GroupDMSettingsUpdateRequestSchema` (kısmi güncelleme: `description`, `avatarColor`, dört izin, `historyVisibility`), `GroupMemberRoleUpdateRequestSchema` (`role: "ADMIN" | "MEMBER"` + ayrı `transferOwnership: boolean`), `ConversationNotifyRequestSchema`, `ConversationPinRequestSchema`.

Saf fonksiyonlar (**her biri testli**):

| Fonksiyon                                                | Sözleşme                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pickNextMemberNameColor(usedColors: readonly string[])` | Konuşmada **en az kullanılan** rengi verir; eşitlikte palet sırası kazanır (V2)                   |
| `canMemberDo(role, level)`                               | `level === "ALL"` → herkes; `"ADMINS"` → yalnız `OWNER`/`ADMIN`                                   |
| `resolveHistoryFloor(visibility, joinedAt)`              | `NONE` → `joinedAt`; `LAST_24H` → `joinedAt - 24s`; `LAST_30D` → `joinedAt - 30g`; `ALL` → `null` |
| `isGroupNameWithinLimit(name)`                           | V1 sınırı                                                                                         |

**V1 uygulaması:** `packages/types/src/group-dm.ts` içinde `GROUP_DM_NAME_MAX_LENGTH` `100 → 32`. Mevcut daha uzun adlar okunmaya devam eder (yalnız yazma şeması kısıtlar). Web `group-create-dialog.tsx` sayacı bu sabitten okuyorsa kendiliğinden düzelir; okumuyorsa düzeltilir.

### B3 — DTO genişletmesi

`DMConversationDTOSchema` (`packages/types/src/socket.ts`) grup alanlarını taşır. **Hepsi opsiyonel/nullable** — 1:1 DM'ler aynı şemayı kullanıyor ve eski istemciler kırılmamalı:

```
role, notifyLevel, pinnedAt, description, avatarColor,
permissions: { sendMessage, addMembers, editInfo, pinMessage },
historyVisibility,
pinnedMessage: { id, authorName, excerpt, dismissed } | null,
memberCount, onlineCount,
members: { userId, role, nameColor, presence, lastSeenAt, joinedAt }[]  // yalnız grup detay okumasında
```

`members` **liste okumasında gönderilmez** — 2a satırı yalnız `memberCount` + ilk iki avatar ister. Liste yanıtı için ayrı, dar bir alan: `avatarPair: { userId, avatarUrl, initials, accent }[]` (en fazla 2) + `overflowCount`.

Sebep: sohbet listesi 32 üyeli 20 konuşma çekerse üye dizisi yanıtı on kata çıkarır.

### B4 — Yetki modülü: `apps/web/src/lib/dm/group-permissions.ts`

Yeni dosya. **Tek yetki kapısı.**

```ts
export type GroupAction = "sendMessage" | "addMembers" | "editInfo" | "pinMessage";

export async function loadGroupAuthContext(conversationId, userId): Promise<GroupAuthContext>;
export function assertGroupPermission(ctx: GroupAuthContext, action: GroupAction): void;
export function assertGroupAdmin(ctx: GroupAuthContext): void;
export function assertGroupOwner(ctx: GroupAuthContext): void;
```

- `loadGroupAuthContext` **tek sorgu** atar: konuşma + çağıranın katılımcı satırı (`include`/`select` ile). İki ayrı `findUnique` yazılmaz.
- 1:1 DM'de (`type === "DM"`) `assertGroupPermission` **daima geçer** — izinler gruba özgüdür.
- Hata: `ApiError(..., 403, "FORBIDDEN")`, mevcut desen.

**Bağlanacak dört yazma yolu** (K4 — hepsi zorunlu):

| Yol                                                            | Eylem         |
| -------------------------------------------------------------- | ------------- |
| `apps/web/src/lib/dm/message-send-service.ts`                  | `sendMessage` |
| `group-service.ts` → `addGroupMembers`                         | `addMembers`  |
| `group-service.ts` → `updateGroupConversation` + yeni ayar ucu | `editInfo`    |
| Yeni sabitleme ucu                                             | `pinMessage`  |

**§4.12 kritik:** mesaj gönderimi HTTP ucundan **ve** socket handler'ından geçiyorsa guard **servise** konur, uca değil. Socket yolunun guard'ı atlamadığı bir testle kanıtlanır.

### B5 — Servis genişletmeleri (`group-service.ts`)

| Fonksiyon                      | Değişiklik                                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createGroupConversation`      | Kurucuya `role: OWNER`, diğerlerine `MEMBER`; her katılımcıya `nameColor` (`pickNextMemberNameColor`); `avatarColor`, `description`, `historyVisibility` kabul eder                   |
| `addGroupMembers`              | `assertGroupPermission(…, "addMembers")`; yeni satıra `nameColor` + `historyFromAt = resolveHistoryFloor(...)`                                                                        |
| `updateGroupConversation`      | `requireGroupOwner` → `assertGroupPermission(…, "editInfo")`; `description`/`avatarColor` alanlarını da yazar                                                                         |
| `removeGroupMember`            | Yalnız `OWNER`/`ADMIN`; bir `ADMIN` başka `ADMIN`'i çıkaramaz, `OWNER` çıkaramaz                                                                                                      |
| `leaveGroupConversation`       | Son yönetici ayrılıyorsa **önce devir** istenir (V8): açık `transferOwnershipTo` gelmezse `409 OWNER_TRANSFER_REQUIRED` döner                                                         |
| **yeni** `updateGroupSettings` | Dört izin + `historyVisibility` + `description` + `avatarColor`; `editInfo` izni ister; her değişiklik için sistem mesajı **yazmaz** (yalnız ad/ikon yazar — mevcut davranış korunur) |
| **yeni** `updateMemberRole`    | `ADMIN` ver/al: yalnız `OWNER`. Sahiplik devri: eski sahip `ADMIN`'e düşer, yeni sahip `OWNER` olur, `DMConversation.ownerId` aynı transaction'da yazılır                             |
| **yeni** `setPinnedMessage`    | `pinMessage` izni; mesaj bu konuşmaya ait mi doğrulanır; `pinnedById`/`pinnedAt` yazılır; tüm katılımcıların `pinnedStripDismissedId`'si sıfırlanır                                   |
| **yeni** `setConversationPin`  | `DMParticipant.pinnedAt` (V3) — izin gerekmez, kişiye özel                                                                                                                            |
| **yeni** `setNotifyLevel`      | `notifyLevel` **ve** `muted` aynı `update` çağrısında yazılır (§4.2 değişmezi)                                                                                                        |

`resolveNextGroupOwner` korunur; artık `ADMIN` rolündekiler öncelikli aday olur, yoksa en eski `MEMBER`.

### B6 — Geçmiş penceresi zorlaması

Mesaj listeleme sorgusuna katılımcının `historyFromAt` değeri **where** olarak girer:

```ts
where: {
  conversationId,
  ...(participant.historyFromAt ? { createdAt: { gte: participant.historyFromAt } } : {}),
}
```

Dokunulacak yerler: `apps/web/src/lib/dm/service.ts` mesaj okuma, `/dm/[conversationId]/messages/route.ts`, mobil aynası, arama ucu (`messages/search`), thread okuma. **Beşinin hepsi** — biri unutulursa pencere kaçak verir. Mevcut `@@index([conversationId, createdAt])` bu filtreyi karşılar, yeni indeks gerekmez.

### B7 — Okundu bilgisi

`group-presentation.ts` içine:

```ts
export function buildGroupReadReceipt(input: {
  authorId: string;
  createdAt: Date;
  participants: readonly { userId: string; lastReadAt: Date | null }[];
}): { readerIds: string[]; count: number; everyone: boolean };
```

- Yazar hariç, `lastReadAt >= createdAt` olan katılımcılar.
- `everyone` → tasarımda "Herkes okudu".
- **Yalnız giden grubun son mesajı için çağrılır** (§4.5). DTO'da alan adı `readReceipt`, yalnız o mesajda dolu.

### B8 — Uçlar (web + mobil ayna, **aynı fazda**)

| Metot + yol                                                 | İş                                     |
| ----------------------------------------------------------- | -------------------------------------- |
| `PATCH /api/v1/dm/groups/[conversationId]/settings`         | izinler, geçmiş, açıklama, renk        |
| `PATCH /api/v1/dm/groups/[conversationId]/members/[userId]` | rol değiştir / sahipliği devret        |
| `PUT /api/v1/dm/groups/[conversationId]/pin`                | mesaj sabitle                          |
| `DELETE /api/v1/dm/groups/[conversationId]/pin`             | sabitlemeyi kaldır                     |
| `POST /api/v1/dm/groups/[conversationId]/pin/dismiss`       | şeridi yalnız bana gizle               |
| `PATCH /api/v1/dm/[conversationId]/notify`                  | bildirim kademesi                      |
| `PATCH /api/v1/dm/[conversationId]/pin`                     | sohbeti sabitle/kaldır (V3)            |
| `DELETE /api/v1/dm/groups/[conversationId]` (mevcut)        | gövdeye `transferOwnershipTo?` eklenir |

Her uç için: Zod ile gövde doğrulama, `loadGroupAuthContext`, guard, servis çağrısı, realtime yayını (`group-realtime.ts` üzerinden), `route-logic.ts` + `route-logic.test.ts` (bu depoda web testinde DB yok — bağımlılık enjeksiyonu **zorunlu**).

Mevcut `mute` ucu **silinmez**; `notifyLevel` yazan yeni ucun ince sarmalayıcısına döner (`muted → NONE | ALL`).

### B9 — Realtime

`group-realtime.ts` yeni olayları yayar; olay adları mevcut `dm:*` ailesine uyar:

```
dm:group:settings   { conversationId, permissions, historyVisibility, description, avatarColor }
dm:group:role       { conversationId, userId, role, ownerId }
dm:group:pin        { conversationId, pinnedMessage | null }
dm:conversation:notify { conversationId, notifyLevel }   // yalnız o kullanıcıya
dm:conversation:pin    { conversationId, pinnedAt }      // yalnız o kullanıcıya
```

Kişiye özel iki olay `user:<id>` odasına, diğerleri konuşmanın tüm katılımcılarına.

### B10 — Web temeli (K5'in bu fazdaki payı)

Web **tam parite** alacak (K5), ama arayüz işi Faz 4/5'te. Bu fazda yalnız temel:

- `group-create-dialog.tsx` yeni ad sınırını (V1) sabitten okur.
- Web grup okumaları yeni DTO alanlarıyla derlenir; `role`, `permissions`, `notifyLevel` web tipinde görünür.
- Web'in kullandığı grup servis fonksiyonları **aynı** `group-permissions.ts` kapısından geçer — web için ikinci bir yetki yolu açılmaz.
- Bu fazda web'e **yeni ekran eklenmez**; eklenecek ekranların listesi rapora yazılır (Faz 5 girdisi).

---

## C. Bağlayıcı kararlar (sonraki fazları kısıtlar)

1. **Yetki tek kapıdan geçer:** `group-permissions.ts`. Faz 2 ve 5 kendi kontrolünü yazmaz, bu modülü çağırır.
2. **`notifyLevel` otorite, `muted` türev ayna** — ikisi hep aynı `update` çağrısında.
3. **Üye adı rengi veritabanında** (`nameColor`); mobil onu **türetmez**, okur.
4. **Liste DTO'su üye dizisi taşımaz** — `avatarPair` + `overflowCount` + `memberCount`.
5. **Okundu bilgisi yalnız son giden mesajda** hesaplanır.
6. **Geçmiş penceresi beş okuma yolunda** filtrelenir.
7. Grup adı üst sınırı **32** (V1).

---

## D. Yapılmayacaklar

- `muted` kolonunu silmek.
- `packages/db/prisma/migrations/` altına migration yazmak.
- İzinleri yalnız uçta kontrol etmek.
- Mesaj başına okundu sorgusu atmak.
- Mobil ekran dosyalarına dokunmak.
- Davet bağlantısı, kaybolan mesaj, çağrı — bunlar Faz 2.

---

## E. Kapı

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/mobile typecheck
```

Ek kontrol listesi:

- [ ] Migration `rebaseline-migrations/` altında ve `prisma migrate dev` temiz koştu.
- [ ] `nameColor` hiçbir satırda NULL değil; kolon `NOT NULL`.
- [ ] `notifyLevel` backfill'i `muted` ile tutarlı (rastgele 3 satır kontrolü).
- [ ] Dört yazma yolunun her biri için "izin yok → 403" testi var.
- [ ] Socket üzerinden mesaj gönderimi `sendMessage` izninde takılıyor (test).
- [ ] Beş okuma yolunda `historyFromAt` filtresi var (test).
- [ ] `buildGroupReadReceipt` yazarı saymıyor, `everyone` doğru (test).

---

## F. Rapor

`docs/prompts/grup-sohbetleri-2a-2f/raporlar/01-rapor.md` — §8 formatı.

Cihaz testi bu fazda **yok** (arayüz değişmedi). Onun yerine raporda migration'ın UAT'ye nasıl uygulanacağı bir cümleyle yazılır.
