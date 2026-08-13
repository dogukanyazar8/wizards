import React from "react";
import { beforeEach, describe, expect, it } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import {
  getMobileRecentDMPrefetchStats,
  recordMobileRecentDMPrefetch,
  recordMobileRecentDMPrefetchSettled,
  resetMobileRecentDMPrefetchStats,
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
    resetMobileRecentDMPrefetchStats();
  });

  it("counts a tap on a settled warm conversation as a hit", async () => {
    recordMobileRecentDMPrefetch(["conversation-1", "conversation-2"]);
    recordMobileRecentDMPrefetchSettled("conversation-1");
    recordMobileRecentDMPrefetchSettled("conversation-2");
    const view = await renderPrefetchActions();

    await act(async () => {
      view.result.current.prefetchDMMessages("conversation-1");
    });

    const stats = getMobileRecentDMPrefetchStats();
    expect(stats.attempted).toBe(2);
    expect(stats.settled).toBe(2);
    expect(stats.openedAfterSettled).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.5);
  });

  /**
   * The warming was counted at the attempt, so a conversation whose read had not
   * come back still read as a hit — the reader waited for that request either
   * way.
   */
  it("gives no credit for opening a conversation whose warm never landed", async () => {
    recordMobileRecentDMPrefetch(["conversation-1"]);
    const view = await renderPrefetchActions();

    await act(async () => {
      view.result.current.prefetchDMMessages("conversation-1");
    });

    const stats = getMobileRecentDMPrefetchStats();
    expect(stats.attempted).toBe(1);
    expect(stats.settled).toBe(0);
    expect(stats.openedAfterSettled).toBe(0);
  });

  it("does not count a conversation that was never warmed", async () => {
    recordMobileRecentDMPrefetch(["conversation-1"]);
    recordMobileRecentDMPrefetchSettled("conversation-1");
    const view = await renderPrefetchActions();

    await act(async () => {
      view.result.current.prefetchDMMessages("conversation-never-warmed");
    });

    expect(getMobileRecentDMPrefetchStats().openedAfterSettled).toBe(0);
  });
});
