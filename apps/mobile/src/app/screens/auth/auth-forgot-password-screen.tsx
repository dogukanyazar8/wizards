import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { mobileCopy } from "../../../locale/mobile-copy";
import {
  AuthEyebrowHeader,
  AuthInfoBanner,
  AuthPrimaryButton,
  AuthScreenBackground,
  AuthTextField,
  AuthTopBar,
} from "../../components/kit/auth";
import { Icon } from "../../components/kit/icon";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import { createAuthForgotPasswordScreenStyles } from "./auth-forgot-password-screen.styles";

const MOBILE_AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = 60;

export interface AuthForgotPasswordScreenProps {
  readonly onBack: () => void;
  readonly onRequestPasswordReset: (input: { email: string }) => Promise<
    | { email: string; ok: true; resetLinkTtlMinutes?: number }
    | { message: string; ok: false }
  >;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function getSafeResultMessage(message: string, fallback: string) {
  return message.trim() || fallback;
}

export function AuthForgotPasswordScreen({
  onBack,
  onRequestPasswordReset,
}: AuthForgotPasswordScreenProps) {
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const styles = useThemedStyles(createAuthForgotPasswordScreenStyles);
  const copy = mobileCopy[locale];
  const requestInFlight = useRef(false);
  const isMounted = useRef(true);
  const cooldownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [email, setEmail] = useState("");
  const [requestedEmail, setRequestedEmail] = useState<string | null>(null);
  const [resetLinkTtlMinutes, setResetLinkTtlMinutes] = useState<number | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (cooldownInterval.current) {
        clearInterval(cooldownInterval.current);
        cooldownInterval.current = null;
      }
    };
  }, []);

  const clearFeedback = () => setErrorMessage(null);

  const startResendCooldown = () => {
    if (cooldownInterval.current) {
      clearInterval(cooldownInterval.current);
      cooldownInterval.current = null;
    }

    setResendSeconds(PASSWORD_RESET_RESEND_COOLDOWN_SECONDS);
    cooldownInterval.current = setInterval(() => {
      setResendSeconds((current) => {
        if (current <= 1) {
          if (cooldownInterval.current) {
            clearInterval(cooldownInterval.current);
            cooldownInterval.current = null;
          }
          return 0;
        }

        return current - 1;
      });
    }, 1_000);
  };

  const requestPasswordReset = async (normalizedEmail: string) => {
    if (requestInFlight.current) {
      return;
    }

    requestInFlight.current = true;
    setIsRequesting(true);
    clearFeedback();

    try {
      const result = await onRequestPasswordReset({ email: normalizedEmail });
      if (!isMounted.current) {
        return;
      }

      if (!result.ok) {
        setErrorMessage(getSafeResultMessage(result.message, copy.authNativeGenericError));
        return;
      }

      setRequestedEmail(normalizedEmail);
      setResetLinkTtlMinutes(result.resetLinkTtlMinutes);
      startResendCooldown();
    } catch {
      if (isMounted.current) {
        setErrorMessage(copy.authNativeGenericError);
      }
    } finally {
      requestInFlight.current = false;
      if (isMounted.current) {
        setIsRequesting(false);
      }
    }
  };

  const handleSubmit = () => {
    const normalizedEmail = normalizeEmail(email);
    clearFeedback();

    if (!normalizedEmail) {
      setErrorMessage(copy.authNativeMissingFields);
      return;
    }

    if (!MOBILE_AUTH_EMAIL_PATTERN.test(normalizedEmail)) {
      setErrorMessage(copy.authNativeInvalidEmail);
      return;
    }

    void requestPasswordReset(normalizedEmail);
  };

  const handleResend = () => {
    if (!requestedEmail || resendSeconds > 0 || requestInFlight.current) {
      return;
    }

    void requestPasswordReset(requestedEmail);
  };

  const isSuccess = requestedEmail !== null;
  const resendDisabled = isRequesting || resendSeconds > 0;
  const resendLabel =
    resendSeconds > 0
      ? copy.authForgotResendCooldownTemplate.replace("{seconds}", String(resendSeconds))
      : copy.authForgotResendAction;

  return (
    <AuthScreenBackground centered={false} fill testID="mobile-auth-forgot-password-screen">
      <View style={styles.screen}>
        <View style={styles.topSection} testID="mobile-auth-forgot-top-section">
          <AuthTopBar
            backAccessibilityLabel={copy.authBackToSignInAction}
            onBack={onBack}
            testID="mobile-auth-forgot-top-bar"
          />
        </View>
        <View style={styles.content} testID="mobile-auth-forgot-content">
          <View
            accessibilityLabel={isSuccess ? copy.authForgotSuccessTitle : copy.authForgotTitle}
            accessibilityRole="image"
            style={[styles.iconCard, isSuccess ? styles.iconCardSuccess : styles.iconCardInitial]}
            testID="mobile-auth-forgot-icon-card"
          >
            {isSuccess ? (
              <Ionicons
                accessibilityElementsHidden
                color={theme.status.success}
                importantForAccessibility="no"
                name="checkmark"
                size={theme.layout.auth.forgotIconCardGlyph}
                testID="mobile-auth-forgot-success-icon"
              />
            ) : (
              <Icon
                accessibilityElementsHidden
                name="key-outline"
                size={theme.layout.auth.forgotIconCardGlyph}
                testID="mobile-auth-forgot-key-icon"
                tone="accent"
              />
            )}
          </View>
          <AuthEyebrowHeader
            eyebrow={copy.authForgotEyebrow}
            subtitle={copy.authForgotScreenDescription}
            testID="mobile-auth-forgot-header"
            title={isSuccess ? copy.authForgotSuccessTitle : copy.authForgotTitle}
          />
          {errorMessage ? (
            <Text
              accessibilityLiveRegion="polite"
              maxFontSizeMultiplier={2}
              style={styles.error}
              testID="mobile-auth-forgot-error"
            >
              {errorMessage}
            </Text>
          ) : null}
          {isSuccess ? (
            <>
              {resetLinkTtlMinutes !== undefined ? (
                <View style={styles.ttlBanner}>
                  <AuthInfoBanner
                    iconColor={theme.status.success}
                    iconName="shield-checkmark-outline"
                    testID="mobile-auth-forgot-ttl-banner"
                    text={copy.authForgotInfoTtlTemplate.replace(
                      "{minutes}",
                      String(resetLinkTtlMinutes),
                    )}
                  />
                </View>
              ) : null}
              <Pressable
                accessibilityLabel={resendLabel}
                accessibilityRole="button"
                accessibilityState={{ busy: isRequesting, disabled: resendDisabled }}
                disabled={resendDisabled}
                onPress={handleResend}
                style={({ pressed }) => [
                  styles.backAction,
                  pressed && !resendDisabled && { opacity: theme.layout.opacity.pressed },
                ]}
                testID="mobile-auth-forgot-resend"
              >
                <Text maxFontSizeMultiplier={2} style={styles.backActionLabel}>
                  {resendLabel}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
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
                returnKeyType="send"
                testID="mobile-auth-forgot-email"
                textContentType="emailAddress"
                value={email}
              />
              <AuthPrimaryButton
                busy={isRequesting}
                iconName="paper-plane-outline"
                label={copy.authNativeForgotAction}
                onPress={handleSubmit}
                testID="mobile-auth-forgot-submit"
                variant="reset"
              />
            </>
          )}
          <Pressable
            accessibilityLabel={copy.authBackToSignInAction}
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [
              styles.backAction,
              pressed && { opacity: theme.layout.opacity.pressed },
            ]}
            testID="mobile-auth-forgot-back-to-sign-in"
          >
            <Text maxFontSizeMultiplier={2} style={styles.backActionLabel}>
              {copy.authBackToSignInAction}
            </Text>
            <Icon
              accessibilityElementsHidden
              name="arrow-forward"
              size={theme.layout.auth.topBarBackIcon}
              tone="accent"
            />
          </Pressable>
        </View>
      </View>
    </AuthScreenBackground>
  );
}
