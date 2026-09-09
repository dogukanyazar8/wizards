import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  isLiveMobileAuthSocialProvider,
  MOBILE_AUTH_SOCIAL_PROVIDERS,
  type MobileAuthLiveSocialProviderId,
} from "../../../auth/mobile-auth-social-config";
import type { MobileSocialSignInResult } from "../../../auth/mobile-auth-context";
import { mobileCopy } from "../../../locale/mobile-copy";
import {
  AuthCheckbox,
  AuthEyebrowHeader,
  AuthPrimaryButton,
  AuthScreenBackground,
  AuthSecondaryButton,
  AuthSocialProviderIcon,
  AuthTextField,
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
  readonly onForgotPassword: () => void;
  readonly onOpenLanguagePicker: () => void;
  readonly onRegister: () => void;
  readonly onSignIn: (input: {
    email: string;
    password: string;
    twoFactorCode?: string;
  }) => Promise<{ ok: true } | { message: string; ok: false; requiresTwoFactor?: boolean }>;
  readonly onSocialSignIn: (
    provider: MobileAuthLiveSocialProviderId,
    input?: { twoFactorCode?: string },
  ) => Promise<MobileSocialSignInResult>;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function getSafeResultMessage(message: string, fallback: string) {
  return message.trim() || fallback;
}

export function AuthLoginScreen({
  developmentCredentials = null,
  onForgotPassword,
  onOpenLanguagePicker,
  onRegister,
  onSignIn,
  onSocialSignIn,
}: AuthLoginScreenProps) {
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const styles = useThemedStyles(createAuthLoginScreenStyles);
  const copy = mobileCopy[locale];
  const submissionInFlight = useRef(false);
  const autoLoginDoneRef = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [socialProviderInFlight, setSocialProviderInFlight] =
    useState<MobileAuthLiveSocialProviderId | null>(null);

  const clearFeedback = () => {
    setErrorMessage(null);
    setNoticeMessage(null);
  };

  const handleSocialPress = async (provider: (typeof MOBILE_AUTH_SOCIAL_PROVIDERS)[number]) => {
    if (isSubmitting || socialProviderInFlight) {
      return;
    }

    clearFeedback();

    if (!isLiveMobileAuthSocialProvider(provider)) {
      setNoticeMessage(
        copy.authSocialProviderComingSoon.replace("{provider}", provider.displayName),
      );
      return;
    }

    setSocialProviderInFlight(provider.id);

    try {
      const result = await onSocialSignIn(provider.id);

      if (result.ok) {
        // The in-app session already signed the user in and this screen is about
        // to unmount; only the browser fallback still needs a hand-off hint.
        if (result.via === "external-browser") {
          setNoticeMessage(copy.authSocialRedirectNotice);
        }
        return;
      }

      // A cancelled consent sheet is a normal user action, not an error.
      if (result.reason === "failed") {
        setErrorMessage(getSafeResultMessage(result.message ?? "", copy.authSocialSignInFailed));
      }
    } catch {
      setErrorMessage(copy.authSocialSignInFailed);
    } finally {
      setSocialProviderInFlight(null);
    }
  };

  const handleFillDevelopmentCredentials = () => {
    if (!developmentCredentials || isSubmitting) {
      return;
    }

    setEmail(developmentCredentials.email);
    setPassword(developmentCredentials.password);
    setErrorMessage(null);
    setNoticeMessage(copy.authNativeDevCredentialsFilled);
  };

  const handleSubmit = async () => {
    if (submissionInFlight.current) {
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    clearFeedback();

    if (!normalizedEmail || !password) {
      setErrorMessage(copy.authNativeMissingFields);
      return;
    }

    if (!MOBILE_AUTH_EMAIL_PATTERN.test(normalizedEmail)) {
      setErrorMessage(copy.authNativeInvalidEmail);
      return;
    }

    submissionInFlight.current = true;
    setIsSubmitting(true);

    try {
      const result = await onSignIn({ email: normalizedEmail, password });

      if (!result.ok) {
        /*
         * SPEC-GIRIS-KAYIT §4.2 ve paket kararı K2 — ikinci adım ayrı ekran. Konteyner
         * challenge kimliğiyle yönlendirir; bu ekran hata göstermez, yoksa kullanıcı hem
         * yönlendirilir hem kırmızı bir bant görürdü.
         */
        if (result.requiresTwoFactor) {
          return;
        }

        setErrorMessage(getSafeResultMessage(result.message, copy.authNativeGenericError));
      }
    } catch {
      setErrorMessage(copy.authNativeGenericError);
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  // Dev/UAT convenience: pre-fill the sign-in form once with the development
  // credentials from .env.local (EXPO_PUBLIC_WHISPR_DEV_LOGIN_*) so testing does
  // not require typing them. Inert in production (developmentCredentials is null
  // unless __DEV__). Leaves the final "sign in" tap to the tester so the login
  // screen stays usable for other accounts.
  useEffect(() => {
    if (autoLoginDoneRef.current || !developmentCredentials) {
      return;
    }

    autoLoginDoneRef.current = true;
    setEmail(developmentCredentials.email);
    setPassword(developmentCredentials.password);
  }, [developmentCredentials]);

  return (
    <AuthScreenBackground
      centered={false}
      fill
      testID="mobile-auth-login-screen"
      visualVariant="welcome"
    >
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.mainScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.mainScroll}
        >
          <View style={styles.mainContent} testID="mobile-auth-login-main-content">
            <View style={styles.topSection}>
              {/*
               * SPEC-GIRIS-KAYIT §6/1 — başlık satırının sağında dil ve tema seçici durur;
               * karşılama ekranı kalktığı için geri satırı yok (K4).
               */}
              <Pressable
                accessibilityLabel={copy.identityStatesGroupLanguageSelector}
                accessibilityRole="button"
                onPress={onOpenLanguagePicker}
                style={styles.localeTrigger}
                testID="mobile-auth-login-language"
              >
                <Text maxFontSizeMultiplier={2} style={styles.localeTriggerLabel}>
                  {locale.toUpperCase()}
                </Text>
              </Pressable>
              <AuthEyebrowHeader
                eyebrow={copy.identityLoginEyebrow}
                subtitle={copy.identityLoginSubtitle}
                testID="mobile-auth-login-header"
                title={copy.identityLoginTitle}
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
              <AuthCheckbox
                checked={rememberMe}
                disabled={isSubmitting}
                label={copy.identityLoginRemember}
                onPress={() => setRememberMe((current) => !current)}
                style={styles.rememberMe}
                testID="mobile-auth-login-remember-me"
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
              <View style={styles.socialGrid}>
                {MOBILE_AUTH_SOCIAL_PROVIDERS.map((provider) => {
                  const label = copy[provider.labelCopyKey];

                  return (
                    <Pressable
                      key={provider.id}
                      {...(provider.status === "preview"
                        ? {
                            accessibilityHint: copy.authSocialProviderComingSoon.replace(
                              "{provider}",
                              provider.displayName,
                            ),
                          }
                        : {})}
                      accessibilityLabel={label}
                      accessibilityRole="button"
                      accessibilityState={{
                        busy: socialProviderInFlight === provider.id,
                        disabled: isSubmitting || socialProviderInFlight !== null,
                      }}
                      disabled={isSubmitting || socialProviderInFlight !== null}
                      onPress={() => void handleSocialPress(provider)}
                      style={[
                        styles.socialAction,
                        socialProviderInFlight !== null && socialProviderInFlight !== provider.id
                          ? styles.socialActionMuted
                          : null,
                      ]}
                      testID={provider.testID}
                    >
                      <AuthSocialProviderIcon
                        provider={provider.id}
                        testID={`${provider.testID}-icon`}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer} testID="mobile-auth-login-footer">
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
      </View>
    </AuthScreenBackground>
  );
}
