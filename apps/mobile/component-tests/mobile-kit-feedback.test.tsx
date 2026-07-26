import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { useReducedMotion } from "react-native-reanimated";
import { darkTheme, lightTheme, type MobileTheme } from "../src/design/themes";

let mockTheme: MobileTheme = lightTheme;
const mockBottomSystemSpacing = jest.fn(() => 24);

jest.mock("../src/app/providers/mobile-theme-provider", () => ({
  useTheme: () => mockTheme,
  useThemedStyles: (factory: (theme: MobileTheme) => Record<string, object>) => {
    const { StyleSheet } = require("react-native");
    return StyleSheet.create(factory(mockTheme));
  },
}));

jest.mock("../src/app/use-mobile-bottom-system-spacing", () => ({
  useMobileBottomSystemSpacing: (minimumSpacing: number) => mockBottomSystemSpacing(minimumSpacing),
}));

import { Skeleton, ToastProvider, useToast } from "../src/app/components/kit";
import { activeMobileCopy } from "../src/locale/mobile-locale-preferences";

function ToastHarness() {
  const { showToast } = useToast();

  return (
    <>
      <Pressable
        onPress={() => showToast({ duration: 5_000, message: "First announcement" })}
        testID="show-first-toast"
      >
        <Text>First</Text>
      </Pressable>
      <Pressable
        onPress={() => showToast({ duration: 5_000, message: "Second announcement" })}
        testID="show-second-toast"
      >
        <Text>Second</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          showToast({ duration: 5_000, message: "Profil güncellendi.", tone: "success" })
        }
        testID="show-success-toast"
      >
        <Text>Success</Text>
      </Pressable>
      <Pressable
        onPress={() => showToast({ duration: 5_000, message: "Boom", tone: "danger" })}
        testID="show-danger-toast"
      >
        <Text>Danger</Text>
      </Pressable>
    </>
  );
}

afterEach(() => {
  jest.useRealTimers();
  mockBottomSystemSpacing.mockReset();
  mockBottomSystemSpacing.mockReturnValue(24);
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

    it("queues polite toast announcements and clears their timer on unmount", async () => {
      mockTheme = theme;
      jest.useFakeTimers();
      const clearTimerSpy = jest.spyOn(global, "clearTimeout");
      const view = await render(
        <ToastProvider>
          <ToastHarness />
        </ToastProvider>,
      );

      await fireEvent.press(view.getByTestId("show-first-toast"));
      await fireEvent.press(view.getByTestId("show-second-toast"));

      const toast = view.getByTestId("mobile-toast");
      expect(toast.props.accessibilityLiveRegion).toBe("polite");
      expect(view.getByText("First announcement")).toBeTruthy();
      expect(view.queryByText("Second announcement")).toBeNull();

      await fireEvent.press(view.getByTestId("mobile-toast-dismiss"));

      expect(view.queryByText("First announcement")).toBeNull();
      expect(view.getByText("Second announcement")).toBeTruthy();
      clearTimerSpy.mockClear();
      await view.unmount();
      expect(clearTimerSpy).toHaveBeenCalled();
    });

    it("carries toast meaning on a tinted glyph tile instead of a hairline border", async () => {
      mockTheme = theme;
      jest.useFakeTimers();
      const view = await render(
        <ToastProvider>
          <ToastHarness />
        </ToastProvider>,
      );

      await fireEvent.press(view.getByTestId("show-success-toast"));

      expect(view.getByText("Profil güncellendi.")).toBeTruthy();
      expect(
        StyleSheet.flatten(view.getByTestId("mobile-toast-tone-success").props.style),
      ).toMatchObject({ backgroundColor: theme.status.successSoft });
      // The card itself stays neutral; the old toast only ever said "success" via
      // a 1px border that vanished on the elevated surface.
      expect(StyleSheet.flatten(view.getByTestId("mobile-toast").props.style).borderColor).toBe(
        theme.border.subtle,
      );

      await fireEvent.press(view.getByTestId("mobile-toast-dismiss"));
      await fireEvent.press(view.getByTestId("show-danger-toast"));

      expect(
        StyleSheet.flatten(view.getByTestId("mobile-toast-tone-danger").props.style),
      ).toMatchObject({ backgroundColor: theme.status.dangerSoft });
    });

    // A close button made a routine confirmation look like it wanted an answer.
    it("retires on its own timer and a tap on the card, with no close button", async () => {
      mockTheme = theme;
      jest.useFakeTimers();
      const view = await render(
        <ToastProvider>
          <ToastHarness />
        </ToastProvider>,
      );

      await fireEvent.press(view.getByTestId("show-success-toast"));

      expect(view.getByTestId("mobile-toast-timer")).toBeTruthy();
      // The old dismiss control was a labelled icon button; the label is a hint now.
      expect(view.queryByLabelText(activeMobileCopy.dismissNotificationAction)).toBeNull();
      expect(view.getByTestId("mobile-toast-dismiss").props.accessibilityHint).toBe(
        activeMobileCopy.dismissNotificationAction,
      );

      // The whole card is the tap target.
      await fireEvent.press(view.getByTestId("mobile-toast-dismiss"));
      expect(view.queryByText("Profil güncellendi.")).toBeNull();
    });

    it("keeps toast controls above a three-button Android navigation bar", async () => {
      mockTheme = theme;
      jest.useFakeTimers();
      mockBottomSystemSpacing.mockReturnValue(48);
      const view = await render(
        <ToastProvider>
          <ToastHarness />
        </ToastProvider>,
      );

      await fireEvent.press(view.getByTestId("show-first-toast"));

      expect(mockBottomSystemSpacing).toHaveBeenCalledWith(24);
      expect(
        StyleSheet.flatten(view.getByTestId("mobile-toast-viewport").props.style),
      ).toMatchObject({
        bottom: 48,
      });
    });
  });
}
