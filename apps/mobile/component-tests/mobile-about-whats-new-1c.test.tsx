import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type {
  MobileReleaseChange,
  MobileReleaseDetail,
  MobileReleaseListResponse,
} from "@wizards/types";

const mockUseMobileAuth = jest.fn();

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => mockUseMobileAuth(),
}));

import { ToastProvider } from "../src/app/components/kit/toast";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobileAboutWhatsNewScreen } from "../src/app/screens/about/about-screen-shells";
import { lightTheme } from "../src/design/themes";
import { mobileAboutMetrics } from "../src/design/tokens";
import { mobileCopy } from "../src/locale/mobile-copy";

type WhatsNewScreenProps = {
  readonly installedVersion: string;
  readonly onBack: () => void;
  readonly onOpenReleaseHistory: () => void;
  readonly onOpenReleaseNote: (version: string) => void;
};

const WhatsNewScreen =
  MobileAboutWhatsNewScreen as unknown as React.ComponentType<WhatsNewScreenProps>;

const DEFAULT_CHANGES: readonly MobileReleaseChange[] = [
  { title: "Mesaj yazı boyutu · dört kademe", type: "new" },
  { title: "Sesli mesajda canlı dalga formu", type: "new" },
  { title: "Kanal listesi %30 daha hızlı açılıyor", type: "improved" },
  { title: "Thread bildirimleri ve sessize alma", type: "fixed" },
];

const RELEASE_LIST: MobileReleaseListResponse = {
  nextCursor: null,
  releases: [
    {
      changeCount: 4,
      codename: "Echo",
      installed: true,
      releasedAt: "2026-07-24T00:00:00.000Z",
      version: "0.8.15",
    },
    {
      changeCount: 6,
      highlight: "sunucu keşfet sekmesi",
      releasedAt: "2026-07-10T00:00:00.000Z",
      version: "0.8.14",
    },
    {
      changeCount: 11,
      codename: "Ripple",
      highlight: "ekran paylaşımı",
      releasedAt: "2026-06-27T00:00:00.000Z",
      version: "0.8.13",
    },
    {
      changeCount: 4,
      highlight: "uçtan uca ses",
      releasedAt: "2026-06-12T00:00:00.000Z",
      version: "0.8.12",
    },
  ],
  total: 38,
};

function currentRelease(
  changes: readonly MobileReleaseChange[] = DEFAULT_CHANGES,
  summary: string | null = "Okunabilirlik güncellemesi",
): MobileReleaseDetail {
  return {
    changeCount: changes.length,
    changes: [...changes],
    codename: "Echo",
    installed: true,
    releasedAt: "2026-07-24T00:00:00.000Z",
    version: "0.8.15",
    ...(summary === null ? {} : { summary }),
  };
}

