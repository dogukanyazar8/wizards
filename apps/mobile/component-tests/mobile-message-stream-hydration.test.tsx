import React from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react-native";
import type { MobileChannelMessagesResponse, MobileDMMessagesResponse } from "@wizards/types";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import {
  annotateMobileNavigationSpan,
  beginMobileNavigationSpan,
  completeMobileNavigationSpan,
  resetMobileNavigationTimingForTests,
} from "../src/performance/mobile-navigation-timing";
import {
  peekMobilePerformanceSamples,
  resetMobilePerformanceMetricsForTests,
} from "../src/performance/mobile-performance-metrics";
import { resetMobileMessageStreamSourcesForTests } from "../src/query/mobile-message-stream-source";
import type { MobileMessageStorePageEntry } from "../src/storage/mobile-message-store";

const mockReadPageEntry = jest.fn();
jest.mock("../src/storage/mobile-message-store-database", () => ({
  mobileMessageStore: {
    appendPerformanceSamples: async () => undefined,
    close: async () => undefined,
    deletePage: async () => undefined,
    describe: async () => ({ cipherVersion: "4.7.0 test", rowCount: 1, status: "open" }),
    purgeAll: async () => undefined,
    purgePerformanceSamples: async () => undefined,
    purgeUser: async () => undefined,
    readPage: async () => null,
    readPageEntry: (...args: unknown[]) => mockReadPageEntry(...args),
    readPerformanceSamples: async () => [],
    resume: () => undefined,
    warm: async () => undefined,
    writePage: async () => undefined,
  },
}));

import { useMobileDMRouteState } from "../src/app/features/use-mobile-dm-route-state";
import { useMobileChannelRouteState } from "../src/app/features/use-mobile-channel-route-state";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";

const storedPage: MobileDMMessagesResponse = {
  conversation: {
    id: "conversation-1",
    lastMessage: null,
    lastMessageAt: "2026-08-04T05:00:00.000Z",
    name: null,
    participants: [],
    type: "DM",
  },
  messages: [],
  nextCursor: null,
  participantReadStates: [],
};

const storedChannelPage: MobileChannelMessagesResponse = {
  channel: {
    categoryId: null,
    categoryName: null,
    id: "channel-1",
    lastMessage: null,
    locked: false,
    mentionCount: 0,
    name: "Cached channel",
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("DM SQLCipher hydration barrier", () => {
  afterEach(async () => {
    await cleanup();
    resetMobileNavigationTimingForTests();
    resetMobilePerformanceMetricsForTests();
    resetMobileMessageStreamSourcesForTests();
    jest.clearAllMocks();
  });

  it("does not start the network query before the encrypted restore attempt settles", async () => {
    const stored = createDeferred<MobileMessageStorePageEntry | null>();
    const network = createDeferred<MobileDMMessagesResponse>();
    mockReadPageEntry.mockReturnValue(stored.promise);
    const requestJson = jest.fn(() => network.promise);
    const apiClient = { requestJson } as MobileApiClient;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
    });

    const view = await renderHook(
      () =>
        useMobileDMRouteState({
          apiClient,
          conversationId: "conversation-1",
          conversations: [],
          currentUserId: "user-1",
          isSignedIn: true,
        }),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );

    expect(requestJson).not.toHaveBeenCalled();
    await waitFor(() => expect(mockReadPageEntry).toHaveBeenCalledTimes(1));

    await act(async () => {
      stored.resolve({ payload: storedPage, updatedAt: 1_722_749_200_000 });
      await stored.promise;
    });

    await waitFor(() => expect(view.result.current.query.data?.pages[0]).toEqual(storedPage));
    await waitFor(() => expect(requestJson).toHaveBeenCalledTimes(1));

    await act(async () => {
      network.resolve(storedPage);
      await network.promise;
    });
    queryClient.clear();
  });

  it("refines a provisional network open to SQLCipher after encrypted restore", async () => {
    const stored = createDeferred<MobileMessageStorePageEntry | null>();
    const network = createDeferred<MobileDMMessagesResponse>();
    mockReadPageEntry.mockReturnValue(stored.promise);
    const requestJson = jest.fn(() => network.promise);
    const apiClient = { requestJson } as MobileApiClient;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
    });
    const startedAtMs = globalThis.performance.now();
    const navigationSampleId = beginMobileNavigationSpan(
      "DirectMessage",
      startedAtMs,
      false,
      "navigation",
    );
    annotateMobileNavigationSpan(
      "DirectMessage",
      { cacheAgeMs: null, source: "network" },
      navigationSampleId,
    );

    const view = await renderHook(
      () =>
        useMobileDMRouteState({
          apiClient,
          conversationId: "conversation-1",
          conversations: [],
          currentUserId: "user-1",
          isSignedIn: true,
        }),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );

    await waitFor(() => expect(mockReadPageEntry).toHaveBeenCalledTimes(1));
    await act(async () => {
      stored.resolve({ payload: storedPage, updatedAt: Date.now() - 1_000 });
      await stored.promise;
    });
    await waitFor(() => expect(view.result.current.query.data?.pages[0]).toEqual(storedPage));

    completeMobileNavigationSpan("DirectMessage", globalThis.performance.now(), navigationSampleId);
    expect(peekMobilePerformanceSamples().at(-1)?.context.source).toBe("sqlcipher");

    await act(async () => {
      network.resolve(storedPage);
      await network.promise;
    });
    queryClient.clear();
  });
});

