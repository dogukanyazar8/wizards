import React, { useState } from "react";
import * as SystemUI from "expo-system-ui";
import * as ReactNative from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { SafeAreaProvider } from "react-native-safe-area-context";

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
  useTheme,
  useThemePreference,
  useThemedStyles,
} from "../src/app/providers/mobile-theme-provider";
import { MobileThemeSystemSurfaces } from "../src/app/providers/mobile-theme-system-surfaces";
import { MobileErrorBoundary } from "../src/app/mobile-error-boundary";
import * as MobileErrorBoundaryModule from "../src/app/mobile-error-boundary";
import { MOBILE_THEME_PREFERENCE_KEY } from "../src/design/mobile-theme-runtime";
import {
  MOBILE_ACCENT_PREFERENCE_KEY,
  MOBILE_FONT_SCALE_PREFERENCE_KEY,
} from "../src/design/mobile-appearance-preferences";
import { darkTheme, lightTheme, type MobileTheme } from "../src/design/themes";
import { activeMobileCopy } from "../src/locale/mobile-locale-preferences";

const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

let mockSystemScheme: ReactNative.ColorSchemeName = "light";
const renderedStyleReferences: unknown[] = [];
let themeConsumerMountCount = 0;

const createProbeStyles = (theme: MobileTheme) => ({
  root: { backgroundColor: theme.surface.base },
});

function ThemeConsumer() {
  const theme = useTheme();
  const { mode, setMode } = useThemePreference();
  const { accent, fontScaleStep, setAccent, setFontScaleStep } = useMobileAppearancePreferences();
  const styles = useThemedStyles(createProbeStyles);
  const [renderCount, setRenderCount] = useState(0);
  renderedStyleReferences.push(styles);
  React.useEffect(() => {
    themeConsumerMountCount += 1;
  }, []);

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
      <Pressable
        accessibilityRole="button"
        onPress={() => setAccent("green")}
        testID="appearance-accent-probe"
      >
        <Text testID="appearance-probe">
          {`${accent}:${fontScaleStep}:${theme.accent.default}:${theme.typography.body.fontSize}`}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => setFontScaleStep(3)}
        testID="appearance-font-scale-probe"
      >
        <Text>Set font scale</Text>
      </Pressable>
    </View>
  );
}

