import { useCallback, useState } from "react";
import type { MobileApiClient } from "../../api/mobile-api-client";
import type { MobileSessionUser } from "../../auth/session-types";
import { summarizeMobileBootstrap } from "../../bootstrap/mobile-bootstrap";
import { useMobileBootstrapQuery } from "../../query/mobile-bootstrap-query";
import {
  useMobileChannelMessagesQuery,
  useMobileDMMessagesQuery,
} from "../../query/mobile-message-queries";
import { useMobileMessageSearchQuery } from "../../query/mobile-message-search-query";
import {
  useMobileChannelMessageMutation,
  useMobileDMMessageMutation,
} from "../../query/use-mobile-message-mutations";
import { useMobileWorkspaceQuery } from "../../query/mobile-workspace-query";
import {
  MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT,
  MOBILE_MESSAGE_SEARCH_MIN_QUERY_LENGTH,
  type MobileMessageSearchScope,
} from "../../search/mobile-message-search-client";
import {
  toMobileBootstrapViewState,
  toMobileChannelMessagesViewState,
  toMobileDMMessagesViewState,
  toMobileMessageSearchViewState,
  toMobileSyncSnapshot,
  toMobileWorkspaceViewState,
} from "../mobile-query-view-state";
import type { MobileChannelSendViewState, MobileDMSendViewState } from "../mobile-screen-state";
import { activeMobileCopy } from "../../locale/mobile-locale-preferences";

const copy = activeMobileCopy;

type MobileMessageSearchInput = {
  readonly conversationId: string;
  readonly limit: number;
  readonly query: string;
  readonly scope: MobileMessageSearchScope;
};

const INITIAL_MESSAGE_SEARCH_INPUT: MobileMessageSearchInput = {
  conversationId: "",
  limit: MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT,
  query: "",
  scope: "dm",
};

