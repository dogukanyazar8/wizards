# Grup Sohbeti (Group DM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kullanıcılar Mesajlar → Sohbetler ekranından çok kişilik grup sohbeti kurup yönetebilsin; mobil ve web/desktop'ta tam parite.

**Architecture:** Mevcut `DMConversation` modeli genişletilir (`type: GROUP_DM` zaten var). Mesaj/ek/tepki/thread/okundu/typing/bildirim hattı katılımcı-listesi güdümlü olduğu için değişmeden çalışır. Tek yeni servis modülü `apps/web/src/lib/dm/group-service.ts` hem web hem mobil rotalarını besler. Üyelik değişiklikleri sistem mesajıyla aynı transaction'da yazılır.

**Tech Stack:** TypeScript, Next.js App Router (apps/web), Prisma + PostgreSQL (packages/db), Zod (packages/types), Socket.IO (apps/web/src/lib/socket), React Native + Expo (apps/mobile), TanStack Query, `node:test` + tsx (web/types/mobile-node), Jest + RNTL (mobile bileşen testleri).

**Spec:** `docs/superpowers/specs/2026-08-07-grup-sohbeti-design.md`

---

## Global Constraints

Her görevin gereksinimleri bu bölümü örtük olarak içerir.

- **Sabitler:** `GROUP_DM_MAX_PARTICIPANTS = 32`, `GROUP_DM_MIN_PARTICIPANTS = 3`, `GROUP_DM_NAME_MAX_LENGTH = 100`.
- **Üye uygunluğu:** yalnızca ekleyen kişinin **arkadaşları**. Ortak sunucu üyeliği yeterli değil. Engellenmiş kullanıcı eklenemez.
- **Yetki:** ad/foto düzenleme, üye ekleme, üye çıkarma yalnızca `DMConversation.ownerId`. Her üye kendini çıkarabilir (ayrılma).
- **Grup adı opsiyonel.** Boş/yalnızca boşluk → `null` olarak saklanır; başlık mevcut fallback ile üye adlarından türer.
- **Sistem mesajı:** `content` her zaman `""`. Sunucu asla kullanıcıya gösterilecek metin üretmez — locale kullanıcı başına değişir, metni istemci kurar. `unreadCount` artırmaz, push atmaz, `lastMessageAt` günceller.
- **Migration konumu:** `packages/db/prisma/rebaseline-migrations/`. `packages/db/prisma/migrations/` altına yazılan dosya **sessizce hiç çalışmaz**.
- **DI zorunlu:** `apps/web` test ortamında DB yok. Servis çağıran her route-logic dosyası bağımlılıklarını varsayılan nesne + override parametresi ile almalı (mevcut `apps/web/src/app/api/v1/mobile/dm/route-logic.ts` deseni).
- **Komutlar pnpm üzerinden:** `typecheck`/`lint` `npm run` ile çalıştırılırsa launcher sürüm kontrolü derleme başlamadan patlar.
- **`@wizards/types`'a dokunan her görev `@wizards/mobile`'ı da doğrulamak zorunda.** `apps/mobile` types paketine `workspace:*` ile bağlı ve `DMConversationDTO`/`DMConversationDTOSchema`'yı doğrudan import ediyor; paylaşılan bir şemaya zorunlu alan eklemek mobil test fixture'larını hem tipte hem çalışma zamanında (ZodError) kırar. Doğrulama seti her zaman: `pnpm --filter @wizards/types test`, `pnpm --filter @wizards/web test`, `pnpm --filter @wizards/mobile test`, `pnpm --filter @wizards/mobile test:components`, ve üç paketin `typecheck`'i.
- **RNTL 14 async:** `render()` ve `fireEvent.*` promise döner — ikisi de `await` edilmeli. `await` unutulursa aynı dosyadaki _sonraki_ testler bozuk ağaç render eder.
- **Satır sonları CRLF.** Mevcut dosyaları düzenlerken satır sonu karıştırılmamalı.
- **COMMIT YOK.** Kullanıcı sözleşmesi: hiçbir görev commit atmaz. Aşağıdaki her `git commit` adımı **atlanır**; tüm değişiklikler çalışma ağacında birikir. `git add` da çalıştırılmaz. Baz commit: `4b1fad7c`.

---

## File Structure

### Yeni dosyalar

| Dosya                                                                            | Sorumluluk                                                                 |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/db/prisma/rebaseline-migrations/20260807120000_group_dm/migration.sql` | `DMSystemMessageType` enum + `DMMessage` sistem alanları                   |
| `packages/types/src/group-dm.ts`                                                 | Grup sabitleri + istek/yanıt Zod şemaları (web ve mobil paylaşır)          |
| `packages/types/src/group-dm.test.ts`                                            | Şema testleri                                                              |
| `apps/web/src/lib/dm/group-service.ts`                                           | Grup iş mantığının tamamı (5 fonksiyon)                                    |
| `apps/web/src/lib/dm/group-service.test.ts`                                      | Servis birim testleri (DI, DB'siz)                                         |
| `apps/web/src/lib/dm/group-realtime.ts`                                          | Grup olaylarının soket yayını + oda temizliği                              |
| `apps/web/src/lib/dm/group-realtime.test.ts`                                     | Yayın + `socketsLeave` testleri                                            |
| `apps/web/src/app/api/v1/dm/groups/route-logic.ts`                               | Web POST `/groups`                                                         |
| `apps/web/src/app/api/v1/dm/groups/route.ts`                                     | Web rota kabuğu                                                            |
| `apps/web/src/app/api/v1/dm/groups/[conversationId]/route-logic.ts`              | Web PATCH                                                                  |
| `apps/web/src/app/api/v1/dm/groups/[conversationId]/route.ts`                    | Web rota kabuğu                                                            |
| `apps/web/src/app/api/v1/dm/groups/[conversationId]/members/route-logic.ts`      | Web POST üye ekle                                                          |
| `apps/web/src/app/api/v1/dm/groups/[conversationId]/members/route.ts`            | Web rota kabuğu                                                            |
| `apps/web/src/app/api/v1/dm/groups/[conversationId]/members/[userId]/route.ts`   | Web DELETE üye çıkar/ayrıl                                                 |
| `apps/web/src/app/api/v1/dm/groups/route-logic.test.ts`                          | Web rota testleri (3 dosya, her rota grubu için)                           |
| `apps/web/src/app/api/v1/mobile/dm/groups/**`                                    | Mobil eşdeğerleri (aynı 4 uç)                                              |
| `apps/mobile/src/app/screens/group-create-screen.tsx`                            | Grup oluşturma ekranı (iki aşama)                                          |
| `packages/types/src/group-dm-selection.ts`                                       | Seçim/sınır/aşama saf mantığı — mobil ekran ve web diyaloğu ortak kullanır |
| `packages/types/src/group-dm-selection.test.ts`                                  | Seçim modeli testleri                                                      |
| `apps/mobile/src/dm/mobile-group-client.ts`                                      | Mobil API çağrıları + mutation hook'ları                                   |
| `apps/mobile/src/app/components/dm-system-message-row.tsx`                       | Sistem mesajı satırı                                                       |
| `apps/mobile/src/dm/group-system-message-copy.ts`                                | `systemType` → yerelleştirilmiş cümle                                      |
| `apps/mobile/component-tests/mobile-group-create.test.tsx`                       | Oluşturma ekranı RNTL testleri                                             |
| `apps/mobile/component-tests/mobile-group-details.test.tsx`                      | Grup detay RNTL testleri                                                   |
| `apps/web/src/components/dm/group-create-dialog.tsx`                             | Web oluşturma diyaloğu                                                     |
| `apps/web/src/components/dm/group-create-dialog.test.tsx`                        | Diyalog testleri                                                           |
| `apps/web/src/components/dm/dm-system-message.tsx`                               | Web sistem mesajı satırı                                                   |

### Değiştirilecek dosyalar

| Dosya                                                   | Değişiklik                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/db/prisma/schema.prisma`                      | `DMSystemMessageType` enum + `DMMessage` 3 alan                                       |
| `packages/types/src/socket.ts`                          | `DMConversationDTOSchema`'ya `iconUrl` + `ownerId`                                    |
| `packages/types/src/index.ts`                           | `group-dm.ts` re-export                                                               |
| `packages/types/src/mobile-workspace-management.ts`     | `MobileMediaUploadPurposeSchema`'ya `"group-icon"`                                    |
| `apps/web/src/lib/dm/service.ts`                        | `iconUrl`/`ownerId` DTO'ya; `dmConversationInclude` + `getDeletedMessageLabel` export |
| `apps/web/src/lib/dm/mobile-details-service.ts`         | Grup kolu (`participants[]`)                                                          |
| `apps/web/src/lib/socket/events.ts`                     | 3 yeni olay                                                                           |
| `apps/web/src/lib/api-rate-limit.ts`                    | 6 yeni eylem                                                                          |
| `apps/web/src/app/api/uploadthing/core.ts`              | `groupIconUploader`                                                                   |
| `apps/web/src/app/api/v1/mobile/dm/route-logic.ts:135`  | `iconUrl: null` sabitini kaldır                                                       |
| `apps/mobile/src/app/screens/dm-inbox.tsx`              | `DMInboxHeader`'a `+` butonu                                                          |
| `apps/mobile/src/navigation/mobile-navigation-types.ts` | `GroupCreate` rotası                                                                  |
| `apps/mobile/src/navigation/mobile-linking.ts`          | `channels/@me/new-group` deep link                                                    |
| `apps/mobile/src/locale/mobile-copy.ts`                 | Grup metinleri (tr + en)                                                              |
| `apps/mobile/src/realtime/realtime-query-bridge.ts`     | 3 yeni olayın invalidation'ı                                                          |
| `apps/web/src/components/dm/dm-sidebar.tsx`             | `+` butonu + grup satırı                                                              |
| `apps/web/src/components/dm/dm-details-panel.tsx`       | Grup kipi                                                                             |
| `apps/web/src/components/dm/dm-conversation.tsx`        | Sistem mesajı + grup başlığı                                                          |

---

# FAZ 0 — Sözleşme temeli

Bu faz kapanmadan grup fotoğrafı hiçbir istemciye ulaşamaz.

## Task 1: `iconUrl` ve `ownerId`'yi DM sözleşmesine bağla

**Files:**

- Modify: `packages/types/src/socket.ts:153-160`
- Modify: `apps/web/src/lib/dm/service.ts:530-549`
- Modify: `apps/web/src/app/api/v1/mobile/dm/route-logic.ts:135`
- Test: `packages/types/src/group-dm.test.ts` (yeni)

**Interfaces:**

- Produces: `DMConversationDTO` artık `iconUrl: string | null` ve `ownerId: string | null` taşır. Sonraki tüm görevler bu iki alana güvenir.

- [ ] **Step 1: Write the failing test**

`packages/types/src/group-dm.test.ts` oluştur:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const socket = import("./socket");

describe("DMConversationDTOSchema group fields", () => {
  it("carries iconUrl and ownerId so a group's photo and admin reach clients", async () => {
    const { DMConversationDTOSchema } = await socket;
    const parsed = DMConversationDTOSchema.parse({
      iconUrl: "https://utfs.io/f/group-icon.png",
      id: "dm-1",
      lastMessage: null,
      lastMessageAt: "2026-08-07T09:00:00.000Z",
      name: "Takım",
      ownerId: "user-1",
      participants: [],
      type: "GROUP_DM",
    });

    assert.equal(parsed.iconUrl, "https://utfs.io/f/group-icon.png");
    assert.equal(parsed.ownerId, "user-1");
  });

  it("accepts a 1:1 DM with both group fields null", async () => {
    const { DMConversationDTOSchema } = await socket;
    const parsed = DMConversationDTOSchema.parse({
      iconUrl: null,
      id: "dm-2",
      lastMessage: null,
      lastMessageAt: "2026-08-07T09:00:00.000Z",
      name: "Ada",
      ownerId: null,
      participants: [],
      type: "DM",
    });

    assert.equal(parsed.iconUrl, null);
    assert.equal(parsed.ownerId, null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @wizards/types test
```

Expected: FAIL — `Unrecognized key(s) in object: 'iconUrl', 'ownerId'` veya `parsed.iconUrl` `undefined`.

- [ ] **Step 3: Add the fields to the DTO type and schema**

`packages/types/src/socket.ts` içinde `DMConversationDTO` tipine ve `DMConversationDTOSchema`'ya iki alan ekle:

```ts
export const DMConversationDTOSchema: z.ZodType<DMConversationDTO> = z.object({
  id: z.string(),
  type: DMConversationTypeSchema,
  name: z.string().nullable(),
  iconUrl: z.string().nullable(),
  ownerId: z.string().nullable(),
  lastMessageAt: z.string(),
  participants: z.array(DMParticipantDTOSchema),
  lastMessage: DMMessagePayloadSchema.nullable(),
});
```

Aynı dosyadaki `DMConversationDTO` interface/type tanımına da ekle:

```ts
iconUrl: string | null;
ownerId: string | null;
```

- [ ] **Step 4: Fill the fields on the server**

`apps/web/src/lib/dm/service.ts`, `mapDMConversationDTOWithPresence` içinde:

```ts
return {
  id: conversation.id,
  type: normalizeConversationType(conversation.type),
  name: resolveConversationName(conversation, viewerId),
  iconUrl: conversation.iconUrl,
  ownerId: conversation.ownerId,
  lastMessageAt: conversation.lastMessageAt.toISOString(),
  participants: conversation.participants.map((participant) =>
    mapDMParticipantWithPresence(
      participant,
      presenceByUserId.get(participant.userId) ?? getPresenceFallback(participant),
    ),
  ),
  lastMessage: mapConversationLastMessage(conversation, deletedMessageLabel, viewerId),
};
```

`RawDMConversation` tipi `dmConversationInclude` üzerinden türediği için `iconUrl` ve `ownerId` zaten tabloda mevcut ve seçiliyor — `include` değişikliği gerekmez.

- [ ] **Step 5: Stop hardcoding `iconUrl: null` on the mobile list route**

`apps/web/src/app/api/v1/mobile/dm/route-logic.ts`, `toMobileDMConversationListItem` içindeki

```ts
    iconUrl: null,
```

satırını şununla değiştir:

```ts
    iconUrl: conversation.iconUrl,
```

- [ ] **Step 6: Run the full type + web suites**

```bash
pnpm --filter @wizards/types test
```

Expected: PASS.

```bash
pnpm --filter @wizards/web test
```

Expected: PASS. `apps/web/src/app/api/v1/mobile/dm/route-logic.test.ts` içindeki mevcut `listDMs` sahtelerinde `iconUrl`/`ownerId` eksik olduğu için tip hatası çıkarsa, o sahte nesnelere `iconUrl: null, ownerId: null` ekle — beklenen çıktıdaki `iconUrl: null` değeri değişmemeli.

- [ ] **Step 7: Typecheck**

```bash
pnpm --filter @wizards/types typecheck
```

```bash
pnpm --filter @wizards/web typecheck
```

Expected: ikisi de 0 hata.

- [ ] **Step 8: Commit** (kullanıcı onayı gerekiyorsa önce sor)

```bash
git add packages/types/src/socket.ts packages/types/src/group-dm.test.ts apps/web/src/lib/dm/service.ts apps/web/src/app/api/v1/mobile/dm/route-logic.ts
git commit -m "feat(dm): carry group iconUrl and ownerId through the conversation DTO"
```

---

# FAZ 1 — Veri modeli ve tipler

## Task 2: Sistem mesajı alanlarını şemaya ekle

**Files:**

- Create: `packages/db/prisma/rebaseline-migrations/20260807120000_group_dm/migration.sql`
- Modify: `packages/db/prisma/schema.prisma:293-296` (enum bölgesi), `packages/db/prisma/schema.prisma:1355-1388` (`DMMessage`)

**Interfaces:**

- Produces: `DMSystemMessageType` Prisma enum'u; `DMMessage.systemType`, `DMMessage.systemTargetUserIds`, `DMMessage.systemValue`. Task 4–7 bunlara yazar, Task 18/24 okur.

- [ ] **Step 1: Write the migration SQL**

`packages/db/prisma/rebaseline-migrations/20260807120000_group_dm/migration.sql`:

```sql
-- Group DM system messages. These rows live in DMMessage so they interleave
-- with real messages in one pagination pass; content is always empty because
-- the sentence is localized per viewer on the client.
CREATE TYPE "DMSystemMessageType" AS ENUM (
  'GROUP_CREATED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'MEMBER_LEFT',
  'NAME_CHANGED',
  'ICON_CHANGED'
);

ALTER TABLE "DMMessage"
  ADD COLUMN "systemType" "DMSystemMessageType",
  ADD COLUMN "systemTargetUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "systemValue" VARCHAR(100);
```

- [ ] **Step 2: Mirror it in the Prisma schema**

`packages/db/prisma/schema.prisma`, `ConversationType` enum'unun hemen altına:

```prisma
enum DMSystemMessageType {
  GROUP_CREATED
  MEMBER_ADDED
  MEMBER_REMOVED
  MEMBER_LEFT
  NAME_CHANGED
  ICON_CHANGED
}
```

`model DMMessage` içinde, `clientNonce` satırının altına:

```prisma
  /// Group lifecycle row. Null for a real message. `content` stays empty:
  /// the sentence is built client-side so each viewer reads their own locale.
  systemType           DMSystemMessageType?
  systemTargetUserIds  String[]             @default([])
  systemValue          String?              @db.VarChar(100)
```

- [ ] **Step 3: Generate the client and verify the schema is valid**

```bash
pnpm --filter @wizards/db db:generate
```

Expected: `Generated Prisma Client` çıktısı, hata yok.

- [ ] **Step 4: Apply to the local database**

Yerel DB `db push` ile yönetiliyor:

```bash
pnpm --filter @wizards/db exec prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 5: Confirm the migration lives in the directory Prisma actually reads**

```bash
ls packages/db/prisma/rebaseline-migrations/20260807120000_group_dm/
```

Expected: `migration.sql` listelenir. Dosya `packages/db/prisma/migrations/` altında **olmamalı** — orada sessizce hiç çalışmaz.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/rebaseline-migrations/20260807120000_group_dm/migration.sql
git commit -m "feat(db): add group DM system message columns"
```

---

## Task 3: Grup sabitleri ve API şemaları

**Files:**

- Create: `packages/types/src/group-dm.ts`
- Modify: `packages/types/src/group-dm.test.ts` (Task 1'de oluşturuldu)
- Modify: `packages/types/src/index.ts`

**Interfaces:**

- Consumes: `DMConversationDTOSchema` (Task 1).
- Produces:
  - `GROUP_DM_MAX_PARTICIPANTS: 32`, `GROUP_DM_MIN_PARTICIPANTS: 3`, `GROUP_DM_NAME_MAX_LENGTH: 100`
  - `GroupDMCreateRequestSchema` → `{ userIds: string[]; name?: string; iconUrl?: string }`
  - `GroupDMUpdateRequestSchema` → `{ name?: string | null; iconUrl?: string | null }`
  - `GroupDMAddMembersRequestSchema` → `{ userIds: string[] }`
  - `GroupDMConversationResponseSchema` → `{ conversation: DMConversationDTO }`
  - `DMSystemMessageTypeSchema` → 6 değerli enum
  - Tip adları: `GroupDMCreateRequest`, `GroupDMUpdateRequest`, `GroupDMAddMembersRequest`, `DMSystemMessageTypeValue`

- [ ] **Step 1: Write the failing tests**

`packages/types/src/group-dm.test.ts` dosyasının sonuna ekle:

```ts
const groupDm = import("./group-dm");

describe("group DM request schemas", () => {
  it("rejects a create request below the 3-member floor", async () => {
    const { GroupDMCreateRequestSchema } = await groupDm;
    assert.throws(() => GroupDMCreateRequestSchema.parse({ userIds: ["user-2"] }));
  });

  it("rejects a create request above the 32-member ceiling", async () => {
    const { GroupDMCreateRequestSchema } = await groupDm;
    const userIds = Array.from({ length: 32 }, (_, index) => `user-${index + 2}`);
    assert.throws(() => GroupDMCreateRequestSchema.parse({ userIds }));
  });

  it("accepts the smallest legal group and defaults name and icon to absent", async () => {
    const { GroupDMCreateRequestSchema } = await groupDm;
    const parsed = GroupDMCreateRequestSchema.parse({ userIds: ["user-2", "user-3"] });
    assert.deepEqual(parsed, { userIds: ["user-2", "user-3"] });
  });

  it("normalizes a blank group name to null on update", async () => {
    const { GroupDMUpdateRequestSchema } = await groupDm;
    assert.deepEqual(GroupDMUpdateRequestSchema.parse({ name: "   " }), { name: null });
  });

  it("caps the group name at 100 characters", async () => {
    const { GroupDMUpdateRequestSchema } = await groupDm;
    assert.throws(() => GroupDMUpdateRequestSchema.parse({ name: "x".repeat(101) }));
  });

  it("requires https for a group icon", async () => {
    const { GroupDMUpdateRequestSchema } = await groupDm;
    assert.throws(() => GroupDMUpdateRequestSchema.parse({ iconUrl: "http://utfs.io/f/a.png" }));
  });

  it("names all six system message types", async () => {
    const { DMSystemMessageTypeSchema } = await groupDm;
    assert.deepEqual(DMSystemMessageTypeSchema.options, [
      "GROUP_CREATED",
      "MEMBER_ADDED",
      "MEMBER_REMOVED",
      "MEMBER_LEFT",
      "NAME_CHANGED",
      "ICON_CHANGED",
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @wizards/types test
```

Expected: FAIL — `Cannot find module './group-dm'`.

- [ ] **Step 3: Write the module**

`packages/types/src/group-dm.ts`:

```ts
import { z } from "zod";

import { DMConversationDTOSchema } from "./socket";

/** Creator included. Instagram's ceiling; keeps avatar stacks and fan-out sane. */
export const GROUP_DM_MAX_PARTICIPANTS = 32;
/** Creator + 2. Creator + 1 is already a 1:1 DM. */
export const GROUP_DM_MIN_PARTICIPANTS = 3;
export const GROUP_DM_NAME_MAX_LENGTH = 100;

