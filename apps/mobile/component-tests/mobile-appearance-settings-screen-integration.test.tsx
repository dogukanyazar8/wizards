import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";

import { MobileAppearanceSettingsScreen } from "../src/app/screens/mobile-appearance-settings-screen";
import { createMobileAppearanceSettingsStyles } from "../src/app/screens/mobile-appearance-settings-screen.styles";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileWorkspaceLayoutProvider } from "../src/app/providers/mobile-workspace-layout-provider";
import { MOBILE_WORKSPACE_LAYOUT_PREFERENCE_KEY } from "../src/app/providers/mobile-workspace-layout-provider";
import {
  MOBILE_ACCENT_PREFERENCE_KEY,
  MOBILE_FONT_SCALE_PREFERENCE_KEY,
} from "../src/design/mobile-appearance-preferences";
import { MOBILE_THEME_PREFERENCE_KEY } from "../src/design/mobile-theme-runtime";
import { redesignAppearancePreview } from "../src/design/palette";
import { lightTheme } from "../src/design/themes";
import { activeMobileCopy } from "../src/locale/mobile-locale-preferences";

const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

async function renderScreen(onBack: () => void = jest.fn()) {
  const view = render(
    <MobileThemeProvider>
      <MobileLocaleProvider>
        <MobileWorkspaceLayoutProvider>
          <MobileAppearanceSettingsScreen onBack={onBack} />
        </MobileWorkspaceLayoutProvider>
      </MobileLocaleProvider>
    </MobileThemeProvider>,
  );
  await waitFor(() => expect(mockGetItem).toHaveBeenCalledWith(MOBILE_THEME_PREFERENCE_KEY));
  return view;
}

