import AsyncStorage from "@react-native-async-storage/async-storage";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import * as ReactNative from "react-native";
import { StyleSheet } from "react-native";
import { SafeAreaProvider, type EdgeInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "react-native-reanimated";

import {
  AUTH_WELCOME_TITLE_GRADIENT_COLORS,
  AuthWelcomeScreen,
} from "../src/app/screens/auth/auth-welcome-screen";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MOBILE_THEME_PREFERENCE_KEY } from "../src/design/mobile-theme-runtime";
import { lightTheme, darkTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";

const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

let mockSystemScheme: ReactNative.ColorSchemeName = "light";

const zeroInsets: EdgeInsets = { bottom: 0, left: 0, right: 0, top: 0 };

function renderWelcome(
  props?: Partial<React.ComponentProps<typeof AuthWelcomeScreen>>,
  insets: EdgeInsets = zeroInsets,
) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 844, width: 390, x: 0, y: 0 },
        insets,
      }}
    >
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <AuthWelcomeScreen
            onOpenLanguagePicker={props?.onOpenLanguagePicker ?? jest.fn()}
            onSignIn={props?.onSignIn ?? jest.fn()}
            onSignUp={props?.onSignUp ?? jest.fn()}
          />
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </SafeAreaProvider>,
  );
}

function resolvePressableStyle(style: unknown) {
  if (typeof style === "function") {
    return StyleSheet.flatten(style({ focused: false, hovered: false, pressed: false }));
  }

  return StyleSheet.flatten(style);
}

type RenderedNode = {
  readonly children?: readonly RenderedNode[] | null;
  readonly props?: Readonly<Record<string, unknown>>;
};

function findNodeByTestId(node: RenderedNode | readonly RenderedNode[] | null, testID: string) {
  if (!node) {
    return null;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findNodeByTestId(child, testID);
      if (match) {
        return match;
      }
    }

    return null;
  }

  if (node.props?.testID === testID) {
    return node;
  }

  return findNodeByTestId(node.children ?? null, testID);
}

