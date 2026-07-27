import React from "react";
import { StyleSheet } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type {
  MobileFeedbackListResponse,
  MobileRoadmapItem,
  MobileRoadmapListResponse,
} from "@wizards/types";

const mockFetchRoadmap = jest.fn<() => Promise<MobileRoadmapListResponse>>();
const mockFetchFeedbackList = jest.fn<() => Promise<MobileFeedbackListResponse>>();
const mockSetVote = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("@shopify/flash-list", () => ({
  FlashList: ({
    data,
    ListEmptyComponent,
    ListFooterComponent,
    renderItem,
    testID,
  }: {
    readonly data: readonly unknown[];
    readonly ListEmptyComponent?: React.ReactNode;
    readonly ListFooterComponent?: React.ReactNode;
    readonly renderItem: (input: { readonly item: unknown }) => React.ReactNode;
    readonly testID?: string;
  }) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(
      View,
      { testID },
      data.length === 0
        ? ListEmptyComponent
        : data.map((item, index) =>
            React.createElement(React.Fragment, { key: index }, renderItem({ item })),
          ),
      ListFooterComponent,
    );
  },
}));

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({
    apiClient: {},
    getAccessToken: async () => "token",
    status: "signed-in",
  }),
}));

jest.mock("../src/feedback/mobile-feedback-client", () => ({
  fetchMobileFeedback: jest.fn(),
  fetchMobileFeedbackList: () => mockFetchFeedbackList(),
  fetchMobileRoadmap: () => mockFetchRoadmap(),
  setMobileRoadmapVote: (...args: unknown[]) => mockSetVote(...args),
  submitMobileFeedback: jest.fn(),
}));

import { ToastProvider } from "../src/app/components/kit/toast";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobileRoadmapScreen } from "../src/feedback/mobile-roadmap-screen";
import { mobileCopy } from "../src/locale/mobile-copy";

const copy = mobileCopy.tr;

const roadmapItem = (
  id: string,
  overrides: Partial<MobileRoadmapItem> = {},
): MobileRoadmapItem => ({
  description: null,
  id,
  isOwnSuggestion: false,
  status: "PLANNED",
  title: id,
  updatedAt: "2026-07-26T10:00:00.000Z",
  versionLabel: null,
  voteCount: 4,
  votedByViewer: false,
  ...overrides,
});

const roadmap: MobileRoadmapListResponse = {
  items: [
    roadmapItem("item-1", {
      description: "Sunucu içinde mesaj ve kanal araması.",
      status: "IN_PROGRESS",
      title: "Sunucu içi arama",
      versionLabel: "v1.9",
      voteCount: 128,
    }),
    roadmapItem("item-2", { status: "PLANNED", title: "Sesli mesajlar" }),
    roadmapItem("item-3", { status: "PLANNED", title: "Zamanlanmış etkinlikler" }),
    roadmapItem("item-4", { status: "SHIPPED", title: "Özel emoji yükleme", versionLabel: "v1.8" }),
  ],
};

const feedbackList: MobileFeedbackListResponse = {
  items: [
    {
      createdAt: "2026-07-20T08:00:00.000Z",
      id: "feedback-1",
      preview: "Mikrofon simgesi geç güncelleniyor.",
      publicNumber: 1284,
      rating: "OKAY",
      status: "PLANNED",
      statusChangedAt: "2026-07-24T09:00:00.000Z",
      topic: "BUG",
      versionLabel: "v1.8.4",
    },
  ],
};

async function renderRoadmap() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { gcTime: 0, retry: false } },
  });
  const props = {
    onBack: jest.fn(),
    onOpenFeedback: jest.fn<(feedbackId: string) => void>(),
    onStartFeedback: jest.fn(),
  };

  const view = await render(
    <QueryClientProvider client={client}>
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <ToastProvider>
            <MobileRoadmapScreen {...props} />
          </ToastProvider>
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </QueryClientProvider>,
  );

  // FlashList measures itself in a layout effect the moment data first arrives.
  // Letting the query settle inside act is what keeps that measurement from
  // landing outside a React batch.
  await act(async () => {
    await Promise.resolve();
  });

  return { props, view };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchRoadmap.mockResolvedValue(roadmap);
  mockFetchFeedbackList.mockResolvedValue(feedbackList);
});

afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
  });
});

