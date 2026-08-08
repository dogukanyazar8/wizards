# Faz 4 — API yüzeyi (Görev 9, 10, 11, 12)

> **Önce oku:** `docs/prompts/grup-sohbeti/00-ortak-baglam.md`.
> **Önkoşul:** Faz 3 (Görev 8) tamam — `emitGroupConversationCreated`,
> `emitGroupMembersChanged`, `evictRemovedGroupMember` mevcut.

Bu faz servis katmanını HTTP'ye açar. **İş mantığı yazılmaz** — `group-service.ts`
zaten hazır, rotalar ince sarmalayıcıdır.

---

## Görev 9 — Web grup rotaları

### Dosyalar

- Değiştir: `apps/web/src/lib/api-rate-limit.ts`
- Oluştur: `apps/web/src/app/api/v1/dm/groups/route-logic.ts`
- Oluştur: `apps/web/src/app/api/v1/dm/groups/route-logic.test.ts`
- Oluştur: `apps/web/src/app/api/v1/dm/groups/route.ts`
- Oluştur: `apps/web/src/app/api/v1/dm/groups/[conversationId]/route.ts`
- Oluştur: `apps/web/src/app/api/v1/dm/groups/[conversationId]/members/route.ts`
- Oluştur: `apps/web/src/app/api/v1/dm/groups/[conversationId]/members/[userId]/route.ts`

### 9.1 Rate limit

`apps/web/src/lib/api-rate-limit.ts`, alfabetik sırada:

```ts
  "dm:group:create": { limit: 10, windowSeconds: 10 * 60 },
  "dm:group:members": { limit: 30, windowSeconds: 60 },
  "dm:group:update": { limit: 30, windowSeconds: 60 },
  "mobile:dm:group:create": { limit: 10, windowSeconds: 10 * 60 },
  "mobile:dm:group:members": { limit: 30, windowSeconds: 60 },
  "mobile:dm:group:update": { limit: 30, windowSeconds: 60 },
```

### 9.2 Uçlar

| Yöntem | Yol                                                   | Gövde                            | Rate action        | Yanıt                      |
| ------ | ----------------------------------------------------- | -------------------------------- | ------------------ | -------------------------- |
| POST   | `/api/v1/dm/groups`                                   | `GroupDMCreateRequestSchema`     | `dm:group:create`  | `201` + `{ conversation }` |
| PATCH  | `/api/v1/dm/groups/[conversationId]`                  | `GroupDMUpdateRequestSchema`     | `dm:group:update`  | `200` + `{ conversation }` |
| POST   | `/api/v1/dm/groups/[conversationId]/members`          | `GroupDMAddMembersRequestSchema` | `dm:group:members` | `200` + `{ conversation }` |
| DELETE | `/api/v1/dm/groups/[conversationId]/members/[userId]` | —                                | `dm:group:members` | `204`, gövdesiz            |

`DELETE` her iki durumda da (başkasını çıkarma, kendi ayrılma) `204` döner. Çıkaran
kişi güncel listeyi yanıttan değil, `dm:conversation:members_changed` olayı +
sorgu invalidation'ından alır.

### 9.3 DI yüzeyi

`route-logic.ts` tek bir `GroupRouteDependencies` tipi ve `defaults` nesnesi tanımlar;
dört fonksiyon (`groupCreateRoute`, `groupUpdateRoute`, `groupAddMembersRoute`,
`groupRemoveMemberRoute`) bu tipi opsiyonel son parametre olarak alır. Görev 10 aynı
dört fonksiyonu mobil auth ile yeniden kullanır — iş mantığı ikinci kez yazılmaz.

Bağımlılıklar en az şunlar: `authenticate`, `enforceRateLimit`, `createGroup`,
`updateGroup`, `addMembers`, `removeMember`, `emitCreated`, `emitMembersChanged`,
`evictRemoved`, `getIo`, `loadConversationForBroadcast`.

### 9.4 Yayın sırası

