import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { NavigationContainer } from "@react-navigation/native";
import { Text } from "react-native";

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: jest.fn(),
}));

jest.mock("../src/auth/mobile-dev-login", () => ({
  getMobileDevLoginCredentials: jest.fn(),
}));

jest.mock("../src/app/screens/auth/auth-language-picker-sheet", () => {
  const ReactRuntime = require("react");
  const { Pressable, View } = require("react-native");

  return {
    AuthLanguagePickerSheet: ({ onClose, onSelectLocale, open }: any) =>
      open
        ? ReactRuntime.createElement(
            View,
            { testID: "mobile-auth-language-sheet" },
            ReactRuntime.createElement(Pressable, {
              onPress: onClose,
              testID: "mobile-auth-language-sheet-backdrop",
            }),
            ReactRuntime.createElement(Pressable, {
              accessibilityLabel: "English",
              onPress: () => {
                onSelectLocale("en");
                onClose();
              },
              testID: "mobile-auth-language-option-en",
            }),
          )
        : null,
  };
});

jest.mock("../src/app/screens/auth/auth-two-factor-screen", () => {
  const ReactRuntime = require("react");
  const { Pressable, View } = require("react-native");

  return {
    AuthTwoFactorScreen: ({ onBackToSignIn, onSubmit, onUseBackupCode }: any) =>
      ReactRuntime.createElement(
        View,
        { testID: "mobile-auth-two-factor-screen" },
        ReactRuntime.createElement(Pressable, {
          onPress: onBackToSignIn,
          testID: "mobile-auth-two-factor-back",
        }),
        ReactRuntime.createElement(Pressable, {
          onPress: onUseBackupCode,
          testID: "mobile-auth-two-factor-backup",
        }),
        ReactRuntime.createElement(Pressable, {
          onPress: () => void onSubmit({ code: "481029", rememberDevice: true }),
          testID: "mobile-auth-two-factor-submit",
        }),
      ),
  };
});

jest.mock("../src/app/screens/auth/auth-backup-code-screen", () => {
  const ReactRuntime = require("react");
  const { Pressable, View } = require("react-native");

  return {
    AuthBackupCodeScreen: ({ onBackToSignIn, onSubmit }: any) =>
      ReactRuntime.createElement(
        View,
        { testID: "mobile-auth-backup-code-screen" },
        ReactRuntime.createElement(Pressable, {
          onPress: onBackToSignIn,
          testID: "mobile-auth-backup-code-back",
        }),
        ReactRuntime.createElement(Pressable, {
          onPress: () => void onSubmit({ backupCode: "A1B2C3D4" }),
          testID: "mobile-auth-backup-code-submit",
        }),
      ),
  };
});

const LOGIN_INPUT = {
  email: "login@example.com",
  password: "password-123",
};
const REGISTER_INPUT = {
  confirmPassword: "password-123",
  displayName: "Register User",
  email: "register@example.com",
  password: "password-123",
  username: "register_user",
};
const RESET_INPUT = { email: "reset@example.com" };

jest.mock("../src/app/screens/auth/auth-login-screen", () => {
  const ReactRuntime = require("react");
  const { Pressable, Text, View } = require("react-native");

  return {
    AuthLoginScreen: ({
      developmentCredentials,
      onForgotPassword,
      onOpenLanguagePicker,
      onRegister,
      onSignIn,
      onSocialSignIn,
    }: any) =>
      ReactRuntime.createElement(
        View,
        { testID: "mobile-auth-login-screen" },
        ReactRuntime.createElement(
          Text,
          { testID: "mobile-auth-login-development-credentials" },
          developmentCredentials ? "available" : "absent",
        ),
        ReactRuntime.createElement(Pressable, {
          onPress: onOpenLanguagePicker,
          testID: "mobile-auth-language-picker",
        }),
        ReactRuntime.createElement(Pressable, {
          onPress: onForgotPassword,
          testID: "mobile-auth-login-forgot-password",
        }),
        ReactRuntime.createElement(Pressable, {
          onPress: () => void onSocialSignIn("google"),
          testID: "mobile-auth-login-social-google",
        }),
        ReactRuntime.createElement(Pressable, {
          onPress: onRegister,
          testID: "mobile-auth-login-register",
        }),
        ReactRuntime.createElement(Pressable, {
          onPress: () =>
            void onSignIn({
              email: "login@example.com",
              password: "password-123",
            }),
          testID: "mobile-auth-login-submit",
        }),
      ),
  };
});

