import React from "react";
import { BackHandler, Pressable, StyleSheet, Text } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { useReducedMotion } from "react-native-reanimated";
import { darkTheme, lightTheme, type MobileTheme } from "../src/design/themes";

let mockTheme: MobileTheme = lightTheme;
let mockGestureHandlers: {
  end?: (event: { translationY: number; velocityY: number }) => void;
  update?: (event: { translationY: number; velocityY: number }) => void;
} = {};

jest.mock("../src/app/providers/mobile-theme-provider", () => ({
  useTheme: () => mockTheme,
  useThemedStyles: (factory: (theme: MobileTheme) => Record<string, object>) => {
    const { StyleSheet } = require("react-native");
    return StyleSheet.create(factory(mockTheme));
  },
}));

jest.mock("react-native-gesture-handler", () => {
  const ReactRuntime = require("react");
  const ReactNative = require("react-native");

  return {
    Gesture: {
      Pan: () => {
        const gesture = {
          enabled: () => gesture,
          onEnd: (handler: typeof mockGestureHandlers.end) => {
            mockGestureHandlers.end = handler;
            return gesture;
          },
          onUpdate: (handler: typeof mockGestureHandlers.update) => {
            mockGestureHandlers.update = handler;
            return gesture;
          },
        };
        return gesture;
      },
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(ReactNative.View, { testID: "mock-gesture-detector" }, children),
  };
});

import { BottomSheet, ContextMenu } from "../src/app/components/kit";

beforeEach(() => {
  mockGestureHandlers = {};
  jest.mocked(useReducedMotion).mockReturnValue(false);
});

for (const theme of [lightTheme, darkTheme]) {
  describe(`${theme.id} mobile overlay kit`, () => {
    it("closes BottomSheet from backdrop, Android back, and pan-down", async () => {
      mockTheme = theme;
      const onClose = jest.fn();
      let hardwareBackHandler: (() => boolean) | undefined;
      const removeBackHandler = jest.fn();
      jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, handler) => {
        hardwareBackHandler = handler;
        return { remove: removeBackHandler };
      });

      const view = await render(
        <BottomSheet
          accessibilityLabel="Actions"
          onClose={onClose}
          open
          testID="overlay-sheet"
        >
          <Text>Sheet content</Text>
        </BottomSheet>,
      );

      const panel = view.getByTestId("overlay-sheet-panel");
      expect(panel.props.role).toBe("dialog");
      expect(StyleSheet.flatten(panel.props.style).backgroundColor).toBe(theme.surface.elevated);

      await fireEvent.press(view.getByTestId("overlay-sheet-backdrop"));
      expect(onClose).toHaveBeenCalledTimes(1);

      expect(hardwareBackHandler?.()).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(2);

      mockGestureHandlers.end?.({ translationY: 280, velocityY: 1_100 });
      expect(onClose).toHaveBeenCalledTimes(3);
      await view.unmount();
      expect(removeBackHandler).toHaveBeenCalledTimes(1);
    });

    it("renders nothing while BottomSheet is closed and uses immediate reduced-motion state", async () => {
      mockTheme = theme;
      jest.mocked(useReducedMotion).mockReturnValue(true);
      const view = await render(
        <BottomSheet accessibilityLabel="Actions" onClose={jest.fn()} open={false} testID="closed-sheet">
          <Text>Hidden content</Text>
        </BottomSheet>,
      );

      expect(view.queryByTestId("closed-sheet-panel")).toBeNull();
      expect(view.queryByText("Hidden content")).toBeNull();
    });

    it("opens ContextMenu on long press and closes after an accessible action", async () => {
      mockTheme = theme;
      const onAction = jest.fn();
      const view = await render(
        <ContextMenu
          accessibilityLabel="Message actions"
          actions={[
            { id: "reply", label: "Reply", onPress: onAction },
            { destructive: true, id: "delete", label: "Delete", onPress: jest.fn() },
          ]}
          testID="message-menu"
        >
          <Text>Open menu</Text>
        </ContextMenu>,
      );

      await fireEvent(view.getByTestId("message-menu-trigger"), "longPress");

      expect(view.getByTestId("message-menu-options").props.accessibilityRole).toBe("menu");
      const reply = view.getByLabelText("Reply");
      expect(reply.props.accessibilityRole).toBe("menuitem");
      await fireEvent.press(reply);

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(view.queryByTestId("message-menu-options")).toBeNull();
    });
  });
}