function createApiClient({
  changes = DEFAULT_CHANGES,
  list = Promise.resolve(RELEASE_LIST),
  summary = "Okunabilirlik güncellemesi",
}: {
  readonly changes?: readonly MobileReleaseChange[];
  readonly list?: Promise<MobileReleaseListResponse>;
  readonly summary?: string | null;
} = {}) {
  return {
    requestJson: jest.fn(async (path: string) => {
      if (path === "/api/v1/mobile/app/releases/0.8.15") {
        return currentRelease(changes, summary);
      }
      if (path.startsWith("/api/v1/mobile/app/releases?")) {
        return list;
      }
      throw new Error(`Unexpected 1c request: ${path}`);
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
  onOpenReleaseHistory = jest.fn(),
  onOpenReleaseNote = jest.fn(),
}: {
  readonly apiClient?: ReturnType<typeof createApiClient>;
  readonly onOpenReleaseHistory?: () => void;
  readonly onOpenReleaseNote?: (version: string) => void;
} = {}) {
  mockUseMobileAuth.mockReturnValue({
    apiClient,
    session: { user: { id: "usr_0123456789abcdef" } },
    status: "signed-in",
  });

  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <ToastProvider>
            <WhatsNewScreen
              installedVersion="0.8.15"
              onBack={jest.fn()}
              onOpenReleaseHistory={onOpenReleaseHistory}
              onOpenReleaseNote={onOpenReleaseNote}
            />
          </ToastProvider>
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

describe("1c Whats new screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(AsyncStorage.multiGet)
      .mockImplementation(async (keys) => keys.map((key) => [key, null]));
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders four active filters and keeps only NEW changes after selecting Yeni", async () => {
    const apiClient = createApiClient();
    const view = await renderScreen({ apiClient });

    await view.findByText(DEFAULT_CHANGES[0]!.title);
    expect(apiClient.requestJson).toHaveBeenCalledWith(
      expect.stringMatching(/\/app\/releases\?.*limit=4/),
      { method: "GET" },
    );
    for (const filter of ["all", "new", "improved", "fixed"]) {
      expect(view.getByTestId(`mobile-about-filter-${filter}`)).toBeTruthy();
    }

    await fireEvent.press(view.getByTestId("mobile-about-filter-new"));

    expect(view.getByText(DEFAULT_CHANGES[0]!.title)).toBeTruthy();
    expect(view.getByText(DEFAULT_CHANGES[1]!.title)).toBeTruthy();
    expect(view.queryByText(DEFAULT_CHANGES[2]!.title)).toBeNull();
    expect(view.queryByText(DEFAULT_CHANGES[3]!.title)).toBeNull();
  });

  it("keeps an empty-result filter enabled and renders the empty row inside the card", async () => {
    const view = await renderScreen({
      apiClient: createApiClient({ changes: DEFAULT_CHANGES.slice(0, 2) }),
    });

    await view.findByText(DEFAULT_CHANGES[0]!.title);
    const fixedFilter = view.getByTestId("mobile-about-filter-fixed");
    await fireEvent.press(fixedFilter);

    expect(fixedFilter.props.disabled).toBeUndefined();
    expect(fixedFilter.props.accessibilityState).toMatchObject({ selected: true });
    expect(view.getByText(mobileCopy.tr.whatsNewEmpty)).toBeTruthy();
    expect(view.getByTestId("mobile-about-current-card")).toBeTruthy();
  });

  it("pins every visible type pill to 62x20 and one line", async () => {
    const view = await renderScreen();

    await view.findByText(DEFAULT_CHANGES[0]!.title);
    for (const [index, label] of [
      [0, mobileCopy.tr.whatsNewTypeNew],
      [1, mobileCopy.tr.whatsNewTypeNew],
      [2, mobileCopy.tr.whatsNewTypeImproved],
      [3, mobileCopy.tr.whatsNewTypeFixed],
    ] as const) {
      const pill = view.getByTestId(`mobile-about-current-change-pill-${index}`);
      expect(flattenStyle(pill.props.style)).toMatchObject({
        height: 20,
        width: mobileAboutMetrics.typePillWidth,
      });
      expect(within(pill).getByText(label).props.numberOfLines).toBe(1);
    }
  });

  it("omits the summary block when the release has no summary", async () => {
    const view = await renderScreen({
      apiClient: createApiClient({ summary: null }),
    });

    await view.findByText(DEFAULT_CHANGES[0]!.title);
    expect(view.queryByTestId("mobile-about-current-summary")).toBeNull();
  });

  it("renders exactly three previous releases and the server total", async () => {
    const onOpenReleaseHistory = jest.fn();
    const view = await renderScreen({ onOpenReleaseHistory });

    await view.findByText("0.8.14");
    expect(view.getAllByTestId(/^mobile-about-history-row-/)).toHaveLength(3);
    expect(view.queryByTestId("mobile-about-history-row-3")).toBeNull();
    expect(view.getByText("Tüm sürüm geçmişi (38)")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-about-all-history"));
    expect(onOpenReleaseHistory).toHaveBeenCalledTimes(1);
  });

  it("writes latest seenVersion only after the release list succeeds", async () => {
    let resolveList!: (value: MobileReleaseListResponse) => void;
    const pendingList = new Promise<MobileReleaseListResponse>((resolve) => {
      resolveList = resolve;
    });
    await renderScreen({ apiClient: createApiClient({ list: pendingList }) });

    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      "whispr.about.seenVersion",
      expect.any(String),
    );

    await act(async () => {
      resolveList(RELEASE_LIST);
      await pendingList;
    });

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith("whispr.about.seenVersion", "0.8.15"),
    );
  });

  it("does not mark a pending release as seen after the screen unmounts", async () => {
    let resolveList!: (value: MobileReleaseListResponse) => void;
    const pendingList = new Promise<MobileReleaseListResponse>((resolve) => {
      resolveList = resolve;
    });
    const view = await renderScreen({ apiClient: createApiClient({ list: pendingList }) });

    await view.unmount();
    await act(async () => {
      resolveList(RELEASE_LIST);
      await pendingList;
    });

    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      "whispr.about.seenVersion",
      expect.any(String),
    );
  });

  it("opens the full release note with the installed version", async () => {
    const onOpenReleaseNote = jest.fn();
    const view = await renderScreen({ onOpenReleaseNote });

    await view.findByText(DEFAULT_CHANGES[0]!.title);
    await fireEvent.press(view.getByTestId("mobile-about-full-release-note"));

    expect(onOpenReleaseNote).toHaveBeenCalledWith("0.8.15");
  });

  it("persists the release notification toggle and shows toast feedback", async () => {
    jest.useFakeTimers();
    const view = await renderScreen();

    const button = view.getByTestId("mobile-about-release-notify");
    expect(
      view.getByTestId("mobile-about-release-notify-icon-off", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    await fireEvent.press(button);

    expect(
      view.getByTestId("mobile-about-release-notify-icon-on", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("whispr.settings.releaseNotify", "true");
    expect(view.getByTestId("mobile-toast")).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(4_000);
    });
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
  });

  it("matches acceptance geometry and keeps icon tint out of text", async () => {
    const view = await renderScreen();

    await view.findByText(DEFAULT_CHANGES[0]!.title);
    expect(flattenStyle(view.getByTestId("mobile-about-current-card").props.style)).toMatchObject({
      backgroundColor: lightTheme.about.accentCardSurface,
      borderColor: lightTheme.about.accentCardBorder,
      borderRadius: mobileAboutMetrics.cardRadius,
    });
    expect(
      flattenStyle(view.getByTestId("mobile-about-current-version").props.style),
    ).toMatchObject({
      color: lightTheme.about.text,
      fontFamily: lightTheme.typography.fontFamilyExtraBold,
      fontSize: 20,
    });
    expect(flattenStyle(view.getByTestId("mobile-about-history-dot-0").props.style)).toMatchObject({
      backgroundColor: lightTheme.about.timelineDot,
      height: 9,
      width: 9,
    });
    expect(view.getByText(/6 değişiklik/)).toBeTruthy();
    expect(
      flattenStyle(view.getByTestId("mobile-about-history-row-0").props.style).minHeight,
    ).toBeGreaterThanOrEqual(44);
    expect(flattenStyle(view.getByTestId("mobile-about-previous-label").props.style)).toMatchObject(
      {
        color: lightTheme.about.groupLabel,
        fontFamily: lightTheme.typography.fontFamilyBold,
        fontSize: 10.5,
        letterSpacing: 1.05,
        textTransform: "uppercase",
      },
    );
    const summaryColor = flattenStyle(
      view.getByTestId("mobile-about-current-summary").props.style,
    ).color;
    expect(summaryColor).toBe(lightTheme.about.textSecondary);
    expect(summaryColor).not.toBe(lightTheme.about.iconTint);
  });
});