const GroupMemberIdSchema = z.string().trim().min(1).max(128);

/**
 * Blank means "no name" — the title then falls back to the participants' names,
 * which is the behaviour `resolveConversationName` already implements.
 */
const GroupNameSchema = z
  .string()
  .max(GROUP_DM_NAME_MAX_LENGTH)
  .transform((value) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const GroupIconUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "HTTPS URL required");

export const DMSystemMessageTypeSchema = z.enum([
  "GROUP_CREATED",
  "MEMBER_ADDED",
  "MEMBER_REMOVED",
  "MEMBER_LEFT",
  "NAME_CHANGED",
  "ICON_CHANGED",
]);

export const GroupDMCreateRequestSchema = z
  .object({
    iconUrl: GroupIconUrlSchema.optional(),
    name: GroupNameSchema.optional(),
    // The creator is implicit, so the client sends one fewer than the floor
    // and one fewer than the ceiling.
    userIds: z
      .array(GroupMemberIdSchema)
      .min(GROUP_DM_MIN_PARTICIPANTS - 1)
      .max(GROUP_DM_MAX_PARTICIPANTS - 1),
  })
  .strict();

export const GroupDMUpdateRequestSchema = z
  .object({
    iconUrl: GroupIconUrlSchema.nullable().optional(),
    name: GroupNameSchema.nullable().optional(),
  })
  .strict();

export const GroupDMAddMembersRequestSchema = z
  .object({
    userIds: z
      .array(GroupMemberIdSchema)
      .min(1)
      .max(GROUP_DM_MAX_PARTICIPANTS - 1),
  })
  .strict();

export const GroupDMConversationResponseSchema = z
  .object({ conversation: DMConversationDTOSchema })
  .strict();

export type DMSystemMessageTypeValue = z.infer<typeof DMSystemMessageTypeSchema>;
export type GroupDMAddMembersRequest = z.infer<typeof GroupDMAddMembersRequestSchema>;
export type GroupDMCreateRequest = z.infer<typeof GroupDMCreateRequestSchema>;
export type GroupDMUpdateRequest = z.infer<typeof GroupDMUpdateRequestSchema>;
```

- [ ] **Step 4: Re-export from the package entry point**

`packages/types/src/index.ts`, mevcut re-export listesine ekle:

```ts
export * from "./group-dm";
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @wizards/types test
```

Expected: PASS.

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @wizards/types typecheck
```

