import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { MobileReleaseChannel } from "@wizards/types";
import { SafeAreaProvider } from "react-native-safe-area-context";

const mockUseMobileAuth = jest.fn();
const mockShowToast = jest.fn();

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => mockUseMobileAuth(),
}));

jest.mock("../src/app/components/kit/toast", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobileAboutUpdateChannelScreen } from "../src/app/screens/about/about-screen-shells";
import { lightTheme } from "../src/design/themes";
import { mobileAboutMetrics } from "../src/design/tokens";

type ChannelScreenProps = {
  readonly currentChannel: MobileReleaseChannel;
  readonly onBack: () => void;
  readonly openBetaConsent?: () => Promise<boolean>;
};

const ChannelScreen =
  MobileAboutUpdateChannelScreen as unknown as React.ComponentType<ChannelScreenProps>;

function createApiClient({
  reject = false,
  requiresRestart = false,
}: {
  readonly reject?: boolean;
  readonly requiresRestart?: boolean;
} = {}) {
  return {
    requestJson: jest.fn(async (path: string, init?: { readonly body?: unknown }) => {
      if (path !== "/api/v1/mobile/app/channel") {
        throw new Error(`Unexpected 2c request: ${path}`);
      }
      if (reject) {
        throw new Error("channel unavailable");
      }

      return {
        channel: (init?.body as { readonly channel: MobileReleaseChannel }).channel,
        effectiveFrom: "next-build",
        requiresRestart,
      };
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
  currentChannel = "uat",
  onBack = jest.fn(),
  openBetaConsent = jest.fn(async () => true),
}: {
  readonly apiClient?: ReturnType<typeof createApiClient>;
  readonly currentChannel?: MobileReleaseChannel;
  readonly onBack?: () => void;
  readonly openBetaConsent?: () => Promise<boolean>;
} = {}) {
  mockUseMobileAuth.mockReturnValue({
    apiClient,
    session: { user: { id: "usr_0123456789abcdef" } },
    status: "signed-in",
  });

  const view = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 844, width: 390, x: 0, y: 0 },
        insets: { bottom: 34, left: 0, right: 0, top: 47 },
      }}
    >
      <QueryClientProvider client={createQueryClient()}>
        <MobileThemeProvider>
          <MobileLocaleProvider>
            <ChannelScreen
              currentChannel={currentChannel}
              onBack={onBack}
              openBetaConsent={openBetaConsent}
            />
          </MobileLocaleProvider>
        </MobileThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );

  return { apiClient, onBack, openBetaConsent, view };
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (typeof style === "function") {
    return flattenStyle(style({ pressed: false }));
  }
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (merged, entry) => ({ ...merged, ...flattenStyle(entry) }),
      {},
    );
  }

  return style && typeof style === "object" ? (style as Record<string, unknown>) : {};
}

