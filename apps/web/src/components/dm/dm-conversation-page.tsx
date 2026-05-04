"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChatArea } from "@/components/chat/chat-area";
import { useDMConversations } from "@/hooks/use-dm-conversations";
import {
  type DMConversationsInfiniteData,
  dmQueryKeys,
  fetchDMConversation,
  findOtherParticipant,
  upsertDMConversationPageData,
} from "@/lib/dm/client";

interface DMConversationPageProps {
  conversationId: string;
  currentUserDisplayName: string;
  currentUserId: string;
  currentUserUsername: string;
  uploadthingEnabled: boolean;
}

export function DMConversationPage({
  conversationId,
  currentUserDisplayName,
  currentUserId,
  currentUserUsername,
  uploadthingEnabled,
}: DMConversationPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const redirectedRef = useRef(false);
  const markedAsReadRef = useRef<string | null>(null);
  const { conversations, isLoading, markAsRead } = useDMConversations(currentUserId, {
    autoMarkActiveAsRead: true,
  });

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId) ?? null,
    [conversationId, conversations],
  );
  const conversationQuery = useQuery({
    enabled: !conversation && !isLoading,
    queryFn: () => fetchDMConversation(conversationId),
    queryKey: dmQueryKeys.conversation(conversationId),
    retry: false,
    staleTime: 30_000,
  });
  const activeConversation = conversation ?? conversationQuery.data ?? null;

  const otherParticipant = useMemo(
    () =>
      activeConversation ? findOtherParticipant(activeConversation, currentUserId) : null,
    [activeConversation, currentUserId],
  );

  useEffect(() => {
    if (isLoading || conversationQuery.isLoading || activeConversation || redirectedRef.current) {
      return;
    }

    redirectedRef.current = true;
    router.replace("/channels/@me");
  }, [activeConversation, conversationQuery.isLoading, isLoading, router]);

  useEffect(() => {
    if (!conversationQuery.data) {
      return;
    }

    queryClient.setQueryData<DMConversationsInfiniteData | undefined>(
      dmQueryKeys.list,
      (current) => upsertDMConversationPageData(current, conversationQuery.data),
    );
  }, [conversationQuery.data, queryClient]);

  useEffect(() => {
    if (!activeConversation || markedAsReadRef.current === activeConversation.id) {
      return;
    }

    markedAsReadRef.current = activeConversation.id;
    void markAsRead(activeConversation.id);
  }, [activeConversation, markAsRead]);

  if ((isLoading || conversationQuery.isLoading) && !activeConversation) {
    return (
      <div className="flex flex-1 items-center justify-center text-app-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!activeConversation) {
    return null;
  }

  return (
    <ChatArea
      conversationId={activeConversation.id}
      mode="dm"
      currentUserId={currentUserId}
      currentUserDisplayName={currentUserDisplayName}
      currentUserUsername={currentUserUsername}
      canModerate={false}
      directMessageParticipant={otherParticipant}
      uploadthingEnabled={uploadthingEnabled}
    />
  );
}
