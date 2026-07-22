import React, { type ReactElement } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaProvider, type EdgeInsets } from "react-native-safe-area-context";
import { describe, expect, it, jest } from "@jest/globals";
import { render } from "@testing-library/react-native";

import { AuthForgotPasswordScreen } from "../src/app/screens/auth/auth-forgot-password-screen";
import { AuthLoginScreen } from "../src/app/screens/auth/auth-login-screen";
import { AuthRegisterScreen } from "../src/app/screens/auth/auth-register-screen";
import { AuthWelcomeScreen } from "../src/app/screens/auth/auth-welcome-screen";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { mobileSpacing } from "../src/design/tokens";
import { lightTheme } from "../src/design/themes";

/** What Android reports for a device switched to three-button navigation. */
const threeButtonInsets: EdgeInsets = { bottom: 48, left: 0, right: 0, top: 42 };
/** What the same device reports on gesture navigation. */
const gestureInsets: EdgeInsets = { bottom: 16, left: 0, right: 0, top: 42 };

function renderAuthScreen(ui: ReactElement, insets: EdgeInsets) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { height: 844, width: 390, x: 0, y: 0 }, insets }}>
      <MobileThemeProvider>
        <MobileLocaleProvider>{ui}</MobileLocaleProvider>
      </MobileThemeProvider>
    </SafeAreaProvider>,
  );
}

function bodyPaddingBottom(view: ReturnType<typeof render>, testID: string) {
  return (
    StyleSheet.flatten(view.getByTestId(`${testID}-body`).props.style as never) as {
      paddingBottom?: number;
    }
  ).paddingBottom;
}

const loginScreen = (
  <AuthLoginScreen
    onBack={jest.fn()}
    onForgotPassword={jest.fn()}
    onRegister={jest.fn()}
    onSignIn={jest.fn<never, never>().mockResolvedValue({ ok: true } as never) as never}
    onSocialSignIn={
      jest.fn<never, never>().mockResolvedValue({ ok: true, via: "in-app" } as never) as never
    }
  />
);

const registerScreen = (
  <AuthRegisterScreen
    onBack={jest.fn()}
    onRegister={jest.fn<never, never>().mockResolvedValue({ ok: true } as never) as never}
    onSignIn={jest.fn()}
  />
);

const forgotPasswordScreen = (
  <AuthForgotPasswordScreen
    onBack={jest.fn()}
    onRequestPasswordReset={
      jest
        .fn<never, never>()
        .mockResolvedValue({ email: "user@example.com", ok: true } as never) as never
    }
  />
);

const welcomeScreen = (
  <AuthWelcomeScreen onOpenLanguagePicker={jest.fn()} onSignIn={jest.fn()} onSignUp={jest.fn()} />
);

describe("auth screens on Android three-button navigation", () => {
  it.each([
    ["mobile-auth-login-screen", loginScreen],
    ["mobile-auth-register-screen", registerScreen],
    ["mobile-auth-forgot-password-screen", forgotPasswordScreen],
  ])("lifts %s above the navigation bar", async (testID, screen) => {
    const view = await renderAuthScreen(screen, threeButtonInsets);

    // The layout already pays the design spacing, so only the remainder is added
    // and the total lands exactly on the reported inset.
    expect(bodyPaddingBottom(view, testID)).toBe(threeButtonInsets.bottom - mobileSpacing.section);
  });

  it.each([
    ["mobile-auth-login-screen", loginScreen],
    ["mobile-auth-register-screen", registerScreen],
    ["mobile-auth-forgot-password-screen", forgotPasswordScreen],
  ])("leaves %s untouched on gesture navigation", async (testID, screen) => {
    const view = await renderAuthScreen(screen, gestureInsets);

    expect(bodyPaddingBottom(view, testID)).toBe(0);
  });

  it("keeps the welcome screen's pinned CTA block as the single owner of its bottom edge", async () => {
    const view = await renderAuthScreen(welcomeScreen, threeButtonInsets);

    expect(bodyPaddingBottom(view, "mobile-auth-welcome-screen")).toBeUndefined();
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-auth-welcome-layout").props.style as never),
    ).toMatchObject({ paddingBottom: threeButtonInsets.bottom });
  });

  it("keeps the welcome screen on its design spacing in gesture navigation", async () => {
    const view = await renderAuthScreen(welcomeScreen, gestureInsets);

    expect(
      StyleSheet.flatten(view.getByTestId("mobile-auth-welcome-layout").props.style as never),
    ).toMatchObject({ paddingBottom: lightTheme.layout.auth.welcomeCtaBottomPadding });
  });
});
