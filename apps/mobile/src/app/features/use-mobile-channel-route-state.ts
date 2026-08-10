import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { MessageAttachment, UploadedAttachmentInput } from "@wizards/types";

import type { MobileApiClient } from "../../api/mobile-api-client";
import type { MobileSessionUser } from "../../auth/session-types";
import { activeMobileCopy } from "../../locale/mobile-locale-preferences";
import { createMobileGiphyAttachment } from "../../media/mobile-giphy-client";
import {
  getMobileChannelFailedSendScope,
  mobileFailedSendRegistry,
  withMobileFailedSendOverlay,
} from "../../query/mobile-failed-send-registry";
import {
  getMobileChannelMessagesQueryOptions,
  useMobileChannelPinsQuery,
} from "../../query/mobile-message-queries";
import { loadMoreMobileInfinitePages } from "../../query/mobile-query-pages";
import {
  useMobileChannelMessageDeleteMutation,
  useMobileChannelMessageEditMutation,
  useMobileChannelMessageMutation,
  useMobileChannelMessagePinMutation,
  useMobileChannelMessageReactionMutation,
  useMobileChannelReadMutation,
  type MobileMessageEditMutationVariables,
  type MobileMessageReactionMutationVariables,
} from "../../query/use-mobile-message-mutations";
import {
  useMobileMessageStreamHydration,
  useMobileMessageStreamPersistence,
} from "../../query/use-mobile-message-stream-persistence";
import { resolveMobileMessageStreamOpenSource } from "../../query/mobile-message-stream-source";
import {
  getMobileNavigationSampleId,
  markMobileNavigationPhase,
  refineMobileNavigationSpanStreamSource,
} from "../../performance/mobile-navigation-timing";
import { toMobileChannelMessagesViewState } from "../mobile-query-view-state";

const EMPTY_PINNED_MESSAGES: readonly never[] = [];

