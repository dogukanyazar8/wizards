import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import * as Updates from "expo-updates";

import { mobileCopy } from "../../locale/mobile-copy";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMobileAboutSettingsStyles } from "./mobile-about-settings-screen.styles";

type AboutUpdateStatus = "checking" | "downloading" | "idle" | "up-to-date";

function AboutLegalRow({
  disabled = false,
  isLast = false,
  label,
  onPress,
  soonLabel,
  testID,
}: {
  disabled?: boolean;
  isLast?: boolean;
  label: string;
  onPress?: () => void;
  soonLabel?: string;
  testID: string;
}) {
  const theme = useTheme();
  const styles = useMobileAboutSettingsStyles();
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
      <Text style={styles.rowLabel}>{label}</Text>
      {soonLabel ? (
        <View style={styles.soonBadge}>
          <Text style={styles.soonBadgeText}>{soonLabel}</Text>
        </View>
      ) : (
        <Ionicons color={theme.text.soft} name="chevron-forward" size={16} />
      )}
    </Pressable>
  );
}

export function MobileAboutSettingsScreen({
  appVersion,
  onBack,
  onOpenCookies,
  onOpenFeedback,
  onOpenPrivacy,
  onOpenTerms,
  releaseChannel,
  serviceOnline,
}: {
  appVersion: string;
  onBack(): void;
  onOpenCookies(): void;
  onOpenFeedback(): void;
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
        <View style={styles.appIcon}>
          <Ionicons color={theme.text.onPrimary} name="chatbubble" size={34} />
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
          disabled
          isLast
          label={copy.aboutSettingsLicenses}
          soonLabel={copy.aboutSettingsSoon}
          testID="mobile-about-licenses"
        />
      </View>

      <Text style={styles.sectionHeading}>{copy.aboutSettingsSupportHeading}</Text>
      <View style={styles.card}>
        <View style={[styles.row, styles.rowDivider]} testID="mobile-about-service-status">
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
        <AboutLegalRow
          isLast
          label={copy.aboutSettingsFeedback}
          onPress={onOpenFeedback}
          testID="mobile-about-feedback"
        />
      </View>
    </ScrollView>
  );
}
