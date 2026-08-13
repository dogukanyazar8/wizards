import React from "react";
import { Text } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import { useMobileGroupSettingsMutations } from "../src/dm/mobile-group-client";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";

describe("joining a group through an invite", () => {
  it("resolves before the inbox refetch settles", async () => {
    const settled: string[] = [];
    let resolveInvalidations!: () => void;
    const invalidations = new Promise<void>((resolve) => {
      resolveInvalidations = resolve;
    });
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { gcTime: 0, retry: false } },
    });
    const invalidatedKeys: unknown[] = [];
    queryClient.invalidateQueries = ((filters: { queryKey?: unknown }) => {
      invalidatedKeys.push(filters.queryKey);
      return invalidations;
    }) as typeof queryClient.invalidateQueries;
    const client: MobileApiClient = {
      requestJson: async <TResponse,>() =>
        ({
          alreadyMember: false,
          conversation: {
            iconUrl: null,
            id: "dm-group-1",
            lastMessage: null,
            lastMessageAt: "2026-08-12T12:00:00.000Z",
            name: "Team",
            ownerId: "user-1",
            participants: [],
            type: "GROUP_DM",
          },
        }) as TResponse,
    };

    function Probe() {
      const { joinViaInvite } = useMobileGroupSettingsMutations(client);
      const started = React.useRef(false);

      React.useEffect(() => {
        if (started.current) {
          return;
        }
        started.current = true;
        void joinViaInvite
          .mutateAsync({ code: "invite-code" })
          .then(() => settled.push("resolved"));
      }, [joinViaInvite]);

      return <Text testID="mobile-group-join-probe">{settled.length}</Text>;
    }

    const rendered = await render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(settled).toEqual(["resolved"]));
    expect(invalidatedKeys).toEqual([
      mobileQueryKeys.dmConversations(),
      mobileQueryKeys.groupDetails("dm-group-1"),
    ]);
    resolveInvalidations();
    await rendered.unmount();
    queryClient.clear();
  });
});
