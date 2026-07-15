import { useRef, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";

import { getMobileRuntimeConfig } from "../../../config/environment";
import { mobileCopy } from "../../../locale/mobile-copy";
import {
  AuthCheckbox,
  AuthEyebrowHeader,
  AuthPasswordStrengthRow,
  AuthPrimaryButton,
  AuthProfileTypeSelector,
  AuthScreenBackground,
  AuthTextField,
  AuthTopBar,
  AuthTurnstileCard,
  type MobileAuthProfileType,
} from "../../components/kit/auth";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useThemedStyles } from "../../providers/mobile-theme-provider";
import { createAuthRegisterScreenStyles } from "./auth-register-screen.styles";

const MOBILE_AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_AUTH_USERNAME_PATTERN = /^[a-zA-Z0-9_]{2,32}$/;

export interface AuthRegisterScreenProps {
  readonly onBack: () => void;
  readonly onRegister: (input: {
    confirmPassword: string;
    email: string;
    password: string;
    turnstileToken: string;
    username: string;
  }) => Promise<{ email: string; ok: true } | { message: string; ok: false }>;
  readonly onSignIn: () => void;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeUsername(value: string) {
  return value.trim();
}

function getSafeResultMessage(message: string, fallback: string) {
  return message.trim() || fallback;
}

function safelyOpenLegalUrl(url: string) {
  try {
    void Linking.openURL(url).catch(() => undefined);
  } catch {
    // Intentionally fail closed without exposing external navigation failures.
  }
}

export function AuthRegisterScreen({ onBack, onRegister, onSignIn }: AuthRegisterScreenProps) {
  const { locale } = useMobileLocaleRuntime();
  const styles = useThemedStyles(createAuthRegisterScreenStyles);
  const copy = mobileCopy[locale];
  const submissionInFlight = useRef(false);
  const { webUrl } = getMobileRuntimeConfig();
  const termsUrl = `${webUrl}/terms`;
  const privacyUrl = `${webUrl}/privacy`;
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileType, setProfileType] = useState<MobileAuthProfileType>("personal");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearFeedback = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleTurnstileVerify = (token: string | null) => {
    setTurnstileToken(token);
    if (token) {
      clearFeedback();
    }
  };

