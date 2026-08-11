import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { copy, getMobileConversationTitle } from "../mobile-root-screen-shared";
import type {
  MobileDMConversationListItem,
  MobileMessageSearchViewState,
} from "../mobile-root-screen-shared";
import { MessageSearchPanel } from "../components/message-primitives";
import { useToast } from "../components/kit/toast";
import { joinMobileOngoingCall } from "../features/mobile-direct-call-bridge";
import { useMobileGroupChat } from "../features/use-mobile-group-chat";
import {
  useMobileGroupMutations,
  useMobileGroupSettingsMutations,
} from "../../dm/mobile-group-client";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { useDmScreenStyles } from "./dm-screen.styles";
import { DMConversationScreen, type MobileGroupChatBindings } from "./dm-conversation-screen";

/**
 * Grup sohbetleri 2a–2f, Faz 5 §B. The open conversation, plus everything a
 * *group* one needs on top of it.
 *
 * Its own module because `dm-screen` is the messages tab's shell and stays under
 * the architecture test's line budget: the shell decides *which* surface is on
 * screen, this decides what the conversation surface is made of. `DMConversationScreen`
 * itself is untouched — §B's "one chat surface owner" holds.
 */
export function DMConversationShell({
  conversation,
  messageSearchState,
  onClearMessageSearch,
  onCloseConversation,
  onSearchMessages,
  viewerId,
  ...rest
}: Omit<React.ComponentProps<typeof DMConversationScreen>, "conversation" | "group" | "onBack"> & {
  readonly conversation: MobileDMConversationListItem;
  readonly messageSearchState?: MobileMessageSearchViewState | undefined;
  onClearMessageSearch?(): void;
  onCloseConversation(conversationId?: string): void;
  onSearchMessages?(input: {
    conversationId: string;
    query: string;
    scope: "channel" | "dm";
  }): Promise<void>;
  readonly viewerId: string;
}) {
  const styles = useDmScreenStyles();
  const { apiClient } = useMobileAuth();
  const { showToast } = useToast();
  /** V5 / §C1.3: 2e's `Ara` and 2d's `⋯ → Ara` open the same panel. */
  const [isSearchOpen, setSearchOpen] = useState(false);
  const isGroup = conversation.type === "GROUP_DM";
  const groupState = useMobileGroupChat({
    client: apiClient,
    conversationId: conversation.id,
    isGroup,
    viewerId,
  });
  const { removeMember } = useMobileGroupMutations(apiClient, viewerId);
  const { setNotifyLevel } = useMobileGroupSettingsMutations(apiClient);
  const reportFailure = useCallback(
    () => showToast({ title: copy.confirmationError, variant: "error" }),
    [showToast],
  );
  const title = getMobileConversationTitle(conversation, copy.directMessageFallback, viewerId);
  const handleJoinCall = useCallback(() => {
    void joinMobileOngoingCall({
      conversationId: conversation.id,
      title: groupState?.title ?? title,
      // §B5: the banner joins whatever is running; the roster says which it is.
      video: groupState?.callBanner.video ?? false,
    });
  }, [conversation.id, groupState?.callBanner.video, groupState?.title, title]);

  const group = useMemo<MobileGroupChatBindings | null>(
    () =>
      groupState
        ? {
            muted: conversation.notifyLevel === "NONE" || conversation.muted === true,
            onJoinCall: handleJoinCall,
            onLeave: (input) => {
              void removeMember
                .mutateAsync({
                  conversationId: conversation.id,
                  ...(input.transferOwnershipTo
                    ? { transferOwnershipTo: input.transferOwnershipTo }
                    : {}),
                  userId: viewerId,
                })
                .then(() => onCloseConversation(conversation.id))
                .catch(reportFailure);
            },
            onOpenSearch: () => setSearchOpen(true),
            onToggleMuted: () => {
              void setNotifyLevel
                .mutateAsync({
                  conversationId: conversation.id,
                  notifyLevel: conversation.notifyLevel === "NONE" ? "ALL" : "NONE",
                })
                .catch(reportFailure);
            },
            state: groupState,
          }
        : null,
    [
      conversation.id,
      conversation.muted,
      conversation.notifyLevel,
      groupState,
      handleJoinCall,
      onCloseConversation,
      removeMember,
      reportFailure,
      setNotifyLevel,
      viewerId,
    ],
  );

  return (
    <View style={styles.chatScreen} testID="mobile-dm-conversation-shell">
      {isSearchOpen && messageSearchState && onSearchMessages && onClearMessageSearch ? (
        // V5: the existing `/messages/search` panel, in this conversation's
        // scope. No second search surface and no second endpoint.
        <MessageSearchPanel
          conversationId={conversation.id}
          onClear={() => {
            onClearMessageSearch();
            setSearchOpen(false);
          }}
          onSearch={onSearchMessages}
          scope="dm"
          state={messageSearchState}
        />
      ) : null}
      <DMConversationScreen
        {...rest}
        conversation={conversation}
        group={group}
        onBack={onCloseConversation}
      />
    </View>
  );
}
