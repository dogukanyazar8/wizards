import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { MobileAdminCaseDetailResponse, MobileAdminCaseListResponse } from "@wizards/types";

const mockFetchCases = jest.fn<() => Promise<MobileAdminCaseListResponse>>();
const mockFetchCase = jest.fn<() => Promise<MobileAdminCaseDetailResponse>>();
const mockClaim = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockDismiss = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockEscalate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
let mockNetworkStatus: "offline" | "online" | "unknown" = "online";

jest.mock("@shopify/flash-list", () => ({
  FlashList: ({
    data,
    ListEmptyComponent,
    renderItem,
    testID,
  }: {
    readonly data: readonly unknown[];
    readonly ListEmptyComponent?: React.ReactNode;
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

jest.mock("../src/app/providers/mobile-network-provider", () => ({
  useMobileNetworkStatus: () => mockNetworkStatus,
}));

jest.mock("../src/admin/mobile-admin-client", () => ({
  claimMobileAdminCase: (...args: unknown[]) => mockClaim(...args),
  dismissMobileAdminCase: (...args: unknown[]) => mockDismiss(...args),
  escalateMobileAdminCase: (...args: unknown[]) => mockEscalate(...args),
  fetchMobileAdminCase: () => mockFetchCase(),
  fetchMobileAdminCases: () => mockFetchCases(),
}));

import { ToastProvider } from "../src/app/components/kit/toast";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobileAdminCaseDetailScreen } from "../src/admin/mobile-admin-case-detail-screen";
import { MobileAdminCasesScreen } from "../src/admin/mobile-admin-cases-screen";
import { mobileCopy } from "../src/locale/mobile-copy";

const copy = mobileCopy.tr;

const summary = {
  assigneeHandle: null,
  caseId: "case-1",
  openedAt: "2026-07-27T08:00:00.000Z",
  priority: "URGENT" as const,
  publicNumber: 42,
  reportCount: 3,
  status: "OPEN" as const,
  subjectHandle: "spammer",
};

const detail: MobileAdminCaseDetailResponse = {
  case: {
    ...summary,
    evidence: [{ evidenceId: "evidence-1", preview: "spam bağlantısı", scope: "#genel" }],
    reports: [
      {
        createdAt: "2026-07-27T08:05:00.000Z",
        details: "aynı bağlantıyı her kanala attı",
        reason: "SPAM",
        reportId: "report-1",
      },
    ],
  },
};

function wrap(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { gcTime: 0, retry: false } },
  });

  return (
    <QueryClientProvider client={client}>
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <ToastProvider>{node}</ToastProvider>
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </QueryClientProvider>
  );
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderQueue() {
  const props = { onBack: jest.fn(), onOpenCase: jest.fn<(caseId: string) => void>() };
  const view = await render(wrap(<MobileAdminCasesScreen {...props} />));
  await settle();

  return { props, view };
}

async function renderCase() {
  const props = { caseId: "case-1", onBack: jest.fn() };
  const view = await render(wrap(<MobileAdminCaseDetailScreen {...props} />));
  await settle();

  return { props, view };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNetworkStatus = "online";
  mockFetchCases.mockResolvedValue({ cases: [summary] });
  mockFetchCase.mockResolvedValue(detail);
  mockClaim.mockResolvedValue({ caseId: "case-1", claimed: true });
  mockDismiss.mockResolvedValue({ caseId: "case-1", status: "DISMISSED" });
  mockEscalate.mockResolvedValue({ caseId: "case-1", priority: "URGENT" });
});

afterEach(async () => {
  await settle();
});

describe("mobile moderation queue", () => {
  it("renders a case row with its number, priority and report count", async () => {
    const { props, view } = await renderQueue();

    await waitFor(() => expect(view.getByText("MOD-42")).toBeTruthy());
    expect(view.getByText(copy.adminPriorityUrgent)).toBeTruthy();
    expect(view.getByText("@spammer")).toBeTruthy();
    expect(view.getByText(copy.adminCaseReportCount.replace("{count}", "3"))).toBeTruthy();
    expect(view.getByText(copy.adminCaseUnassigned)).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-admin-case-case-1"));
    });
    expect(props.onOpenCase).toHaveBeenCalledWith("case-1");
  });

  it("says an empty queue is empty rather than broken", async () => {
    mockFetchCases.mockResolvedValue({ cases: [] });

    const { view } = await renderQueue();

    await waitFor(() => expect(view.getByTestId("mobile-admin-cases-empty")).toBeTruthy());
  });

  /**
   * A deep link is not an authorization decision: `/admin` only had to be on the
   * routable list for the notification to open anything at all. The server is
   * still the one that answers, and a 403 has to read as "yetkin yok" rather
   * than as an empty queue.
   */
  it("shows the forbidden state when the server refuses the queue", async () => {
    const { MobileApiError } = jest.requireActual<typeof import("../src/api/mobile-api-client")>(
      "../src/api/mobile-api-client",
    );
    mockFetchCases.mockRejectedValue(
      new MobileApiError("forbidden", { code: "forbidden", status: 403 }),
    );

    const { view } = await renderQueue();

    await waitFor(() => expect(view.getByTestId("mobile-admin-cases-error")).toBeTruthy());
    expect(view.getByText(copy.adminQueueForbidden)).toBeTruthy();
  });

  it("warns that decisions wait for the network while offline", async () => {
    mockNetworkStatus = "offline";

    const { view } = await renderQueue();

    expect(view.getByTestId("mobile-admin-offline-notice")).toBeTruthy();
  });
});