  const handleSubmit = async () => {
    if (submissionInFlight.current || !termsAccepted) {
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedUsername = normalizeUsername(username);
    clearFeedback();

    if (!normalizedUsername || !normalizedEmail || !password || !confirmPassword) {
      setErrorMessage(copy.authNativeMissingFields);
      return;
    }

    if (!MOBILE_AUTH_EMAIL_PATTERN.test(normalizedEmail)) {
      setErrorMessage(copy.authNativeInvalidEmail);
      return;
    }

    if (!MOBILE_AUTH_USERNAME_PATTERN.test(normalizedUsername)) {
      setErrorMessage(copy.authNativeUsernameInvalid);
      return;
    }

    if (password.length < 8) {
      setErrorMessage(copy.authNativePasswordTooShort);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage(copy.authNativePasswordMismatch);
      return;
    }

    if (!turnstileToken) {
      setErrorMessage(copy.authTurnstileError);
      return;
    }

    submissionInFlight.current = true;
    setIsSubmitting(true);

    try {
      const result = await onRegister({
        confirmPassword,
        email: normalizedEmail,
        password,
        turnstileToken,
        username: normalizedUsername,
      });

      if (result.ok) {
        setSuccessMessage(copy.authNativeVerificationNotice.replace("{email}", result.email));
        return;
      }

      setErrorMessage(getSafeResultMessage(result.message, copy.authNativeGenericError));
    } catch {
      setErrorMessage(copy.authNativeGenericError);
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <AuthScreenBackground centered={false} scrollable testID="mobile-auth-register-screen">
      <View style={styles.screen}>
        <View style={styles.topSection}>
          <AuthTopBar
            backAccessibilityLabel={copy.authNativeBackToSignIn}
            onBack={onBack}
            testID="mobile-auth-register-top-bar"
          />
          <AuthEyebrowHeader
            eyebrow={copy.authRegisterEyebrow}
            subtitle={copy.authJoinDescription}
            testID="mobile-auth-register-header"
            title={copy.authJoinTitle}
          />
          <AuthProfileTypeSelector
            onChange={setProfileType}
            testID="mobile-auth-register-profile"
            value={profileType}
          />
        </View>

        <View style={styles.form}>
          {errorMessage ? (
            <Text
              accessibilityLiveRegion="polite"
              maxFontSizeMultiplier={2}
              style={styles.error}
              testID="mobile-auth-register-error"
            >
              {errorMessage}
            </Text>
          ) : null}
          {successMessage ? (
            <Text
              accessibilityLiveRegion="polite"
              maxFontSizeMultiplier={2}
              style={styles.success}
              testID="mobile-auth-register-success"
            >
              {successMessage}
            </Text>
          ) : null}
          <AuthTextField
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect={false}
            iconName="person-outline"
            label={copy.authUsernameFieldLabel}
            onChangeText={(value) => {
              setUsername(value);
              clearFeedback();
            }}
            placeholder={copy.authUsernameFieldPlaceholder}
            returnKeyType="next"
            testID="mobile-auth-register-username"
            textContentType="username"
            value={username}
            variant="register"
          />
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
            testID="mobile-auth-register-email"
            textContentType="emailAddress"
            value={email}
            variant="register"
          />
          <View style={styles.passwordColumns}>
            <View style={styles.passwordColumn}>
              <AuthTextField
                autoCapitalize="none"
                autoComplete="new-password"
                autoCorrect={false}
                iconName="lock-closed-outline"
                iconSize="compact"
                inputStyle={styles.compactInput}
                label={copy.authPasswordFieldLabel}
                onChangeText={(value) => {
                  setPassword(value);
                  clearFeedback();
                }}
                placeholder={copy.authPasswordMinLengthPlaceholder}
                returnKeyType="next"
                secureTextEntry
                testID="mobile-auth-register-password"
                textContentType="newPassword"
                value={password}
                variant="register"
              />
            </View>
            <View style={styles.passwordColumn}>
              <AuthTextField
                autoCapitalize="none"
                autoComplete="new-password"
                autoCorrect={false}
                iconName="lock-closed-outline"
                iconSize="compact"
                inputStyle={styles.compactInput}
                label={copy.authConfirmPasswordFieldLabel}
                onChangeText={(value) => {
                  setConfirmPassword(value);
                  clearFeedback();
                }}
                placeholder={copy.authPasswordMinLengthPlaceholder}
                returnKeyType="done"
                secureTextEntry
                testID="mobile-auth-register-confirm-password"
                textContentType="newPassword"
                value={confirmPassword}
                variant="register"
              />
            </View>
          </View>
          <AuthPasswordStrengthRow password={password} testID="mobile-auth-register-password-strength" />
          <AuthTurnstileCard
            action="register"
            onVerify={handleTurnstileVerify}
            testID="mobile-auth-register-turnstile"
          />
          <AuthCheckbox
            checked={termsAccepted}
            disabled={isSubmitting}
            label={copy.authLegalAccepted}
            labelContent={
              <Text maxFontSizeMultiplier={2} style={styles.legalCopy}>
                <Text
                  accessibilityLabel={copy.authLegalTermsLink}
                  accessibilityRole="link"
                  maxFontSizeMultiplier={2}
                  onPress={() => safelyOpenLegalUrl(termsUrl)}
                  style={styles.legalLink}
                  testID="mobile-auth-register-terms-link"
                >
                  {copy.authLegalTermsLink}
                </Text>{" "}
                {copy.authLegalAnd}{" "}
                <Text
                  accessibilityLabel={copy.authLegalPrivacyLink}
                  accessibilityRole="link"
                  maxFontSizeMultiplier={2}
                  onPress={() => safelyOpenLegalUrl(privacyUrl)}
                  style={styles.legalLink}
                  testID="mobile-auth-register-privacy-link"
                >
                  {copy.authLegalPrivacyLink}
                </Text>{" "}
                {copy.authLegalSuffix}
              </Text>
            }
            onPress={() => {
              setTermsAccepted((current) => !current);
              clearFeedback();
            }}
            testID="mobile-auth-register-terms"
          />
          <AuthPrimaryButton
            busy={isSubmitting}
            disabled={!termsAccepted}
            iconName="arrow-forward"
            label={isSubmitting ? copy.authNativeSubmitting : copy.authNativeRegisterAction}
            onPress={() => void handleSubmit()}
            testID="mobile-auth-register-submit"
            variant="form"
          />
        </View>

        <View style={styles.footerRow}>
          <Text maxFontSizeMultiplier={2} style={styles.footerPrompt}>
            {copy.authAlreadyHaveAccount}
          </Text>
          <Pressable
            accessibilityLabel={copy.authModeSignIn}
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={onSignIn}
            style={styles.inlineActionTarget}
            testID="mobile-auth-register-sign-in"
          >
            <Text maxFontSizeMultiplier={2} style={styles.footerAction}>
              {copy.authModeSignIn}
            </Text>
          </Pressable>
        </View>
      </View>
    </AuthScreenBackground>
  );
}
