import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DMConversationDTOSchema,
  GroupCallStateResponseSchema,
  GroupDMConversationResponseSchema,
  GroupInviteJoinResponseSchema,
  GroupInvitePreviewResponseSchema,
  GroupInviteResponseSchema,
  type DMConversationDTO,
  type DMNotifyLevel,
  type GroupCallStateDTO,
  type GroupDMCreateRequest,
  type GroupDMSettingsUpdateRequest,
  type GroupDMUpdateRequest,
  type GroupInviteDTO,
  type GroupInvitePreviewDTO,
  type GroupMemberRoleUpdateRequest,
  type MobileDMConversationListItem,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import {
  patchMobileGroupConversationRow,
  type MobileDMConversationsInfiniteData,
} from "../query/mobile-group-cache";
import { mobileQueryKeys } from "../query/mobile-query-keys";

const MOBILE_GROUPS_PATH = "/api/v1/mobile/dm/groups";
const MOBILE_DM_PATH = "/api/v1/mobile/dm";
const MOBILE_GROUP_INVITES_PATH = "/api/v1/mobile/group-invites";

function buildGroupPath(conversationId: string): string {
  return `${MOBILE_GROUPS_PATH}/${encodeURIComponent(conversationId)}`;
}

function buildConversationPath(conversationId: string): string {
  return `${MOBILE_DM_PATH}/${encodeURIComponent(conversationId)}`;
}

function buildInvitePath(code: string, suffix: string): string {
  return `${MOBILE_GROUP_INVITES_PATH}/${encodeURIComponent(code)}${suffix}`;
}

async function parseGroupInvite(payload: unknown): Promise<GroupInviteDTO> {
  return GroupInviteResponseSchema.parse(payload).invite;
}

/**
 * The routes hand back `{ conversation }` and nothing else, so every writer
 * re-parses rather than trusting the shape: mobile ships on its own train and a
 * server-side drift has to fail loudly here instead of half-rendering a screen.
 */
async function parseGroupConversation(payload: unknown): Promise<DMConversationDTO> {
  return GroupDMConversationResponseSchema.parse(payload).conversation;
}

export async function createMobileGroup(
  client: MobileApiClient,
  input: GroupDMCreateRequest,
): Promise<DMConversationDTO> {
  return await parseGroupConversation(
    await client.requestJson<unknown>(MOBILE_GROUPS_PATH, {
      body: input,
      method: "POST",
    }),
  );
}

export async function addMobileGroupMembers(
  client: MobileApiClient,
  conversationId: string,
  userIds: readonly string[],
): Promise<DMConversationDTO> {
  return await parseGroupConversation(
    await client.requestJson<unknown>(`${buildGroupPath(conversationId)}/members`, {
      body: { userIds: [...userIds] },
      method: "POST",
    }),
  );
}

export async function updateMobileGroup(
  client: MobileApiClient,
  conversationId: string,
  patch: GroupDMUpdateRequest,
): Promise<DMConversationDTO> {
  return await parseGroupConversation(
    await client.requestJson<unknown>(buildGroupPath(conversationId), {
      body: patch,
      method: "PATCH",
    }),
  );
}

/**
 * Removing yourself is how leaving is spelled; the server routes it either way.
 *
 * V8 / Faz 5 §D1.5: the handover rides on this same request rather than a second
 * one. Two calls would let the promotion land without the departure — or, worse,
 * the departure without the promotion, which is the state the server's
 * `409 OWNER_TRANSFER_REQUIRED` exists to forbid.
 */
