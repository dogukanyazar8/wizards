import React from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react-native";
import type { MobileChannelMessagesResponse, MobileDMMessagesResponse } from "@wizards/types";

import type { MobileApiClient, MobileApiRequestOptions } from "../src/api/mobile-api-client";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { useMobileMessagingFeature } from "../src/app/features/use-mobile-messaging-feature";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import { useMobileDMReadMutation } from "../src/query/use-mobile-message-mutations";

const currentUser = {
  avatarUrl: null,
  displayName: "Ada",
  email: "ada@whispr.test",
  id: "viewer",
  username: "ada",
};

const channelMessagesPage: MobileChannelMessagesResponse = {
  channel: {
    categoryId: null,
    categoryName: null,
    id: "channel-9",
    lastMessage: null,
    locked: false,
    mentionCount: 0,
    name: "duyurular",
    position: 0,
    readOnly: false,
    topic: null,
    type: "TEXT",
    unreadCount: 0,
  },
  hasMore: false,
  messages: [],
  nextCursor: null,
};

const dmMessagesPage: MobileDMMessagesResponse = {
  conversation: {
    id: "conversation-7",
    lastMessage: null,
    lastMessageAt: "2026-07-28T09:00:00.000Z",
    name: null,
    participants: [
      {
        avatarUrl: null,
        customStatus: null,
        displayName: "Kaya",
        muted: false,
        presence: { customStatus: null, status: "ONLINE" },
        status: "ONLINE",
        unreadCount: 0,
        userId: "user-kaya",
        username: "kaya",
      },
    ],
    type: "DM",
  },
  messages: [],
  nextCursor: null,
  participantReadStates: [],
};

const renderedQueryClients: QueryClient[] = [];

/**
 * The server detail read never settles here on purpose: that is the leg the chat
 * used to wait behind, and nothing about opening a chat may depend on it.
 */
function createStalledDetailClient() {
  const paths: string[] = [];
  const client: MobileApiClient = {
    async requestJson<TResponse>(path: string, options: MobileApiRequestOptions = {}) {
      paths.push(path);

      if (path.startsWith("/api/v1/mobile/channels/channel-9/messages")) {
        return channelMessagesPage as TResponse;
      }

      if (path.startsWith("/api/v1/mobile/dm/conversation-7/messages")) {
        return dmMessagesPage as TResponse;
      }

      if (path === "/api/v1/mobile/servers/server-1") {
        return new Promise<TResponse>((_resolve, reject) => {
          const abort = () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          if (options.signal?.aborted) {
            abort();
            return;
          }
          options.signal?.addEventListener("abort", abort, { once: true });
        });
      }

      throw new Error(`Unexpected test request: ${path}`);
    },
  };

  return { client, paths };
}

async function renderMessagingFeature(client: MobileApiClient) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  renderedQueryClients.push(queryClient);

  const view = await renderHook(
    () =>
      useMobileMessagingFeature({
        activeVoiceChannelId: null,
        apiClient: client,
        currentUser,
        isSignedIn: true,
        joinVoiceChannel: async () => true,
        leaveVoiceChannel: async () => undefined,
        requestMicrophonePermission: async () => ({
          hasMicrophonePermission: true,
          microphoneStatus: "granted",
        }),
        stopChannelTyping: () => undefined,
        stopDMTyping: () => undefined,
        updateChannelTyping: () => undefined,
        updateDMTyping: () => undefined,
      }),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <MobileLocaleProvider>{children}</MobileLocaleProvider>
        </QueryClientProvider>
      ),
    },
  );

  return { queryClient, view };
}

