import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { useReducedMotion } from "react-native-reanimated";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { darkTheme, lightTheme, type MobileTheme } from "../src/design/themes";

let mockTheme: MobileTheme = lightTheme;

jest.mock("../src/app/providers/mobile-theme-provider", () => ({
  useTheme: () => mockTheme,
  useThemedStyles: (factory: (theme: MobileTheme) => Record<string, object>) => {
    const { StyleSheet } = require("react-native");
    return StyleSheet.create(factory(mockTheme));
  },
}));

import { Skeleton, ToastProvider, useToast } from "../src/app/components/kit";
import type { MobileToastHandle } from "../src/app/components/kit/toast";
import { activeMobileCopy } from "../src/locale/mobile-locale-preferences";

const SAFE_AREA_TOP = 44;
/** Handoff 3b: safe area + 12px. */
const TOAST_TOP_GAP = 12;

const undoPress = jest.fn();
const retryPress = jest.fn();
let latestHandle: MobileToastHandle | null = null;

function ToastHarness() {
  const { showToast } = useToast();

  return (
    <>
      <Pressable
        onPress={() =>
          showToast({
            subtitle: "Değişiklikler herkese görünür",
            title: "Profil bilgileri güncellendi",
            variant: "success",
          })
        }
        testID="show-success-toast"
      >
        <Text>Success</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          showToast({
            action: { label: "Tekrar dene", onPress: retryPress },
            subtitle: "Bağlantını kontrol edip tekrar dene",
            title: "Profil güncellenemedi",
            variant: "error",
          })
        }
        testID="show-error-toast"
      >
        <Text>Error</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          showToast({
            action: { label: "Geri al", onPress: undoPress },
            subtitle: "aysegul_dev hakkındaki notun",
            title: "Not silindi",
            variant: "action",
          })
        }
        testID="show-undo-toast"
      >
        <Text>Undo</Text>
      </Pressable>
      <Pressable
        onPress={() => showToast({ title: "Davet bağlantısı yakında dolacak", variant: "warning" })}
        testID="show-warning-toast"
      >
        <Text>Warning</Text>
      </Pressable>
      <Pressable
        onPress={() => showToast({ title: "Yeni cihazdan giriş yapıldı", variant: "info" })}
        testID="show-info-toast"
      >
        <Text>Info</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          latestHandle = showToast({
            subtitle: "%64 · birkaç saniye",
            title: "Profil fotoğrafı yükleniyor…",
            variant: "loading",
          });
        }}
        testID="show-loading-toast"
      >
        <Text>Loading</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          latestHandle?.resolve({
            subtitle: "Değişiklikler herkese görünür",
            title: "Profil bilgileri güncellendi",
            variant: "success",
          })
        }
        testID="resolve-loading-toast"
      >
        <Text>Resolve</Text>
      </Pressable>
    </>
  );
}

async function renderToasts() {
  return await render(
    <SafeAreaInsetsContext.Provider value={{ bottom: 0, left: 0, right: 0, top: SAFE_AREA_TOP }}>
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    </SafeAreaInsetsContext.Provider>,
  );
}

/** Runs the pending timers plus the exit slide that follows them. */
async function settle(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await act(async () => {
    jest.advanceTimersByTime(1_000);
  });
}

afterEach(() => {
  jest.useRealTimers();
  latestHandle = null;
  undoPress.mockReset();
  retryPress.mockReset();
  jest.mocked(useReducedMotion).mockReturnValue(false);
});

