"use client";

import { useEffect, useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChatArea } from "@/components/chat/chat-area";
import { useDMConversations } from "@/hooks/use-dm-conversations";
import { findOtherParticipant } from "@/lib/dm/client";

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
  const redirectedRef = useRef(false);
  const markedAsReadRef = useRef<string | null>(null);
  const { conversations, isLoading, markAsRead } = useDMConversations(currentUserId, {
    autoMarkActiveAsRead: true,
  });

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId) ?? null,
    [conversationId, conversations],
  );

  const otherParticipant = useMemo(
    () =>
      conversation ? findOtherParticipant(conversation, currentUserId) : null,
    [conversation, currentUserId],
  );

  useEffect(() => {
    if (isLoading || conversation || redirectedRef.current) {
      return;
    }

    redirectedRef.current = true;
    router.replace("/channels/@me");
  }, [conversation, isLoading, router]);

  useEffect(() => {
    if (!conversation || markedAsReadRef.current === conversation.id) {
      return;
    }

    markedAsReadRef.current = conversation.id;
    void markAsRead(conversation.id);
  }, [conversation, markAsRead]);

  if (isLoading && !conversation) {
    return (
      <div className="flex flex-1 items-center justify-center text-app-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!conversation) {
    return null;
  }

  return (
    <ChatArea
      conversationId={conversation.id}
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