describe("4c appearance settings screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
  });

  it("renders every canonical 4c section from real preference state", async () => {
    const view = await renderScreen();

    expect(view.getByTestId("mobile-appearance-settings-screen")).toBeTruthy();
    expect(view.getByText(activeMobileCopy.appearanceSettingsTitle)).toBeTruthy();
    expect(view.getByText(activeMobileCopy.appearanceSettingsSubtitle)).toBeTruthy();
    expect(view.getByText(activeMobileCopy.appearanceSettingsThemeHeading)).toBeTruthy();
    expect(view.getByText(activeMobileCopy.appearanceSettingsAccentHeading)).toBeTruthy();
    expect(view.getByText(activeMobileCopy.appearanceSettingsLayoutHeading)).toBeTruthy();
    expect(view.getByText(activeMobileCopy.appearanceSettingsTextSizeHeading)).toBeTruthy();
    expect(view.getByTestId("mobile-appearance-settings-theme-light")).toBeTruthy();
    expect(view.getByTestId("mobile-appearance-settings-theme-dark")).toBeTruthy();
    expect(view.getByTestId("mobile-appearance-settings-theme-system")).toBeTruthy();
    expect(view.getByTestId("mobile-appearance-settings-layout-rail")).toBeTruthy();
    expect(view.getByTestId("mobile-appearance-settings-layout-compact")).toBeTruthy();
    for (const accent of ["indigo", "violet", "blue", "green", "pink", "amber"]) {
      expect(view.getByTestId(`mobile-appearance-settings-accent-${accent}`)).toBeTruthy();
    }
  });

  it("applies and persists a theme selection immediately", async () => {
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId("mobile-appearance-settings-theme-dark"));

    await waitFor(() =>
      expect(mockSetItem).toHaveBeenCalledWith(MOBILE_THEME_PREFERENCE_KEY, "dark"),
    );
    expect(
      view.getByTestId("mobile-appearance-settings-theme-dark").props.accessibilityState.checked,
    ).toBe(true);
    expect(
      view.getByTestId("mobile-appearance-settings-theme-system").props.accessibilityState.checked,
    ).toBe(false);
  });

  it("repaints the accent token tree when a swatch is selected", async () => {
    const view = await renderScreen();
    const railBefore = StyleSheet.flatten(
      view.getByTestId("mobile-appearance-settings-layout-rail").props.style,
    );
    expect(railBefore.borderColor).toBe(lightTheme.accent.default);

    await fireEvent.press(view.getByTestId("mobile-appearance-settings-accent-violet"));

    await waitFor(() =>
      expect(mockSetItem).toHaveBeenCalledWith(MOBILE_ACCENT_PREFERENCE_KEY, "violet"),
    );
    await waitFor(() => {
      const railAfter = StyleSheet.flatten(
        view.getByTestId("mobile-appearance-settings-layout-rail").props.style,
      );
      expect(railAfter.borderColor).toBe("#8B5CF6");
    });
    expect(
      view.getByTestId("mobile-appearance-settings-accent-violet").props.accessibilityState.checked,
    ).toBe(true);
  });

  it("switches the workspace layout preference without leaving the screen", async () => {
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId("mobile-appearance-settings-layout-compact"));

    await waitFor(() =>
      expect(mockSetItem).toHaveBeenCalledWith(MOBILE_WORKSPACE_LAYOUT_PREFERENCE_KEY, "compact"),
    );
    expect(
      view.getByTestId("mobile-appearance-settings-layout-compact").props.accessibilityState
        .checked,
    ).toBe(true);
    expect(view.getByTestId("mobile-appearance-settings-screen")).toBeTruthy();
  });

  it("moves the font-scale slider through its five steps and live-previews the result", async () => {
    const view = await renderScreen();
    const slider = view.getByTestId("mobile-appearance-settings-font-scale-slider");
    expect(slider.props.accessibilityValue).toMatchObject({ max: 4, min: 0, now: 2 });
    await fireEvent(slider, "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });

    await waitFor(() =>
      expect(mockSetItem).toHaveBeenCalledWith(MOBILE_FONT_SCALE_PREFERENCE_KEY, "3"),
    );
    await waitFor(() =>
      expect(
        view.getByTestId("mobile-appearance-settings-font-scale-slider").props.accessibilityValue
          .now,
      ).toBe(3),
    );
  });

  it("hydrates stored preferences on mount", async () => {
    mockGetItem.mockImplementation((key) => {
      if (key === MOBILE_THEME_PREFERENCE_KEY) return Promise.resolve("dark");
      if (key === MOBILE_ACCENT_PREFERENCE_KEY) return Promise.resolve("green");
      if (key === MOBILE_FONT_SCALE_PREFERENCE_KEY) return Promise.resolve("0");
      if (key === MOBILE_WORKSPACE_LAYOUT_PREFERENCE_KEY) return Promise.resolve("compact");
      return Promise.resolve(null);
    });
    const view = await renderScreen();

    await waitFor(() =>
      expect(
        view.getByTestId("mobile-appearance-settings-theme-dark").props.accessibilityState.checked,
      ).toBe(true),
    );
    expect(
      view.getByTestId("mobile-appearance-settings-accent-green").props.accessibilityState.checked,
    ).toBe(true);
    expect(
      view.getByTestId("mobile-appearance-settings-layout-compact").props.accessibilityState
        .checked,
    ).toBe(true);
    expect(
      view.getByTestId("mobile-appearance-settings-font-scale-slider").props.accessibilityValue.now,
    ).toBe(0);
  });

  it("routes the back action to the caller", async () => {
    const onBack = jest.fn();
    const view = await renderScreen(onBack);

    await fireEvent.press(view.getByTestId("mobile-appearance-settings-back"));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("locks the 4c geometry to the canonical handoff measurements", () => {
    const styles = createMobileAppearanceSettingsStyles(lightTheme);

    expect(styles.back).toMatchObject({ height: 44, width: 44 });
    expect(styles.backVisual).toMatchObject({ borderRadius: 14, height: 40, width: 40 });
    expect(styles.title).toMatchObject({ fontSize: 22, letterSpacing: -0.44 });
    expect(styles.subtitle).toMatchObject({ fontSize: 12.5 });
    expect(styles.sectionHeading).toMatchObject({
      fontSize: 11.5,
      letterSpacing: 1.38,
      paddingBottom: 8,
      paddingHorizontal: 24,
      paddingTop: 18,
    });
    expect(styles.optionRow).toMatchObject({ gap: 10, paddingHorizontal: 20 });
    expect(styles.optionCard).toMatchObject({
      backgroundColor: lightTheme.surface.card,
      borderColor: lightTheme.border.subtle,
      borderRadius: 20,
      borderWidth: 1,
      gap: 8,
      padding: 10,
    });
    expect(styles.optionCardSelected).toMatchObject({
      borderColor: lightTheme.accent.default,
      borderWidth: 2,
      padding: 9,
    });
    expect(styles.themePreview).toMatchObject({ borderRadius: 13, gap: 4, height: 64, padding: 8 });
    expect(styles.previewTitleBar).toMatchObject({ height: 7, opacity: 0.85, width: "60%" });
    expect(styles.previewMutedBar).toMatchObject({ height: 6, width: "85%" });
    expect(styles.previewAccentBar).toMatchObject({
      backgroundColor: lightTheme.accent.default,
      height: 6,
      width: "45%",
    });
    expect(styles.themePreviewDark).toMatchObject({
      backgroundColor: redesignAppearancePreview.darkSurface,
    });
    expect(styles.previewAccentBarDark).toMatchObject({
      backgroundColor: redesignAppearancePreview.darkAccentBar,
    });
    expect(styles.optionCheck).toMatchObject({
      backgroundColor: lightTheme.accent.default,
      height: 16,
      width: 16,
    });
    expect(styles.accentCard).toMatchObject({
      borderRadius: 20,
      gap: 12,
      marginHorizontal: 20,
      paddingHorizontal: 16,
      paddingVertical: 14,
    });
    expect(styles.accentSwatchTarget).toMatchObject({ height: 44, width: 44 });
    expect(styles.accentSwatch).toMatchObject({ borderRadius: 19, height: 38, width: 38 });
    expect(styles.accentSwatchSelected).toMatchObject({
      borderColor: lightTheme.surface.card,
      borderWidth: 3,
    });
    expect(styles.accentSwatchRing).toMatchObject({ borderWidth: 2.5, height: 43, width: 43 });
    expect(styles.layoutPreview).toMatchObject({ borderRadius: 13, height: 88 });
    expect(styles.layoutRail).toMatchObject({ gap: 4, paddingVertical: 6, width: 18 });
    expect(styles.layoutRailDot).toMatchObject({ borderRadius: 4, height: 9, width: 9 });
    expect(styles.layoutRailDotActive).toMatchObject({
      backgroundColor: lightTheme.accent.default,
    });
    expect(styles.layoutPreviewBody).toMatchObject({ gap: 5, padding: 8 });
    expect(styles.layoutPreviewTitleBar).toMatchObject({ height: 7, opacity: 0.8, width: "70%" });
    expect(styles.layoutPreviewBarWide).toMatchObject({ height: 6, width: "90%" });
    expect(styles.layoutPreviewBarNarrow).toMatchObject({ height: 6, width: "60%" });
    expect(styles.layoutTabBar).toMatchObject({ gap: 8, height: 16 });
    expect(styles.layoutTabDot).toMatchObject({ borderRadius: 3, height: 8, width: 8 });
    expect(styles.textSizeCard).toMatchObject({
      borderRadius: 20,
      gap: 14,
      marginHorizontal: 20,
      paddingHorizontal: 18,
      paddingVertical: 16,
    });
    expect(styles.textSizeSmall).toMatchObject({ fontSize: 12 });
    expect(styles.textSizeLarge).toMatchObject({ fontSize: 19 });
    expect(styles.sliderTouch).toMatchObject({ minHeight: 44 });
    expect(styles.sliderTrack).toMatchObject({ borderRadius: 3, height: 6 });
    expect(styles.sliderThumb).toMatchObject({
      borderColor: lightTheme.accent.default,
      borderRadius: 11,
      borderWidth: 2,
      height: 22,
      width: 22,
    });
  });
});