- **Create:** `createGroup` → başarıysa `emitCreated(io, conversation)`
- **Update:** `updateGroup` → `emitMembersChanged(io, { conversation })`
- **Add:** `addMembers` → `emitMembersChanged(io, { addedUserIds: userIds, conversation })`
- **Remove:** `removeMember` → `evictRemoved(io, { conversationId, userId: targetUserId })`
  → sonra `loadConversationForBroadcast(conversationId, ...)`; **null dönerse**
  (grup silinmiş, son üye çıkmış) `emitMembersChanged` çağrılmaz

`io` yoksa yayınlar sessizce atlanır — REST yanıtı soket bağlantısına bağlı olmamalı.

### 9.5 Doğrulanacak noktalar

`@/lib/socket/io` yolunu tahmin etme:
`grep -rn "export function getIo" apps/web/src/lib/socket` ile bul.

Next.js rota kabuğunda `context.params`'ın Promise mi düz nesne mi olduğunu
`apps/web/src/app/api/v1/dm/[conversationId]/route.ts`'den oku ve aynı biçimi kullan.

### 9.6 Testler

`route-logic.test.ts`, DI ile (DB yok, soket yok):

- create: doğru rate action, `201`, gövde `{ conversation }`, `emitCreated` çağrıldı
- create: 1 üyelik gövde `400` (şema reddi)
- update: `updateGroup` doğru argümanlarla çağrıldı, `emitMembersChanged` çağrıldı
- add: `addedUserIds` yayına geçti
- remove: `204`, `evictRemoved` **sonra** `emitMembersChanged` sırası
- remove: `loadConversationForBroadcast` null dönerse `emitMembersChanged` **çağrılmadı**

---

## Görev 10 — Mobil grup rotaları

### Dosyalar

- Oluştur: `apps/web/src/app/api/v1/mobile/dm/groups/route-logic.ts`
- Oluştur: `apps/web/src/app/api/v1/mobile/dm/groups/route-logic.test.ts`
- Oluştur: dört rota kabuğu, web'dekiyle aynı yol yapısı altında

Görev 9'un dört fonksiyonunu sarar; farklar yalnızca:

1. `authenticate` → `requireMobileApiUserId(request)`
2. Rate action `mobile:` önekli
3. `200`/`201` yanıtları `GroupDMConversationResponseSchema.parse` ile yeniden
   doğrulanır — mobil ayrı bir sürüm treni, sunucu tarafı şekil sapması telefonda
   değil burada patlamalı. `204` yanıtı olduğu gibi geçer.

**Tuzak:** `dependencies` verilmediğinde Görev 9'un varsayılanı session auth kullanır.
Dört mobil kabuk `mobileGroupDefaults`'u **her zaman açıkça** geçmeli.

### Testler

- Mobil rate action kovası kullanılıyor (`mobile:dm:group:create`)
- `201` gövdesi şemadan geçmiş
- `DELETE` `204` ve gövde tamamen boş

---

## Görev 11 — Grup detaylarını mobil detay servisinde aç

`getMobileDMDetails` (`apps/web/src/lib/dm/mobile-details-service.ts:29`) bugün
"aktör olmayan tek katılımcı"yı arıyor ve bulamazsa `PARTICIPANT_NOT_FOUND` (404)
atıyor — **grupta her zaman patlar**.

### Dosyalar

- Değiştir: `packages/types/src/mobile-social.ts` (`MobileDMDetailsResponseSchema`)
- Değiştir: `apps/web/src/lib/dm/mobile-details-service.ts`
- Değiştir: `apps/web/src/lib/dm/mobile-details-service.test.ts`

### Sözleşme genişlemesi

`MobileDMDetailsResponseSchema` iki alan kazanır:

```ts
members: z.array(z.object({
  avatarUrl: z.string().url().max(2048).nullable(),
  displayName: z.string().max(100).nullable(),
  id: MobileBoundedIdSchema,
  isOwner: z.boolean(),
  status: z.string().max(32),
  username: z.string().max(100),
}).strict()).max(32).default([]),
ownerId: MobileBoundedIdSchema.nullable().default(null),
```

`participant` alanı `.nullable()` yapılır — grupta karşı taraf yoktur.
**1:1 yanıtı bire bir korunur**; grupta `participant: null` döner.

