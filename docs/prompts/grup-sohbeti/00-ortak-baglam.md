# 00 — Ortak bağlam (her faz promptu önce bunu okur)

Grup sohbeti (Group DM) özelliğinin kalan fazlarını çalıştıran her prompt bu dosyayı
**ilk** okur. Burası tek doğruluk kaynağıdır: aşağıdaki sözleşmeler kodda hâlihazırda
mevcuttur, yeniden tasarlanmaz.

- **Spec:** `docs/superpowers/specs/2026-08-07-grup-sohbeti-design.md`
- **Plan:** `docs/superpowers/plans/2026-08-07-grup-sohbeti.md` (20 görev, 7 faz)
- **İlerleme defteri:** `.superpowers/sdd/progress.md`, "Grup Sohbeti (Group DM)" bölümü
- **Dal:** `uat`, baz commit `4b1fad7c`

---

## 1. Bağlayıcı kararlar (kullanıcı onayladı, değiştirilemez)

| #   | Karar                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------- |
| K1  | Mobil **ve** web/desktop tam parite                                                                         |
| K2  | Gruba yalnızca **arkadaşlar** eklenir. Ortak sunucu üyeliği yetmez. Engellenmiş kullanıcı eklenemez         |
| K3  | Grup boyutu **32 kişi** (kurucu dahil)                                                                      |
| K4  | **Sahip-yönetir**: ad/foto düzenleme, üye ekleme, üye çıkarma yalnızca `ownerId`. Her üye kendi ayrılabilir |
| K5  | Grup adı **opsiyonel**; boşsa başlık üye adlarından türer                                                   |
| K6  | Oluşturmada minimum **3 kişi** (kurucu + 2). `userIds` dizisi kurucuyu içermez, yani dizi sınırları 2–31    |
| K7  | Sistem mesajları var. `unreadCount` **artırmaz**, push **atmaz**, `lastMessageAt` günceller                 |
| K8  | Sessize alma/gizleme mevcut `DMParticipant.muted`/`hiddenAt` ve mevcut rotalarla; yeni uç açılmaz           |

---

## 2. Faz 1–2 tamamlandı — hazır sözleşmeler

### 2.1 Veritabanı (`packages/db/prisma/schema.prisma`)

`DMConversation` zaten `type` (`ConversationType`: `DM` \| `GROUP_DM`), `name`,
`iconUrl`, `ownerId` taşıyor. Migration
`packages/db/prisma/rebaseline-migrations/20260807120000_group_dm/` şunları ekledi:

```prisma
enum DMSystemMessageType {
  GROUP_CREATED
  MEMBER_ADDED
  MEMBER_REMOVED
  MEMBER_LEFT
  NAME_CHANGED
  ICON_CHANGED
}

model DMMessage {
  systemType           DMSystemMessageType?
  systemTargetUserIds  String[]             @default([])
  systemValue          String?              @db.VarChar(100)
}
```

**Sistem mesajı sözleşmesi:** `content` her zaman `""`. Sunucu asla kullanıcıya
gösterilecek metin üretmez — locale kullanıcı başına değişir, cümleyi istemci kurar.
`userId` eylemi yapan kişidir. `systemTargetUserIds` yalnızca `MEMBER_ADDED` ve
`MEMBER_REMOVED` için doludur. `systemValue` yalnızca `NAME_CHANGED` için doludur.

### 2.2 `packages/types/src/group-dm.ts`

```ts
export const GROUP_DM_MAX_PARTICIPANTS = 32;
export const GROUP_DM_MIN_PARTICIPANTS = 3;
export const GROUP_DM_NAME_MAX_LENGTH = 100;

export const DMSystemMessageTypeSchema: z.ZodEnum<[
  "GROUP_CREATED", "MEMBER_ADDED", "MEMBER_REMOVED",
  "MEMBER_LEFT", "NAME_CHANGED", "ICON_CHANGED",
]>;

export const GroupDMCreateRequestSchema;      // { userIds: string[2..31]; name?: string|null; iconUrl?: string }
export const GroupDMUpdateRequestSchema;      // { name?: string|null; iconUrl?: string|null }
export const GroupDMAddMembersRequestSchema;  // { userIds: string[1..31] }
export const GroupDMConversationResponseSchema; // { conversation: DMConversationDTO }

export type DMSystemMessageTypeValue;
export type GroupDMAddMembersRequest;
export type GroupDMCreateRequest;
export type GroupDMUpdateRequest;
```

