import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import {
  getMobilePasswordChangeFailure,
  type MobilePasswordChangeFailure,
} from "../../account/mobile-account-password-client";
import {
  useMobileAccountSettingsQuery,
  useMobileChangePasswordMutation,
} from "../../account/mobile-account-settings-query";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import type { MobileSessionDiagnostics } from "../../auth/session-types";
import { mobileCopy, type MobileLocale } from "../../locale/mobile-copy";
import type { MobileAppLockAvailability } from "../../security/mobile-app-lock";
import type { MobileDeviceIntegrityStatus } from "../../security/mobile-device-integrity";
import { BottomSheet, Button, DestructiveConfirmationSheet, Toggle } from "../components/kit";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMobileSecuritySettingsStyles } from "./mobile-security-settings-screen.styles";

type SecurityIconTone = "amber" | "danger" | "green" | "indigo" | "muted";
type SecurityBadgeTone = "danger" | "success" | "warning";
type IoniconName = keyof typeof Ionicons.glyphMap;

const MINIMUM_PASSWORD_LENGTH = 8;

function useIconTone(tone: SecurityIconTone) {
  const theme = useTheme();
  const styles = useMobileSecuritySettingsStyles();
  switch (tone) {
    case "amber":
      return { boxStyle: styles.iconBoxAmber, color: theme.status.warning };
    case "danger":
      return { boxStyle: styles.iconBoxDanger, color: theme.status.danger };
    case "green":
      return { boxStyle: styles.iconBoxGreen, color: theme.status.success };
    case "muted":
      return { boxStyle: styles.iconBoxMuted, color: theme.text.muted };
    case "indigo":
    default:
      return { boxStyle: styles.iconBoxIndigo, color: theme.accent.default };
  }
}

function SecurityIconBox({ icon, tone }: { icon: IoniconName; tone: SecurityIconTone }) {
  const styles = useMobileSecuritySettingsStyles();
  const { boxStyle, color } = useIconTone(tone);
  return (
    <View style={[styles.iconBox, boxStyle]}>
      <Ionicons color={color} name={icon} size={17} />
    </View>
  );
}

