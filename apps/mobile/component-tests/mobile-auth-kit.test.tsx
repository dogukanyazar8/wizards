import React from "react";
import { StyleSheet, View } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { darkTheme, lightTheme, type MobileTheme } from "../src/design/themes";

let mockTheme: MobileTheme = lightTheme;

jest.mock("../src/app/providers/mobile-theme-provider", () => ({
  useTheme: () => mockTheme,
  useThemedStyles: (factory: (theme: MobileTheme) => Record<string, object>) => {
    const { StyleSheet } = require("react-native");
    return StyleSheet.create(factory(mockTheme));
  },
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: (props: Record<string, unknown>) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, props);
  },
}));

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
import {
  AuthCheckbox,
  AuthInfoBanner,
  AuthPasswordStrengthRow,
  AuthPrimaryButton,
  AuthProfileTypeSelector,
  AuthScreenBackground,
  AuthSecurityCard,
  AuthSecondaryButton,
  AuthTextField,
  AuthTopBar,
  AuthTurnstileCard,
  isMobileAuthPasswordStrong,
} from "../src/app/components/kit/auth";

const mockedRuntimeConfig = jest.mocked(getMobileRuntimeConfig);

function setTurnstileSiteKey(turnstileSiteKey: string | null) {
  mockedRuntimeConfig.mockReturnValue({
    apiUrl: "http://localhost:3000",
    environment: "development",
    releaseChannel: "development",
    sentryDsn: null,
    socketUrl: "http://localhost:3000",
    turnstileSiteKey,
    webUrl: "http://localhost:3000",
  });
}

function expectIconSize(view: ReturnType<typeof render>, testID: string, size: number) {
  expect(view.getByTestId(testID, { includeHiddenElements: true }).props.size).toBe(size);
}

function flattenPressableStyle(view: ReturnType<typeof render>, testID: string) {
  const style = view.getByTestId(testID).props.style;
  return StyleSheet.flatten(typeof style === "function" ? style({ pressed: false }) : style);
}