describe("chat open path", () => {
  afterEach(async () => {
    await cleanup();
    for (const queryClient of renderedQueryClients.splice(0)) {
      queryClient.clear();
    }
    jest.clearAllMocks();
  });

  it("fetches the route's channel messages without waiting for the server detail read", async () => {
    const { client, paths } = createStalledDetailClient();
    const { view } = await renderMessagingFeature(client);

    await act(() => {
      view.result.current.handleOpenWorkspaceRoute("server-1", "channel-9");
    });

    await waitFor(() => {
      expect(
        paths.some((path) => path.startsWith("/api/v1/mobile/channels/channel-9/messages")),
      ).toBe(true);
    });
    expect(view.result.current.activeWorkspaceTextChannelId).toBe("channel-9");
  });

  it("exposes the stream's channel summary while the server detail read is pending", async () => {
    const { client } = createStalledDetailClient();
    const { view } = await renderMessagingFeature(client);

    await act(() => {
      view.result.current.handleOpenWorkspaceRoute("server-1", "channel-9");
    });

    await waitFor(() => {
      expect(view.result.current.channelMessagesState.payload?.channel.name).toBe("duyurular");
    });
    expect(view.result.current.workspaceServerState.payload).toBe(null);
  });

  it("does not subscribe the product root to DM history when selection changes", async () => {
    const { client, paths } = createStalledDetailClient();
    const { view } = await renderMessagingFeature(client);

    await act(() => {
      view.result.current.handleOpenDMConversation("conversation-7");
    });

    expect(view.result.current.selectedDMConversationId).toBe("conversation-7");
    expect(paths.some((path) => path.startsWith("/api/v1/mobile/dm/conversation-7/messages"))).toBe(
      false,
    );
  });
});

describe("DM mark-read cache handling", () => {
  const conversationId = "conversation-7";

  function buildInboxConversation(unreadCount: number) {
    return {
      iconUrl: null,
      id: conversationId,
      lastMessage: null,
      lastMessageAt: "2026-07-28T09:00:00.000Z",
      mentionCount: 2,
      muted: false,
      name: null,
      participantCount: 2,
      participants: [],
      type: "DM" as const,
      unreadCount,
    };
  }

  async function renderReadMutation() {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    renderedQueryClients.push(queryClient);
    queryClient.setQueryData(mobileQueryKeys.dmConversations(), {
      pageParams: [null],
      pages: [
        {
          conversations: [buildInboxConversation(3)],
          nextCursor: null,
          totalUnreadCount: 5,
        },
      ],
    });
    queryClient.setQueryData(mobileQueryKeys.bootstrap(), {
      home: {
        directMessages: { recent: [buildInboxConversation(3)], totalCount: 1, unreadCount: 5 },
      },
    });

    const client: MobileApiClient = {
      async requestJson<TResponse>() {
        return { conversationId, participantReadStates: [] } as TResponse;
      },
    };

    const view = await renderHook(() => useMobileDMReadMutation({ client }), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    return { queryClient, view };
  }

  it("patches the inbox and bootstrap counters instead of refetching them", async () => {
    const { queryClient, view } = await renderReadMutation();

    await act(async () => {
      view.result.current.mutate({ conversationId });
    });

    await waitFor(() => {
      expect(view.result.current.isSuccess).toBe(true);
    });

    const inbox = queryClient.getQueryData(mobileQueryKeys.dmConversations()) as {
      pages: { conversations: { unreadCount: number }[]; totalUnreadCount: number }[];
    };
    expect(inbox.pages[0]?.conversations[0]?.unreadCount).toBe(0);
    expect(inbox.pages[0]?.totalUnreadCount).toBe(2);

    const bootstrap = queryClient.getQueryData(mobileQueryKeys.bootstrap()) as {
      home: { directMessages: { recent: { unreadCount: number }[]; unreadCount: number } };
    };
    expect(bootstrap.home.directMessages.unreadCount).toBe(2);
    expect(bootstrap.home.directMessages.recent[0]?.unreadCount).toBe(0);

    // Bootstrap is the heaviest read the app makes; marking a DM read must not
    // put it back on the wire.
    expect(queryClient.getQueryState(mobileQueryKeys.bootstrap())?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(mobileQueryKeys.dmConversations())?.isInvalidated).toBe(false);
  });
});
