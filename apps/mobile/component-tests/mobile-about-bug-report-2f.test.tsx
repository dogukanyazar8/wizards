import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Keyboard, Pressable, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const mockUseMobileAuth = jest.fn();
const mockUseMobileNetworkStatus = jest.fn();
const mockShowToast = jest.fn();
const mockNotification = jest.fn();
const mockCaptureScreenshot = jest.fn();
const mockUploadImage = jest.fn();

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => mockUseMobileAuth(),
}));

jest.mock("../src/app/providers/mobile-network-provider", () => ({
  useMobileNetworkStatus: () => mockUseMobileNetworkStatus(),
}));

jest.mock("../src/app/components/kit/toast", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock("../src/app/providers/mobile-haptics-provider", () => ({
  useMobileHaptics: () => ({ notification: mockNotification, selection: jest.fn() }),
}));

jest.mock("../src/feedback/mobile-crash-screenshot", () => ({
  captureMobileCrashScreenshot: () => mockCaptureScreenshot(),
}));

jest.mock("../src/feedback/use-mobile-feedback-attachment-upload", () => ({
  useMobileFeedbackAttachmentUpload: () => ({
    pickImages: jest.fn(),
    uploadImage: mockUploadImage,
  }),
}));

jest.mock("../src/app/components/message-image-lightbox", () => {
  const ReactNative = require("react-native") as typeof import("react-native");

  return {
    MessageImageLightbox: ({
      onClose,
      onRemove,
      open,
      removeLabel,
    }: {
      readonly onClose: () => void;
      readonly onRemove?: () => void;
      readonly open: boolean;
      readonly removeLabel?: string;
    }) =>
      open ? (
        <ReactNative.View testID="mobile-message-image-lightbox">
          <ReactNative.Pressable onPress={onClose} testID="mobile-message-image-lightbox-close" />
          {onRemove === undefined ? null : (
            <ReactNative.Pressable onPress={onRemove} testID="mobile-message-image-lightbox-remove">
              <ReactNative.Text>{removeLabel}</ReactNative.Text>
            </ReactNative.Pressable>
          )}
        </ReactNative.View>
      ) : null,
  };
});

jest.mock("../src/app/components/kit/destructive-confirmation-sheet", () => {
  const ReactNative = require("react-native") as typeof import("react-native");

  return {
    DestructiveConfirmationSheet: ({
      onCancel,
      onConfirm,
      open,
      testID,
      title,
    }: {
      readonly onCancel: () => void;
      readonly onConfirm: () => void;
      readonly open: boolean;
      readonly testID: string;
      readonly title: string;
    }) =>
      open ? (
        <ReactNative.View testID={testID}>
          <ReactNative.Text>{title}</ReactNative.Text>
          <ReactNative.Pressable onPress={onCancel} testID={`${testID}-cancel`} />
          <ReactNative.Pressable onPress={onConfirm} testID={`${testID}-confirm`} />
        </ReactNative.View>
      ) : null,
  };
});

import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobileBugReportScreen } from "../src/app/screens/about/about-bug-report-screen";
import { MobileBugReportQueueBridge } from "../src/about/mobile-bug-report-queue-bridge";
import { lightTheme } from "../src/design/themes";
import { mobileAboutMetrics } from "../src/design/tokens";
import { MOBILE_BUG_REPORT_QUEUE_KEY } from "../src/about/mobile-bug-report-model";

function createApiClient({ reject = false } = {}) {
  return {
    requestJson: jest.fn(async (path: string, init?: { readonly body?: unknown }) => {
      if (path !== "/api/v1/mobile/support/report") {
        throw new Error(`Unexpected 2f request: ${path}`);
      }
      if (reject) {
        throw new Error("report unavailable");
      }
      return { createdAt: "2026-07-30T09:00:00.000Z", ticket: "WSP-24817" };
    }),
  };
}

async function renderScreen({
  category,
  onBack = jest.fn(),
}: {
  readonly category?: string;
  readonly onBack?: () => void;
} = {}) {
  const apiClient = createApiClient();
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
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <MobileBugReportScreen
            appBuild="8150"
            appVersion="0.8.15"
            onBack={onBack}
            releaseChannel="uat"
            {...(category === undefined ? {} : { category })}
          />
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </SafeAreaProvider>,
  );

  return { apiClient, onBack, view };
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

