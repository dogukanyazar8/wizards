import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { MobileApiClient } from "../../api/mobile-api-client";
import { toMobileDMConversationSummaryFromStream } from "../../dm/mobile-dm-client";
import { activeMobileCopy } from "../../locale/mobile-locale-preferences";
import {
  getMobileDMFailedSendScope,
  mobileFailedSendRegistry,
  withMobileFailedSendOverlay,
} from "../../query/mobile-failed-send-registry";
import { useMobileDMMessagesQuery } from "../../query/mobile-message-queries";
import { loadMoreMobileInfinitePages } from "../../query/mobile-query-pages";
import { useMobileDMReadMutation } from "../../query/use-mobile-message-mutations";
import {
  useMobileMessageStreamHydration,
  useMobileMessageStreamPersistence,
} from "../../query/use-mobile-message-stream-persistence";
import { resolveMobileMessageStreamOpenSource } from "../../query/mobile-message-stream-source";
import { toMobileDMMessagesViewState } from "../mobile-query-view-state";
import type { MobileDMConversationListItem } from "../mobile-root-screen-shared";
import { useMobileDMReadEffect } from "./use-mobile-dm-read-effect";
import {
  annotateMobileNavigationSpan,
  getMobileNavigationSampleId,
  markMobileNavigationPhase,
  refineMobileNavigationSpanStreamSource,
} from "../../performance/mobile-navigation-timing";

function toBoundedCountClass(value: number): "0" | "1-5" | "6-20" | "21-50" | "51+" {
  if (value <= 0) return "0";
  if (value <= 5) return "1-5";
  if (value <= 20) return "6-20";
  if (value <= 50) return "21-50";
  return "51+";
}

/**
 * Owns the DirectMessage route's message observer and derived transcript state.
 *
 * The route param is available on the first render. Binding the query here lets
 * TanStack Query return an already-prefetched page synchronously, without
 * waiting for the product root's active-conversation state to commit.
 */
export function useMobileDMRouteState(input: {
  readonly apiClient: MobileApiClient;
  readonly conversationId: string;
  readonly conversations: readonly MobileDMConversationListItem[];
  readonly currentUserId: string | null;
  readonly isSignedIn: boolean;
}) {
  const queryClient = useQueryClient();
  const hydrationReady = useMobileMessageStreamHydration({
    enabled: input.isSignedIn,
    queryClient,
    scope: "dm",
    targetId: input.conversationId,
    userId: input.currentUserId,
  });
  const query = useMobileDMMessagesQuery(
    input.apiClient,
    input.conversationId,
    input.isSignedIn && hydrationReady,
  );
  const navigationSampleIdRef = useRef<string | null>(null);
  useEffect(() => {
    navigationSampleIdRef.current ??= getMobileNavigationSampleId("DirectMessage");
    markMobileNavigationPhase(
      "DirectMessage",
      "query-observer-bound",
      globalThis.performance.now(),
      navigationSampleIdRef.current,
    );
  }, []);
  const failedScope = getMobileDMFailedSendScope(input.conversationId);
  const failedSends = useSyncExternalStore(mobileFailedSendRegistry.subscribe, () =>
    mobileFailedSendRegistry.getEntries(failedScope),
  );

  useMobileMessageStreamPersistence({
    data: query.data,
    enabled: input.isSignedIn,
    error: query.error,
    hydrateOnMount: false,
    queryClient,
    scope: "dm",
    targetId: input.conversationId,
    userId: input.currentUserId,
  });

  const messagesState = useMemo(
    () =>
      withMobileFailedSendOverlay(
        toMobileDMMessagesViewState(
          { data: query.data, isError: query.isError },
          input.conversationId,
          activeMobileCopy.dmMessagesLoadFailed,
        ),
        failedSends,
      ),
    [failedSends, input.conversationId, query.data, query.isError],
  );

  useEffect(() => {
    if (!query.data) {
      return;
    }
    navigationSampleIdRef.current ??= getMobileNavigationSampleId("DirectMessage");
    const streamSource = resolveMobileMessageStreamOpenSource({
      dataUpdatedAtMs: query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null,
      scope: "dm",
      targetId: input.conversationId,
    });
    if (
      streamSource.cacheAgeMs !== null &&
      (streamSource.source === "prefetch" || streamSource.source === "sqlcipher")
    ) {
      refineMobileNavigationSpanStreamSource(
        "DirectMessage",
        streamSource.source,
        streamSource.cacheAgeMs,
        navigationSampleIdRef.current,
      );
    }
    markMobileNavigationPhase(
      "DirectMessage",
      "query-data-ready",
      globalThis.performance.now(),
      navigationSampleIdRef.current,
    );
  }, [input.conversationId, query.data, query.dataUpdatedAt]);

  useEffect(() => {
    const messages = messagesState.payload?.messages;
    if (!messages) {
      return;
    }

    const attachmentCount = messages.reduce(
      (total, message) => total + message.attachments.length,
      0,
    );
    const reactionCount = messages.reduce((total, message) => total + message.reactions.length, 0);
    const richContentCount = messages.filter(
      (message) =>
        message.attachments.length > 0 ||
        message.reactions.length > 0 ||
        message.replyTo != null ||
        message.forwardedAt != null,
    ).length;
    navigationSampleIdRef.current ??= getMobileNavigationSampleId("DirectMessage");
    annotateMobileNavigationSpan(
      "DirectMessage",
      {
        attachmentCountClass: toBoundedCountClass(attachmentCount),
        messageCount: Math.min(messages.length, 200),
        reactionCountClass: toBoundedCountClass(reactionCount),
        richContentCountClass: toBoundedCountClass(richContentCount),
        visibleInitialRowCount: Math.min(messages.length, 12),
      },
      navigationSampleIdRef.current,
    );
    markMobileNavigationPhase(
      "DirectMessage",
      "message-model-built",
      globalThis.performance.now(),
      navigationSampleIdRef.current,
    );
  }, [messagesState.payload?.messages]);

  const selectedConversation = useMemo(() => {
    const fromInbox = input.conversations.find(
      (conversation) => conversation.id === input.conversationId,
    );
    if (fromInbox) {
      return fromInbox;
    }

    const streamConversation = messagesState.payload?.conversation ?? null;
    return streamConversation && streamConversation.id === input.conversationId
      ? toMobileDMConversationSummaryFromStream(streamConversation, input.currentUserId)
      : null;
  }, [
    input.conversationId,
    input.conversations,
    input.currentUserId,
    messagesState.payload?.conversation,
  ]);

  const dmReadMutation = useMobileDMReadMutation({ client: input.apiClient });
  const latestMessage = messagesState.payload?.messages.at(-1) ?? null;
  useMobileDMReadEffect({
    conversationId: input.conversationId,
    currentUserId: input.currentUserId,
    isSignedIn: input.isSignedIn,
    latestMessage,
    markRead: dmReadMutation.mutate,
  });

  const loadMoreMessages = useCallback(() => {
    loadMoreMobileInfinitePages({
      fetchNextPage: query.fetchNextPage,
      hasNextPage: query.hasNextPage,
      isFetchingNextPage: query.isFetchingNextPage,
    });
  }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage]);

  const refreshConversation = useCallback(() => {
    void query.refetch();
  }, [query.refetch]);

  return {
    loadMoreMessages,
    messagesState,
    query,
    refreshConversation,
    selectedConversation,
  };
}
