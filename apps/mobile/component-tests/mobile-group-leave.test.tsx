import React from "react";
import { Text } from "react-native";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import { useMobileGroupMutations } from "../src/dm/mobile-group-client";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";

/**
 * Leaving a group navigates in the mutation's `.then`, so whatever that promise
 * waits for is time the reader spends staring at a conversation they are no
 * longer in. It must wait for the request and nothing else.
 */

const VIEWER = "user-1";

function client(): MobileApiClient {
  return {
    requestJson: async <TResponse,>() => ({}) as TResponse,
  };
}

/**
 * An inbox query that never settles, standing in for a slow refetch. Held
 * active so `invalidateQueries` actually reaches it.
 */
function useHangingConversations() {
  useQuery({
    queryFn: () => new Promise<never>(() => {}),
    queryKey: mobileQueryKeys.dmConversations(),
  });
}

function renderLeaveProbe(userId: string) {
  const settled: string[] = [];
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { gcTime: 0, retry: false } },
  });

  function Probe() {
    useHangingConversations();
    const { removeMember } = useMobileGroupMutations(client(), VIEWER);
    const started = React.useRef(false);

    React.useEffect(() => {
      if (started.current) {
        return;
      }

      started.current = true;
      void removeMember
        .mutateAsync({ conversationId: "dm-group-1", userId })
        .then(() => settled.push("resolved"));
    }, [removeMember, userId]);

    return <Text testID="mobile-group-leave-probe">{settled.length}</Text>;
  }

  render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );

  return settled;
}

describe("leaving a group", () => {
  it("resolves as soon as the request lands, not when the inbox refetch does", async () => {
    const settled = renderLeaveProbe(VIEWER);

    await waitFor(() => expect(settled).toEqual(["resolved"]));
  });

  /**
   * Removing somebody else is not a departure: the actor stays on the detail
   * screen, which has to be correct before they look at it again.
   */
  it("still waits for the caches when the removed member is not the viewer", async () => {
    const settled = renderLeaveProbe("user-2");

    // Inside `act` so the query notifications this wait lets through are
    // flushed the way React expects rather than warned about.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(settled).toEqual([]);
  });
});