describe("2f bug report screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMobileNetworkStatus.mockReturnValue("online");
    mockCaptureScreenshot.mockResolvedValue({
      file: { name: "capture.jpg", size: 1_024, type: "image/jpeg" },
      localUri: "file:///tmp/bug-report.jpg",
    });
    mockUploadImage.mockResolvedValue({
      claimId: "6f1b2a4c-9d3e-4f58-8a71-2c5d0e7b4a19",
      status: "uploaded",
    });
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
  });

  it("criterion 31: renders a 17px close X and no back chevron", async () => {
    const { view } = await renderScreen();

    expect(
      view.getByTestId("mobile-bug-report-header-close-icon", {
        includeHiddenElements: true,
      }).props,
    ).toMatchObject({ height: 17, width: 17 });
    expect(
      view.queryByTestId("mobile-bug-report-header-back-icon", {
        includeHiddenElements: true,
      }),
    ).toBeNull();
  });

  it("requires a category and twenty trimmed characters, and honours the route category", async () => {
    const { view } = await renderScreen({ category: "voice" });
    const submit = view.getByTestId("mobile-bug-report-submit");

    expect(
      view.getByTestId("mobile-bug-report-category-voice").props.accessibilityState,
    ).toMatchObject({
      selected: true,
    });
    expect(submit.props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.changeText(view.getByTestId("mobile-bug-report-body"), "x".repeat(19));
    expect(submit.props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.changeText(view.getByTestId("mobile-bug-report-body"), "x".repeat(20));
    expect(submit.props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("warns only after 900 characters", async () => {
    const { view } = await renderScreen({ category: "chat" });
    const input = view.getByTestId("mobile-bug-report-body");

    await fireEvent.changeText(input, "x".repeat(900));
    expect(flattenStyle(view.getByTestId("mobile-bug-report-counter").props.style).color).toBe(
      lightTheme.about.iconTint,
    );
    await fireEvent.changeText(input, "x".repeat(901));
    expect(flattenStyle(view.getByTestId("mobile-bug-report-counter").props.style).color).toBe(
      lightTheme.about.warningText,
    );
  });

  it("criterion 32: describes all three attachments and leaves device details visible while off", async () => {
    const { view } = await renderScreen();

    expect(view.getByText("Son 500 satır · mesaj içeriği yok")).toBeTruthy();
    expect(view.getByText("Sorun bildir · düzenleyebilirsin")).toBeTruthy();
    expect(view.getByText(/0\.8\.15 \(8150\) · uat/)).toBeTruthy();
    expect(
      view.getByTestId("mobile-bug-report-logs-toggle").props.accessibilityState,
    ).toMatchObject({
      checked: true,
    });
    expect(
      view.getByTestId("mobile-bug-report-screenshot-toggle").props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(
      view.getByTestId("mobile-bug-report-device-toggle").props.accessibilityState,
    ).toMatchObject({
      checked: false,
    });
  });

  it("opens the captured screenshot full-screen and offers remove instead of an editor", async () => {
    const { view } = await renderScreen();
    await view.findByTestId("mobile-bug-report-screenshot-image");

    await fireEvent.press(view.getByTestId("mobile-bug-report-screenshot-preview"));
    expect(view.getByTestId("mobile-message-image-lightbox")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-message-image-lightbox-remove"));

    expect(view.queryByTestId("mobile-bug-report-screenshot-image")).toBeNull();
    expect(
      view.getByTestId("mobile-bug-report-screenshot-toggle").props.accessibilityState,
    ).toMatchObject({ checked: false });
  });

  it("criterion 27 and keyboard trap: pins at 26/16/r16, then moves into the list", async () => {
    let showKeyboard: (() => void) | undefined;
    jest.spyOn(Keyboard, "addListener").mockImplementation((name, listener) => {
      if (name === "keyboardDidShow") {
        showKeyboard = listener as () => void;
      }
      return { remove: jest.fn() };
    });
    const { view } = await renderScreen({ category: "other" });
    const pinned = view.getByTestId("mobile-bug-report-submit");

    expect(flattenStyle(pinned.props.style)).toMatchObject({
      borderRadius: mobileAboutMetrics.footerButtonRadius,
      bottom: 26,
      left: 16,
      paddingVertical: 14,
      position: "absolute",
      right: 16,
    });
    expect(flattenStyle(within(pinned).getByText("Raporu gönder").props.style)).toMatchObject({
      color: lightTheme.about.updateOnGradient,
      fontFamily: lightTheme.typography.fontFamilyExtraBold,
      fontSize: 14,
    });

    await act(async () => {
      showKeyboard?.();
    });
    expect(flattenStyle(view.getByTestId("mobile-bug-report-submit").props.style)).toMatchObject({
      position: "relative",
    });
    expect(view.getByTestId("mobile-bug-report-submit-flow")).toBeTruthy();
  });

  it("criterion 10 and 1: keeps attachment rows >=44px and clears footer plus safe area", async () => {
    const { view } = await renderScreen();

    for (const row of ["logs", "screenshot", "device"] as const) {
      expect(
        flattenStyle(view.getByTestId(`mobile-bug-report-${row}-row`).props.style).minHeight,
      ).toBeGreaterThanOrEqual(44);
    }
    await act(async () => {
      view.getByTestId("mobile-bug-report-submit").props.onLayout({
        nativeEvent: { layout: { height: 48, width: 358, x: 16, y: 770 } },
      });
    });
    expect(
      flattenStyle(view.getByTestId("mobile-bug-report-scroll").props.contentContainerStyle),
    ).toMatchObject({ paddingBottom: 26 + 48 + 34 });
  });

  it("uploads the screenshot, submits the strict body, copies the ticket and closes", async () => {
    const { apiClient, onBack, view } = await renderScreen({ category: "voice" });
    await view.findByTestId("mobile-bug-report-screenshot-image");
    await fireEvent.changeText(
      view.getByTestId("mobile-bug-report-body"),
      "Mikrofon simgesi kanaldan çıkınca açık kalıyor.",
    );
    await fireEvent.press(view.getByTestId("mobile-bug-report-submit"));

    await waitFor(() =>
      expect(apiClient.requestJson).toHaveBeenCalledWith("/api/v1/mobile/support/report", {
        body: expect.objectContaining({
          category: "voice",
          includesDeviceInfo: false,
          includesLogs: true,
          includesScreenshot: true,
          screenshotUploadKey: "6f1b2a4c-9d3e-4f58-8a71-2c5d0e7b4a19",
        }),
        method: "POST",
      }),
    );
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("WSP-24817");
    expect(mockNotification).toHaveBeenCalledWith("success");
    expect(mockShowToast).toHaveBeenCalledWith({
      title: "Rapor alındı · WSP-24817",
      variant: "success",
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("queues at most through the dedicated model when offline and announces later delivery", async () => {
    mockUseMobileNetworkStatus.mockReturnValue("offline");
    const { apiClient, onBack, view } = await renderScreen({ category: "performance" });
    await fireEvent.changeText(
      view.getByTestId("mobile-bug-report-body"),
      "Listeyi açınca ekran birkaç saniye donuyor.",
    );
    await fireEvent.press(view.getByTestId("mobile-bug-report-submit"));

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        MOBILE_BUG_REPORT_QUEUE_KEY,
        expect.stringContaining('"category":"performance"'),
      ),
    );
    expect(apiClient.requestJson).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      title: "Ağ gelince raporun gönderilecek",
      variant: "info",
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("asks before discarding a dirty form", async () => {
    const { onBack, view } = await renderScreen();
    await fireEvent.changeText(view.getByTestId("mobile-bug-report-body"), "henüz kısa taslak");
    await fireEvent.press(view.getByTestId("mobile-bug-report-header-back"));

    expect(view.getByTestId("mobile-bug-report-discard-sheet")).toBeTruthy();
    expect(view.getByText("Vazgeçilsin mi?")).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();

    await fireEvent.press(view.getByTestId("mobile-bug-report-discard-sheet-confirm"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("2f queued report reconnect bridge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMobileNetworkStatus.mockReturnValue("online");
    mockUploadImage.mockResolvedValue({
      claimId: "6f1b2a4c-9d3e-4f58-8a71-2c5d0e7b4a19",
      status: "uploaded",
    });
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
  });

  it("submits stored drafts when connectivity returns and removes each successful item", async () => {
    const apiClient = createApiClient();
    mockUseMobileAuth.mockReturnValue({
      apiClient,
      session: { user: { id: "usr_0123456789abcdef" } },
      status: "signed-in",
    });
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(
      JSON.stringify([
        {
          id: "report-1",
          queuedAt: "2026-07-30T09:00:00.000Z",
          request: {
            body: "Bildirim satırı iki defa görünüyor.",
            category: "notification",
            includesDeviceInfo: false,
            includesLogs: false,
            includesScreenshot: false,
          },
        },
      ]),
    );

    await render(
      <MobileLocaleProvider>
        <MobileBugReportQueueBridge />
      </MobileLocaleProvider>,
    );

    await waitFor(() =>
      expect(apiClient.requestJson).toHaveBeenCalledWith("/api/v1/mobile/support/report", {
        body: expect.objectContaining({ category: "notification" }),
        method: "POST",
      }),
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(MOBILE_BUG_REPORT_QUEUE_KEY, "[]");
    expect(mockShowToast).toHaveBeenCalledWith({
      title: "Rapor alındı · WSP-24817",
      variant: "success",
    });
  });
});
