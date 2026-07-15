import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

jest.mock("react-native-webview", () => ({
  WebView: (props: Record<string, unknown>) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, props);
  },
}));

jest.mock("../src/config/environment", () => ({
  getMobileRuntimeConfig: jest.fn(),
}));

import { getMobileRuntimeConfig } from "../src/config/environment";
import { AuthLoginScreen } from "../src/app/screens/auth/auth-login-screen";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { lightTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";

const mockedRuntimeConfig = jest.mocked(getMobileRuntimeConfig);
const copy = mobileCopy.tr;

type SignInInput = {
  email: string;
  password: string;
  turnstileToken: string;
  twoFactorCode?: string;
};

function setPublicTurnstileSiteKey() {
  mockedRuntimeConfig.mockReturnValue({
    apiUrl: "http://localhost:3000",
    environment: "development",
    releaseChannel: "development",
    sentryDsn: null,
    socketUrl: "http://localhost:3000",
    turnstileSiteKey: "public-site-key",
    webUrl: "http://localhost:3000",
  });
}

function renderLogin(props?: Partial<React.ComponentProps<typeof AuthLoginScreen>>) {
  return render(
    <MobileThemeProvider>
      <MobileLocaleProvider>
        <AuthLoginScreen
          developmentCredentials={props?.developmentCredentials}
          onBack={props?.onBack ?? jest.fn()}
          onForgotPassword={props?.onForgotPassword ?? jest.fn()}
          onOpenWebSignIn={props?.onOpenWebSignIn ?? jest.fn()}
          onRegister={props?.onRegister ?? jest.fn()}
          onSignIn={
            props?.onSignIn ??
            jest.fn<Promise<{ ok: true }>, [SignInInput]>().mockResolvedValue({ ok: true })
          }
        />
      </MobileLocaleProvider>
    </MobileThemeProvider>,
  );
}

async function fillValidCredentials(view: Awaited<ReturnType<typeof render>>) {
  await fireEvent.changeText(view.getByTestId("mobile-auth-login-email-input"), " User@Example.COM ");
  await fireEvent.changeText(view.getByTestId("mobile-auth-login-password-input"), "safe-password");
  await waitFor(() =>
    expect(view.getByTestId("mobile-auth-login-email-input").props.value).toBe(" User@Example.COM "),
  );
  await waitFor(() =>
    expect(view.getByTestId("mobile-auth-login-password-input").props.value).toBe("safe-password"),
  );
}

async function completeTurnstile(
  view: Awaited<ReturnType<typeof render>>,
  token = "verified-turnstile-token",
) {
  await act(async () => {
    view.getByTestId("mobile-auth-login-turnstile-webview").props.onMessage({
      nativeEvent: { data: JSON.stringify({ token, type: "success" }) },
    });
  });
}

describe("AuthLoginScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPublicTurnstileSiteKey();
  });

  it("fails locally for empty required credentials without dispatching sign-in", async () => {
    const onSignIn = jest.fn<Promise<{ ok: true }>, [SignInInput]>().mockResolvedValue({ ok: true });
    const view = await renderLogin({ onSignIn });

    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));

    expect(await view.findByText(copy.authNativeMissingFields)).toBeTruthy();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it("normalizes before rejecting an invalid email without dispatching sign-in", async () => {
    const onSignIn = jest.fn<Promise<{ ok: true }>, [SignInInput]>().mockResolvedValue({ ok: true });
    const view = await renderLogin({ onSignIn });

    await fireEvent.changeText(view.getByTestId("mobile-auth-login-email-input"), "invalid-email");
    await fireEvent.changeText(view.getByTestId("mobile-auth-login-password-input"), "safe-password");
    await waitFor(() =>
      expect(view.getByTestId("mobile-auth-login-email-input").props.value).toBe("invalid-email"),
    );
    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));

    expect(await view.findByText(copy.authNativeInvalidEmail)).toBeTruthy();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it("fails closed when valid credentials have no verified Turnstile token", async () => {
    const onSignIn = jest.fn<Promise<{ ok: true }>, [SignInInput]>().mockResolvedValue({ ok: true });
    const view = await renderLogin({ onSignIn });

    await fillValidCredentials(view);
    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));

    expect(await view.findByText(copy.authTurnstileError)).toBeTruthy();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it("accepts a clean real-WebView Turnstile success and sends only normalized credentials", async () => {
    const onSignIn = jest.fn<Promise<{ ok: true }>, [SignInInput]>().mockResolvedValue({ ok: true });
    const view = await renderLogin({ onSignIn });

    await fillValidCredentials(view);
    await completeTurnstile(view);
    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));

    await waitFor(() =>
      expect(onSignIn).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "safe-password",
        turnstileToken: "verified-turnstile-token",
      }),
    );
  });

  it("reveals two-factor recovery after a required response and includes a trimmed code only then", async () => {
    const onSignIn = jest
      .fn<Promise<{ message: string; ok: false; requiresTwoFactor: true } | { ok: true }>, [SignInInput]>()
      .mockResolvedValueOnce({ message: "2FA is required for this account.", ok: false, requiresTwoFactor: true })
      .mockResolvedValueOnce({ ok: true });
    const view = await renderLogin({ onSignIn });

    await fillValidCredentials(view);
    await completeTurnstile(view);
    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));

    expect(await view.findByText("2FA is required for this account.")).toBeTruthy();
    expect(view.getByTestId("mobile-auth-login-two-factor-code-input")).toBeTruthy();

    await fireEvent.changeText(view.getByTestId("mobile-auth-login-two-factor-code-input"), "  123456  ");
    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));

    await waitFor(() =>
      expect(onSignIn).toHaveBeenLastCalledWith({
        email: "user@example.com",
        password: "safe-password",
        turnstileToken: "verified-turnstile-token",
        twoFactorCode: "123456",
      }),
    );
  });

  it("disables repeated sign-in presses while the current request is pending", async () => {
    let resolveSignIn!: (value: { ok: true }) => void;
    const pendingSignIn = new Promise<{ ok: true }>((resolve) => {
      resolveSignIn = resolve;
    });
    const onSignIn = jest.fn<Promise<{ ok: true }>, [SignInInput]>().mockReturnValue(pendingSignIn);
    const view = await renderLogin({ onSignIn });

    await fillValidCredentials(view);
    await completeTurnstile(view);
    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));
    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));

    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("mobile-auth-login-submit").props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true, disabled: true }),
    );

    await act(async () => {
      resolveSignIn({ ok: true });
      await pendingSignIn;
    });
  });

  it("renders only the supported Google web handoff", async () => {
    const onOpenWebSignIn = jest.fn();
    const view = await renderLogin({ onOpenWebSignIn });

    await fireEvent.press(view.getByTestId("mobile-auth-social-google"));

    expect(onOpenWebSignIn).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId("mobile-auth-social-microsoft")).toBeNull();
    expect(view.queryByTestId("mobile-auth-social-apple")).toBeNull();
    expect(view.queryByTestId("mobile-auth-social-whispr")).toBeNull();
  });

  it("keeps the forgot action in the password label row", async () => {
    const view = await renderLogin();

    expect(view.getByTestId("mobile-auth-login-forgot-password").parent).toBe(
      view.getByText(copy.authNativePasswordLabel).parent,
    );
  });

  it("groups the 2FA backup control and local remember checkbox together", async () => {
    const view = await renderLogin();

    expect(view.getByTestId("mobile-auth-login-two-factor-link").parent).toBe(
      view.getByTestId("mobile-auth-login-remember-me").parent,
    );
    expect(
      view.getByTestId("mobile-auth-login-two-factor-icon", {
        includeHiddenElements: true,
      }).props.children,
    ).toBe("shield-checkmark-outline");
  });

  it("uses the semantic accent presentation for the Google provider icon", async () => {
    const view = await renderLogin();

    expect(
      view.getByTestId("mobile-auth-social-google-icon", {
        includeHiddenElements: true,
      }).props.color,
    ).toBe(lightTheme.accent.default);
  });

  it("keeps profile selection presentation-only and excludes it from the sign-in payload", async () => {
    const onSignIn = jest.fn<Promise<{ ok: true }>, [SignInInput]>().mockResolvedValue({ ok: true });
    const view = await renderLogin({ onSignIn });

    await fireEvent.press(view.getByTestId("mobile-auth-login-profile-option-gamer"));
    expect(view.getByTestId("mobile-auth-login-profile-option-gamer").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );

    await fillValidCredentials(view);
    await completeTurnstile(view);
    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));

    await waitFor(() => expect(onSignIn).toHaveBeenCalledTimes(1));
    expect(Object.keys(onSignIn.mock.calls[0]![0])).toEqual([
      "email",
      "password",
      "turnstileToken",
    ]);
  });

  it("fills development credentials only after an explicit press and clears prior form feedback", async () => {
    const view = await renderLogin({
      developmentCredentials: {
        email: "dev@example.com",
        password: "development-password",
      },
    });

    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));
    expect(await view.findByText(copy.authNativeMissingFields)).toBeTruthy();
    expect(view.getByTestId("mobile-auth-login-email-input").props.value).toBe("");
    expect(view.getByTestId("mobile-auth-login-password-input").props.value).toBe("");

    await fireEvent.press(view.getByTestId("mobile-auth-login-fill-dev-credentials"));

    await waitFor(() =>
      expect(view.getByTestId("mobile-auth-login-email-input").props.value).toBe("dev@example.com"),
    );
    expect(view.getByTestId("mobile-auth-login-password-input").props.value).toBe("development-password");
    expect(view.queryByText(copy.authNativeMissingFields)).toBeNull();
    expect(view.getByText(copy.authNativeDevCredentialsFilled)).toBeTruthy();
  });

  it("does not render the development credential action without a container-supplied value", async () => {
    const view = await renderLogin();

    expect(view.queryByTestId("mobile-auth-login-fill-dev-credentials")).toBeNull();
  });
});
