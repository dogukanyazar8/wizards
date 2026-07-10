import React, { useState } from "react";
import * as SystemUI from "expo-system-ui";
import * as ReactNative from "react-native";
import { Pressable, Text, View } from "react-native";
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
  useTheme,
  useThemePreference,
  useThemedStyles,
} from "../src/app/providers/mobile-theme-provider";
import { MobileThemeSystemSurfaces } from "../src/app/providers/mobile-theme-system-surfaces";
import { MOBILE_THEME_PREFERENCE_KEY } from "../src/design/mobile-theme-runtime";
import { darkTheme, lightTheme, type MobileTheme } from "../src/design/themes";

const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

let mockSystemScheme: ReactNative.ColorSchemeName = "light";
const renderedStyleReferences: unknown[] = [];

const createProbeStyles = (theme: MobileTheme) => ({
  root: { backgroundColor: theme.surface.base },
});

function ThemeConsumer() {
  const theme = useTheme();
  const { mode, setMode } = useThemePreference();
  const styles = useThemedStyles(createProbeStyles);
  const [renderCount, setRenderCount] = useState(0);
  renderedStyleReferences.push(styles);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setMode("dark")}
        style={styles.root}
        testID="theme-probe"
      >
        <Text>{`${mode}:${theme.id}`}</Text>
      </Pressable>
      <Pressable onPress={() => setRenderCount((value) => value + 1)} testID="rerender-probe">
        <Text>{renderCount}</Text>
      </Pressable>
    </View>
  );
}

async function renderProvider() {
  return render(
    <MobileThemeProvider>
      <ThemeConsumer />
      <MobileThemeSystemSurfaces />
    </MobileThemeProvider>,
  );
}

describe("MobileThemeProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    renderedStyleReferences.length = 0;
    mockSystemScheme = "light";
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    jest
      .spyOn(ReactNative, "useColorScheme")
      .mockImplementation(() => mockSystemScheme);
  });

  it("paints the system theme immediately and hydrates a stored dark preference", async () => {
    let resolveStoredMode: ((value: string | null) => void) | undefined;
    mockGetItem.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStoredMode = resolve;
        }),
    );
    const view = await renderProvider();

    expect(view.getByText("system:light")).toBeTruthy();
    resolveStoredMode?.("dark");
    await waitFor(() => expect(view.getByText("dark:dark")).toBeTruthy());
    expect(mockGetItem).toHaveBeenCalledWith(MOBILE_THEME_PREFERENCE_KEY);
  });

  it.each([
    ["corrupt value", () => Promise.resolve("sepia")],
    ["load failure", () => Promise.reject(new Error("storage unavailable"))],
  ])("fails closed to system on %s", async (_label, load) => {
    mockGetItem.mockImplementationOnce(load);
    const view = await renderProvider();

    await waitFor(() => expect(mockGetItem).toHaveBeenCalledTimes(1));
    expect(view.getByText("system:light")).toBeTruthy();
  });

  it("contains save failures while keeping the selected theme active", async () => {
    mockSetItem.mockRejectedValue(new Error("storage unavailable"));
    const view = await renderProvider();
    await waitFor(() => expect(mockGetItem).toHaveBeenCalledTimes(1));

    await fireEvent.press(view.getByTestId("theme-probe"));

    expect(view.getByText("dark:dark")).toBeTruthy();
    await waitFor(() =>
      expect(mockSetItem).toHaveBeenCalledWith(MOBILE_THEME_PREFERENCE_KEY, "dark"),
    );
  });

  it("does not let late hydration overwrite an explicit user selection", async () => {
    let resolveStoredMode: ((value: string | null) => void) | undefined;
    mockGetItem.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStoredMode = resolve;
        }),
    );
    const view = await renderProvider();

    await fireEvent.press(view.getByTestId("theme-probe"));
    resolveStoredMode?.("light");

    await waitFor(() => expect(view.getByText("dark:dark")).toBeTruthy());
  });

  it("updates root, status, and navigation system surfaces with the semantic theme", async () => {
    const view = await renderProvider();
    await waitFor(() =>
      expect(SystemUI.setBackgroundColorAsync).toHaveBeenCalledWith(lightTheme.surface.base),
    );
    expect(view.getByTestId("mobile-system-status-bar").props.style).toBe("dark");
    expect(view.getByTestId("mobile-system-navigation-bar").props.style).toBe("light");

    await fireEvent.press(view.getByTestId("theme-probe"));

    await waitFor(() =>
      expect(SystemUI.setBackgroundColorAsync).toHaveBeenCalledWith(darkTheme.surface.base),
    );
    expect(view.getByTestId("mobile-system-status-bar").props.style).toBe("light");
    expect(view.getByTestId("mobile-system-navigation-bar").props.style).toBe("dark");
  });

  it("tracks system-scheme updates without remounting children", async () => {
    const view = await renderProvider();
    await waitFor(() => expect(mockGetItem).toHaveBeenCalledTimes(1));
    expect(view.getByText("system:light")).toBeTruthy();

    mockSystemScheme = "dark";
    await view.rerender(
      <MobileThemeProvider>
        <ThemeConsumer />
      </MobileThemeProvider>,
    );

    expect(view.getByText("system:dark")).toBeTruthy();
  });

  it("reuses the registered style object across same-theme rerenders", async () => {
    const view = await renderProvider();
    await waitFor(() => expect(mockGetItem).toHaveBeenCalledTimes(1));
    const before = renderedStyleReferences.at(-1);

    await fireEvent.press(view.getByTestId("rerender-probe"));

    expect(renderedStyleReferences.at(-1)).toBe(before);
  });
});
