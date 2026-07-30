import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Linking } from "react-native";
import type {
  MobileAppUpdateResponse,
  MobileReleaseChange,
  MobileServiceStatusLevel,
} from "@wizards/types";

const mockUseMobileAuth = jest.fn();

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => mockUseMobileAuth(),
}));

jest.mock("expo-device", () => ({
  modelName: "iPhone 15",
  osName: "iOS",
  osVersion: "18.2",
}));

jest.mock("expo-updates", () => ({
  isEnabled: false,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

jest.mock("../src/app/components/kit/bottom-sheet", () => {
  const ReactRuntime = require("react");
  const { View } = require("react-native");
  return {
    BottomSheet: ({
      children,
      open,
      testID,
    }: {
      children: React.ReactNode;
      open: boolean;
      testID: string;
    }) => (open ? ReactRuntime.createElement(View, { testID: `${testID}-panel` }, children) : null),
  };
});

import { resolveAboutUpdatePresentation } from "../src/about/mobile-about-model";
import { writeMobileAboutPreference } from "../src/about/mobile-about-preferences";
import {
  AboutServiceStatusPill,
  MobileAboutSettingsScreen,
} from "../src/app/screens/mobile-about-settings-screen";
import { ToastProvider } from "../src/app/components/kit/toast";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { lightTheme, darkTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";
import { MOBILE_OPEN_SOURCE_LICENSE_GROUPS } from "../src/legal/mobile-open-source-license-manifest";

const copy = mobileCopy.tr;
const RELEASED_AT = "2026-07-24T00:00:00.000Z";
const changes: readonly MobileReleaseChange[] = [
  {
    detail: "Görünüm ayarlarından dört kademe; sohbet ve kanal metinleri birlikte ölçeklenir.",
    title: "Mesaj yazı boyutu",
    type: "new",
  },
  {
    detail: "Kayıt sırasında seviye göstergesi ve kaydırarak iptal.",
    title: "Sesli mesajlarda canlı dalga formu",
    type: "improved",
  },
  {
    detail: "Takip ettiğin başlıklara gelen yanıtlar artık sessiz kalmıyor.",
    title: "Thread bildirimleri düzeltildi",
    type: "fixed",
  },
  { title: "Kanal listesi", type: "improved" },
  { title: "Arama", type: "improved" },
  { title: "Açılış", type: "improved" },
  { title: "Bildirimler", type: "fixed" },
  { title: "Sessize alma", type: "fixed" },
];

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (merged, entry) => ({ ...merged, ...flattenStyle(entry) }),
      {},
    );
  }
  return style && typeof style === "object" ? (style as Record<string, unknown>) : {};
}

function createApiClient(
  level: MobileServiceStatusLevel = "ok",
  {
    failChannelChange = false,
    failReleaseDetail = false,
  }: {
    readonly failChannelChange?: boolean;
    readonly failReleaseDetail?: boolean;
  } = {},
) {
  return {
    requestJson: jest.fn(async (path: string, init?: { readonly body?: unknown }) => {
      if (path.startsWith("/api/v1/mobile/app/update")) {
        return {
          lastCheckedAt: "2026-07-29T09:39:00.000Z",
          otaEnabled: false,
          state: "current",
          updateKind: "none",
        };
      }
      if (path.startsWith("/api/v1/mobile/app/releases/0.8.15")) {
        if (failReleaseDetail) {
          throw new Error("Release detail unavailable");
        }
        return {
          buildNumber: 8150,
          changeCount: changes.length,
          changes,
          codename: "Echo",
          installed: true,
          releasedAt: RELEASED_AT,
          version: "0.8.15",
        };
      }
      if (path.startsWith("/api/v1/mobile/app/releases")) {
        return {
          nextCursor: null,
          releases: [
            {
              changeCount: changes.length,
              codename: "Echo",
              installed: true,
              releasedAt: RELEASED_AT,
              version: "0.8.15",
            },
          ],
          total: 1,
        };
      }
      if (path === "/api/v1/mobile/app/status") {
        return {
          checkedAt: "2026-07-29T09:40:00.000Z",
          level,
          url: "https://status.whispr.team",
        };
      }
      if (path === "/api/v1/mobile/app/channel") {
        if (failChannelChange) {
          throw new Error("Channel change unavailable");
        }
        return {
          channel: (init?.body as { readonly channel: "beta" | "stable" | "uat" }).channel,
          effectiveFrom: "next-build",
          requiresRestart: false,
        };
      }
      throw new Error(`Unexpected About request: ${path}`);
    }),
  };
}

function createProps(
  overrides: Partial<React.ComponentProps<typeof MobileAboutSettingsScreen>> = {},
) {
  return {
    appVersion: "0.8.15",
    buildId: "8150",
    onBack: jest.fn(),
    onOpenCookies: jest.fn(),
    onOpenLicenses: jest.fn(),
    onOpenPrivacy: jest.fn(),
    onOpenTerms: jest.fn(),
    releaseChannel: "uat",
    serviceOnline: true,
    ...overrides,
  } satisfies React.ComponentProps<typeof MobileAboutSettingsScreen>;
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Number.POSITIVE_INFINITY },
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
}

