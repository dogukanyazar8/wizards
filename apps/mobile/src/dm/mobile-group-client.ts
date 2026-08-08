import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GroupDMConversationResponseSchema,
  type DMConversationDTO,
  type GroupDMCreateRequest,
  type GroupDMUpdateRequest,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "../query/mobile-query-keys";

const MOBILE_GROUPS_PATH = "/api/v1/mobile/dm/groups";

function buildGroupPath(conversationId: string): string {
  return `${MOBILE_GROUPS_PATH}/${encodeURIComponent(conversationId)}`;
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

/** Removing yourself is how leaving is spelled; the server routes it either way. */
export async function removeMobileGroupMember(
  client: MobileApiClient,
  conversationId: string,
  userId: string,
): Promise<void> {
  await client.requestJson<unknown>(
    `${buildGroupPath(conversationId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
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
  await client.requestJson<unknown>(`/api/v1/mobile/dm/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
  });
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
   */
  const refreshAfterRemoval = (conversationId: string, removedUserId: string) =>
    viewerId !== undefined && removedUserId === viewerId
      ? refreshConversations()
      : refreshConversationAndDetails(conversationId);

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
      mutationFn: (input: { conversationId: string; userId: string }) =>
        removeMobileGroupMember(client, input.conversationId, input.userId),
      onSuccess: (_data, input) => refreshAfterRemoval(input.conversationId, input.userId),
    }),
    update: useMutation({
      mutationFn: (input: { conversationId: string; patch: GroupDMUpdateRequest }) =>
        updateMobileGroup(client, input.conversationId, input.patch),
      onSuccess: (_data, input) => refreshConversationAndDetails(input.conversationId),
    }),
  };
}