Grup kolunda `listMutualServers` **çağrılmaz** — grubun tek bir karşı tarafı yok,
paylaşılacak sunucu hesaplanamaz. Boş dizi döner.

`members` sırası `conversation.participants` sırasıdır (`joinedAt` artan).
`isOwner` `conversation.ownerId === entry.userId` ile hesaplanır.

### Test

Grup sohbeti için `getMobileDMDetails` çağrısı: `participant === null`,
`ownerId` doğru, `members` iki üyeyi doğru `isOwner` bayrağıyla döner,
`mutualServers` boş.

**§5 kuralı burada devrede:** `packages/types` değişti, `@wizards/mobile` de
doğrulanmalı.

---

## Görev 12 — Grup fotoğrafı yükleme uçları

İki ayrı an, iki ayrı mekanizma — **oluşturma anında henüz `conversationId` yok**,
yani sahiplik doğrulanamaz.

### 12.1 Oluşturma anı (conversationId yok)

`apps/web/src/app/api/uploadthing/core.ts` içine `groupIconUploader` eklenir.
Şekli mevcut `serverIconUploader` ile birebir aynı:

- yalnızca oturum kontrolü (`requireUploadUser`)
- kullanıcı başına rate limit: `rate:upload:group-icon:${userId}`, 10/300sn
- `onUploadComplete` yalnızca `{ url }` döner, DB'ye hiçbir şey yazmaz

Dönen URL istemci tarafından `POST /groups` gövdesinde `iconUrl` olarak gönderilir;
`GroupDMCreateRequestSchema` zaten `https:` zorunluluğunu uyguluyor.

### 12.2 Sonradan düzenleme (conversationId var)

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

`MobileMediaUploadIntentSchema` discriminated union'ına `"group-icon"` kolu eklenir;
kol `conversationId: MobileBoundedIdSchema` taşır. Mevcut `"server-icon"` kolunun
biçimini oku ve aynısını kullan.

`apps/web/src/lib/mobile/mobile-media-upload-service.ts` içindeki
`authorizeMobileMediaUpload` bu kol için yükleyenin **grubun sahibi** olduğunu
doğrular:

```ts
const conversation = await prisma.dMConversation.findUnique({
  select: { ownerId: true, type: true },
  where: { id: intent.conversationId },
});

if (conversation?.type !== "GROUP_DM" || conversation.ownerId !== userId) {
  throw new UploadThingError("You cannot change this group's photo.");
}
```

Mevcut `switch`/`if` yapısını oku, bloğu o dosyanın desenine uyarla.

### Testler

- `uploadRouter`'da `groupIconUploader` var
- `MobileMediaUploadPurposeSchema.options` `"group-icon"` içeriyor
- Sahibi olmayan kullanıcı `"group-icon"` intent'iyle yetkilendirilemez

---

## Faz 4 kabul kriterleri

- [ ] Görev 9: 6 rate limit kaydı, 4 web ucu, DI'lı `route-logic`, 6 test
- [ ] Görev 10: 4 mobil uç, şema-doğrulamalı yanıt, 3 test, `mobileGroupDefaults`
      dört kabukta da açıkça geçiliyor
- [ ] Görev 11: grup kolu 404 atmıyor, `members[]` + `ownerId` dönüyor, 1:1 kolu
      değişmemiş, `packages/types` + `@wizards/mobile` yeşil
- [ ] Görev 12: `groupIconUploader` + `"group-icon"` intent + sahiplik kontrolü
- [ ] `pnpm --filter @wizards/web test`, `@wizards/types test`,
      `@wizards/mobile test`, `@wizards/mobile test:components` → hepsi yeşil
- [ ] Üç paketin `typecheck`'i temiz (bilinen e2e hatası hariç)
- [ ] En az iki deliberate-failure kanıtı: (a) `emitMembersChanged`'in silinen grup
      için atlandığı, (b) `"group-icon"` sahiplik kontrolü

## Rapor

Görev başına bir dosya: `.superpowers/sdd/groupdm/task-9-report.md` … `task-12-report.md`.