Expected: 0 hata.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/group-dm.ts packages/types/src/group-dm.test.ts packages/types/src/index.ts
git commit -m "feat(types): add group DM constants and request schemas"
```

---

# FAZ 2 — Servis katmanı

Bu fazın dört görevi tek dosyayı büyütür: `apps/web/src/lib/dm/group-service.ts`. Her görev kendi test döngüsünü taşır ve bağımsız gözden geçirilebilir.

## Task 4: `createGroupConversation`

**Files:**

- Create: `apps/web/src/lib/dm/group-service.ts`
- Create: `apps/web/src/lib/dm/group-service.test.ts`
- Modify: `apps/web/src/lib/dm/service.ts` (`dmConversationInclude` ve `getDeletedMessageLabel` export edilir)

**Interfaces:**

- Consumes: `GROUP_DM_MAX_PARTICIPANTS`, `GROUP_DM_MIN_PARTICIPANTS` (Task 3); `DMConversationDTO` `iconUrl`/`ownerId` alanlarıyla (Task 1); `DMSystemMessageType` Prisma enum'u (Task 2).
- Produces:
  - `type GroupServiceDependencies` — DI yüzeyi
  - `createGroupConversation(actorId: string, input: { userIds: string[]; name?: string | null; iconUrl?: string | null }, dependencies?: GroupServiceDependencies): Promise<DMConversationDTO>`
  - `assertGroupMembersEligible(actorId: string, userIds: string[], dependencies: GroupServiceDependencies): Promise<string[]>` (tekilleştirilmiş, aktörü süzülmüş liste döner)

- [ ] **Step 1: Export the two private helpers the group service needs**

`apps/web/src/lib/dm/service.ts` içinde iki bildirimin başına `export` ekle:

```ts
export const dmConversationInclude = {
```

```ts
export async function getDeletedMessageLabel(userId: string) {
```

Gövdeleri değişmez.

- [ ] **Step 2: Write the failing tests**

`apps/web/src/lib/dm/group-service.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGroupConversation } from "./group-service";

type Deps = Parameters<typeof createGroupConversation>[2];

function buildDependencies(overrides: Partial<NonNullable<Deps>> = {}): NonNullable<Deps> {
  return {
    areFriends: async () => true,
    getBlockStatus: async () => ({ blocked: false }),
    getDeletedMessageLabel: async () => "Silinen mesaj",
    loadConversation: async () => {
      throw new Error("loadConversation should not be called in this test");
    },
    mapConversation: async (conversation) => ({
      iconUrl: conversation.iconUrl,
      id: conversation.id,
      lastMessage: null,
      lastMessageAt: "2026-08-07T09:00:00.000Z",
      name: conversation.name,
      ownerId: conversation.ownerId,
      participants: [],
      type: "GROUP_DM",
    }),
    writeCreatedGroup: async (input) => ({
      iconUrl: input.iconUrl,
      id: "group-1",
      name: input.name,
      ownerId: input.actorId,
      participantUserIds: input.participantUserIds,
    }),
    ...overrides,
  } as NonNullable<Deps>;
}

describe("createGroupConversation", () => {
  it("writes the creator plus the selected friends, creator first", async () => {
    let written: { participantUserIds: string[] } | null = null;
    const dependencies = buildDependencies({
      writeCreatedGroup: async (input) => {
        written = { participantUserIds: input.participantUserIds };
        return {
          iconUrl: input.iconUrl,
          id: "group-1",
          name: input.name,
          ownerId: input.actorId,
          participantUserIds: input.participantUserIds,
        };
      },
    });

    await createGroupConversation("user-1", { userIds: ["user-2", "user-3"] }, dependencies);

    assert.deepEqual(written, { participantUserIds: ["user-1", "user-2", "user-3"] });
  });

  it("drops the actor's own id and duplicates before counting", async () => {
    let written: { participantUserIds: string[] } | null = null;
    const dependencies = buildDependencies({
      writeCreatedGroup: async (input) => {
        written = { participantUserIds: input.participantUserIds };
        return {
          iconUrl: input.iconUrl,
          id: "group-1",
          name: input.name,
          ownerId: input.actorId,
          participantUserIds: input.participantUserIds,
        };
      },
    });

    await createGroupConversation(
      "user-1",
      { userIds: ["user-2", "user-2", "user-1", "user-3"] },
      dependencies,
    );

    assert.deepEqual(written, { participantUserIds: ["user-1", "user-2", "user-3"] });
  });

  it("refuses a group that would end up smaller than three people", async () => {
    await assert.rejects(
      () => createGroupConversation("user-1", { userIds: ["user-2"] }, buildDependencies()),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "GROUP_TOO_SMALL");
        assert.equal(error.status, 400);
        return true;
      },
    );
  });

  it("refuses a group larger than 32 people", async () => {
    const userIds = Array.from({ length: 32 }, (_, index) => `user-${index + 2}`);
    await assert.rejects(
      () => createGroupConversation("user-1", { userIds }, buildDependencies()),
      (error: { code?: string }) => {
        assert.equal(error.code, "GROUP_FULL");
        return true;
      },
    );
  });

  it("refuses a member who is not a friend of the actor", async () => {
    const dependencies = buildDependencies({
      areFriends: async (_actorId, targetId) => targetId !== "user-3",
    });

    await assert.rejects(
      () => createGroupConversation("user-1", { userIds: ["user-2", "user-3"] }, dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "NOT_FRIENDS");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("refuses a member the actor has blocked or been blocked by", async () => {
    const dependencies = buildDependencies({
      getBlockStatus: async (_actorId, targetId) => ({ blocked: targetId === "user-2" }),
    });

    await assert.rejects(
      () => createGroupConversation("user-1", { userIds: ["user-2", "user-3"] }, dependencies),
      (error: { code?: string }) => {
        assert.equal(error.code, "BLOCKED");
        return true;
      },
    );
  });

  it("stores a blank name as null so the title falls back to member names", async () => {
    let written: { name: string | null } | null = null;
    const dependencies = buildDependencies({
      writeCreatedGroup: async (input) => {
        written = { name: input.name };
        return {
          iconUrl: input.iconUrl,
          id: "group-1",
          name: input.name,
          ownerId: input.actorId,
          participantUserIds: input.participantUserIds,
        };
      },
    });

    await createGroupConversation(
      "user-1",
      { name: "   ", userIds: ["user-2", "user-3"] },
      dependencies,
    );

    assert.deepEqual(written, { name: null });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="createGroupConversation"
```

Expected: FAIL — `Cannot find module './group-service'`.

- [ ] **Step 4: Write the implementation**

`apps/web/src/lib/dm/group-service.ts`:

```ts
import {
  GROUP_DM_MAX_PARTICIPANTS,
  GROUP_DM_MIN_PARTICIPANTS,
  type DMConversationDTO,
} from "@wizards/types";
import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { areFriends, getBlockStatus } from "@/lib/friends/helpers";

import { dmConversationInclude, getDeletedMessageLabel, mapDMConversationDTO } from "./service";

export type GroupConversationRow = {
  iconUrl: string | null;
  id: string;
  name: string | null;
  ownerId: string | null;
  participantUserIds: string[];
};

export type GroupServiceDependencies = {
  areFriends(actorId: string, targetId: string): Promise<boolean>;
  getBlockStatus(actorId: string, targetId: string): Promise<{ blocked: boolean }>;
  getDeletedMessageLabel(userId: string): Promise<string>;
  loadConversation(conversationId: string): Promise<
    GroupConversationRow & {
      participants: Array<{ joinedAt: Date; userId: string }>;
      type: string;
    }
  >;
  mapConversation(
    conversation: GroupConversationRow,
    viewerId: string,
    deletedMessageLabel: string,
  ): Promise<DMConversationDTO>;
  writeCreatedGroup(input: {
    actorId: string;
    iconUrl: string | null;
    name: string | null;
    participantUserIds: string[];
  }): Promise<GroupConversationRow>;
};

/**
 * The picker is not trusted input: friendship and blocks are re-checked here on
 * every request, because either can change between the picker rendering and the
 * request landing.
 */
export async function assertGroupMembersEligible(
  actorId: string,
  userIds: readonly string[],
  dependencies: GroupServiceDependencies,
): Promise<string[]> {
  const targets = [...new Set(userIds)].filter((userId) => userId !== actorId);

  for (const targetId of targets) {
    const blockStatus = await dependencies.getBlockStatus(actorId, targetId);
    if (blockStatus.blocked) {
      throw new ApiError("You cannot add this user to a group", 403, "BLOCKED");
    }

    if (!(await dependencies.areFriends(actorId, targetId))) {
      throw new ApiError("You can only add friends to a group", 403, "NOT_FRIENDS");
    }
  }

  return targets;
}

const defaults: GroupServiceDependencies = {
  areFriends,
  getBlockStatus,
  getDeletedMessageLabel,
  loadConversation: async (conversationId) => {
    const conversation = await prisma.dMConversation.findUnique({
      where: { id: conversationId },
      select: {
        iconUrl: true,
        id: true,
        name: true,
        ownerId: true,
        participants: { orderBy: { joinedAt: "asc" }, select: { joinedAt: true, userId: true } },
        type: true,
      },
    });

    if (!conversation) {
      throw new ApiError("Conversation not found", 404, "NOT_FOUND");
    }

    return {
      ...conversation,
      participantUserIds: conversation.participants.map((participant) => participant.userId),
    };
  },
  mapConversation: async (conversation, viewerId, deletedMessageLabel) => {
    const row = await prisma.dMConversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: dmConversationInclude,
    });

    return await mapDMConversationDTO(row, viewerId, deletedMessageLabel);
  },
  writeCreatedGroup: async (input) =>
    prisma.$transaction(async (tx) => {
      const conversation = await tx.dMConversation.create({
        data: {
          iconUrl: input.iconUrl,
          name: input.name,
          ownerId: input.actorId,
          participants: {
            create: input.participantUserIds.map((userId) => ({ userId })),
          },
          type: "GROUP_DM",
        },
        select: { iconUrl: true, id: true, name: true, ownerId: true },
      });

      // Written in the same transaction as the membership rows, so a committed
      // group can never exist without its opening system line.
      await tx.dMMessage.create({
        data: {
          content: "",
          conversationId: conversation.id,
          systemTargetUserIds: [],
          systemType: "GROUP_CREATED",
          userId: input.actorId,
        },
      });

      return { ...conversation, participantUserIds: input.participantUserIds };
    }),
};

export async function createGroupConversation(
  actorId: string,
  input: { iconUrl?: string | null; name?: string | null; userIds: readonly string[] },
  dependencies: GroupServiceDependencies = defaults,
): Promise<DMConversationDTO> {
  const targets = await assertGroupMembersEligible(actorId, input.userIds, dependencies);
  const participantUserIds = [actorId, ...targets];

  if (participantUserIds.length < GROUP_DM_MIN_PARTICIPANTS) {
    throw new ApiError(
      `A group needs at least ${GROUP_DM_MIN_PARTICIPANTS} people`,
      400,
      "GROUP_TOO_SMALL",
    );
  }

  if (participantUserIds.length > GROUP_DM_MAX_PARTICIPANTS) {
    throw new ApiError(
      `A group holds at most ${GROUP_DM_MAX_PARTICIPANTS} people`,
      400,
      "GROUP_FULL",
    );
  }

  const name = input.name?.trim() ? input.name.trim() : null;
  const conversation = await dependencies.writeCreatedGroup({
    actorId,
    iconUrl: input.iconUrl ?? null,
    name,
    participantUserIds,
  });
  const deletedMessageLabel = await dependencies.getDeletedMessageLabel(actorId);

  return await dependencies.mapConversation(conversation, actorId, deletedMessageLabel);
}
```

- [ ] **Step 5: Run to verify it passes**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="createGroupConversation"
```

Expected: PASS, 7 test.

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @wizards/web typecheck
```

Expected: 0 hata.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/dm/group-service.ts apps/web/src/lib/dm/group-service.test.ts apps/web/src/lib/dm/service.ts
git commit -m "feat(dm): create group conversations with eligibility and size rules"
```

---

## Task 5: `addGroupMembers`

**Files:**

- Modify: `apps/web/src/lib/dm/group-service.ts`
- Modify: `apps/web/src/lib/dm/group-service.test.ts`

**Interfaces:**

- Consumes: `assertGroupMembersEligible`, `GroupServiceDependencies` (Task 4).
- Produces:
  - `requireGroupOwner(actorId: string, conversation: { ownerId: string | null; type: string }): void`
  - `addGroupMembers(actorId: string, conversationId: string, userIds: readonly string[], dependencies?: GroupServiceDependencies): Promise<DMConversationDTO>`
  - `GroupServiceDependencies` iki alan daha alır: `writeAddedMembers`, ve `loadConversation` artık `type` ile `participants[]` döndürüyor (Task 4'te tanımlandı).

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/dm/group-service.test.ts` sonuna ekle:

```ts
import { addGroupMembers } from "./group-service";

function buildGroup(
  overrides: Partial<{
    ownerId: string | null;
    participants: Array<{ joinedAt: Date; userId: string }>;
    type: string;
  }> = {},
) {
  return {
    iconUrl: null,
    id: "group-1",
    name: "Takım",
    ownerId: "user-1",
    participantUserIds: ["user-1", "user-2", "user-3"],
    participants: [
      { joinedAt: new Date("2026-08-01T00:00:00.000Z"), userId: "user-1" },
      { joinedAt: new Date("2026-08-02T00:00:00.000Z"), userId: "user-2" },
      { joinedAt: new Date("2026-08-03T00:00:00.000Z"), userId: "user-3" },
    ],
    type: "GROUP_DM",
    ...overrides,
  };
}

describe("addGroupMembers", () => {
  it("adds the new friends and records who was added", async () => {
    let written: { addedUserIds: string[]; actorId: string } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeAddedMembers: async (input) => {
        written = { addedUserIds: input.addedUserIds, actorId: input.actorId };
        return buildGroup();
      },
    });

    await addGroupMembers("user-1", "group-1", ["user-4", "user-5"], dependencies);

    assert.deepEqual(written, { addedUserIds: ["user-4", "user-5"], actorId: "user-1" });
  });

  it("silently drops users who are already members", async () => {
    let written: { addedUserIds: string[] } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeAddedMembers: async (input) => {
        written = { addedUserIds: input.addedUserIds };
        return buildGroup();
      },
    });

    await addGroupMembers("user-1", "group-1", ["user-2", "user-4"], dependencies);

    assert.deepEqual(written, { addedUserIds: ["user-4"] });
  });

  it("does not write anything when every requested user is already a member", async () => {
    let writeCount = 0;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeAddedMembers: async () => {
        writeCount += 1;
        return buildGroup();
      },
    });

    await addGroupMembers("user-1", "group-1", ["user-2", "user-3"], dependencies);

    assert.equal(writeCount, 0);
  });

  it("refuses a member who is not the owner", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () => addGroupMembers("user-2", "group-1", ["user-4"], dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "NOT_GROUP_OWNER");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("refuses a 1:1 DM", async () => {
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup({ ownerId: null, type: "DM" }),
    });

    await assert.rejects(
      () => addGroupMembers("user-1", "dm-1", ["user-4"], dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "NOT_A_GROUP");
        assert.equal(error.status, 400);
        return true;
      },
    );
  });

  it("refuses an addition that would exceed 32 members", async () => {
    const participants = Array.from({ length: 32 }, (_, index) => ({
      joinedAt: new Date("2026-08-01T00:00:00.000Z"),
      userId: `user-${index + 1}`,
    }));
    const dependencies = buildDependencies({
      loadConversation: async () =>
        buildGroup({ participants, ownerId: "user-1", type: "GROUP_DM" }),
    });

    await assert.rejects(
      () => addGroupMembers("user-1", "group-1", ["user-99"], dependencies),
      (error: { code?: string }) => {
        assert.equal(error.code, "GROUP_FULL");
        return true;
      },
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="addGroupMembers"
```

Expected: FAIL — `addGroupMembers is not a function`.

- [ ] **Step 3: Extend the dependency surface**

`apps/web/src/lib/dm/group-service.ts`, `GroupServiceDependencies` tipine ekle:

```ts
  writeAddedMembers(input: {
    actorId: string;
    addedUserIds: string[];
    conversationId: string;
  }): Promise<GroupConversationRow>;
```

`defaults` nesnesine karşılığını ekle:

```ts
  writeAddedMembers: async (input) =>
    prisma.$transaction(async (tx) => {
      await tx.dMParticipant.createMany({
        data: input.addedUserIds.map((userId) => ({
          conversationId: input.conversationId,
          userId,
        })),
        skipDuplicates: true,
      });

      await tx.dMMessage.create({
        data: {
          content: "",
          conversationId: input.conversationId,
          systemTargetUserIds: input.addedUserIds,
          systemType: "MEMBER_ADDED",
          userId: input.actorId,
        },
      });

      // A system row still moves the conversation up the inbox, but it must not
      // light anyone's unread badge — no participant counters are touched.
      const conversation = await tx.dMConversation.update({
        data: { lastMessageAt: new Date() },
        select: { iconUrl: true, id: true, name: true, ownerId: true },
        where: { id: input.conversationId },
      });

      const participants = await tx.dMParticipant.findMany({
        orderBy: { joinedAt: "asc" },
        select: { userId: true },
        where: { conversationId: input.conversationId },
      });

      return {
        ...conversation,
        participantUserIds: participants.map((participant) => participant.userId),
      };
    }),
```

- [ ] **Step 4: Write the owner guard and the function**

Aynı dosyaya ekle:

```ts
export function requireGroupOwner(
  actorId: string,
  conversation: { ownerId: string | null; type: string },
): void {
  if (conversation.type !== "GROUP_DM") {
    throw new ApiError("This conversation is not a group", 400, "NOT_A_GROUP");
  }

  if (conversation.ownerId !== actorId) {
    throw new ApiError("Only the group owner can do this", 403, "NOT_GROUP_OWNER");
  }
}

export async function addGroupMembers(
  actorId: string,
  conversationId: string,
  userIds: readonly string[],
  dependencies: GroupServiceDependencies = defaults,
): Promise<DMConversationDTO> {
  const conversation = await dependencies.loadConversation(conversationId);
  requireGroupOwner(actorId, conversation);

  const existing = new Set(conversation.participants.map((participant) => participant.userId));
  const eligible = await assertGroupMembersEligible(actorId, userIds, dependencies);
  const addedUserIds = eligible.filter((userId) => !existing.has(userId));
  const deletedMessageLabel = await dependencies.getDeletedMessageLabel(actorId);

  if (addedUserIds.length === 0) {
    return await dependencies.mapConversation(conversation, actorId, deletedMessageLabel);
  }

  if (existing.size + addedUserIds.length > GROUP_DM_MAX_PARTICIPANTS) {
    throw new ApiError(
      `A group holds at most ${GROUP_DM_MAX_PARTICIPANTS} people`,
      400,
      "GROUP_FULL",
    );
  }

  const updated = await dependencies.writeAddedMembers({
    actorId,
    addedUserIds,
    conversationId,
  });

  return await dependencies.mapConversation(updated, actorId, deletedMessageLabel);
}
```

`buildDependencies` sahtesine test dosyasında `writeAddedMembers` varsayılanı eklemeyi unutma:

```ts
    writeAddedMembers: async () => {
      throw new Error("writeAddedMembers should not be called in this test");
    },
```

- [ ] **Step 5: Run to verify it passes**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="addGroupMembers"
```

Expected: PASS, 6 test. Task 4'ün 7 testi de yeşil kalmalı:

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="GroupConversation|GroupMembers"
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/dm/group-service.ts apps/web/src/lib/dm/group-service.test.ts
git commit -m "feat(dm): add members to a group with owner and size guards"
```

---

## Task 6: `removeGroupMember` ve `leaveGroupConversation`

**Files:**

- Modify: `apps/web/src/lib/dm/group-service.ts`
- Modify: `apps/web/src/lib/dm/group-service.test.ts`

**Interfaces:**

- Consumes: `requireGroupOwner`, `GroupServiceDependencies` (Task 5).
- Produces:
  - `resolveNextGroupOwner(participants: ReadonlyArray<{ joinedAt: Date; userId: string }>, leavingUserId: string): string | null`
  - `removeGroupMember(actorId, conversationId, targetUserId, dependencies?): Promise<void>`
  - `leaveGroupConversation(actorId, conversationId, dependencies?): Promise<void>`
  - `GroupServiceDependencies` iki alan daha: `writeRemovedMember`, `deleteConversation`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/dm/group-service.test.ts` sonuna ekle:

```ts
import { leaveGroupConversation, removeGroupMember, resolveNextGroupOwner } from "./group-service";

describe("resolveNextGroupOwner", () => {
  it("hands the group to the earliest remaining member", () => {
    const next = resolveNextGroupOwner(
      [
        { joinedAt: new Date("2026-08-01T00:00:00.000Z"), userId: "user-1" },
        { joinedAt: new Date("2026-08-03T00:00:00.000Z"), userId: "user-3" },
        { joinedAt: new Date("2026-08-02T00:00:00.000Z"), userId: "user-2" },
      ],
      "user-1",
    );

    assert.equal(next, "user-2");
  });

  it("breaks a joinedAt tie on userId so the result is deterministic", () => {
    const joinedAt = new Date("2026-08-02T00:00:00.000Z");
    const next = resolveNextGroupOwner(
      [
        { joinedAt, userId: "user-9" },
        { joinedAt, userId: "user-4" },
        { joinedAt: new Date("2026-08-01T00:00:00.000Z"), userId: "user-1" },
      ],
      "user-1",
    );

    assert.equal(next, "user-4");
  });

  it("returns null when nobody is left", () => {
    assert.equal(
      resolveNextGroupOwner(
        [{ joinedAt: new Date("2026-08-01T00:00:00.000Z"), userId: "user-1" }],
        "user-1",
      ),
      null,
    );
  });
});

describe("removeGroupMember", () => {
  it("lets the owner remove another member and records the target", async () => {
    let written: { actorId: string; systemType: string; targetUserId: string } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeRemovedMember: async (input) => {
        written = {
          actorId: input.actorId,
          systemType: input.systemType,
          targetUserId: input.targetUserId,
        };
      },
    });

    await removeGroupMember("user-1", "group-1", "user-3", dependencies);

    assert.deepEqual(written, {
      actorId: "user-1",
      systemType: "MEMBER_REMOVED",
      targetUserId: "user-3",
    });
  });

  it("refuses a non-owner removing somebody else", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () => removeGroupMember("user-2", "group-1", "user-3", dependencies),
      (error: { code?: string }) => {
        assert.equal(error.code, "NOT_GROUP_OWNER");
        return true;
      },
    );
  });

  it("treats a member removing themselves as leaving", async () => {
    let written: { systemType: string; targetUserId: string } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeRemovedMember: async (input) => {
        written = { systemType: input.systemType, targetUserId: input.targetUserId };
      },
    });

    await removeGroupMember("user-2", "group-1", "user-2", dependencies);

    assert.deepEqual(written, { systemType: "MEMBER_LEFT", targetUserId: "user-2" });
  });

  it("refuses a target who is not in the group", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () => removeGroupMember("user-1", "group-1", "user-9", dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "NOT_FOUND");
        assert.equal(error.status, 404);
        return true;
      },
    );
  });
});

describe("leaveGroupConversation", () => {
  it("passes ownership to the earliest remaining member when the owner leaves", async () => {
    let written: { nextOwnerId: string | null } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeRemovedMember: async (input) => {
        written = { nextOwnerId: input.nextOwnerId };
      },
    });

    await leaveGroupConversation("user-1", "group-1", dependencies);

    assert.deepEqual(written, { nextOwnerId: "user-2" });
  });

  it("leaves ownership alone when a non-owner leaves", async () => {
    let written: { nextOwnerId: string | null } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeRemovedMember: async (input) => {
        written = { nextOwnerId: input.nextOwnerId };
      },
    });

    await leaveGroupConversation("user-2", "group-1", dependencies);

    assert.deepEqual(written, { nextOwnerId: null });
  });

  it("deletes the conversation when the last member leaves", async () => {
    let deleted: string | null = null;
    let removeWrites = 0;
    const dependencies = buildDependencies({
      deleteConversation: async (conversationId) => {
        deleted = conversationId;
      },
      loadConversation: async () =>
        buildGroup({
          participants: [{ joinedAt: new Date("2026-08-01T00:00:00.000Z"), userId: "user-1" }],
        }),
      writeRemovedMember: async () => {
        removeWrites += 1;
      },
    });

    await leaveGroupConversation("user-1", "group-1", dependencies);

    assert.equal(deleted, "group-1");
    assert.equal(removeWrites, 0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="removeGroupMember|leaveGroupConversation|resolveNextGroupOwner"
```

Expected: FAIL — fonksiyonlar tanımlı değil.

- [ ] **Step 3: Extend the dependency surface**

`GroupServiceDependencies` tipine iki alan ekle:

```ts
  deleteConversation(conversationId: string): Promise<void>;
  writeRemovedMember(input: {
    actorId: string;
    conversationId: string;
    nextOwnerId: string | null;
    systemType: "MEMBER_LEFT" | "MEMBER_REMOVED";
    targetUserId: string;
  }): Promise<void>;
```

`defaults` nesnesine:

```ts
  deleteConversation: async (conversationId) => {
    // Cascades clear participants, messages, reactions and attachments.
    await prisma.dMConversation.delete({ where: { id: conversationId } });
  },
  writeRemovedMember: async (input) =>
    prisma.$transaction(async (tx) => {
      await tx.dMParticipant.delete({
        where: {
          conversationId_userId: {
            conversationId: input.conversationId,
            userId: input.targetUserId,
          },
        },
      });

      await tx.dMMessage.create({
        data: {
          content: "",
          conversationId: input.conversationId,
          systemTargetUserIds:
            input.systemType === "MEMBER_REMOVED" ? [input.targetUserId] : [],
          systemType: input.systemType,
          userId: input.actorId,
        },
      });

      await tx.dMConversation.update({
        data: {
          lastMessageAt: new Date(),
          ...(input.nextOwnerId === null ? {} : { ownerId: input.nextOwnerId }),
        },
        where: { id: input.conversationId },
      });
    }),
```

Test dosyasındaki `buildDependencies` sahtesine de varsayılan ekle:

```ts
    deleteConversation: async () => {
      throw new Error("deleteConversation should not be called in this test");
    },
    writeRemovedMember: async () => {
      throw new Error("writeRemovedMember should not be called in this test");
    },
```

- [ ] **Step 4: Write the implementation**

```ts
/**
 * Earliest `joinedAt` wins; `userId` breaks a tie so two servers replaying the
 * same departure pick the same owner.
 */
export function resolveNextGroupOwner(
  participants: ReadonlyArray<{ joinedAt: Date; userId: string }>,
  leavingUserId: string,
): string | null {
  const remaining = participants
    .filter((participant) => participant.userId !== leavingUserId)
    .sort((left, right) => {
      const byJoinedAt = left.joinedAt.getTime() - right.joinedAt.getTime();
      return byJoinedAt !== 0 ? byJoinedAt : left.userId.localeCompare(right.userId);
    });

  return remaining[0]?.userId ?? null;
}

export async function leaveGroupConversation(
  actorId: string,
  conversationId: string,
  dependencies: GroupServiceDependencies = defaults,
): Promise<void> {
  const conversation = await dependencies.loadConversation(conversationId);

  if (conversation.type !== "GROUP_DM") {
    throw new ApiError("This conversation is not a group", 400, "NOT_A_GROUP");
  }

  if (!conversation.participants.some((participant) => participant.userId === actorId)) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  const nextOwnerId =
    conversation.ownerId === actorId
      ? resolveNextGroupOwner(conversation.participants, actorId)
      : null;

  if (conversation.ownerId === actorId && nextOwnerId === null) {
    // Last member out. Nothing left to announce to.
    await dependencies.deleteConversation(conversationId);
    return;
  }

  if (conversation.participants.length === 1) {
    await dependencies.deleteConversation(conversationId);
    return;
  }

  await dependencies.writeRemovedMember({
    actorId,
    conversationId,
    nextOwnerId,
    systemType: "MEMBER_LEFT",
    targetUserId: actorId,
  });
}

export async function removeGroupMember(
  actorId: string,
  conversationId: string,
  targetUserId: string,
  dependencies: GroupServiceDependencies = defaults,
): Promise<void> {
  if (actorId === targetUserId) {
    await leaveGroupConversation(actorId, conversationId, dependencies);
    return;
  }

  const conversation = await dependencies.loadConversation(conversationId);
  requireGroupOwner(actorId, conversation);

  if (!conversation.participants.some((participant) => participant.userId === targetUserId)) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  await dependencies.writeRemovedMember({
    actorId,
    conversationId,
    nextOwnerId: null,
    systemType: "MEMBER_REMOVED",
    targetUserId,
  });
}
```

- [ ] **Step 5: Run to verify it passes**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="removeGroupMember|leaveGroupConversation|resolveNextGroupOwner"
```

Expected: PASS, 10 test.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/dm/group-service.ts apps/web/src/lib/dm/group-service.test.ts
git commit -m "feat(dm): remove and leave group members with ownership handover"
```

---

## Task 7: `updateGroupConversation`

**Files:**

- Modify: `apps/web/src/lib/dm/group-service.ts`
- Modify: `apps/web/src/lib/dm/group-service.test.ts`

**Interfaces:**

- Produces: `updateGroupConversation(actorId, conversationId, patch: { iconUrl?: string | null; name?: string | null }, dependencies?): Promise<DMConversationDTO>`; `GroupServiceDependencies.writeGroupMetadata`.

- [ ] **Step 1: Write the failing tests**

```ts
import { updateGroupConversation } from "./group-service";

describe("updateGroupConversation", () => {
  it("writes a NAME_CHANGED system row carrying the new name", async () => {
    let written: { systemType: string; systemValue: string | null } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeGroupMetadata: async (input) => {
        written = { systemType: input.systemType, systemValue: input.systemValue };
        return buildGroup({});
      },
    });

    await updateGroupConversation("user-1", "group-1", { name: "Yeni ad" }, dependencies);

    assert.deepEqual(written, { systemType: "NAME_CHANGED", systemValue: "Yeni ad" });
  });

  it("writes an ICON_CHANGED system row with no value", async () => {
    let written: { systemType: string; systemValue: string | null } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeGroupMetadata: async (input) => {
        written = { systemType: input.systemType, systemValue: input.systemValue };
        return buildGroup({});
      },
    });

    await updateGroupConversation(
      "user-1",
      "group-1",
      { iconUrl: "https://utfs.io/f/new.png" },
      dependencies,
    );

    assert.deepEqual(written, { systemType: "ICON_CHANGED", systemValue: null });
  });

  it("refuses a non-owner", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () => updateGroupConversation("user-2", "group-1", { name: "Yeni" }, dependencies),
      (error: { code?: string }) => {
        assert.equal(error.code, "NOT_GROUP_OWNER");
        return true;
      },
    );
  });

  it("does nothing when the patch is empty", async () => {
    let writeCount = 0;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeGroupMetadata: async () => {
        writeCount += 1;
        return buildGroup({});
      },
    });

    await updateGroupConversation("user-1", "group-1", {}, dependencies);

    assert.equal(writeCount, 0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="updateGroupConversation"
```

Expected: FAIL.

- [ ] **Step 3: Extend the dependency surface**

`GroupServiceDependencies` tipine:

```ts
  writeGroupMetadata(input: {
    actorId: string;
    conversationId: string;
    iconUrl?: string | null;
    name?: string | null;
    systemType: "ICON_CHANGED" | "NAME_CHANGED";
    systemValue: string | null;
  }): Promise<GroupConversationRow>;
```

`defaults` nesnesine:

```ts
  writeGroupMetadata: async (input) =>
    prisma.$transaction(async (tx) => {
      const conversation = await tx.dMConversation.update({
        data: {
          lastMessageAt: new Date(),
          ...(input.iconUrl === undefined ? {} : { iconUrl: input.iconUrl }),
          ...(input.name === undefined ? {} : { name: input.name }),
        },
        select: { iconUrl: true, id: true, name: true, ownerId: true },
        where: { id: input.conversationId },
      });

      await tx.dMMessage.create({
        data: {
          content: "",
          conversationId: input.conversationId,
          systemTargetUserIds: [],
          systemType: input.systemType,
          systemValue: input.systemValue,
          userId: input.actorId,
        },
      });

      const participants = await tx.dMParticipant.findMany({
        orderBy: { joinedAt: "asc" },
        select: { userId: true },
        where: { conversationId: input.conversationId },
      });

      return {
        ...conversation,
        participantUserIds: participants.map((participant) => participant.userId),
      };
    }),
```

Test sahtesine varsayılan ekle:

```ts
    writeGroupMetadata: async () => {
      throw new Error("writeGroupMetadata should not be called in this test");
    },
```

- [ ] **Step 4: Write the implementation**

```ts
export async function updateGroupConversation(
  actorId: string,
  conversationId: string,
  patch: { iconUrl?: string | null; name?: string | null },
  dependencies: GroupServiceDependencies = defaults,
): Promise<DMConversationDTO> {
  const conversation = await dependencies.loadConversation(conversationId);
  requireGroupOwner(actorId, conversation);
  const deletedMessageLabel = await dependencies.getDeletedMessageLabel(actorId);

  const changesName = patch.name !== undefined;
  const changesIcon = patch.iconUrl !== undefined;

  if (!changesName && !changesIcon) {
    return await dependencies.mapConversation(conversation, actorId, deletedMessageLabel);
  }

  // A single request can only announce one thing; the name wins because it is
  // the change other members actually read in the inbox row.
  const systemType = changesName ? "NAME_CHANGED" : "ICON_CHANGED";
  const updated = await dependencies.writeGroupMetadata({
    actorId,
    conversationId,
    systemType,
    systemValue: changesName ? (patch.name ?? null) : null,
    ...(changesIcon ? { iconUrl: patch.iconUrl } : {}),
    ...(changesName ? { name: patch.name } : {}),
  });

  return await dependencies.mapConversation(updated, actorId, deletedMessageLabel);
}
```

- [ ] **Step 5: Run the whole group service suite**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="Group"
```

Expected: PASS, 27 test (7 + 6 + 10 + 4).

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @wizards/web typecheck
```

Expected: 0 hata.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/dm/group-service.ts apps/web/src/lib/dm/group-service.test.ts
git commit -m "feat(dm): rename and re-photo a group with an owner guard"
```

---

# FAZ 3 — Realtime

## Task 8: Grup olayları ve çıkarılan üyenin odadan atılması

Bu görev spec'in en kritik güvenlik kalemini içerir: `dm:join` handler'ı katılımı kapıda kontrol ediyor ama **zaten katılmış** bir soketi odadan atmıyor. Çıkarılan üye atılmazsa gruptan sonraki tüm mesajları almaya devam eder.

**Files:**

- Create: `apps/web/src/lib/dm/group-realtime.ts`
- Create: `apps/web/src/lib/dm/group-realtime.test.ts`
- Modify: `apps/web/src/lib/socket/events.ts:246-264`

**Interfaces:**

- Consumes: `DMConversationDTO` (Task 1).
- Produces:
  - `emitGroupConversationCreated(io, conversation: DMConversationDTO): void`
  - `emitGroupMembersChanged(io, input: { conversation: DMConversationDTO; addedUserIds?: string[] }): void`
  - `evictRemovedGroupMember(io, input: { conversationId: string; userId: string }): void`
  - `type GroupRealtimeServer` — `io`'nun bu modülde kullanılan minimum yüzeyi

- [ ] **Step 1: Declare the three events**

`apps/web/src/lib/socket/events.ts`, mevcut `"dm:conversation:updated"` tanımının hemen altına:

```ts
  /** A group the viewer is now in. Lands in their inbox without a refetch. */
  "dm:conversation:created": (data: { conversation: DMConversationDTO }) => void;
  "dm:conversation:members_changed": (data: {
    conversationId: string;
    conversation: DMConversationDTO;
  }) => void;
  /** The viewer is no longer a participant. Drop the row, close the chat. */
  "dm:conversation:removed": (data: { conversationId: string }) => void;
```

- [ ] **Step 2: Write the failing tests**

`apps/web/src/lib/dm/group-realtime.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emitGroupConversationCreated,
  emitGroupMembersChanged,
  evictRemovedGroupMember,
} from "./group-realtime";

type Emitted = { args: unknown[]; event: string; rooms: string[] };

function buildIo() {
  const emitted: Emitted[] = [];
  const left: Array<{ room: string; source: string }> = [];

  const io = {
    in(room: string) {
      return {
        socketsLeave(target: string) {
          left.push({ room: target, source: room });
        },
      };
    },
    to(rooms: string | string[]) {
      const roomList = Array.isArray(rooms) ? rooms : [rooms];
      return {
        emit(event: string, ...args: unknown[]) {
          emitted.push({ args, event, rooms: roomList });
        },
      };
    },
  };

  return { emitted, io, left };
}

const conversation = {
  iconUrl: null,
  id: "group-1",
  lastMessage: null,
  lastMessageAt: "2026-08-07T09:00:00.000Z",
  name: "Takım",
  ownerId: "user-1",
  participants: [
    {
      avatarUrl: null,
      customStatus: null,
      displayName: "A",
      muted: false,
      presence: { customStatus: null, status: "ONLINE" },
      status: "ONLINE",
      unreadCount: 0,
      userId: "user-1",
      username: "a",
    },
    {
      avatarUrl: null,
      customStatus: null,
      displayName: "B",
      muted: false,
      presence: { customStatus: null, status: "ONLINE" },
      status: "ONLINE",
      unreadCount: 0,
      userId: "user-2",
      username: "b",
    },
  ],
  type: "GROUP_DM" as const,
};

describe("group realtime", () => {
  it("announces a new group to every participant's personal room", () => {
    const { emitted, io } = buildIo();

    emitGroupConversationCreated(io, conversation);

    assert.deepEqual(emitted, [
      {
        args: [{ conversation }],
        event: "dm:conversation:created",
        rooms: ["user:user-1", "user:user-2"],
      },
    ]);
  });

  it("announces a membership change to the conversation room and to the new members", () => {
    const { emitted, io } = buildIo();

    emitGroupMembersChanged(io, { addedUserIds: ["user-2"], conversation });

    assert.deepEqual(emitted, [
      {
        args: [{ conversation, conversationId: "group-1" }],
        event: "dm:conversation:members_changed",
        rooms: ["dm:group-1", "user:user-2"],
      },
    ]);
  });

  it("tells the removed member and forces their sockets out of the room", () => {
    const { emitted, io, left } = buildIo();

    evictRemovedGroupMember(io, { conversationId: "group-1", userId: "user-3" });

    assert.deepEqual(emitted, [
      {
        args: [{ conversationId: "group-1" }],
        event: "dm:conversation:removed",
        rooms: ["user:user-3"],
      },
    ]);
    // Without this the removed member keeps receiving every later message: the
    // join handler only gates entry, it never evicts a socket already inside.
    assert.deepEqual(left, [{ room: "dm:group-1", source: "user:user-3" }]);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="group realtime"
```

Expected: FAIL — `Cannot find module './group-realtime'`.

- [ ] **Step 4: Write the implementation**

`apps/web/src/lib/dm/group-realtime.ts`:

```ts
import type { DMConversationDTO } from "@wizards/types";

export type GroupRealtimeServer = {
  in(room: string): { socketsLeave(room: string): void };
  to(rooms: string | string[]): { emit(event: string, ...args: unknown[]): void };
};

function toUserRooms(conversation: DMConversationDTO): string[] {
  return conversation.participants.map((participant) => `user:${participant.userId}`);
}

export function emitGroupConversationCreated(
  io: GroupRealtimeServer,
  conversation: DMConversationDTO,
): void {
  io.to(toUserRooms(conversation)).emit("dm:conversation:created", { conversation });
}

export function emitGroupMembersChanged(
  io: GroupRealtimeServer,
  input: { addedUserIds?: readonly string[]; conversation: DMConversationDTO },
): void {
  // The conversation room covers everyone who has the chat open; the personal
  // rooms cover people who were just added and have never joined it.
  const rooms = [
    `dm:${input.conversation.id}`,
    ...(input.addedUserIds ?? []).map((userId) => `user:${userId}`),
  ];

  io.to(rooms).emit("dm:conversation:members_changed", {
    conversation: input.conversation,
    conversationId: input.conversation.id,
  });
}

export function evictRemovedGroupMember(
  io: GroupRealtimeServer,
  input: { conversationId: string; userId: string },
): void {
  io.to(`user:${input.userId}`).emit("dm:conversation:removed", {
    conversationId: input.conversationId,
  });

  // `dm:join` gates entry but never removes a socket that is already inside, so
  // an un-evicted socket would keep receiving this group's messages.
  io.in(`user:${input.userId}`).socketsLeave(`dm:${input.conversationId}`);
}
```

- [ ] **Step 5: Run to verify it passes**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="group realtime"
```

Expected: PASS, 3 test.

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @wizards/web typecheck
```

Expected: 0 hata.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/dm/group-realtime.ts apps/web/src/lib/dm/group-realtime.test.ts apps/web/src/lib/socket/events.ts
git commit -m "feat(dm): broadcast group lifecycle events and evict removed members"
```

---

# FAZ 4 — API yüzeyi

## Task 9: Web grup rotaları

**Files:**

- Modify: `apps/web/src/lib/api-rate-limit.ts:63-69`
- Create: `apps/web/src/app/api/v1/dm/groups/route-logic.ts`
- Create: `apps/web/src/app/api/v1/dm/groups/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/dm/groups/route.ts`
- Create: `apps/web/src/app/api/v1/dm/groups/[conversationId]/route.ts`
- Create: `apps/web/src/app/api/v1/dm/groups/[conversationId]/members/route.ts`
- Create: `apps/web/src/app/api/v1/dm/groups/[conversationId]/members/[userId]/route.ts`

**Interfaces:**

- Consumes: `createGroupConversation`, `updateGroupConversation`, `addGroupMembers`, `removeGroupMember` (Task 4–7); `emitGroupConversationCreated`, `emitGroupMembersChanged`, `evictRemovedGroupMember` (Task 8); `GroupDM*RequestSchema` (Task 3).
- Produces:
  - `type GroupRouteDependencies`
  - `groupCreateRoute(request, dependencies?): Promise<Response>`
  - `groupUpdateRoute(request, conversationId, dependencies?): Promise<Response>`
  - `groupAddMembersRoute(request, conversationId, dependencies?): Promise<Response>`
  - `groupRemoveMemberRoute(request, conversationId, userId, dependencies?): Promise<Response>`

Aynı dört fonksiyon Task 10'da mobil kabuklar tarafından da çağrılır; iş mantığı ikinci kez yazılmaz.

- [ ] **Step 1: Register the rate limits**

`apps/web/src/lib/api-rate-limit.ts`, mevcut `"dm:create"` satırının yanına alfabetik sırada:

```ts
  "dm:group:create": { limit: 10, windowSeconds: 10 * 60 },
  "dm:group:members": { limit: 30, windowSeconds: 60 },
  "dm:group:update": { limit: 30, windowSeconds: 60 },
```

`"mobile:dm:create"` satırının yanına:

```ts
  "mobile:dm:group:create": { limit: 10, windowSeconds: 10 * 60 },
  "mobile:dm:group:members": { limit: 30, windowSeconds: 60 },
  "mobile:dm:group:update": { limit: 30, windowSeconds: 60 },
```

- [ ] **Step 2: Write the failing tests**

`apps/web/src/app/api/v1/dm/groups/route-logic.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  groupAddMembersRoute,
  groupCreateRoute,
  groupRemoveMemberRoute,
  groupUpdateRoute,
} from "./route-logic";

const conversation = {
  iconUrl: null,
  id: "group-1",
  lastMessage: null,
  lastMessageAt: "2026-08-07T09:00:00.000Z",
  name: "Takım",
  ownerId: "user-1",
  participants: [],
  type: "GROUP_DM" as const,
};

function buildDependencies(overrides = {}) {
  return {
    addMembers: async () => conversation,
    authenticate: async () => "user-1",
    createGroup: async () => conversation,
    emitCreated: () => {},
    emitMembersChanged: () => {},
    enforceRateLimit: async () => {},
    evictRemoved: () => {},
    getIo: () => ({}) as never,
    loadConversationForBroadcast: async () => conversation,
    removeMember: async () => {},
    updateGroup: async () => conversation,
    ...overrides,
  };
}

describe("group create route", () => {
  it("creates the group, announces it and returns 201", async () => {
    const calls: unknown[] = [];
    const response = await groupCreateRoute(
      new Request("https://whispr.test/api/v1/dm/groups", {
        body: JSON.stringify({ name: "Takım", userIds: ["user-2", "user-3"] }),
        method: "POST",
      }),
      buildDependencies({
        createGroup: async (actorId: string, input: unknown) => {
          calls.push({ actorId, input });
          return conversation;
        },
        emitCreated: (_io: unknown, announced: unknown) => {
          calls.push({ announced });
        },
        enforceRateLimit: async (_id: string, action: string) => {
          calls.push(action);
        },
      }),
    );

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { conversation });
    assert.deepEqual(calls, [
      "dm:group:create",
      { actorId: "user-1", input: { name: "Takım", userIds: ["user-2", "user-3"] } },
      { announced: conversation },
    ]);
  });

  it("rejects a body with only one member", async () => {
    const response = await groupCreateRoute(
      new Request("https://whispr.test/api/v1/dm/groups", {
        body: JSON.stringify({ userIds: ["user-2"] }),
        method: "POST",
      }),
      buildDependencies(),
    );

    assert.equal(response.status, 400);
  });
});

describe("group update route", () => {
  it("renames the group and announces the change", async () => {
    const calls: unknown[] = [];
    const response = await groupUpdateRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1", {
        body: JSON.stringify({ name: "Yeni ad" }),
        method: "PATCH",
      }),
      "group-1",
      buildDependencies({
        emitMembersChanged: (_io: unknown, input: unknown) => {
          calls.push(input);
        },
        updateGroup: async (actorId: string, conversationId: string, patch: unknown) => {
          calls.push({ actorId, conversationId, patch });
          return conversation;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      { actorId: "user-1", conversationId: "group-1", patch: { name: "Yeni ad" } },
      { conversation },
    ]);
  });
});

describe("group add members route", () => {
  it("adds the members and announces them to their own rooms", async () => {
    const calls: unknown[] = [];
    const response = await groupAddMembersRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/members", {
        body: JSON.stringify({ userIds: ["user-4"] }),
        method: "POST",
      }),
      "group-1",
      buildDependencies({
        addMembers: async (actorId: string, conversationId: string, userIds: string[]) => {
          calls.push({ actorId, conversationId, userIds });
          return conversation;
        },
        emitMembersChanged: (_io: unknown, input: unknown) => {
          calls.push(input);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      { actorId: "user-1", conversationId: "group-1", userIds: ["user-4"] },
      { addedUserIds: ["user-4"], conversation },
    ]);
  });
});

describe("group remove member route", () => {
  it("removes the member, evicts their sockets and returns 204", async () => {
    const calls: unknown[] = [];
    const response = await groupRemoveMemberRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/members/user-3", {
        method: "DELETE",
      }),
      "group-1",
      "user-3",
      buildDependencies({
        emitMembersChanged: () => {
          calls.push("members_changed");
        },
        evictRemoved: (_io: unknown, input: unknown) => {
          calls.push(input);
        },
        removeMember: async (actorId: string, conversationId: string, targetUserId: string) => {
          calls.push({ actorId, conversationId, targetUserId });
        },
      }),
    );

    assert.equal(response.status, 204);
    assert.deepEqual(calls, [
      { actorId: "user-1", conversationId: "group-1", targetUserId: "user-3" },
      { conversationId: "group-1", userId: "user-3" },
      "members_changed",
    ]);
  });

  it("skips the members_changed broadcast when the group is gone", async () => {
    const calls: string[] = [];
    const response = await groupRemoveMemberRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/members/user-1", {
        method: "DELETE",
      }),
      "group-1",
      "user-1",
      buildDependencies({
        emitMembersChanged: () => {
          calls.push("members_changed");
        },
        loadConversationForBroadcast: async () => null,
      }),
    );

    assert.equal(response.status, 204);
    assert.deepEqual(calls, []);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="group create route|group update route|group add members route|group remove member route"
```

Expected: FAIL — `Cannot find module './route-logic'`.

- [ ] **Step 4: Write the route logic**

`apps/web/src/app/api/v1/dm/groups/route-logic.ts`:

```ts
import {
  GroupDMAddMembersRequestSchema,
  GroupDMCreateRequestSchema,
  GroupDMUpdateRequestSchema,
  type DMConversationDTO,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import {
  emitGroupConversationCreated,
  emitGroupMembersChanged,
  evictRemovedGroupMember,
  type GroupRealtimeServer,
} from "@/lib/dm/group-realtime";
import {
  addGroupMembers,
  createGroupConversation,
  removeGroupMember,
  updateGroupConversation,
} from "@/lib/dm/group-service";
import { getDirectMessageConversationForUser } from "@/lib/dm/service";
import { getIo } from "@/lib/socket/io";

export type GroupRouteDependencies = {
  addMembers: typeof addGroupMembers;
  authenticate(request: Request): Promise<string>;
  createGroup: typeof createGroupConversation;
  emitCreated: typeof emitGroupConversationCreated;
  emitMembersChanged: typeof emitGroupMembersChanged;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  evictRemoved: typeof evictRemovedGroupMember;
  getIo(): GroupRealtimeServer | null;
  /** Null once the group is gone — the last member left and it was deleted. */
  loadConversationForBroadcast(
    conversationId: string,
    userId: string,
  ): Promise<DMConversationDTO | null>;
  removeMember: typeof removeGroupMember;
  updateGroup: typeof updateGroupConversation;
};

const defaults: GroupRouteDependencies = {
  addMembers: addGroupMembers,
  authenticate: () => requireApiUserId(),
  createGroup: createGroupConversation,
  emitCreated: emitGroupConversationCreated,
  emitMembersChanged: emitGroupMembersChanged,
  enforceRateLimit: enforceApiRateLimit,
  evictRemoved: evictRemovedGroupMember,
  getIo: () => getIo() as GroupRealtimeServer | null,
  loadConversationForBroadcast: async (conversationId, userId) => {
    try {
      return await getDirectMessageConversationForUser(conversationId, userId);
    } catch {
      return null;
    }
  },
  removeMember: removeGroupMember,
  updateGroup: updateGroupConversation,
};

export async function groupCreateRoute(
  request: Request,
  dependencies: GroupRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:group:create");
    const input = await parseJsonBody(request, GroupDMCreateRequestSchema);
    const conversation = await dependencies.createGroup(userId, input);
    const io = dependencies.getIo();

    if (io) {
      dependencies.emitCreated(io, conversation);
    }

    return Response.json({ conversation }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function groupUpdateRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:group:update");
    const patch = await parseJsonBody(request, GroupDMUpdateRequestSchema);
    const conversation = await dependencies.updateGroup(userId, conversationId, patch);
    const io = dependencies.getIo();

    if (io) {
      dependencies.emitMembersChanged(io, { conversation });
    }

    return Response.json({ conversation });
  } catch (error) {
    return jsonError(error);
  }
}

export async function groupAddMembersRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:group:members");
    const { userIds } = await parseJsonBody(request, GroupDMAddMembersRequestSchema);
    const conversation = await dependencies.addMembers(userId, conversationId, userIds);
    const io = dependencies.getIo();

    if (io) {
      dependencies.emitMembersChanged(io, { addedUserIds: userIds, conversation });
    }

    return Response.json({ conversation });
  } catch (error) {
    return jsonError(error);
  }
}

export async function groupRemoveMemberRoute(
  request: Request,
  conversationId: string,
  targetUserId: string,
  dependencies: GroupRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:group:members");
    await dependencies.removeMember(userId, conversationId, targetUserId);
    const io = dependencies.getIo();

    if (io) {
      dependencies.evictRemoved(io, { conversationId, userId: targetUserId });
      // Read back as somebody who is still inside. Null means the group itself
      // is gone, and there is nobody left to tell.
      const conversation = await dependencies.loadConversationForBroadcast(
        conversationId,
        userId === targetUserId ? targetUserId : userId,
      );

      if (conversation) {
        dependencies.emitMembersChanged(io, { conversation });
      }
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
```

> **Not:** `@/lib/socket/io` yolunu doğrula. `apps/web/src/lib/socket/` altında `io`'yu döndüren mevcut yardımcıyı `grep -rn "export function getIo" apps/web/src/lib/socket` ile bul ve import'u ona göre düzelt. Yayınlar `io` yoksa sessizce atlanır — REST yanıtı soket bağlantısına bağlı olmamalı.

- [ ] **Step 5: Write the four route shells**

`apps/web/src/app/api/v1/dm/groups/route.ts`:

```ts
import { groupCreateRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request) {
  return groupCreateRoute(request);
}
```

`apps/web/src/app/api/v1/dm/groups/[conversationId]/route.ts`:

```ts
import { groupUpdateRoute } from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return groupUpdateRoute(request, conversationId);
}
```

`apps/web/src/app/api/v1/dm/groups/[conversationId]/members/route.ts`:

```ts
import { groupAddMembersRoute } from "../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return groupAddMembersRoute(request, conversationId);
}
```

`apps/web/src/app/api/v1/dm/groups/[conversationId]/members/[userId]/route.ts`:

```ts
import { groupRemoveMemberRoute } from "../../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ conversationId: string; userId: string }> },
) {
  const { conversationId, userId } = await context.params;
  return groupRemoveMemberRoute(request, conversationId, userId);
}
```

> Diğer rota kabuklarındaki `context.params` imzasını kontrol et (`apps/web/src/app/api/v1/dm/[conversationId]/route.ts`) ve o dosyadaki Promise/sync biçimini birebir kullan.

- [ ] **Step 6: Run to verify it passes**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="group create route|group update route|group add members route|group remove member route"
```

Expected: PASS, 6 test.

- [ ] **Step 7: Typecheck**

```bash
pnpm --filter @wizards/web typecheck
```

Expected: 0 hata.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/api-rate-limit.ts "apps/web/src/app/api/v1/dm/groups"
git commit -m "feat(api): add web group DM create, update and member routes"
```

---

## Task 10: Mobil grup rotaları

**Files:**

- Create: `apps/web/src/app/api/v1/mobile/dm/groups/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/dm/groups/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/dm/groups/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/dm/groups/[conversationId]/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/dm/groups/[conversationId]/members/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/dm/groups/[conversationId]/members/[userId]/route.ts`

**Interfaces:**

- Consumes: Task 9'un dört rota fonksiyonu.
- Produces: aynı dört fonksiyonun bearer-auth + `mobile:` rate-limit ile sarılmış hâli; yanıtlar `GroupDMConversationResponseSchema` ile `parse` edilir (mobil sözleşme sıkı).

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/v1/mobile/dm/groups/route-logic.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mobileGroupCreateRoute, mobileGroupRemoveMemberRoute } from "./route-logic";

const conversation = {
  iconUrl: null,
  id: "group-1",
  lastMessage: null,
  lastMessageAt: "2026-08-07T09:00:00.000Z",
  name: "Takım",
  ownerId: "user-1",
  participants: [],
  type: "GROUP_DM" as const,
};

function buildDependencies(overrides = {}) {
  return {
    addMembers: async () => conversation,
    authenticate: async () => "user-1",
    createGroup: async () => conversation,
    emitCreated: () => {},
    emitMembersChanged: () => {},
    enforceRateLimit: async () => {},
    evictRemoved: () => {},
    getIo: () => null,
    loadConversationForBroadcast: async () => conversation,
    removeMember: async () => {},
    updateGroup: async () => conversation,
    ...overrides,
  };
}

describe("mobile group routes", () => {
  it("uses the mobile rate limit bucket and returns a schema-parsed body", async () => {
    const actions: string[] = [];
    const response = await mobileGroupCreateRoute(
      new Request("https://whispr.test/api/v1/mobile/dm/groups", {
        body: JSON.stringify({ userIds: ["user-2", "user-3"] }),
        method: "POST",
      }),
      buildDependencies({
        enforceRateLimit: async (_id: string, action: string) => {
          actions.push(action);
        },
      }),
    );

    assert.equal(response.status, 201);
    assert.deepEqual(actions, ["mobile:dm:group:create"]);
    assert.deepEqual(await response.json(), { conversation });
  });

  it("returns 204 with no body when a member is removed", async () => {
    const response = await mobileGroupRemoveMemberRoute(
      new Request("https://whispr.test/api/v1/mobile/dm/groups/group-1/members/user-3", {
        method: "DELETE",
      }),
      "group-1",
      "user-3",
      buildDependencies(),
    );

    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="mobile group routes"
```

Expected: FAIL.

- [ ] **Step 3: Write the mobile route logic**

`apps/web/src/app/api/v1/mobile/dm/groups/route-logic.ts`:

```ts
import { GroupDMConversationResponseSchema } from "@wizards/types";

import {
  groupAddMembersRoute,
  groupCreateRoute,
  groupRemoveMemberRoute,
  groupUpdateRoute,
  type GroupRouteDependencies,
} from "@/app/api/v1/dm/groups/route-logic";
import { requireMobileApiUserId } from "@/lib/auth/api";

/**
 * The mobile client is a separate release train, so its bodies are re-parsed
 * against the shared schema before they leave: a server-side shape drift must
 * fail here, not on a phone that cannot be hot-fixed.
 */
async function parseGroupResponse(response: Response): Promise<Response> {
  if (response.status !== 200 && response.status !== 201) {
    return response;
  }

  const body = GroupDMConversationResponseSchema.parse(await response.json());
  return Response.json(body, { status: response.status });
}

function toMobileDependencies(
  dependencies: GroupRouteDependencies,
  action: "create" | "members" | "update",
): GroupRouteDependencies {
  return {
    ...dependencies,
    authenticate: (request) => requireMobileApiUserId(request),
    enforceRateLimit: (userId) =>
      dependencies.enforceRateLimit(userId, `mobile:dm:group:${action}`),
  };
}

export async function mobileGroupCreateRoute(
  request: Request,
  dependencies?: GroupRouteDependencies,
): Promise<Response> {
  const resolved = dependencies ? toMobileDependencies(dependencies, "create") : undefined;
  return await parseGroupResponse(await groupCreateRoute(request, resolved));
}

export async function mobileGroupUpdateRoute(
  request: Request,
  conversationId: string,
  dependencies?: GroupRouteDependencies,
): Promise<Response> {
  const resolved = dependencies ? toMobileDependencies(dependencies, "update") : undefined;
  return await parseGroupResponse(await groupUpdateRoute(request, conversationId, resolved));
}

export async function mobileGroupAddMembersRoute(
  request: Request,
  conversationId: string,
  dependencies?: GroupRouteDependencies,
): Promise<Response> {
  const resolved = dependencies ? toMobileDependencies(dependencies, "members") : undefined;
  return await parseGroupResponse(await groupAddMembersRoute(request, conversationId, resolved));
}

export async function mobileGroupRemoveMemberRoute(
  request: Request,
  conversationId: string,
  targetUserId: string,
  dependencies?: GroupRouteDependencies,
): Promise<Response> {
  const resolved = dependencies ? toMobileDependencies(dependencies, "members") : undefined;
  return await groupRemoveMemberRoute(request, conversationId, targetUserId, resolved);
}
```

> **Not:** `dependencies` verilmediğinde varsayılan yol session auth kullanır; bu yüzden dört mobil kabuk `dependencies`'i **her zaman** açıkça geçmelidir. Bir sonraki adımda kabuklar bunu `mobileGroupDefaults` üzerinden yapar.

Aynı dosyanın sonuna varsayılan mobil bağımlılık nesnesini ekle:

```ts
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  emitGroupConversationCreated,
  emitGroupMembersChanged,
  evictRemovedGroupMember,
  type GroupRealtimeServer,
} from "@/lib/dm/group-realtime";
import {
  addGroupMembers,
  createGroupConversation,
  removeGroupMember,
  updateGroupConversation,
} from "@/lib/dm/group-service";
import { getDirectMessageConversationForUser } from "@/lib/dm/service";
import { getIo } from "@/lib/socket/io";

export const mobileGroupDefaults: GroupRouteDependencies = {
  addMembers: addGroupMembers,
  authenticate: (request) => requireMobileApiUserId(request),
  createGroup: createGroupConversation,
  emitCreated: emitGroupConversationCreated,
  emitMembersChanged: emitGroupMembersChanged,
  enforceRateLimit: enforceApiRateLimit,
  evictRemoved: evictRemovedGroupMember,
  getIo: () => getIo() as GroupRealtimeServer | null,
  loadConversationForBroadcast: async (conversationId, userId) => {
    try {
      return await getDirectMessageConversationForUser(conversationId, userId);
    } catch {
      return null;
    }
  },
  removeMember: removeGroupMember,
  updateGroup: updateGroupConversation,
};
```

- [ ] **Step 4: Write the four mobile route shells**

`apps/web/src/app/api/v1/mobile/dm/groups/route.ts`:

```ts
import { mobileGroupCreateRoute, mobileGroupDefaults } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request) {
  return mobileGroupCreateRoute(request, mobileGroupDefaults);
}
```

`apps/web/src/app/api/v1/mobile/dm/groups/[conversationId]/route.ts`:

```ts
import { mobileGroupDefaults, mobileGroupUpdateRoute } from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return mobileGroupUpdateRoute(request, conversationId, mobileGroupDefaults);
}
```

`apps/web/src/app/api/v1/mobile/dm/groups/[conversationId]/members/route.ts`:

```ts
import { mobileGroupAddMembersRoute, mobileGroupDefaults } from "../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return mobileGroupAddMembersRoute(request, conversationId, mobileGroupDefaults);
}
```

`apps/web/src/app/api/v1/mobile/dm/groups/[conversationId]/members/[userId]/route.ts`:

```ts
import { mobileGroupDefaults, mobileGroupRemoveMemberRoute } from "../../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ conversationId: string; userId: string }> },
) {
  const { conversationId, userId } = await context.params;
  return mobileGroupRemoveMemberRoute(request, conversationId, userId, mobileGroupDefaults);
}
```

- [ ] **Step 5: Run the whole web suite**

```bash
pnpm --filter @wizards/web test
```

Expected: PASS, hiçbir mevcut test kırılmamış.

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm --filter @wizards/web typecheck
```

```bash
git add "apps/web/src/app/api/v1/mobile/dm/groups"
git commit -m "feat(api): mirror the group DM routes on the mobile surface"
```

---

## Task 11: Grup detaylarını mobil detay servisinde aç

`getMobileDMDetails` bugün "aktör olmayan tek katılımcı"yı arıyor ve bulamazsa 404 atıyor — grupta **her zaman** patlar.

**Files:**

- Modify: `apps/web/src/lib/dm/mobile-details-service.ts`
- Modify: `apps/web/src/lib/dm/mobile-details-service.test.ts`
- Modify: `packages/types/src/mobile-social.ts` (`MobileDMDetailsResponseSchema`)

**Interfaces:**

- Produces: `MobileDMDetailsResponseSchema` iki alan daha taşır — `members: Array<{ avatarUrl, displayName, id, isOwner, status, username }>` ve `ownerId: string | null`. 1:1 yanıtındaki `participant` alanı **korunur**; grupta `null` olur.

- [ ] **Step 1: Widen the response schema**

`packages/types/src/mobile-social.ts`, `MobileDMDetailsResponseSchema` içine:

```ts
    members: z
      .array(
        z
          .object({
            avatarUrl: z.string().url().max(2048).nullable(),
            displayName: z.string().max(100).nullable(),
            id: MobileBoundedIdSchema,
            isOwner: z.boolean(),
            status: z.string().max(32),
            username: z.string().max(100),
          })
          .strict(),
      )
      .max(32)
      .default([]),
    ownerId: MobileBoundedIdSchema.nullable().default(null),
```

Aynı şemada `participant` alanını `.nullable()` yap — grup yanıtında karşı taraf yoktur.

- [ ] **Step 2: Write the failing test**

`apps/web/src/lib/dm/mobile-details-service.test.ts` sonuna:

```ts
describe("getMobileDMDetails for a group", () => {
  it("returns every member instead of throwing PARTICIPANT_NOT_FOUND", async () => {
    const result = await getMobileDMDetails(
      { conversationId: "group-1", limit: 30, userId: "user-1" },
      {
        countMedia: async () => 0,
        getConversation: async () => ({
          iconUrl: null,
          id: "group-1",
          lastMessage: null,
          lastMessageAt: "2026-08-07T09:00:00.000Z",
          name: "Takım",
          ownerId: "user-1",
          participants: [
            {
              avatarUrl: null,
              customStatus: null,
              displayName: "A",
              muted: false,
              presence: { customStatus: null, status: "ONLINE" },
              status: "ONLINE",
              unreadCount: 0,
              userId: "user-1",
              username: "a",
            },
            {
              avatarUrl: null,
              customStatus: null,
              displayName: "B",
              muted: false,
              presence: { customStatus: null, status: "OFFLINE" },
              status: "OFFLINE",
              unreadCount: 0,
              userId: "user-2",
              username: "b",
            },
          ],
          type: "GROUP_DM",
        }),
        listMessages: async () => ({ messages: [], nextCursor: null }),
        listMutualServers: async () => [],
      } as never,
    );

    assert.equal(result.participant, null);
    assert.equal(result.ownerId, "user-1");
    assert.deepEqual(
      result.members.map((member) => ({ id: member.id, isOwner: member.isOwner })),
      [
        { id: "user-1", isOwner: true },
        { id: "user-2", isOwner: false },
      ],
    );
    // A group has no single counterpart, so there is nothing to compute mutual
    // servers against.
    assert.deepEqual(result.mutualServers, []);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="getMobileDMDetails for a group"
```

Expected: FAIL — `PARTICIPANT_NOT_FOUND`.

- [ ] **Step 4: Add the group branch**

`apps/web/src/lib/dm/mobile-details-service.ts`, `getMobileDMDetails` gövdesini şununla değiştir:

```ts
export async function getMobileDMDetails(
  input: { conversationId: string; cursor?: string | undefined; limit: number; userId: string },
  dependencies: MobileDMDetailsServiceDependencies = defaultDependencies,
) {
  const conversation = await dependencies.getConversation(input.conversationId, input.userId);
  const isGroup = conversation.type === "GROUP_DM";
  const participant = conversation.participants.find((entry) => entry.userId !== input.userId);

  if (!isGroup && !participant) {
    throw new ApiError("Conversation participant not found", 404, "PARTICIPANT_NOT_FOUND");
  }

  const [mutualServers, page, mediaCount] = await Promise.all([
    // A group has no single counterpart to share servers with.
    isGroup || !participant
      ? Promise.resolve([])
      : dependencies.listMutualServers(input.userId, participant.userId, { limit: 12 }),
    dependencies.listMessages(input.userId, input.conversationId, input.cursor, input.limit),
    dependencies.countMedia(input.conversationId),
  ]);

  return {
    mediaCount,
    members: conversation.participants.map((entry) => ({
      avatarUrl: entry.avatarUrl,
      displayName: entry.displayName,
      id: entry.userId,
      isOwner: conversation.ownerId === entry.userId,
      status: entry.status,
      username: entry.username,
    })),
    mutualServers,
    nextCursor: page.nextCursor,
    ownerId: conversation.ownerId,
    participant:
      isGroup || !participant
        ? null
        : {
            avatarUrl: participant.avatarUrl,
            customStatus: participant.customStatus,
            displayName: participant.displayName,
            id: participant.userId,
            status: participant.status,
            username: participant.username,
          },
    sharedAttachments: getDmSharedAttachmentSummary(
      page.messages.map((message) => ({
        attachments: message.attachments.map(({ height, width, ...attachment }) => ({
          ...attachment,
          ...(height === null ? {} : { height }),
          ...(width === null ? {} : { width }),
        })),
        createdAt: message.createdAt,
        deletedAt: message.deletedAt,
        id: message.id,
      })),
      {
        fileLimit: Math.min(input.limit, 30),
        mediaLimit: Math.min(input.limit, 30),
      },
    ),
  };
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/types test
```

Expected: ikisi de PASS. Mevcut 1:1 detay testleri `participant` alanını hâlâ dolu görmeli.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/dm/mobile-details-service.ts apps/web/src/lib/dm/mobile-details-service.test.ts packages/types/src/mobile-social.ts
git commit -m "fix(dm): stop 404ing on group conversation details"
```

---

## Task 12: Grup fotoğrafı yükleme uçları

**Files:**

- Modify: `apps/web/src/app/api/uploadthing/core.ts:191-225`
- Modify: `apps/web/src/app/api/uploadthing/core.test.ts`
- Modify: `packages/types/src/mobile-workspace-management.ts:32-37`

**Interfaces:**

- Produces: `uploadRouter.groupIconUploader` (oturum + rate limit, `{ url }` döner); `MobileMediaUploadPurposeSchema` artık `"group-icon"` içerir.

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/uploadthing/core.test.ts`, mevcut `serverIconUploader` testinin yanına aynı biçimde:

```ts
it("exposes a group icon uploader with the same shape as the server icon one", () => {
  assert.ok("groupIconUploader" in uploadRouter);
});
```

Ve `packages/types/src/group-dm.test.ts` sonuna:

```ts
describe("mobile media upload purposes", () => {
  it("includes group-icon so a group photo can be re-uploaded after creation", async () => {
    const { MobileMediaUploadPurposeSchema } = await import("./mobile-workspace-management");
    assert.ok(MobileMediaUploadPurposeSchema.options.includes("group-icon"));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="group icon uploader"
```

```bash
pnpm --filter @wizards/types test
```

Expected: ikisi de FAIL.

- [ ] **Step 3: Add the uploader**

`apps/web/src/app/api/uploadthing/core.ts`, `serverIconUploader` girdisinin hemen ardına:

```ts
  groupIconUploader: f({
    image: {
      maxFileCount: 1,
      maxFileSize: "4MB",
    },
  })
    .middleware(async () => {
      const { userId } = await requireUploadUser();

      try {
        const allowed = await checkRateLimit(
          getRedisRate(),
          `rate:upload:group-icon:${userId}`,
          10,
          300,
        );

        if (!allowed) {
          throw new UploadThingError("Too many image uploads. Please try again shortly.");
        }
      } catch (error) {
        if (error instanceof UploadThingError) {
          throw error;
        }
        logError("[upload] Group icon rate limit unavailable", error);
        throw new UploadThingError("Upload checks are temporarily unavailable. Please try again shortly.");
      }

      return { userId };
    })
    // Deliberately owner-free: at creation time the group does not exist yet,
    // so there is nothing to check ownership against. The URL only becomes a
    // group's photo when POST /groups or PATCH /groups/:id accepts it.
    .onUploadComplete(async ({ file }) => {
      return {
        url: file.ufsUrl,
      };
    }),
```

- [ ] **Step 4: Add the mobile purpose**

`packages/types/src/mobile-workspace-management.ts`:

```ts
export const MobileMediaUploadPurposeSchema = z.enum([
  "feedback-attachment",
  "group-icon",
  "profile-avatar",
  "profile-banner",
  "server-icon",
]);
```

`MobileMediaUploadIntentSchema` discriminated union'ına `"group-icon"` kolunu, mevcut `"server-icon"` kolunun biçimini izleyerek ekle; kol `conversationId: MobileBoundedIdSchema` taşımalı.

`apps/web/src/lib/mobile/mobile-media-upload-service.ts` içindeki `authorizeMobileMediaUpload`'a `"group-icon"` kolu için sahiplik kontrolü ekle:

```ts
    case "group-icon": {
      const conversation = await prisma.dMConversation.findUnique({
        select: { ownerId: true, type: true },
        where: { id: intent.conversationId },
      });

      if (conversation?.type !== "GROUP_DM" || conversation.ownerId !== userId) {
        throw new UploadThingError("You cannot change this group's photo.");
      }

      return { userId };
    }
```

> Mevcut `switch`/`if` yapısını oku ve aynı biçimi kullan; yukarıdaki blok o dosyadaki desene uyarlanmalı.

- [ ] **Step 5: Run tests and typecheck**

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web typecheck
```

Expected: hepsi yeşil.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/uploadthing/core.ts apps/web/src/app/api/uploadthing/core.test.ts packages/types/src/mobile-workspace-management.ts packages/types/src/group-dm.test.ts apps/web/src/lib/mobile/mobile-media-upload-service.ts
git commit -m "feat(upload): accept group icons before and after group creation"
```

---

# FAZ 5 — Mobil

## Task 13: Metinler, rota ve gelen kutusu `+` butonu

**Files:**

- Modify: `apps/mobile/src/locale/mobile-copy.ts` (tr bloğu ~satır 223, en bloğu ~satır 2523)
- Modify: `apps/mobile/src/app/screens/dm-inbox.tsx:70-98`
- Modify: `apps/mobile/src/app/screens/dm-screen.tsx:168-178`
- Modify: `apps/mobile/src/navigation/mobile-navigation-types.ts:12-40`
- Modify: `apps/mobile/src/navigation/mobile-linking.ts:107-111`
- Modify: `apps/mobile/src/app/screens/dm-screen.styles.ts`
- Create: `apps/mobile/component-tests/mobile-group-create.test.tsx`

**Interfaces:**

- Produces:
  - `DMInboxHeader` yeni prop: `onCreateGroup(): void`
  - Rota: `GroupCreate: undefined` (`MobileRootStackParamList`)
  - Deep link: `channels/@me/new-group`
  - Kopya anahtarları: `dmCreateGroupAction`, `groupCreateTitle`, `groupCreateMembersStepTitle`, `groupCreateIdentityStepTitle`, `groupCreateNameLabel`, `groupCreateNamePlaceholder`, `groupCreateNameHint`, `groupCreatePhotoAction`, `groupCreateNextAction`, `groupCreateSubmitAction`, `groupCreateCounter`, `groupCreateLimitReached`, `groupCreateMinimumHint`, `groupMembersTitle`, `groupAddMemberAction`, `groupRemoveMemberAction`, `groupLeaveAction`, `groupLeaveConfirmTitle`, `groupOwnerBadge`, `groupSystemCreated`, `groupSystemAdded`, `groupSystemRemoved`, `groupSystemLeft`, `groupSystemNameChanged`, `groupSystemIconChanged`, `groupSystemActorSelf`

- [ ] **Step 1: Write the failing test**

`apps/mobile/component-tests/mobile-group-create.test.tsx`:

```tsx
import { fireEvent } from "@testing-library/react-native";
import React from "react";

import { DMInboxHeader } from "../src/app/screens/dm-inbox";
import { renderWithMobileTheme } from "./render-with-mobile-theme";

describe("DM inbox header group button", () => {
  it("shows a plus button on the conversations tab and calls onCreateGroup", async () => {
    const onCreateGroup = jest.fn();
    const screen = await renderWithMobileTheme(
      <DMInboxHeader onCompose={jest.fn()} onCreateGroup={onCreateGroup} segment="conversations" />,
    );

    await fireEvent.press(screen.getByTestId("mobile-dm-create-group-button"));

    expect(onCreateGroup).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing compose button untouched", async () => {
    const onCompose = jest.fn();
    const screen = await renderWithMobileTheme(
      <DMInboxHeader onCompose={onCompose} onCreateGroup={jest.fn()} segment="conversations" />,
    );

    await fireEvent.press(screen.getByTestId("mobile-dm-compose-button"));

    expect(onCompose).toHaveBeenCalledTimes(1);
  });

  it("hides the group button on the friends tab", async () => {
    const screen = await renderWithMobileTheme(
      <DMInboxHeader onCompose={jest.fn()} onCreateGroup={jest.fn()} segment="friends" />,
    );

    expect(screen.queryByTestId("mobile-dm-create-group-button")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/mobile && npx jest component-tests/mobile-group-create.test.tsx
```

Expected: FAIL — `mobile-dm-create-group-button` bulunamadı.

- [ ] **Step 3: Add the copy keys**

`apps/mobile/src/locale/mobile-copy.ts`, Türkçe bloğunda `dmComposeAction` satırının yanına:

```ts
    dmCreateGroupAction: "Grup oluştur",
    groupAddMemberAction: "Üye ekle",
    groupCreateCounter: "{count}/32",
    groupCreateIdentityStepTitle: "Grup bilgileri",
    groupCreateLimitReached: "En fazla 32 kişi seçebilirsin",
    groupCreateMembersStepTitle: "Üye seç",
    groupCreateMinimumHint: "En az 2 arkadaş seç",
    groupCreateNameHint: "Boş bırakırsan grup adı üyelerin adlarından oluşur",
    groupCreateNameLabel: "Grup adı",
    groupCreateNamePlaceholder: "Grup adı (isteğe bağlı)",
    groupCreateNextAction: "İleri",
    groupCreatePhotoAction: "Grup fotoğrafı ekle",
    groupCreateSubmitAction: "Oluştur",
    groupCreateTitle: "Yeni grup",
    groupLeaveAction: "Gruptan ayrıl",
    groupLeaveConfirmTitle: "Gruptan ayrılmak istiyor musun?",
    groupMembersTitle: "Üyeler",
    groupOwnerBadge: "Yönetici",
    groupRemoveMemberAction: "Gruptan çıkar",
    groupSystemActorSelf: "Sen",
    groupSystemAdded: "{actor}, {targets} kişisini ekledi",
    groupSystemCreated: "{actor} grubu oluşturdu",
    groupSystemIconChanged: "{actor} grup fotoğrafını değiştirdi",
    groupSystemLeft: "{actor} gruptan ayrıldı",
    groupSystemNameChanged: "{actor} grup adını \"{value}\" olarak değiştirdi",
    groupSystemRemoved: "{actor}, {targets} kişisini çıkardı",
```

İngilizce bloğunda aynı anahtarlar:

```ts
    dmCreateGroupAction: "Create group",
    groupAddMemberAction: "Add member",
    groupCreateCounter: "{count}/32",
    groupCreateIdentityStepTitle: "Group details",
    groupCreateLimitReached: "You can pick at most 32 people",
    groupCreateMembersStepTitle: "Pick members",
    groupCreateMinimumHint: "Pick at least 2 friends",
    groupCreateNameHint: "Leave it blank and the title uses the members' names",
    groupCreateNameLabel: "Group name",
    groupCreateNamePlaceholder: "Group name (optional)",
    groupCreateNextAction: "Next",
    groupCreatePhotoAction: "Add a group photo",
    groupCreateSubmitAction: "Create",
    groupCreateTitle: "New group",
    groupLeaveAction: "Leave group",
    groupLeaveConfirmTitle: "Leave this group?",
    groupMembersTitle: "Members",
    groupOwnerBadge: "Admin",
    groupRemoveMemberAction: "Remove from group",
    groupSystemActorSelf: "You",
    groupSystemAdded: "{actor} added {targets}",
    groupSystemCreated: "{actor} created the group",
    groupSystemIconChanged: "{actor} changed the group photo",
    groupSystemLeft: "{actor} left the group",
    groupSystemNameChanged: "{actor} renamed the group to \"{value}\"",
    groupSystemRemoved: "{actor} removed {targets}",
```

- [ ] **Step 4: Add the button to the header**

`apps/mobile/src/app/screens/dm-inbox.tsx`, `DMInboxHeader`'ı şununla değiştir:

```tsx
export function DMInboxHeader({
  onCompose,
  onCreateGroup,
  segment,
}: {
  onCompose(): void;
  onCreateGroup(): void;
  segment: MobileDMInboxSegment;
}) {
  const theme = useTheme();
  const styles = useDmScreenStyles();
  const composesChat = segment === "conversations";
  return (
    <View style={styles.dmInboxHeader}>
      <Text style={styles.dmInboxTitle}>{copy.dmInboxTitle}</Text>
      <View style={styles.dmInboxHeaderActions}>
        {/*
         * Only the conversations tab can start a group: on Friends and Requests
         * the single FAB already means "add a person", and a second glyph there
         * would read as a second way to do the same thing.
         */}
        {composesChat ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.dmCreateGroupAction}
            onPress={onCreateGroup}
            testID="mobile-dm-create-group-button"
            style={styles.dmComposeButton}
          >
            <MobileLineIcon color={theme.messaging.surface} name="plus" size={19} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={composesChat ? copy.dmComposeAction : copy.dmAddFriendAction}
          onPress={onCompose}
          testID="mobile-dm-compose-button"
          style={styles.dmComposeButton}
        >
          <MobileLineIcon
            color={theme.messaging.surface}
            name={composesChat ? "edit" : "person-plus"}
            size={19}
          />
        </Pressable>
      </View>
    </View>
  );
}
```

`apps/mobile/src/app/screens/dm-screen.styles.ts` içine yeni stil ekle (mevcut `dmInboxHeader` tanımının yanına, aynı spacing token'larını kullanarak):

```ts
    dmInboxHeaderActions: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
```

- [ ] **Step 5: Wire the route**

`apps/mobile/src/navigation/mobile-navigation-types.ts`, `MobileRootStackParamList` içine:

```ts
GroupCreate: undefined;
```

`apps/mobile/src/navigation/mobile-linking.ts`, `screens` haritasına `DirectMessage` satırının yanına:

```ts
        GroupCreate: "channels/@me/new-group",
```

Kök stack'e ekran **kaydı bu görevde yapılmaz** — `GroupCreateScreen` bileşeni Task 15'te yazılıyor ve yer tutucu ekran yazmak yasak. Bu görevde yalnızca tip ve deep-link kaydı yapılır; `mobileNavigationRef.navigate("GroupCreate")` çağrısı tip olarak geçerlidir ve rota Task 15'te kaydedilene kadar çalışma zamanında sessizce yok sayılır.

`apps/mobile/src/app/screens/dm-screen.tsx`, `DMInboxHeader` kullanımını güncelle:

```tsx
<DMInboxHeader
  onCompose={() => setInboxSegment(inboxSegment === "conversations" ? "friends" : "requests")}
  onCreateGroup={() => {
    if (mobileNavigationRef.isReady()) {
      mobileNavigationRef.navigate("GroupCreate");
    }
  }}
  segment={inboxSegment}
/>
```

- [ ] **Step 6: Run the test**

```bash
cd apps/mobile && npx jest component-tests/mobile-group-create.test.tsx
```

Expected: PASS, 3 test.

- [ ] **Step 7: Typecheck**

```bash
pnpm --filter @wizards/mobile typecheck
```

Expected: 0 hata (`GroupCreate` ekranı henüz kayıtlı değilse rota kaydı adımını Task 14 ile tamamla).

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/locale/mobile-copy.ts apps/mobile/src/app/screens/dm-inbox.tsx apps/mobile/src/app/screens/dm-screen.tsx apps/mobile/src/app/screens/dm-screen.styles.ts apps/mobile/src/navigation apps/mobile/component-tests/mobile-group-create.test.tsx
git commit -m "feat(mobile): add a group create entry point to the DM inbox header"
```

---

## Task 14: Grup oluşturma seçim modeli (mobil + web ortak)

Ekranın tüm kuralları (seçim, sınır, aşama geçişi) React'ten bağımsız, saf fonksiyonlarda yaşar — böylece Node testiyle doğrulanır ve UI testleri yalnızca bağlantıyı kontrol eder.

**Modül `@wizards/types` içinde yaşar**, `apps/mobile` içinde değil: hem mobil ekran (Task 15) hem web diyaloğu (Task 18) aynı kuralları uygular ve iki ayrı uygulama iki ayrı sapma demektir. Saf TypeScript, React bağımlılığı yok — paylaşılan pakete taşınması bedava.

**Files:**

- Create: `packages/types/src/group-dm-selection.ts`
- Create: `packages/types/src/group-dm-selection.test.ts`
- Modify: `packages/types/src/index.ts` (re-export)

**Interfaces:**

- Consumes: `GROUP_DM_MAX_PARTICIPANTS`, `GROUP_DM_MIN_PARTICIPANTS` (Task 3).
- Produces:
  - `type GroupCreateState = { name: string; selectedUserIds: readonly string[]; step: "members" | "identity" }`
  - `createInitialGroupCreateState(): GroupCreateState`
  - `toggleGroupMember(state, userId): GroupCreateState`
  - `canAdvanceToIdentity(state): boolean`
  - `canSubmitGroup(state): boolean`
  - `isGroupSelectionFull(state): boolean`
  - `getGroupSelectionCount(state): number` — kurucu dahil
  - `toGroupCreateRequest(state, iconUrl: string | null): { iconUrl?: string; name?: string; userIds: string[] }`

- [ ] **Step 1: Write the failing tests**

`packages/types/src/group-dm-selection.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canAdvanceToIdentity,
  canSubmitGroup,
  createInitialGroupCreateState,
  getGroupSelectionCount,
  isGroupSelectionFull,
  toGroupCreateRequest,
  toggleGroupMember,
} from "./group-dm-selection";

describe("group create model", () => {
  it("starts on the members step with nothing selected", () => {
    const state = createInitialGroupCreateState();
    assert.deepEqual(state, { name: "", selectedUserIds: [], step: "members" });
  });

  it("counts the creator in the selection total", () => {
    const state = toggleGroupMember(createInitialGroupCreateState(), "user-2");
    assert.equal(getGroupSelectionCount(state), 2);
  });

  it("toggles a member off when picked twice", () => {
    let state = toggleGroupMember(createInitialGroupCreateState(), "user-2");
    state = toggleGroupMember(state, "user-2");
    assert.deepEqual(state.selectedUserIds, []);
  });

  it("refuses to advance with fewer than two friends picked", () => {
    const state = toggleGroupMember(createInitialGroupCreateState(), "user-2");
    assert.equal(canAdvanceToIdentity(state), false);
  });

  it("allows advancing at two friends, which is a three-person group", () => {
    let state = toggleGroupMember(createInitialGroupCreateState(), "user-2");
    state = toggleGroupMember(state, "user-3");
    assert.equal(canAdvanceToIdentity(state), true);
  });

  it("locks the selection at 31 friends because the creator is the 32nd", () => {
    let state = createInitialGroupCreateState();
    for (let index = 0; index < 31; index += 1) {
      state = toggleGroupMember(state, `user-${index + 2}`);
    }

    assert.equal(getGroupSelectionCount(state), 32);
    assert.equal(isGroupSelectionFull(state), true);

    const overflowed = toggleGroupMember(state, "user-99");
    assert.equal(overflowed.selectedUserIds.length, 31);
  });

  it("still allows deselecting once the selection is full", () => {
    let state = createInitialGroupCreateState();
    for (let index = 0; index < 31; index += 1) {
      state = toggleGroupMember(state, `user-${index + 2}`);
    }

    const reduced = toggleGroupMember(state, "user-2");
    assert.equal(reduced.selectedUserIds.length, 30);
  });

  it("omits a blank name from the request so the server stores null", () => {
    let state = toggleGroupMember(createInitialGroupCreateState(), "user-2");
    state = toggleGroupMember(state, "user-3");
    state = { ...state, name: "   " };

    assert.deepEqual(toGroupCreateRequest(state, null), {
      userIds: ["user-2", "user-3"],
    });
  });

  it("carries a trimmed name and an icon when both are present", () => {
    let state = toggleGroupMember(createInitialGroupCreateState(), "user-2");
    state = toggleGroupMember(state, "user-3");
    state = { ...state, name: "  Takım  " };

    assert.deepEqual(toGroupCreateRequest(state, "https://utfs.io/f/a.png"), {
      iconUrl: "https://utfs.io/f/a.png",
      name: "Takım",
      userIds: ["user-2", "user-3"],
    });
  });

  it("cannot submit from the members step", () => {
    let state = toggleGroupMember(createInitialGroupCreateState(), "user-2");
    state = toggleGroupMember(state, "user-3");
    assert.equal(canSubmitGroup(state), false);
    assert.equal(canSubmitGroup({ ...state, step: "identity" }), true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @wizards/types test
```

Expected: FAIL — modül yok.

- [ ] **Step 3: Write the model**

`packages/types/src/group-dm-selection.ts`:

```ts
import { GROUP_DM_MAX_PARTICIPANTS, GROUP_DM_MIN_PARTICIPANTS } from "./group-dm";

export type GroupCreateStep = "identity" | "members";

export type GroupCreateState = {
  readonly name: string;
  readonly selectedUserIds: readonly string[];
  readonly step: GroupCreateStep;
};

/** The creator is always in the group but never in the picker. */
const IMPLICIT_CREATOR_COUNT = 1;
const MAX_SELECTABLE = GROUP_DM_MAX_PARTICIPANTS - IMPLICIT_CREATOR_COUNT;
const MIN_SELECTABLE = GROUP_DM_MIN_PARTICIPANTS - IMPLICIT_CREATOR_COUNT;

export function createInitialGroupCreateState(): GroupCreateState {
  return { name: "", selectedUserIds: [], step: "members" };
}

export function getGroupSelectionCount(state: GroupCreateState): number {
  return state.selectedUserIds.length + IMPLICIT_CREATOR_COUNT;
}

export function isGroupSelectionFull(state: GroupCreateState): boolean {
  return state.selectedUserIds.length >= MAX_SELECTABLE;
}

export function toggleGroupMember(state: GroupCreateState, userId: string): GroupCreateState {
  if (state.selectedUserIds.includes(userId)) {
    return {
      ...state,
      selectedUserIds: state.selectedUserIds.filter((selected) => selected !== userId),
    };
  }

  // Deselection above still works because it returns before this guard.
  if (isGroupSelectionFull(state)) {
    return state;
  }

  return { ...state, selectedUserIds: [...state.selectedUserIds, userId] };
}

export function canAdvanceToIdentity(state: GroupCreateState): boolean {
  return state.selectedUserIds.length >= MIN_SELECTABLE;
}

export function canSubmitGroup(state: GroupCreateState): boolean {
  return state.step === "identity" && canAdvanceToIdentity(state);
}

export function toGroupCreateRequest(
  state: GroupCreateState,
  iconUrl: string | null,
): { iconUrl?: string; name?: string; userIds: string[] } {
  const name = state.name.trim();

  return {
    ...(iconUrl ? { iconUrl } : {}),
    ...(name ? { name } : {}),
    userIds: [...state.selectedUserIds],
  };
}
```

- [ ] **Step 4: Re-export from the package entry point**

`packages/types/src/index.ts`:

```ts
export * from "./group-dm-selection";
```

- [ ] **Step 5: Run to verify it passes**

```bash
pnpm --filter @wizards/types test
```

Expected: PASS, 10 test.

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @wizards/types typecheck
```

Expected: 0 hata.

---

## Task 15: Grup oluşturma ekranı ve API istemcisi

**Files:**

- Create: `apps/mobile/src/dm/mobile-group-client.ts`
- Create: `apps/mobile/src/app/screens/group-create-screen.tsx`
- Modify: `apps/mobile/component-tests/mobile-group-create.test.tsx`
- Modify: rota kaydı (Task 13 Step 5'te tespit edilen dosya)

**Interfaces:**

- Consumes: Task 14 modeli; Task 10 mobil uçları; `useMobileFriendsQuery` (`apps/mobile/src/social/mobile-social-query.ts`); `mobileQueryKeys.dmConversations()` (`apps/mobile/src/realtime/realtime-query-bridge.ts`'in import ettiği modül).
- Produces:
  - `createMobileGroup(apiClient, input): Promise<DMConversationDTO>`
  - `addMobileGroupMembers(apiClient, conversationId, userIds): Promise<DMConversationDTO>`
  - `updateMobileGroup(apiClient, conversationId, patch): Promise<DMConversationDTO>`
  - `removeMobileGroupMember(apiClient, conversationId, userId): Promise<void>`
  - `useMobileGroupMutations(apiClient)` — dört mutation, hepsi başarıda `dmConversations` invalidate eder
  - `GroupCreateScreen` bileşeni

- [ ] **Step 1: Write the failing screen tests**

`apps/mobile/component-tests/mobile-group-create.test.tsx` sonuna:

```tsx
import { GroupCreateScreen } from "../src/app/screens/group-create-screen";

const friends = [
  { avatarUrl: null, displayName: "Ada", id: "user-2", status: "ONLINE", username: "ada" },
  { avatarUrl: null, displayName: "Bora", id: "user-3", status: "OFFLINE", username: "bora" },
  { avatarUrl: null, displayName: "Cem", id: "user-4", status: "ONLINE", username: "cem" },
];

describe("GroupCreateScreen", () => {
  it("keeps Next disabled until two friends are picked", async () => {
    const screen = await renderWithMobileTheme(
      <GroupCreateScreen friends={friends} onCancel={jest.fn()} onCreated={jest.fn()} />,
    );

    expect(screen.getByTestId("mobile-group-create-next").props.accessibilityState.disabled).toBe(
      true,
    );

    await fireEvent.press(screen.getByTestId("mobile-group-create-friend-user-2"));
    expect(screen.getByTestId("mobile-group-create-next").props.accessibilityState.disabled).toBe(
      true,
    );

    await fireEvent.press(screen.getByTestId("mobile-group-create-friend-user-3"));
    expect(screen.getByTestId("mobile-group-create-next").props.accessibilityState.disabled).toBe(
      false,
    );
  });

  it("moves to the identity step and back without losing the selection", async () => {
    const screen = await renderWithMobileTheme(
      <GroupCreateScreen friends={friends} onCancel={jest.fn()} onCreated={jest.fn()} />,
    );

    await fireEvent.press(screen.getByTestId("mobile-group-create-friend-user-2"));
    await fireEvent.press(screen.getByTestId("mobile-group-create-friend-user-3"));
    await fireEvent.press(screen.getByTestId("mobile-group-create-next"));

    expect(screen.getByTestId("mobile-group-create-name-input")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("mobile-group-create-back"));

    expect(screen.getByTestId("mobile-group-create-selected-user-2")).toBeTruthy();
    expect(screen.getByTestId("mobile-group-create-selected-user-3")).toBeTruthy();
  });

  it("submits the trimmed name with the selected ids", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ id: "group-1" });
    const onCreated = jest.fn();
    const screen = await renderWithMobileTheme(
      <GroupCreateScreen
        friends={friends}
        onCancel={jest.fn()}
        onCreated={onCreated}
        onSubmit={onSubmit}
      />,
    );

    await fireEvent.press(screen.getByTestId("mobile-group-create-friend-user-2"));
    await fireEvent.press(screen.getByTestId("mobile-group-create-friend-user-3"));
    await fireEvent.press(screen.getByTestId("mobile-group-create-next"));
    await fireEvent.changeText(screen.getByTestId("mobile-group-create-name-input"), "  Takım  ");
    await fireEvent.press(screen.getByTestId("mobile-group-create-submit"));

    expect(onSubmit).toHaveBeenCalledWith({ name: "Takım", userIds: ["user-2", "user-3"] });
    expect(onCreated).toHaveBeenCalledWith("group-1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/mobile && npx jest component-tests/mobile-group-create.test.tsx
```

Expected: FAIL — `GroupCreateScreen` yok.

- [ ] **Step 3: Write the API client**

`apps/mobile/src/dm/mobile-group-client.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GroupDMConversationResponseSchema,
  type DMConversationDTO,
  type GroupDMCreateRequest,
  type GroupDMUpdateRequest,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "../query/mobile-query-keys";

export async function createMobileGroup(
  apiClient: MobileApiClient,
  input: GroupDMCreateRequest,
): Promise<DMConversationDTO> {
  const body = await apiClient.post("/api/v1/mobile/dm/groups", input);
  return GroupDMConversationResponseSchema.parse(body).conversation;
}

export async function addMobileGroupMembers(
  apiClient: MobileApiClient,
  conversationId: string,
  userIds: readonly string[],
): Promise<DMConversationDTO> {
  const body = await apiClient.post(
    `/api/v1/mobile/dm/groups/${encodeURIComponent(conversationId)}/members`,
    { userIds: [...userIds] },
  );
  return GroupDMConversationResponseSchema.parse(body).conversation;
}

export async function updateMobileGroup(
  apiClient: MobileApiClient,
  conversationId: string,
  patch: GroupDMUpdateRequest,
): Promise<DMConversationDTO> {
  const body = await apiClient.patch(
    `/api/v1/mobile/dm/groups/${encodeURIComponent(conversationId)}`,
    patch,
  );
  return GroupDMConversationResponseSchema.parse(body).conversation;
}

export async function removeMobileGroupMember(
  apiClient: MobileApiClient,
  conversationId: string,
  userId: string,
): Promise<void> {
  await apiClient.delete(
    `/api/v1/mobile/dm/groups/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}`,
  );
}

export function useMobileGroupMutations(apiClient: MobileApiClient) {
  const queryClient = useQueryClient();
  // Every group mutation reshapes the inbox row (title, avatar stack, member
  // count), so the conversation list must be refetched or the row goes stale.
  const invalidateConversations = () =>
    queryClient.invalidateQueries({ queryKey: mobileQueryKeys.dmConversations() });

  return {
    addMembers: useMutation({
      mutationFn: (input: { conversationId: string; userIds: string[] }) =>
        addMobileGroupMembers(apiClient, input.conversationId, input.userIds),
      onSuccess: invalidateConversations,
    }),
    create: useMutation({
      mutationFn: (input: GroupDMCreateRequest) => createMobileGroup(apiClient, input),
      onSuccess: invalidateConversations,
    }),
    removeMember: useMutation({
      mutationFn: (input: { conversationId: string; userId: string }) =>
        removeMobileGroupMember(apiClient, input.conversationId, input.userId),
      onSuccess: invalidateConversations,
    }),
    update: useMutation({
      mutationFn: (input: { conversationId: string; patch: GroupDMUpdateRequest }) =>
        updateMobileGroup(apiClient, input.conversationId, input.patch),
      onSuccess: invalidateConversations,
    }),
  };
}
```

> `MobileApiClient`'ın gerçek metot adlarını (`post`/`patch`/`delete` veya `request`) `apps/mobile/src/api/mobile-api-client.ts` içinden doğrula ve çağrıları ona uyarla. `mobileQueryKeys`'in gerçek import yolunu `grep -rn "mobileQueryKeys" apps/mobile/src/realtime/realtime-query-bridge.ts` ile bul.

- [ ] **Step 4: Write the screen**

`apps/mobile/src/app/screens/group-create-screen.tsx` — ekran, test edilebilirlik için `friends` ve `onSubmit` proplarını dışarıdan alır; rota kaydı bunları `useMobileFriendsQuery` + `useMobileGroupMutations` ile doldurur.

Bileşenin karşılaması gereken sözleşme:

| testID                                  | Ne                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mobile-group-create-friend-<userId>`   | Seçilebilir arkadaş satırı; `accessibilityState.selected` seçimi yansıtır; seçim doluyken seçili olmayan satırlar `accessibilityState.disabled = true` |
| `mobile-group-create-selected-<userId>` | Seçilenler çip şeridindeki çip; basınca seçimden çıkarır                                                                                               |
| `mobile-group-create-counter`           | `copy.groupCreateCounter` içindeki `{count}` `getGroupSelectionCount(state)` ile doldurulmuş                                                           |
| `mobile-group-create-next`              | `accessibilityState.disabled = !canAdvanceToIdentity(state)`; basınca `step = "identity"`                                                              |
| `mobile-group-create-back`              | Kimlik aşamasından üye aşamasına döner, seçimi korur                                                                                                   |
| `mobile-group-create-name-input`        | Yalnızca kimlik aşamasında; `maxLength={GROUP_DM_NAME_MAX_LENGTH}`                                                                                     |
| `mobile-group-create-photo`             | Yalnızca kimlik aşamasında; foto seçiciyi açar                                                                                                         |
| `mobile-group-create-submit`            | `accessibilityState.disabled = !canSubmitGroup(state)                                                                                                  |     | isPending`; basınca `onSubmit(toGroupCreateRequest(state, iconUrl))`, ardından `onCreated(conversation.id)` |

Durum yalnızca Task 14 modelinden gelir — ekranda kopya seçim/sınır mantığı yazılmaz. Model `@wizards/types`'tan import edilir:

```tsx
import {
  canAdvanceToIdentity,
  canSubmitGroup,
  createInitialGroupCreateState,
  getGroupSelectionCount,
  isGroupSelectionFull,
  toGroupCreateRequest,
  toggleGroupMember,
  type GroupCreateState,
} from "@wizards/types";

const [state, setState] = useState<GroupCreateState>(createInitialGroupCreateState);
```

Stiller `useDmScreenStyles()`'a eklenir; mevcut ekranların token kullanımını (`theme.messaging.*`, `msg.avatar.*`) izler.

- [ ] **Step 5: Register the route**

`DirectMessage` ekranının kaydedildiği kök stack dosyasını `grep -rn "name=\"DirectMessage\"" apps/mobile/src` ile bul ve aynı biçimde `GroupCreate` ekranını `GroupCreateScreen` bileşeniyle kaydet. Ekran orada `useMobileFriendsQuery` ile arkadaşları, `useMobileGroupMutations().create` ile `onSubmit`'i alır ve `onCreated` içinde:

```tsx
mobileNavigationRef.navigate("DirectMessage", { conversationId });
```

- [ ] **Step 6: Run the tests**

```bash
cd apps/mobile && npx jest component-tests/mobile-group-create.test.tsx
```

Expected: PASS, 6 test.

- [ ] **Step 7: Typecheck**

```bash
pnpm --filter @wizards/mobile typecheck
```

Expected: 0 hata.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/dm/mobile-group-client.ts apps/mobile/src/app/screens/group-create-screen.tsx apps/mobile/component-tests/mobile-group-create.test.tsx apps/mobile/src/navigation
git commit -m "feat(mobile): add the two-step group create screen"
```

---

## Task 16: Sistem mesajı satırı

**Files:**

- Create: `apps/mobile/src/dm/group-system-message-copy.ts`
- Create: `apps/mobile/scripts/mobile-group-system-message.test.ts`
- Create: `apps/mobile/src/app/components/dm-system-message-row.tsx`
- Modify: `apps/mobile/src/app/screens/dm-conversation-screen.tsx` (mesaj render dalı)
- Modify: `packages/types/src/socket.ts` (`DMMessagePayloadSchema`)

**Interfaces:**

- Consumes: `DMSystemMessageTypeSchema` (Task 3).
- Produces:
  - `DMMessagePayload` üç alan daha: `systemType: DMSystemMessageTypeValue | null`, `systemTargetUserIds: string[]`, `systemValue: string | null`
  - `formatGroupSystemMessage(input: { actorName: string; isActorSelf: boolean; labels: GroupSystemMessageLabels; systemType; systemValue; targetNames: string[] }): string`

- [ ] **Step 1: Widen the message payload**

`packages/types/src/socket.ts`, `DMMessagePayloadSchema` ve `DMMessagePayload` tipine:

```ts
  systemType: DMSystemMessageTypeSchema.nullable().default(null),
  systemTargetUserIds: z.array(z.string()).default([]),
  systemValue: z.string().nullable().default(null),
```

`apps/web/src/lib/dm/service.ts`, `mapDMMessagePayload` içinde üç alanı satırdan doldur. `dmMessageInclude` ek `select` gerektirmez — `include` tüm skaler alanları getirir.

- [ ] **Step 2: Write the failing copy tests**

`apps/mobile/scripts/mobile-group-system-message.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatGroupSystemMessage } from "../src/dm/group-system-message-copy";

const labels = {
  actorSelf: "Sen",
  added: "{actor}, {targets} kişisini ekledi",
  created: "{actor} grubu oluşturdu",
  iconChanged: "{actor} grup fotoğrafını değiştirdi",
  left: "{actor} gruptan ayrıldı",
  nameChanged: '{actor} grup adını "{value}" olarak değiştirdi',
  removed: "{actor}, {targets} kişisini çıkardı",
};

describe("formatGroupSystemMessage", () => {
  it("names the actor for a group creation", () => {
    assert.equal(
      formatGroupSystemMessage({
        actorName: "Ada",
        isActorSelf: false,
        labels,
        systemType: "GROUP_CREATED",
        systemValue: null,
        targetNames: [],
      }),
      "Ada grubu oluşturdu",
    );
  });

  it("uses the self label when the viewer is the actor", () => {
    assert.equal(
      formatGroupSystemMessage({
        actorName: "Ada",
        isActorSelf: true,
        labels,
        systemType: "MEMBER_LEFT",
        systemValue: null,
        targetNames: [],
      }),
      "Sen gruptan ayrıldı",
    );
  });

  it("joins multiple targets with commas", () => {
    assert.equal(
      formatGroupSystemMessage({
        actorName: "Ada",
        isActorSelf: false,
        labels,
        systemType: "MEMBER_ADDED",
        systemValue: null,
        targetNames: ["Bora", "Cem"],
      }),
      "Ada, Bora, Cem kişisini ekledi",
    );
  });

  it("puts the new name into the rename sentence", () => {
    assert.equal(
      formatGroupSystemMessage({
        actorName: "Ada",
        isActorSelf: false,
        labels,
        systemType: "NAME_CHANGED",
        systemValue: "Takım",
        targetNames: [],
      }),
      'Ada grup adını "Takım" olarak değiştirdi',
    );
  });

  it("returns an empty string for an unknown type so nothing is drawn", () => {
    assert.equal(
      formatGroupSystemMessage({
        actorName: "Ada",
        isActorSelf: false,
        labels,
        systemType: null,
        systemValue: null,
        targetNames: [],
      }),
      "",
    );
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
cd apps/mobile && node --test --import tsx scripts/mobile-group-system-message.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Write the formatter**

`apps/mobile/src/dm/group-system-message-copy.ts`:

```ts
import type { DMSystemMessageTypeValue } from "@wizards/types";

export type GroupSystemMessageLabels = {
  readonly actorSelf: string;
  readonly added: string;
  readonly created: string;
  readonly iconChanged: string;
  readonly left: string;
  readonly nameChanged: string;
  readonly removed: string;
};

const TEMPLATE_BY_TYPE: Record<DMSystemMessageTypeValue, keyof GroupSystemMessageLabels> = {
  GROUP_CREATED: "created",
  ICON_CHANGED: "iconChanged",
  MEMBER_ADDED: "added",
  MEMBER_LEFT: "left",
  MEMBER_REMOVED: "removed",
  NAME_CHANGED: "nameChanged",
};

/**
 * The server stores no text at all — every viewer reads this line in their own
 * locale, so the sentence is assembled here from the type and the resolved names.
 */
export function formatGroupSystemMessage(input: {
  readonly actorName: string;
  readonly isActorSelf: boolean;
  readonly labels: GroupSystemMessageLabels;
  readonly systemType: DMSystemMessageTypeValue | null;
  readonly systemValue: string | null;
  readonly targetNames: readonly string[];
}): string {
  if (!input.systemType) {
    return "";
  }

  const template = input.labels[TEMPLATE_BY_TYPE[input.systemType]];
  const actor = input.isActorSelf ? input.labels.actorSelf : input.actorName;

  return template
    .replace("{actor}", actor)
    .replace("{targets}", input.targetNames.join(", "))
    .replace("{value}", input.systemValue ?? "");
}
```

- [ ] **Step 5: Write the row component and wire it into the stream**

`apps/mobile/src/app/components/dm-system-message-row.tsx` — ortalanmış, sönük hap:

- `testID="mobile-dm-system-message"`
- Balon, avatar, zaman damgası, uzun-basma menüsü, tepki **yok**
- Boş metin (`formatGroupSystemMessage` `""` döndü) durumunda `null` render eder

`apps/mobile/src/app/screens/dm-conversation-screen.tsx` içindeki mesaj render dalında, normal balondan **önce**:

```tsx
if (message.systemType) {
  return (
    <DMSystemMessageRow
      message={message}
      currentUserId={currentUserId}
      participants={participants}
    />
  );
}
```

Hedef adları `participants` listesinden `systemTargetUserIds` ile çözülür; listede olmayan bir id için `username` yerine boş bırakılmaz — o id atlanır.

- [ ] **Step 6: Run the tests**

```bash
cd apps/mobile && node --test --import tsx scripts/mobile-group-system-message.test.ts
```

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web test
```

Expected: hepsi PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/dm/group-system-message-copy.ts apps/mobile/scripts/mobile-group-system-message.test.ts apps/mobile/src/app/components/dm-system-message-row.tsx apps/mobile/src/app/screens/dm-conversation-screen.tsx packages/types/src/socket.ts apps/web/src/lib/dm/service.ts
git commit -m "feat(dm): render group system messages from typed payloads"
```

---

## Task 17: Grup detay ekranı ve realtime bağlantısı

**Files:**

- Modify: mevcut DM detay ekranı (`grep -rn "mobile-dm-details" apps/mobile/src` ile bul)
- Modify: `apps/mobile/src/realtime/realtime-query-bridge.ts`
- Create: `apps/mobile/component-tests/mobile-group-details.test.tsx`

**Interfaces:**

- Consumes: Task 11 detay yanıtı (`members`, `ownerId`, `participant: null`); Task 15 mutation'ları; Task 8 olayları.
- Produces: grup detay görünümü + üç olayın query invalidation'ı.

- [ ] **Step 1: Write the failing tests**

`apps/mobile/component-tests/mobile-group-details.test.tsx` — sözleşme:

| Test                       | Beklenen                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Sahip görünümü             | `mobile-group-add-member`, her üye satırında `mobile-group-remove-user-<id>`, ad/foto düzenleme kontrolleri **görünür**                 |
| Üye görünümü (sahip değil) | Yukarıdakilerin hiçbiri render edilmez; `mobile-group-leave` görünür                                                                    |
| Sahip rozeti               | `ownerId` ile eşleşen üye satırı `copy.groupOwnerBadge` metnini taşır                                                                   |
| Ortak sunucular            | Grup görünümünde `mobile-dm-mutual-servers` render edilmez                                                                              |
| Ayrılma onayı              | `mobile-group-leave` basınca onay ister; onaylanınca `removeMember` mutation'ı `{ conversationId, userId: currentUserId }` ile çağrılır |

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/mobile && npx jest component-tests/mobile-group-details.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Add the group branch to the details screen**

Grup kipinde:

- **Gösterilir:** grup adı + foto (sahipse düzenlenebilir), üye listesi (avatar + ad + sahip rozeti), üye ekle (sahip), üye çıkar (sahip), gruptan ayrıl (herkes), sessize al, sohbeti gizle, ortak medya
- **Gizlenir:** ortak sunucular, 1:1 profil blokları, sesli/görüntülü arama düğmeleri

- [ ] **Step 4: Wire the three realtime events**

`apps/mobile/src/realtime/realtime-query-bridge.ts` içinde, mevcut `dm:conversation:updated` işleyicisinin yanına:

```ts
if (event.eventName === "dm:conversation:created") {
  void queryClient.invalidateQueries({ queryKey: mobileQueryKeys.dmConversations() });
  void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() });
  return;
}

if (event.eventName === "dm:conversation:members_changed") {
  void queryClient.invalidateQueries({ queryKey: mobileQueryKeys.dmConversations() });
  void queryClient.invalidateQueries({
    queryKey: mobileQueryKeys.dmDetails(event.data.conversationId),
  });
  return;
}

if (event.eventName === "dm:conversation:removed") {
  // The viewer is out of this group: the row must go and an open chat must not
  // keep polling a conversation the server will now 403 on.
  void queryClient.invalidateQueries({ queryKey: mobileQueryKeys.dmConversations() });
  void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() });
  onConversationRemoved?.(event.data.conversationId);
  return;
}
```

`mobileQueryKeys.dmDetails` yoksa mevcut detay sorgusunun anahtarını kullan. `onConversationRemoved` köprünün mevcut geri-çağrı sözleşmesine eklenir; açık sohbet o id ise gelen kutusuna döner.

- [ ] **Step 5: Run the tests**

```bash
cd apps/mobile && npx jest
```

```bash
cd apps/mobile && pnpm test
```

Expected: ikisi de PASS.

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
git add apps/mobile/src apps/mobile/component-tests
git commit -m "feat(mobile): manage group members from the conversation details screen"
```

---

# FAZ 6 — Web / desktop

## Task 18: Sidebar grup satırı ve oluşturma diyaloğu

**Files:**

- Modify: `apps/web/src/components/dm/dm-sidebar.tsx`
- Create: `apps/web/src/components/dm/group-create-dialog.tsx`
- Create: `apps/web/src/components/dm/group-create-dialog.test.tsx`

**Interfaces:**

- Consumes: Task 9 web uçları; **Task 14 seçim modelinin tamamı** `@wizards/types`'tan import edilir (`toggleGroupMember`, `canAdvanceToIdentity`, `canSubmitGroup`, `getGroupSelectionCount`, `isGroupSelectionFull`, `toGroupCreateRequest`). Seçim, sınır veya ad-kırpma mantığı web'de **yeniden yazılmaz** — mobil ekranla aynı fonksiyonları çağırır.
- Produces: `GroupCreateDialog` bileşeni; sidebar'da grup satırı ve `+` butonu.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/dm/group-create-dialog.test.tsx`, `node:test` + `.test.tsx` biçiminde (`apps/web/src/components/dm/dm-call-notice.test.tsx` dosyasını örnek al):

| Test                                      | Beklenen                                |
| ----------------------------------------- | --------------------------------------- |
| İki arkadaş seçilene kadar "İleri" kapalı | `disabled === true`                     |
| 31 seçimden sonra seçim kilitli           | 32. seçim listeyi büyütmez              |
| Boş ad gövdeye yazılmaz                   | `POST` gövdesi yalnızca `userIds` taşır |
| Ad kırpılır                               | `"  Takım  "` → `"Takım"`               |

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="GroupCreateDialog"
```

Expected: FAIL.

- [ ] **Step 3: Write the dialog**

`apps/web/src/components/dm/group-create-dialog.tsx` — mevcut `apps/web/src/components/shell/workspace-modals.tsx` diyalog desenini izler. İki aşama, aynı kurallar: min 2 seçim, 31 seçim tavanı, opsiyonel ad (`GROUP_DM_NAME_MAX_LENGTH`), opsiyonel foto (`groupIconUploader`).

- [ ] **Step 4: Add the sidebar entry point and group row**

`apps/web/src/components/dm/dm-sidebar.tsx`:

- Mevcut yeni-DM kontrolünün yanına `+` butonu → diyaloğu açar
- Grup satırı: `conversation.name` (yoksa üye adları birleşimi), `conversation.iconUrl` yoksa avatar yığını, üye sayısı rozeti
- Grup önizlemesinde yazar öneki (mobildeki kural: gönderen mevcut kullanıcıysa "Sen:", değilse gönderenin adı)
- Arama `conversation.name` ve üye adları üzerinde çalışır

- [ ] **Step 5: Run tests and typecheck**

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web typecheck
```

Expected: ikisi de yeşil.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/dm/dm-sidebar.tsx apps/web/src/components/dm/group-create-dialog.tsx apps/web/src/components/dm/group-create-dialog.test.tsx
git commit -m "feat(web): create and list group DMs from the sidebar"
```

---

## Task 19: Web detay paneli ve sohbet yüzeyi

**Files:**

- Modify: `apps/web/src/components/dm/dm-details-panel.tsx`
- Modify: `apps/web/src/components/dm/dm-conversation.tsx`
- Create: `apps/web/src/components/dm/dm-system-message.tsx`
- Create: `apps/web/src/components/dm/dm-system-message.test.tsx`

**Interfaces:**

- Consumes: Task 16 `DMMessagePayload` sistem alanları; Task 9 uçları.
- Produces: `DMSystemMessage` bileşeni; detay panelinde grup kipi; sohbet başlığında grup adı + üye sayısı.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/dm/dm-system-message.test.tsx` — mobil formatlayıcının web karşılığı için aynı beş vaka: oluşturma, "Sen" ikamesi, çoklu hedef, yeniden adlandırma, `systemType: null` → hiçbir şey render etmez.

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="DMSystemMessage"
```

Expected: FAIL.

- [ ] **Step 3: Write the component and the details panel group mode**

- `dm-system-message.tsx`: ortalanmış sönük satır, `systemType` null ise `null` döner
- `dm-details-panel.tsx` grup kipi: üye listesi, üye ekleme, üye çıkarma, gruptan ayrılma, ad ve foto düzenleme. 1:1 kipi değişmez
- `dm-conversation.tsx`: sistem mesajı dalı normal balondan önce; başlık grup adı + üye sayısı, grupta 1:1 presence göstergesi gizli

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web typecheck
```

Expected: ikisi de yeşil.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dm
git commit -m "feat(web): manage groups and render system messages in the DM surface"
```

---

# FAZ 7 — Kapanış

## Task 20: Tam doğrulama

**Files:** yok — yalnızca doğrulama.

- [ ] **Step 1: Run every suite**

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/mobile test
```

```bash
pnpm --filter @wizards/mobile test:components
```

Expected: dördü de PASS, sıfır başarısız test.

- [ ] **Step 2: Typecheck every package**

```bash
pnpm --filter @wizards/types typecheck
```

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/mobile typecheck
```

Expected: üçü de 0 hata.

- [ ] **Step 3: Confirm the migration is in the directory Prisma reads**

```bash
ls packages/db/prisma/rebaseline-migrations/20260807120000_group_dm/migration.sql
```

Expected: dosya var. `packages/db/prisma/migrations/` altında **olmamalı**.

- [ ] **Step 4: Manually verify the eviction path**

Bu davranışın birim testi Task 8'de var, ama gerçek soket üzerinde bir kez doğrula: iki oturum aç, gruba ikisini de al, birini çıkar, çıkarılan oturumun sonraki mesajı **almadığını** gör. Bu, spec'in en kritik güvenlik kalemi.

- [ ] **Step 5: Report**

Hangi testlerin koştuğunu ve sonuçlarını çıktıyla birlikte bildir. Atlanan veya bloke olan bir madde varsa açıkça söyle.

---

## Self-Review

Bu plan yazıldıktan sonra spec'e karşı denetlendi.

**Spec kapsamı:** 16 bölümün tamamı bir göreve bağlı — §5 → Task 2/3, §6 → Task 1, §7 → Task 4–7, §8 → Task 9/10, §9 → Task 8/17, §10 → Task 13–17, §11 → Task 18/19, §12 → Task 4–7 testleri, §13 → her görevin test adımları + Task 20.

**Kapsam dışı bırakılanlar ve nedeni:**

- Spec §10.3'teki mobil `"group-icon"` intent'i Task 12'de tanımlanıyor; ekrandaki foto seçici Task 15'te `mobile-group-create-photo` testID'si ile sözleşmeye bağlanıyor, ancak yükleme akışının kendisi mevcut görsel seçici hattını yeniden kullandığı için ayrı görev açılmadı.
- Seçim modeli `@wizards/types/group-dm-selection.ts` içinde yaşar; mobil ekran (Task 15) ve web diyaloğu (Task 18) aynı fonksiyonları çağırır. İki yüzeyde iki uygulama = iki sapma; saf TypeScript olduğu için paylaşımın maliyeti yok.

**Bilinen yumuşak noktalar (uygulayıcı doğrulamalı):**

- `@/lib/socket/io` import yolu (Task 9 Step 4 notu)
- `MobileApiClient` metot adları ve `mobileQueryKeys` import yolu (Task 15 Step 3 notu)
- Next.js rota `context.params` imzası — Promise mi düz nesne mi (Task 9 Step 5 notu)
- `MobileMediaUploadIntentSchema` discriminated union kolunun tam biçimi (Task 12 Step 4 notu)

Bu dördü de plan içinde açıkça işaretlendi; uygulayıcı komşu dosyayı okuyup biçimi eşleştirir.
