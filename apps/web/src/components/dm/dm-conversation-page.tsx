"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChatArea } from "@/components/chat/chat-area";
import { DmDetailsPanel } from "@/components/dm/dm-details-panel";
import { DmGroupDetailsPanel } from "@/components/dm/dm-group-details-panel";
import { DmGroupSettingsPanel } from "@/components/dm/dm-group-settings-panel";
import { useGroupConversationMutations } from "@/hooks/use-group-conversation";
import { isGroupConversation } from "@/lib/dm/group-presentation";
import { fetchFriends, friendsQueryKeys } from "@/lib/friends/client";
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

export function DMConversationPage(props: DMConversationPageProps) {
  return <DMConversationPageContent {...props} key={props.conversationId} />;
}

function DMConversationPageContent({
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
  const [isDetailsDrawerRequested, setIsDetailsDrawerRequested] = useState(false);
  const [searchRequestId, setSearchRequestId] = useState(0);
  const { conversations, isLoading, markAsRead } = useDMConversations(currentUserId, {
    autoMarkActiveAsRead: true,
  });

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId) ?? null,
    [conversationId, conversations],
  );
  /**
   * Açık sohbet **her zaman** tek konuşma ucundan çekiliyor.
   *
   * Liste kipi (`rosterMode: "row"`) katılımcı okumasını sınırlıyor ve
   * `onlineCount`'u hiç vermiyor: elli konuşmalık bir sayfa için 250 üyelik bir
   * roster taşımanın anlamı yok. Ama açık sohbetin başlığı üye sayacını, üye
   * listesi roster'ı ve rol çipleri rolleri istiyor — üçü de tam kaydı ister.
   *
   * Liste kaydı yine de ilk çizimde kullanılıyor (`?? conversation`), böylece
   * sohbet anında açılıyor ve tam kayıt gelince yerini alıyor.
   */
  const conversationQuery = useQuery({
    queryFn: () => fetchDMConversation(conversationId),
    queryKey: dmQueryKeys.conversation(conversationId),
    retry: false,
    staleTime: 30_000,
  });
  const activeConversation = conversationQuery.data ?? conversation ?? null;

  const otherParticipant = useMemo(
    () => (activeConversation ? findOtherParticipant(activeConversation, currentUserId) : null),
    [activeConversation, currentUserId],
  );
  // Faz 6 §19.2: a group has no counterpart, so the 1:1 panel's own guard
  // (`otherParticipant`) would hide the details surface entirely.
  const isGroup = Boolean(activeConversation && isGroupConversation(activeConversation));
  const groupMutations = useGroupConversationMutations(conversationId);
  // Only fetched for a group the viewer owns: nobody else can add anyone, and a
  // 1:1 has nothing to add to.
  const isGroupOwner = Boolean(
    activeConversation?.ownerId && activeConversation.ownerId === currentUserId,
  );
  const groupFriendsQuery = useQuery({
    enabled: isGroup && isGroupOwner,
    queryFn: fetchFriends,
    queryKey: friendsQueryKeys.list,
    staleTime: 30_000,
  });
  const groupCandidates = useMemo(() => {
    if (!activeConversation) {
      return [];
    }

    const memberIds = new Set(
      activeConversation.participants.map((participant) => participant.userId),
    );

    return (groupFriendsQuery.data ?? [])
      .filter((friend) => !memberIds.has(friend.id))
      .map((friend) => ({
        avatarUrl: friend.avatarUrl,
        displayName: friend.displayName,
        id: friend.id,
        username: friend.username,
      }));
  }, [activeConversation, groupFriendsQuery.data]);

  useEffect(() => {
    if (isLoading || conversationQuery.isLoading || activeConversation || redirectedRef.current) {
      return;
    }

    redirectedRef.current = true;
    router.replace("/messages");
  }, [activeConversation, conversationQuery.isLoading, isLoading, router]);

  useEffect(() => {
    if (!conversationQuery.data) {
      return;
    }

    queryClient.setQueryData<DMConversationsInfiniteData | undefined>(dmQueryKeys.list, (current) =>
      upsertDMConversationPageData(current, conversationQuery.data),
    );
  }, [conversationQuery.data, queryClient]);

  useEffect(() => {
    if (!activeConversation || markedAsReadRef.current === activeConversation.id) {
      return;
    }

    markedAsReadRef.current = activeConversation.id;
    void markAsRead(activeConversation.id);
  }, [activeConversation, markAsRead]);

  const detailsDrawerOpen = isDetailsDrawerRequested && responsiveLayout.shouldMountInfoDrawer;
  const shouldShowDetailsDrawer = detailsDrawerOpen && Boolean(otherParticipant || isGroup);
  useBodyScrollLock(shouldShowDetailsDrawer);

  const openSearchFromDetails = () => {
    setSearchRequestId((current) => current + 1);
    setIsDetailsDrawerRequested(false);
  };

  useEffect(() => {
    if (!shouldShowDetailsDrawer) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsDetailsDrawerRequested(false);
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
      {shouldShowDetailsDrawer && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[90] xl:hidden" data-testid="dm-details-drawer-root">
              <div
                className="absolute inset-0 bg-[hsl(var(--backdrop)/0.5)] backdrop-blur-xs"
                data-testid="dm-details-drawer-backdrop"
                onClick={() => setIsDetailsDrawerRequested(false)}
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
                {isGroup ? (
                  <DmGroupDetailsPanel
                    candidates={groupCandidates}
                    conversation={activeConversation}
                    currentUserId={currentUserId}
                    onAddMembers={groupMutations.addMembers}
                    isPending={groupMutations.isPending}
                    onClose={() => setIsDetailsDrawerRequested(false)}
                    onLeave={() => groupMutations.leave(currentUserId)}
                    onOpenSearch={openSearchFromDetails}
                    onRemoveMember={groupMutations.removeMember}
                    onUpdate={groupMutations.update}
                    onSetMemberRole={groupMutations.setMemberRole}
                    variant="drawer"
                  >
                    {/* §D3.2: 2f lives under 2e rather than behind a second
                        route — the web panel is one surface, and a settings
                        page of its own would be a navigation this design has
                        no answer for. */}
                    <DmGroupSettingsPanel
                      conversation={activeConversation}
                      currentUserId={currentUserId}
                      invite={groupMutations.invite}
                      isPending={groupMutations.isPending}
                      onLeave={(input) =>
                        groupMutations.leave(currentUserId, input.transferOwnershipTo)
                      }
                      onRotateInvite={groupMutations.rotateInvite}
                      onSetDisappearing={groupMutations.setDisappearing}
                      onSetInviteEnabled={groupMutations.setInviteEnabled}
                      onSetNotifyLevel={groupMutations.setNotifyLevel}
                      onSetPermission={groupMutations.setPermission}
                    />
                  </DmGroupDetailsPanel>
                ) : otherParticipant ? (
                  <DmDetailsPanel
                    conversation={activeConversation}
                    onClose={() => setIsDetailsDrawerRequested(false)}
                    onOpenSearch={openSearchFromDetails}
                    participant={otherParticipant}
                    variant="drawer"
                  />
                ) : null}
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
          directMessageConversation={activeConversation}
          directMessageParticipant={otherParticipant}
          directMessageSearchRequestId={searchRequestId}
          onOpenDirectMessageDetails={
            responsiveLayout.shouldMountInfoDrawer
              ? () => setIsDetailsDrawerRequested(true)
              : undefined
          }
          uploadthingEnabled={uploadthingEnabled}
        />
      </div>

      {isGroup ? (
        <DmGroupDetailsPanel
          candidates={groupCandidates}
          className="hidden w-[22rem] shrink-0 xl:flex 2xl:w-[23rem]"
          conversation={activeConversation}
          currentUserId={currentUserId}
          onAddMembers={groupMutations.addMembers}
          isPending={groupMutations.isPending}
          onLeave={() => groupMutations.leave(currentUserId)}
          onOpenSearch={openSearchFromDetails}
          onRemoveMember={groupMutations.removeMember}
          onUpdate={groupMutations.update}
          onSetMemberRole={groupMutations.setMemberRole}
        >
          <DmGroupSettingsPanel
            conversation={activeConversation}
            currentUserId={currentUserId}
            invite={groupMutations.invite}
            isPending={groupMutations.isPending}
            onLeave={(input) => groupMutations.leave(currentUserId, input.transferOwnershipTo)}
            onRotateInvite={groupMutations.rotateInvite}
            onSetDisappearing={groupMutations.setDisappearing}
            onSetInviteEnabled={groupMutations.setInviteEnabled}
            onSetNotifyLevel={groupMutations.setNotifyLevel}
            onSetPermission={groupMutations.setPermission}
          />
        </DmGroupDetailsPanel>
      ) : otherParticipant ? (
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
