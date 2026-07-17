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
