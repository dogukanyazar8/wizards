import React from "react";
import { StyleSheet } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { AuthLanguagePickerSheet } from "../src/app/screens/auth/auth-language-picker-sheet";

const mockSelection = jest.fn();

jest.mock("../src/app/components/kit/bottom-sheet", () => {
  const ReactRuntime = require("react");
  const { Pressable, View: NativeView } = require("react-native");

  return {
    BottomSheet: ({ children, onClose, open, testID }: any) =>
      open
        ? ReactRuntime.createElement(
            NativeView,
            { testID },
            ReactRuntime.createElement(Pressable, {
              onPress: onClose,
              testID: `${testID}-backdrop`,
            }),
            children,
          )
        : null,
  };
});

jest.mock("../src/app/providers/mobile-haptics-provider", () => ({
  useMobileHaptics: () => ({ selection: mockSelection }),
}));

function resolvePressableStyle(style: unknown) {
  if (typeof style === "function") {
    return StyleSheet.flatten(style({ focused: false, hovered: false, pressed: false }));
  }

  return StyleSheet.flatten(style);
}

async function renderSheet(overrides?: Partial<React.ComponentProps<typeof AuthLanguagePickerSheet>>) {
  const props = {
    locale: "tr" as const,
    onClose: jest.fn(),
    onSelectLocale: jest.fn(),
    onSetUseDeviceLocale: jest.fn(),
    open: true,
    usingDeviceLocale: false,
    ...overrides,
  };

  return {
    props,
    view: await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 844, width: 390, x: 0, y: 0 },
          insets: { bottom: 0, left: 0, right: 0, top: 0 },
        }}
      >
        <MobileThemeProvider>
          <AuthLanguagePickerSheet {...props} />
        </MobileThemeProvider>
      </SafeAreaProvider>,
    ),
  };
}

describe("AuthLanguagePickerSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the 3a title, real language rows, and device-language switch without search", async () => {
    const { view } = await renderSheet();

    expect(view.getByTestId("mobile-auth-language-sheet")).toBeTruthy();
    expect(view.getByText("Dil seçin")).toBeTruthy();
    expect(view.getByText("Uygulama dili anında değişir")).toBeTruthy();
    expect(view.queryByTestId("mobile-auth-language-search")).toBeNull();
    expect(view.getByTestId("mobile-auth-language-option-en").props.accessibilityRole).toBe("radio");
    expect(view.getByTestId("mobile-auth-language-option-tr").props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(view.getByTestId("mobile-auth-language-device-toggle").props.accessibilityRole).toBe("switch");
  });

  it("applies a manual language with haptic feedback and closes after 250ms", async () => {
    const { props, view } = await renderSheet();

    await fireEvent.press(view.getByTestId("mobile-auth-language-option-en"));

    expect(props.onSelectLocale).toHaveBeenCalledWith("en");
    expect(mockSelection).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 275));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("dims and disables manual language rows while device mode is active", async () => {
    const { props, view } = await renderSheet({ usingDeviceLocale: true });
    const englishRow = view.getByTestId("mobile-auth-language-option-en");

    expect(englishRow.props.accessibilityState).toMatchObject({ disabled: true });
    expect(resolvePressableStyle(englishRow.props.style)).toMatchObject({ opacity: 0.5 });

    await fireEvent.press(englishRow);
    expect(props.onSelectLocale).not.toHaveBeenCalled();
  });

  it("toggles device mode and closes from the backdrop without changing locale", async () => {
    const { props, view } = await renderSheet();

    await fireEvent.press(view.getByTestId("mobile-auth-language-device-toggle"));
    expect(props.onSetUseDeviceLocale).toHaveBeenCalledWith(true);

    await fireEvent.press(view.getByTestId("mobile-auth-language-sheet-backdrop"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onSelectLocale).not.toHaveBeenCalled();
  });
});
