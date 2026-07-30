import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Linking } from "react-native";
import type {
  MobileBugReportCategory,
  MobileHelpArticle,
  MobileHelpArticleListResponse,
} from "@wizards/types";

const mockUseMobileAuth = jest.fn();
const mockUseMobileNetworkStatus = jest.fn();

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => mockUseMobileAuth(),
}));

jest.mock("../src/app/providers/mobile-network-provider", () => ({
  useMobileNetworkStatus: () => mockUseMobileNetworkStatus(),
}));

import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobileHelpCenterScreen } from "../src/app/screens/about/about-help-center-screen";
import { lightTheme } from "../src/design/themes";
import { mobileAboutMetrics } from "../src/design/tokens";

type HelpArticlePayload = MobileHelpArticle & {
  readonly bodyMarkdown: string | null;
};

const ARTICLES: readonly HelpArticlePayload[] = [
  {
    bodyMarkdown: "# Mikrofon sorunları\n\nSes girişini ayarlardan seç.",
    category: "media",
    hasBody: true,
    id: "help-microphone",
    readMinutes: 3,
    slug: "mikrofon-calismiyor",
    title: "Sesli kanalda mikrofonum çalışmıyor",
    url: "https://whispr.chat/help/mikrofon-calismiyor",
    views: 24_000,
  },
  {
    bodyMarkdown: null,
    category: "chat",
    hasBody: false,
    id: "help-notifications",
    readMinutes: 2,
    slug: "bildirimleri-sessize-alma",
    title: "Bildirimleri kanal kanal sessize alma",
    url: "https://whispr.chat/help/bildirimleri-sessize-alma",
    views: 18_000,
  },
  {
    bodyMarkdown: "# Roller",
    category: "server",
    hasBody: true,
    id: "help-roles",
    readMinutes: 5,
    slug: "rolleri-duzenleme",
    title: "Sunucu rollerini ve izinleri düzenleme",
    url: "https://whispr.chat/help/rolleri-duzenleme",
    views: 11_000,
  },
  {
    bodyMarkdown: "# İki adımlı doğrulama",
    category: "account",
    hasBody: true,
    id: "help-2fa",
    readMinutes: 4,
    slug: "iki-adimli-dogrulama",
    title: "İki adımlı doğrulamayı açma",
    url: "https://whispr.chat/help/iki-adimli-dogrulama",
    views: 9_000,
  },
];

const CATEGORIES = [
  { articleCount: 14, key: "account" },
  { articleCount: 22, key: "chat" },
  { articleCount: 17, key: "media" },
  { articleCount: 9, key: "server" },
] as const;

const POPULAR_RESPONSE = {
  articles: ARTICLES,
  categories: CATEGORIES,
} satisfies MobileHelpArticleListResponse & {
  readonly articles: readonly HelpArticlePayload[];
};