for (const theme of [lightTheme, darkTheme]) {
  describe(`${theme.id} mobile feedback kit`, () => {
    it("renders semantic animated and reduced-motion skeleton states", async () => {
      mockTheme = theme;
      jest.mocked(useReducedMotion).mockReturnValue(false);
      const animatedView = await render(
        <Skeleton height={24} testID="feedback-skeleton" width={160} />,
      );

      expect(
        animatedView.getByTestId("feedback-skeleton-shimmer", { includeHiddenElements: true }),
      ).toBeTruthy();
      expect(
        StyleSheet.flatten(
          animatedView.getByTestId("feedback-skeleton", { includeHiddenElements: true }).props
            .style,
        ).backgroundColor,
      ).toBe(theme.surface.soft);
      await animatedView.unmount();

      jest.mocked(useReducedMotion).mockReturnValue(true);
      const staticView = await render(
        <Skeleton height={24} testID="feedback-skeleton-static" width={160} />,
      );
      expect(
        staticView.queryByTestId("feedback-skeleton-static-shimmer", {
          includeHiddenElements: true,
        }),
      ).toBeNull();
    });

    it("shows a title, a subtitle and the ✕, anchored below the safe area", async () => {
      mockTheme = theme;
      jest.useFakeTimers();
      const view = await renderToasts();

      await fireEvent.press(view.getByTestId("show-success-toast"));

      expect(view.getByText("Profil bilgileri güncellendi")).toBeTruthy();
      expect(view.getByTestId("mobile-toast-subtitle").props.children).toBe(
        "Değişiklikler herkese görünür",
      );
      expect(
        StyleSheet.flatten(view.getByTestId("mobile-toast-viewport").props.style),
      ).toMatchObject({ top: SAFE_AREA_TOP + TOAST_TOP_GAP });
      expect(view.getByTestId("mobile-toast-dismiss").props.accessibilityLabel).toBe(
        activeMobileCopy.dismissNotificationAction,
      );
      // Colour only reaches the glyph tile; the card is the same in every variant.
      expect(
        StyleSheet.flatten(view.getByTestId("mobile-toast-variant-success").props.style),
      ).toMatchObject({ backgroundColor: theme.toast.variants.success.iconSurface });
      expect(StyleSheet.flatten(view.getByTestId("mobile-toast").props.style)).toMatchObject({
        backgroundColor: theme.toast.card,
        borderColor: theme.toast.cardBorder,
      });

      await view.unmount();
    });

    it("keeps exactly one toast: a second message replaces the first with no queue", async () => {
      mockTheme = theme;
      jest.useFakeTimers();
      const view = await renderToasts();

      await fireEvent.press(view.getByTestId("show-success-toast"));
      await fireEvent.press(view.getByTestId("show-warning-toast"));

      expect(view.queryByText("Profil bilgileri güncellendi")).toBeNull();
      expect(view.getByText("Davet bağlantısı yakında dolacak")).toBeTruthy();
      expect(view.getAllByTestId("mobile-toast")).toHaveLength(1);

      // Dismissing does not surface a queued second card, because there is none.
      await fireEvent.press(view.getByTestId("mobile-toast-dismiss"));
      await settle(0);
      expect(view.queryByTestId("mobile-toast")).toBeNull();

      await view.unmount();
    });

    it("offers an action or an escape hatch, never both, and runs the action", async () => {
      mockTheme = theme;
      jest.useFakeTimers();
      const view = await renderToasts();

      await fireEvent.press(view.getByTestId("show-undo-toast"));

      expect(view.queryByTestId("mobile-toast-dismiss")).toBeNull();
      const undo = view.getByTestId("mobile-toast-action");
      expect(StyleSheet.flatten(undo.props.style)).toMatchObject({
        backgroundColor: theme.toast.variants.action.actionSurface,
      });

      await fireEvent.press(undo);
      expect(undoPress).toHaveBeenCalledTimes(1);
      await settle(0);
      expect(view.queryByTestId("mobile-toast")).toBeNull();

      await view.unmount();
    });

    it("announces an error assertively and everything else politely", async () => {
      mockTheme = theme;
      jest.useFakeTimers();
      const view = await renderToasts();

      await fireEvent.press(view.getByTestId("show-error-toast"));
      expect(view.getByTestId("mobile-toast").props.accessibilityLiveRegion).toBe("assertive");

      await fireEvent.press(view.getByTestId("show-info-toast"));
      expect(view.getByTestId("mobile-toast").props.accessibilityLiveRegion).toBe("polite");

      await view.unmount();
    });

    it("retires after three seconds, or six when it is holding an action", async () => {
      mockTheme = theme;
      jest.useFakeTimers();
      const view = await renderToasts();

      await fireEvent.press(view.getByTestId("show-success-toast"));
      await act(async () => {
        jest.advanceTimersByTime(2_500);
      });
      expect(view.getByTestId("mobile-toast")).toBeTruthy();
      await settle(600);
      expect(view.queryByTestId("mobile-toast")).toBeNull();

      await fireEvent.press(view.getByTestId("show-error-toast"));
      await act(async () => {
        jest.advanceTimersByTime(4_000);
      });
      // An offered action needs longer than a confirmation nobody has to act on.
      expect(view.getByTestId("mobile-toast")).toBeTruthy();
      await settle(2_500);
      expect(view.queryByTestId("mobile-toast")).toBeNull();

      await view.unmount();
    });

    it("freezes the countdown under a held finger and resumes it on release", async () => {
      mockTheme = theme;
      jest.useFakeTimers();
      const view = await renderToasts();

      await fireEvent.press(view.getByTestId("show-success-toast"));
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });

      await fireEvent(view.getByTestId("mobile-toast"), "touchStart");
      await act(async () => {
        jest.advanceTimersByTime(10_000);
      });
      expect(view.getByTestId("mobile-toast")).toBeTruthy();

      await fireEvent(view.getByTestId("mobile-toast"), "touchEnd");
      await act(async () => {
        jest.advanceTimersByTime(1_500);
      });
      expect(view.getByTestId("mobile-toast")).toBeTruthy();
      await settle(1_000);
      expect(view.queryByTestId("mobile-toast")).toBeNull();

      await view.unmount();
    });

    it("morphs a loading card into its result instead of opening a second toast", async () => {
      mockTheme = theme;
      jest.useFakeTimers();
      const view = await renderToasts();

      await fireEvent.press(view.getByTestId("show-loading-toast"));

      expect(view.getByText("Profil fotoğrafı yükleniyor…")).toBeTruthy();
      expect(view.getByTestId("mobile-toast-spinner")).toBeTruthy();
      // A loading card has no countdown and no ✕: only its own result retires it.
      expect(view.queryByTestId("mobile-toast-timer")).toBeNull();
      expect(view.queryByTestId("mobile-toast-dismiss")).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(30_000);
      });
      expect(view.getByText("Profil fotoğrafı yükleniyor…")).toBeTruthy();

      await fireEvent.press(view.getByTestId("resolve-loading-toast"));

      expect(view.getAllByTestId("mobile-toast")).toHaveLength(1);
      expect(view.getByText("Profil bilgileri güncellendi")).toBeTruthy();
      expect(view.getByTestId("mobile-toast-timer")).toBeTruthy();
      expect(
        StyleSheet.flatten(view.getByTestId("mobile-toast-variant-success").props.style),
      ).toMatchObject({ backgroundColor: theme.toast.variants.success.iconSurface });

      await settle(3_100);
      expect(view.queryByTestId("mobile-toast")).toBeNull();

      await view.unmount();
    });

    it("ignores a resolution whose card was already replaced", async () => {
      mockTheme = theme;
      jest.useFakeTimers();
      const view = await renderToasts();

      await fireEvent.press(view.getByTestId("show-loading-toast"));
      await fireEvent.press(view.getByTestId("show-warning-toast"));
      await fireEvent.press(view.getByTestId("resolve-loading-toast"));

      expect(view.getByText("Davet bağlantısı yakında dolacak")).toBeTruthy();
      expect(view.queryByText("Profil bilgileri güncellendi")).toBeNull();

      await view.unmount();
    });
  });
}
