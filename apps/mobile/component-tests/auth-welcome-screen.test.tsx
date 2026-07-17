import AsyncStorage from "@react-native-async-storage/async-storage";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import * as ReactNative from "react-native";
import { StyleSheet } from "react-native";
import { SafeAreaProvider, type EdgeInsets } from "react-native-safe-area-context";
import {
  ReduceMotion,
  useReducedMotion,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import {
  AUTH_WELCOME_TITLE_GRADIENT_COLORS,
  AuthWelcomeScreen,
} from "../src/app/screens/auth/auth-welcome-screen";
import {
  AUTH_WELCOME_BACKGROUND_DARK_SPEC,
  AUTH_WELCOME_BACKGROUND_SPEC,
} from "../src/app/components/kit/auth/auth-welcome-background";
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

    await waitFor(() => expect(mockGetItem).toHaveBeenCalledWith(MOBILE_THEME_PREFERENCE_KEY));

    expect(
      StyleSheet.flatten(view.getByTestId("mobile-auth-welcome-screen").props.style),
    ).toMatchObject({
      backgroundColor: surface,
    });
  });

  it("renders the 2a four-layer lavender background from the canonical 390 by 844 reference", async () => {
    const view = await renderWelcome();
    const tree = view.toJSON() as RenderedNode | readonly RenderedNode[] | null;

    expect(findNodeByTestId(tree, "mobile-auth-welcome-screen-canonical-background-light")).toBeTruthy();
    expect(view.queryByTestId("mobile-auth-welcome-screen-glow-top")).toBeNull();
    expect(view.queryByTestId("mobile-auth-welcome-screen-glow-bottom")).toBeNull();
    expect(view.queryByTestId("mobile-auth-welcome-screen-dot")).toBeNull();
    expect(AUTH_WELCOME_BACKGROUND_SPEC).toEqual({
      canvas: { height: 844, width: 390 },
      dotGrid: {
        color: "#4F46E5",
        opacity: 0.1,
        radius: 1.2,
        spacing: 26,
      },
      linearGradient: {
        angle: 165,
        stops: [
          { color: "#F5F2FC", offset: 0 },
          { color: "#EDEFFC", offset: 0.55 },
          { color: "#F7F3FB", offset: 1 },
        ],
      },
      radialGradients: [
        {
          center: { x: 0.15, y: 0.08 },
          color: "#A78BFA",
          transparentAt: 0.45,
        },
        {
          center: { x: 0.9, y: 0.35 },
          color: "#60A5FA",
          transparentAt: 0.42,
        },
      ],
    });
  });

  it("preserves the canonical dot grid with dark-appropriate paint after switching to dark mode", async () => {
    const view = await renderWelcome();

    await fireEvent.press(view.getByTestId("mobile-auth-welcome-theme-dark"));
    await waitFor(() =>
      expect(
        findNodeByTestId(
          view.toJSON() as RenderedNode | readonly RenderedNode[] | null,
          "mobile-auth-welcome-screen-canonical-background-dark",
        ),
      ).toBeTruthy(),
    );
    expect(AUTH_WELCOME_BACKGROUND_DARK_SPEC).toEqual({
      canvas: { height: 844, width: 390 },
      dotGrid: {
        color: "#A5A8F5",
        opacity: 0.16,
        radius: 1.2,
        spacing: 26,
      },
      linearGradient: {
        angle: 135,
        stops: [
          { color: "#070B18", offset: 0 },
          { color: "#10182D", offset: 0.48 },
          { color: "#151028", offset: 1 },
        ],
      },
      radialGradients: [
        {
          center: { x: 0.72, y: 0.1 },
          color: "#6A4DFF",
          transparentAt: 0.31,
        },
        {
          center: { x: 0.13, y: 0.24 },
          color: "#3F6BFF",
          transparentAt: 0.33,
        },
      ],
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

  it("renders the exact web brand card and animated five-bar waveform", async () => {
    const view = await renderWelcome();
    const tree = view.toJSON() as RenderedNode | readonly RenderedNode[] | null;
    const brandMark = findNodeByTestId(tree, "mobile-auth-welcome-brand-mark");
    const brandSurface = findNodeByTestId(tree, "mobile-auth-welcome-brand-surface");
    const brandCard = findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-card");
    const firstBar = findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-animated-bar-1");
    const secondBar = findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-animated-bar-2");
    const thirdBar = findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-animated-bar-3");
    const fourthBar = findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-animated-bar-4");
    const fifthBar = findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-animated-bar-5");

    expect(brandMark).toBeTruthy();
    expect(brandMark?.props).toMatchObject({ height: 52, width: 52 });
    expect(resolvePressableStyle(brandSurface?.props?.style)).toEqual(
      expect.objectContaining({
        height: 52,
        shadowColor: "#4360FF",
        shadowOffset: { height: 16, width: 0 },
        shadowOpacity: 0.24,
        shadowRadius: 34,
        width: 52,
      }),
    );
    expect(brandCard?.props).toMatchObject({
      fill: { brushRef: "mobile-auth-welcome-brand-mark-surface-gradient" },
      height: 52,
      rx: 13,
      width: 52,
    });
    expect(firstBar?.props).toMatchObject({
      height: 17,
      rx: 1.5,
      width: 3,
      x: 12.5,
      y: 17.5,
    });
    expect(secondBar?.props).toMatchObject({
      height: 25,
      rx: 1.5,
      width: 3,
      x: 18.5,
      y: 13.5,
    });
    expect(thirdBar?.props).toMatchObject({
      height: 34,
      rx: 1.5,
      width: 3,
      x: 24.5,
      y: 9,
    });
    expect(fourthBar?.props).toMatchObject({
      height: 24,
      rx: 1.5,
      width: 3,
      x: 30.5,
      y: 14,
    });
    expect(fifthBar?.props).toMatchObject({
      height: 18,
      rx: 1.5,
      width: 3,
      x: 36.5,
      y: 17,
    });
  });

  it("does not render a flat white top-edge line above the animated waveform", async () => {
    const brandMarkSource = readFileSync(
      join(process.cwd(), "src/app/screens/auth/auth-welcome-brand-mark.tsx"),
      "utf8",
    );

    expect(brandMarkSource).not.toContain(
      '<Rect fill="#FFFFFF" fillOpacity={0.42} height={1} rx={0.5} width={50} x={1} y={0.5} />',
    );
  });

  it("keeps the canonical waveform animated when motion is reduced", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const view = await renderWelcome();
    const tree = view.toJSON() as RenderedNode | readonly RenderedNode[] | null;

    expect(findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-animated-bar-1")?.props).toMatchObject({
      height: 17,
      width: 3,
    });
    expect(findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-animated-bar-5")?.props).toMatchObject({
      height: 18,
      width: 3,
    });
    expect(findNodeByTestId(tree, "mobile-auth-welcome-brand-mark-static-bar-1")).toBeNull();
    expect(jest.mocked(withTiming).mock.calls).not.toHaveLength(0);
    expect(
      jest
        .mocked(withTiming)
        .mock.calls.every(([, config]) => config?.reduceMotion === ReduceMotion.Never),
    ).toBe(true);
    expect(
      jest
        .mocked(withDelay)
        .mock.calls.every(([, , reduceMotion]) => reduceMotion === ReduceMotion.Never),
    ).toBe(true);
    expect(
      jest
        .mocked(withRepeat)
        .mock.calls.every(([, , , , reduceMotion]) => reduceMotion === ReduceMotion.Never),
    ).toBe(true);
    expect(
      jest
        .mocked(withSequence)
        .mock.calls.every(([reduceMotion]) => reduceMotion === ReduceMotion.Never),
    ).toBe(true);
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
