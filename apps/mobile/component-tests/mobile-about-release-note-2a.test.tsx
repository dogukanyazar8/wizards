import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, within } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { MobileReleaseChange, MobileReleaseDetail } from "@wizards/types";
import { Share } from "react-native";

import { MobileApiError } from "../src/api/mobile-api-client";

const mockUseMobileAuth = jest.fn();

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => mockUseMobileAuth(),
}));

import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobileAboutReleaseNoteScreen } from "../src/app/screens/about/about-screen-shells";
import { lightTheme } from "../src/design/themes";
import { mobileAboutMetrics } from "../src/design/tokens";

type ReleaseNoteScreenProps = {
  readonly onBack: () => void;
  readonly version: string;
  readonly webUrl: string;
};

const ReleaseNoteScreen =
  MobileAboutReleaseNoteScreen as unknown as React.ComponentType<ReleaseNoteScreenProps>;

const CHANGES: readonly MobileReleaseChange[] = [
  {
    detail: "Görünüm ayarlarında dört kademe.",
    title: "Mesaj yazı boyutu",
    type: "new",
  },
  {
    detail: "Kayıt sırasında gerçek seviye gösterilir.",
    title: "Sesli mesajlarda canlı dalga formu",
    type: "new",
  },
  { title: "Kanal listesi %30 daha hızlı açılıyor", type: "improved" },
  { title: "Okunmamış sayacı anlık güncelleniyor", type: "improved" },
  { title: "Görüntülü arama daha hızlı bağlanıyor", type: "improved" },
  { title: "Thread yanıtları bildirim göndermiyordu", type: "fixed" },
  { title: "Sunucu sessize alma süresi sıfırlanıyordu", type: "fixed" },
];

function releaseFixture({
  changes = CHANGES,
  installed = true,
  summary = "Okunabilirlik güncellemesi.",
  version = "0.9.0",
}: {
  readonly changes?: readonly MobileReleaseChange[];
  readonly installed?: boolean;
  readonly summary?: string | null;
  readonly version?: string;
} = {}): MobileReleaseDetail {
  return {
    buildNumber: 8150,
    changeCount: changes.length,
    changes: [...changes],
    codename: "Echo",
    installed,
    releasedAt: "2026-07-24T09:00:00.000Z",
    sizeBytes: 49_073_357,
    version,
    ...(summary === null ? {} : { summary }),
  };
}

