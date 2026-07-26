import React from "react";
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
      voteCount: 128,
    }),
    roadmapItem("item-2", { status: "PLANNED", title: "Sesli mesajlar" }),
    roadmapItem("item-3", { status: "PLANNED", title: "Zamanlanmış etkinlikler" }),
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
    expect(view.getByTestId("mobile-roadmap-filter-count-ALL").props.children).toBe(3);
    expect(view.getByTestId("mobile-roadmap-filter-count-PLANNED").props.children).toBe(2);
    expect(view.getByTestId("mobile-roadmap-filter-count-IN_PROGRESS").props.children).toBe(1);
    // An empty chip still renders; a row that reshuffles as items move is worse
    // than a zero.
    expect(view.getByTestId("mobile-roadmap-filter-count-SHIPPED").props.children).toBe(0);
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
    await fireEvent.press(view.getByTestId("mobile-roadmap-filter-SHIPPED"));

    await waitFor(() => expect(view.getByText(copy.roadmapFilterEmpty)).toBeTruthy());
    expect(view.queryByText(copy.roadmapEmptyTitle)).toBeNull();
  });

  it("shows the item's description and when it last moved", async () => {
    const { view } = await renderRoadmap();

    await waitFor(() =>
      expect(view.getByText("Sunucu içinde mesaj ve kanal araması.")).toBeTruthy(),
    );
    expect(view.getByTestId("mobile-roadmap-updated-item-1")).toBeTruthy();
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

  it("does not fetch the report list until the tab is opened", async () => {
    const { view } = await renderRoadmap();

    await waitFor(() => expect(mockFetchRoadmap).toHaveBeenCalled());
    expect(mockFetchFeedbackList).not.toHaveBeenCalled();

    await fireEvent.press(view.getByTestId("mobile-roadmap-tab-mine"));
    await waitFor(() => expect(mockFetchFeedbackList).toHaveBeenCalledTimes(1));
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
