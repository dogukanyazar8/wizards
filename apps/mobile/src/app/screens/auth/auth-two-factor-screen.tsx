import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { mobileAuthMetrics, mobileAuthTypography } from "../../../design/tokens";
import { mobileCopy } from "../../../locale/mobile-copy";
import {
  AuthCheckbox,
  AuthCodeCells,
  AuthPrimaryButton,
  AuthScreenBackground,
} from "../../components/kit/auth";
import { Icon } from "../../components/kit/icon";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import { AuthWelcomeBrandMark } from "./auth-welcome-brand-mark";

/**
 * SPEC-GIRIS-KAYIT §6/3 — mobil iki adımlı doğrulama.
 *
 * Geri satırı (36px kare + `Giriş ekranına dön`) · 74px halka + `scale(.95)` işaret · eyebrow ·
 * altı eşit hücre · `Bu cihazı 30 gün hatırla` · birincil düğme · `Yedek kod ile giriş yap` ·
 * alt bilgi.
 *
 * Altı hane girildiğinde form **otomatik gönderilmez** (paket kararı, SPEC §4.2 ile aynı gerekçe).
 */

export interface AuthTwoFactorScreenProps {
  readonly onBackToSignIn: () => void;
  readonly onSubmit: (input: {
    code: string;
    rememberDevice: boolean;
  }) => Promise<{ ok: true } | { message: string; ok: false }>;
  readonly onUseBackupCode: () => void;
}

const createStyles = (theme: ReturnType<typeof useTheme>) => ({
  backLabel: {
    ...mobileAuthTypography.label,
    color: theme.text.secondary,
  },
  backRow: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: theme.spacing.row,
    minHeight: mobileAuthMetrics.backRowMinHeight,
  },
  backSquare: {
    alignItems: "center" as const,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.control,
    borderWidth: theme.layout.border.hairline,
    height: mobileAuthMetrics.backRowSquare,
    justifyContent: "center" as const,
    width: mobileAuthMetrics.backRowSquare,
  },
  content: {
    gap: theme.spacing.section,
  },
  error: {
    ...mobileAuthTypography.hint,
    color: theme.status.dangerOnBase,
  },
  eyebrow: {
    ...mobileAuthTypography.eyebrow,
    color: theme.text.muted,
    textTransform: "uppercase" as const,
  },
  footer: {
    ...mobileAuthTypography.footer,
    color: theme.text.muted,
    textAlign: "center" as const,
  },
  link: {
    ...mobileAuthTypography.label,
    color: theme.accent.strong,
    textAlign: "center" as const,
  },
  ring: {
    alignItems: "center" as const,
    alignSelf: "flex-start" as const,
    height: mobileAuthMetrics.ringSize,
    justifyContent: "center" as const,
    width: mobileAuthMetrics.ringSize,
  },
  subtitle: {
    ...mobileAuthTypography.description,
    color: theme.text.secondary,
  },
  title: {
    ...mobileAuthTypography.title,
    color: theme.text.primary,
  },
});

export function AuthTwoFactorScreen({
  onBackToSignIn,
  onSubmit,
  onUseBackupCode,
}: AuthTwoFactorScreenProps) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const [code, setCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (isSubmitting || code.length !== mobileAuthMetrics.codeCellCount) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    const result = await onSubmit({ code, rememberDevice });
    setIsSubmitting(false);

    if (!result.ok) {
      setErrorMessage(result.message || copy.identityStatusCodeInvalidTitle);
    }
  };

  return (
    <AuthScreenBackground scrollable testID="mobile-auth-two-factor-screen">
      <View style={styles.content}>
        <Pressable
          accessibilityLabel={copy.identityCommonBackToLogin}
          accessibilityRole="button"
          onPress={onBackToSignIn}
          style={styles.backRow}
          testID="mobile-auth-two-factor-back"
        >
          <View style={styles.backSquare}>
            <Icon name="chevron-back" size={18} tone="muted" />
          </View>
          <Text maxFontSizeMultiplier={2} style={styles.backLabel}>
            {copy.identityCommonBackToLogin}
          </Text>
        </Pressable>

        <View style={styles.ring}>
          <AuthWelcomeBrandMark testID="mobile-auth-two-factor-brand-mark" />
        </View>

        <View>
          <Text maxFontSizeMultiplier={2} style={styles.eyebrow}>
            {copy.identityTwoFactorEyebrow}
          </Text>
          <Text maxFontSizeMultiplier={2} style={styles.title}>
            {copy.identityTwoFactorTitle}
          </Text>
          <Text maxFontSizeMultiplier={2} style={styles.subtitle}>
            {copy.identityTwoFactorSubtitle}
          </Text>
        </View>

        <AuthCodeCells
          accessibilityLabel={copy.identityFieldCode}
          autoFocus
          editable={!isSubmitting}
          onChange={setCode}
          testID="mobile-auth-two-factor-code"
          {...(errorMessage ? { tone: "danger" as const } : {})}
          value={code}
        />

        {errorMessage ? (
          <Text
            accessibilityLiveRegion="polite"
            maxFontSizeMultiplier={2}
            style={styles.error}
            testID="mobile-auth-two-factor-error"
          >
            {errorMessage}
          </Text>
        ) : null}

        <AuthCheckbox
          checked={rememberDevice}
          label={copy.identityTwoFactorRememberDevice}
          onPress={() => setRememberDevice((current) => !current)}
          testID="mobile-auth-two-factor-remember"
        />

        <AuthPrimaryButton
          busy={isSubmitting}
          disabled={code.length !== mobileAuthMetrics.codeCellCount || isSubmitting}
          label={copy.identityTwoFactorCta}
          onPress={() => void handleSubmit()}
          testID="mobile-auth-two-factor-submit"
        />

        <Pressable
          accessibilityRole="button"
          onPress={onUseBackupCode}
          testID="mobile-auth-two-factor-backup"
        >
          <Text maxFontSizeMultiplier={2} style={styles.link}>
            {copy.identityTwoFactorUseBackup}
          </Text>
        </Pressable>

        <Text maxFontSizeMultiplier={2} style={styles.footer}>
          {copy.identityFooterCopyright}
        </Text>
      </View>
    </AuthScreenBackground>
  );
}
