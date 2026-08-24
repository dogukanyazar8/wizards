"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { GroupCreateDialog } from "@/components/dm/group-create-dialog";
import { MessagesEmptyState } from "@/components/messages/messages-empty-state";
import { NewMessagePicker } from "@/components/messages/new-message-picker";
import { useConversationRows } from "@/hooks/use-conversation-rows";
import {
  createDMConversationRequest,
  createGroupConversationRequest,
  dmQueryKeys,
} from "@/lib/dm/client";
import { fetchFriends, friendsQueryKeys } from "@/lib/friends/client";

/**
 * `/channels` ana alanı — SPEC-MESAJLAR §9 `view: empty`.
 *
 * Ray solda duruyor ve hiçbir sohbet seçili değil; SPEC'in tarif ettiği hâl tam
 * olarak bu. `/messages` Arkadaşlar görünümüdür (§4) ve öyle kalıyor —
 * boş durumu oraya koymak, iki görünümü tek rotada üst üste bindirirdi.
 *
 * İki modal da burada: seçici ve grup modalı ana alanın sahibi olan bileşenden
 * açılır, çünkü ikisi de sonuçta bu alanı bir sohbete çevirir.
 */
export function MessagesEmptyView({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const { rows } = useConversationRows(currentUserId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const queryClient = useQueryClient();
  const createGroupMutation = useMutation({
    mutationFn: createGroupConversationRequest,
    onSuccess: (conversation) => {
      setGroupOpen(false);
      void queryClient.invalidateQueries({ queryKey: dmQueryKeys.list });
      router.push(`/messages/${conversation.id}`);
    },
  });

  const friendsQuery = useQuery({
    // Seçici ya da grup modalı açılmadan arkadaş listesi çekilmez: boş bir ekran
    // için bir sorgu daha, hiç tıklanmayacak bir listeyi indirmek olurdu.
    enabled: pickerOpen || groupOpen,
    queryFn: fetchFriends,
    queryKey: friendsQueryKeys.list,
    staleTime: 30_000,
  });

  const friends = (friendsQuery.data ?? []).map((friend) => ({
    allowsGroupInvites: friend.allowsGroupInvites ?? true,
    avatarUrl: friend.avatarUrl,
    customStatus: friend.customStatus,
    displayName: friend.displayName,
    id: friend.id,
    name: friend.displayName ?? friend.username,
    status: friend.status,
    username: friend.username,
  }));

  return (
    <>
      <MessagesEmptyState
        conversations={rows}
        onNewGroup={() => setGroupOpen(true)}
        onNewMessage={() => setPickerOpen(true)}
        onOpenConversation={(conversationId) => router.push(`/messages/${conversationId}`)}
      />

      {pickerOpen ? (
        <NewMessagePicker
          friends={friends}
          onClose={() => setPickerOpen(false)}
          onNewGroup={() => {
            setPickerOpen(false);
            setGroupOpen(true);
          }}
          onSelect={(userId) => {
            setPickerOpen(false);
            void createDMConversationRequest(userId).then((conversation) => {
              router.push(`/messages/${conversation.id}`);
            });
          }}
        />
      ) : null}

      <GroupCreateDialog
        friends={friends}
        isSubmitting={createGroupMutation.isPending}
        onClose={() => setGroupOpen(false)}
        onSubmit={(input) => createGroupMutation.mutate(input)}
        open={groupOpen}
      />
    </>
  );
}