`name` şeması boş/yalnızca-boşluk girdiyi `null`'a dönüştürür. `iconUrl` yalnızca
`https:` kabul eder.

### 2.3 `packages/types/src/socket.ts` — `DMConversationDTO`

```ts
export interface DMConversationDTO {
  id: string;
  type: DMConversationType;
  name: string | null;
  iconUrl: string | null; // Faz 0'da eklendi
  ownerId: string | null; // Faz 0'da eklendi
  lastMessageAt: string;
  participants: DMParticipantDTO[];
  lastMessage: DMMessagePayload | null;
}
```

### 2.4 `apps/web/src/lib/dm/group-service.ts` — servis katmanı **tamam**

Beş operasyonun tamamı yazıldı ve test edildi. Yeniden yazma, yalnızca çağır.

```ts
export type GroupConversationRow = {
  iconUrl: string | null;
  id: string;
  name: string | null;
  ownerId: string | null;
  participantUserIds: string[];
};

export type GroupServiceDependencies = {
  areFriends(actorId, targetId): Promise<boolean>;
  deleteConversation(conversationId): Promise<void>;
  getBlockStatus(actorId, targetId): Promise<{ blocked: boolean }>;
  getDeletedMessageLabel(userId): Promise<string>;
  loadConversation(
    conversationId,
  ): Promise<
    GroupConversationRow & { participants: Array<{ joinedAt: Date; userId: string }>; type: string }
  >;
  mapConversation(conversation, viewerId, deletedMessageLabel): Promise<DMConversationDTO>;
  writeAddedMembers(input: {
    actorId;
    addedUserIds: string[];
    conversationId;
  }): Promise<GroupConversationRow>;
  writeCreatedGroup(input: {
    actorId;
    iconUrl;
    name;
    participantUserIds: string[];
  }): Promise<GroupConversationRow>;
  writeGroupMetadata(input: {
    actorId;
    conversationId;
    iconUrl?;
    name?;
    systemType: "ICON_CHANGED" | "NAME_CHANGED";
    systemValue: string | null;
  }): Promise<GroupConversationRow>;
  writeRemovedMember(input: {
    actorId;
    conversationId;
    nextOwnerId: string | null;
    systemType: "MEMBER_LEFT" | "MEMBER_REMOVED";
    targetUserId;
  }): Promise<void>;
};

export async function assertGroupMembersEligible(actorId, userIds, dependencies): Promise<string[]>;
export async function createGroupConversation(
  actorId,
  input: { iconUrl?; name?; userIds },
  dependencies?,
): Promise<DMConversationDTO>;
export function requireGroupOwner(
  actorId,
  conversation: { ownerId: string | null; type: string },
): void;
export async function addGroupMembers(
  actorId,
  conversationId,
  userIds,
  dependencies?,
): Promise<DMConversationDTO>;
export function resolveNextGroupOwner(participants, leavingUserId): string | null;
export async function leaveGroupConversation(actorId, conversationId, dependencies?): Promise<void>;
export async function removeGroupMember(
  actorId,
  conversationId,
  targetUserId,
  dependencies?,
): Promise<void>;
export async function updateGroupConversation(
  actorId,
  conversationId,
  patch,
  dependencies?,
): Promise<DMConversationDTO>;
```

Davranış notları (rotalar bunlara güvenir):

- `requireGroupOwner` önce `NOT_A_GROUP` (400) atar, sonra `NOT_GROUP_OWNER` (403).
- `assertGroupMembersEligible` tekilleştirir, aktörün kendi id'sini süzer, **önce**
  `BLOCKED` (403) sonra `NOT_FRIENDS` (403) atar.