export function useMobileMessagingFeature({
  activeWorkspaceTextChannelId,
  apiClient,
  currentUser,
  isSignedIn,
  selectedDMConversationId,
  selectedWorkspaceServerId,
  stopChannelTyping,
}: {
  readonly activeWorkspaceTextChannelId: string | null;
  readonly apiClient: MobileApiClient;
  readonly currentUser: MobileSessionUser | null;
  readonly isSignedIn: boolean;
  readonly selectedDMConversationId: string | null;
  readonly selectedWorkspaceServerId: string | null;
  readonly stopChannelTyping: (channelId: string) => void;
}) {
  const [messageSearchInput, setMessageSearchInput] = useState<MobileMessageSearchInput>(
    INITIAL_MESSAGE_SEARCH_INPUT,
  );
  const bootstrapQuery = useMobileBootstrapQuery(apiClient, isSignedIn);
  const workspaceQuery = useMobileWorkspaceQuery(apiClient, selectedWorkspaceServerId ?? "");
  const channelMessagesQuery = useMobileChannelMessagesQuery(
    apiClient,
    activeWorkspaceTextChannelId ?? "",
  );
  const dmMessagesQuery = useMobileDMMessagesQuery(apiClient, selectedDMConversationId ?? "");
  const messageSearchQuery = useMobileMessageSearchQuery(apiClient, messageSearchInput);
  const channelMessageMutation = useMobileChannelMessageMutation({
    author: currentUser,
    channelId: activeWorkspaceTextChannelId ?? "",
    client: apiClient,
  });
  const dmMessageMutation = useMobileDMMessageMutation({
    author: currentUser
      ? {
          ...currentUser,
          customStatus: null,
          status: "OFFLINE" as const,
        }
      : null,
    client: apiClient,
    conversationId: selectedDMConversationId ?? "",
  });
  const {
    isError: isChannelSendError,
    isPending: isChannelSending,
    mutateAsync: sendChannelMessage,
    reset: resetChannelMessageMutation,
  } = channelMessageMutation;
  const {
    isError: isDMSendError,
    isPending: isDMSending,
    mutateAsync: sendDMMessage,
    reset: resetDMMessageMutation,
  } = dmMessageMutation;
  const bootstrapState = toMobileBootstrapViewState(
    bootstrapQuery,
    summarizeMobileBootstrap,
    copy.bootstrapLoadFailed,
  );
  const workspaceServerState = toMobileWorkspaceViewState(
    workspaceQuery,
    selectedWorkspaceServerId,
    copy.workspaceLoadFailed,
  );
  const channelMessagesState = toMobileChannelMessagesViewState(
    channelMessagesQuery,
    activeWorkspaceTextChannelId,
    copy.workspaceChannelLoadFailed,
  );
  const dmMessagesState = toMobileDMMessagesViewState(
    dmMessagesQuery,
    selectedDMConversationId,
    copy.dmMessagesLoadFailed,
  );
  const messageSearchState = toMobileMessageSearchViewState(
    messageSearchQuery,
    messageSearchInput,
    copy.messageSearchFailed,
  );
  const channelSendState: MobileChannelSendViewState = {
    channelId: activeWorkspaceTextChannelId,
    error: isChannelSendError ? copy.channelSendFailed : null,
    status: isChannelSending ? "sending" : isChannelSendError ? "error" : "idle",
  };
  const dmSendState: MobileDMSendViewState = {
    conversationId: selectedDMConversationId,
    error: isDMSendError ? copy.dmSendFailed : null,
    status: isDMSending ? "sending" : isDMSendError ? "error" : "idle",
  };

  const clearMessageSearch = useCallback(() => {
    setMessageSearchInput(INITIAL_MESSAGE_SEARCH_INPUT);
  }, []);

  const handleSearchMessages = useCallback(
    async ({
      conversationId,
      query,
      scope,
    }: {
      conversationId: string;
      query: string;
      scope: MobileMessageSearchScope;
    }) => {
      const normalizedQuery = query.trim().replace(/\s+/g, " ");
      const normalizedConversationId = conversationId.trim();

      if (
        !isSignedIn ||
        normalizedConversationId.length === 0 ||
        normalizedQuery.length < MOBILE_MESSAGE_SEARCH_MIN_QUERY_LENGTH
      ) {
        clearMessageSearch();
        return;
      }

      const nextInput: MobileMessageSearchInput = {
        conversationId: normalizedConversationId,
        limit: MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT,
        query: normalizedQuery,
        scope,
      };
      if (
        messageSearchInput.conversationId === nextInput.conversationId &&
        messageSearchInput.query === nextInput.query &&
        messageSearchInput.scope === nextInput.scope
      ) {
        void messageSearchQuery.refetch();
      } else {
        setMessageSearchInput(nextInput);
      }
    },
    [clearMessageSearch, isSignedIn, messageSearchInput, messageSearchQuery],
  );

  const handleSendDMMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const trimmedContent = content.trim();

      if (!isSignedIn || !selectedDMConversationId || trimmedContent.length === 0) {
        return false;
      }

      try {
        await sendDMMessage({ content: trimmedContent });
        return true;
      } catch {
        return false;
      }
    },
    [isSignedIn, selectedDMConversationId, sendDMMessage],
  );

  const handleSendChannelMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const trimmedContent = content.trim();

      if (!isSignedIn || !activeWorkspaceTextChannelId || trimmedContent.length === 0) {
        return false;
      }

      stopChannelTyping(activeWorkspaceTextChannelId);

      try {
        await sendChannelMessage({ content: trimmedContent });
        return true;
      } catch {
        return false;
      }
    },
    [activeWorkspaceTextChannelId, isSignedIn, sendChannelMessage, stopChannelTyping],
  );

  const refreshBootstrap = useCallback(() => {
    void bootstrapQuery.refetch();
  }, [bootstrapQuery]);

  const refreshDMMessages = useCallback(() => {
    if (selectedDMConversationId) {
      void dmMessagesQuery.refetch();
    }
  }, [dmMessagesQuery, selectedDMConversationId]);

  const refreshChannelMessages = useCallback(() => {
    if (activeWorkspaceTextChannelId) {
      void channelMessagesQuery.refetch();
    }
  }, [activeWorkspaceTextChannelId, channelMessagesQuery]);

  const refreshWorkspaceServer = useCallback(() => {
    if (selectedWorkspaceServerId) {
      void workspaceQuery.refetch();
    }
  }, [selectedWorkspaceServerId, workspaceQuery]);

  return {
    bootstrapQuery,
    bootstrapState,
    bootstrapSyncState: toMobileSyncSnapshot(bootstrapQuery, "bootstrap"),
    channelMessagesQuery,
    channelMessagesState,
    channelSendState,
    channelSyncState: toMobileSyncSnapshot(channelMessagesQuery, "channel"),
    clearMessageSearch,
    dmMessagesQuery,
    dmMessagesState,
    dmSendState,
    dmSyncState: toMobileSyncSnapshot(dmMessagesQuery, "dm"),
    handleSearchMessages,
    handleSendChannelMessage,
    handleSendDMMessage,
    messageSearchState,
    refreshBootstrap,
    refreshChannelMessages,
    refreshDMMessages,
    refreshWorkspaceServer,
    resetChannelMessageMutation,
    resetDMMessageMutation,
    workspaceQuery,
    workspaceServerState,
    workspaceSyncState: toMobileSyncSnapshot(workspaceQuery, "workspace"),
  };
}
