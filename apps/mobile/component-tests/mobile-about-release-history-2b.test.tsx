import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { MobileReleaseDetail, MobileReleaseListResponse } from "@wizards/types";

const mockUseMobileAuth = jest.fn();

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => mockUseMobileAuth(),
}));

import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobileAboutReleaseHistoryScreen } from "../src/app/screens/about/about-screen-shells";
import { lightTheme } from "../src/design/themes";
import { mobileAboutMetrics } from "../src/design/tokens";

type ReleaseHistoryScreenProps = {
  readonly installedVersion: string;
  readonly onBack: () => void;
  readonly onOpenReleaseNote: (version: string) => void;
};

const ReleaseHistoryScreen =
  MobileAboutReleaseHistoryScreen as unknown as React.ComponentType<ReleaseHistoryScreenProps>;

const INSTALLED_RELEASE: MobileReleaseDetail = {
  changeCount: 7,
  changes: [{ title: "Mesaj yazı boyutu", type: "new" }],
  codename: "Echo",
  highlight: "mesaj yazı boyutu",
  installed: true,
  releasedAt: "2026-07-24T00:00:00.000Z",
  version: "0.8.15",
};

const FIRST_PAGE: MobileReleaseListResponse = {
  nextCursor: "cursor-2",
  releases: [
    {
      changeCount: 8,
      highlight: "thread'ler",
      releasedAt: "2025-12-18T00:00:00.000Z",
      version: "0.7.9",
    },
    {
      changeCount: 11,
      codename: "Ripple",
      highlight: "ekran paylaşımı",
      releasedAt: "2026-06-27T00:00:00.000Z",
      version: "0.8.13",
    },
    {
      changeCount: 6,
      highlight: "sunucu keşfet sekmesi",
      releasedAt: "2026-07-10T00:00:00.000Z",
      version: "0.8.14",
    },
  ],
  total: 38,
};

const SECOND_PAGE: MobileReleaseListResponse = {
  nextCursor: null,
  releases: [
    {
      changeCount: 4,
      highlight: "uçtan uca ses",
      releasedAt: "2026-06-12T00:00:00.000Z",
      version: "0.8.12",
    },
  ],
  total: 38,
};

function createApiClient({
  shouldFail = () => false,
}: { readonly shouldFail?: () => boolean } = {}) {
  return {
    requestJson: jest.fn(async (path: string) => {
      if (shouldFail()) {
        throw new Error("Transient release refresh failure");
      }
      if (path === "/api/v1/mobile/app/releases/0.8.15") {
        return INSTALLED_RELEASE;
      }
      if (path.startsWith("/api/v1/mobile/app/releases?")) {
        return path.includes("cursor=cursor-2") ? SECOND_PAGE : FIRST_PAGE;
      }
      throw new Error(`Unexpected 2b request: ${path}`);
    }),
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Number.POSITIVE_INFINITY },
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
}

function renderScreen({
  apiClient = createApiClient(),
  onOpenReleaseNote = jest.fn(),
  queryClient = createQueryClient(),
}: {
  readonly apiClient?: ReturnType<typeof createApiClient>;
  readonly onOpenReleaseNote?: (version: string) => void;
  readonly queryClient?: QueryClient;
} = {}) {
  mockUseMobileAuth.mockReturnValue({
    apiClient,
    session: { user: { id: "usr_0123456789abcdef" } },
    status: "signed-in",
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <ReleaseHistoryScreen
            installedVersion="0.8.15"
            onBack={jest.fn()}
            onOpenReleaseNote={onOpenReleaseNote}
          />
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </QueryClientProvider>,
  );
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (merged, entry) => ({ ...merged, ...flattenStyle(entry) }),
      {},
    );
  }

  return style && typeof style === "object" ? (style as Record<string, unknown>) : {};
}

