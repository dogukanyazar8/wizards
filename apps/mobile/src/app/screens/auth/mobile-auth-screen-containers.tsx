import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ActivityIndicator, Text, View } from "react-native";

import { useMobileAuth } from "../../../auth/mobile-auth-context";
import { getMobileDevLoginCredentials } from "../../../auth/mobile-dev-login";
import type { MobileAuthStackParamList } from "../../../navigation/mobile-auth-navigation-types";
import { mobileCopy } from "../../../locale/mobile-copy";
import { AuthScreenBackground } from "../../components/kit/auth/auth-screen-background";
import { AuthPrimaryButton } from "../../components/kit/auth/auth-primary-button";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import { AuthForgotPasswordScreen } from "./auth-forgot-password-screen";
import { AuthLanguagePickerSheet } from "./auth-language-picker-sheet";
import { AuthLoginScreen } from "./auth-login-screen";
import { AuthRegisterScreen } from "./auth-register-screen";
import { AuthWelcomeScreen } from "./auth-welcome-screen";

type WelcomeScreenProps = NativeStackScreenProps<MobileAuthStackParamList, "Welcome">;
type LoginScreenProps = NativeStackScreenProps<MobileAuthStackParamList, "Login">;
type RegisterScreenProps = NativeStackScreenProps<MobileAuthStackParamList, "Register">;
type ForgotPasswordScreenProps = NativeStackScreenProps<MobileAuthStackParamList, "ForgotPassword">;

const createSessionCheckingStyles = (theme: ReturnType<typeof useTheme>) => ({
  card: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.card,
    borderWidth: theme.layout.border.hairline,
    gap: theme.spacing.row,
    minWidth: 0,
    padding: theme.spacing.section,
  },
  icon: {
    alignItems: "center" as const,
    backgroundColor: theme.accent.soft,
    borderRadius: theme.radii.control,
    height: theme.sizing.minTouchTarget,
    justifyContent: "center" as const,
    width: theme.sizing.minTouchTarget,
  },
  subtitle: {
    ...theme.typography.authSubtitle,
    color: theme.text.muted,
    textAlign: "center" as const,
  },
  title: {
    ...theme.typography.authCta,
    color: theme.text.primary,
    textAlign: "center" as const,
  },
});

function navigateBackOrWelcome(
  navigation: LoginScreenProps["navigation"] | RegisterScreenProps["navigation"],
) {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }

  navigation.navigate("Welcome");
}

export function MobileAuthSessionCheckingContainer() {
  const theme = useTheme();
  const styles = useThemedStyles(createSessionCheckingStyles);
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];

  return (
    <AuthScreenBackground testID="mobile-auth-session-checking">
      <View accessibilityRole="progressbar" style={styles.card}>
        <View style={styles.icon}>
          <ActivityIndicator color={theme.accent.strong} />
        </View>
        <Text maxFontSizeMultiplier={2} style={styles.title}>
          {copy.authChecking}
        </Text>
        <Text maxFontSizeMultiplier={2} style={styles.subtitle}>
          {copy.gatedChecking}
        </Text>
      </View>
    </AuthScreenBackground>
  );
}

export function MobileAuthSessionErrorContainer() {
  const styles = useThemedStyles(createSessionCheckingStyles);
  const { error, refreshSessionFromStorage } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];

  return (
    <AuthScreenBackground testID="mobile-auth-session-error">
      <View style={styles.card}>
        <Text maxFontSizeMultiplier={2} style={styles.title}>
          {error ?? copy.authSessionReadFailed}
        </Text>
        <Text maxFontSizeMultiplier={2} style={styles.subtitle}>
          {copy.authSummary}
        </Text>
        <AuthPrimaryButton
          iconName="refresh"
          label={copy.retryAction}
          onPress={() => void refreshSessionFromStorage()}
          testID="mobile-auth-session-retry"
        />
      </View>
    </AuthScreenBackground>
  );
}

export function MobileAuthWelcomeScreenContainer({ navigation }: WelcomeScreenProps) {
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const { locale, selectLocale, setUseDeviceLocale, usingDeviceLocale } = useMobileLocaleRuntime();

  return (
    <>
      <AuthWelcomeScreen
        onOpenLanguagePicker={() => setLanguagePickerOpen(true)}
        onSignIn={() => navigation.navigate("Login")}
        onSignUp={() => navigation.navigate("Register")}
      />
      <AuthLanguagePickerSheet
        locale={locale}
        onClose={() => setLanguagePickerOpen(false)}
        onSelectLocale={selectLocale}
        onSetUseDeviceLocale={setUseDeviceLocale}
        open={languagePickerOpen}
        usingDeviceLocale={usingDeviceLocale}
      />
    </>
  );
}

export function MobileAuthLoginScreenContainer({ navigation }: LoginScreenProps) {
  const auth = useMobileAuth();
  const developmentCredentials = getMobileDevLoginCredentials();

  return (
    <AuthLoginScreen
      developmentCredentials={developmentCredentials}
      onBack={() => navigateBackOrWelcome(navigation)}
      onForgotPassword={() => navigation.navigate("ForgotPassword")}
      onRegister={() => navigation.navigate("Register")}
      onSignIn={auth.signInWithPassword}
      onSocialSignIn={auth.startSocialSignIn}
    />
  );
}

export function MobileAuthRegisterScreenContainer({ navigation }: RegisterScreenProps) {
  const auth = useMobileAuth();

  return (
    <AuthRegisterScreen
      onBack={() => navigateBackOrWelcome(navigation)}
      onRegister={auth.registerWithPassword}
      onSignIn={() => navigation.navigate("Login")}
    />
  );
}

export function MobileAuthForgotPasswordScreenContainer({ navigation }: ForgotPasswordScreenProps) {
  const auth = useMobileAuth();

  return (
    <AuthForgotPasswordScreen
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }

        navigation.navigate("Login");
      }}
      onRequestPasswordReset={auth.requestPasswordReset}
    />
  );
}