function createApiClient(response: MobileReleaseDetail | Error = releaseFixture()): {
  readonly requestJson: jest.Mock;
} {
  return {
    requestJson: jest.fn(async () => {
      if (response instanceof Error) {
        throw response;
      }
      return response;
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
  onBack = jest.fn(),
  version = "0.9.0",
  webUrl = "https://whispr.team/base",
}: {
  readonly apiClient?: ReturnType<typeof createApiClient>;
  readonly onBack?: () => void;
  readonly version?: string;
  readonly webUrl?: string;
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
          <ReleaseNoteScreen onBack={onBack} version={version} webUrl={webUrl} />
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

describe("2a full release note screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders counted groups and never mixes NEW icon boxes with improvement/fix dots", async () => {
    const view = await renderScreen();

    expect(await view.findByText("YENİ · 2")).toBeTruthy();
    expect(view.getByText("İYİLEŞTİRME · 3")).toBeTruthy();
    expect(view.getByText("DÜZELTME · 2")).toBeTruthy();

    expect(view.getAllByTestId(/^mobile-about-release-new-icon-/)).toHaveLength(2);
    expect(view.queryByTestId("mobile-about-release-improved-icon-0")).toBeNull();
    expect(view.queryByTestId("mobile-about-release-fixed-icon-0")).toBeNull();
    expect(view.getAllByTestId(/^mobile-about-release-improved-dot-/)).toHaveLength(3);
    expect(view.getAllByTestId(/^mobile-about-release-fixed-dot-/)).toHaveLength(2);

    expect(
      flattenStyle(view.getByTestId("mobile-about-release-new-icon-0").props.style),
    ).toMatchObject({
      backgroundColor: lightTheme.about.accentSurface,
      borderRadius: mobileAboutMetrics.iconBox26Radius,
      height: mobileAboutMetrics.iconBox26,
      width: mobileAboutMetrics.iconBox26,
    });
    expect(
      flattenStyle(view.getByTestId("mobile-about-release-improved-dot-0").props.style),
    ).toMatchObject({
      backgroundColor: lightTheme.about.successText,
      height: 6,
      width: 6,
    });
    expect(
      flattenStyle(view.getByTestId("mobile-about-release-fixed-dot-0").props.style),
    ).toMatchObject({
      backgroundColor: lightTheme.about.warningText,
      height: 6,
      width: 6,
    });
    expect(
      view.getByTestId("mobile-about-release-new-wave-icon", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
  });

  it("omits empty change groups instead of rendering zero-count labels or cards", async () => {
    const fixedOnly = CHANGES.filter((change) => change.type === "fixed").slice(0, 1);
    const view = await renderScreen({
      apiClient: createApiClient(releaseFixture({ changes: fixedOnly })),
    });

    expect(await view.findByText("DÜZELTME · 1")).toBeTruthy();
    expect(view.queryByTestId("mobile-about-release-group-new")).toBeNull();
    expect(view.queryByTestId("mobile-about-release-group-improved")).toBeNull();
    expect(view.getByTestId("mobile-about-release-group-fixed")).toBeTruthy();
  });

  it("omits the installed badge and summary when the response does not provide them", async () => {
    const view = await renderScreen({
      apiClient: createApiClient(releaseFixture({ installed: false, summary: null })),
    });

    expect(await view.findByText("YENİ · 2")).toBeTruthy();
    expect(view.queryByTestId("mobile-about-release-current-badge")).toBeNull();
    expect(view.queryByTestId("mobile-about-release-summary")).toBeNull();
    expect(view.getByText("24 Tem 2026 · Yapı 8150 · 46,8 MB")).toBeTruthy();
  });

  it("shares the permanent release URL from the configured web origin", async () => {
    const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
    const view = await renderScreen();

    await view.findByText("YENİ · 2");
    await fireEvent.press(view.getByTestId("mobile-about-release-share"));

    expect(shareSpy).toHaveBeenCalledWith({
      url: "https://whispr.team/settings/about/releases/0.9.0",
    });
  });

  it("renders the 404 empty state and gives it a working back action", async () => {
    const onBack = jest.fn();
    const view = await renderScreen({
      apiClient: createApiClient(
        new MobileApiError("not found", { code: "http_error", status: 404 }),
      ),
      onBack,
      version: "9.9.9",
    });

    expect(await view.findByText("Bu sürümün notu bulunamadı")).toBeTruthy();
    const emptyState = view.getByTestId("mobile-about-release-not-found");
    await fireEvent.press(within(emptyState).getByRole("button"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("matches group-label typography and keeps body text flexible and off iconTint", async () => {
    const view = await renderScreen();

    await view.findByText("YENİ · 2");
    expect(
      flattenStyle(view.getByTestId("mobile-about-release-group-label-new").props.style),
    ).toMatchObject({
      color: lightTheme.about.groupLabel,
      fontFamily: lightTheme.typography.fontFamilyBold,
      fontSize: 10.5,
      letterSpacing: 1.05,
      textTransform: "uppercase",
    });

    const title = view.getByTestId("mobile-about-release-new-title-0");
    const detail = view.getByTestId("mobile-about-release-new-detail-0");
    const flatText = view.getByTestId("mobile-about-release-improved-text-0");
    for (const text of [title, detail, flatText]) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(flattenStyle(text.props.style).color).not.toBe(lightTheme.about.iconTint);
    }
    expect(flattenStyle(detail.props.style)).toMatchObject({
      color: lightTheme.about.textTertiary,
      fontSize: 11.5,
      lineHeight: 16.675,
    });
    expect(
      flattenStyle(view.getByTestId("mobile-about-release-content").props.style),
    ).toMatchObject({
      paddingBottom: 40,
    });
  });
});