function SecurityStatusBadge({ label, tone }: { label: string; tone: SecurityBadgeTone }) {
  const styles = useMobileSecuritySettingsStyles();
  return (
    <View
      style={[
        styles.statusBadge,
        tone === "warning" && styles.statusBadgeWarning,
        tone === "danger" && styles.statusBadgeDanger,
      ]}
    >
      <View
        style={[
          styles.statusDot,
          tone === "warning" && styles.statusDotWarning,
          tone === "danger" && styles.statusDotDanger,
        ]}
      />
      <Text
        style={[
          styles.statusBadgeText,
          tone === "warning" && styles.statusBadgeTextWarning,
          tone === "danger" && styles.statusBadgeTextDanger,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function SecurityRow({
  badge,
  danger = false,
  disabled = false,
  hint,
  icon,
  isLast = false,
  label,
  onPress,
  soonLabel,
  testID,
  toggle,
  tone,
  value,
}: {
  badge?: { label: string; tone: SecurityBadgeTone };
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
  icon: IoniconName;
  isLast?: boolean;
  label: string;
  onPress?: () => void;
  soonLabel?: string;
  testID: string;
  toggle?: { onValueChange(next: boolean): void; value: boolean };
  tone: SecurityIconTone;
  value?: string;
}) {
  const theme = useTheme();
  const styles = useMobileSecuritySettingsStyles();
  const body = (
    <>
      <SecurityIconBox icon={icon} tone={tone} />
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {badge ? <SecurityStatusBadge label={badge.label} tone={badge.tone} /> : null}
      {value ? (
        <Text numberOfLines={1} style={styles.rowValue}>
          {value}
        </Text>
      ) : null}
      {soonLabel ? (
        <View style={styles.soonBadge}>
          <Text style={styles.soonBadgeText}>{soonLabel}</Text>
        </View>
      ) : null}
      {onPress && !soonLabel ? (
        <Ionicons color={theme.text.soft} name="chevron-forward" size={16} />
      ) : null}
    </>
  );

  if (toggle) {
    return (
      <View
        style={[styles.row, !isLast && styles.rowDivider, disabled && styles.rowDisabled]}
        testID={testID}
      >
        <SecurityIconBox icon={icon} tone={tone} />
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>{label}</Text>
          {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
        </View>
        <Toggle
          accessibilityLabel={label}
          disabled={disabled}
          onValueChange={toggle.onValueChange}
          testID={`${testID}-toggle`}
          value={toggle.value}
        />
      </View>
    );
  }

  if (!onPress) {
    return (
      <View
        style={[styles.row, !isLast && styles.rowDivider, disabled && styles.rowDisabled]}
        testID={testID}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !isLast && styles.rowDivider,
        disabled && styles.rowDisabled,
        pressed && !disabled && styles.pressed,
      ]}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}

export function getMobileDeviceIntegrityLabel(
  locale: MobileLocale,
  status: MobileDeviceIntegrityStatus,
): string {
  const copy = mobileCopy[locale];
  switch (status) {
    case "checking":
      return copy.securitySettingsDeviceIntegrityChecking;
    case "clean":
      return copy.securitySettingsDeviceIntegrityClean;
    case "compromised":
      return copy.securitySettingsDeviceIntegrityCompromised;
    case "emulator":
      return copy.securitySettingsDeviceIntegrityEmulator;
    case "unavailable":
    default:
      return copy.securitySettingsDeviceIntegrityUnknown;
  }
}

export function getMobileSessionExpiryHint(
  locale: MobileLocale,
  secondsUntilExpiry: number | null,
): string | undefined {
  const copy = mobileCopy[locale];
  if (secondsUntilExpiry === null) {
    return undefined;
  }

  if (secondsUntilExpiry <= 0) {
    return copy.securitySettingsSessionExpiredHint;
  }

  return copy.securitySettingsSessionExpiryHint.replace(
    "{minutes}",
    String(Math.max(1, Math.ceil(secondsUntilExpiry / 60))),
  );
}

export function getMobilePasswordFailureMessage(
  locale: MobileLocale,
  failure: MobilePasswordChangeFailure,
): string {
  const copy = mobileCopy[locale];
  switch (failure) {
    case "invalid-credentials":
      return copy.securitySettingsPasswordInvalidCurrent;
    case "password-unavailable":
      return copy.securitySettingsPasswordUnavailable;
    case "rate-limited":
      return copy.securitySettingsPasswordRateLimited;
    case "weak-password":
      return copy.securitySettingsPasswordTooShort;
    case "unknown":
    default:
      return copy.securitySettingsPasswordError;
  }
}

export function MobileSecuritySettingsScreen({
  appLockAvailability,
  appLockEnabled,
  isSignedIn,
  onBack,
  onOpenTwoFactor,
  onRefreshSession,
  onSignOut,
  onToggleAppLock,
  sessionDiagnostics,
}: {
  appLockAvailability: MobileAppLockAvailability;
  appLockEnabled: boolean;
  isSignedIn: boolean;
  onBack(): void;
  onOpenTwoFactor(): void;
  onRefreshSession(): void;
  onSignOut(): void;
  onToggleAppLock(enabled: boolean): void;
  sessionDiagnostics: MobileSessionDiagnostics;
}) {
  const theme = useTheme();
  const styles = useMobileSecuritySettingsStyles();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const { selection } = useMobileHaptics();
  const { apiClient, deviceIntegrityStatus, status } = useMobileAuth();
  const accountQuery = useMobileAccountSettingsQuery(apiClient, status === "signed-in");
  const changePassword = useMobileChangePasswordMutation(apiClient);
  const [passwordSheetOpen, setPasswordSheetOpen] = useState(false);
  const [signOutSheetOpen, setSignOutSheetOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [sessionRefreshed, setSessionRefreshed] = useState(false);

  const account = accountQuery.data?.account;
  const isSessionActive = sessionDiagnostics.hasSession && !sessionDiagnostics.isExpired;
  const sessionExpiryHint = getMobileSessionExpiryHint(
    locale,
    sessionDiagnostics.secondsUntilExpiry,
  );
  const appLockUnavailable = appLockAvailability !== "available";

  const closePasswordSheet = () => {
    setPasswordSheetOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
  };

  const submitPassword = async () => {
    if (newPassword.length < MINIMUM_PASSWORD_LENGTH) {
      setPasswordError(copy.securitySettingsPasswordTooShort);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(copy.securitySettingsPasswordMismatch);
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError(copy.securitySettingsPasswordReused);
      return;
    }

    setPasswordError(null);
    try {
      await changePassword.mutateAsync({ confirmPassword, currentPassword, newPassword });
    } catch (error) {
      setPasswordError(getMobilePasswordFailureMessage(locale, getMobilePasswordChangeFailure(error)));
      return;
    }

    selection();
    setPasswordSaved(true);
    closePasswordSheet();
  };

  const refreshSession = () => {
    selection();
    onRefreshSession();
    setSessionRefreshed(true);
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.root}
        testID="mobile-security-settings-screen"
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={copy.authBackAction}
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            testID="mobile-security-settings-back"
          >
            <View style={styles.backVisual}>
              <Ionicons color={theme.text.primary} name="chevron-back" size={18} />
            </View>
          </Pressable>
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={styles.title}>
              {copy.securitySettingsTitle}
            </Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {copy.securitySettingsSubtitle}
            </Text>
          </View>
        </View>

        <View style={styles.statusCard} testID="mobile-security-status-card">
          <View style={[styles.statusIcon, !isSessionActive && styles.statusIconAttention]}>
            <Ionicons
              color={theme.text.onPrimary}
              name={isSessionActive ? "shield-checkmark" : "alert-circle"}
              size={34}
            />
          </View>
          <View style={styles.statusText}>
            <Text style={styles.statusTitle}>
              {isSessionActive
                ? copy.securitySettingsStatusSecureTitle
                : copy.securitySettingsStatusAttentionTitle}
            </Text>
            <Text style={styles.statusDescription}>
              {isSessionActive
                ? copy.securitySettingsStatusSecureDescription
                : copy.securitySettingsStatusAttentionDescription}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={copy.securitySettingsRefreshSession}
            accessibilityRole="button"
            accessibilityState={{ disabled: !isSignedIn }}
            disabled={!isSignedIn}
            onPress={refreshSession}
            style={({ pressed }) => [
              styles.refreshButton,
              !isSignedIn && styles.refreshButtonDisabled,
              pressed && isSignedIn && styles.pressed,
            ]}
            testID="mobile-security-refresh-session"
          >
            <Ionicons color={theme.text.onPrimary} name="refresh" size={15} />
            <Text style={styles.refreshButtonLabel}>{copy.securitySettingsRefreshSession}</Text>
          </Pressable>
          {sessionRefreshed ? (
            <Text style={styles.refreshStatus}>{copy.securitySettingsRefreshed}</Text>
          ) : null}
        </View>

        <Text style={styles.sectionHeading}>{copy.securitySettingsSignInHeading}</Text>
        <View style={styles.card}>
          <SecurityRow
            badge={{
              label: account?.emailVerified
                ? copy.securitySettingsEmailVerified
                : copy.securitySettingsEmailUnverified,
              tone: account?.emailVerified ? "success" : "warning",
            }}
            icon="mail-outline"
            label={copy.securitySettingsEmailVerification}
            testID="mobile-security-email"
            tone="indigo"
          />
          <SecurityRow
            hint={copy.securitySettingsTwoFactorHint}
            icon="shield-checkmark-outline"
            label={copy.securitySettingsTwoFactor}
            onPress={onOpenTwoFactor}
            testID="mobile-settings-open-2fa"
            tone="green"
            value={
              account?.twoFactorEnabled ? copy.securitySettingsOn : copy.securitySettingsOff
            }
          />
          <SecurityRow
            disabled
            hint={copy.securitySettingsRecoveryCodesHint}
            icon="key-outline"
            label={copy.securitySettingsRecoveryCodes}
            soonLabel={copy.securitySettingsSoon}
            testID="mobile-security-recovery-codes"
            tone="amber"
          />
          <SecurityRow
            hint={copy.securitySettingsChangePasswordHint}
            icon="lock-closed-outline"
            isLast
            label={copy.securitySettingsChangePassword}
            onPress={() => {
              setPasswordSaved(false);
              setPasswordSheetOpen(true);
            }}
            testID="mobile-security-change-password"
            tone="indigo"
          />
        </View>
        {passwordSaved ? (
          <Text style={styles.sectionHeading} testID="mobile-security-password-success">
            {copy.securitySettingsPasswordSuccess}
          </Text>
        ) : null}

        <Text style={styles.sectionHeading}>{copy.securitySettingsDeviceHeading}</Text>
        <View style={styles.card}>
          <SecurityRow
            disabled={appLockUnavailable}
            hint={
              appLockUnavailable
                ? copy.securitySettingsAppLockUnavailable
                : copy.securitySettingsAppLockHint
            }
            icon="finger-print-outline"
            label={copy.securitySettingsAppLock}
            testID="mobile-security-app-lock"
            toggle={{
              onValueChange: (next) => {
                selection();
                onToggleAppLock(next);
              },
              value: appLockEnabled,
            }}
            tone="indigo"
          />
          <SecurityRow
            hint={copy.securitySettingsScreenPrivacyHint}
            icon="eye-off-outline"
            label={copy.securitySettingsScreenPrivacy}
            testID="mobile-security-screen-privacy"
            tone="muted"
            value={copy.securitySettingsActive}
          />
          <SecurityRow
            badge={{
              label: getMobileDeviceIntegrityLabel(locale, deviceIntegrityStatus),
              tone: deviceIntegrityStatus === "compromised" ? "danger" : "success",
            }}
            icon="phone-portrait-outline"
            isLast
            label={copy.securitySettingsDeviceIntegrity}
            testID="mobile-security-device-integrity"
            tone={deviceIntegrityStatus === "compromised" ? "danger" : "green"}
          />
        </View>

        <Text style={styles.sectionHeading}>{copy.securitySettingsSessionHeading}</Text>
        <View style={styles.card}>
          <SecurityRow
            {...(sessionExpiryHint ? { hint: sessionExpiryHint } : {})}
            icon="phone-portrait-outline"
            label={copy.securitySettingsThisDevice}
            testID="mobile-security-this-device"
            tone={isSessionActive ? "green" : "amber"}
            value={
              isSessionActive
                ? copy.securitySettingsSessionActive
                : copy.securitySettingsSessionInactive
            }
          />
          <SecurityRow
            icon="refresh-outline"
            label={copy.securitySettingsRefreshToken}
            testID="mobile-security-refresh-token"
            tone="muted"
            value={
              sessionDiagnostics.hasRefreshToken
                ? copy.securitySettingsPresent
                : copy.securitySettingsMissing
            }
          />
          <SecurityRow
            danger
            disabled={!isSignedIn}
            hint={copy.securitySettingsSignOutHint}
            icon="log-out-outline"
            isLast
            label={copy.securitySettingsSignOut}
            onPress={() => setSignOutSheetOpen(true)}
            testID="mobile-security-sign-out"
            tone="danger"
          />
        </View>

        <Text style={styles.sectionHeading}>{copy.securitySettingsSoonHeading}</Text>
        <View style={styles.card}>
          <SecurityRow
            disabled
            hint={copy.securitySettingsActiveDevicesHint}
            icon="laptop-outline"
            label={copy.securitySettingsActiveDevices}
            soonLabel={copy.securitySettingsSoon}
            testID="mobile-security-active-devices"
            tone="muted"
          />
          <SecurityRow
            disabled
            hint={copy.securitySettingsDataExportHint}
            icon="cloud-download-outline"
            isLast
            label={copy.securitySettingsDataExport}
            soonLabel={copy.securitySettingsSoon}
            testID="mobile-security-data-export"
            tone="muted"
          />
        </View>
      </ScrollView>

      <BottomSheet
        accessibilityLabel={copy.securitySettingsChangePassword}
        onClose={closePasswordSheet}
        open={passwordSheetOpen}
        snapPoint={480}
        testID="mobile-security-password-sheet"
      >
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{copy.securitySettingsChangePassword}</Text>
          <Text style={styles.sheetSubtitle}>{copy.securitySettingsPasswordRule}</Text>
          <Text style={styles.inputLabel}>{copy.securitySettingsCurrentPassword}</Text>
          <TextInput
            accessibilityLabel={copy.securitySettingsCurrentPassword}
            autoCapitalize="none"
            onChangeText={setCurrentPassword}
            secureTextEntry
            style={styles.input}
            testID="mobile-security-current-password-input"
            value={currentPassword}
          />
          <Text style={styles.inputLabel}>{copy.securitySettingsNewPassword}</Text>
          <TextInput
            accessibilityLabel={copy.securitySettingsNewPassword}
            autoCapitalize="none"
            onChangeText={setNewPassword}
            secureTextEntry
            style={styles.input}
            testID="mobile-security-new-password-input"
            value={newPassword}
          />
          <Text style={styles.inputLabel}>{copy.securitySettingsConfirmPassword}</Text>
          <TextInput
            accessibilityLabel={copy.securitySettingsConfirmPassword}
            autoCapitalize="none"
            onChangeText={setConfirmPassword}
            secureTextEntry
            style={styles.input}
            testID="mobile-security-confirm-password-input"
            value={confirmPassword}
          />
          {passwordError ? (
            <Text accessibilityLiveRegion="polite" style={styles.sheetError}>
              {passwordError}
            </Text>
          ) : null}
          <Button
            busy={changePassword.isPending}
            disabled={!currentPassword || !newPassword || !confirmPassword}
            label={copy.securitySettingsPasswordSave}
            onPress={() => void submitPassword()}
            testID="mobile-security-password-save"
          />
        </View>
      </BottomSheet>

      <DestructiveConfirmationSheet
        body={copy.securitySettingsSignOutConfirmDescription}
        busy={false}
        confirmLabel={copy.securitySettingsSignOut}
        onCancel={() => setSignOutSheetOpen(false)}
        onConfirm={() => {
          setSignOutSheetOpen(false);
          onSignOut();
        }}
        open={signOutSheetOpen}
        snapPoint={260}
        testID="mobile-security-sign-out-sheet"
        title={copy.securitySettingsSignOutConfirmTitle}
      />
    </>
  );
}
