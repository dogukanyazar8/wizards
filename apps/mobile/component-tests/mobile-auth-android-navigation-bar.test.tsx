import React, { type ReactElement } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaProvider, type EdgeInsets } from "react-native-safe-area-context";
import { describe, expect, it, jest } from "@jest/globals";
import { render } from "@testing-library/react-native";

import { AuthBackupCodeScreen } from "../src/app/screens/auth/auth-backup-code-screen";
import { AuthForgotPasswordScreen } from "../src/app/screens/auth/auth-forgot-password-screen";
import { AuthLoginScreen } from "../src/app/screens/auth/auth-login-screen";
import { AuthRegisterScreen } from "../src/app/screens/auth/auth-register-screen";
import { AuthTwoFactorScreen } from "../src/app/screens/auth/auth-two-factor-screen";
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
    onForgotPassword={jest.fn()}
    onOpenLanguagePicker={jest.fn()}
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

const twoFactorScreen = (
  <AuthTwoFactorScreen
    onBackToSignIn={jest.fn()}
    onSubmit={jest.fn<never, never>().mockResolvedValue({ ok: true } as never) as never}
    onUseBackupCode={jest.fn()}
  />
);

const backupCodeScreen = (
  <AuthBackupCodeScreen
    onBackToSignIn={jest.fn()}
    onSubmit={jest.fn<never, never>().mockResolvedValue({ ok: true } as never) as never}
  />
);

describe("auth screens on Android three-button navigation", () => {
  it.each([
    ["mobile-auth-login-screen", loginScreen],
    ["mobile-auth-register-screen", registerScreen],
    ["mobile-auth-forgot-password-screen", forgotPasswordScreen],
    ["mobile-auth-two-factor-screen", twoFactorScreen],
    ["mobile-auth-backup-code-screen", backupCodeScreen],
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
    ["mobile-auth-two-factor-screen", twoFactorScreen],
    ["mobile-auth-backup-code-screen", backupCodeScreen],
  ])("leaves %s untouched on gesture navigation", async (testID, screen) => {
    const view = await renderAuthScreen(screen, gestureInsets);

    expect(bodyPaddingBottom(view, testID)).toBe(0);
  });
});