for (const theme of [lightTheme, darkTheme]) {
  describe(`${theme.id} mobile auth kit`, () => {
    it("renders a busy primary action without dispatching its press", async () => {
      mockTheme = theme;
      const onPress = jest.fn();
      const view = await render(
        <AuthPrimaryButton busy label="Continue" onPress={onPress} testID="auth-primary-busy" />,
      );

      const button = view.getByTestId("auth-primary-busy");
      await fireEvent.press(button);

      expect(button.props.accessibilityRole).toBe("button");
      expect(button.props.accessibilityState).toEqual(
        expect.objectContaining({ busy: true, disabled: true }),
      );
      expect(
        view.getByTestId("auth-primary-busy-spinner", { includeHiddenElements: true }),
      ).toBeTruthy();
      expect(onPress).not.toHaveBeenCalled();
    });

    it("uses the public errorMessage API and preserves error priority over a focus ring", async () => {
      mockTheme = theme;
      const view = await render(
        <AuthTextField
          errorMessage="Use a stronger password"
          iconName="lock-closed-outline"
          label="Password"
          onChangeText={jest.fn()}
          placeholder="Password"
          secureTextEntry
          testID="auth-password"
          value="secret"
        />,
      );

      const input = view.getByLabelText("Password");
      expect(input.props.secureTextEntry).toBe(true);
      expect(view.getByText("Use a stronger password")).toBeTruthy();
      expect(StyleSheet.flatten(view.getByTestId("auth-password-field").props.style)).toEqual(
        expect.objectContaining({
          borderColor: theme.status.danger,
          borderWidth: theme.layout.border.hairline,
        }),
      );

      await fireEvent.press(view.getByLabelText("Şifreyi göster"));
      expect(view.getByLabelText("Password").props.secureTextEntry).toBe(false);
      expect(view.getByLabelText("Şifreyi gizle")).toBeTruthy();
    });

    it("renders an external semantic focus ring without changing input shell geometry", async () => {
      mockTheme = theme;
      const view = await render(
        <>
          <AuthTextField
            label="Email"
            onChangeText={jest.fn()}
            testID="auth-form-email"
            value=""
          />
          <AuthTextField
            errorMessage="Invalid email"
            label="Invalid email"
            onChangeText={jest.fn()}
            testID="auth-error-email"
            value=""
          />
          <AuthTextField
            label="Register email"
            onChangeText={jest.fn()}
            testID="auth-register-email"
            value=""
            variant="register"
          />
        </>,
      );

      await fireEvent(view.getByLabelText("Email"), "focus");
      await fireEvent(view.getByLabelText("Invalid email"), "focus");

      expect(StyleSheet.flatten(view.getByTestId("auth-form-email-field").props.style)).toEqual(
        expect.objectContaining({
          borderColor: theme.border.focus,
          borderWidth: theme.layout.border.hairline,
          paddingVertical: theme.layout.auth.formInputPaddingVertical,
        }),
      );
      expect(
        StyleSheet.flatten(view.getByTestId("auth-form-email-focus-ring").props.style),
      ).toEqual(
        expect.objectContaining({
          borderColor: theme.border.focusRing,
          borderWidth: theme.layout.auth.focusRingRadius,
          bottom: -theme.layout.auth.focusRingRadius,
          left: -theme.layout.auth.focusRingRadius,
          position: "absolute",
          right: -theme.layout.auth.focusRingRadius,
          top: -theme.layout.auth.focusRingRadius,
        }),
      );
      expect(
        StyleSheet.flatten(view.getByTestId("auth-error-email-field").props.style),
      ).toEqual(
        expect.objectContaining({
          borderColor: theme.status.danger,
          borderWidth: theme.layout.border.hairline,
        }),
      );
      expect(view.queryByTestId("auth-error-email-focus-ring")).toBeNull();
      expect(
        StyleSheet.flatten(view.getByTestId("auth-register-email-field").props.style).paddingVertical,
      ).toBe(theme.layout.auth.inputPaddingVertical);
    });

    it("uses the context-specific auth icon and CTA-gap roles", async () => {
      mockTheme = theme;
      const primaryForm = await render(
        <AuthPrimaryButton
          iconName="arrow-forward"
          label="Continue"
          onPress={jest.fn()}
          testID="auth-primary-form"
        />,
      );
      const primaryWelcome = await render(
        <AuthPrimaryButton
          iconName="arrow-forward"
          label="Continue"
          onPress={jest.fn()}
          testID="auth-primary-welcome"
          variant="welcome"
        />,
      );
      const secondaryWelcome = await render(
        <AuthSecondaryButton
          iconName="person-add-outline"
          label="Create account"
          onPress={jest.fn()}
          testID="auth-secondary-welcome"
          variant="welcome"
        />,
      );
      const fullInput = await render(
        <AuthTextField
          iconName="mail-outline"
          label="Email"
          onChangeText={jest.fn()}
          secureTextEntry
          testID="auth-full-input"
          value=""
        />,
      );
      const compactInput = await render(
        <AuthTextField
          iconName="lock-closed-outline"
          iconSize="compact"
          label="Password"
          onChangeText={jest.fn()}
          secureTextEntry
          testID="auth-compact-input"
          value=""
          variant="register"
        />,
      );
      const topBar = await render(
        <AuthTopBar backAccessibilityLabel="Back" onBack={jest.fn()} testID="auth-top-bar" />,
      );
      const security = await render(<AuthSecurityCard testID="auth-security" />);
      const profile = await render(
        <AuthProfileTypeSelector onChange={jest.fn()} testID="auth-profile-sizes" value="personal" />,
      );
      const passwordHint = await render(
        <AuthPasswordStrengthRow password="weak" testID="auth-password-hint" />,
      );
      const checkbox = await render(
        <AuthCheckbox checked label="Remember me" onPress={jest.fn()} testID="auth-checkbox" />,
      );
      const infoBanner = await render(
        <AuthInfoBanner iconName="information-circle-outline" testID="auth-info" text="Notice" />,
      );

      expect(flattenPressableStyle(primaryForm, "auth-primary-form")).toEqual(
        expect.objectContaining({ gap: theme.layout.auth.ctaContentGap }),
      );
      expect(flattenPressableStyle(secondaryWelcome, "auth-secondary-welcome")).toEqual(
        expect.objectContaining({ gap: theme.layout.auth.ctaContentGap }),
      );
      expectIconSize(primaryForm, "auth-primary-form-icon", theme.layout.auth.formPrimaryActionIcon);
      expectIconSize(primaryWelcome, "auth-primary-welcome-icon", theme.layout.auth.welcomePrimaryActionIcon);
      expectIconSize(secondaryWelcome, "auth-secondary-welcome-icon", theme.layout.auth.welcomeSecondaryActionIcon);
      expectIconSize(fullInput, "auth-full-input-leading-icon", theme.layout.auth.fullInputIcon);
      expectIconSize(fullInput, "auth-full-input-trailing-icon", theme.layout.auth.fullInputIcon);
      expectIconSize(compactInput, "auth-compact-input-leading-icon", theme.layout.auth.compactRegisterPasswordIcon);
      expectIconSize(compactInput, "auth-compact-input-trailing-icon", theme.layout.auth.compactRegisterPasswordIcon);
      expectIconSize(topBar, "auth-top-bar-back-icon", theme.layout.auth.topBarBackIcon);
      expectIconSize(security, "auth-security-shield-icon", theme.layout.auth.securityShieldIcon);
      expectIconSize(security, "auth-security-cloudflare-icon", theme.layout.auth.securityCloudflareIcon);
      expectIconSize(profile, "auth-profile-sizes-option-personal-glyph", theme.layout.auth.profileGlyph);
      expectIconSize(profile, "auth-profile-sizes-option-personal-check", theme.layout.auth.profileCheckGlyph);
      expectIconSize(passwordHint, "auth-password-hint-shield-icon", theme.layout.auth.passwordHintShieldIcon);
      expectIconSize(checkbox, "auth-checkbox-check-icon", theme.layout.auth.checkboxCheckGlyph);
      expectIconSize(infoBanner, "auth-info-icon", theme.layout.auth.infoBannerGlyph);
    });

    it("keeps primary elevation on an unclipped outer touch target", async () => {
      mockTheme = theme;
      const view = await render(
        <AuthPrimaryButton label="Continue" onPress={jest.fn()} testID="auth-primary-shadow" />,
      );

      expect(flattenPressableStyle(view, "auth-primary-shadow")).toEqual(
        expect.objectContaining(theme.elevation.authPrimaryAction),
      );
      expect(flattenPressableStyle(view, "auth-primary-shadow").overflow).not.toBe("hidden");
      expect(
        StyleSheet.flatten(view.getByTestId("auth-primary-shadow-gradient").props.style),
      ).toEqual(
        expect.objectContaining({
          borderRadius: theme.layout.auth.formCtaRadius,
          height: theme.layout.auth.formCtaHeight,
          overflow: "hidden",
        }),
      );
    });

    it("exposes checkbox checked state", async () => {
      mockTheme = theme;
      const onPress = jest.fn();
      const view = await render(
        <AuthCheckbox checked label="Remember me" onPress={onPress} testID="auth-remember" />,
      );

      const checkbox = view.getByTestId("auth-remember");
      await fireEvent.press(checkbox);

      expect(checkbox.props.accessibilityRole).toBe("checkbox");
      expect(checkbox.props.accessibilityState).toEqual(
        expect.objectContaining({ checked: true, disabled: false }),
      );
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("marks only configured preview profiles and exposes the selected state", async () => {
      mockTheme = theme;
      const onChange = jest.fn();
      const view = await render(
        <AuthProfileTypeSelector onChange={onChange} testID="auth-profile" value="personal" />,
      );

      expect(view.getByTestId("auth-profile-option-personal").props.accessibilityState.selected).toBe(
        true,
      );
      expect(view.getByTestId("auth-profile-option-gamer").props.accessibilityState.selected).toBe(
        false,
      );
      expect(view.queryByTestId("auth-profile-preview-personal")).toBeNull();
      expect(view.getByTestId("auth-profile-preview-gamer")).toBeTruthy();
      expect(view.getByTestId("auth-profile-preview-corporate")).toBeTruthy();
      expect(
        StyleSheet.flatten(view.getByTestId("auth-profile-option-personal").props.style),
      ).toEqual(
        expect.objectContaining({
          backgroundColor: theme.accent.soft,
          borderColor: theme.accent.default,
          borderWidth: theme.layout.auth.profileSelectionBorderWidth,
        }),
      );
      expect(
        StyleSheet.flatten(view.getByTestId("auth-profile-preview-gamer").props.style),
      ).toEqual(
        expect.objectContaining({
          position: "absolute",
          right: theme.layout.auth.profilePreviewOffsetRight,
        }),
      );

      await fireEvent.press(view.getByTestId("auth-profile-option-gamer"));
      expect(onChange).toHaveBeenCalledWith("gamer");
    });

    it("renders secondary CTA icons without changing button accessibility", async () => {
      mockTheme = theme;
      const view = await render(
        <AuthSecondaryButton
          iconName="arrow-back"
          label="Back"
          onPress={jest.fn()}
          testID="auth-secondary"
        />,
      );

      expect(view.getByTestId("auth-secondary").props.accessibilityRole).toBe("button");
      expect(view.getByTestId("auth-secondary-icon", { includeHiddenElements: true })).toBeTruthy();
    });

    it("uses exact semantic colors for the live password hint", async () => {
      mockTheme = theme;
      const view = await render(
        <>
          <AuthPasswordStrengthRow password="weak" testID="auth-password-weak" />
          <AuthPasswordStrengthRow password="Ab1!xyzz" testID="auth-password-strong" />
        </>,
      );

      expect(StyleSheet.flatten(view.getByTestId("auth-password-weak-hint").props.style).color).toBe(
        theme.text.placeholder,
      );
      expect(StyleSheet.flatten(view.getByTestId("auth-password-strong-hint").props.style).color).toBe(
        theme.status.success,
      );
    });
  });
}

describe("mobile auth password policy", () => {
  it("requires eight characters with an ASCII letter, digit, and special character", () => {
    expect(isMobileAuthPasswordStrong("Ab1!xyz")).toBe(false);
    expect(isMobileAuthPasswordStrong("Ab1!xyzz")).toBe(true);
    expect(isMobileAuthPasswordStrong("abcdefgh")).toBe(false);
  });
});

describe("mobile auth Turnstile boundary", () => {
  it("fails closed when the runtime site key is unavailable", async () => {
    setTurnstileSiteKey(null);
    const onVerify = jest.fn();
    const view = await render(
      <AuthTurnstileCard action="login" onVerify={onVerify} testID="auth-turnstile" />,
    );

    await waitFor(() => expect(onVerify).toHaveBeenCalledWith(null));
    expect(view.getByTestId("auth-turnstile-error")).toBeTruthy();
    expect(view.queryByTestId("auth-turnstile-webview")).toBeNull();
  });

  it("terminally invalidates every malformed or provider failure message", async () => {
    setTurnstileSiteKey("public-site-key");
    for (const data of [
      "not-json",
      JSON.stringify({ type: "unknown" }),
      JSON.stringify({ type: "error" }),
      JSON.stringify({ type: "expired" }),
    ]) {
      const onVerify = jest.fn();
      const view = await render(
        <AuthTurnstileCard action="register" onVerify={onVerify} testID="auth-turnstile" />,
      );
      const webView = view.getByTestId("auth-turnstile-webview");

      await act(async () => {
        webView.props.onMessage({ nativeEvent: { data } });
      });

      expect(onVerify).toHaveBeenCalledTimes(1);
      expect(onVerify).toHaveBeenCalledWith(null);

      await act(async () => {
        webView.props.onMessage({
          nativeEvent: { data: JSON.stringify({ token: "verified-token", type: "success" }) },
        });
      });

      expect(onVerify).toHaveBeenCalledTimes(1);
      expect(onVerify).not.toHaveBeenCalledWith("verified-token");
      await act(async () => {
        view.unmount();
      });
    }
  });

  it("invalidates each native WebView failure and suppresses its failure screen", async () => {
    setTurnstileSiteKey("public-site-key");
    for (const handlerName of ["onError", "onHttpError"] as const) {
      const onVerify = jest.fn();
      const view = await render(
        <AuthTurnstileCard action="register" onVerify={onVerify} testID="auth-turnstile" />,
      );
      const webView = view.getByTestId("auth-turnstile-webview");
      const failure = { preventDefault: jest.fn() };

      await act(async () => {
        webView.props[handlerName](failure);
      });

      expect(failure.preventDefault).toHaveBeenCalledTimes(1);
      expect(onVerify).toHaveBeenCalledTimes(1);
      expect(onVerify).toHaveBeenCalledWith(null);

      await act(async () => {
        webView.props.onMessage({
          nativeEvent: { data: JSON.stringify({ token: "verified-token", type: "success" }) },
        });
      });

      expect(onVerify).toHaveBeenCalledTimes(1);
      expect(onVerify).not.toHaveBeenCalledWith("verified-token");
      await act(async () => {
        view.unmount();
      });
    }
  });

  it("accepts one bounded success token on a clean new challenge", async () => {
    setTurnstileSiteKey("public-site-key");
    const onVerify = jest.fn();
    const view = await render(
      <AuthTurnstileCard action="register" onVerify={onVerify} testID="auth-turnstile" />,
    );
    const webView = view.getByTestId("auth-turnstile-webview");

    await act(async () => {
      webView.props.onMessage({
        nativeEvent: { data: JSON.stringify({ token: "verified-token", type: "success" }) },
      });
      webView.props.onMessage({
        nativeEvent: { data: JSON.stringify({ token: "another-verified-token", type: "success" }) },
      });
    });

    expect(onVerify).toHaveBeenCalledTimes(1);
    expect(onVerify).toHaveBeenCalledWith("verified-token");
  });
});

describe("mobile auth screen background", () => {
  it("ports the approved 24-dot and exact glow geometry through semantic roles", async () => {
    mockTheme = lightTheme;
    const view = await render(<AuthScreenBackground testID="auth-background" />);

    expect(view.getAllByTestId("auth-background-dot")).toHaveLength(24);
    expect(StyleSheet.flatten(view.getByTestId("auth-background-glow-top").props.style)).toEqual(
      expect.objectContaining({
        height: lightTheme.layout.auth.backgroundGlowTopDiameter,
        right: -lightTheme.layout.auth.backgroundGlowTopOffsetRight,
        top: -lightTheme.layout.auth.backgroundGlowTopOffsetTop,
        width: lightTheme.layout.auth.backgroundGlowTopDiameter,
      }),
    );
    expect(StyleSheet.flatten(view.getByTestId("auth-background-glow-bottom").props.style)).toEqual(
      expect.objectContaining({
        bottom: -lightTheme.layout.auth.backgroundGlowBottomOffsetBottom,
        height: lightTheme.layout.auth.backgroundGlowBottomDiameter,
        left: -lightTheme.layout.auth.backgroundGlowBottomOffsetLeft,
        width: lightTheme.layout.auth.backgroundGlowBottomDiameter,
      }),
    );
  });
});