describe("2c update channel screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(AsyncStorage.multiGet)
      .mockImplementation(async (keys) => keys.map((key) => [key, null]));
    jest.mocked(AsyncStorage.removeItem).mockResolvedValue(undefined);
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
  });

  it("renders all channels, marks the active meta dynamically, and never invents a beta count", async () => {
    const { view } = await renderScreen();

    const stable = await view.findByTestId("mobile-about-channel-option-stable");
    expect(stable).toBeTruthy();
    expect(view.getByTestId("mobile-about-channel-option-beta")).toBeTruthy();
    expect(view.getByTestId("mobile-about-channel-option-uat")).toBeTruthy();
    expect(
      within(view.getByTestId("mobile-about-channel-option-uat")).getByText(
        "Her hafta · şu anki kanal",
      ),
    ).toBeTruthy();
    expect(view.queryByText("12,4B KULLANICI")).toBeNull();
    expect(
      view.getByText("Yeni kanal bir sonraki güncellemeden itibaren geçerli olur"),
    ).toBeTruthy();
    expect(view.queryByText("Uygulama bir kez yeniden başlar")).toBeNull();
  });

  it("keeps save disabled until selection changes and only shows warnings for Beta or UAT", async () => {
    const { view } = await renderScreen();
    await view.findByTestId("mobile-about-channel-option-uat");

    expect(view.getByTestId("mobile-about-channel-save").props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(view.getByTestId("mobile-about-channel-warning")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-about-channel-option-beta"));
    expect(
      view.getByText(
        "Beta sürümlerde beklenmeyen hatalar görülebilir; hata bildirimlerin doğrudan ekibe düşer.",
      ),
    ).toBeTruthy();
    expect(view.getByTestId("mobile-about-channel-save").props.accessibilityState).toMatchObject({
      disabled: false,
    });

    await fireEvent.press(view.getByTestId("mobile-about-channel-option-stable"));
    expect(view.queryByTestId("mobile-about-channel-warning")).toBeNull();
  });

  it("criterion 26: fills the selected last row, rounds r24, and draws the white radio tick", async () => {
    const { view } = await renderScreen();
    const selectedRow = await view.findByTestId("mobile-about-channel-option-uat");
    const selectedStyle = flattenStyle(selectedRow.props.style);

    expect(selectedStyle).toMatchObject({
      backgroundColor: lightTheme.about.accentCardSurface,
      borderBottomLeftRadius: mobileAboutMetrics.cardRadius,
      borderBottomRightRadius: mobileAboutMetrics.cardRadius,
    });
    expect(
      flattenStyle(view.getByTestId("mobile-about-channel-radio-uat").props.style),
    ).toMatchObject({
      backgroundColor: lightTheme.about.accent,
      height: 22,
      width: 22,
    });
    expect(
      view.getByTestId("mobile-about-channel-radio-uat-check", {
        includeHiddenElements: true,
      }).props,
    ).toMatchObject({ height: 12, width: 12 });
    expect(
      view.getByTestId("mobile-about-channel-radio-uat-check-path", {
        includeHiddenElements: true,
      }).props,
    ).toMatchObject({
      stroke: { payload: 4_294_967_295, type: 0 },
      strokeWidth: 3,
    });
  });

  it("criterion 27: pins the footer at 26/16/16 with r16 and 14/800 white copy", async () => {
    const { view } = await renderScreen();
    await view.findByTestId("mobile-about-channel-save");

    expect(flattenStyle(view.getByTestId("mobile-about-channel-save").props.style)).toMatchObject({
      borderRadius: mobileAboutMetrics.footerButtonRadius,
      bottom: 26,
      left: 16,
      paddingVertical: 14,
      right: 16,
    });
    expect(
      flattenStyle(
        within(view.getByTestId("mobile-about-channel-save")).getByText("Kanalı kaydet").props
          .style,
      ),
    ).toMatchObject({
      color: lightTheme.about.updateOnGradient,
      fontFamily: lightTheme.typography.fontFamilyExtraBold,
      fontSize: 14,
    });
  });

  it("criterion 10: keeps every channel row at least 44px high", async () => {
    const { view } = await renderScreen();
    await view.findByTestId("mobile-about-channel-option-uat");

    for (const channel of ["stable", "beta", "uat"] as const) {
      expect(
        flattenStyle(view.getByTestId(`mobile-about-channel-option-${channel}`).props.style)
          .minHeight,
      ).toBeGreaterThanOrEqual(44);
    }
  });

  it("criterion 9: uses the canonical uppercase About group label", async () => {
    const { view } = await renderScreen();
    await view.findByTestId("mobile-about-channel-effects-label");

    expect(
      flattenStyle(view.getByTestId("mobile-about-channel-effects-label").props.style),
    ).toMatchObject({
      color: lightTheme.about.groupLabel,
      fontFamily: lightTheme.typography.fontFamilyBold,
      fontSize: 10.5,
      letterSpacing: 1.05,
      textTransform: "uppercase",
    });
  });

  it("criterion 1: avoids card clipping and clears footer plus safe-area height", async () => {
    const { view } = await renderScreen();
    await view.findByTestId("mobile-about-channel-save");

    expect(
      flattenStyle(view.getByTestId("mobile-about-channel-options").props.style).overflow,
    ).toBeUndefined();

    await act(async () => {
      view.getByTestId("mobile-about-channel-save").props.onLayout({
        nativeEvent: { layout: { height: 52, width: 358, x: 16, y: 766 } },
      });
    });
    await waitFor(() =>
      expect(
        flattenStyle(view.getByTestId("mobile-about-channel-scroll").props.contentContainerStyle),
      ).toMatchObject({ paddingBottom: 26 + 52 + 34 }),
    );
  });

  it("asks for beta consent and sends no request when consent is rejected", async () => {
    const openBetaConsent = jest.fn(async () => false);
    const { apiClient, view } = await renderScreen({ openBetaConsent });
    await view.findByTestId("mobile-about-channel-option-uat");

    await fireEvent.press(view.getByTestId("mobile-about-channel-option-beta"));
    await fireEvent.press(view.getByTestId("mobile-about-channel-save"));

    await waitFor(() => expect(openBetaConsent).toHaveBeenCalledTimes(1));
    expect(apiClient.requestJson).not.toHaveBeenCalled();
    expect(
      view.getByTestId("mobile-about-channel-option-uat").props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(view.getByTestId("mobile-about-channel-save").props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it("persists the server channel, shows effectiveFrom, honors requiresRestart, and goes back", async () => {
    const apiClient = createApiClient({ requiresRestart: true });
    const onBack = jest.fn();
    const { view } = await renderScreen({ apiClient, onBack });
    await view.findByTestId("mobile-about-channel-option-uat");

    await fireEvent.press(view.getByTestId("mobile-about-channel-option-stable"));
    await fireEvent.press(view.getByTestId("mobile-about-channel-save"));

    await waitFor(() =>
      expect(apiClient.requestJson).toHaveBeenCalledWith("/api/v1/mobile/app/channel", {
        body: { channel: "stable" },
        method: "POST",
      }),
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("whispr.settings.channel", "stable");
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("whispr.settings.betaConsentAt");
    expect(mockShowToast).toHaveBeenCalledWith({
      title: "Yeni kanal bir sonraki güncellemeden itibaren geçerli olur",
      variant: "success",
    });
    expect(view.getByText("Uygulama bir kez yeniden başlar")).toBeTruthy();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("restores the button after a server error, keeps selection, and leaves the screen open", async () => {
    const apiClient = createApiClient({ reject: true });
    const onBack = jest.fn();
    const { view } = await renderScreen({ apiClient, onBack });
    await view.findByTestId("mobile-about-channel-option-uat");

    await fireEvent.press(view.getByTestId("mobile-about-channel-option-stable"));
    await fireEvent.press(view.getByTestId("mobile-about-channel-save"));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith({
        title: "Kanal tercihi kaydedilemedi. Bağlantını kontrol edip tekrar dene.",
        variant: "error",
      }),
    );
    expect(
      view.getByTestId("mobile-about-channel-option-stable").props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(view.getByTestId("mobile-about-channel-save").props.accessibilityState).toMatchObject({
      disabled: false,
    });
    expect(view.getByTestId("mobile-about-update-channel-screen")).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("keeps the server channel authoritative when local persistence fails", async () => {
    let failStableWrite = true;
    jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
      if (failStableWrite && key === "whispr.settings.channel" && value === "stable") {
        failStableWrite = false;
        throw new Error("disk full");
      }
    });
    const onBack = jest.fn();
    const { view } = await renderScreen({ onBack });
    await view.findByTestId("mobile-about-channel-option-uat");

    await fireEvent.press(view.getByTestId("mobile-about-channel-option-stable"));
    await fireEvent.press(view.getByTestId("mobile-about-channel-save"));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith({
        title:
          "Kanal değişti ancak bu cihazda kalıcı kaydedilemedi. Uygulamayı yeniden açmadan tekrar dene.",
        variant: "error",
      }),
    );
    expect(
      view.getByTestId("mobile-about-channel-option-stable").props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(view.getByTestId("mobile-about-channel-save").props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