- `removeGroupMember(actor, conv, target)` `actor === target` ise `leaveGroupConversation`'a
  delege eder ve sahiplik **aramaz**.
- `leaveGroupConversation`: son üye çıkıyorsa sohbeti siler; sahip çıkıyorsa sahiplik
  en erken `joinedAt`'e (eşitlikte `userId`) geçer; sahip değilse `ownerId`'ye
  dokunulmaz.
- `updateGroupConversation`: boş patch hiçbir şey yazmaz. `patch.name === undefined`
  "değiştirme", `patch.name === null` "temizle" demektir. Ad ve foto aynı istekte
  değişirse **tek** sistem satırı yazılır ve `NAME_CHANGED` kazanır; iki alan da
  kalıcılaşır.
- Tüm yazıcılar tek `prisma.$transaction` kullanır ve hiçbiri `unreadCount`'a dokunmaz.

### 2.5 Hata kodları (rotalar bunları HTTP'ye çevirir)

| Kod               | HTTP |
| ----------------- | ---- |
| `NOT_FRIENDS`     | 403  |
| `BLOCKED`         | 403  |
| `NOT_GROUP_OWNER` | 403  |
| `GROUP_FULL`      | 400  |
| `GROUP_TOO_SMALL` | 400  |
| `NOT_A_GROUP`     | 400  |
| `NOT_FOUND`       | 404  |

`ApiError` kullanımı: `new ApiError(message, status, code)` (`@/lib/api`).
Rotalar hataları `jsonError(error)` ile döndürür.

### 2.6 Halihazırda grup farkında olan mobil kod (yeniden yazma)

| Davranış                           | Yer                                                |
| ---------------------------------- | -------------------------------------------------- |
| Grup rozeti                        | `apps/mobile/src/app/screens/dm-inbox.tsx:435,492` |
| `"Ad: mesaj"` önizleme öneki       | `apps/mobile/src/app/screens/dm-inbox.tsx:457`     |
| Adsız grupta üye adlarından başlık | `apps/mobile/src/app/mobile-display-model.ts:193`  |
| `iconUrl` öncelikli avatar         | `apps/mobile/src/app/mobile-display-model.ts:207`  |
| `filter === "groups"` süzgeci      | `apps/mobile/src/app/mobile-display-model.ts:259`  |

---

## 3. Bağlayıcı çalışma kuralları

1. **COMMIT YOK.** `git commit`, `git add`, `git stash` çalıştırılmaz. Her şey
   çalışma ağacında birikir. Kullanıcı sonunda kendisi commit eder.
2. **Komutlar pnpm üzerinden.** `npm run` ile `typecheck`/`lint` derleme başlamadan
   launcher sürüm kontrolünde patlar — sahte hata.
3. `pnpm --filter <pkg> test -- --test-name-pattern=X` **süzmez** (çift `--` devre dışı
   bırakır). Tam süiti koş, sayıları oku.
4. **`apps/web` test ortamında veritabanı yok.** Servis çağıran her rota testi
   bağımlılıklarını DI ile almak zorunda: varsayılan nesne + override parametresi.
   Canlı DB gerektiren test kabul edilmez.
5. **`@wizards/types`'a dokunan her iş `@wizards/mobile`'ı da doğrular.**
   `apps/mobile` types paketine `workspace:*` ile bağlı ve `DMConversationDTO`/
   `DMConversationDTOSchema`'yı doğrudan import ediyor; paylaşılan şemaya zorunlu
   alan eklemek mobil fixture'larını hem tipte hem çalışma zamanında (ZodError) kırar.
6. **Satır sonları:** her dosyanın mevcut kuralını koru. Yüzlerce değişmemiş satırı
   oynatan diff, satır-sonu regresyonudur. `git diff --numstat` ile kontrol et.
7. **Migration yalnızca** `packages/db/prisma/rebaseline-migrations/` altına yazılır.
   `packages/db/prisma/migrations/` altındaki dosyalar sessizce hiç çalışmaz.
