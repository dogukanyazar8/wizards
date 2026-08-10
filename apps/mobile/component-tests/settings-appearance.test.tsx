import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import {
  SettingsAppearanceSelector,
  SettingsHapticsControl,
} from "../src/app/screens/settings-screen";
import { MOBILE_THEME_PREFERENCE_KEY } from "../src/design/mobile-theme-runtime";
import { setActiveMobileLocale } from "../src/locale/mobile-locale-preferences";

const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;
const mockSetHapticsEnabled = jest.fn();

jest.mock("../src/app/providers/mobile-haptics-provider", () => ({
  useMobileHaptics: () => ({
    enabled: true,
    selection: jest.fn(),
    setEnabled: mockSetHapticsEnabled,
  }),
}));

jest.mock("../src/media/use-mobile-image-upload", () => ({
  useMobileImageUpload: () => ({ isBusy: false, selectAndUpload: jest.fn() }),
}));

describe("SettingsAppearanceSelector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActiveMobileLocale("tr");
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
  });

  it("exposes accessible system, light, and dark radio choices and persists selection", async () => {
    const view = await render(
      <MobileThemeProvider>
        <SettingsAppearanceSelector />
      </MobileThemeProvider>,
    );

    const control = view.getByTestId("mobile-settings-appearance-control");
    const system = view.getByLabelText("Sistem");
    const light = view.getByLabelText("Açık");
    const dark = view.getByLabelText("Koyu");

    expect(control.props.accessibilityRole).toBe("radiogroup");
    expect(system.props.accessibilityState.checked).toBe(true);
    expect(light.props.accessibilityState.checked).toBe(false);
    expect(dark.props.accessibilityState.checked).toBe(false);

    await fireEvent.press(dark);

    expect(view.getByLabelText("Koyu").props.accessibilityState.checked).toBe(true);
    await waitFor(() =>
      expect(mockSetItem).toHaveBeenCalledWith(MOBILE_THEME_PREFERENCE_KEY, "dark"),
    );
  });

  it("exposes an accessible haptics preference toggle", async () => {
    const view = await render(
      <MobileThemeProvider>
        <SettingsHapticsControl />
      </MobileThemeProvider>,
    );
    const toggle = view.getByTestId("mobile-haptics-toggle");
    expect(toggle.props.accessibilityState.checked).toBe(true);
    await fireEvent.press(toggle);
    expect(mockSetHapticsEnabled).toHaveBeenCalledWith(false);
  });
});
