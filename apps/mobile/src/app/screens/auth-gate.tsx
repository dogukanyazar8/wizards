import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import whisprIcon from "../../../assets/whispr-icon.png";
import { getMobileDevLoginCredentials } from "../../auth/mobile-dev-login";
import { useTheme } from "../providers/mobile-theme-provider";
import { activeMobileCopy } from "../../locale/mobile-locale-preferences";
import { useAuthGateStyles } from "./auth-gate.styles";

const copy = activeMobileCopy;
type MobileIoniconName = ComponentProps<typeof Ionicons>["name"];

const MOBILE_AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_AUTH_USERNAME_PATTERN = /^[a-zA-Z0-9_]{2,32}$/;
const MOBILE_AUTH_MIN_PASSWORD_LENGTH = 8;

const premiumAuthDotPositions = Array.from({ length: 24 }, (_, index) => ({
  left: `${(index * 17) % 96}%` as `${number}%`,
  opacity: index % 3 === 0 ? 0.5 : 0.28,
  top: `${(index * 29) % 92}%` as `${number}%`,
}));

function normalizeMobileAuthInputEmail(value: string) {
  return value.trim().toLowerCase();
}
export function AuthGate({
  onOpenWebRegister,
  onOpenWebSignIn,
  onRegisterWithPassword,
  onRequestPasswordReset,
  onRequestVerificationEmail,
  onSignInWithPassword,
  reason,
}: {
  onOpenWebRegister(): void;
  onOpenWebSignIn(): void;
  onRegisterWithPassword(input: {
    confirmPassword: string;
    email: string;
    password: string;
    username: string;
  }): Promise<{ email: string; ok: true } | { message: string; ok: false }>;
  onRefresh(): void;
  onRequestPasswordReset(input: {
    email: string;
  }): Promise<{ email: string; ok: true } | { message: string; ok: false }>;
  onRequestVerificationEmail(input: {
    email: string;
  }): Promise<{ email: string; ok: true } | { message: string; ok: false }>;
  onSignInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<{ ok: true } | { message: string; ok: false }>;
  reason: "auth-required" | "checking" | null;
}) {
  const styles = useAuthGateStyles();
  const theme = useTheme();
  const isChecking = reason === "checking";
  const [mode, setMode] = useState<"forgot" | "register" | "sign-in">("sign-in");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileType, setProfileType] = useState<"corporate" | "gamer" | "personal">("personal");
  const [rememberMe, setRememberMe] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerificationSubmitting, setIsVerificationSubmitting] = useState(false);
  const devLoginCredentials = getMobileDevLoginCredentials();
  const passwordStrength = useMemo(() => getMobilePasswordStrength(password), [password]);

  const modeCopy =
    mode === "sign-in"
      ? {
          action: copy.authNativeSignInAction,
          description: copy.authWelcomeBackDescription,
          title: copy.authWelcomeBackTitle,
        }
      : mode === "register"
        ? {
            action: copy.authNativeRegisterAction,
            description: copy.authJoinDescription,
            title: copy.authJoinTitle,
          }
        : {
            action: copy.authNativeForgotAction,
            description: copy.authForgotDescription,
            title: copy.authForgotTitle,
          };

  const selectMode = (nextMode: "forgot" | "register" | "sign-in") => {
    setMode(nextMode);
    setFormError(null);
    setFormNotice(null);
  };

  const validateEmail = (value: string) => {
    if (!MOBILE_AUTH_EMAIL_PATTERN.test(value)) {
      return copy.authNativeInvalidEmail;
    }

    return null;
  };

  const validatePassword = (value: string) => {
    if (value.length < MOBILE_AUTH_MIN_PASSWORD_LENGTH) {
      return copy.authNativePasswordTooShort;
    }

    return null;
  };

  const validateUsername = (value: string) => {
    if (!MOBILE_AUTH_USERNAME_PATTERN.test(value)) {
      return copy.authNativeUsernameInvalid;
    }

    return null;
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    const trimmedEmail = normalizeMobileAuthInputEmail(email);
    const trimmedUsername = username.trim();
    setFormError(null);
    setFormNotice(null);

    if (!trimmedEmail || (mode !== "forgot" && !password)) {
      setFormError(copy.authNativeMissingFields);
      return;
    }

    const emailError = validateEmail(trimmedEmail);
    if (emailError) {
      setFormError(emailError);
      return;
    }

    if (mode !== "forgot") {
      const passwordError = validatePassword(password);
      if (passwordError) {
        setFormError(passwordError);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (mode === "sign-in") {
        const result = await onSignInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (!result.ok) {
          setFormError(result.message || copy.authNativeGenericError);
        }
        return;
      }

      if (mode === "register") {
        if (!trimmedUsername || !confirmPassword) {
          setFormError(copy.authNativeMissingFields);
          return;
        }

        const usernameError = validateUsername(trimmedUsername);
        if (usernameError) {
          setFormError(usernameError);
          return;
        }

        if (password !== confirmPassword) {
          setFormError(copy.authNativePasswordMismatch);
          return;
        }

        if (!termsAccepted) {
          setFormError(copy.authTermsAccepted);
          return;
        }

        const result = await onRegisterWithPassword({
          confirmPassword,
          email: trimmedEmail,
          password,
          username: trimmedUsername,
        });

        if (result.ok) {
          setFormNotice(copy.authNativeVerificationNotice.replace("{email}", result.email));
          setMode("sign-in");
          setPassword("");
          setConfirmPassword("");
        } else {
          setFormError(result.message || copy.authNativeGenericError);
        }
        return;
      }

      const result = await onRequestPasswordReset({ email: trimmedEmail });
      if (result.ok) {
        setFormNotice(copy.authNativeForgotNotice.replace("{email}", result.email));
        setMode("sign-in");
      } else {
        setFormError(result.message || copy.authNativeGenericError);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestVerificationEmail = async () => {
    if (isSubmitting || isVerificationSubmitting) {
      return;
    }

    const trimmedEmail = normalizeMobileAuthInputEmail(email);
    setFormError(null);
    setFormNotice(null);

    if (!trimmedEmail) {
      setFormError(copy.authNativeMissingFields);
      return;
    }

    const emailError = validateEmail(trimmedEmail);
    if (emailError) {
      setFormError(emailError);
      return;
    }

    setIsVerificationSubmitting(true);
    try {
      const result = await onRequestVerificationEmail({ email: trimmedEmail });
      if (result.ok) {
        setFormNotice(copy.authNativeVerificationResendNotice.replace("{email}", result.email));
        setMode("sign-in");
      } else {
        setFormError(result.message || copy.authNativeGenericError);
      }
    } finally {
      setIsVerificationSubmitting(false);
    }
  };

  const handleFillDevCredentials = () => {
    if (!devLoginCredentials || isSubmitting) {
      return;
    }

    setMode("sign-in");
    setEmail(devLoginCredentials.email);
    setPassword(devLoginCredentials.password);
    setConfirmPassword("");
    setUsername("");
    setTermsAccepted(false);
    setFormError(null);
    setFormNotice(copy.authNativeDevCredentialsFilled);
  };

  return (
    <AuthScreenLayout>
      {isChecking ? (
        <View style={styles.premiumAuthLoadingCard}>
          <View style={styles.premiumAuthLoadingIcon}>
            <ActivityIndicator color={theme.accent.strong} />
          </View>
          <Text style={styles.premiumAuthLoadingTitle}>{copy.authChecking}</Text>
          <Text style={styles.premiumAuthSubtitle}>{copy.gatedChecking}</Text>
        </View>
      ) : (
        <View style={styles.premiumAuthStack}>
          <AuthHeader title={modeCopy.title} description={modeCopy.description} />
          {mode !== "forgot" ? (
            <ProfileTypeSelector value={profileType} onChange={setProfileType} />
          ) : null}

          <View style={styles.premiumAuthFormCard}>
            {mode === "register" ? (
              <AuthInput
                accessibilityLabel={copy.authNativeUsernameLabel}
                autoCapitalize="none"
                autoComplete="username"
                iconName="person-outline"
                onChangeText={setUsername}
                placeholder={copy.authRegisterUsernamePlaceholder}
                returnKeyType="next"
                textContentType="username"
                value={username}
              />
            ) : null}
            <AuthInput
              accessibilityLabel={copy.authNativeEmailLabel}
              autoCapitalize="none"
              autoComplete="email"
              iconName="mail-outline"
              inputMode="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder={copy.authNativeEmailPlaceholder}
              returnKeyType={mode === "forgot" ? "done" : "next"}
              textContentType="emailAddress"
              value={email}
            />
            {mode !== "forgot" ? (
              <AuthInput
                accessibilityLabel={copy.authNativePasswordLabel}
                autoCapitalize="none"
                autoComplete={mode === "register" ? "new-password" : "password"}
                iconName="lock-closed-outline"
                isSecureVisible={showPassword}
                onChangeText={setPassword}
                onToggleSecure={() => setShowPassword((current) => !current)}
                placeholder={
                  mode === "register"
                    ? copy.authNativePasswordPlaceholder
                    : copy.authNativePasswordLabel
                }
                returnKeyType={mode === "register" ? "next" : "done"}
                secureTextEntry
                showSecureToggle
                textContentType={mode === "register" ? "newPassword" : "password"}
                value={password}
              />
            ) : null}
            {mode === "register" ? (
              <>
                <AuthInput
                  accessibilityLabel={copy.authNativeConfirmPasswordLabel}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  iconName="lock-closed-outline"
                  isSecureVisible={showConfirmPassword}
                  onChangeText={setConfirmPassword}
                  onToggleSecure={() => setShowConfirmPassword((current) => !current)}
                  placeholder={copy.authNativeConfirmPasswordPlaceholder}
                  returnKeyType="done"
                  secureTextEntry
                  showSecureToggle
                  textContentType="newPassword"
                  value={confirmPassword}
                />
                <PasswordStrengthBar strength={passwordStrength} />
              </>
            ) : null}

            {mode === "sign-in" ? (
              <View style={styles.premiumAuthInlineRow}>
                <AuthCheckbox
                  checked={rememberMe}
                  label={copy.authRememberMe}
                  onPress={() => setRememberMe((current) => !current)}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.authNativeForgotLink}
                  onPress={() => selectMode("forgot")}
                  style={({ pressed }) => [
                    styles.premiumAuthTextButton,
                    pressed && styles.actionButtonPressed,
                  ]}
                >
                  <Text style={styles.premiumAuthTextButtonText}>{copy.authNativeForgotLink}</Text>
                </Pressable>
              </View>
            ) : null}

            {mode === "register" ? (
              <AuthCheckbox
                checked={termsAccepted}
                label={copy.authLegalAccepted}
                onPress={() => setTermsAccepted((current) => !current)}
              />
            ) : null}

            {formError ? <Text style={styles.authFormError}>{formError}</Text> : null}
            {formNotice ? <Text style={styles.authFormNotice}>{formNotice}</Text> : null}

            {devLoginCredentials && mode === "sign-in" ? (
              <AuthSecondaryButton
                disabled={isSubmitting}
                label={copy.authNativeDevFillAction}
                onPress={handleFillDevCredentials}
              />
            ) : null}

            <AuthPrimaryButton
              disabled={isSubmitting}
              label={isSubmitting ? copy.authNativeSubmitting : modeCopy.action}
              onPress={() => void handleSubmit()}
            />

            {mode === "sign-in" ? (
              <>
                <AuthSecondaryButton
                  label={copy.authCreateAccountSecondary}
                  onPress={() => selectMode("register")}
                />
                <SocialLoginRow onOpenWebSignIn={onOpenWebSignIn} />
              </>
            ) : mode === "register" ? (
              <View style={styles.premiumAuthFooterRow}>
                <Text style={styles.premiumAuthFooterText}>{copy.authAlreadyHaveAccount}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.authModeSignIn}
                  onPress={() => selectMode("sign-in")}
                  style={({ pressed }) => [
                    styles.premiumAuthTextButton,
                    pressed && styles.actionButtonPressed,
                  ]}
                >
                  <Text style={styles.premiumAuthTextButtonText}>{copy.authModeSignIn}</Text>
                </Pressable>
              </View>
            ) : (
              <AuthSecondaryButton
                label={copy.authNativeBackToSignIn}
                onPress={() => selectMode("sign-in")}
              />
            )}

            {mode !== "forgot" ? (
              <AuthSecondaryButton
                disabled={isSubmitting || isVerificationSubmitting}
                label={
                  isVerificationSubmitting
                    ? copy.authNativeSubmitting
                    : copy.authNativeVerificationResendAction
                }
                onPress={() => void handleRequestVerificationEmail()}
              />
            ) : null}
          </View>

          <SecurityCard />
          <View style={styles.premiumAuthFooterRow}>
            <Ionicons name="lock-closed-outline" size={14} color={theme.text.muted} />
            <Text style={styles.premiumAuthFooterText}>{copy.authPrivacyFooter}</Text>
          </View>
        </View>
      )}
    </AuthScreenLayout>
  );
}

function getMobilePasswordStrength(password: string) {
  const checks = [
    password.length >= MOBILE_AUTH_MIN_PASSWORD_LENGTH,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;

  if (score >= 4) {
    return {
      label: copy.authPasswordStrengthStrong,
      ratio: 1,
      score,
      tone: "success" as const,
    };
  }

  if (score >= 2) {
    return {
      label: copy.authPasswordStrengthMedium,
      ratio: 0.66,
      score,
      tone: "accent" as const,
    };
  }

  return {
    label: copy.authPasswordStrengthWeak,
    ratio: password.length > 0 ? 0.33 : 0,
    score,
    tone: "warning" as const,
  };
}

function AuthScreenLayout({ children }: { children: ReactNode }) {
  const styles = useAuthGateStyles();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.premiumAuthScreen}
      testID="mobile-auth-screen"
    >
      <View style={styles.premiumAuthGlowTop} />
      <View style={styles.premiumAuthGlowBottom} />
      <View style={styles.premiumAuthDotField}>
        {premiumAuthDotPositions.map((position, index) => (
          <View key={index} style={[styles.premiumAuthDot, position]} />
        ))}
      </View>
      <View style={styles.premiumAuthContent}>{children}</View>
    </KeyboardAvoidingView>
  );
}

