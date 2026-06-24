"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChatArea } from "@/components/chat/chat-area";
import { DmDetailsPanel } from "@/components/dm/dm-details-panel";
import { useI18n } from "@/components/providers/locale-provider";
import { useDMConversations } from "@/hooks/use-dm-conversations";
import { useBodyScrollLock, useResponsiveLayout } from "@/hooks/use-responsive-layout";
import {
  type DMConversationsInfiniteData,
  dmQueryKeys,
  fetchDMConversation,
  findOtherParticipant,
  upsertDMConversationPageData,
} from "@/lib/dm/client";
import { RESPONSIVE_SHELL_SIZES } from "@/lib/responsive";

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
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const redirectedRef = useRef(false);
  const markedAsReadRef = useRef<string | null>(null);
  const responsiveLayout = useResponsiveLayout();
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [searchRequestId, setSearchRequestId] = useState(0);
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

  const shouldShowDetailsDrawer =
    detailsDrawerOpen && responsiveLayout.shouldMountInfoDrawer && Boolean(otherParticipant);
  useBodyScrollLock(shouldShowDetailsDrawer);

  const openSearchFromDetails = useCallback(() => {
    setSearchRequestId((current) => current + 1);
    setDetailsDrawerOpen(false);
  }, []);

  useEffect(() => {
    setDetailsDrawerOpen(false);
  }, [conversationId]);

  useEffect(() => {
    if (detailsDrawerOpen && !responsiveLayout.shouldMountInfoDrawer) {
      setDetailsDrawerOpen(false);
    }
  }, [detailsDrawerOpen, responsiveLayout.shouldMountInfoDrawer]);

  useEffect(() => {
    if (!shouldShowDetailsDrawer) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDetailsDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shouldShowDetailsDrawer]);

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
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {shouldShowDetailsDrawer && otherParticipant && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[90] xl:hidden" data-testid="dm-details-drawer-root">
              <div
                className="absolute inset-0 bg-[hsl(var(--backdrop)/0.5)] backdrop-blur-sm"
                data-testid="dm-details-drawer-backdrop"
                onClick={() => setDetailsDrawerOpen(false)}
                role="presentation"
              />
              <div
                aria-label={t("dm.details.title")}
                aria-modal="true"
                className="absolute inset-y-0 right-0 max-w-full overflow-hidden transition-transform duration-200 ease-out motion-reduce:transition-none"
                data-testid="dm-details-drawer"
                role="dialog"
                style={{ width: RESPONSIVE_SHELL_SIZES.infoDrawerWidth }}
              >
                <DmDetailsPanel
                  conversation={activeConversation}
                  onClose={() => setDetailsDrawerOpen(false)}
                  onOpenSearch={openSearchFromDetails}
                  participant={otherParticipant}
                  variant="drawer"
                />
              </div>
            </div>,
            document.body,
          )
        : null}

      <div className="min-w-0 flex-1">
        <ChatArea
          conversationId={activeConversation.id}
          mode="dm"
          currentUserId={currentUserId}
          currentUserDisplayName={currentUserDisplayName}
          currentUserUsername={currentUserUsername}
          canModerate={false}
          directMessageParticipant={otherParticipant}
          directMessageSearchRequestId={searchRequestId}
          onOpenDirectMessageDetails={
            responsiveLayout.shouldMountInfoDrawer ? () => setDetailsDrawerOpen(true) : undefined
          }
          uploadthingEnabled={uploadthingEnabled}
        />
      </div>

      {otherParticipant ? (
        <DmDetailsPanel
          className="hidden w-[22rem] shrink-0 xl:flex 2xl:w-[23rem]"
          conversation={activeConversation}
          onOpenSearch={openSearchFromDetails}
          participant={otherParticipant}
        />
      ) : null}
    </div>
  );
}
