"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { GroupDMUpdateRequest } from "@wizards/types";

import {
  addGroupMembersRequest,
  dmQueryKeys,
  removeGroupMemberRequest,
  updateGroupConversationRequest,
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
    mutationFn: (userId: string) => removeGroupMemberRequest(conversationId, userId),
    onSuccess: refresh,
  });

  return {
    addMembers: (userIds: readonly string[]) => addMembers.mutate(userIds),
    isPending: addMembers.isPending || removeMember.isPending || update.isPending,
    /** Leaving is removing yourself; the route routes it either way. */
    leave: (currentUserId: string) =>
      removeMember.mutate(currentUserId, {
        onSuccess: () => {
          void refresh();
          router.replace("/channels/@me");
        },
      }),
    removeMember: (userId: string) => removeMember.mutate(userId),
    update: (patch: GroupDMUpdateRequest) => update.mutate(patch),
  };
}
