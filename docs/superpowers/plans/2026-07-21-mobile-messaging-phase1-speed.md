# Mobil Mesajlaşma Faz 1 (Hız) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mesaj gönderiminde composer anında temizlensin, kilitlenmesin; gönderim başarısızsa mesaj balonda "failed" durumuna düşsün (tekrar dene / sil); her gönderimdeki invalidate/refetch fırtınası kalksın.

**Architecture:** Mevcut react-query optimistic katmanı korunur. Composer fire-and-forget gönderir; send mutation'ın `onSettled` invalidate'i ve onError rollback'i kaldırılır — hata mesajı cache'te `deliveryStatus: "failed"` olarak işaretlenir. Retry/discard, send hook'larının tuttuğu clientId→draft haritasıyla çalışır. `sendState` (composer kilidi + hata bandı) tamamen sökülür.

**Tech Stack:** React Native (Expo), @tanstack/react-query v5, zod, Node built-in test runner (`node --test --import tsx`), custom `tsc6` typecheck.

**Spec:** `docs/superpowers/specs/2026-07-21-mobile-messaging-revamp-design.md` (Faz 1 bölümü)

**Commit notu:** Kullanıcının kalıcı tercihi gereği commit adımları YALNIZCA kullanıcı onay verdiyse çalıştırılır. Onay yoksa commit adımlarını atla, değişiklikler working tree'de kalsın.

