import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { MobileAppearanceSettingsScreen } from "../src/app/screens/mobile-appearance-settings-screen";
import { createMobileAppearanceSettingsStyles } from "../src/app/screens/mobile-appearance-settings-screen.styles";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobileWorkspaceLayoutProvider } from "../src/app/providers/mobile-workspace-layout-provider";
import { MOBILE_THEME_PREFERENCE_KEY } from "../src/design/mobile-theme-runtime";

const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;
import { MOBILE_MESSAGE_FONT_SIZES } from "../src/design/mobile-message-typography";
import { darkTheme, lightTheme } from "../src/design/themes";
import { activeMobileCopy } from "../src/locale/mobile-locale-preferences";

/** RNTL 14 renders asynchronously; every caller must await this. */
async function renderScreen() {
  const view = render(
    <MobileThemeProvider>
      <MobileLocaleProvider>
        <MobileWorkspaceLayoutProvider>
          <MobileAppearanceSettingsScreen onBack={() => {}} />
        </MobileWorkspaceLayoutProvider>
      </MobileLocaleProvider>
    </MobileThemeProvider>,
  );
  await waitFor(() => expect(mockGetItem).toHaveBeenCalledWith(MOBILE_THEME_PREFERENCE_KEY));
  return view;
}

describe("MSG-1i appearance settings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
  });

  /**
   * K6 is the whole point of this wave: the screen is rebuilt in the redesign's
   * language *without losing a single existing option*. This test is the guard
   * against a future edit quietly dropping a section the design mock omits.
   */
  it("keeps all eight sections, in the K6 order", async () => {
    const view = await renderScreen();
    const copy = activeMobileCopy;

    // 1 theme · 2 voice room · 3 server layout · 4 accent · 5 message size ·
    // 6 interface size · 7 toggles · 8 footer note.
    expect(view.getByText(copy.appearanceSettingsThemeHeading)).toBeTruthy();
    expect(view.getByText(copy.appearanceSettingsVoiceRoomHeading)).toBeTruthy();
    expect(view.getByText(copy.appearanceSettingsAccentHeading)).toBeTruthy();
    expect(view.getByText(copy.appearanceSettingsMessageFontSizeHeading)).toBeTruthy();
    expect(view.getByText(copy.appearanceSettingsTextSizeHeading)).toBeTruthy();
    expect(view.getByText(copy.appearanceSettingsLayoutHeading)).toBeTruthy();
    expect(view.getByText(copy.appearanceSettingsCompactTitle)).toBeTruthy();
    expect(view.getByText(copy.appearanceSettingsFollowSystemTitle)).toBeTruthy();
    expect(view.getByText(copy.appearanceSettingsMessageFontSizeNote)).toBeTruthy();

    // Every pre-existing control is still reachable.
    for (const mode of ["light", "dark", "system"]) {
      expect(view.getByTestId(`mobile-appearance-settings-theme-${mode}`)).toBeTruthy();
      expect(view.getByTestId(`mobile-appearance-settings-voice-${mode}`)).toBeTruthy();
    }
    for (const accent of ["indigo", "violet", "blue", "green", "pink", "amber"]) {
      expect(view.getByTestId(`mobile-appearance-settings-accent-${accent}`)).toBeTruthy();
    }
    expect(view.getByTestId("mobile-appearance-settings-layout-rail")).toBeTruthy();
    expect(view.getByTestId("mobile-appearance-settings-layout-compact")).toBeTruthy();
    expect(view.getByTestId("mobile-appearance-settings-font-scale-slider")).toBeTruthy();
  });

  /**
   * `getByText` above proves the groups exist, not where. This pins the order,
   * which is the whole point of the reshuffle: the two canvas pickers and the
   * server layout above, then the colour, then the two size controls with the
   * toggles that qualify them directly underneath.
   */
  it("paints the groups and the theme columns in their canonical order", async () => {
    const view = await renderScreen();
    const copy = activeMobileCopy;
    // toJSON walks the tree depth-first, so a substring's position in the
    // serialised output is its position on the screen.
    const tree = JSON.stringify(view.toJSON());
    // Quoted, so a short label like "Tema" cannot match inside a longer string.
    const at = (needle: string) => {
      const index = tree.indexOf(JSON.stringify(needle));
      expect(index).toBeGreaterThan(-1);
      return index;
    };

    const groups = [
      copy.appearanceSettingsThemeHeading,
      copy.appearanceSettingsVoiceRoomHeading,
      copy.appearanceSettingsLayoutHeading,
      copy.appearanceSettingsAccentHeading,
      copy.appearanceSettingsMessageFontSizeHeading,
      copy.appearanceSettingsTextSizeHeading,
      copy.appearanceSettingsCompactTitle,
      copy.appearanceSettingsFollowSystemTitle,
      copy.appearanceSettingsMessageFontSizeNote,
    ].map(at);
    expect(groups).toEqual([...groups].sort((left, right) => left - right));

    // Both pickers read light · dark · system, so a column means the same
    // thing in each.
    for (const group of ["theme", "voice"]) {
      const columns = ["light", "dark", "system"].map((mode) =>
        at(`mobile-appearance-settings-${group}-${mode}`),
      );
      expect(columns).toEqual([...columns].sort((left, right) => left - right));
    }
  });

  /**
   * The two size controls sit six lines apart on one screen. Without a line
   * under each heading saying what it does and does not touch, they read as
   * duplicates — so the disambiguating copy is part of the contract.
   */
  it("tells the message-body size and the interface size apart", async () => {
    const view = await renderScreen();
    const copy = activeMobileCopy;

    expect(copy.appearanceSettingsMessageFontSizeHeading).not.toBe(
      copy.appearanceSettingsTextSizeHeading,
    );
    expect(view.getByText(copy.appearanceSettingsMessageFontSizeHint)).toBeTruthy();
    expect(view.getByText(copy.appearanceSettingsTextSizeHint)).toBeTruthy();
    expect(view.getByTestId("mobile-appearance-settings-message-font-slider")).toBeTruthy();
    expect(view.getByTestId("mobile-appearance-settings-font-scale-slider")).toBeTruthy();
  });

  it("shows the live value label and the four stop names", async () => {
    const view = await renderScreen();
    const copy = activeMobileCopy;

    // Default step: medium / 15px, composed from the live body resolver.
    expect(view.getByTestId("mobile-appearance-settings-message-font-value").props.children).toBe(
      `${copy.appearanceSettingsMessageFontSizeMedium} · 15 px`,
    );
    for (const label of [
      copy.appearanceSettingsMessageFontSizeSmall,
      copy.appearanceSettingsMessageFontSizeMedium,
      copy.appearanceSettingsMessageFontSizeLarge,
      copy.appearanceSettingsMessageFontSizeXlarge,
    ]) {
      expect(view.getByText(label)).toBeTruthy();
    }
  });

  /**
   * Criterion 12 / §3.2. The preview exists to show what a chat will look like,
   * so its body must scale and its clock must not. If the clock ever moves off
   * 10.5 it means the size preference leaked past the message body.
   */
  it("scales only the preview body and never the preview clock", async () => {
    const view = await renderScreen();

    const bodyBefore = view.getByTestId("mobile-appearance-settings-preview-body-in");
    const clockBefore = view.getByTestId("mobile-appearance-settings-preview-clock-in");
    const flatten = (node: { props: { style: unknown } }) =>
      [node.props.style].flat(Infinity).filter(Boolean) as Record<string, unknown>[];

    const bodySize = flatten(bodyBefore).find((entry) => "fontSize" in entry)?.fontSize;
    const clockSize = flatten(clockBefore).find((entry) => "fontSize" in entry)?.fontSize;

    expect(bodySize).toBe(15);
    expect(clockSize).toBe(10.5);

    await fireEvent(
      view.getByTestId("mobile-appearance-settings-message-font-slider"),
      "accessibilityAction",
      { nativeEvent: { actionName: "increment" } },
    );

    const bodyAfter = flatten(view.getByTestId("mobile-appearance-settings-preview-body-in")).find(
      (entry) => "fontSize" in entry,
    )?.fontSize;
    const clockAfter = flatten(
      view.getByTestId("mobile-appearance-settings-preview-clock-in"),
    ).find((entry) => "fontSize" in entry)?.fontSize;

    expect(bodyAfter).toBe(16.5);
    // The whole point: the clock did not move with it.
    expect(clockAfter).toBe(10.5);
  });

  it("steps the slider between the four stops rather than taking a free value", async () => {
    const view = await renderScreen();
    const slider = view.getByTestId("mobile-appearance-settings-message-font-slider");

    expect(slider.props.accessibilityRole).toBe("adjustable");
    expect(slider.props.accessibilityValue).toMatchObject({
      max: MOBILE_MESSAGE_FONT_SIZES.length - 1,
      min: 0,
      now: 1,
      text: "medium",
    });

    await fireEvent(slider, "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    expect(
      view.getByTestId("mobile-appearance-settings-message-font-slider").props.accessibilityValue,
    ).toMatchObject({ now: 2, text: "large" });

    await fireEvent(slider, "accessibilityAction", {
      nativeEvent: { actionName: "decrement" },
    });
    expect(
      view.getByTestId("mobile-appearance-settings-message-font-slider").props.accessibilityValue,
    ).toMatchObject({ now: 1, text: "medium" });
  });

  it("clamps the slider at both ends instead of wrapping", async () => {
    const view = await renderScreen();
    const slider = () => view.getByTestId("mobile-appearance-settings-message-font-slider");

    for (let index = 0; index < 5; index += 1) {
      await fireEvent(slider(), "accessibilityAction", {
        nativeEvent: { actionName: "decrement" },
      });
    }
    expect(slider().props.accessibilityValue).toMatchObject({ now: 0, text: "small" });

    for (let index = 0; index < 8; index += 1) {
      await fireEvent(slider(), "accessibilityAction", {
        nativeEvent: { actionName: "increment" },
      });
    }
    expect(slider().props.accessibilityValue).toMatchObject({ now: 3, text: "xlarge" });
  });

  it("ships both toggles off and writes through the shared preference store", async () => {
    const view = await renderScreen();

    const compact = view.getByTestId("mobile-appearance-settings-compact-toggle");
    const followSystem = view.getByTestId("mobile-appearance-settings-follow-system-toggle");
    expect(compact.props.accessibilityState).toMatchObject({ checked: false });
    expect(followSystem.props.accessibilityState).toMatchObject({ checked: false });

    await fireEvent.press(compact);
    expect(
      view.getByTestId("mobile-appearance-settings-compact-toggle").props.accessibilityState,
    ).toMatchObject({ checked: true });
    // M0 owns persistence; the screen must not open a second write path.
    expect(mockSetItem).toHaveBeenCalledWith("whispr.mobile.message-compact", "true");
  });

  it("disables the slider while the system text size owns the value", async () => {
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId("mobile-appearance-settings-follow-system-toggle"));

    const slider = view.getByTestId("mobile-appearance-settings-message-font-slider");
    expect(slider.props.accessibilityState).toMatchObject({ disabled: true });
    // The dim belongs to the whole control — track, both "A" glyphs and the
    // four stop names — so none of it can read as live while the OS owns it.
    const control = view.getByTestId("mobile-appearance-settings-message-size-control");
    expect([control.props.style].flat(Infinity)).toContainEqual(
      expect.objectContaining({ opacity: 0.45 }),
    );
    expect([slider.props.style].flat(Infinity)).not.toContainEqual(
      expect.objectContaining({ opacity: expect.any(Number) }),
    );

    // Stepping is inert while the OS owns the size.
    await fireEvent(slider, "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    expect(
      view.getByTestId("mobile-appearance-settings-message-font-slider").props.accessibilityValue,
    ).toMatchObject({ now: 1 });
  });

  it("locks the 1i card, slider and toggle geometry on both themes", () => {
    for (const theme of [lightTheme, darkTheme]) {
      const styles = createMobileAppearanceSettingsStyles(theme);

      // §2 "1i".4 live preview block.
      expect(styles.messagePreviewBlock).toMatchObject({
        backgroundColor: theme.messaging.screen,
        borderRadius: 18,
        padding: 12,
      });
      // §2 "1i".5 slider: 6px track, 22px thumb, 5px stops.
      expect(styles.messageSliderTrack).toMatchObject({ borderRadius: 3, height: 6 });
      expect(styles.messageSliderThumb).toMatchObject({
        borderWidth: 1.5,
        height: 22,
        width: 22,
      });
      expect(styles.messageSliderStop).toMatchObject({ height: 5, width: 5 });
      // §2 "1i".6 toggle: 46x28 r14 with a 24px thumb.
      expect(styles.toggleTrack).toMatchObject({
        backgroundColor: theme.messaging.toggleOff,
        borderRadius: 14,
        height: 28,
        padding: 2,
        width: 46,
      });
      expect(styles.toggleTrackOn.backgroundColor).toBe(theme.messaging.accent);
      expect(styles.toggleThumb).toMatchObject({ height: 24, width: 24 });
      // §0.5: the in-card divider is inset past the row icon.
      expect(styles.toggleRowDivider).toMatchObject({ height: 1, marginLeft: 69 });
      expect(styles.toggleRow).toMatchObject({ paddingHorizontal: 16, paddingVertical: 14 });
    }
  });
});
