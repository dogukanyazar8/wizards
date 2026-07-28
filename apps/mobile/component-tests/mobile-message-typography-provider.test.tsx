import React from "react";
import { PixelRatio, Pressable, Text, View } from "react-native";
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
import {
  MobileThemeProvider,
  useMobileAppearancePreferences,
  useMobileMessageBodyStyle,
  useTheme,
} from "../src/app/providers/mobile-theme-provider";
import {
  MOBILE_MESSAGE_COMPACT_PREFERENCE_KEY,
  MOBILE_MESSAGE_FOLLOW_SYSTEM_PREFERENCE_KEY,
  MOBILE_MESSAGE_FONT_SIZE_PREFERENCE_KEY,
} from "../src/design/mobile-appearance-preferences";

const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

/**
 * Mirrors how a real message row composes: the frozen sheet values first, then
 * the hook's inline style. Anything that must stay fixed (clock, author, the
 * composer) is rendered from `theme.typography`, so the same render proves the
 * preference reaches the body and nothing else.
 */
function MessageTypographyProbe() {
  const theme = useTheme();
  const dmBody = useMobileMessageBodyStyle("dm");
  const channelBody = useMobileMessageBodyStyle("channel");
  const { messageCompact, messageFontSize, setMessageCompact, setMessageFontSize } =
    useMobileAppearancePreferences();

  return (
    <View>
      <Text style={[{ fontSize: 14, lineHeight: 20 }, dmBody]} testID="dm-body">
        body
      </Text>
      <Text style={[{ fontSize: 14 }, channelBody]} testID="channel-body">
        body
      </Text>
      <Text style={{ fontSize: 10.5 }} testID="bubble-clock">
        09:41
      </Text>
      <Text style={theme.typography.title} testID="screen-title">
        ogi_uat
      </Text>
      <Text style={{ fontSize: 14 }} testID="composer-placeholder">
        Mesaj yaz
      </Text>
      <Text testID="preference-state">{`${messageFontSize}:${String(messageCompact)}`}</Text>
      <Pressable onPress={() => setMessageFontSize("xlarge")} testID="pick-xlarge">
        <Text>xlarge</Text>
      </Pressable>
      <Pressable onPress={() => setMessageCompact(true)} testID="pick-compact">
        <Text>compact</Text>
      </Pressable>
    </View>
  );
}

function flattenFontSize(element: { props: { style: unknown } }): number | undefined {
  const styles = Array.isArray(element.props.style) ? element.props.style : [element.props.style];
  return styles.reduce<number | undefined>((resolved, entry) => {
    const candidate = (entry as { fontSize?: number } | null | undefined)?.fontSize;
    return candidate === undefined ? resolved : candidate;
  }, undefined);
}

function flattenLineHeight(element: { props: { style: unknown } }): number | undefined {
  const styles = Array.isArray(element.props.style) ? element.props.style : [element.props.style];
  return styles.reduce<number | undefined>((resolved, entry) => {
    const candidate = (entry as { lineHeight?: number } | null | undefined)?.lineHeight;
    return candidate === undefined ? resolved : candidate;
  }, undefined);
}

describe("mobile message typography provider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
  });

  it("renders the default step and leaves fixed text alone", async () => {
    const view = await render(
      <MobileThemeProvider>
        <MessageTypographyProbe />
      </MobileThemeProvider>,
    );

    expect(flattenFontSize(view.getByTestId("dm-body"))).toBe(15);
    expect(flattenLineHeight(view.getByTestId("dm-body"))).toBe(21.3);
    expect(flattenFontSize(view.getByTestId("channel-body"))).toBe(15);
    expect(flattenLineHeight(view.getByTestId("channel-body"))).toBe(21.75);
    expect(flattenFontSize(view.getByTestId("bubble-clock"))).toBe(10.5);
  });

  it("moves the body in the same render as the preference, and nothing else", async () => {
    const view = await render(
      <MobileThemeProvider>
        <MessageTypographyProbe />
      </MobileThemeProvider>,
    );

    const titleSizeBefore = flattenFontSize(view.getByTestId("screen-title"));
    const clockSizeBefore = flattenFontSize(view.getByTestId("bubble-clock"));
    const composerSizeBefore = flattenFontSize(view.getByTestId("composer-placeholder"));

    await fireEvent.press(view.getByTestId("pick-xlarge"));

    // No reload, no waitFor on the storage write: the size is already there.
    expect(flattenFontSize(view.getByTestId("dm-body"))).toBe(18);
    expect(flattenLineHeight(view.getByTestId("dm-body"))).toBe(25.2);
    expect(flattenFontSize(view.getByTestId("channel-body"))).toBe(18);
    expect(flattenFontSize(view.getByTestId("screen-title"))).toBe(titleSizeBefore);
    expect(flattenFontSize(view.getByTestId("bubble-clock"))).toBe(clockSizeBefore);
    expect(flattenFontSize(view.getByTestId("composer-placeholder"))).toBe(composerSizeBefore);
    await waitFor(() => {
      expect(mockSetItem).toHaveBeenCalledWith(MOBILE_MESSAGE_FONT_SIZE_PREFERENCE_KEY, "xlarge");
    });
  });

  it("tightens line height only when compact layout is on", async () => {
    const view = await render(
      <MobileThemeProvider>
        <MessageTypographyProbe />
      </MobileThemeProvider>,
    );

    await fireEvent.press(view.getByTestId("pick-compact"));

    expect(flattenFontSize(view.getByTestId("dm-body"))).toBe(15);
    expect(flattenLineHeight(view.getByTestId("dm-body"))).toBe(20.1);
    expect(flattenLineHeight(view.getByTestId("channel-body"))).toBe(20.4);
    await waitFor(() => {
      expect(mockSetItem).toHaveBeenCalledWith(MOBILE_MESSAGE_COMPACT_PREFERENCE_KEY, "true");
    });
  });

  it("restores all three stored preferences and clamps the OS scale", async () => {
    const fontScaleSpy = jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(1.5);
    mockGetItem.mockImplementation((key: string) =>
      Promise.resolve(
        key === MOBILE_MESSAGE_FONT_SIZE_PREFERENCE_KEY
          ? "xlarge"
          : key === MOBILE_MESSAGE_FOLLOW_SYSTEM_PREFERENCE_KEY
            ? "true"
            : key === MOBILE_MESSAGE_COMPACT_PREFERENCE_KEY
              ? "false"
              : null,
      ),
    );

    const view = await render(
      <MobileThemeProvider>
        <MessageTypographyProbe />
      </MobileThemeProvider>,
    );

    await waitFor(() => {
      expect(view.getByTestId("preference-state").props.children).toBe("xlarge:false");
    });
    // 18px at a 1.5x device scale is 27px, clamped to the 22px ceiling.
    expect(flattenFontSize(view.getByTestId("dm-body"))).toBe(22);
    // The fixed text never sees the device scale either.
    expect(flattenFontSize(view.getByTestId("bubble-clock"))).toBe(10.5);
    fontScaleSpy.mockRestore();
  });
});