jest.mock("../src/app/screens/auth/auth-register-screen", () => {
  const ReactRuntime = require("react");
  const { Pressable, View } = require("react-native");

  return {
    AuthRegisterScreen: ({ onBack, onRegister, onSignIn }: any) =>
      ReactRuntime.createElement(
        View,
        { testID: "mobile-auth-register-screen" },
        ReactRuntime.createElement(Pressable, {
          onPress: onBack,
          testID: "mobile-auth-register-back",
        }),
        ReactRuntime.createElement(Pressable, {
          onPress: onSignIn,
          testID: "mobile-auth-register-sign-in",
        }),
        ReactRuntime.createElement(Pressable, {
          onPress: () =>
            void onRegister({
              confirmPassword: "password-123",
              displayName: "Register User",
              email: "register@example.com",
              password: "password-123",
              username: "register_user",
            }),
          testID: "mobile-auth-register-submit",
        }),
      ),
  };
});

jest.mock("../src/app/screens/auth/auth-forgot-password-screen", () => {
  const ReactRuntime = require("react");
  const { Pressable, View } = require("react-native");

  return {
    AuthForgotPasswordScreen: ({ onBack, onRequestPasswordReset }: any) =>
      ReactRuntime.createElement(
        View,
        { testID: "mobile-auth-forgot-password-screen" },
        ReactRuntime.createElement(Pressable, {
          onPress: onBack,
          testID: "mobile-auth-forgot-back-to-sign-in",
        }),
        ReactRuntime.createElement(Pressable, {
          onPress: () => void onRequestPasswordReset({ email: "reset@example.com" }),
          testID: "mobile-auth-forgot-submit",
        }),
      ),
  };
});

import { getMobileDevLoginCredentials } from "../src/auth/mobile-dev-login";
import { useMobileAuth } from "../src/auth/mobile-auth-context";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import {
  MobileLocaleProvider,
  useMobileLocaleRuntime,
} from "../src/app/providers/mobile-locale-provider";
import { MobileAuthNavigator } from "../src/navigation/mobile-auth-navigator";

const mockedUseMobileAuth = jest.mocked(useMobileAuth);
const mockedGetMobileDevLoginCredentials = jest.mocked(getMobileDevLoginCredentials);

const TWO_FACTOR_INPUT = {
  challengeId: "challenge-1",
  code: "481029",
  rememberDevice: true,
};
const BACKUP_CODE_INPUT = { backupCode: "A1B2C3D4", challengeId: "challenge-1" };

const auth = {
  completeTwoFactorChallenge: jest
    .fn<Promise<{ ok: true }>, [Record<string, unknown>]>()
    .mockResolvedValue({ ok: true }),
  error: "Oturum güvenli şekilde okunamadı.",
  openWebSignIn: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  startSocialSignIn: jest
    .fn<Promise<{ ok: true; via: "in-app" }>, ["google"]>()
    .mockResolvedValue({ ok: true, via: "in-app" }),
  registerWithPassword: jest
    .fn<Promise<{ email: string; ok: true }>, [typeof REGISTER_INPUT]>()
    .mockResolvedValue({
      email: REGISTER_INPUT.email,
      ok: true,
    }),
  requestPasswordReset: jest
    .fn<Promise<{ email: string; ok: true }>, [typeof RESET_INPUT]>()
    .mockResolvedValue({
      email: RESET_INPUT.email,
      ok: true,
    }),
  refreshSessionFromStorage: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  signInWithPassword: jest
    .fn<Promise<{ ok: true }>, [typeof LOGIN_INPUT]>()
    .mockResolvedValue({ ok: true }),
};

function MobileLocaleProbe() {
  const { locale } = useMobileLocaleRuntime();
  return <Text testID="mobile-auth-locale-probe">{locale}</Text>;
}

async function renderNavigator(
  reason: "auth-required" | "checking" | "session-error" = "auth-required",
) {
  return await render(
    <MobileThemeProvider>
      <MobileLocaleProvider>
        <NavigationContainer>
          <MobileAuthNavigator reason={reason} />
        </NavigationContainer>
        <MobileLocaleProbe />
      </MobileLocaleProvider>
    </MobileThemeProvider>,
  );
}

