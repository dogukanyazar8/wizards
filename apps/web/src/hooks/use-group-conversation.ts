"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type {
  DMNotifyLevel,
  GroupAction,
  GroupDisappearingWindow,
  GroupDMUpdateRequest,
  GroupPermissionLevel,
} from "@wizards/types";

import {
  addGroupMembersRequest,
  dmQueryKeys,
  readGroupInviteRequest,
  removeGroupMemberRequest,
  rotateGroupInviteRequest,
  setConversationNotifyLevelRequest,
  setGroupInviteEnabledRequest,
  updateGroupConversationRequest,
  updateGroupMemberRoleRequest,
  updateGroupSettingsRequest,
} from "@/lib/dm/client";

/**
 * Faz 6 §19.2. The three writes the group details panel makes. Each of them
 * moves the sidebar row — its title, its avatar stack, its member count — so
 * every one refreshes the conversation list rather than waiting for the realtime
 * echo it also triggers.
 */
export function useGroupConversationMutations(conversationId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: dmQueryKeys.list }),
      queryClient.invalidateQueries({ queryKey: dmQueryKeys.conversation(conversationId) }),
    ]);

  const addMembers = useMutation({
    mutationFn: (userIds: readonly string[]) => addGroupMembersRequest(conversationId, userIds),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: (patch: GroupDMUpdateRequest) =>
      updateGroupConversationRequest(conversationId, patch),
    onSuccess: refresh,
  });
  const removeMember = useMutation({
    mutationFn: (input: { transferOwnershipTo?: string; userId: string }) =>
      removeGroupMemberRequest(conversationId, input.userId, input.transferOwnershipTo),
    onSuccess: refresh,
  });
  /**
   * Faz 5 §D3.2. The five writes 2f makes, in the same shapes mobile sends: one
   * settings patch for the permissions and the disappearing window, one role
   * write, and the three invite verbs.
   */
  const updateSettings = useMutation({
    mutationFn: (patch: Parameters<typeof updateGroupSettingsRequest>[1]) =>
      updateGroupSettingsRequest(conversationId, patch),
    onSuccess: refresh,
  });
  const setMemberRole = useMutation({
    mutationFn: (input: { role: "ADMIN" | "MEMBER"; userId: string }) =>
      updateGroupMemberRoleRequest(conversationId, input.userId, { role: input.role }),
    onSuccess: refresh,
  });
  const setNotifyLevel = useMutation({
    mutationFn: (notifyLevel: DMNotifyLevel) =>
      setConversationNotifyLevelRequest(conversationId, notifyLevel),
    onSuccess: refresh,
  });
  const invite = useQuery({
    queryFn: () => readGroupInviteRequest(conversationId),
    queryKey: [...dmQueryKeys.conversation(conversationId), "invite"],
    staleTime: 30_000,
  });
  const setInviteEnabled = useMutation({
    mutationFn: (enabled: boolean) => setGroupInviteEnabledRequest(conversationId, enabled),
    onSuccess: () => invite.refetch(),
  });
  const rotateInvite = useMutation({
    mutationFn: () => rotateGroupInviteRequest(conversationId),
    onSuccess: () => invite.refetch(),
  });

  return {
    addMembers: (userIds: readonly string[]) => addMembers.mutate(userIds),
    invite: invite.data ?? null,
    isPending:
      addMembers.isPending ||
      removeMember.isPending ||
      rotateInvite.isPending ||
      setInviteEnabled.isPending ||
      setMemberRole.isPending ||
      setNotifyLevel.isPending ||
      update.isPending ||
      updateSettings.isPending,
    /** Leaving is removing yourself; the route routes it either way. */
    leave: (currentUserId: string, transferOwnershipTo?: string) =>
      removeMember.mutate(
        {
          ...(transferOwnershipTo === undefined ? {} : { transferOwnershipTo }),
          userId: currentUserId,
        },
        {
          onSuccess: () => {
            void refresh();
            router.replace("/channels/@me");
          },
        },
      ),
    removeMember: (userId: string) => removeMember.mutate({ userId }),
    rotateInvite: () => rotateInvite.mutate(),
    setDisappearing: (disappearingAfter: GroupDisappearingWindow) =>
      updateSettings.mutate({ disappearingAfter }),
    setInviteEnabled: (enabled: boolean) => setInviteEnabled.mutate(enabled),
    setMemberRole: (userId: string, role: "ADMIN" | "MEMBER") =>
      setMemberRole.mutate({ role, userId }),
    setNotifyLevel: (notifyLevel: DMNotifyLevel) => setNotifyLevel.mutate(notifyLevel),
    setPermission: (action: GroupAction, level: GroupPermissionLevel) =>
      updateSettings.mutate(
        {
          addMembers: { permAddMembers: level },
          editInfo: { permEditInfo: level },
          pinMessage: { permPinMessage: level },
          sendMessage: { permSendMessage: level },
        }[action],
      ),
    update: (patch: GroupDMUpdateRequest) => update.mutate(patch),
  };
}
