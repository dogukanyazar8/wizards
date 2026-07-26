import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import * as Updates from "expo-updates";

import { MOBILE_OPEN_SOURCE_LICENSE_GROUPS } from "../../legal/mobile-open-source-license-manifest";
import { summarizeMobileOpenSourceLicenses } from "../../legal/mobile-open-source-licenses-model";
import { mobileCopy } from "../../locale/mobile-copy";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { useTheme } from "../providers/mobile-theme-provider";
import { AuthWelcomeBrandMark } from "./auth/auth-welcome-brand-mark";
import {
  ABOUT_APP_LOGO_RADIUS,
  ABOUT_APP_LOGO_SIZE,
  useMobileAboutSettingsStyles,
} from "./mobile-about-settings-screen.styles";

type AboutUpdateStatus = "checking" | "downloading" | "idle" | "up-to-date";

/** The manifest is static, so its totals are resolved once at module load. */
const openSourceLicenseSummary = summarizeMobileOpenSourceLicenses(
  MOBILE_OPEN_SOURCE_LICENSE_GROUPS,
);

function AboutLegalRow({
  isLast = false,
  label,
  onPress,
  testID,
  value,
}: {
  isLast?: boolean;
  label: string;
  onPress?: () => void;
  testID: string;
  value?: string;
}) {
  const theme = useTheme();
  const styles = useMobileAboutSettingsStyles();
  return (
    <Pressable
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, !isLast && styles.rowDivider, pressed && styles.pressed]}
      testID={testID}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? (
        <Text numberOfLines={1} style={styles.rowValue}>
          {value}
        </Text>
      ) : null}
      <Ionicons color={theme.text.soft} name="chevron-forward" size={16} />
    </Pressable>
  );
}

export function MobileAboutSettingsScreen({
  appVersion,
  onBack,
  onOpenCookies,
  onOpenLicenses,
  onOpenPrivacy,
  onOpenTerms,
  releaseChannel,
  serviceOnline,
}: {
  appVersion: string;
  onBack(): void;
  onOpenCookies(): void;
  onOpenLicenses(): void;
  onOpenPrivacy(): void;
  onOpenTerms(): void;
  releaseChannel: string;
  serviceOnline: boolean;
}) {
  const theme = useTheme();
  const styles = useMobileAboutSettingsStyles();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const { selection } = useMobileHaptics();
  const [updateStatus, setUpdateStatus] = useState<AboutUpdateStatus>("idle");
  const versionLabel = [appVersion, releaseChannel].filter(Boolean).join(" · ");
  const isCheckingUpdate = updateStatus === "checking" || updateStatus === "downloading";

  const handleCheckUpdates = async () => {
    selection();
    if (!Updates.isEnabled) {
      setUpdateStatus("up-to-date");
      return;
    }

    setUpdateStatus("checking");
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        setUpdateStatus("downloading");
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
        return;
      }
      setUpdateStatus("up-to-date");
    } catch {
      // Updates are unavailable in Expo Go / dev clients; report as current.
      setUpdateStatus("up-to-date");
    }
  };

  const updateStatusLabel =
    updateStatus === "checking"
      ? copy.aboutSettingsChecking
      : updateStatus === "downloading"
        ? copy.aboutSettingsUpdating
        : copy.aboutSettingsUpToDate;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.root}
      testID="mobile-about-settings-screen"
    >
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={copy.authBackAction}
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          testID="mobile-about-settings-back"
        >
          <View style={styles.backVisual}>
            <Ionicons color={theme.text.primary} name="chevron-back" size={18} />
          </View>
        </Pressable>
        <Text numberOfLines={1} style={styles.title}>
          {copy.aboutSettingsTitle}
        </Text>
      </View>

      <View style={styles.appCard}>
        {/*
          Same animated waveform mark the auth screens render, so the app logo is
          one component everywhere. It pauses itself while its navigation screen is
          blurred and draws no SVG blur filter, so it stays on the GPU render path.
        */}
        <View
          accessibilityLabel={copy.aboutSettingsAppName}
          accessibilityRole="image"
          style={styles.appIcon}
        >
          <AuthWelcomeBrandMark
            cornerRadius={ABOUT_APP_LOGO_RADIUS}
            size={ABOUT_APP_LOGO_SIZE}
            testID="mobile-about-app-logo"
          />
        </View>
        <View style={styles.appIdentity}>
          <Text style={styles.appName}>{copy.aboutSettingsAppName}</Text>
          <Text style={styles.appVersion}>{versionLabel}</Text>
        </View>
        <Pressable
          accessibilityLabel={copy.aboutSettingsCheckUpdates}
          accessibilityRole="button"
          accessibilityState={{ busy: isCheckingUpdate, disabled: isCheckingUpdate }}
          disabled={isCheckingUpdate}
          onPress={() => void handleCheckUpdates()}
          style={({ pressed }) => [
            styles.updateButton,
            isCheckingUpdate && styles.updateButtonDisabled,
            pressed && !isCheckingUpdate && styles.pressed,
          ]}
          testID="mobile-about-check-updates"
        >
          <Ionicons color={theme.text.onPrimary} name="refresh" size={15} />
          <Text style={styles.updateButtonLabel}>{copy.aboutSettingsCheckUpdates}</Text>
        </Pressable>
        <Text style={styles.updateStatus}>{updateStatusLabel}</Text>
      </View>

      <Text style={styles.sectionHeading}>{copy.aboutSettingsLegalHeading}</Text>
      <View style={styles.card}>
        <AboutLegalRow
          label={copy.aboutSettingsTerms}
          onPress={onOpenTerms}
          testID="mobile-about-terms"
        />
        <AboutLegalRow
          label={copy.aboutSettingsPrivacy}
          onPress={onOpenPrivacy}
          testID="mobile-about-privacy"
        />
        <AboutLegalRow
          label={copy.aboutSettingsCookies}
          onPress={onOpenCookies}
          testID="mobile-about-cookies"
        />
        <AboutLegalRow
          isLast
          label={copy.aboutSettingsLicenses}
          onPress={onOpenLicenses}
          testID="mobile-about-licenses"
          // The count is generated from the lockfile, so the row cannot promise
          // a number the licenses screen then contradicts.
          value={copy.openSourceLicensesPackageCount.replace(
            "{count}",
            String(openSourceLicenseSummary.packageCount),
          )}
        />
      </View>

      <Text style={styles.sectionHeading}>{copy.aboutSettingsSupportHeading}</Text>
      <View style={styles.card}>
        {/* Feedback lives on the profile hub only. Two entry points into the
            same 4a form meant the same action was offered twice, one level
            apart, with no way to tell them apart. */}
        <View style={styles.row} testID="mobile-about-service-status">
          <Text style={styles.rowLabel}>{copy.aboutSettingsServiceStatus}</Text>
          <View style={[styles.statusBadge, !serviceOnline && styles.statusBadgeOffline]}>
            <View style={[styles.statusDot, !serviceOnline && styles.statusDotOffline]} />
            <Text style={[styles.statusText, !serviceOnline && styles.statusTextOffline]}>
              {serviceOnline
                ? copy.aboutSettingsServiceOperational
                : copy.aboutSettingsServiceOffline}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