**Doğrulama komutları (repo'ya özgü):**
- Types testleri: `pnpm --filter @wizards/types test`
- Mobile testleri: `pnpm --filter @wizards/mobile test` (tek dosya: `apps/mobile` dizininden `node --test --import tsx scripts/<dosya>.test.ts` — repo kökünden ÇALIŞMAZ, tsx çözümlemesi bozulur)
- Mobile typecheck: `pnpm --filter @wizards/mobile typecheck`
- Web typecheck (types değişikliği sonrası sanity): `pnpm --filter @wizards/web typecheck`

---

## Dosya Haritası

| Dosya | İş |
|---|---|
| `packages/types/src/socket.ts` | `DMMessagePayload`'a opsiyonel `deliveryStatus` |
| `packages/types/src/socket.test.ts` | Şema testi |
| `apps/mobile/src/query/mobile-message-cache.ts` | `markMobileMessageFailed` |
| `apps/mobile/scripts/mobile-message-cache.test.ts` | Cache + factory testleri (mevcutlar güncellenir) |
| `apps/mobile/src/query/use-mobile-message-mutations.ts` | Factory rework + retry/discard hook API'si |
| `apps/mobile/src/app/features/use-mobile-messaging-feature.ts` | Fire-and-forget send, retry/discard handler'ları, sendState söküm |
| `apps/mobile/src/app/composer/mobile-composer.tsx` | Senkron temizleme, kilit kaldırma |
| `apps/mobile/src/app/mobile-screen-state.ts` + ekranlar | sendState tip/plumbing söküm |
| `apps/mobile/src/app/components/message-primitives.tsx` (+`.styles.ts`) | Failed balon UI |
| `apps/mobile/src/locale/mobile-copy.ts` | Yeni TR+EN metinler |

---

### Task 1: `DMMessagePayload.deliveryStatus` tipi

**Files:**
- Modify: `packages/types/src/socket.ts:41-57` (interface) ve `:108-126` (schema)
- Test: `packages/types/src/socket.test.ts`

- [ ] **Step 1: Failing test yaz**

`packages/types/src/socket.test.ts` dosyasının SONUNA ekle:

```ts
test("DMMessagePayloadSchema accepts optional deliveryStatus for optimistic messages", () => {
  const base = {
    id: "m1",
    conversationId: "c1",
    userId: "u1",
    content: "hello",
    replyToId: null,
    threadParentId: null,
    editedAt: null,
    deletedAt: null,
    deletedById: null,
    createdAt: "2026-07-21T00:00:00.000Z",
    author: {
      id: "u1",
      username: "user",
      displayName: null,
      avatarUrl: null,
      status: "ONLINE",
      customStatus: null,
    },
    attachments: [],
    reactions: [],
    replyTo: null,
  };

  assert.equal(DMMessagePayloadSchema.safeParse(base).success, true);

  const failed = DMMessagePayloadSchema.safeParse({ ...base, deliveryStatus: "failed" });
  assert.equal(failed.success, true);
  assert.equal(failed.success && failed.data.deliveryStatus, "failed");

  assert.equal(
    DMMessagePayloadSchema.safeParse({ ...base, deliveryStatus: "delivered" }).success,
    false,
  );
});
```

Dosyanın import'larında `DMMessagePayloadSchema`, `assert`, `test` zaten var (satır 9'da schema import'u mevcut); eksikse ekle.

- [ ] **Step 2: Testin FAIL ettiğini gör**

Run: `pnpm --filter @wizards/types test`
Expected: FAIL — `deliveryStatus: "failed"` parse'ı `success: false` döner (schema alanı tanımıyor; strict/passthrough durumuna göre üçüncü assert de ters düşebilir — önemli olan testin kırmızı olması).

- [ ] **Step 3: Tipi ve şemayı ekle**

`packages/types/src/socket.ts` — interface (satır 41 civarı), `reactions` satırından sonra:

```ts
export interface DMMessagePayload {
  id: string;
  conversationId: string;
  userId: string;
  content: string;
  replyToId: string | null;
  threadParentId: string | null;
  threadSummary?: MessageThreadSummary | undefined;
  editedAt: string | null;
  deletedAt: string | null;
  deletedById: string | null;
  createdAt: string;
  author: DMMessageAuthorPayload;
  attachments: DMMessageAttachmentPayload[];
  reactions: MessageReaction[];
  replyTo: DMMessagePayload | null;
  /** İstemci tarafı optimistic durum — sunucu bu alanı hiç göndermez. */
  deliveryStatus?: "sending" | "failed" | undefined;
}
```

Schema (satır 108 civarı), `replyTo` satırından sonra:

```ts
    replyTo: DMMessagePayloadSchema.nullable(),
    deliveryStatus: z.enum(["sending", "failed"]).optional(),
```

- [ ] **Step 4: Testin PASS ettiğini gör**

Run: `pnpm --filter @wizards/types test`
Expected: PASS (tüm dosya yeşil)

- [ ] **Step 5: Commit (kullanıcı onayı varsa)**

```bash
git add packages/types/src/socket.ts packages/types/src/socket.test.ts
git commit -m "feat(types): add optional deliveryStatus to DMMessagePayload"
```

---

### Task 2: `markMobileMessageFailed` cache fonksiyonu

**Files:**
- Modify: `apps/mobile/src/query/mobile-message-cache.ts` (`updateMobileMessageContent`'ten sonra ekle)
- Test: `apps/mobile/scripts/mobile-message-cache.test.ts`

- [ ] **Step 1: Failing test yaz**

`apps/mobile/scripts/mobile-message-cache.test.ts` — import listesine `markMobileMessageFailed` ekle (mobile-message-cache import bloğuna), sonra dosyaya test ekle (`createData` yardımcıları zaten var):

```ts
test("markMobileMessageFailed flags the matching message and leaves others untouched", () => {
  const data = insertOptimisticMobileMessage(createData(), {
    content: "sending",
    id: "client-1",
  });

  const marked = markMobileMessageFailed(data, "client-1");
  const flat = flattenMobileInfiniteData(marked);
  assert.deepEqual(flat.at(-1), { content: "sending", deliveryStatus: "failed", id: "client-1" });
  assert.deepEqual(
    flat.filter((message) => message.id !== "client-1"),
    flattenMobileInfiniteData(createData()),
  );

  assert.equal(markMobileMessageFailed(marked, "missing-id"), marked);
  assert.equal(markMobileMessageFailed(undefined, "client-1"), undefined);
});
```

- [ ] **Step 2: Testin FAIL ettiğini gör**

Run (dizin: `apps/mobile`): `node --test --import tsx scripts/mobile-message-cache.test.ts`
Expected: FAIL — "markMobileMessageFailed is not exported" / import hatası

- [ ] **Step 3: Fonksiyonu ekle**

`apps/mobile/src/query/mobile-message-cache.ts` — `updateMobileMessageContent`'in hemen üstüne (dosyada `updateMobileMessageById` özel yardımcıdır, aynı dosyadan kullanılır):

```ts
export function markMobileMessageFailed<
  TMessage extends MobileCacheMessage & {
    readonly deliveryStatus?: "sending" | "failed" | undefined;
  },
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
>(
  data: MobileMessageData<TMessage, TPage, TPageParam> | undefined,
  messageId: string,
): MobileMessageData<TMessage, TPage, TPageParam> | undefined {
  return updateMobileMessageById(data, messageId, (message) =>
    message.deliveryStatus === "failed" ? message : { ...message, deliveryStatus: "failed" },
  );
}
```

- [ ] **Step 4: Testin PASS ettiğini gör**

Run (dizin: `apps/mobile`): `node --test --import tsx scripts/mobile-message-cache.test.ts`
Expected: PASS

- [ ] **Step 5: Commit (kullanıcı onayı varsa)**

```bash
git add apps/mobile/src/query/mobile-message-cache.ts apps/mobile/scripts/mobile-message-cache.test.ts
git commit -m "feat(mobile): add markMobileMessageFailed cache helper"
```

---

### Task 3: Send mutation factory rework — invalidate yok, rollback yok, failed işaretle

**Files:**
- Modify: `apps/mobile/src/query/use-mobile-message-mutations.ts:82-206` (options tipi + factory)
- Test: `apps/mobile/scripts/mobile-message-cache.test.ts:384-427` (mevcut "roll back exact snapshots" testi yeniden yazılır)

Yalnız **send** factory'si (`createMobileOptimisticMutationOptions`) değişir. Reaction/edit/delete factory'lerindeki `previousData` rollback davranışı KORUNUR — test dosyasındaki 210/289/310. satır testleri ("optimistic reaction/delete/edit mutations ... restore") bu yüzden DEĞİŞMEDEN yeşil kalmalı; kırmızıya dönerlerse yanlış factory'ye dokunmuşsun demektir.

- [ ] **Step 1: Mevcut testi yeni davranışa göre yeniden yaz (failing)**

`apps/mobile/scripts/mobile-message-cache.test.ts` satır 384-427'deki `"optimistic mutation options insert, replace, and roll back exact snapshots"` testini TAMAMEN şununla değiştir:

```ts
test("optimistic mutation options insert, replace on success, and mark failed on error", async () => {
  const queryClient = new QueryClient();
  const queryKey = ["mobile", "dm-messages", "conversation-1"] as const;
  queryClient.setQueryData(queryKey, createData());
  const failedDrafts: Array<{ clientId: string; content: string }> = [];

  const options = createMobileOptimisticMutationOptions({
    createOptimisticMessage: (input: { content: string }, clientId: string) => ({
      content: input.content,
      id: clientId,
    }),
    getResponseMessage: (response: { message: TestMessage }) => response.message,
    mutationFn: async () => ({ message: { content: "sent", id: "server-1" } }),
    onSendFailed: (clientId, variables) => {
      failedDrafts.push({ clientId, content: variables.content });
    },
    queryClient,
    queryKey,
  });

  const successContext = await options.onMutate!({ content: "sending" }, {} as never);
  assert.match(
    flattenMobileInfiniteData(queryClient.getQueryData(queryKey)).at(-1)!.id,
    /^client-/,
  );
  await options.onSuccess!(
    { message: { content: "sent", id: "server-1" } },
    { content: "sending" },
    successContext,
    {} as never,
  );
  assert.equal(
    flattenMobileInfiniteData(queryClient.getQueryData(queryKey)).at(-1)!.id,
    "server-1",
  );

  const failureContext = await options.onMutate!({ content: "failing" }, {} as never);
  await options.onError!(new Error("failed"), { content: "failing" }, failureContext, {} as never);
  const lastMessage = flattenMobileInfiniteData(queryClient.getQueryData(queryKey)).at(-1)!;
  assert.equal(lastMessage.id, failureContext!.clientId);
  assert.deepEqual(lastMessage, {
    content: "failing",
    deliveryStatus: "failed",
    id: failureContext!.clientId,
  });
  assert.deepEqual(failedDrafts, [{ clientId: failureContext!.clientId, content: "failing" }]);
});
```

Not: `invalidateKeys: [["mobile", "bootstrap"]]` satırı bilinçli silindi — options tipinden kalkıyor.

- [ ] **Step 2: Testin FAIL ettiğini gör**

Run (dizin: `apps/mobile`): `node --test --import tsx scripts/mobile-message-cache.test.ts`
Expected: FAIL — `onSendFailed` bilinmeyen alan / onError sonrası mesaj snapshot'a geri dönmüş (failed işaretlenmemiş)

- [ ] **Step 3: Factory'yi yeniden yaz**

`apps/mobile/src/query/use-mobile-message-mutations.ts`:

1. Import bloğuna `markMobileMessageFailed` ekle (`./mobile-message-cache` import'una).
2. `MobileOptimisticMutationContext` tipini şuna indir:

```ts
type MobileOptimisticMutationContext = {
  readonly clientId: string;
};
```

3. `MobileOptimisticMutationOptions` tipinden `invalidateKeys` alanını SİL, `onSendFailed` ekle ve TMessage kısıtına deliveryStatus ekle:

```ts
type MobileOptimisticMutationOptions<
  TVariables,
  TResponse,
  TMessage extends MobileSendableCacheMessage,
  TPage extends MobileMessagePage<TMessage>,
  TPageParam,
> = {
  readonly createOptimisticMessage: (variables: TVariables, clientId: string) => TMessage;
  readonly getResponseMessage: (response: TResponse) => TMessage;
  readonly mutationFn: MutationFunction<TResponse, TVariables>;
  readonly onSendFailed?: (clientId: string, variables: TVariables) => void;
  readonly queryClient: QueryClient;
  readonly queryKey: QueryKey;
};
```

Dosyanın tip bölümüne (MobileMessagePage'in altına) yardımcı tip ekle:

```ts
type MobileSendableCacheMessage = {
  readonly id: string;
  readonly deliveryStatus?: "sending" | "failed" | undefined;
};
```

4. `createMobileOptimisticMutationOptions` gövdesini şununla değiştir (generic imzada `TMessage extends MobileSendableCacheMessage`):

```ts
export function createMobileOptimisticMutationOptions<
  TVariables,
  TResponse,
  TMessage extends MobileSendableCacheMessage,
  TPage extends MobileMessagePage<TMessage>,
  TPageParam = string | null,
>(options: MobileOptimisticMutationOptions<TVariables, TResponse, TMessage, TPage, TPageParam>) {
  type TData = InfiniteData<TPage, TPageParam>;
  type TContext = MobileOptimisticMutationContext;

  return mutationOptions<TResponse, Error, TVariables, TContext>({
    mutationFn: options.mutationFn,
    onError: (_error, variables, context) => {
      if (!context) {
        return;
      }

      options.queryClient.setQueryData<TData>(options.queryKey, (current) =>
        markMobileMessageFailed(current, context.clientId),
      );
      options.onSendFailed?.(context.clientId, variables);
    },
    onMutate: async (variables) => {
      await options.queryClient.cancelQueries({ queryKey: options.queryKey });
      const clientId = createMobileOptimisticMessageId();
      const optimisticMessage = options.createOptimisticMessage(variables, clientId);
      options.queryClient.setQueryData<TData>(options.queryKey, (current) =>
        insertOptimisticMobileMessage(current, optimisticMessage),
      );
      return { clientId };
    },
    onSuccess: (response, _variables, context) => {
      if (!context) {
        return;
      }

      const message = options.getResponseMessage(response);
      options.queryClient.setQueryData<TData>(options.queryKey, (current) =>
        replaceMobileMessage(current, context.clientId, message),
      );
    },
  });
}
```

(`onSettled` bloğu tamamen gitti.)

5. Bu dosyadaki iki çağrı yerinden `invalidateKeys` satırlarını sil: `useMobileChannelMessageMutation` (`invalidateKeys: [mobileQueryKeys.bootstrap()]`) ve `useMobileDMMessageMutation` (`invalidateKeys: [mobileQueryKeys.bootstrap(), mobileQueryKeys.dmConversations()]`).

- [ ] **Step 4: Test + typecheck**

Run (dizin: `apps/mobile`): `node --test --import tsx scripts/mobile-message-cache.test.ts`
Expected: PASS
Run: `pnpm --filter @wizards/mobile typecheck`
Expected: PASS (mutations dosyası içinde hata yok; başka dosya kırılırsa Task 4-5 kapsamındadır, not al)

- [ ] **Step 5: Commit (kullanıcı onayı varsa)**

```bash
git add apps/mobile/src/query/use-mobile-message-mutations.ts apps/mobile/scripts/mobile-message-cache.test.ts
git commit -m "feat(mobile): mark failed sends in place, drop send invalidation storm"
```

---

### Task 4: Send hook'larına retry/discard API'si

**Files:**
- Modify: `apps/mobile/src/query/use-mobile-message-mutations.ts` (`useMobileChannelMessageMutation`, `useMobileDMMessageMutation`)

Hook'lar artık `{ discardFailedMessage, mutation, retryFailedMessage }` döner. Saf mantık Task 2-3'te test edildi; hook katmanı typecheck ile doğrulanır (repo'da RN render testi altyapısı yok).

- [ ] **Step 1: Kanal hook'unu yeniden yaz**

Dosya başına `import { useCallback, useRef } from "react";` ekle. `useMobileChannelMessageMutation`'ı şununla değiştir (createOptimisticMessage/mutationFn gövdeleri MEVCUT halinden aynen korunur):

```ts
export function useMobileChannelMessageMutation(input: {
  readonly author: MobileSessionUser | null;
  readonly channelId: string;
  readonly client: MobileApiClient;
}) {
  const queryClient = useQueryClient();
  const queryKey = mobileQueryKeys.channelMessages(input.channelId);
  const failedDraftsRef = useRef(new Map<string, MobileChannelDraft>());

  const mutation = useMutation(
    createMobileOptimisticMutationOptions<
      MobileChannelDraft,
      MobileChannelSendMessageResponse,
      ChatMessage,
      MobileChannelMessagesResponse
    >({
      createOptimisticMessage: (draft, clientId) => ({
        attachments: [],
        author: {
          ...requireMobileMutationAuthor(input.author),
          displayName:
            requireMobileMutationAuthor(input.author).displayName ??
            requireMobileMutationAuthor(input.author).username,
        },
        channelId: input.channelId,
        content: draft.content,
        createdAt: new Date().toISOString(),
        deletedAt: null,
        deliveryStatus: "sending",
        editedAt: null,
        id: clientId,
        reactions: [],
        replyTo: null,
        threadParentId: draft.threadParentId ?? null,
        type: "DEFAULT",
      }),
      getResponseMessage: (response) => response.message,
      mutationFn: (draft) =>
        sendMobileChannelMessage(input.client, { ...draft, channelId: input.channelId }),
      onSendFailed: (clientId, draft) => {
        failedDraftsRef.current.set(clientId, draft);
      },
      queryClient,
      queryKey,
    }),
  );

  const discardFailedMessage = useCallback(
    (messageId: string) => {
      failedDraftsRef.current.delete(messageId);
      queryClient.setQueryData<InfiniteData<MobileChannelMessagesResponse, string | null>>(
        queryKey,
        (current) => removeMobileMessage(current, messageId),
      );
    },
    [queryClient, queryKey],
  );

  const retryFailedMessage = useCallback(
    (messageId: string): boolean => {
      const draft = failedDraftsRef.current.get(messageId);
      if (!draft) {
        return false;
      }
      failedDraftsRef.current.delete(messageId);
      queryClient.setQueryData<InfiniteData<MobileChannelMessagesResponse, string | null>>(
        queryKey,
        (current) => removeMobileMessage(current, messageId),
      );
      mutation.mutate(draft);
      return true;
    },
    [mutation, queryClient, queryKey],
  );

  return { discardFailedMessage, mutation, retryFailedMessage };
}
```

- [ ] **Step 2: DM hook'unu aynı kalıpla yeniden yaz**

`useMobileDMMessageMutation` aynı yapıya geçer: `failedDraftsRef: Map<string, MobileDMDraft>`, aynı `discardFailedMessage`/`retryFailedMessage` (cache tipi `InfiniteData<MobileDMMessagesResponse, string | null>`), `onSendFailed` aynı. Optimistic mesaja `deliveryStatus: "sending",` satırı eklenir (`deletedById: null,` satırından sonra, alfabetik konum: `createdAt`...`deletedById`'den sonra `deliveryStatus`). Dönüş: `{ discardFailedMessage, mutation, retryFailedMessage }`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @wizards/mobile typecheck`
Expected: FAIL — yalnız `use-mobile-messaging-feature.ts` çağrı yerleri kırık (dönüş şekli değişti). Başka dosya kırığı beklenmez; varsa incele.

- [ ] **Step 4: Commit YOK** (feature hook ile birlikte Task 5 sonunda commit edilir — typecheck kırıkken commit atma)

---

### Task 5: Feature hook — fire-and-forget send + retry/discard + sendState söküm

**Files:**
- Modify: `apps/mobile/src/app/features/use-mobile-messaging-feature.ts`

- [ ] **Step 1: Hook çağrılarını ve destructure'ları güncelle**

Satır 216-228 bölgesindeki destructure'ları değiştir. Önce hook çağrıları (`channelMessageMutation`/`dmMessageMutation` değişken adları `channelMessageControls`/`dmMessageControls` olur), sonra:

```ts
const {
  discardFailedMessage: discardFailedChannelMessage,
  mutation: channelMessageMutation,
  retryFailedMessage: retryFailedChannelMessage,
} = channelMessageControls;
const {
  discardFailedMessage: discardFailedDMMessage,
  mutation: dmMessageMutation,
  retryFailedMessage: retryFailedDMMessage,
} = dmMessageControls;
const { mutate: sendChannelMessage } = channelMessageMutation;
const { mutate: sendDMMessage } = dmMessageMutation;
```

`isChannelSendError`, `isChannelSending`, `isDMSendError`, `isDMSending` destructure'larını SİL. `resetChannelMessageMutation`/`resetDMMessageMutation` kullanımlarını grep'le: yalnız sendState hata temizliği içinse effect'leriyle birlikte sil; başka amaçla kullanılıyorsa `channelMessageMutation.reset` üzerinden koru.

- [ ] **Step 2: `handleSendChannelMessage`/`handleSendDMMessage` fire-and-forget yap**

İmzalar `Promise<boolean>` kalır (ekran/composer sözleşmesi değişmez), ama ağ beklenmez:

```ts
const handleSendDMMessage = useCallback(
  async (
    content: string,
    intent?: {
      readonly attachments?: readonly UploadedAttachmentInput[];
      readonly replyToId?: string;
      readonly threadParentId?: string;
    },
  ): Promise<boolean> => {
    const trimmedContent = content.trim();
    const attachments = intent?.attachments ?? [];

    if (
      !isSignedIn ||
      !selectedDMConversationId ||
      (trimmedContent.length === 0 && attachments.length === 0)
    ) {
      return false;
    }

    stopDMTyping(selectedDMConversationId);
    sendDMMessage({
      content: trimmedContent,
      ...(attachments.length > 0 ? { attachments: [...attachments] } : {}),
      ...(intent?.replyToId ? { replyToId: intent.replyToId } : {}),
      ...(intent?.threadParentId ? { threadParentId: intent.threadParentId } : {}),
    });
    return true;
  },
  [isSignedIn, selectedDMConversationId, sendDMMessage, stopDMTyping],
);
```

`handleSendChannelMessage` aynı kalıp (`activeWorkspaceTextChannelId`, `stopChannelTyping`, `sendChannelMessage`; try/catch blokları silinir — hata artık mutation onError'unda failed işareti olarak akar).

GIF handler'ları: `createMobileGiphyAttachment` await'i KALIR (gönderim öncesi gerçek iş), ardından `sendDMMessage({ attachments: [input], content: "" }); return true;` — try/catch yalnız giphy çağrısını sarar.

- [ ] **Step 3: Retry/discard handler'larını ekle ve export et**

```ts
const handleRetryChannelMessage = useCallback(
  (messageId: string) => {
    if (!isSignedIn) return;
    retryFailedChannelMessage(messageId);
  },
  [isSignedIn, retryFailedChannelMessage],
);
const handleDiscardChannelMessage = useCallback(
  (messageId: string) => discardFailedChannelMessage(messageId),
  [discardFailedChannelMessage],
);
const handleRetryDMMessage = useCallback(
  (messageId: string) => {
    if (!isSignedIn) return;
    retryFailedDMMessage(messageId);
  },
  [isSignedIn, retryFailedDMMessage],
);
const handleDiscardDMMessage = useCallback(
  (messageId: string) => discardFailedDMMessage(messageId),
  [discardFailedDMMessage],
);
```

Return objesine (satır ~977 bölgesindeki export listesi) alfabetik yerlerine ekle: `handleDiscardChannelMessage`, `handleDiscardDMMessage`, `handleRetryChannelMessage`, `handleRetryDMMessage`.

- [ ] **Step 4: sendState hesaplamalarını sök**

Satır 269-278'deki `channelSendState`/`dmSendState` bloklarını ve return objesindeki `channelSendState`/`dmSendState` satırlarını sil. `MobileChannelSendViewState`/`MobileDMSendViewState` import'unu (satır 60) sil.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @wizards/mobile typecheck`
Expected: FAIL — artık YALNIZ tüketici taraf kırık: `mobile-product-app.tsx`, ekranlar (`channel-screen`, `dm-conversation-screen`, `dm-screen*`, `home-screen`, `workspace-browser`, `message-thread-screen`) ve composer'ın sendState prop'ları. Bunlar Task 6'da temizlenir. `use-mobile-messaging-feature.ts` içinde hata KALMAMALI.

- [ ] **Step 6: Commit YOK** (Task 6 ile birlikte)

---

### Task 6: Composer senkron temizleme + sendState plumbing'inin repo çapında sökümü

**Files:**
- Modify: `apps/mobile/src/app/composer/mobile-composer.tsx`
- Modify: `apps/mobile/src/app/mobile-screen-state.ts:57-67` ve `:170-197` (tipler + INITIAL sabitleri)
- Modify: `apps/mobile/src/app/mobile-root-screen-shared.ts:139-145` (re-export'lar)
- Modify: `apps/mobile/src/app/screens/channel-screen.tsx`, `dm-conversation-screen.tsx`, `dm-screen.types.ts`, `dm-screen.tsx`, `home-screen.tsx`, `workspace-browser.tsx`, `message-thread-screen.tsx`, `apps/mobile/src/app/mobile-product-app.tsx` (sendState prop zinciri)

- [ ] **Step 1: Composer `handleSend`'i senkron yap**

`mobile-composer.tsx:182-206` bloğunu şununla değiştir:

```tsx
const handleSend = useCallback(() => {
  if (isDisabled) {
    return;
  }

  const content = trimmedDraft;
  const attachments =
    usesUploadedAttachments && channelAttachments.length > 0 ? channelAttachments : undefined;

  setDraft("");
  setChannelAttachmentDrafts([]);
  setChannelAttachmentUploadError(null);
  onDraftChange?.("");
  onCancelIntent?.();
  void onSend(content, attachments);
}, [
  channelAttachments,
  isDisabled,
  onCancelIntent,
  onDraftChange,
  onSend,
  trimmedDraft,
  usesUploadedAttachments,
]);
```

- [ ] **Step 2: Composer'dan gönderim kilidini ve sendState'i sök**

`mobile-composer.tsx` içinde:
- Prop'lardan `sendState` ve `sendingActionLabel` satırlarını sil (hem parametre hem tip; satır 66-67, 83-84).
- Satır 118 `const isSending = sendState.status === "sending";` sil.
- `isDisabled` (satır 130-135) ve satır 363 civarındaki ikinci kullanımdan `isSending ||` terimini sil.
- Satır 537-539, 775-777, 948-950'deki `sendState.status === "error"` hata metni bloklarını sil (failed durum artık balonda).
- Satır 752/765/927/939'daki `isSending ? sendingActionLabel : sendActionLabel` ve `isSending ? "hourglass-outline" : "paper-plane"` ifadelerini `sendActionLabel` / `"paper-plane"` sabitlerine indir.
- Import'lardan `MobileChannelSendViewState`, `MobileDMSendViewState` kalksın; `copy.dmSendingAction` referansı kalmadıysa dokunma (copy anahtarı dursun, zararsız).

- [ ] **Step 3: Tip ve sabitleri sil**

- `mobile-screen-state.ts`: `MobileDMSendViewState` (57-61), `MobileChannelSendViewState` (63-67), `INITIAL_DM_SEND_STATE` (170 bölgesi), `INITIAL_CHANNEL_SEND_STATE` (190 bölgesi) tanımlarını sil.
- `mobile-root-screen-shared.ts`: 139. satırdaki `INITIAL_*` export'u ve 143/145'teki tip re-export satırlarını sil.

- [ ] **Step 4: Typecheck'i pusula yap, tüketicileri temizle**

Run: `pnpm --filter @wizards/mobile typecheck` → her hata bir temizlik noktası. Beklenen temizlikler:
- `channel-screen.tsx`: `sendState` prop'ları (120, 615, 634), `channelSendState` hesapları (129, 638-639), composer'a geçilen `sendState={...}` (706) ve `sendingActionLabel` (707); `INITIAL_CHANNEL_SEND_STATE` import'u.
- `dm-conversation-screen.tsx`: `sendState` prop'ları (81, 209), `conversationSendState` (246-247), composer `sendState={conversationSendState}` (305); `INITIAL_DM_SEND_STATE` import'u.
- `dm-screen.types.ts` (24) ve `dm-screen.tsx`: `dmSendState` alanı/geçişi.
- `home-screen.tsx` (93, 461), `workspace-browser.tsx` (95): `channelSendState` prop zinciri.
- `message-thread-screen.tsx`: varsa aynı kalıp.
- `mobile-product-app.tsx`: feature hook'tan `channelSendState`/`dmSendState` okuyan ve ekranlara geçiren satırlar.

Expected sonuç: `pnpm --filter @wizards/mobile typecheck` PASS.

- [ ] **Step 5: Mobil test paketi**

Run: `pnpm --filter @wizards/mobile test`
Expected: PASS (composer'ın kendisi için test yok; kırılan varsa sendState referansıdır, temizle)

- [ ] **Step 6: Commit (kullanıcı onayı varsa)**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): clear composer instantly and drop send-state locking"
```

---

### Task 7: Failed balon UI + retry/discard aksiyonları + copy

**Files:**
- Modify: `apps/mobile/src/locale/mobile-copy.ts` (TR ~satır 340 bölgesi, EN ~satır 1445 bölgesi)
- Modify: `apps/mobile/src/app/components/message-primitives.tsx` (`MessagePreviewRow`, `MessageStream`)
- Modify: `apps/mobile/src/app/components/message-primitives.styles.ts`
- Modify: `onDeleteMessage` prop'unun aktığı HER yer (ekranlar → MessageStream → MessagePreviewRow zinciri; `dm-chat-primitives.tsx` dahilse o da)

- [ ] **Step 1: Copy anahtarlarını ekle (TR + EN, alfabetik konumda)**

TR sözlüğüne:

```ts
messageDiscardFailedAction: "Vazgeç ve sil",
messageRetrySendAction: "Tekrar dene",
messageSendFailedLabel: "Gönderilemedi — bağlantını kontrol et",
```

EN sözlüğüne:

```ts
messageDiscardFailedAction: "Discard message",
messageRetrySendAction: "Retry",
messageSendFailedLabel: "Couldn't send — check your connection",
```

- [ ] **Step 2: `MessagePreviewRow`'a failed durumu ekle**

`message-primitives.tsx` — `MessagePreviewRow` props'una ekle:

```ts
onDiscardFailedMessage?(messageId: string): void;
onRetryFailedMessage?(messageId: string): void;
```

Bileşen gövdesinin başına (satır ~591, `isChannelMode` yanına):

```ts
const isFailed = message.deliveryStatus === "failed";
```

`messageActions` useMemo'sunu failed dalıyla sarmala — failed mesajda TEK aksiyon seti retry/discard olur (kopyala kalabilir, reply/edit/thread/reaction anlamsız):

```ts
const messageActions = useMemo<readonly ContextMenuAction[]>(() => {
  if (isFailed) {
    return [
      ...(onRetryFailedMessage
        ? [
            {
              id: "retry-send",
              label: copy.messageRetrySendAction,
              onPress: () => onRetryFailedMessage(message.id),
            },
          ]
        : []),
      ...(message.content
        ? [
            {
              id: "copy",
              label: copy.messageCopyAction,
              onPress: () => {
                void Clipboard.setStringAsync(message.content).catch(() => {
                  Alert.alert(copy.messageCopyFailedTitle, copy.messageCopyFailedDescription);
                });
              },
            },
          ]
        : []),
      ...(onDiscardFailedMessage
        ? [
            {
              destructive: true,
              id: "discard-failed",
              label: copy.messageDiscardFailedAction,
              onPress: () => onDiscardFailedMessage(message.id),
            },
          ]
        : []),
    ];
  }

  return [
    // ... MEVCUT aksiyon listesi aynen ...
  ];
}, [
  currentUserId,
  isFailed,
  message,
  onDeleteMessage,
  onDiscardFailedMessage,
  onEditMessage,
  onOpenThread,
  onRetryFailedMessage,
  onReplyMessage,
  onToggleReaction,
  own,
]);
```

Balonun altına (bubble içeriğinin kapandığı, reactions listesinden önceki noktaya) failed satırı ekle:

```tsx
{isFailed ? (
  <View style={styles.messageFailedRow} testID={`mobile-message-failed-${message.id}`}>
    <Icon name="alert-circle" size={14} tone="danger" />
    <Text style={styles.messageFailedText}>{copy.messageSendFailedLabel}</Text>
    {onRetryFailedMessage ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.messageRetrySendAction}
        onPress={() => onRetryFailedMessage(message.id)}
        testID={`mobile-message-retry-${message.id}`}
      >
        <Text style={styles.messageFailedAction}>{copy.messageRetrySendAction}</Text>
      </Pressable>
    ) : null}
  </View>
) : null}
```

`Icon` kit'te `alert-circle`/`danger` tone yoksa mevcut ikon adlarına bak (`apps/mobile/src/app/components/kit/icon.tsx`) ve en yakın uyarı ikonunu kullan. Ayrıca gönderilmekte olan mesaj (`deliveryStatus === "sending"`) için opaklık düşür: bubble container style dizisine `message.deliveryStatus === "sending" && styles.messageSendingDim` ekle.

- [ ] **Step 3: Stilleri ekle**

`message-primitives.styles.ts` içine (mevcut adlandırma düzenini takip ederek):

```ts
messageFailedAction: {
  color: theme.colors.danger,
  fontSize: 12,
  fontWeight: "700",
},
messageFailedRow: {
  alignItems: "center",
  flexDirection: "row",
  gap: 6,
  marginTop: 4,
},
messageFailedText: {
  color: theme.colors.danger,
  fontSize: 12,
},
messageSendingDim: {
  opacity: 0.6,
},
```

(Tema renk anahtarı `danger` değilse dosyadaki mevcut hata rengini kullan — stil dosyasında geçen error/danger token'ına bak.)

- [ ] **Step 4: Prop'ları zincir boyunca geçir**

Kural: `onDeleteMessage` hangi yoldan `MessagePreviewRow`'a akıyorsa `onRetryFailedMessage`/`onDiscardFailedMessage` aynı yoldan akar:
- `MessageStream` (message-primitives.tsx:496) props + render çağrısı.
- `dm-chat-primitives.tsx` mesaj satırı render ediyorsa oraya da.
- `channel-screen.tsx` ve `dm-conversation-screen.tsx` ekran props'ları (`onRetryMessage(messageId)`, `onDiscardMessage(messageId)` adlarıyla üst seviyeye).
- `message-thread-screen.tsx` aynı kalıp.
- `mobile-product-app.tsx` (veya ekranları bağlayan üst bileşen): feature hook'tan `handleRetryChannelMessage`/`handleDiscardChannelMessage` kanal ekranına, `handleRetryDMMessage`/`handleDiscardDMMessage` DM ekranlarına bağlanır.

- [ ] **Step 5: Typecheck + test**

Run: `pnpm --filter @wizards/mobile typecheck`
Expected: PASS
Run: `pnpm --filter @wizards/mobile test`
Expected: PASS

- [ ] **Step 6: Commit (kullanıcı onayı varsa)**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): failed message bubble with retry and discard"
```

---

### Task 8: Uçtan uca doğrulama

- [ ] **Step 1: Tüm doğrulamalar**

```bash
pnpm --filter @wizards/types test
pnpm --filter @wizards/mobile test
pnpm --filter @wizards/mobile typecheck
pnpm --filter @wizards/web typecheck
```

Expected: hepsi PASS. (`tsc6`/tsx ENOENT görürsen: `pnpm install --force`, store onarımı ~35s.)

- [ ] **Step 2: Davranış kontrol listesi (Expo üzerinde manuel veya emülatörde)**

1. DM'de mesaj yaz + gönder → yazı alanı ANINDA boşalır, mesaj listede "sending" soluklukta, sunucu onayıyla normale döner.
2. Arka arkaya 3-4 mesaj hızlıca gönder → composer hiç kilitlenmez, sıra korunur.
3. Uçak modunu aç, mesaj gönder → balon failed durumuna düşer, "Tekrar dene" görünür; uçak modunu kapat, retry → mesaj gider.
4. Failed mesajda uzun bas → yalnız Tekrar dene / Kopyala / Vazgeç ve sil aksiyonları.
5. Kanal tarafında 1-4'ü tekrarla.
6. Karşı taraftan gelen mesajın düşüşünde gerileme yok (realtime köprü değişmedi).

- [ ] **Step 3: Commit durumunu kullanıcıya raporla**

Commit onayı verilmediyse: değişen dosya listesini ve önerilen commit bölümlemesini kullanıcıya sun.