describe("MobileAuthNavigator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseMobileAuth.mockReturnValue(auth as ReturnType<typeof useMobileAuth>);
    mockedGetMobileDevLoginCredentials.mockReturnValue(null);
  });

  it("starts on Login and uses the exact typed auth route names", async () => {
    const view = await renderNavigator();

    // SPEC-GIRIS-KAYIT §6 — karsilama ekrani K4 ile kaldirildi: yigin kokü Giris.
    expect(view.getByTestId("mobile-auth-login-screen")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-auth-login-register"));
    expect(view.getByTestId("mobile-auth-register-screen")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-auth-register-back"));
    await waitFor(() => expect(view.getByTestId("mobile-auth-login-screen")).toBeTruthy());
    await fireEvent.press(view.getByTestId("mobile-auth-login-forgot-password"));
    expect(view.getByTestId("mobile-auth-forgot-password-screen")).toBeTruthy();
  });

  it("maps login, registration, and reset actions to the existing auth context without changing payloads", async () => {
    const view = await renderNavigator();

    await fireEvent.press(view.getByTestId("mobile-auth-login-social-google"));
    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));
    await fireEvent.press(view.getByTestId("mobile-auth-login-forgot-password"));
    await fireEvent.press(view.getByTestId("mobile-auth-forgot-submit"));
    await fireEvent.press(view.getByTestId("mobile-auth-forgot-back-to-sign-in"));
    await fireEvent.press(view.getByTestId("mobile-auth-login-register"));
    await fireEvent.press(view.getByTestId("mobile-auth-register-submit"));

    expect(auth.startSocialSignIn).toHaveBeenCalledTimes(1);
    expect(auth.startSocialSignIn).toHaveBeenCalledWith("google");
    expect(auth.signInWithPassword).toHaveBeenCalledWith(LOGIN_INPUT);
    expect(auth.requestPasswordReset).toHaveBeenCalledWith(RESET_INPUT);
    expect(auth.registerWithPassword).toHaveBeenCalledWith(REGISTER_INPUT);
  });

  it("renders the session-checking surface without mounting the sign-in stack", async () => {
    const view = await renderNavigator("checking");

    expect(view.getByTestId("mobile-auth-session-checking")).toBeTruthy();
    expect(view.queryByTestId("mobile-auth-login-screen")).toBeNull();
  });

  it("keeps a secure-storage failure off the sign-in stack and offers retry", async () => {
    const view = await renderNavigator("session-error");

    expect(view.getByTestId("mobile-auth-session-error")).toBeTruthy();
    expect(view.queryByTestId("mobile-auth-login-screen")).toBeNull();
    await fireEvent.press(view.getByTestId("mobile-auth-session-retry"));
    expect(auth.refreshSessionFromStorage).toHaveBeenCalledTimes(1);
  });

  it("opens the login language sheet, applies the selected locale, and closes it", async () => {
    const view = await renderNavigator();

    await fireEvent.press(view.getByTestId("mobile-auth-language-picker"));
    expect(view.getByTestId("mobile-auth-language-sheet")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("English"));

    await waitFor(() =>
      expect(view.getByTestId("mobile-auth-locale-probe").props.children).toBe("en"),
    );
    await waitFor(() => expect(view.queryByTestId("mobile-auth-language-sheet")).toBeNull());
  });

  /*
   * Giris artik yigin koku (K4) ve hicbir zaman unmount olmuyor; yardimcinin iki durumu
   * ayni montajda gorulemez, bu yuzden iki ayri temiz montaj olarak dogrulanir.
   */
  it("passes development credentials to Login when the helper returns them", async () => {
    mockedGetMobileDevLoginCredentials.mockReturnValue({
      email: "dev@example.com",
      password: "development-password",
    });
    const view = await renderNavigator();

    expect(view.getByTestId("mobile-auth-login-development-credentials").props.children).toBe(
      "available",
    );
  });

  it("leaves Login without development credentials when the helper returns none", async () => {
    mockedGetMobileDevLoginCredentials.mockReturnValue(null);
    const view = await renderNavigator();

    expect(view.getByTestId("mobile-auth-login-development-credentials").props.children).toBe(
      "absent",
    );
  });

  it("carries the challenge to the two-step route and on to the backup-code route", async () => {
    auth.signInWithPassword.mockResolvedValueOnce({
      challengeId: "challenge-1",
      message: "İki adımlı doğrulama gerekli.",
      ok: false,
      requiresTwoFactor: true,
    } as never);
    const view = await renderNavigator();

    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));
    await waitFor(() => expect(view.getByTestId("mobile-auth-two-factor-screen")).toBeTruthy());

    await fireEvent.press(view.getByTestId("mobile-auth-two-factor-submit"));
    expect(auth.completeTwoFactorChallenge).toHaveBeenCalledWith(TWO_FACTOR_INPUT);

    await fireEvent.press(view.getByTestId("mobile-auth-two-factor-backup"));
    await waitFor(() => expect(view.getByTestId("mobile-auth-backup-code-screen")).toBeTruthy());
    await fireEvent.press(view.getByTestId("mobile-auth-backup-code-submit"));
    expect(auth.completeTwoFactorChallenge).toHaveBeenCalledWith(BACKUP_CODE_INPUT);

    await fireEvent.press(view.getByTestId("mobile-auth-backup-code-back"));
    await waitFor(() => expect(view.getByTestId("mobile-auth-login-screen")).toBeTruthy());
  });

  it("keeps the two-step routes out of reach without a challenge", async () => {
    const view = await renderNavigator();

    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));

    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalled());
    expect(view.queryByTestId("mobile-auth-two-factor-screen")).toBeNull();
    expect(view.queryByTestId("mobile-auth-backup-code-screen")).toBeNull();
  });
});
