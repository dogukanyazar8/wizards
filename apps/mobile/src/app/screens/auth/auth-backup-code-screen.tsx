import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { mobileAuthMetrics, mobileAuthTypography } from "../../../design/tokens";
import { mobileCopy } from "../../../locale/mobile-copy";
import { AuthPrimaryButton, AuthScreenBackground, AuthTextField } from "../../components/kit/auth";
import { Icon } from "../../components/kit/icon";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";

/**
 * SPEC-GIRIS-KAYIT §4.3'ün mobil karşılığı.
 *
 * Referansta mobil yedek kod ekranı ayrı çizilmedi; SPEC §5'in masaüstü için koyduğu kural
 * ("aynı kabuk + web muadilinin içeriği") burada da uygulandı: 2FA ekranının kabuğu, web §4.3'ün
 * içeriği. Görüntü maskesi 4-4-2, sunucuya normalize (büyük harf, ayraçsız) değer gider.
 */

const GROUP_SIZES = [4, 4, 2];
const MAX_LENGTH = GROUP_SIZES.reduce((total, size) => total + size, 0);

export function formatMobileBackupCode(rawValue: string): string {
  const normalized = rawValue
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, MAX_LENGTH);
  const groups: string[] = [];
  let cursor = 0;

  for (const size of GROUP_SIZES) {
    if (cursor >= normalized.length) {
      break;
    }

    groups.push(normalized.slice(cursor, cursor + size));
    cursor += size;
  }

  return groups.join("-");
}

export interface AuthBackupCodeScreenProps {
  readonly onBackToSignIn: () => void;
  readonly onSubmit: (input: {
    backupCode: string;
  }) => Promise<{ ok: true } | { message: string; ok: false }>;
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
  codeInput: {
    ...mobileAuthTypography.codeDigit,
    letterSpacing: 2,
  },
  content: {
    gap: theme.spacing.section,
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
  subtitle: {
    ...mobileAuthTypography.description,
    color: theme.text.secondary,
  },
  title: {
    ...mobileAuthTypography.title,
    color: theme.text.primary,
  },
});

export function AuthBackupCodeScreen({ onBackToSignIn, onSubmit }: AuthBackupCodeScreenProps) {
  const styles = useThemedStyles(createStyles);
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const [value, setValue] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (isSubmitting || value.length === 0) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    const result = await onSubmit({ backupCode: value });
    setIsSubmitting(false);

    if (!result.ok) {
      setErrorMessage(result.message || copy.identityStatusCodeInvalidTitle);
    }
  };

  return (
    <AuthScreenBackground scrollable testID="mobile-auth-backup-code-screen">
      <View style={styles.content}>
        <Pressable
          accessibilityLabel={copy.identityCommonBackToLogin}
          accessibilityRole="button"
          onPress={onBackToSignIn}
          style={styles.backRow}
          testID="mobile-auth-backup-code-back"
        >
          <View style={styles.backSquare}>
            <Icon name="chevron-back" size={18} tone="muted" />
          </View>
          <Text maxFontSizeMultiplier={2} style={styles.backLabel}>
            {copy.identityCommonBackToLogin}
          </Text>
        </Pressable>

        <View>
          <Text maxFontSizeMultiplier={2} style={styles.eyebrow}>
            {copy.identityTwoFactorEyebrow}
          </Text>
          <Text maxFontSizeMultiplier={2} style={styles.title}>
            {copy.identityBackupCodeTitle}
          </Text>
          <Text maxFontSizeMultiplier={2} style={styles.subtitle}>
            {copy.identityBackupCodeSubtitle}
          </Text>
        </View>

        <AuthTextField
          autoCapitalize="characters"
          autoComplete="one-time-code"
          autoCorrect={false}
          inputStyle={styles.codeInput}
          label={copy.identityFieldBackupCode}
          onChangeText={(next) => setValue(formatMobileBackupCode(next))}
          placeholder="7QF4-2KDX-9M"
          testID="mobile-auth-backup-code-input"
          value={value}
          {...(errorMessage ? { errorMessage } : {})}
        />

        <AuthPrimaryButton
          busy={isSubmitting}
          disabled={value.length === 0 || isSubmitting}
          label={copy.identityTwoFactorCta}
          onPress={() => void handleSubmit()}
          testID="mobile-auth-backup-code-submit"
        />

        <Text maxFontSizeMultiplier={2} style={styles.footer}>
          {copy.identityFooterCopyright}
        </Text>
      </View>
    </AuthScreenBackground>
  );
}