function AuthHeader({ description, title }: { description: string; title: string }) {
  const styles = useAuthGateStyles();
  return (
    <View style={styles.premiumAuthHeader}>
      <View style={styles.premiumAuthBrandRow}>
        <Image
          source={whisprIcon}
          style={styles.premiumAuthLogo}
          accessibilityLabel={copy.appTitle}
          accessibilityIgnoresInvertColors
        />
        <Text style={styles.premiumAuthBrandText}>Whispr</Text>
      </View>
      <Text maxFontSizeMultiplier={2} style={styles.premiumAuthTitle}>
        {title}
      </Text>
      <Text maxFontSizeMultiplier={2} style={styles.premiumAuthSubtitle}>
        {description}
      </Text>
    </View>
  );
}

function ProfileTypeSelector({
  onChange,
  value,
}: {
  onChange(nextValue: "corporate" | "gamer" | "personal"): void;
  value: "corporate" | "gamer" | "personal";
}) {
  const styles = useAuthGateStyles();
  const theme = useTheme();
  const options: Array<{
    color: string;
    icon: MobileIoniconName;
    label: string;
    preview: boolean;
    value: "corporate" | "gamer" | "personal";
  }> = [
    {
      color: theme.status.success,
      icon: "person-outline",
      label: copy.authProfilePersonal,
      preview: false,
      value: "personal",
    },
    {
      color: theme.accent.default,
      icon: "game-controller-outline",
      label: copy.authProfileGamer,
      preview: true,
      value: "gamer",
    },
    {
      color: theme.status.info,
      icon: "briefcase-outline",
      label: copy.authProfileCorporate,
      preview: true,
      value: "corporate",
    },
  ];

  return (
    <View style={styles.premiumAuthProfileGrid}>
      {options.map((option) => {
        const active = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.premiumAuthProfileOption,
              active && styles.premiumAuthProfileOptionActive,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <View style={styles.premiumAuthProfileIcon}>
              <Ionicons name={option.icon} size={16} color={option.color} />
            </View>
            <Text
              maxFontSizeMultiplier={2}
              style={styles.premiumAuthProfileLabel}
              numberOfLines={1}
            >
              {option.label}
            </Text>
            {option.preview ? (
              <Text style={styles.premiumAuthProfilePreviewPill} numberOfLines={1}>
                {copy.authProfilePreviewLabel}
              </Text>
            ) : null}
            {active ? (
              <View style={styles.premiumAuthProfileCheck}>
                <Ionicons name="checkmark" size={12} color={theme.text.onPrimary} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function AuthInput({
  accessibilityLabel,
  autoCapitalize = "sentences",
  autoComplete,
  iconName,
  inputMode,
  isSecureVisible = false,
  keyboardType,
  onChangeText,
  onToggleSecure,
  placeholder,
  returnKeyType,
  secureTextEntry = false,
  showSecureToggle = false,
  textContentType,
  value,
}: {
  accessibilityLabel: string;
  autoCapitalize?: ComponentProps<typeof TextInput>["autoCapitalize"];
  autoComplete?: ComponentProps<typeof TextInput>["autoComplete"];
  iconName: MobileIoniconName;
  inputMode?: ComponentProps<typeof TextInput>["inputMode"];
  isSecureVisible?: boolean;
  keyboardType?: ComponentProps<typeof TextInput>["keyboardType"];
  onChangeText(value: string): void;
  onToggleSecure?: () => void;
  placeholder: string;
  returnKeyType?: ComponentProps<typeof TextInput>["returnKeyType"];
  secureTextEntry?: boolean;
  showSecureToggle?: boolean;
  textContentType?: ComponentProps<typeof TextInput>["textContentType"];
  value: string;
}) {
  const styles = useAuthGateStyles();
  const theme = useTheme();
  const isProtected = secureTextEntry && !isSecureVisible;

  return (
    <View style={styles.premiumAuthInputShell}>
      <Ionicons name={iconName} size={19} color={theme.text.muted} />
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={false}
        inputMode={inputMode}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.text.soft}
        returnKeyType={returnKeyType}
        secureTextEntry={isProtected}
        style={styles.premiumAuthInput}
        textContentType={textContentType}
        value={value}
      />
      {showSecureToggle && onToggleSecure ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isSecureVisible ? copy.hideSensitiveAction : copy.showSensitiveAction}
          onPress={onToggleSecure}
          style={({ pressed }) => [
            styles.premiumAuthIconButton,
            pressed && styles.actionButtonPressed,
          ]}
        >
          <Ionicons
            name={isSecureVisible ? "eye-off-outline" : "eye-outline"}
            size={20}
            color={theme.text.muted}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

function AuthCheckbox({
  checked,
  label,
  onPress,
}: {
  checked: boolean;
  label: string;
  onPress(): void;
}) {
  const styles = useAuthGateStyles();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.premiumAuthCheckboxRow,
        pressed && styles.actionButtonPressed,
      ]}
    >
      <View style={[styles.premiumAuthCheckbox, checked && styles.premiumAuthCheckboxChecked]}>
        {checked ? <Ionicons name="checkmark" size={14} color={theme.text.onPrimary} /> : null}
      </View>
      <Text style={styles.premiumAuthCheckboxText}>{label}</Text>
    </Pressable>
  );
}

function AuthPrimaryButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress(): void;
}) {
  const styles = useAuthGateStyles();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.premiumAuthPrimaryButton,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
    >
      <Text style={styles.premiumAuthPrimaryButtonText}>{label}</Text>
      <Ionicons name="arrow-forward" size={20} color={theme.text.onPrimary} />
    </Pressable>
  );
}

function AuthSecondaryButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress(): void;
}) {
  const styles = useAuthGateStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.premiumAuthSecondaryButton,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
    >
      <Text style={styles.premiumAuthSecondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SocialLoginRow({ onOpenWebSignIn }: { onOpenWebSignIn(): void }) {
  const styles = useAuthGateStyles();
  const theme = useTheme();
  const providers: Array<{
    asset?: "whispr";
    color: string;
    icon?: MobileIoniconName;
    label: string;
    testID: string;
  }> = [
    {
      color: theme.status.danger,
      icon: "logo-google",
      label: copy.authSocialGoogle,
      testID: "mobile-auth-social-google",
    },
    {
      color: theme.status.info,
      icon: "logo-microsoft",
      label: copy.authSocialMicrosoft,
      testID: "mobile-auth-social-microsoft",
    },
    {
      color: theme.text.primary,
      icon: "logo-apple",
      label: copy.authSocialApple,
      testID: "mobile-auth-social-apple",
    },
    {
      asset: "whispr",
      color: theme.accent.strong,
      label: copy.authSocialWhisprWeb,
      testID: "mobile-auth-social-whispr",
    },
  ];

  return (
    <View style={styles.premiumAuthSocialGroup}>
      <View style={styles.premiumAuthDividerRow}>
        <View style={styles.premiumAuthDivider} />
        <Text style={styles.premiumAuthDividerText}>{copy.authNativeWebFallbackTitle}</Text>
        <View style={styles.premiumAuthDivider} />
      </View>
      <View style={styles.premiumAuthSocialRow}>
        {providers.map((provider) => (
          <Pressable
            key={provider.label}
            accessibilityRole="button"
            accessibilityLabel={provider.label}
            onPress={onOpenWebSignIn}
            testID={provider.testID}
            style={({ pressed }) => [
              styles.premiumAuthSocialButton,
              pressed && styles.actionButtonPressed,
            ]}
          >
            {provider.asset === "whispr" ? (
              <Image
                source={whisprIcon}
                style={styles.premiumAuthSocialWhisprIcon}
                accessibilityIgnoresInvertColors
              />
            ) : provider.icon ? (
              <Ionicons name={provider.icon} size={20} color={provider.color} />
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SecurityCard() {
  const styles = useAuthGateStyles();
  const theme = useTheme();
  return (
    <View style={styles.premiumAuthSecurityCard}>
      <View style={styles.premiumAuthSecurityIcon}>
        <Ionicons name="shield-checkmark" size={21} color={theme.status.successText} />
      </View>
      <View style={styles.premiumAuthSecurityText}>
        <Text style={styles.premiumAuthSecurityTitle}>{copy.authSecurityStatus}</Text>
        <Text style={styles.premiumAuthSecurityDescription}>{copy.authSecurityDescription}</Text>
      </View>
      <View style={styles.premiumAuthCloudflareBadge}>
        <Ionicons name="cloud" size={18} color={theme.status.warning} />
        <Text style={styles.premiumAuthCloudflareText}>{copy.authSecurityBadge}</Text>
      </View>
    </View>
  );
}

function PasswordStrengthBar({
  strength,
}: {
  strength: ReturnType<typeof getMobilePasswordStrength>;
}) {
  const styles = useAuthGateStyles();
  const theme = useTheme();
  const strengthFillStyle =
    strength.tone === "success"
      ? styles.premiumAuthStrengthFillSuccess
      : strength.tone === "accent"
        ? styles.premiumAuthStrengthFillAccent
        : styles.premiumAuthStrengthFillWarning;
  const strengthLabelStyle =
    strength.tone === "success"
      ? styles.premiumAuthStrengthLabelSuccess
      : strength.tone === "accent"
        ? styles.premiumAuthStrengthLabelAccent
        : styles.premiumAuthStrengthLabelWarning;
  return (
    <View style={styles.premiumAuthStrength}>
      <View style={styles.premiumAuthStrengthHeader}>
        <Ionicons name="shield-checkmark-outline" size={15} color={theme.status.success} />
        <Text style={styles.premiumAuthStrengthText}>{copy.authPasswordStrengthHint}</Text>
      </View>
      <View style={styles.premiumAuthStrengthTrack}>
        <View
          style={[styles.premiumAuthStrengthFill, strengthFillStyle, { flex: strength.ratio }]}
        />
        <View style={{ flex: Math.max(1 - strength.ratio, 0) }} />
      </View>
      {strength.score > 0 ? (
        <Text style={[styles.premiumAuthStrengthLabel, strengthLabelStyle]}>{strength.label}</Text>
      ) : null}
    </View>
  );
}
