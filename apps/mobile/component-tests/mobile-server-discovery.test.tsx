import React from "react";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

let mockDiscoveryQuery: Record<string, unknown>;

jest.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: () => mockDiscoveryQuery,
}));

jest.mock("@shopify/flash-list", () => ({
  FlashList: ({
    data,
    ListEmptyComponent,
    renderItem,
    testID,
  }: {
    data: readonly unknown[];
    ListEmptyComponent?: React.ReactNode;
    renderItem(input: { item: unknown }): React.ReactNode;
    testID: string;
  }) => {
    const React = require("react");
    const { View } = require("react-native");
    if (data.length === 0) {
      return React.createElement(View, { testID }, ListEmptyComponent ?? null);
    }
    return React.createElement(
      View,
      { testID },
      data.map((item, index) =>
        React.createElement(React.Fragment, { key: index }, renderItem({ item })),
      ),
    );
  },
}));

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({ apiClient: { requestJson: jest.fn() } }),
}));

import { MobileServerDiscoveryScreen } from "../src/workspace/mobile-server-discovery-screen";

function createCard(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    bannerUrl: null,
    description: "Whispr'ın resmi topluluk sunucusu",
    iconUrl: null,
    id: "server-1",
    memberCount: 128,
    name: "Whispr Community",
    onlineCount: 12,
    shortName: "WC",
    type: "COMMUNITY" as const,
    verified: true,
    ...overrides,
  };
}

function resetMocks(pages: readonly { nextCursor: string | null; servers: unknown[] }[]) {
  mockDiscoveryQuery = {
    data: { pages },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    isPending: false,
    refetch: jest.fn(),
  };
}

describe("mobile server discovery screen", () => {
  it("renders a discoverable server card and opens its profile on tap", async () => {
    resetMocks([{ nextCursor: null, servers: [createCard()] }]);
    const onOpenServer = jest.fn();
    const view = await render(
      <MobileServerDiscoveryScreen onBack={jest.fn()} onOpenServer={onOpenServer} />,
    );

    expect(view.getByText("Whispr Community")).toBeTruthy();
    expect(view.getByText("128 üye")).toBeTruthy();
    expect(view.getByText("12 çevrimiçi")).toBeTruthy();
    expect(view.getByText("Whispr'ın resmi topluluk sunucusu")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-discover-card-server-1"));
    expect(onOpenServer).toHaveBeenCalledWith("server-1");
  });

  it("shows the honest empty state when no server is discoverable yet", async () => {
    resetMocks([{ nextCursor: null, servers: [] }]);
    const view = await render(
      <MobileServerDiscoveryScreen onBack={jest.fn()} onOpenServer={jest.fn()} />,
    );

    expect(view.getByTestId("mobile-discover-empty")).toBeTruthy();
    expect(view.getByText("Henüz keşfedilecek sunucu yok")).toBeTruthy();
  });

  it("shows a distinct empty-search string once the debounced query settles on zero results", async () => {
    resetMocks([{ nextCursor: null, servers: [] }]);
    const view = await render(
      <MobileServerDiscoveryScreen onBack={jest.fn()} onOpenServer={jest.fn()} />,
    );

    await fireEvent.changeText(view.getByTestId("mobile-discover-search-input"), "zzz-yok");

    await waitFor(
      () => expect(view.getByText('"zzz-yok" ile eşleşen bir sunucu yok.')).toBeTruthy(),
      { timeout: 2000 },
    );
    expect(view.queryByText("Henüz keşfedilecek sunucu yok")).toBeNull();
  });

  it("surfaces a retry action instead of a blank screen on load failure", async () => {
    mockDiscoveryQuery = {
      data: undefined,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isError: true,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      isPending: false,
      refetch: jest.fn(),
    };
    const view = await render(
      <MobileServerDiscoveryScreen onBack={jest.fn()} onOpenServer={jest.fn()} />,
    );

    expect(view.getByTestId("mobile-discover-error")).toBeTruthy();
    expect(view.getByText("Sunucular yüklenemedi. Lütfen tekrar dene.")).toBeTruthy();

    await fireEvent.press(view.getByText("Tekrar dene"));
    expect(mockDiscoveryQuery.refetch as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it("calls onBack from the header back button", async () => {
    resetMocks([{ nextCursor: null, servers: [] }]);
    const onBack = jest.fn();
    const view = await render(
      <MobileServerDiscoveryScreen onBack={onBack} onOpenServer={jest.fn()} />,
    );

    await fireEvent.press(view.getByTestId("mobile-discover-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
