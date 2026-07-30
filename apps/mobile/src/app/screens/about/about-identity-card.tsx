import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import type { MobileAboutUpdatePresentation } from "../../../about/mobile-about-model";
import { useTheme } from "../../providers/mobile-theme-provider";
import {
  ABOUT_APP_LOGO_SIZE,
  useMobileAboutSettingsStyles,
} from "../mobile-about-settings-screen.styles";
import { AboutCheckIcon, AboutClipboardSmallIcon } from "./about-icons";
import { AboutBrandLogo } from "./about-primitives";

function AboutCheckingSpinner() {
  const theme = useTheme();
  const styles = useMobileAboutSettingsStyles();
  const reduceMotion = useReducedMotion() === true;
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      rotation.value = 0;
      return;
    }

    rotation.value = withRepeat(
      withTiming(360, { duration: 800, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(rotation);
  }, [reduceMotion, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={[styles.spinner, animatedStyle]}>
      <Ionicons color={theme.about.textTertiary} name="sync" size={15} />
    </Animated.View>
  );
}

function AboutUpdateIcon({ state }: { readonly state: MobileAboutUpdatePresentation["state"] }) {
  const theme = useTheme();
  const styles = useMobileAboutSettingsStyles();

  if (state === "current") {
    return (
      <View style={[styles.updateIconBox, styles.updateIconCurrent]}>
        <AboutCheckIcon color={theme.about.successText} size={15} />
      </View>
    );
  }

  if (state === "available") {
    return (
      <View style={[styles.updateIconBox, styles.updateIconAvailable]}>
        <Ionicons color={theme.about.accent} name="arrow-down" size={16} />
      </View>
    );
  }

  return (
    <View style={styles.updateIconBox}>
      {state === "checking" ? (
        <AboutCheckingSpinner />
      ) : (
        <Ionicons color={theme.about.textTertiary} name="cloud-offline-outline" size={15} />
      )}
    </View>
  );
}

export function AboutIdentityCard({
  appName,
  buildLabel,
  channelLabel,
  codename,
  copyAccessibilityLabel,
  onCopyDiagnostics,
  onUpdateAction,
  renderUpdateBanner,
  update,
  updateAccessibilityLabel,
  version,
}: {
  readonly appName: string;
  readonly buildLabel: string;
  readonly channelLabel: string;
  readonly codename: string;
  readonly copyAccessibilityLabel: string;
  readonly onCopyDiagnostics: () => void;
  readonly onUpdateAction: () => void;
  readonly renderUpdateBanner?: ReactNode;
  readonly update: MobileAboutUpdatePresentation;
  readonly updateAccessibilityLabel: string;
  readonly version: string;
}) {
  const theme = useTheme();
  const styles = useMobileAboutSettingsStyles();

  return (
    <>
      {renderUpdateBanner}
      <View style={styles.identityCard} testID="mobile-about-identity-card">
        <Pressable
          accessibilityLabel={copyAccessibilityLabel}
          accessibilityRole="button"
          onPress={onCopyDiagnostics}
          style={({ pressed }) => [styles.identityTop, pressed && styles.pressed]}
          testID="mobile-about-copy-identity"
        >
          <View style={styles.logoShell}>
            <AboutBrandLogo
              accessibilityLabel={appName}
              size={ABOUT_APP_LOGO_SIZE}
              testID="mobile-about-app-logo"
            />
          </View>
          <View style={styles.identityText}>
            <Text maxFontSizeMultiplier={2} style={styles.appName}>
              {appName}
            </Text>
            <View style={styles.versionMetadata} testID="mobile-about-version-metadata">
              <View style={styles.versionChip}>
                <Text allowFontScaling={false} style={styles.versionChipText}>
                  {version}
                </Text>
              </View>
              <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.codename}>
                {codename}
              </Text>
              <View style={styles.channelChip}>
                <Text allowFontScaling={false} style={styles.channelChipText}>
                  {channelLabel}
                </Text>
              </View>
            </View>
            <View style={styles.buildRow}>
              <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.buildText}>
                {buildLabel}
              </Text>
              <AboutClipboardSmallIcon
                color={theme.about.iconTint}
                size={11}
                testID="mobile-about-build-copy-icon"
              />
            </View>
          </View>
        </Pressable>
        <View style={styles.hairline} testID="mobile-about-identity-hairline" />
        <View style={styles.updateRow} testID="mobile-about-update-row">
          <AboutUpdateIcon state={update.state} />
          <View style={styles.updateText}>
            <Text maxFontSizeMultiplier={2} numberOfLines={2} style={styles.updateTitle}>
              {update.title}
            </Text>
            <Text maxFontSizeMultiplier={2} numberOfLines={2} style={styles.updateSubtitle}>
              {update.subtitle}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={updateAccessibilityLabel}
            accessibilityRole="button"
            onPress={onUpdateAction}
            style={({ pressed }) => [styles.updateAction, pressed && styles.pressed]}
            testID="mobile-about-update-action"
          >
            <Text maxFontSizeMultiplier={2} style={styles.updateActionText}>
              {update.action}
            </Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}
