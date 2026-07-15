import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { MOBILE_AUTH_SOCIAL_PROVIDERS } from "../../../auth/mobile-auth-social-config";
import { mobileCopy } from "../../../locale/mobile-copy";
import {
  AuthCheckbox,
  AuthEyebrowHeader,
  AuthPrimaryButton,
  AuthProfileTypeSelector,
  AuthScreenBackground,
  AuthSecondaryButton,
  AuthTextField,
  AuthTopBar,
  AuthTurnstileCard,
  type MobileAuthProfileType,
} from "../../components/kit/auth";
import { Icon } from "../../components/kit/icon";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import { createAuthLoginScreenStyles } from "./auth-login-screen.styles";

const MOBILE_AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthLoginScreenProps {
  readonly developmentCredentials?: {
    readonly email: string;
    readonly password: string;
  } | null;
  readonly onBack: () => void;
  readonly onForgotPassword: () => void;
  readonly onOpenWebSignIn: () => void;
  readonly onRegister: () => void;
  readonly onSignIn: (input: {
    email: string;
    password: string;
    turnstileToken: string;
    twoFactorCode?: string;
  }) => Promise<{ ok: true } | { message: string; ok: false; requiresTwoFactor?: boolean }>;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function getSafeResultMessage(message: string, fallback: string) {
  return message.trim() || fallback;
}

export function AuthLoginScreen({
  developmentCredentials = null,
  onBack,
  onForgotPassword,
  onOpenWebSignIn,
  onRegister,
  onSignIn,
}: AuthLoginScreenProps) {
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const styles = useThemedStyles(createAuthLoginScreenStyles);
  const copy = mobileCopy[locale];
  const submissionInFlight = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profileType, setProfileType] = useState<MobileAuthProfileType>("personal");
  const [rememberMe, setRememberMe] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorVisible, setTwoFactorVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearFeedback = () => {
    setErrorMessage(null);
    setNoticeMessage(null);
  };

  const handleTurnstileVerify = (token: string | null) => {
    setTurnstileToken(token);
    if (token) {
      clearFeedback();
    }
  };

  const handleTwoFactorToggle = () => {
    setTwoFactorVisible((visible) => !visible);
    setTwoFactorCode("");
    clearFeedback();
  };

  const handleFillDevelopmentCredentials = () => {
    if (!developmentCredentials || isSubmitting) {
      return;
    }

    setEmail(developmentCredentials.email);
    setPassword(developmentCredentials.password);
    setTurnstileToken(null);
    setTwoFactorCode("");
    setTwoFactorVisible(false);
    setErrorMessage(null);
    setNoticeMessage(copy.authNativeDevCredentialsFilled);
  };

  const handleSubmit = async () => {
    if (submissionInFlight.current) {
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedTwoFactorCode = twoFactorVisible ? twoFactorCode.trim() : "";
    clearFeedback();

    if (!normalizedEmail || !password) {
      setErrorMessage(copy.authNativeMissingFields);
      return;
    }

    if (!MOBILE_AUTH_EMAIL_PATTERN.test(normalizedEmail)) {
      setErrorMessage(copy.authNativeInvalidEmail);
      return;
    }

    if (!turnstileToken) {
      setErrorMessage(copy.authTurnstileError);
      return;
    }

    submissionInFlight.current = true;
    setIsSubmitting(true);

    try {
      const input: {
        email: string;
        password: string;
        turnstileToken: string;
        twoFactorCode?: string;
      } = {
        email: normalizedEmail,
        password,
        turnstileToken,
      };

      if (normalizedTwoFactorCode) {
        input.twoFactorCode = normalizedTwoFactorCode;
      }

      const result = await onSignIn(input);
      if (!result.ok) {
        if (result.requiresTwoFactor) {
          setTwoFactorVisible(true);
        }
        setErrorMessage(
          getSafeResultMessage(
            result.message,
            result.requiresTwoFactor ? copy.authTwoFactorInvalidCode : copy.authNativeGenericError,
          ),
        );
      }
    } catch {
      setErrorMessage(copy.authNativeGenericError);
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <AuthScreenBackground
      centered={false}
      scrollable
      testID="mobile-auth-login-screen"
    >
      <View style={styles.screen}>
        <View style={styles.topSection}>
          <AuthTopBar
            backAccessibilityLabel={copy.authNativeBackToSignIn}
            onBack={onBack}
            testID="mobile-auth-login-top-bar"
          />
          <AuthEyebrowHeader
            eyebrow={copy.authLoginEyebrow}
            subtitle={copy.authWelcomeBackDescription}
            testID="mobile-auth-login-header"
            title={copy.authWelcomeBackTitle}
          />
          <AuthProfileTypeSelector
            onChange={setProfileType}
            testID="mobile-auth-login-profile"
            value={profileType}
          />
        </View>

        <View style={styles.form}>
          {errorMessage ? (
            <Text
              accessibilityLiveRegion="polite"
              maxFontSizeMultiplier={2}
              style={styles.error}
              testID="mobile-auth-login-error"
            >
              {errorMessage}
            </Text>
          ) : null}
          <AuthTextField
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            iconName="mail-outline"
            inputMode="email"
            keyboardType="email-address"
            label={copy.authNativeEmailLabel}
            onChangeText={(value) => {
              setEmail(value);
              clearFeedback();
            }}
            placeholder={copy.authNativeEmailPlaceholder}
            returnKeyType="next"
            testID="mobile-auth-login-email"
            textContentType="emailAddress"
            value={email}
          />
          <AuthTextField
            autoCapitalize="none"
            autoComplete="password"
            autoCorrect={false}
            iconName="lock-closed-outline"
            label={copy.authNativePasswordLabel}
            labelAccessory={
              <Pressable
                accessibilityLabel={copy.authNativeForgotLink}
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={onForgotPassword}
                style={styles.inlineActionTarget}
                testID="mobile-auth-login-forgot-password"
              >
                <Text maxFontSizeMultiplier={2} style={styles.inlineAction}>
                  {copy.authNativeForgotLink}
                </Text>
              </Pressable>
            }
            onChangeText={(value) => {
              setPassword(value);
              clearFeedback();
            }}
            placeholder={copy.authNativePasswordPlaceholder}
            returnKeyType="done"
            secureTextEntry
            testID="mobile-auth-login-password"
            textContentType="password"
            value={password}
          />
          <View style={styles.inlineRow}>
            <Pressable
              accessibilityLabel={copy.authTwoFactorLinkAction}
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={handleTwoFactorToggle}
              style={[styles.inlineActionTarget, styles.twoFactorAction]}
              testID="mobile-auth-login-two-factor-link"
            >
              <Icon
                accessibilityElementsHidden
                name="shield-checkmark-outline"
                size={theme.layout.auth.passwordHintShieldIcon}
                testID="mobile-auth-login-two-factor-icon"
                tone="accent"
              />
              <Text maxFontSizeMultiplier={2} style={styles.twoFactorActionLabel}>
                {copy.authTwoFactorLinkAction}
              </Text>
            </Pressable>
            <AuthCheckbox
              checked={rememberMe}
              disabled={isSubmitting}
              label={copy.authRememberMe}
              onPress={() => setRememberMe((current) => !current)}
              testID="mobile-auth-login-remember-me"
            />
          </View>
          {twoFactorVisible ? (
            <AuthTextField
              autoCapitalize="none"
              autoComplete="one-time-code"
              autoCorrect={false}
              iconName="key-outline"
              label={copy.authTwoFactorFieldLabel}
              onChangeText={(value) => {
                setTwoFactorCode(value);
                clearFeedback();
              }}
              placeholder={copy.authTwoFactorFieldPlaceholder}
              returnKeyType="done"
              testID="mobile-auth-login-two-factor-code"
              textContentType="oneTimeCode"
              value={twoFactorCode}
            />
          ) : null}
          {twoFactorVisible ? (
            <Text maxFontSizeMultiplier={2} style={styles.dividerLabel} testID="mobile-auth-login-two-factor-notice">
              {copy.authTwoFactorRequiredNotice}
            </Text>
          ) : null}
          <AuthTurnstileCard
            action="login"
            onVerify={handleTurnstileVerify}
            testID="mobile-auth-login-turnstile"
          />
          {noticeMessage ? (
            <Text
              accessibilityLiveRegion="polite"
              maxFontSizeMultiplier={2}
              style={styles.notice}
              testID="mobile-auth-login-notice"
            >
              {noticeMessage}
            </Text>
          ) : null}
          {developmentCredentials ? (
            <AuthSecondaryButton
              disabled={isSubmitting}
              label={copy.authNativeDevFillAction}
              onPress={handleFillDevelopmentCredentials}
              testID="mobile-auth-login-fill-dev-credentials"
            />
          ) : null}
          <AuthPrimaryButton
            busy={isSubmitting}
            label={isSubmitting ? copy.authNativeSubmitting : copy.authNativeSignInAction}
            onPress={() => void handleSubmit()}
            testID="mobile-auth-login-submit"
            variant="form"
          />
        </View>

        <View style={styles.socialGroup}>
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text maxFontSizeMultiplier={2} style={styles.dividerLabel}>
              {copy.authSocialDividerLabel}
            </Text>
            <View style={styles.divider} />
          </View>
          {MOBILE_AUTH_SOCIAL_PROVIDERS.map((provider) => {
            const label = copy[provider.labelCopyKey];

            return (
              <Pressable
                key={provider.id}
                accessibilityLabel={label}
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={onOpenWebSignIn}
                style={styles.socialAction}
                testID={provider.testID}
              >
                <Icon
                  accessibilityElementsHidden
                  name={provider.iconName}
                  size={theme.layout.auth.fullInputIcon}
                  testID={`${provider.testID}-icon`}
                  tone="accent"
                />
                <Text maxFontSizeMultiplier={2} style={styles.socialActionLabel}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.footerRow}>
          <Text maxFontSizeMultiplier={2} style={styles.footerPrompt}>
            {copy.authNoAccountPrompt}
          </Text>
          <Pressable
            accessibilityLabel={copy.authFreeRegisterAction}
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={onRegister}
            style={styles.inlineActionTarget}
            testID="mobile-auth-login-register"
          >
            <Text maxFontSizeMultiplier={2} style={styles.footerAction}>
              {copy.authFreeRegisterAction}
            </Text>
          </Pressable>
        </View>
      </View>
    </AuthScreenBackground>
  );
}