8. **Deliberate-failure kanıtı zorunlu.** Yeni bir değişmezi koruyan her test için:
   kodu kasten boz, tam o testin düştüğünü göster, geri al, `md5sum` ile dosyanın
   byte-identical olduğunu doğrula. **Mutasyonu uygulanmış bırakma** — bu planda bir
   ajan tam bunu yaptı ve çalışma ağacına bozuk bir sıralama bıraktı.

---

## 4. Eşzamanlı oturum — bizim olmayan kırıklar

Aynı worktree'de başka bir oturum çalışıyor (sunucu tipi/görünürlük, desktop Tauri,
voice/video-quality). Aşağıdakiler **onların**; düzeltme, dokunma, kendi hatan sayma:

- `apps/web/e2e/local-quality-dashboard/quality-dashboard.spec.ts` — typecheck hatası
- `apps/web/src/lib/workspace/server-member-counter.test.ts`
- `apps/web/src/lib/workspace/service.test.ts` — makine yükü altında aralıklı
  `ioredis MaxRetriesPerRequestError` (flake olduğunu teyit için yeniden koş)
- `apps/mobile/src/voice/**`, `apps/web/src/lib/voice/**`, `docker-compose.yml`,
  `packages/db/prisma/schema.prisma` içindeki `ServerType`/`Server.type`/`memberCount`
  bölgeleri, `20260807071604_server_type_and_counters` migration'ı

Bunların dışında kırmızı olan her şey bizimdir.

---

## 5. Test tabanı ve doğrulama komutları

Faz 2 kapanışındaki taban:

| Paket                            | Sayı        |
| -------------------------------- | ----------- |
| `@wizards/web`                   | 1843 / 1843 |
| `@wizards/types`                 | 169 / 169   |
| `@wizards/mobile` (node)         | 1600 / 1600 |
| `@wizards/mobile` (jest bileşen) | 1135 / 1135 |

```bash
pnpm --filter @wizards/types test
pnpm --filter @wizards/web test
pnpm --filter @wizards/mobile test
pnpm --filter @wizards/mobile test:components
pnpm --filter @wizards/types typecheck
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/mobile typecheck
```

Mobil bileşen testi tek dosya: `cd apps/mobile && npx jest component-tests/<ad>.test.tsx`
Mobil node testi tek dosya: `cd apps/mobile && node --test --import tsx scripts/<ad>.test.ts`

---

## 6. Devralınan borç (final incelemede kapatılacak)

- **Task 7 (`updateGroupConversation`) düşman gözüyle incelenmedi.** Kod yazıldı,
  1843/1843 yeşil, iki mutation kanıtı alındı, ama bağımsız inceleme dispatch'i
  kesildi. Ad+foto aynı istekte değişirse "ad kazanır" kuralını doğrudan test eden
  bir vaka **yok**.
- Task 3: `assertSchemaBehaviorCoverage` kendi describe bloğunda duruyor; kardeş
  dosyalarda (`workspace.test.ts`, `badges.test.ts`) şema bloğunun içinde. Kozmetik.
- Task 5 ve Task 6'nın fix dalgaları controller tarafından yazıldı ve ikinci bir
  inceleme dispatch'i almadı. Final inceleme `group-service.test.ts`'i baştan okumalı.
- `defaults` içindeki dört yazıcı (`writeCreatedGroup`, `writeAddedMembers`,
  `writeRemovedMember`, `writeGroupMetadata`) ve `deleteConversation` bu repoda
  test edilemiyor (web testinde DB yok). Yalnızca satır satır okunarak doğrulandı.
- Yerel `db push`, **önceden var olan ilgisiz** şema sapması yüzünden bloke
  (`Message.clientNonce` / `DMMessage.clientNonce` unique kısıtları,
  `ClientHealthDailySummary`, `ClientHealthEvent`). `--accept-data-loss` gerektiriyor,
  kasten zorlanmadı. Yerel DB'de `_prisma_migrations` tablosu yok — saf `db push`
  sandbox'ı. Grup kolonları `psql` ile doğrudan uygulanıp doğrulandı.