describe("channel SQLCipher hydration barrier", () => {
  afterEach(async () => {
    await cleanup();
    resetMobileNavigationTimingForTests();
    resetMobilePerformanceMetricsForTests();
    resetMobileMessageStreamSourcesForTests();
    jest.clearAllMocks();
  });

  it("seeds the route channel before starting network reconciliation", async () => {
    const stored = createDeferred<MobileMessageStorePageEntry | null>();
    const network = createDeferred<MobileChannelMessagesResponse>();
    mockReadPageEntry.mockReturnValue(stored.promise);
    const requestJson = jest.fn((path: string) =>
      path.endsWith("/read")
        ? Promise.resolve({
            channelId: "channel-1",
            firstUnreadMessageId: null,
            mentionCount: 0,
            serverId: "server-1",
            serverMentionCount: 0,
            serverUnreadCount: 0,
            unreadCount: 0,
          })
        : network.promise,
    );
    const apiClient = { requestJson } as MobileApiClient;
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { gcTime: Number.POSITIVE_INFINITY },
        queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      },
    });
    queryClient.setQueryData(mobileQueryKeys.channelPins("channel-1"), { messages: [] });

    const view = await renderHook(
      () =>
        useMobileChannelRouteState({
          apiClient,
          channelId: "channel-1",
          currentUser: {
            avatarUrl: null,
            displayName: "Viewer",
            email: "viewer@whispr.test",
            id: "user-1",
            username: "viewer",
          },
          isSignedIn: true,
          stopTyping: () => undefined,
          updateTyping: () => undefined,
        }),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );

    expect(requestJson).not.toHaveBeenCalled();
    await waitFor(() => expect(mockReadPageEntry).toHaveBeenCalledTimes(1));
    await act(async () => {
      stored.resolve({ payload: storedChannelPage, updatedAt: Date.now() - 180_000 });
      await stored.promise;
    });
    await waitFor(() =>
      expect(view.result.current.messagesState.payload?.channel.id).toBe("channel-1"),
    );
    await waitFor(() =>
      expect(requestJson.mock.calls.filter(([path]) => path.includes("/messages?")).length).toBe(1),
    );

    await act(async () => {
      network.resolve(storedChannelPage);
      await network.promise;
    });
    queryClient.clear();
  });
});