export async function removeMobileGroupMember(
  client: MobileApiClient,
  conversationId: string,
  userId: string,
  transferOwnershipTo?: string,
): Promise<void> {
  await client.requestJson<unknown>(
    `${buildGroupPath(conversationId)}/members/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      ...(transferOwnershipTo === undefined ? {} : { body: { transferOwnershipTo } }),
    },
  );
}

/**
 * K8: mute and hide are the participant's own switches, shared with 1:1 DMs.
 * They live here because the group details screen is their only mobile caller.
 */
export async function setMobileDMMuted(
  client: MobileApiClient,
  conversationId: string,
  muted: boolean,
): Promise<void> {
  await client.requestJson<unknown>(
    `/api/v1/mobile/dm/${encodeURIComponent(conversationId)}/mute`,
    { body: { muted }, method: "PATCH" },
  );
}

export async function hideMobileDMConversation(
  client: MobileApiClient,
  conversationId: string,
): Promise<void> {
  await client.requestJson<unknown>(buildConversationPath(conversationId), {
    method: "DELETE",
  });
}

/* ------------------------------------------------------------------------- *
 * Faz 3 §B5. Ten writes and two reads over the endpoints Faz 1 and Faz 2 added.
 * Every one of them re-parses the response for the same reason the four above
 * do: mobile ships on its own train, so a server-side drift has to fail loudly
 * here instead of half-rendering a screen.
 * ------------------------------------------------------------------------- */

/**
 * Faz 5 §C1/§D1. The read 2e and 2f open on. It is the *same shape* the writes
 * answer with and the realtime events patch, so a screen that opened cold and a
 * screen that has been patched for an hour are looking at one object.
 */
export async function fetchMobileGroupDetails(
  client: MobileApiClient,
  conversationId: string,
): Promise<DMConversationDTO> {
  return await parseGroupConversation(
    await client.requestJson<unknown>(buildGroupPath(conversationId)),
  );
}

/**
 * Faz 5 §B5. The banner's opening value. `dm:call:state` only fires on a
 * transition, so a reader who opens a group while a call is already running has
 * never seen one.
 */
export async function fetchMobileGroupCallState(
  client: MobileApiClient,
  conversationId: string,
): Promise<GroupCallStateDTO> {
  return GroupCallStateResponseSchema.parse(
    await client.requestJson<unknown>(`${buildGroupPath(conversationId)}/call`),
  ).callState;
}

/** 2f §3/§4 + 2c §7. A partial patch — an absent key means "leave it alone". */
export async function updateMobileGroupSettings(
  client: MobileApiClient,
  conversationId: string,
  patch: GroupDMSettingsUpdateRequest,
): Promise<DMConversationDTO> {
  return await parseGroupConversation(
    await client.requestJson<unknown>(`${buildGroupPath(conversationId)}/settings`, {
      body: patch,
      method: "PATCH",
    }),
  );
}

/** 2e §7. Promote, demote, or hand the group over — one endpoint, one union. */
export async function updateMobileGroupMemberRole(
  client: MobileApiClient,
  conversationId: string,
  userId: string,
  patch: GroupMemberRoleUpdateRequest,
): Promise<DMConversationDTO> {
  return await parseGroupConversation(
    await client.requestJson<unknown>(
      `${buildGroupPath(conversationId)}/members/${encodeURIComponent(userId)}`,
      { body: patch, method: "PATCH" },
    ),
  );
}

/** 2d §2 / 2e §4. `null` unpins; the two verbs are one call site here. */
export async function setMobileGroupPinnedMessage(
  client: MobileApiClient,
  conversationId: string,
  messageId: string | null,
): Promise<DMConversationDTO> {
  return await parseGroupConversation(
    await client.requestJson<unknown>(
      `${buildGroupPath(conversationId)}/pin`,
      messageId === null ? { method: "DELETE" } : { body: { messageId }, method: "PUT" },
    ),
  );
}

/**
 * 2d §2's close button. The id travels because the dismissal is about that pin:
 * a dismissal that only said "hide the strip" would also hide the next pin, which
 * this reader has never seen.
 */
export async function dismissMobileGroupPinnedStrip(
  client: MobileApiClient,
  conversationId: string,
  messageId: string,
): Promise<void> {
  await client.requestJson<unknown>(`${buildGroupPath(conversationId)}/pin/dismiss`, {
    body: { messageId },
    method: "POST",
  });
}

/**
 * 2f §2. The authority behind the row's muted look; `PATCH /mute` stays only for
 * clients that predate this endpoint (§4.2 — one write moves both columns).
 */
export async function setMobileConversationNotifyLevel(
  client: MobileApiClient,
  conversationId: string,
  notifyLevel: DMNotifyLevel,
): Promise<{ notifyLevel: DMNotifyLevel }> {
  await client.requestJson<unknown>(`${buildConversationPath(conversationId)}/notify`, {
    body: { notifyLevel },
    method: "PATCH",
  });

  return { notifyLevel };
}

/** V3 / 2a §2. Per participant, and valid on a 1:1 row as well as a group. */
export async function setMobileConversationPinned(
  client: MobileApiClient,
  conversationId: string,
  pinned: boolean,
): Promise<void> {
  await client.requestJson<unknown>(`${buildConversationPath(conversationId)}/pin`, {
    body: { pinned },
    method: "PATCH",
  });
}

/** 2f §4's invite row. Membership is enough to read it; `editInfo` to change it. */
export async function fetchMobileGroupInvite(
  client: MobileApiClient,
  conversationId: string,
): Promise<GroupInviteDTO> {
  return await parseGroupInvite(
    await client.requestJson<unknown>(`${buildGroupPath(conversationId)}/invite`),
  );
}

/** K2: switching it off keeps the row and stops returning the code. */
export async function setMobileGroupInviteEnabled(
  client: MobileApiClient,
  conversationId: string,
  enabled: boolean,
): Promise<GroupInviteDTO> {
  return await parseGroupInvite(
    await client.requestJson<unknown>(`${buildGroupPath(conversationId)}/invite`, {
      body: { enabled },
      method: "PATCH",
    }),
  );
}

/** A new code, `uses` back to zero; the old link stops resolving. */
export async function rotateMobileGroupInvite(
  client: MobileApiClient,
  conversationId: string,
): Promise<GroupInviteDTO> {
  return await parseGroupInvite(
    await client.requestJson<unknown>(`${buildGroupPath(conversationId)}/invite/rotate`, {
      method: "POST",
    }),
  );
}

/** The stranger's view of a `/g/<code>` link: no member list, ever. */
export async function previewMobileGroupInvite(
  client: MobileApiClient,
  code: string,
): Promise<GroupInvitePreviewDTO> {
  return GroupInvitePreviewResponseSchema.parse(
    await client.requestJson<unknown>(buildInvitePath(code, "/preview")),
  ).preview;
}

/**
 * Redeeming the link. The response carries the conversation *plus*
 * `alreadyMember`, which the strict conversation schema rejects, so the envelope
 * and the DTO are parsed in two steps against the shared schemas.
 */
export async function joinMobileGroupViaInvite(
  client: MobileApiClient,
  code: string,
): Promise<{ alreadyMember: boolean; conversation: DMConversationDTO }> {
  const envelope = GroupInviteJoinResponseSchema.parse(
    await client.requestJson<unknown>(buildInvitePath(code, "/join"), { method: "POST" }),
  );

  return {
    alreadyMember: envelope.alreadyMember,
    conversation: DMConversationDTOSchema.parse(envelope.conversation),
  };
}

/**
 * Every one of the four writes moves the inbox row — its title, its avatar
 * stack, its member count — so they all invalidate the conversation list. A
 * mutation that skipped it would leave the row describing a group that no longer
 * exists in that shape.
 */
export function useMobileGroupMutations(client: MobileApiClient, viewerId?: string) {
  const queryClient = useQueryClient();
  const refreshConversations = () =>
    queryClient.invalidateQueries({ queryKey: mobileQueryKeys.dmConversations() });
  // The detail screen is the surface the write was made from, so it is refreshed
  // alongside the inbox rather than waiting for the realtime echo.
  const refreshConversationAndDetails = (conversationId: string) =>
    Promise.all([
      refreshConversations(),
      queryClient.invalidateQueries({ queryKey: mobileQueryKeys.dmDetails(conversationId) }),
    ]);
  /**
   * Removing yourself is leaving, and the details read requires participation —
   * refetching it would only earn a 403. The inbox row still has to go.
   *
   * It is deliberately **not** awaited on that branch. React Query resolves
   * `mutateAsync` only after `onSuccess` settles, so returning the invalidation
   * held the caller — every leave handler navigates in its `.then` — on screen
   * for a second round trip, showing the reader the group chat they had just
   * left. Nothing they are about to look at depends on that refetch landing
   * first; the inbox they are being sent to re-renders when it does.
   */
  const refreshAfterRemoval = (conversationId: string, removedUserId: string) => {
    if (viewerId !== undefined && removedUserId === viewerId) {
      void refreshConversations();
      return;
    }

    return refreshConversationAndDetails(conversationId);
  };

  return {
    addMembers: useMutation({
      mutationFn: (input: { conversationId: string; userIds: readonly string[] }) =>
        addMobileGroupMembers(client, input.conversationId, input.userIds),
      onSuccess: (_data, input) => refreshConversationAndDetails(input.conversationId),
    }),
    create: useMutation({
      mutationFn: (input: GroupDMCreateRequest) => createMobileGroup(client, input),
      onSuccess: refreshConversations,
    }),
    hide: useMutation({
      mutationFn: (input: { conversationId: string }) =>
        hideMobileDMConversation(client, input.conversationId),
      onSuccess: refreshConversations,
    }),
    setMuted: useMutation({
      mutationFn: (input: { conversationId: string; muted: boolean }) =>
        setMobileDMMuted(client, input.conversationId, input.muted),
      onSuccess: (_data, input) => refreshConversationAndDetails(input.conversationId),
    }),
    removeMember: useMutation({
      mutationFn: (input: {
        conversationId: string;
        transferOwnershipTo?: string;
        userId: string;
      }) =>
        removeMobileGroupMember(
          client,
          input.conversationId,
          input.userId,
          input.transferOwnershipTo,
        ),
      onSuccess: (_data, input) => refreshAfterRemoval(input.conversationId, input.userId),
    }),
    update: useMutation({
      mutationFn: (input: { conversationId: string; patch: GroupDMUpdateRequest }) =>
        updateMobileGroup(client, input.conversationId, input.patch),
      onSuccess: (_data, input) => refreshConversationAndDetails(input.conversationId),
    }),
  };
}

/**
 * Faz 5 §C1. The one read three screens share (2d's header, 2e, 2f), so they
 * cannot disagree about a permission or a role: `staleTime` keeps a back-press
 * from re-fetching, and every write and every realtime event already patches
 * this exact key.
 */
export function useMobileGroupDetailsQuery(
  client: MobileApiClient,
  conversationId: string,
  enabled = true,
) {
  return useQuery({
    enabled,
    queryFn: () => fetchMobileGroupDetails(client, conversationId),
    queryKey: mobileQueryKeys.groupDetails(conversationId),
    staleTime: 30_000,
  });
}

/**
 * Faz 5 §B5. Read once on open; from then on `dm:call:state` writes this key
 * directly (Faz 3 §B7), so there is no polling and no second source.
 */
export function useMobileGroupCallStateQuery(
  client: MobileApiClient,
  conversationId: string,
  enabled = true,
) {
  return useQuery({
    enabled,
    queryFn: () => fetchMobileGroupCallState(client, conversationId),
    queryKey: mobileQueryKeys.groupCallState(conversationId),
    staleTime: 15_000,
  });
}

/**
 * Faz 3 §B5's invalidation contract, in one place so a screen cannot invent its
 * own. Each entry lists exactly what a write moved — 2a going stale after a
 * settings change is the failure this table exists to prevent — and nothing
 * more: refetching a 32-member roster after a toggle is the opposite mistake.
 */
export const MOBILE_GROUP_INVALIDATIONS = {
  conversationPin: (_conversationId: string) => [mobileQueryKeys.dmConversations()],
  invite: (conversationId: string) => [
    mobileQueryKeys.groupInvite(conversationId),
    mobileQueryKeys.groupDetails(conversationId),
  ],
  join: (conversationId: string) => [
    mobileQueryKeys.dmConversations(),
    mobileQueryKeys.groupDetails(conversationId),
  ],
  notifyLevel: (conversationId: string) => [
    mobileQueryKeys.dmConversations(),
    mobileQueryKeys.groupDetails(conversationId),
  ],
  pinnedMessage: (conversationId: string) => [
    mobileQueryKeys.groupDetails(conversationId),
    mobileQueryKeys.dmMessages(conversationId),
  ],
  role: (conversationId: string) => [
    mobileQueryKeys.groupDetails(conversationId),
    mobileQueryKeys.groupMembers(conversationId),
  ],
  settings: (conversationId: string) => [mobileQueryKeys.groupDetails(conversationId)],
} as const;

/**
 * The 2e/2f writes. Every toggle is optimistic — the switch turns the moment it
 * is tapped — and rolls back to the exact snapshot it captured when the request
 * fails, so a rejected write never leaves the row claiming the new state. The
 * toast is the caller's: only the screen knows which sentence to show.
 */
export function useMobileGroupSettingsMutations(client: MobileApiClient) {
  const queryClient = useQueryClient();

  const invalidate = (queryKeys: readonly (readonly unknown[])[]) =>
    Promise.all(
      queryKeys.map((queryKey) => queryClient.invalidateQueries({ exact: true, queryKey })),
    );

  /**
   * Writes the optimistic value into the inbox row and hands back the undo. The
   * pending write is cancelled first: an in-flight list refetch that lands after
   * this would overwrite the switch the reader is looking at.
   */
  const patchConversationRow = async (
    conversationId: string,
    patch: Partial<MobileDMConversationListItem>,
  ) => {
    const queryKey = mobileQueryKeys.dmConversations();
    await queryClient.cancelQueries({ exact: true, queryKey });
    const previous = queryClient.getQueryData(queryKey);

    queryClient.setQueryData<MobileDMConversationsInfiniteData>(queryKey, (current) =>
      patchMobileGroupConversationRow(current, conversationId, patch),
    );

    return () => queryClient.setQueryData(queryKey, previous);
  };

  return {
    dismissPinnedStrip: useMutation({
      mutationFn: (input: { conversationId: string; messageId: string }) =>
        dismissMobileGroupPinnedStrip(client, input.conversationId, input.messageId),
      onSuccess: (_data, input) =>
        invalidate(MOBILE_GROUP_INVALIDATIONS.settings(input.conversationId)),
    }),
    joinViaInvite: useMutation({
      mutationFn: (input: { code: string }) => joinMobileGroupViaInvite(client, input.code),
      onSuccess: (result) => invalidate(MOBILE_GROUP_INVALIDATIONS.join(result.conversation.id)),
    }),
    rotateInvite: useMutation({
      mutationFn: (input: { conversationId: string }) =>
        rotateMobileGroupInvite(client, input.conversationId),
      onSuccess: (_data, input) =>
        invalidate(MOBILE_GROUP_INVALIDATIONS.invite(input.conversationId)),
    }),
    setConversationPinned: useMutation({
      mutationFn: (input: { conversationId: string; pinned: boolean }) =>
        setMobileConversationPinned(client, input.conversationId, input.pinned),
      onMutate: (input) =>
        patchConversationRow(input.conversationId, {
          // The exact instant matters only for ordering among pins, and the
          // server's own value arrives with the invalidation right after.
          pinnedAt: input.pinned ? new Date().toISOString() : null,
        }),
      onError: (_error, _input, rollback) => rollback?.(),
      onSuccess: (_data, input) =>
        invalidate(MOBILE_GROUP_INVALIDATIONS.conversationPin(input.conversationId)),
    }),
    setInviteEnabled: useMutation({
      mutationFn: (input: { conversationId: string; enabled: boolean }) =>
        setMobileGroupInviteEnabled(client, input.conversationId, input.enabled),
      onSuccess: (_data, input) =>
        invalidate(MOBILE_GROUP_INVALIDATIONS.invite(input.conversationId)),
    }),
    setNotifyLevel: useMutation({
      mutationFn: (input: { conversationId: string; notifyLevel: DMNotifyLevel }) =>
        setMobileConversationNotifyLevel(client, input.conversationId, input.notifyLevel),
      onMutate: (input) =>
        // §4.2 again, on the client this time: the mirror is written in the same
        // patch as the authority, never on its own.
        patchConversationRow(input.conversationId, {
          muted: input.notifyLevel === "NONE",
          notifyLevel: input.notifyLevel,
        }),
      onError: (_error, _input, rollback) => rollback?.(),
      onSuccess: (_data, input) =>
        invalidate(MOBILE_GROUP_INVALIDATIONS.notifyLevel(input.conversationId)),
    }),
    setPinnedMessage: useMutation({
      mutationFn: (input: { conversationId: string; messageId: string | null }) =>
        setMobileGroupPinnedMessage(client, input.conversationId, input.messageId),
      onSuccess: (_data, input) =>
        invalidate(MOBILE_GROUP_INVALIDATIONS.pinnedMessage(input.conversationId)),
    }),
    updateMemberRole: useMutation({
      mutationFn: (input: {
        conversationId: string;
        patch: GroupMemberRoleUpdateRequest;
        userId: string;
      }) => updateMobileGroupMemberRole(client, input.conversationId, input.userId, input.patch),
      onSuccess: (_data, input) =>
        invalidate(MOBILE_GROUP_INVALIDATIONS.role(input.conversationId)),
    }),
    updateSettings: useMutation({
      mutationFn: (input: { conversationId: string; patch: GroupDMSettingsUpdateRequest }) =>
        updateMobileGroupSettings(client, input.conversationId, input.patch),
      onSuccess: (_data, input) =>
        invalidate(MOBILE_GROUP_INVALIDATIONS.settings(input.conversationId)),
    }),
  };
}
