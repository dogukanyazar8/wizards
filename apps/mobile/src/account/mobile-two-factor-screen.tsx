import { useState } from "react";
import { Image, ScrollView, Text, TextInput, View } from "react-native";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { Button } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import type { MobileTheme } from "../design/themes";
import {
  confirmMobileTwoFactor,
  disableMobileTwoFactor,
  setupMobileTwoFactor,
} from "./mobile-two-factor-client";
import { mobileCopy } from "../locale/mobile-copy";

const createStyles = (theme: MobileTheme) => ({
  root: { backgroundColor: theme.surface.base, flex: 1 },
  content: { gap: theme.spacing.section, padding: theme.spacing.page, paddingBottom: 48 },
  card: {
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.card,
    borderWidth: 1,
    gap: 12,
    padding: theme.spacing.section,
  },
  title: { ...theme.typography.headline, color: theme.text.primary },
  sectionTitle: { ...theme.typography.title, color: theme.text.primary },
  body: { ...theme.typography.body, color: theme.text.muted },
  secret: { ...theme.typography.bodyStrong, color: theme.text.primary, letterSpacing: 2 },
  input: {
    ...theme.typography.body,
    backgroundColor: theme.surface.elevated,
    borderColor: theme.border.default,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    color: theme.text.primary,
    minHeight: theme.sizing.minTouchTarget,
    paddingHorizontal: 14,
  },
  qr: { alignSelf: "center" as const, height: 220, width: 220 },
  error: { ...theme.typography.body, color: theme.status.dangerOnBase },
  recovery: { ...theme.typography.bodyStrong, color: theme.text.primary },
});

type SetupState = Awaited<ReturnType<typeof setupMobileTwoFactor>>;

export function MobileTwoFactorScreen({ onBack }: { onBack(): void }) {
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const copy = mobileCopy[locale];
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState<"setup" | "confirm" | "disable" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSetup() {
    setBusy("setup");
    setError(null);
    try {
      setSetup(await setupMobileTwoFactor(apiClient));
    } catch {
      setError(
        copy.twoFactorSetupFailed,
      );
    } finally {
      setBusy(null);
    }
  }

  async function runConfirm() {
    setBusy("confirm");
    setError(null);
    try {
      const result = await confirmMobileTwoFactor(apiClient, code);
      setRecoveryCodes(result.recoveryCodes);
      setSetup(null);
      setCode("");
    } catch {
      setError(copy.twoFactorVerifyFailed);
    } finally {
      setBusy(null);
    }
  }

  async function runDisable() {
    setBusy("disable");
    setError(null);
    try {
      await disableMobileTwoFactor(apiClient, { code: disableCode, password });
      setDisableCode("");
      setPassword("");
      setRecoveryCodes([]);
    } catch {
      setError(
        copy.twoFactorDisableFailed,
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="mobile-security-screen"
    >
      <Button
        label={copy.twoFactorBack}
        variant="ghost"
        icon="arrow-back"
        onPress={onBack}
        testID="mobile-security-back"
      />
      <Text style={styles.title}>{copy.twoFactorSecurity}</Text>
      <Text style={styles.body}>
        {copy.twoFactorDescription}
      </Text>
      {recoveryCodes.length > 0 ? (
        <View style={styles.card} testID="mobile-2fa-recovery-codes">
          <Text style={styles.sectionTitle}>{copy.twoFactorRecoveryCodes}</Text>
          <Text style={styles.body}>
            {copy.twoFactorRecoveryCodesHint}
          </Text>
          {recoveryCodes.map((item) => (
            <Text key={item} style={styles.recovery}>
              {item}
            </Text>
          ))}
          <Button
            label={copy.twoFactorHideCodes}
            onPress={() => setRecoveryCodes([])}
            testID="mobile-2fa-recovery-dismiss"
          />
        </View>
      ) : null}
      <View style={styles.card} testID="mobile-2fa-setup-card">
        <Text style={styles.sectionTitle}>{copy.twoFactorSetupTitle}</Text>
        {!setup ? (
          <Button
            label={copy.twoFactorStartSetup}
            busy={busy === "setup"}
            onPress={() => void runSetup()}
            testID="mobile-2fa-setup-start"
          />
        ) : (
          <>
            <Image
              source={{ uri: setup.qrCodeDataUrl }}
              style={styles.qr}
              accessibilityLabel={copy.twoFactorQrCodeLabel}
              testID="mobile-2fa-qr"
            />
            <Text style={styles.body}>{copy.twoFactorManualKey}</Text>
            <Text selectable style={styles.secret} testID="mobile-2fa-manual-key">
              {setup.manualEntryKey}
            </Text>
            <TextInput
              accessibilityLabel={copy.twoFactorVerificationCode}
              keyboardType="number-pad"
              maxLength={64}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={theme.text.soft}
              style={styles.input}
              value={code}
              testID="mobile-2fa-confirm-code"
            />
            <Button
              label={copy.twoFactorEnable}
              busy={busy === "confirm"}
              disabled={code.trim().length < 6}
              onPress={() => void runConfirm()}
              testID="mobile-2fa-confirm"
            />
          </>
        )}
      </View>
      <View style={styles.card} testID="mobile-2fa-disable-card">
        <Text style={styles.sectionTitle}>{copy.twoFactorDisableTitle}</Text>
        <TextInput
          accessibilityLabel={copy.twoFactorAccountPassword}
          secureTextEntry
          autoCapitalize="none"
          onChangeText={setPassword}
          placeholder={copy.twoFactorPassword}
          placeholderTextColor={theme.text.soft}
          style={styles.input}
          value={password}
          testID="mobile-2fa-disable-password"
        />
        <TextInput
          accessibilityLabel={copy.twoFactorAuthenticatorCode}
          keyboardType="number-pad"
          maxLength={64}
          onChangeText={setDisableCode}
          placeholder="123456"
          placeholderTextColor={theme.text.soft}
          style={styles.input}
          value={disableCode}
          testID="mobile-2fa-disable-code"
        />
        <Button
          label={copy.twoFactorDisableAction}
          variant="danger"
          busy={busy === "disable"}
          disabled={!password || disableCode.trim().length < 6}
          onPress={() => void runDisable()}
          testID="mobile-2fa-disable"
        />
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}
