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

jest.mock("../src/app/screens/auth/auth-welcome-screen", () => {
  const ReactRuntime = require("react");
  const { Pressable, View } = require("react-native");

  return {
    AuthWelcomeScreen: ({ onOpenLanguagePicker, onSignIn, onSignUp }: any) =>
      ReactRuntime.createElement(
        View,
        { testID: "mobile-auth-welcome-screen" },
        ReactRuntime.createElement(Pressable, { onPress: onSignIn, testID: "mobile-auth-welcome-sign-in" }),
        ReactRuntime.createElement(Pressable, { onPress: onSignUp, testID: "mobile-auth-welcome-sign-up" }),
        ReactRuntime.createElement(Pressable, {
          onPress: onOpenLanguagePicker,
          testID: "mobile-auth-language-picker",
        }),
      ),
  };
});

const LOGIN_INPUT = {
  email: "login@example.com",
  password: "password-123",
  turnstileToken: "login-token",
};
const REGISTER_INPUT = {
  confirmPassword: "password-123",
  email: "register@example.com",
  password: "password-123",
  turnstileToken: "register-token",
  username: "register_user",
};
const RESET_INPUT = { email: "reset@example.com" };

jest.mock("../src/app/screens/auth/auth-login-screen", () => {
  const ReactRuntime = require("react");
  const { Pressable, Text, View } = require("react-native");

  return {
    AuthLoginScreen: ({ developmentCredentials, onBack, onForgotPassword, onOpenWebSignIn, onRegister, onSignIn }: any) =>
      ReactRuntime.createElement(
        View,
        { testID: "mobile-auth-login-screen" },
        ReactRuntime.createElement(
          Text,
          { testID: "mobile-auth-login-development-credentials" },
          developmentCredentials ? "available" : "absent",
        ),
        ReactRuntime.createElement(Pressable, { onPress: onBack, testID: "mobile-auth-login-back" }),
        ReactRuntime.createElement(Pressable, {
          onPress: onForgotPassword,
          testID: "mobile-auth-login-forgot-password",
        }),
        ReactRuntime.createElement(Pressable, {
          onPress: onOpenWebSignIn,
          testID: "mobile-auth-login-web-sign-in",
        }),
        ReactRuntime.createElement(Pressable, { onPress: onRegister, testID: "mobile-auth-login-register" }),
        ReactRuntime.createElement(Pressable, {
          onPress: () =>
            void onSignIn({
              email: "login@example.com",
              password: "password-123",
              turnstileToken: "login-token",
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
        ReactRuntime.createElement(Pressable, { onPress: onBack, testID: "mobile-auth-register-back" }),
        ReactRuntime.createElement(Pressable, { onPress: onSignIn, testID: "mobile-auth-register-sign-in" }),
        ReactRuntime.createElement(Pressable, {
          onPress: () =>
            void onRegister({
              confirmPassword: "password-123",
              email: "register@example.com",
              password: "password-123",
              turnstileToken: "register-token",
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
import { MobileLocaleProvider, useMobileLocaleRuntime } from "../src/app/providers/mobile-locale-provider";
import { MobileAuthNavigator } from "../src/navigation/mobile-auth-navigator";

const mockedUseMobileAuth = jest.mocked(useMobileAuth);
const mockedGetMobileDevLoginCredentials = jest.mocked(getMobileDevLoginCredentials);

const auth = {
  openWebSignIn: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  registerWithPassword: jest.fn<Promise<{ email: string; ok: true }>, [typeof REGISTER_INPUT]>().mockResolvedValue({
    email: REGISTER_INPUT.email,
    ok: true,
  }),
  requestPasswordReset: jest.fn<Promise<{ email: string; ok: true }>, [typeof RESET_INPUT]>().mockResolvedValue({
    email: RESET_INPUT.email,
    ok: true,
  }),
  signInWithPassword: jest.fn<Promise<{ ok: true }>, [typeof LOGIN_INPUT]>().mockResolvedValue({ ok: true }),
};

function MobileLocaleProbe() {
  const { locale } = useMobileLocaleRuntime();
  return <Text testID="mobile-auth-locale-probe">{locale}</Text>;
}

async function renderNavigator(reason: "auth-required" | "checking" = "auth-required") {
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

  it("starts on Welcome and uses the exact typed auth route names", async () => {
    const view = await renderNavigator();

    expect(view.getByTestId("mobile-auth-welcome-screen")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-auth-welcome-sign-in"));
    expect(view.getByTestId("mobile-auth-login-screen")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-auth-login-back"));
    await waitFor(() => expect(view.getByTestId("mobile-auth-welcome-screen")).toBeTruthy());
    await fireEvent.press(view.getByTestId("mobile-auth-welcome-sign-up"));
    expect(view.getByTestId("mobile-auth-register-screen")).toBeTruthy();
  });

  it("maps login, registration, and reset actions to the existing auth context without changing payloads", async () => {
    const view = await renderNavigator();

    await fireEvent.press(view.getByTestId("mobile-auth-welcome-sign-in"));
    await fireEvent.press(view.getByTestId("mobile-auth-login-web-sign-in"));
    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));
    await fireEvent.press(view.getByTestId("mobile-auth-login-forgot-password"));
    await fireEvent.press(view.getByTestId("mobile-auth-forgot-submit"));
    await fireEvent.press(view.getByTestId("mobile-auth-forgot-back-to-sign-in"));
    await fireEvent.press(view.getByTestId("mobile-auth-login-register"));
    await fireEvent.press(view.getByTestId("mobile-auth-register-submit"));

    expect(auth.openWebSignIn).toHaveBeenCalledTimes(1);
    expect(auth.signInWithPassword).toHaveBeenCalledWith(LOGIN_INPUT);
    expect(auth.requestPasswordReset).toHaveBeenCalledWith(RESET_INPUT);
    expect(auth.registerWithPassword).toHaveBeenCalledWith(REGISTER_INPUT);
  });

  it("renders the session-checking surface without mounting Welcome", async () => {
    const view = await renderNavigator("checking");

    expect(view.getByTestId("mobile-auth-session-checking")).toBeTruthy();
    expect(view.queryByTestId("mobile-auth-welcome-screen")).toBeNull();
  });

  it("opens the welcome language sheet, applies the selected locale, and closes it", async () => {
    const view = await renderNavigator();

    await fireEvent.press(view.getByTestId("mobile-auth-language-picker"));
    expect(view.getByTestId("mobile-auth-language-sheet")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("English"));

    await waitFor(() => expect(view.getByTestId("mobile-auth-locale-probe").props.children).toBe("en"));
    await waitFor(() => expect(view.queryByTestId("mobile-auth-language-sheet")).toBeNull());
  });

  it("passes development credentials to Login only when the helper returns them", async () => {
    mockedGetMobileDevLoginCredentials.mockReturnValue({
      email: "dev@example.com",
      password: "development-password",
    });
    const view = await renderNavigator();

    await fireEvent.press(view.getByTestId("mobile-auth-welcome-sign-in"));
    expect(view.getByTestId("mobile-auth-login-development-credentials").props.children).toBe("available");

    mockedGetMobileDevLoginCredentials.mockReturnValue(null);
    await fireEvent.press(view.getByTestId("mobile-auth-login-back"));
    await fireEvent.press(view.getByTestId("mobile-auth-welcome-sign-in"));
    expect(view.getByTestId("mobile-auth-login-development-credentials").props.children).toBe("absent");
  });
});