/** Route-owned channel transcript, cache lifecycle and mutations. */
export function useMobileChannelRouteState(input: {
  /** Set by a search hit: opens the channel at this message, not at its tail. */
  readonly anchorMessageId?: string | null;
  readonly apiClient: MobileApiClient;
  readonly channelId: string;
  readonly currentUser: MobileSessionUser | null;
  readonly isSignedIn: boolean;
  readonly stopTyping: (channelId: string) => void;
  readonly updateTyping: (channelId: string, content: string) => void;
}) {
  const queryClient = useQueryClient();
  const userId = input.currentUser?.id ?? null;
  const anchorMessageId = input.anchorMessageId ?? null;
  const isAnchored = anchorMessageId !== null;
  const hydrationReady = useMobileMessageStreamHydration({
    // An anchored window is a slice of history: the persisted stream holds the
    // channel's tail, so waiting for it (or writing over it) would be wrong.
    enabled: input.isSignedIn && !isAnchored,
    queryClient,
    scope: "channel",
    targetId: input.channelId,
    userId,
  });
  /**
   * One hook, two option sets. The anchored read is a sibling cache entry — the
   * realtime bridge patches the live key and must not be taught a second shape
   * of the same transcript — and swapping the options is what makes going back
   * to the live end a cache hit rather than a refetch.
   */
  const query = useInfiniteQuery(
    getMobileChannelMessagesQueryOptions(
      input.apiClient,
      input.channelId,
      input.isSignedIn && (isAnchored || hydrationReady),
      anchorMessageId,
    ),
  );
  const navigationSampleIdRef = useRef<string | null>(null);
  useEffect(() => {
    navigationSampleIdRef.current ??= getMobileNavigationSampleId("ChannelChat");
    markMobileNavigationPhase(
      "ChannelChat",
      "query-observer-bound",
      globalThis.performance.now(),
      navigationSampleIdRef.current,
    );
  }, []);

  const failedScope = getMobileChannelFailedSendScope(input.channelId);
  const failedSends = useSyncExternalStore(mobileFailedSendRegistry.subscribe, () =>
    mobileFailedSendRegistry.getEntries(failedScope),
  );
  useMobileMessageStreamPersistence({
    data: query.data,
    enabled: input.isSignedIn && !isAnchored,
    error: query.error,
    hydrateOnMount: false,
    queryClient,
    scope: "channel",
    targetId: input.channelId,
    userId,
  });

  const messagesState = useMemo(
    () =>
      withMobileFailedSendOverlay(
        toMobileChannelMessagesViewState(
          { data: query.data, isError: query.isError },
          input.channelId,
          activeMobileCopy.workspaceChannelLoadFailed,
        ),
        failedSends,
      ),
    [failedSends, input.channelId, query.data, query.isError],
  );

  useEffect(() => {
    if (!query.data) return;
    navigationSampleIdRef.current ??= getMobileNavigationSampleId("ChannelChat");
    const streamSource = resolveMobileMessageStreamOpenSource({
      dataUpdatedAtMs: query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null,
      scope: "channel",
      targetId: input.channelId,
    });
    if (
      streamSource.cacheAgeMs !== null &&
      (streamSource.source === "prefetch" || streamSource.source === "sqlcipher")
    ) {
      refineMobileNavigationSpanStreamSource(
        "ChannelChat",
        streamSource.source,
        streamSource.cacheAgeMs,
        navigationSampleIdRef.current,
      );
    }
    markMobileNavigationPhase(
      "ChannelChat",
      "query-data-ready",
      globalThis.performance.now(),
      navigationSampleIdRef.current,
    );
  }, [input.channelId, query.data, query.dataUpdatedAt]);

  const sendControls = useMobileChannelMessageMutation({
    author: input.currentUser,
    channelId: input.channelId,
    client: input.apiClient,
  });
  const reactionMutation = useMobileChannelMessageReactionMutation({
    author: input.currentUser,
    channelId: input.channelId,
    client: input.apiClient,
  });
  const editMutation = useMobileChannelMessageEditMutation({
    channelId: input.channelId,
    client: input.apiClient,
  });
  const deleteMutation = useMobileChannelMessageDeleteMutation({
    channelId: input.channelId,
    client: input.apiClient,
  });
  const pinMutation = useMobileChannelMessagePinMutation({
    channelId: input.channelId,
    client: input.apiClient,
  });
  const pinsQuery = useMobileChannelPinsQuery(
    input.apiClient,
    input.isSignedIn ? input.channelId : "",
  );
  const readMutation = useMobileChannelReadMutation({ client: input.apiClient });
  const { discardFailedMessage, mutation: sendMutation, retryFailedMessage } = sendControls;
  const { mutate: send, reset: resetSend } = sendMutation;
  const { isPending: isReactionPending, mutate: mutateReaction } = reactionMutation;
  const { isPending: isEditPending, mutateAsync: mutateEdit } = editMutation;
  const { isPending: isDeletePending, mutateAsync: mutateDelete } = deleteMutation;
  const { mutateAsync: mutatePin } = pinMutation;
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null);
  const readRequestedChannelIdRef = useRef<string | null>(null);
  const routeChannelIdRef = useRef(input.channelId);
  useEffect(() => {
    if (routeChannelIdRef.current === input.channelId) {
      return;
    }
    routeChannelIdRef.current = input.channelId;
    resetSend();
    setFirstUnreadMessageId(null);
    readRequestedChannelIdRef.current = null;
  }, [input.channelId, resetSend]);
  const { mutate: markRead } = readMutation;
  useEffect(() => {
    if (
      !input.isSignedIn ||
      input.channelId.length === 0 ||
      !query.data ||
      readRequestedChannelIdRef.current === input.channelId
    ) {
      return;
    }
    readRequestedChannelIdRef.current = input.channelId;
    markRead(
      { channelId: input.channelId },
      {
        onSuccess: (response) => {
          if (response.channelId === input.channelId) {
            setFirstUnreadMessageId(response.firstUnreadMessageId);
          }
        },
      },
    );
  }, [input.channelId, input.isSignedIn, markRead, query.data?.pages]);

  const sendMessage = useCallback(
    async (
      content: string,
      intent?: {
        readonly attachments?: readonly UploadedAttachmentInput[];
        readonly attachmentPreviews?: readonly MessageAttachment[];
        readonly replyToId?: string;
        readonly threadParentId?: string;
      },
    ): Promise<boolean> => {
      const trimmedContent = content.trim();
      const attachments = intent?.attachments ?? [];
      if (!input.isSignedIn || (trimmedContent.length === 0 && attachments.length === 0)) {
        return false;
      }
      input.stopTyping(input.channelId);
      send({
        content: trimmedContent,
        ...(attachments.length > 0 ? { attachments: [...attachments] } : {}),
        ...(intent?.attachmentPreviews?.length
          ? { attachmentPreviews: intent.attachmentPreviews }
          : {}),
        ...(intent?.replyToId ? { replyToId: intent.replyToId } : {}),
        ...(intent?.threadParentId ? { threadParentId: intent.threadParentId } : {}),
      });
      return true;
    },
    [input.channelId, input.isSignedIn, input.stopTyping, send],
  );
  const sendGif = useCallback(
    async (gifId: string): Promise<boolean> => {
      if (!input.isSignedIn) return false;
      try {
        const attachment = await createMobileGiphyAttachment(input.apiClient, gifId);
        input.stopTyping(input.channelId);
        send({
          attachmentPreviews: [attachment.attachment],
          attachments: [attachment.input],
          content: "",
        });
        return true;
      } catch {
        return false;
      }
    },
    [input.apiClient, input.channelId, input.isSignedIn, input.stopTyping, send],
  );
  const toggleReaction = useCallback(
    (variables: MobileMessageReactionMutationVariables) => {
      if (!input.isSignedIn || !input.currentUser || isReactionPending) return;
      mutateReaction(variables);
    },
    [input.currentUser, input.isSignedIn, isReactionPending, mutateReaction],
  );
  const editMessage = useCallback(
    async (variables: MobileMessageEditMutationVariables): Promise<boolean> => {
      if (!input.isSignedIn || !input.currentUser || isEditPending) return false;
      try {
        await mutateEdit({ ...variables, content: variables.content.trim() });
        return true;
      } catch {
        return false;
      }
    },
    [input.currentUser, input.isSignedIn, isEditPending, mutateEdit],
  );
  const deleteMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!input.isSignedIn || !input.currentUser || isDeletePending) return false;
      try {
        await mutateDelete({ messageId });
        return true;
      } catch {
        return false;
      }
    },
    [input.currentUser, input.isSignedIn, isDeletePending, mutateDelete],
  );
  const pinMessage = useCallback(
    async (messageId: string, shouldPin: boolean): Promise<boolean> => {
      if (!input.isSignedIn) return false;
      try {
        await mutatePin({ messageId, shouldPin });
        return true;
      } catch {
        return false;
      }
    },
    [input.isSignedIn, mutatePin],
  );
  const loadMoreMessages = useCallback(() => {
    loadMoreMobileInfinitePages({
      fetchNextPage: query.fetchNextPage,
      hasNextPage: query.hasNextPage,
      isFetchingNextPage: query.isFetchingNextPage,
    });
  }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage]);
  const refreshMessages = useCallback(() => void query.refetch(), [query.refetch]);
  const draftChanged = useCallback(
    (content: string) => {
      if (input.isSignedIn) input.updateTyping(input.channelId, content);
    },
    [input.channelId, input.isSignedIn, input.updateTyping],
  );

  return {
    deleteMessage,
    discardMessage: discardFailedMessage,
    draftChanged,
    editMessage,
    firstUnreadMessageId,
    isMessageActionPending: isEditPending || isDeletePending,
    isReactionPending,
    /**
     * The reader is parked mid-history and messages exist past the end of this
     * window, so the transcript has to offer a way back to the live end. Read
     * from the first page: that is the anchored window itself; every page after
     * it walks backwards.
     */
    isViewingHistory: isAnchored && query.data?.pages[0]?.hasNewer === true,
    loadMoreMessages,
    messagesState,
    pinMessage,
    pinnedMessages: pinsQuery.data?.messages ?? EMPTY_PINNED_MESSAGES,
    refreshMessages,
    retryMessage: retryFailedMessage,
    sendGif,
    sendMessage,
    toggleReaction,
  };
}
