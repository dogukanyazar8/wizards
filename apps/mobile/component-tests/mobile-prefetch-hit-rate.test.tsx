import React from "react";
import { beforeEach, describe, expect, it } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import {
  getMobileRecentDMPrefetchStats,
  recordMobileRecentDMPrefetch,
  resetMobileRecentDMPrefetchStatsForTests,
  useMobileMessagePrefetch,
} from "../src/query/mobile-message-prefetch";

const apiClient = {
  requestJson: async () => ({
    conversation: {
      id: "conversation-1",
      lastMessage: null,
      lastMessageAt: "2026-07-29T09:00:00.000Z",
      name: null,
      participants: [],
      type: "DM",
    },
    messages: [],
    nextCursor: null,
    participantReadStates: [],
  }),
} as unknown as MobileApiClient;

async function renderPrefetchActions() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return renderHook(() => useMobileMessagePrefetch(apiClient), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

/**
 * The stat existed and was unit tested; nothing in the app ever reported an
 * open, so the panel read 0% no matter how well the warming worked. The wiring
 * is what this covers.
 */
describe("recent DM prefetch hit rate", () => {
  beforeEach(() => {
    resetMobileRecentDMPrefetchStatsForTests();
  });

  it("counts a tap on a warmed conversation as a hit", async () => {
    recordMobileRecentDMPrefetch(["conversation-1", "conversation-2"]);
    const view = await renderPrefetchActions();

    await act(async () => {
      view.result.current.prefetchDMMessages("conversation-1");
    });

    const stats = getMobileRecentDMPrefetchStats();
    expect(stats.warmed).toBe(2);
    expect(stats.hits).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.5);
  });

  it("does not count a conversation that was never warmed", async () => {
    recordMobileRecentDMPrefetch(["conversation-1"]);
    const view = await renderPrefetchActions();

    await act(async () => {
      view.result.current.prefetchDMMessages("conversation-never-warmed");
    });

    expect(getMobileRecentDMPrefetchStats().hits).toBe(0);
  });
});
