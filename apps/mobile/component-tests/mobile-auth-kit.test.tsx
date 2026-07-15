import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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

import {
  AuthCheckbox,
  AuthEyebrowHeader,
  AuthInfoBanner,
  AuthPasswordStrengthRow,
  AuthPrimaryButton,
  AuthProfileTypeSelector,
  AuthScreenBackground,
  AuthSecurityCard,
  AuthSecondaryButton,
  AuthTextField,
  AuthTopBar,
  isMobileAuthPasswordStrong,
} from "../src/app/components/kit/auth";

function expectIconSize(view: ReturnType<typeof render>, testID: string, size: number) {
  expect(view.getByTestId(testID, { includeHiddenElements: true }).props.size).toBe(size);
}

function flattenPressableStyle(view: ReturnType<typeof render>, testID: string) {
  const style = view.getByTestId(testID).props.style;
  return StyleSheet.flatten(typeof style === "function" ? style({ pressed: false }) : style);
}

function isNestedWithin(node: { parent: unknown }, ancestor: unknown) {
  let current = node.parent;

  while (current && typeof current === "object" && "parent" in current) {
    if (current === ancestor) {
      return true;
    }

    current = (current as { parent: unknown }).parent;
  }

  return false;
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

    it("caps all shared auth eyebrow and field support text at the approved Dynamic Type limit", async () => {
      mockTheme = theme;
      const view = await render(
        <>
          <AuthEyebrowHeader eyebrow="Secure access" title="Reset your password" />
          <AuthTextField
            errorMessage="Enter a valid email address"
            label="Email address"
            onChangeText={jest.fn()}
            testID="auth-dynamic-type-field"
            value=""
          />
        </>,
      );

      expect(view.getByText("Secure access").props.maxFontSizeMultiplier).toBe(2);
      expect(view.getByText("Email address").props.maxFontSizeMultiplier).toBe(2);
      expect(view.getByTestId("auth-dynamic-type-field-error").props.maxFontSizeMultiplier).toBe(2);
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

    it("keeps a typed label accessory in the semantic label row", async () => {
      mockTheme = theme;
      const view = await render(
        <AuthTextField
          label="Password"
          labelAccessory={
            <Pressable accessibilityRole="button" testID="auth-password-forgot">
              <Text>Forgot password?</Text>
            </Pressable>
          }
          onChangeText={jest.fn()}
          testID="auth-password-with-accessory"
          value=""
        />,
      );

      const label = view.getByText("Password");
      const accessory = view.getByTestId("auth-password-forgot");

      expect(accessory.parent).toBe(label.parent);
      expect(StyleSheet.flatten(label.parent?.props.style)).toEqual(
        expect.objectContaining({
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
        }),
      );
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
      const welcomeLabel = primaryWelcome.getByText("Continue");
      const welcomeIcon = primaryWelcome.getByTestId("auth-primary-welcome-icon", {
        includeHiddenElements: true,
      });

      expect(welcomeLabel.parent?.children.indexOf(welcomeLabel)).toBeLessThan(
        welcomeLabel.parent?.children.indexOf(welcomeIcon) ?? -1,
      );
      expectIconSize(secondaryWelcome, "auth-secondary-welcome-icon", theme.layout.auth.welcomeSecondaryActionIcon);
      expectIconSize(fullInput, "auth-full-input-leading-icon", theme.layout.auth.fullInputIcon);
      expectIconSize(fullInput, "auth-full-input-trailing-icon", theme.layout.auth.fullInputIcon);
      expectIconSize(compactInput, "auth-compact-input-leading-icon", theme.layout.auth.compactRegisterPasswordIcon);
      expectIconSize(compactInput, "auth-compact-input-trailing-icon", theme.layout.auth.compactRegisterPasswordIcon);
      expectIconSize(topBar, "auth-top-bar-back-icon", theme.layout.auth.topBarBackIcon);
      expectIconSize(security, "auth-security-shield-icon", theme.layout.auth.securityShieldIcon);
      expectIconSize(security, "auth-security-badge-icon", theme.layout.auth.securityBadgeIcon);
      expectIconSize(profile, "auth-profile-sizes-option-personal-glyph", theme.layout.auth.profileGlyph);
      expectIconSize(profile, "auth-profile-sizes-option-personal-check", theme.layout.auth.profileCheckGlyph);
      expectIconSize(passwordHint, "auth-password-hint-shield-icon", theme.layout.auth.passwordHintShieldIcon);
      expectIconSize(checkbox, "auth-checkbox-check-icon", theme.layout.auth.checkboxCheckGlyph);
      expectIconSize(infoBanner, "auth-info-icon", theme.layout.auth.infoBannerGlyph);
    });

    it("uses the muted semantic auth gradient for a reset primary action", async () => {
      mockTheme = theme;
      const view = await render(
        <AuthPrimaryButton
          label="Send reset link"
          onPress={jest.fn()}
          testID="auth-primary-reset"
          variant="reset"
        />,
      );

      expect(view.getByTestId("auth-primary-reset-gradient").props.colors).toEqual(
        theme.gradients.authPrimaryActionMuted,
      );
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
      const visibleLabel = view.getByText("Remember me");
      expect(visibleLabel.type).toBe("Text");
      expect(isNestedWithin(visibleLabel, checkbox)).toBe(true);

      await fireEvent.press(visibleLabel);

      expect(checkbox.props.accessibilityRole).toBe("checkbox");
      expect(checkbox.props.accessibilityState).toEqual(
        expect.objectContaining({ checked: true, disabled: false }),
      );
      expect(flattenPressableStyle(view, "auth-remember")).toEqual(
        expect.objectContaining({
          minHeight: theme.sizing.minTouchTarget,
          minWidth: 0,
        }),
      );
      expect(onPress).toHaveBeenCalledTimes(1);

      await fireEvent.press(checkbox);
      expect(onPress).toHaveBeenCalledTimes(2);
    });

    it("keeps an optional rich label outside the checkbox accessibility target", async () => {
      mockTheme = theme;
      const view = await render(
        <AuthCheckbox
          checked={false}
          label="I accept the Terms of Use and Privacy Policy."
          labelContent={<Text testID="auth-checkbox-rich-label">Custom legal label</Text>}
          onPress={jest.fn()}
          testID="auth-checkbox-rich"
        />,
      );

      const checkbox = view.getByTestId("auth-checkbox-rich");

      expect(checkbox.props.accessibilityLabel).toBe(
        "I accept the Terms of Use and Privacy Policy.",
      );
      expect(view.getByTestId("auth-checkbox-rich-label")).toBeTruthy();
      expect(isNestedWithin(view.getByTestId("auth-checkbox-rich-label"), checkbox)).toBe(false);
      expect(flattenPressableStyle(view, "auth-checkbox-rich")).toEqual(
        expect.objectContaining({
          minHeight: theme.sizing.minTouchTarget,
          minWidth: theme.sizing.minTouchTarget,
        }),
      );
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

describe("mobile auth screen background", () => {
  it("keeps fill-mode content viewport-sized for screens with pinned chrome", async () => {
    mockTheme = lightTheme;
    const view = await render(
      <AuthScreenBackground centered={false} fill testID="auth-background-fill">
        <View />
      </AuthScreenBackground>,
    );

    expect(StyleSheet.flatten(view.getByTestId("auth-background-fill-content").props.style)).toEqual(
      expect.objectContaining({ flex: 1 }),
    );
  });

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