describe("2b release history screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(AsyncStorage.multiGet)
      .mockImplementation(async (keys) =>
        keys.map((key) => [key, key === "whispr.update.skippedVersion" ? "0.8.13" : null]),
      );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("uses the server total, groups newest-first, and renders installed/skipped markers", async () => {
    const view = await renderScreen();

    await view.findByTestId("mobile-about-release-row-0.8.15");

    const totalBadge = view.getByTestId("mobile-about-release-total");
    expect(totalBadge.props.accessibilityRole).toBe("text");
    expect(totalBadge.props.children).toBe("38");
    expect(view.getByTestId("mobile-about-release-year-2026")).toBeTruthy();
    expect(view.getByTestId("mobile-about-release-year-2025")).toBeTruthy();
    expect(
      view.getAllByTestId(/^mobile-about-release-row-/).map((row) => row.props.testID),
    ).toEqual([
      "mobile-about-release-row-0.8.15",
      "mobile-about-release-row-0.8.14",
      "mobile-about-release-row-0.8.13",
      "mobile-about-release-row-0.7.9",
    ]);

    expect(view.getByText("YÜKLÜ")).toBeTruthy();
    expect(view.getByText("ATLANDI")).toBeTruthy();
    expect(
      flattenStyle(view.getByTestId("mobile-about-release-marker-0.8.15").props.style),
    ).toMatchObject({
      backgroundColor: lightTheme.about.accentSurface,
      borderRadius: 8,
      height: 16,
      width: 16,
    });
    expect(
      flattenStyle(view.getByTestId("mobile-about-release-dot-0.8.15").props.style),
    ).toMatchObject({
      backgroundColor: lightTheme.about.accent,
      height: 9,
      width: 9,
    });
    expect(
      flattenStyle(view.getByTestId("mobile-about-release-dot-0.8.14").props.style),
    ).toMatchObject({
      backgroundColor: lightTheme.about.timelineDot,
      height: 9,
      width: 9,
    });
  });

  it("keeps the shared search geometry, group label, and every row at least 44px", async () => {
    const view = await renderScreen();

    await view.findByTestId("mobile-about-release-row-0.8.15");

    expect(
      flattenStyle(view.getByTestId("mobile-about-release-search-container").props.style),
    ).toMatchObject({
      borderRadius: mobileAboutMetrics.searchRadius,
      gap: 9,
      paddingHorizontal: 14,
      paddingVertical: 11,
    });
    expect(
      view.getByTestId("mobile-about-release-search-icon", {
        includeHiddenElements: true,
      }).props,
    ).toMatchObject({ height: 16, width: 16 });
    expect(
      flattenStyle(view.getByTestId("mobile-about-release-year-2026").props.style),
    ).toMatchObject({
      color: lightTheme.about.groupLabel,
      fontFamily: lightTheme.typography.fontFamilyBold,
      fontSize: 10.5,
      letterSpacing: 1.05,
      textTransform: "uppercase",
    });
    for (const row of view.getAllByTestId(/^mobile-about-release-row-/)) {
      expect(flattenStyle(row.props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it("debounces loaded-page search by 300ms, matches change text, clears, and shows empty state", async () => {
    const view = await renderScreen();
    await view.findByTestId("mobile-about-release-row-0.8.15");
    jest.useFakeTimers();

    const field = view.getByTestId("mobile-about-release-search");
    await fireEvent.changeText(field, "ekran paylaşımı");
    expect(view.getByText("0.8.14")).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(299);
    });
    expect(view.getByText("0.8.14")).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(view.getByTestId("mobile-about-release-row-0.8.13")).toBeTruthy();
    expect(view.queryByText("0.8.14")).toBeNull();
    expect(view.getByText("Yalnız yüklenen 4 sürümde arandı · Daha eskisini yükle")).toBeTruthy();
    expect(view.queryByTestId("mobile-about-release-load-older")).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-about-release-search-clear"));
    expect(view.getByTestId("mobile-about-release-search").props.value).toBe("");

    await fireEvent.changeText(view.getByTestId("mobile-about-release-search"), "bulunmayan");
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(view.getByText("Eşleşen sürüm yok")).toBeTruthy();
    expect(view.getByText("Başka bir sürüm numarası ya da özellik dene")).toBeTruthy();
  });

  it("loads the next page and removes the load row on the last page", async () => {
    const apiClient = createApiClient();
    const view = await renderScreen({ apiClient });

    await view.findByTestId("mobile-about-release-row-0.8.15");
    await fireEvent.press(view.getByTestId("mobile-about-release-load-older"));

    await view.findByTestId("mobile-about-release-row-0.8.12");
    expect(apiClient.requestJson).toHaveBeenCalledWith(
      expect.stringMatching(/\/app\/releases\?.*cursor=cursor-2/),
      { method: "GET" },
    );
    await waitFor(() => expect(view.queryByTestId("mobile-about-release-load-older")).toBeNull());
  });

  it("keeps cached release history visible when re-entry refresh fails", async () => {
    const queryClient = createQueryClient();
    let shouldFail = false;
    const apiClient = createApiClient({ shouldFail: () => shouldFail });
    const firstView = await renderScreen({ apiClient, queryClient });

    await firstView.findByTestId("mobile-about-release-row-0.8.15");
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    const requestCountAfterFirstEntry = apiClient.requestJson.mock.calls.length;
    await firstView.unmount();

    shouldFail = true;
    const secondView = await renderScreen({ apiClient, queryClient });
    await waitFor(() =>
      expect(apiClient.requestJson.mock.calls.length).toBeGreaterThan(requestCountAfterFirstEntry),
    );
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    expect(secondView.queryByTestId("mobile-about-release-error")).toBeNull();
    expect(secondView.getByTestId("mobile-about-release-row-0.8.15")).toBeTruthy();
    expect(secondView.getByTestId("mobile-about-release-row-0.8.14")).toBeTruthy();
    expect(secondView.getByTestId("mobile-about-release-total").props.children).toBe("38");
  });

  it("opens AboutReleaseNote with the pressed version", async () => {
    const onOpenReleaseNote = jest.fn();
    const view = await renderScreen({ onOpenReleaseNote });

    await view.findByTestId("mobile-about-release-row-0.8.13");
    await fireEvent.press(view.getByTestId("mobile-about-release-row-0.8.13"));

    expect(onOpenReleaseNote).toHaveBeenCalledWith("0.8.13");
  });
});