describe("mobile case file", () => {
  it("shows reports and evidence previews from the snapshot", async () => {
    const { view } = await renderCase();

    await waitFor(() => expect(view.getByTestId("mobile-admin-case-summary")).toBeTruthy());
    expect(view.getByText(copy.adminReasonSpam)).toBeTruthy();
    expect(view.getByText("aynı bağlantıyı her kanala attı")).toBeTruthy();
    expect(view.getByText("spam bağlantısı")).toBeTruthy();
    expect(view.getByText("#genel")).toBeTruthy();
  });

  it("claims the case and never offers ban or message deletion", async () => {
    const { view } = await renderCase();

    await waitFor(() => expect(view.getByTestId("mobile-admin-action-claim")).toBeTruthy());
    expect(view.queryByText("Yasakla")).toBeNull();
    expect(view.queryByText("Mesajı sil")).toBeNull();

    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-admin-action-claim"));
    });

    await waitFor(() => expect(mockClaim).toHaveBeenCalledWith({}, "case-1"));
  });

  it("refuses to dismiss without a reason and sends the trimmed one", async () => {
    const { view } = await renderCase();

    await waitFor(() => expect(view.getByTestId("mobile-admin-action-dismiss")).toBeTruthy());
    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-admin-action-dismiss"));
    });

    const confirm = view.getByTestId("mobile-admin-dismiss-confirm");
    await act(async () => {
      fireEvent.press(confirm);
    });
    expect(mockDismiss).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.changeText(view.getByTestId("mobile-admin-dismiss-reason"), "  yinelenen rapor  ");
    });
    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-admin-dismiss-confirm"));
    });

    await waitFor(() => expect(mockDismiss).toHaveBeenCalledWith({}, "case-1", "yinelenen rapor"));
  });

  it("escalates with an optional note", async () => {
    const { view } = await renderCase();

    await waitFor(() => expect(view.getByTestId("mobile-admin-action-escalate")).toBeTruthy());
    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-admin-action-escalate"));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-admin-escalate-confirm"));
    });

    await waitFor(() => expect(mockEscalate).toHaveBeenCalledWith({}, "case-1", undefined));
  });

  /**
   * F test 6: offline disables the buttons and sends nothing. No outbox, no
   * retry queue — a moderation decision that lands hours later on a case
   * somebody else already closed is worse than no decision.
   */
  it("disables every action offline and queues nothing", async () => {
    mockNetworkStatus = "offline";

    const { view } = await renderCase();

    await waitFor(() => expect(view.getByTestId("mobile-admin-case-offline-notice")).toBeTruthy());
    const claim = view.getByTestId("mobile-admin-action-claim");
    expect(claim.props.accessibilityState?.disabled).toBe(true);

    await act(async () => {
      fireEvent.press(claim);
      fireEvent.press(view.getByTestId("mobile-admin-action-dismiss"));
      fireEvent.press(view.getByTestId("mobile-admin-action-escalate"));
    });

    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockEscalate).not.toHaveBeenCalled();
  });
});