describe("community roadmap", () => {
  it("counts every status chip, including the ones with nothing behind them", async () => {
    const { view } = await renderRoadmap();

    await waitFor(() => expect(view.getByText("Sunucu içi arama")).toBeTruthy());
    expect(view.getByTestId("mobile-roadmap-filter-count-ALL").props.children).toBe(4);
    expect(view.getByTestId("mobile-roadmap-filter-count-PLANNED").props.children).toBe(2);
    expect(view.getByTestId("mobile-roadmap-filter-count-IN_PROGRESS").props.children).toBe(1);
    // An empty chip still renders; a row that reshuffles as items move is worse
    // than a zero.
    expect(view.getByTestId("mobile-roadmap-filter-count-SHIPPED").props.children).toBe(1);
    expect(view.getByTestId("mobile-roadmap-filter-dot-PLANNED")).toBeTruthy();
  });

  it("keeps the status filter row the height of its chips", async () => {
    const { view } = await renderRoadmap();

    // A horizontal ScrollView inside a flex column takes the free vertical space
    // and, because its content container stretches, hands that whole height to
    // every chip — which is how a 7px pill became a column the length of the
    // screen on device.
    const row = view.getByTestId("mobile-roadmap-filter-row");
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexGrow: 0 });
    expect(StyleSheet.flatten(row.props.contentContainerStyle)).toMatchObject({
      alignItems: "center",
    });
  });

  it("narrows the list to the chosen status and back again", async () => {
    const { view } = await renderRoadmap();

    await waitFor(() => expect(view.getByText("Sunucu içi arama")).toBeTruthy());
    await fireEvent.press(view.getByTestId("mobile-roadmap-filter-PLANNED"));

    await waitFor(() => expect(view.queryByText("Sunucu içi arama")).toBeNull());
    expect(view.getByText("Sesli mesajlar")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-roadmap-filter-ALL"));
    await waitFor(() => expect(view.getByText("Sunucu içi arama")).toBeTruthy());
  });

  it("says the filter is empty rather than that the roadmap is", async () => {
    const { view } = await renderRoadmap();

    await waitFor(() => expect(view.getByText("Sunucu içi arama")).toBeTruthy());
    await fireEvent.press(view.getByTestId("mobile-roadmap-filter-REVIEWING"));

    await waitFor(() => expect(view.getByText(copy.roadmapFilterEmpty)).toBeTruthy());
    expect(view.queryByText(copy.roadmapEmptyTitle)).toBeNull();
  });

  it("shows the item's description without leaking a generic edit timestamp", async () => {
    const { view } = await renderRoadmap();

    await waitFor(() =>
      expect(view.getByText("Sunucu içinde mesaj ve kanal araması.")).toBeTruthy(),
    );
    expect(view.queryByTestId("mobile-roadmap-updated-item-1")).toBeNull();
    expect(view.getByText("v1.9 hedefi")).toBeTruthy();
  });

  it("keeps a shipped roadmap vote visibly disabled", async () => {
    const { view } = await renderRoadmap();

    await waitFor(() => expect(view.getByText("Özel emoji yükleme")).toBeTruthy());
    expect(view.getByTestId("mobile-roadmap-vote-item-4").props.accessibilityState).toMatchObject({
      disabled: true,
      selected: false,
    });
  });
});

describe("my reports tab", () => {
  it("opens the tracking view for the report that was tapped", async () => {
    const { props, view } = await renderRoadmap();

    await fireEvent.press(view.getByTestId("mobile-roadmap-tab-mine"));
    await waitFor(() => expect(view.getByText("WSP-1284")).toBeTruthy());

    await fireEvent.press(view.getByTestId("mobile-my-feedback-row-feedback-1"));
    expect(props.onOpenFeedback).toHaveBeenCalledWith("feedback-1");
  });

  it("loads the report list on mount so its tab count is available immediately", async () => {
    const { view } = await renderRoadmap();

    await waitFor(() => expect(mockFetchRoadmap).toHaveBeenCalled());
    await waitFor(() => expect(mockFetchFeedbackList).toHaveBeenCalledTimes(1));
    expect(view.getByTestId("mobile-roadmap-tab-badge").props.children).toBe(1);

    await fireEvent.press(view.getByTestId("mobile-roadmap-tab-mine"));
    await waitFor(() => expect(view.getByText("WSP-1284")).toBeTruthy());
  });

  it("draws each report as a compact tracking row and keeps a new-feedback footer", async () => {
    const { props, view } = await renderRoadmap();

    await fireEvent.press(view.getByTestId("mobile-roadmap-tab-mine"));
    await waitFor(() =>
      expect(view.getByTestId("mobile-my-feedback-preview-feedback-1")).toBeTruthy(),
    );

    expect(view.getByTestId("mobile-my-feedback-preview-feedback-1").props.numberOfLines).toBe(1);
    expect(view.getByTestId("mobile-my-feedback-time-feedback-1").props.children).not.toContain(
      "önce",
    );
    expect(view.getByText("v1.8.4 hedefi")).toBeTruthy();
    expect(view.getByTestId("mobile-my-feedback-chevron-feedback-1")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-my-feedback-start-footer"));
    expect(props.onStartFeedback).toHaveBeenCalledTimes(1);
  });

  it("sends a user with no reports back to the form", async () => {
    mockFetchFeedbackList.mockResolvedValue({ items: [] });
    const { props, view } = await renderRoadmap();

    await fireEvent.press(view.getByTestId("mobile-roadmap-tab-mine"));
    await waitFor(() => expect(view.getByText(copy.myFeedbackEmptyTitle)).toBeTruthy());

    await fireEvent.press(view.getByTestId("mobile-my-feedback-start"));
    expect(props.onStartFeedback).toHaveBeenCalledTimes(1);
  });
});