function renderScreen(
  props: React.ComponentProps<typeof MobileAboutSettingsScreen> = createProps(),
) {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <ToastProvider>
            <MobileAboutSettingsScreen {...props} />
          </ToastProvider>
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </QueryClientProvider>,
  );
}

describe("1a + 1b About screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    jest
      .mocked(AsyncStorage.multiGet)
      .mockImplementation(async (keys) => keys.map((key) => [key, null]));
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
    mockUseMobileAuth.mockReturnValue({
      apiClient: createApiClient(),
      session: { user: { id: "usr_0123456789abcdef" } },
      status: "signed-in",
    });
  });

  it("renders the login brand mark at the handoff 60px size with one-line metadata", async () => {
    const view = await renderScreen();

    await view.findByText("0.8.15 “Echo”");
    expect(
      view.getByTestId("mobile-about-app-logo", { includeHiddenElements: true }).props,
    ).toMatchObject({
      height: 60,
      width: 60,
    });
    const expectedBars = [15, 22, 30, 21, 16];
    const bars = expectedBars.map((height, index) => {
      const bar = view.getByTestId(`mobile-about-app-logo-animated-bar-${index + 1}`, {
        includeHiddenElements: true,
      });
      expect(bar.props).toMatchObject({ height, width: 3.5 });
      return bar.props as { width: number; x: number };
    });
    for (let index = 1; index < bars.length; index += 1) {
      expect(bars[index]!.x - (bars[index - 1]!.x + bars[index - 1]!.width)).toBe(3.5);
    }
    expect(
      view.getByTestId("mobile-about-app-logo-card", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      view.getByTestId("mobile-about-app-logo-surface-highlight-layer", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(
      view.queryByTestId("mobile-about-logo-top-highlight", {
        includeHiddenElements: true,
      }),
    ).toBeNull();

    const metadata = view.getByTestId("mobile-about-version-metadata");
    expect(within(metadata).getByText("0.8.15")).toBeTruthy();
    expect(within(metadata).getByText("“Echo”")).toBeTruthy();
    expect(within(metadata).getByText("UAT")).toBeTruthy();
    const metadataStyle = Array.isArray(metadata.props.style)
      ? metadata.props.style.flat()
      : [metadata.props.style];
    expect(metadataStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ flexDirection: "row", gap: 6 })]),
    );
    expect(
      view.getByTestId("mobile-about-build-copy-icon", { includeHiddenElements: true }).props.width,
    ).toBe(11);
  });

  it("updates the identity chip and app row from the same stored channel preference", async () => {
    const view = await renderScreen();
    await view.findByText("0.8.15 “Echo”");

    await act(async () => {
      await writeMobileAboutPreference(AsyncStorage, "channel", "beta");
    });

    await waitFor(() => expect(view.getAllByText("BETA")).toHaveLength(2));
  });

  it("maps current, available and checking updates to the exact row labels", () => {
    const cases: readonly [MobileAppUpdateResponse, string, string][] = [
      [
        {
          lastCheckedAt: "2026-07-29T09:00:00.000Z",
          otaEnabled: true,
          state: "current",
          updateKind: "none",
        },
        "Güncel sürümü kullanıyorsun",
        "Denetle",
      ],
      [
        {
          lastCheckedAt: "2026-07-29T09:00:00.000Z",
          latest: {
            codename: "Halo",
            mandatory: false,
            releasedAt: "2026-07-28T00:00:00.000Z",
            sizeBytes: 50_541_363,
            version: "0.9.0",
          },
          otaEnabled: true,
          state: "available",
          updateKind: "ota",
        },
        "0.9.0 “Halo” hazır · 48,2 MB",
        "Güncelle",
      ],
      [
        {
          lastCheckedAt: "2026-07-29T09:00:00.000Z",
          otaEnabled: true,
          state: "checking",
          updateKind: "none",
        },
        "Güncellemeler denetleniyor…",
        "Durdur",
      ],
    ];

    for (const [input, title, action] of cases) {
      const presentation = resolveAboutUpdatePresentation(input, copy, {
        formatSize: () => "48,2 MB",
        lastCheckedLabel: "2 dk",
        online: true,
        otaEnabled: true,
      });
      expect(presentation.title).toBe(title);
      expect(presentation.action).toBe(action);
    }
  });

  it("removes the old full-width purple update CTA", async () => {
    const view = await renderScreen();
    await view.findByText(copy.aboutUpdateCurrent);

    expect(view.queryByTestId("mobile-about-check-updates")).toBeNull();
  });

  it("keeps the identity-card Denetle action visible when OTA is disabled", async () => {
    const apiClient = createApiClient();
    mockUseMobileAuth.mockReturnValue({
      apiClient,
      session: { user: { id: "usr_0123456789abcdef" } },
      status: "signed-in",
    });
    const view = await renderScreen();
    await view.findByText(copy.aboutUpdateCurrent);
    const action = view.getByRole("button", {
      name: copy.aboutSettingsCheckUpdates,
    });

    expect(view.getByTestId("mobile-about-update-action")).toBeTruthy();
    await fireEvent.press(action);
    await waitFor(() => {
      const checks = apiClient.requestJson.mock.calls.filter(([path]) =>
        String(path).startsWith("/api/v1/mobile/app/update"),
      );
      expect(checks.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("uses the three change color families and full-bleed -16px hairlines", async () => {
    const view = await renderScreen();
    await view.findByText("0.8.15 “Echo”");

    expect(flattenStyle(view.getByTestId("mobile-about-change-icon-0").props.style)).toMatchObject({
      backgroundColor: lightTheme.about.accentSurface,
    });
    expect(flattenStyle(view.getByTestId("mobile-about-change-icon-1").props.style)).toMatchObject({
      backgroundColor: lightTheme.about.successSurface,
    });
    expect(flattenStyle(view.getByTestId("mobile-about-change-icon-2").props.style)).toMatchObject({
      backgroundColor: lightTheme.about.warningSurface,
    });
    expect(
      flattenStyle(
        view.getByTestId("mobile-about-identity-hairline", {
          includeHiddenElements: true,
        }).props.style,
      ),
    ).toMatchObject({ marginHorizontal: -16 });
    expect(
      flattenStyle(view.getByTestId("mobile-about-whats-new-hairline").props.style),
    ).toMatchObject({ marginHorizontal: -16 });
    expect(flattenStyle(view.getByText(changes[0]!.detail!).props.style)).toMatchObject({
      fontSize: 11.5,
      lineHeight: 16.675,
    });
  });

  it("keeps the whats-new footer inside the card's 2px bottom padding", async () => {
    const view = await renderScreen();
    const card = await view.findByTestId("mobile-about-whats-new-card");
    const pressable = within(card).getByRole("button", { name: copy.aboutWhatsNewSeeAll });

    expect(flattenStyle(pressable.props.style)).toMatchObject({
      marginBottom: -2,
      marginHorizontal: -16,
      marginTop: -14,
      paddingBottom: 2,
      paddingHorizontal: 16,
      paddingTop: 14,
    });
  });

  it("normalizes the bootstrap version before requesting the installed release", async () => {
    const apiClient = createApiClient();
    mockUseMobileAuth.mockReturnValue({
      apiClient,
      session: { user: { id: "usr_0123456789abcdef" } },
      status: "signed-in",
    });

    const view = await renderScreen(createProps({ appVersion: '0.8.15 "Echo"' }));

    expect(await view.findByTestId("mobile-about-whats-new-card")).toBeTruthy();
    expect(apiClient.requestJson).toHaveBeenCalledWith("/api/v1/mobile/app/releases/0.8.15", {
      method: "GET",
    });
  });

  it("keeps the exact 1a release summary visible when release detail fails", async () => {
    const apiClient = createApiClient("ok", { failReleaseDetail: true });
    mockUseMobileAuth.mockReturnValue({
      apiClient,
      session: { user: { id: "usr_0123456789abcdef" } },
      status: "signed-in",
    });

    const view = await renderScreen();

    expect(await view.findByTestId("mobile-about-whats-new-card")).toBeTruthy();
    expect(view.getByText("0.8.15 “Echo”")).toBeTruthy();
    expect(view.getByText("Yapı 8150 · 24 Tem 2026")).toBeTruthy();
    expect(view.getByText(changes[0]!.title)).toBeTruthy();
    expect(view.getByText(changes[1]!.title)).toBeTruthy();
    expect(view.getByText(changes[2]!.title)).toBeTruthy();
    expect(view.getByText("3 iyileştirme ve 2 düzeltme daha")).toBeTruthy();
    await waitFor(() =>
      expect(apiClient.requestJson).toHaveBeenCalledWith("/api/v1/mobile/app/releases/0.8.15", {
        method: "GET",
      }),
    );
  });

  it("hides the YENİ badge after the installed release was seen", async () => {
    jest
      .mocked(AsyncStorage.multiGet)
      .mockImplementation(async (keys) =>
        keys.map((key) => [key, key === "whispr.about.seenVersion" ? "0.8.15" : null]),
      );
    const view = await renderScreen();

    await view.findByText("0.8.15 “Echo”");
    await waitFor(() => expect(view.queryByTestId("mobile-about-new-badge")).toBeNull());
  });

  it("keeps the beta toggle off and sends no channel request when consent is rejected", async () => {
    const openBetaConsent = jest.fn(async () => false);
    const apiClient = createApiClient();
    mockUseMobileAuth.mockReturnValue({
      apiClient,
      session: { user: { id: "usr_0123456789abcdef" } },
      status: "signed-in",
    });
    const view = await renderScreen(createProps({ openBetaConsent }));
    await view.findByText(copy.aboutAppBeta);

    const toggle = view.getByTestId("mobile-about-beta-toggle");
    await fireEvent.press(toggle);

    await waitFor(() => expect(openBetaConsent).toHaveBeenCalledTimes(1));
    expect(view.getByTestId("mobile-about-beta-toggle").props.accessibilityState).toMatchObject({
      checked: false,
    });
    expect(apiClient.requestJson).not.toHaveBeenCalledWith(
      "/api/v1/mobile/app/channel",
      expect.anything(),
    );
  });

  it("changes to beta only after consent and updates the chip, row, and toggle together", async () => {
    const openBetaConsent = jest.fn(async () => true);
    const apiClient = createApiClient();
    mockUseMobileAuth.mockReturnValue({
      apiClient,
      session: { user: { id: "usr_0123456789abcdef" } },
      status: "signed-in",
    });
    const view = await renderScreen(createProps({ openBetaConsent }));
    await view.findByText(copy.aboutAppBeta);

    await fireEvent.press(view.getByTestId("mobile-about-beta-toggle"));

    await waitFor(() =>
      expect(apiClient.requestJson).toHaveBeenCalledWith("/api/v1/mobile/app/channel", {
        body: { channel: "beta" },
        method: "POST",
      }),
    );
    expect(view.getAllByText("BETA")).toHaveLength(2);
    expect(view.getByTestId("mobile-about-beta-toggle").props.accessibilityState).toMatchObject({
      checked: true,
    });
  });

  it("uses the saved channel, not consent proof, as the beta toggle state", async () => {
    jest
      .mocked(AsyncStorage.multiGet)
      .mockImplementation(async (keys) =>
        keys.map((key) => [
          key,
          key === "whispr.settings.betaConsentAt" ? "2026-07-30T09:41:00.000Z" : null,
        ]),
      );
    const openBetaConsent = jest.fn(async () => true);
    const apiClient = createApiClient("ok", { failChannelChange: true });
    mockUseMobileAuth.mockReturnValue({
      apiClient,
      session: { user: { id: "usr_0123456789abcdef" } },
      status: "signed-in",
    });
    const view = await renderScreen(createProps({ openBetaConsent, releaseChannel: "stable" }));
    await view.findByText(copy.aboutAppBeta);

    expect(view.getByTestId("mobile-about-beta-toggle").props.accessibilityState).toMatchObject({
      checked: false,
    });
    await fireEvent.press(view.getByTestId("mobile-about-beta-toggle"));
    await waitFor(() => expect(openBetaConsent).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(view.getByTestId("mobile-about-beta-toggle").props.accessibilityState).toMatchObject({
        checked: false,
      }),
    );

    await fireEvent.press(view.getByTestId("mobile-about-beta-toggle"));
    await waitFor(() => expect(openBetaConsent).toHaveBeenCalledTimes(2));
  });

  it.each([
    ["ok", lightTheme.about.successSurface, lightTheme.about.successText],
    ["degraded", lightTheme.about.warningSurface, lightTheme.about.warningText],
    ["down", lightTheme.about.control, lightTheme.about.danger],
  ] as const)("uses service token family for %s", async (level, surface, foreground) => {
    const view = await render(
      <MobileThemeProvider>
        <AboutServiceStatusPill level={level} testID={`service-${level}`} />
      </MobileThemeProvider>,
    );

    const pillStyle = Array.isArray(view.getByTestId(`service-${level}`).props.style)
      ? view.getByTestId(`service-${level}`).props.style.flat()
      : [view.getByTestId(`service-${level}`).props.style];
    expect(pillStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: surface })]),
    );
    expect(view.getByTestId(`service-${level}-label`).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: foreground })]),
    );
  });

  it("opens the 2h rating sheet from the community rating row", async () => {
    const view = await renderScreen();

    await fireEvent.press(await view.findByText(copy.aboutCommunityRate));

    expect(await view.findByTestId("mobile-about-rating-sheet-panel")).toBeTruthy();
    expect(view.getByText(copy.rateTitle)).toBeTruthy();
  });

  it("opens the canonical X and Instagram profiles from the social chips", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const view = await renderScreen();

    try {
      await fireEvent.press(await view.findByTestId("mobile-about-social-x"));
      await fireEvent.press(view.getByTestId("mobile-about-social-instagram"));

      expect(openURL).toHaveBeenNthCalledWith(1, "https://x.com/WhisprTeam");
      expect(openURL).toHaveBeenNthCalledWith(2, "https://www.instagram.com/whispr.team");
    } finally {
      openURL.mockRestore();
    }
  });

  it("renders package count, signature and preserved performance diagnostics", async () => {
    const view = await renderScreen();
    const packageCount = MOBILE_OPEN_SOURCE_LICENSE_GROUPS.reduce(
      (total, group) => total + group.packages.length,
      0,
    );

    expect(
      await view.findByText(copy.aboutLegalLicensesCount.replace("{count}", String(packageCount))),
    ).toBeTruthy();
    expect(view.getByText(copy.aboutSignature)).toBeTruthy();
    expect(view.getByText(copy.aboutCopyright.replace("{year}", "2026"))).toBeTruthy();
    expect(view.getByTestId("mobile-about-performance-diagnostics")).toBeTruthy();
  });

  it("reveals the sticky header after the scroll passes 12px", async () => {
    const view = await renderScreen();
    await view.findByText("0.8.15 “Echo”");
    expect(
      view.getByTestId("mobile-about-sticky-header", { includeHiddenElements: true }).props
        .accessibilityElementsHidden,
    ).toBe(true);

    await fireEvent.scroll(view.getByTestId("mobile-about-settings-scroll"), {
      nativeEvent: { contentOffset: { y: 13 } },
    });

    await waitFor(() =>
      expect(view.getByTestId("mobile-about-sticky-header").props.accessibilityElementsHidden).toBe(
        false,
      ),
    );
    expect(within(view.getByTestId("mobile-about-sticky-header")).getByText("0.8.15")).toBeTruthy();
  });

  it("keeps the same tree while applying the dark About card token", async () => {
    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key) =>
        key === "whispr.mobile.theme-preference" ? "dark" : null,
      );
    const view = await renderScreen();

    await view.findByText("0.8.15 “Echo”");
    await waitFor(() => {
      const style = Array.isArray(view.getByTestId("mobile-about-identity-card").props.style)
        ? view.getByTestId("mobile-about-identity-card").props.style.flat()
        : [view.getByTestId("mobile-about-identity-card").props.style];
      expect(style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ backgroundColor: darkTheme.about.card }),
        ]),
      );
    });
    expect(view.getByTestId("mobile-about-whats-new-card")).toBeTruthy();
    expect(view.getByTestId("mobile-about-app-card")).toBeTruthy();
  });
});