function ThrowingChild(): React.JSX.Element {
  throw new Error("render failed");
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
    themeConsumerMountCount = 0;
    mockSystemScheme = "light";
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    jest.spyOn(ReactNative, "useColorScheme").mockImplementation(() => mockSystemScheme);
  });

  it("paints the system theme immediately and hydrates a stored dark preference", async () => {
    let resolveStoredMode: ((value: string | null) => void) | undefined;
    mockGetItem.mockImplementation((key) =>
      key === MOBILE_THEME_PREFERENCE_KEY
        ? new Promise((resolve) => {
            resolveStoredMode = resolve;
          })
        : Promise.resolve(null),
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
    mockGetItem.mockImplementation((key) =>
      key === MOBILE_THEME_PREFERENCE_KEY ? load() : Promise.resolve(null),
    );
    const view = await renderProvider();

    await waitFor(() => expect(mockGetItem).toHaveBeenCalledWith(MOBILE_THEME_PREFERENCE_KEY));
    expect(view.getByText("system:light")).toBeTruthy();
  });

  it("contains save failures while keeping the selected theme active", async () => {
    mockSetItem.mockRejectedValue(new Error("storage unavailable"));
    const view = await renderProvider();
    await waitFor(() => expect(mockGetItem).toHaveBeenCalledWith(MOBILE_THEME_PREFERENCE_KEY));

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

  it("hydrates and exposes stored accent and font-scale preferences", async () => {
    mockGetItem.mockImplementation((key) => {
      if (key === MOBILE_ACCENT_PREFERENCE_KEY) {
        return Promise.resolve("pink");
      }
      if (key === MOBILE_FONT_SCALE_PREFERENCE_KEY) {
        return Promise.resolve("4");
      }
      return Promise.resolve(null);
    });
    const view = await renderProvider();

    await waitFor(() =>
      expect(view.getByTestId("appearance-probe").props.children).toBe(
        `pink:4:#E0527E:${lightTheme.typography.body.fontSize * 1.15}`,
      ),
    );
    expect(mockGetItem).toHaveBeenCalledWith(MOBILE_ACCENT_PREFERENCE_KEY);
    expect(mockGetItem).toHaveBeenCalledWith(MOBILE_FONT_SCALE_PREFERENCE_KEY);
  });

  it("updates observable appearance preferences and persists explicit changes", async () => {
    const view = await renderProvider();
    await waitFor(() => expect(mockGetItem).toHaveBeenCalledWith(MOBILE_ACCENT_PREFERENCE_KEY));

    await fireEvent.press(view.getByTestId("appearance-accent-probe"));
    await waitFor(() =>
      expect(view.getByTestId("appearance-probe").props.children).toBe(
        `green:2:#22A366:${lightTheme.typography.body.fontSize}`,
      ),
    );
    expect(mockSetItem).toHaveBeenCalledWith(MOBILE_ACCENT_PREFERENCE_KEY, "green");

    await fireEvent.press(view.getByTestId("appearance-font-scale-probe"));
    await waitFor(() =>
      expect(view.getByTestId("appearance-probe").props.children).toBe(
        `green:3:#22A366:${lightTheme.typography.body.fontSize * 1.075}`,
      ),
    );
    expect(mockSetItem).toHaveBeenCalledWith(MOBILE_FONT_SCALE_PREFERENCE_KEY, "3");
  });

  it("does not let late appearance hydration overwrite explicit changes", async () => {
    let resolveStoredAccent: ((value: string | null) => void) | undefined;
    let resolveStoredFontScale: ((value: string | null) => void) | undefined;
    mockGetItem.mockImplementation((key) => {
      if (key === MOBILE_ACCENT_PREFERENCE_KEY) {
        return new Promise((resolve) => {
          resolveStoredAccent = resolve;
        });
      }
      if (key === MOBILE_FONT_SCALE_PREFERENCE_KEY) {
        return new Promise((resolve) => {
          resolveStoredFontScale = resolve;
        });
      }
      return Promise.resolve(null);
    });
    const view = await renderProvider();
    await waitFor(() => expect(mockGetItem).toHaveBeenCalledWith(MOBILE_FONT_SCALE_PREFERENCE_KEY));

    await fireEvent.press(view.getByTestId("appearance-accent-probe"));
    await fireEvent.press(view.getByTestId("appearance-font-scale-probe"));
    resolveStoredAccent?.("blue");
    resolveStoredFontScale?.("0");

    await waitFor(() =>
      expect(view.getByTestId("appearance-probe").props.children).toBe(
        `green:3:#22A366:${lightTheme.typography.body.fontSize * 1.075}`,
      ),
    );
  });

  it("updates root, status, and navigation system surfaces with the semantic theme", async () => {
    const view = await renderProvider();
    await waitFor(() =>
      expect(SystemUI.setBackgroundColorAsync).toHaveBeenCalledWith(lightTheme.surface.base),
    );
    expect(view.getByTestId("mobile-system-status-bar").props.style).toBe("dark");
    // expo-navigation-bar's style names the bar content: a light theme needs dark
    // buttons, or the three-button navigation bar renders invisible over it.
    expect(view.getByTestId("mobile-system-navigation-bar").props.style).toBe("dark");

    await fireEvent.press(view.getByTestId("theme-probe"));

    await waitFor(() =>
      expect(SystemUI.setBackgroundColorAsync).toHaveBeenCalledWith(darkTheme.surface.base),
    );
    expect(view.getByTestId("mobile-system-status-bar").props.style).toBe("light");
    expect(view.getByTestId("mobile-system-navigation-bar").props.style).toBe("light");
  });

  it("keeps the crash fallback on the persisted manual theme", async () => {
    mockGetItem.mockResolvedValue("dark");
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const view = await render(
        <SafeAreaProvider
          initialMetrics={{
            frame: { height: 800, width: 400, x: 0, y: 0 },
            insets: { bottom: 0, left: 0, right: 0, top: 0 },
          }}
        >
          <MobileThemeProvider>
            <MobileErrorBoundary>
              <ThrowingChild />
            </MobileErrorBoundary>
          </MobileThemeProvider>
        </SafeAreaProvider>,
      );

      await waitFor(() => expect(mockGetItem).toHaveBeenCalledWith(MOBILE_THEME_PREFERENCE_KEY));
      await waitFor(() => {
        const fallback = view.getByText(activeMobileCopy.errorBoundaryTitle).parent?.parent;
        expect(fallback?.props.accessibilityRole).toBe("alert");
        expect(StyleSheet.flatten(fallback?.props.style).backgroundColor).toBe(
          darkTheme.surface.base,
        );
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("keeps a system-themed bootstrap fallback outside theme context", async () => {
    const BootstrapBoundary = (
      MobileErrorBoundaryModule as unknown as {
        MobileBootstrapErrorBoundary?: React.ComponentType<{ children: React.ReactNode }>;
      }
    ).MobileBootstrapErrorBoundary;
    expect(BootstrapBoundary).toBeDefined();
    if (!BootstrapBoundary) {
      return;
    }

    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const view = await render(
        <SafeAreaProvider
          initialMetrics={{
            frame: { height: 800, width: 400, x: 0, y: 0 },
            insets: { bottom: 0, left: 0, right: 0, top: 0 },
          }}
        >
          <BootstrapBoundary>
            <ThrowingChild />
          </BootstrapBoundary>
        </SafeAreaProvider>,
      );

      const fallback = view.getByText(activeMobileCopy.errorBoundaryTitle).parent?.parent;
      expect(fallback?.props.accessibilityRole).toBe("alert");
      expect(StyleSheet.flatten(fallback?.props.style).backgroundColor).toBe(
        lightTheme.surface.base,
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("tracks system-scheme updates without remounting children", async () => {
    const view = await renderProvider();
    await waitFor(() => expect(mockGetItem).toHaveBeenCalledWith(MOBILE_THEME_PREFERENCE_KEY));
    expect(view.getByText("system:light")).toBeTruthy();

    mockSystemScheme = "dark";
    await view.rerender(
      <MobileThemeProvider>
        <ThemeConsumer />
      </MobileThemeProvider>,
    );

    expect(view.getByText("system:dark")).toBeTruthy();
    expect(themeConsumerMountCount).toBe(1);
  });

  it("reuses the registered style object across same-theme rerenders", async () => {
    const view = await renderProvider();
    await waitFor(() => expect(mockGetItem).toHaveBeenCalledWith(MOBILE_THEME_PREFERENCE_KEY));
    const before = renderedStyleReferences.at(-1);

    await fireEvent.press(view.getByTestId("rerender-probe"));

    expect(renderedStyleReferences.at(-1)).toBe(before);
  });
});