describe("AuthWelcomeScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useReducedMotion).mockReturnValue(false);
    mockSystemScheme = "light";
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    jest.spyOn(ReactNative, "useColorScheme").mockImplementation(() => mockSystemScheme);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ["light", lightTheme.surface.base],
    ["dark", darkTheme.surface.base],
  ] as const)("uses the %s system surface as its root background", async (scheme, surface) => {
    mockSystemScheme = scheme;
    const view = await renderWelcome();

    await waitFor(() => expect(mockGetItem).toHaveBeenCalledTimes(1));

    expect(
      StyleSheet.flatten(view.getByTestId("mobile-auth-welcome-screen").props.style),
    ).toMatchObject({
      backgroundColor: surface,
    });
  });

  it("calls each welcome action exactly once", async () => {
    const onSignIn = jest.fn();
    const onSignUp = jest.fn();
    const view = await renderWelcome({ onSignIn, onSignUp });

    await fireEvent.press(view.getByTestId("mobile-auth-welcome-sign-in"));
    await fireEvent.press(view.getByTestId("mobile-auth-welcome-sign-up"));

    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(onSignUp).toHaveBeenCalledTimes(1);
  });

  it("switches themes through the real preference provider and persists each selection", async () => {
    const view = await renderWelcome();

    await fireEvent.press(view.getByTestId("mobile-auth-welcome-theme-dark"));
    await waitFor(() =>
      expect(
        StyleSheet.flatten(view.getByTestId("mobile-auth-welcome-screen").props.style),
      ).toMatchObject({
        backgroundColor: darkTheme.surface.base,
      }),
    );
    await waitFor(() =>
      expect(mockSetItem).toHaveBeenLastCalledWith(MOBILE_THEME_PREFERENCE_KEY, "dark"),
    );

    await fireEvent.press(view.getByTestId("mobile-auth-welcome-theme-light"));
    await waitFor(() =>
      expect(
        StyleSheet.flatten(view.getByTestId("mobile-auth-welcome-screen").props.style),
      ).toMatchObject({
        backgroundColor: lightTheme.surface.base,
      }),
    );
    await waitFor(() =>
      expect(mockSetItem).toHaveBeenLastCalledWith(MOBILE_THEME_PREFERENCE_KEY, "light"),
    );
  });

  it("opens the locale picker once", async () => {
    const onOpenLanguagePicker = jest.fn();
    const view = await renderWelcome({ onOpenLanguagePicker });

    await fireEvent.press(view.getByTestId("mobile-auth-language-picker"));

    expect(onOpenLanguagePicker).toHaveBeenCalledTimes(1);
  });

  it("does not render an unverified system-health status", async () => {
    const view = await renderWelcome();

    expect(view.queryByText("Tüm sistemler aktif")).toBeNull();
    expect(view.queryByText("All systems active")).toBeNull();
  });

  it("renders the canonical animated five-bar Whispr waveform", async () => {
    const view = await renderWelcome();
    const tree = view.toJSON() as RenderedNode | readonly RenderedNode[] | null;
    const brandMark = findNodeByTestId(tree, "mobile-auth-welcome-brand-mark");
    const firstBar = findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-animated-bar-1");
    const secondBar = findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-animated-bar-2");
    const thirdBar = findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-animated-bar-3");
    const fourthBar = findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-animated-bar-4");
    const fifthBar = findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-animated-bar-5");

    expect(brandMark).toBeTruthy();
    expect(firstBar?.props).toMatchObject({
      height: 8.5,
      rx: 1.3,
      width: 2.4,
      x: 3.6,
      y: 7.75,
    });
    expect(secondBar?.props).toMatchObject({
      height: 12.5,
      rx: 1.3,
      width: 2.4,
      x: 6.8,
      y: 5.75,
    });
    expect(thirdBar?.props).toMatchObject({
      height: 17,
      rx: 1.3,
      width: 2.4,
      x: 10,
      y: 3.5,
    });
    expect(fourthBar?.props).toMatchObject({
      height: 12,
      rx: 1.3,
      width: 2.4,
      x: 13.2,
      y: 6,
    });
    expect(fifthBar?.props).toMatchObject({
      height: 9,
      rx: 1.3,
      width: 2.4,
      x: 16.4,
      y: 7.5,
    });
  });

  it("renders the same five bars without animated wrappers when motion is reduced", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const view = await renderWelcome();
    const tree = view.toJSON() as RenderedNode | readonly RenderedNode[] | null;

    expect(findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-static-bar-1")?.props).toMatchObject({
      height: 8.5,
      width: 2.4,
    });
    expect(findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-static-bar-5")?.props).toMatchObject({
      height: 9,
      width: 2.4,
    });
    expect(findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-animated-bar-1")).toBeNull();
  });

  it("renders every copy-backed feature chip and welcome-sized CTAs", async () => {
    const view = await renderWelcome();
    const copy = mobileCopy.tr;

    [
      copy.authWelcomeFeatureEncryption,
      copy.authWelcomeFeatureRealtime,
      copy.authWelcomeFeatureCommunity,
      copy.authWelcomeFeatureFileShare,
      copy.authWelcomeFeatureVoice,
    ].forEach((label) => expect(view.getByText(label)).toBeTruthy());

    expect(
      resolvePressableStyle(view.getByTestId("mobile-auth-welcome-sign-in").props.style),
    ).toMatchObject({
      borderRadius: 28,
      height: 56,
    });
    expect(
      resolvePressableStyle(view.getByTestId("mobile-auth-welcome-sign-up").props.style),
    ).toMatchObject({
      borderRadius: 28,
      height: 56,
    });
  });

  it("uses safe insets and the canonical two-stop gradient for the second hero line", async () => {
    const view = await renderWelcome(undefined, { bottom: 34, left: 0, right: 0, top: 47 });
    const tree = view.toJSON() as RenderedNode | readonly RenderedNode[] | null;

    expect(
      StyleSheet.flatten(view.getByTestId("mobile-auth-welcome-layout").props.style),
    ).toMatchObject({
      paddingBottom: 34,
      paddingTop: 47,
    });
    expect(AUTH_WELCOME_TITLE_GRADIENT_COLORS).toEqual(["#7C6CF6", "#4F9CF6"]);
    expect(findNodeByTestId(tree, "mobile-auth-welcome-hero-title-gradient")).toBeTruthy();
  });

  it("uses the compact 2a control heights instead of generic 44dp touch-target visuals", async () => {
    const view = await renderWelcome();

    expect(
      resolvePressableStyle(view.getByTestId("mobile-auth-welcome-theme-light").props.style),
    ).not.toHaveProperty("minHeight");
    expect(
      resolvePressableStyle(view.getByTestId("mobile-auth-language-picker").props.style),
    ).toMatchObject({ height: 35 });
    expect(view.getByTestId("mobile-auth-welcome-theme-light").props.hitSlop).toBe(9);
    expect(view.getByTestId("mobile-auth-language-picker").props.hitSlop).toBe(5);
  });
});