function createApiClient({
  emptySearch = false,
  viewFails = false,
}: {
  readonly emptySearch?: boolean;
  readonly viewFails?: boolean;
} = {}) {
  return {
    requestJson: jest.fn(async (path: string, init: { readonly method: string }) => {
      if (path.includes("/help/search?")) {
        return {
          articles: emptySearch ? [] : [ARTICLES[0]],
          categories: CATEGORIES,
        };
      }
      if (path.endsWith("/view") && init.method === "POST") {
        if (viewFails) {
          throw new Error("view endpoint unavailable");
        }
        return { ok: true };
      }
      if (path.includes("/help/articles?popular=1")) {
        return POPULAR_RESPONSE;
      }
      throw new Error(`Unexpected 2e request: ${path}`);
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

async function renderScreen({
  apiClient = createApiClient(),
  onOpenBugReport = jest.fn(),
}: {
  readonly apiClient?: ReturnType<typeof createApiClient>;
  readonly onOpenBugReport?: (category?: MobileBugReportCategory) => void;
} = {}) {
  mockUseMobileAuth.mockReturnValue({
    apiClient,
    session: { user: { id: "usr_0123456789abcdef" } },
    status: "signed-in",
  });

  const view = await render(
    <QueryClientProvider client={createQueryClient()}>
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <MobileHelpCenterScreen onBack={jest.fn()} onOpenBugReport={onOpenBugReport} />
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </QueryClientProvider>,
  );

  return {
    apiClient,
    onOpenBugReport,
    view,
  };
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

describe("2e help center screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMobileNetworkStatus.mockReturnValue("online");
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("renders exactly four server-ordered popular rows numbered 1–4", async () => {
    const { view } = await renderScreen();

    await view.findByText(ARTICLES[3]!.title);

    expect(view.getAllByTestId(/^mobile-help-popular-row-/)).toHaveLength(4);
    expect(
      view.getAllByTestId(/^mobile-help-popular-rank-/).map((rank) => rank.props.children),
    ).toEqual(["1", "2", "3", "4"]);
    expect(view.getAllByTestId(/^mobile-help-popular-row-/).map((row) => row.props.testID)).toEqual(
      ARTICLES.map((article) => `mobile-help-popular-row-${article.slug}`),
    );
  });

  it("uses the shared search field, canonical group label, and ≥44px rows", async () => {
    const { view } = await renderScreen();

    await view.findByTestId("mobile-help-popular-row-mikrofon-calismiyor");

    expect(
      flattenStyle(view.getByTestId("mobile-help-search-container").props.style),
    ).toMatchObject({
      borderRadius: mobileAboutMetrics.searchRadius,
      gap: 9,
      paddingHorizontal: 14,
      paddingVertical: 11,
    });
    expect(
      view.getByTestId("mobile-help-search-icon", { includeHiddenElements: true }).props,
    ).toMatchObject({ height: 16, width: 16 });
    expect(flattenStyle(view.getByTestId("mobile-help-popular-label").props.style)).toMatchObject({
      color: lightTheme.about.groupLabel,
      fontFamily: lightTheme.typography.fontFamilyBold,
      fontSize: 10.5,
      letterSpacing: 1.05,
      textTransform: "uppercase",
    });
    for (const row of view.getAllByTestId(/^mobile-help-popular-row-/)) {
      expect(flattenStyle(row.props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it("renders four server-counted category tiles as two equal-height two-column rows", async () => {
    const { view } = await renderScreen();

    await view.findByText("22 makale");

    expect(view.getAllByTestId(/^mobile-help-category-tile-/)).toHaveLength(4);
    expect(view.getByText("14 makale")).toBeTruthy();
    expect(view.getByText("22 makale")).toBeTruthy();
    expect(view.getByText("17 makale")).toBeTruthy();
    expect(view.getByText("9 makale")).toBeTruthy();
    const gridRows = view.getAllByTestId(/^mobile-help-category-grid-row-/);
    expect(gridRows).toHaveLength(2);
    for (const row of gridRows) {
      expect(flattenStyle(row.props.style)).toMatchObject({
        alignItems: "stretch",
        flexDirection: "row",
        gap: 10,
      });
      expect(row.props.children).toHaveLength(2);
    }
    for (const tile of view.getAllByTestId(/^mobile-help-category-tile-/)) {
      expect(flattenStyle(tile.props.style).flex).toBe(1);
    }
  });

  it("does not request search below two characters", async () => {
    const { apiClient, view } = await renderScreen();
    await view.findByText(ARTICLES[0]!.title);
    const requestCount = apiClient.requestJson.mock.calls.length;
    jest.useFakeTimers();

    await fireEvent.changeText(view.getByTestId("mobile-help-search"), "m");
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(apiClient.requestJson).toHaveBeenCalledTimes(requestCount);
  });

  it("opens empty results in BugReport with the inferred category", async () => {
    const apiClient = createApiClient({ emptySearch: true });
    const onOpenBugReport = jest.fn();
    const { view } = await renderScreen({ apiClient, onOpenBugReport });
    await view.findByText(ARTICLES[0]!.title);
    jest.useFakeTimers();

    await fireEvent.changeText(view.getByTestId("mobile-help-search"), "mikrofon");
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await view.findByText("Bunu bulamadık");
    await fireEvent.press(view.getByTestId("mobile-help-empty-write"));

    expect(onOpenBugReport).toHaveBeenCalledWith("voice");
  });

  it("reuses the in-app markdown reader for body articles and survives view-count failure", async () => {
    const apiClient = createApiClient({ viewFails: true });
    const openUrl = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const { view } = await renderScreen({ apiClient });
    await view.findByText(ARTICLES[0]!.title);

    await fireEvent.press(view.getByTestId("mobile-help-popular-row-mikrofon-calismiyor"));

    expect(view.getByTestId("mobile-help-article-reader")).toBeTruthy();
    expect(view.getByText("Mikrofon sorunları")).toBeTruthy();
    expect(view.queryByTestId("mobile-help-error")).toBeNull();
    expect(openUrl).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(apiClient.requestJson).toHaveBeenCalledWith(
        "/api/v1/mobile/help/articles/mikrofon-calismiyor/view",
        { method: "POST" },
      ),
    );
  });

  it("opens the canonical URL when an article has no markdown body", async () => {
    const openUrl = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const { view } = await renderScreen();
    await view.findByText(ARTICLES[1]!.title);

    await fireEvent.press(view.getByTestId("mobile-help-popular-row-bildirimleri-sessize-alma"));

    expect(openUrl).toHaveBeenCalledWith(ARTICLES[1]!.url);
  });

  it("lists cached articles under SON OKUDUKLARIN when offline data is unavailable", async () => {
    mockUseMobileNetworkStatus.mockReturnValue("offline");
    jest
      .mocked(AsyncStorage.getItem)
      .mockResolvedValue(JSON.stringify([{ ...ARTICLES[0], bodyMarkdown: "# Çevrimdışı makale" }]));
    const { apiClient, view } = await renderScreen();

    await view.findByText("SON OKUDUKLARIN");

    expect(view.getByText(ARTICLES[0]!.title)).toBeTruthy();
    expect(apiClient.requestJson).not.toHaveBeenCalled();
  });

  it("routes the persistent contact action to BugReport without a placeholder category", async () => {
    const onOpenBugReport = jest.fn();
    const { view } = await renderScreen({ onOpenBugReport });
    await view.findByText(ARTICLES[0]!.title);

    await fireEvent.press(view.getByTestId("mobile-help-contact-write"));

    expect(onOpenBugReport).toHaveBeenCalledWith(undefined);
  });
});
