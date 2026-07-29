import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  MobileAppUpdateResponse,
  MobileReleaseChannel,
  MobileServiceStatusLevel,
} from "@wizards/types";
import * as Clipboard from "expo-clipboard";
import * as Device from "expo-device";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  buildDiagnosticsText,
  isMobileReleaseNewer,
  resolveAboutUpdatePresentation,
} from "../../about/mobile-about-model";
import {
  MOBILE_ABOUT_DEFAULT_PREFERENCES,
  readMobileAboutPreferences,
  writeMobileAboutPreference,
} from "../../about/mobile-about-preferences";
import {
  useMobileAboutReleaseQuery,
  useMobileAboutStatusQuery,
  useMobileAboutUpdateQuery,
} from "../../about/mobile-about-queries";
import { createExpoUpdateController } from "../../about/mobile-update-controller";
import { getMobileRuntimeConfig } from "../../config/environment";
import { mobileAboutMetrics } from "../../design/tokens";
import { MOBILE_OPEN_SOURCE_LICENSE_GROUPS } from "../../legal/mobile-open-source-license-manifest";
import { summarizeMobileOpenSourceLicenses } from "../../legal/mobile-open-source-licenses-model";
import { mobileCopy } from "../../locale/mobile-copy";
import { formatMobileBytes } from "../../locale/mobile-number-format";
import { mobileNavigationRef } from "../../navigation/mobile-navigation-ref";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { BottomSheet } from "../components/kit/bottom-sheet";
import { useToast } from "../components/kit/toast";
import { useMobileBottomSystemSpacing } from "../use-mobile-bottom-system-spacing";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { useTheme } from "../providers/mobile-theme-provider";
import { AboutIdentityCard } from "./about/about-identity-card";
import { AboutChevronRightIcon, AboutClipboardIcon, AboutStarIcon } from "./about/about-icons";
import {
  AboutCard,
  AboutConsentSheetShell,
  AboutRow,
  AboutScreenHeader,
  AboutStickyHeader,
  AboutToggle,
} from "./about/about-primitives";
import { AboutSignatureBlock } from "./about/about-signature-block";
import { AboutWhatsNewCard } from "./about/about-whats-new-card";
import { useMobileAboutSettingsStyles } from "./mobile-about-settings-screen.styles";

const openSourceLicenseSummary = summarizeMobileOpenSourceLicenses(
  MOBILE_OPEN_SOURCE_LICENSE_GROUPS,
);

function navigate(name: "AboutUpdateChannel" | "AboutWhatsNew" | "HelpCenter"): void {
  if (mobileNavigationRef.isReady()) {
    mobileNavigationRef.navigate(name);
  }
}

function navigateToBugReport(): void {
  if (mobileNavigationRef.isReady()) {
    mobileNavigationRef.navigate("BugReport", undefined);
  }
}

function navigateToCommunity(): void {
  if (mobileNavigationRef.isReady()) {
    mobileNavigationRef.navigate("CommunityInvite", undefined);
  }
}

function openMobilePerformanceDiagnostics(): void {
  if (mobileNavigationRef.isReady()) {
    mobileNavigationRef.navigate("PerformanceDiagnostics");
  }
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function normalizeInstalledVersion(value: string): string {
  const trimmed = value.trim();
  return /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(trimmed)?.[1] ?? trimmed;
}

function releaseChannelForApi(value: string): MobileReleaseChannel | undefined {
  return value === "stable" || value === "beta" || value === "uat" ? value : undefined;
}

function formatChannelLabel(value: string, locale: "en" | "tr"): string {
  switch (value.toLowerCase()) {
    case "production":
    case "stable":
      return locale === "tr" ? "KARARLI" : "STABLE";
    case "development":
      return "DEV";
    case "canary":
      return "CANARY";
    case "beta":
      return "BETA";
    default:
      return value.toUpperCase();
  }
}

function formatReleaseDate(value: string | undefined, locale: "en" | "tr", withYear: boolean) {
  if (!value || Number.isNaN(Date.parse(value))) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  })
    .format(new Date(value))
    .replace(/\.$/, "");
}

function formatLastChecked(value: string | undefined, locale: "en" | "tr"): string | null {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60_000));
  return locale === "tr" ? `${minutes} dk` : `${minutes} min`;
}

function AboutGroupHeading({
  actionLabel,
  compact = false,
  label,
  onAction,
}: {
  readonly actionLabel?: string;
  readonly compact?: boolean;
  readonly label: string;
  readonly onAction?: () => void;
}) {
  const styles = useMobileAboutSettingsStyles();

  return (
    <View style={[styles.groupHeadingRow, compact && styles.groupHeadingRowCompact]}>
      <Text allowFontScaling={false} style={styles.groupHeading}>
        {label}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text maxFontSizeMultiplier={2} style={styles.groupAction}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function AboutServiceStatusPill({
  label,
  level,
  testID,
}: {
  readonly label?: string;
  readonly level: MobileServiceStatusLevel;
  readonly testID?: string;
}) {
  const styles = useMobileAboutSettingsStyles();
  const fallbackLabel = level === "ok" ? "OK" : level === "degraded" ? "Degraded" : "Down";

  return (
    <View
      style={[
        styles.statusPill,
        level === "degraded" && styles.statusPillDegraded,
        level === "down" && styles.statusPillDown,
      ]}
      {...(testID === undefined ? {} : { testID })}
    >
      <View
        style={[
          styles.statusDot,
          level === "degraded" && styles.statusDotDegraded,
          level === "down" && styles.statusDotDown,
        ]}
      />
      <Text
        allowFontScaling={false}
        style={[
          styles.statusLabel,
          level === "degraded" && styles.statusLabelDegraded,
          level === "down" && styles.statusLabelDown,
        ]}
        {...(testID === undefined ? {} : { testID: `${testID}-label` })}
      >
        {label ?? fallbackLabel}
      </Text>
    </View>
  );
}

function AboutRatingStars() {
  const theme = useTheme();
  const styles = useMobileAboutSettingsStyles();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.stars}
    >
      {[0, 1, 2, 3, 4].map((index) => (
        <AboutStarIcon
          color={index < 4 ? theme.about.star : theme.about.starEmpty}
          filled={index < 4}
          key={index}
          size={13}
        />
      ))}
    </View>
  );
}

export function MobileAboutSettingsScreen({
  appVersion,
  buildId,
  onBack,
  onOpenCookies,
  onOpenLicenses,
  onOpenPrivacy,
  onOpenTerms,
  releaseChannel,
  renderUpdateBanner,
  serviceOnline,
}: {
  readonly appVersion: string;
  readonly buildId: string;
  readonly onBack: () => void;
  readonly onOpenCookies: () => void;
  readonly onOpenLicenses: () => void;
  readonly onOpenPrivacy: () => void;
  readonly onOpenTerms: () => void;
  readonly releaseChannel: string;
  readonly renderUpdateBanner?: ReactNode;
  readonly serviceOnline: boolean;
}) {
  const auth = useMobileAuth();
  const theme = useTheme();
  const styles = useMobileAboutSettingsStyles();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const { selection } = useMobileHaptics();
  const { showToast } = useToast();
  const bottomSpacing = useMobileBottomSystemSpacing(18);
  const reduceMotion = useReducedMotion() === true;
  const installedVersion = normalizeInstalledVersion(appVersion);
  const updateController = useMemo(() => createExpoUpdateController(), []);
  const updateSnapshot = useSyncExternalStore(
    updateController.subscribe,
    updateController.getSnapshot,
    updateController.getSnapshot,
  );
  const updateQuery = useMobileAboutUpdateQuery(auth.apiClient, {
    channel: releaseChannelForApi(releaseChannel),
    installed: installedVersion,
  });
  const releaseQuery = useMobileAboutReleaseQuery(auth.apiClient, installedVersion);
  const statusQuery = useMobileAboutStatusQuery(auth.apiClient);
  const [preferences, setPreferences] = useState(MOBILE_ABOUT_DEFAULT_PREFERENCES);
  const [isBetaSheetOpen, setIsBetaSheetOpen] = useState(false);
  const [isRatingSheetOpen, setIsRatingSheetOpen] = useState(false);
  const [stickyVisible, setStickyVisible] = useState(false);
  const scrollY = useSharedValue(0);

  useEffect(() => {
    let active = true;
    void readMobileAboutPreferences(AsyncStorage).then((value) => {
      if (active) {
        setPreferences(value);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const nextY = event.contentOffset.y;
      scrollY.value = nextY;
      runOnJS(setStickyVisible)(nextY > mobileAboutMetrics.stickyHeaderThreshold);
    },
  });
  const largeHeaderStyle = useAnimatedStyle(() => {
    const opacity = scrollY.value > mobileAboutMetrics.stickyHeaderThreshold ? 0 : 1;
    return {
      opacity: reduceMotion
        ? opacity
        : withTiming(opacity, {
            duration: mobileAboutMetrics.stickyHeaderDurationMs,
            easing: Easing.out(Easing.cubic),
          }),
    };
  }, [reduceMotion]);

  const controllerUpdate: MobileAppUpdateResponse | null =
    updateSnapshot.state === "checking"
      ? {
          lastCheckedAt: new Date().toISOString(),
          otaEnabled: updateController.capabilities.isEnabled,
          state: "checking",
        }
      : (updateQuery.data ?? null);
  const updatePresentation = resolveAboutUpdatePresentation(controllerUpdate, copy, {
    formatSize: (bytes) => formatMobileBytes(bytes, locale),
    lastCheckedLabel: formatLastChecked(updateQuery.data?.lastCheckedAt, locale),
    online: serviceOnline,
    otaEnabled: updateController.capabilities.isEnabled && updateQuery.data?.otaEnabled !== false,
  });
  const updateActionVisible =
    updateController.capabilities.isEnabled && updateQuery.data?.otaEnabled !== false;
  const release = releaseQuery.data;
  const releasedAt = release?.releasedAt;
  const buildNumber =
    buildId && buildId !== "unknown"
      ? buildId
      : release?.buildNumber === undefined
        ? "—"
        : String(release.buildNumber);
  const fullDate = formatReleaseDate(releasedAt, locale, true);
  const shortDate = formatReleaseDate(releasedAt, locale, false);
  const buildLabel = fill(copy.aboutBuild, { build: buildNumber || "—", date: fullDate });
  const year =
    releasedAt && !Number.isNaN(Date.parse(releasedAt))
      ? String(new Date(releasedAt).getFullYear())
      : String(new Date().getFullYear());
  const channelLabel = formatChannelLabel(releaseChannel, locale);
  const codename = release?.codename ? `“${release.codename}”` : "—";
  const statusLevel: MobileServiceStatusLevel =
    statusQuery.data?.level ?? (serviceOnline ? "ok" : "down");
  const statusLabel =
    statusLevel === "ok"
      ? copy.aboutSupportStatusOk
      : statusLevel === "degraded"
        ? copy.aboutSupportStatusDegraded
        : copy.aboutSupportStatusDown;

  const copyDiagnostics = async () => {
    const diagnostics = buildDiagnosticsText({
      appVersion: installedVersion,
      buildNumber,
      channel: releaseChannel,
      deviceModel: Device.modelName,
      locale,
      osName: Device.osName ?? Platform.OS,
      osVersion: Device.osVersion ?? String(Platform.Version),
      userId: auth.session?.user.id ?? null,
    });
    await Clipboard.setStringAsync(diagnostics);
    selection();
    showToast({ title: copy.aboutCopied, variant: "success" });
  };

  const handleUpdateAction = async () => {
    selection();
    if (updatePresentation.actionKind === "stop") {
      updateController.cancelCheck();
      return;
    }
    if (updatePresentation.actionKind === "update") {
      await updateController.download();
      return;
    }
    await updateController.check();
    await updateQuery.refetch();
  };

  const setAutoUpdate = async (next: boolean) => {
    const previous = preferences.autoUpdate;
    setPreferences((current) => ({ ...current, autoUpdate: next }));
    try {
      await writeMobileAboutPreference(AsyncStorage, "autoUpdate", next);
    } catch {
      setPreferences((current) => ({ ...current, autoUpdate: previous }));
    }
  };

  return (
    <View style={styles.root} testID="mobile-about-settings-screen">
      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomSpacing }]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        testID="mobile-about-settings-scroll"
      >
        <Animated.View style={[styles.largeHeaderAnimated, largeHeaderStyle]}>
          <AboutScreenHeader
            action={{
              accessibilityLabel: copy.aboutCopyDiagnostics,
              icon: <AboutClipboardIcon color={theme.about.textSecondary} size={16} />,
              onPress: () => void copyDiagnostics(),
              testID: "mobile-about-copy-diagnostics",
            }}
            backAccessibilityLabel={copy.authBackAction}
            onBack={onBack}
            testID="mobile-about-header"
            title={copy.aboutTitle}
          />
        </Animated.View>

        <AboutIdentityCard
          appName={copy.aboutSettingsAppName}
          buildLabel={buildLabel}
          channelLabel={channelLabel}
          codename={codename}
          copyAccessibilityLabel={copy.aboutCopyDiagnostics}
          onCopyDiagnostics={() => void copyDiagnostics()}
          onUpdateAction={() => void handleUpdateAction()}
          renderUpdateBanner={renderUpdateBanner}
          update={updatePresentation}
          updateActionVisible={updateActionVisible}
          version={installedVersion}
        />

        <AboutGroupHeading
          actionLabel={copy.aboutWhatsNewSeeAll}
          label={copy.aboutSectionWhatsNew}
          onAction={() => navigate("AboutWhatsNew")}
        />
        {release ? (
          <AboutWhatsNewCard
            copy={copy}
            dateLabel={shortDate}
            isNew={isMobileReleaseNewer(release.version, preferences.seenVersion)}
            onPress={() => navigate("AboutWhatsNew")}
            release={release}
          />
        ) : null}

        <AboutGroupHeading label={copy.aboutSectionApp} />
        <AboutCard testID="mobile-about-app-card">
          <AboutRow
            isFirst
            onPress={() => navigate("AboutUpdateChannel")}
            showChevron
            title={copy.aboutAppChannel}
            value={channelLabel}
          />
          <AboutRow
            subtitle={copy.aboutAppBetaSub}
            title={copy.aboutAppBeta}
            trailing={
              <AboutToggle
                accessibilityLabel={copy.aboutAppBeta}
                onValueChange={(next) => {
                  if (next) setIsBetaSheetOpen(true);
                }}
                testID="mobile-about-beta-toggle"
                value={preferences.betaConsentAt !== null}
              />
            }
          />
          <AboutRow
            subtitle={copy.aboutAppAutoUpdateSub}
            title={copy.aboutAppAutoUpdate}
            trailing={
              <AboutToggle
                accessibilityLabel={copy.aboutAppAutoUpdate}
                onValueChange={(next) => void setAutoUpdate(next)}
                testID="mobile-about-auto-update-toggle"
                value={preferences.autoUpdate}
              />
            }
          />
        </AboutCard>

        <AboutGroupHeading compact label={copy.aboutSectionSupport} />
        <AboutCard>
          <AboutRow
            isFirst
            onPress={() => {
              if (statusQuery.data?.url) void Linking.openURL(statusQuery.data.url);
            }}
            showChevron
            title={copy.aboutSupportStatus}
            trailing={<AboutServiceStatusPill label={statusLabel} level={statusLevel} />}
          />
          <AboutRow
            onPress={() => navigate("HelpCenter")}
            showChevron
            subtitle={copy.aboutSupportHelpSub}
            title={copy.aboutSupportHelp}
          />
          <AboutRow
            onPress={navigateToBugReport}
            showChevron
            subtitle={copy.aboutSupportReportSub}
            title={copy.aboutSupportReport}
          />
        </AboutCard>

        <AboutGroupHeading label={copy.aboutSectionCommunity} />
        <AboutCard>
          <AboutRow
            isFirst
            onPress={navigateToCommunity}
            showChevron
            subtitle={copy.aboutCommunityServerFallbackSub}
            title={copy.aboutCommunityServer}
          />
          <AboutRow
            onPress={() => setIsRatingSheetOpen(true)}
            subtitle={copy.aboutCommunityRateSub}
            title={copy.aboutCommunityRate}
            trailing={<AboutRatingStars />}
          />
        </AboutCard>

        <AboutGroupHeading label={copy.aboutSectionLegal} />
        <AboutCard>
          <AboutRow
            isFirst
            onPress={onOpenTerms}
            paddingVertical={11}
            showChevron
            title={copy.aboutLegalTerms}
          />
          <AboutRow
            onPress={onOpenPrivacy}
            paddingVertical={11}
            showChevron
            title={copy.aboutLegalPrivacy}
          />
          <AboutRow
            onPress={onOpenCookies}
            paddingVertical={11}
            showChevron
            title={copy.aboutLegalCookies}
          />
          <AboutRow
            onPress={onOpenLicenses}
            paddingVertical={11}
            showChevron
            testID="mobile-about-licenses"
            title={copy.aboutLegalLicenses}
            value={copy.aboutLegalLicensesCount.replace(
              "{count}",
              String(openSourceLicenseSummary.packageCount),
            )}
          />
          {/* User override: this existing non-production instrument remains after redesign. */}
          {getMobileRuntimeConfig().environment === "production" ? null : (
            <AboutRow
              onPress={openMobilePerformanceDiagnostics}
              paddingVertical={11}
              showChevron
              testID="mobile-about-performance-diagnostics"
              title={copy.performanceDiagnosticsEntry}
            />
          )}
        </AboutCard>

        <AboutSignatureBlock copy={copy} year={year} />
      </Animated.ScrollView>

      <AboutStickyHeader
        backAccessibilityLabel={copy.authBackAction}
        onBack={onBack}
        scrollY={scrollY}
        testID="mobile-about-sticky-header"
        title={copy.aboutTitle}
        trailingLabel={installedVersion}
        visible={stickyVisible}
      />

      <BottomSheet
        accessibilityLabel={copy.aboutAppBeta}
        onClose={() => setIsBetaSheetOpen(false)}
        open={isBetaSheetOpen}
        sizing="content"
        testID="mobile-about-beta-consent"
      >
        <AboutConsentSheetShell>
          <Text maxFontSizeMultiplier={2} style={styles.sheetTitle}>
            {copy.aboutAppBeta}
          </Text>
          <Text maxFontSizeMultiplier={2} style={styles.sheetBody}>
            {copy.aboutAppBetaSub}
          </Text>
        </AboutConsentSheetShell>
      </BottomSheet>

      <BottomSheet
        accessibilityLabel={copy.aboutCommunityRate}
        onClose={() => setIsRatingSheetOpen(false)}
        open={isRatingSheetOpen}
        sizing="content"
        testID="mobile-about-rating"
      >
        <AboutConsentSheetShell>
          <Text maxFontSizeMultiplier={2} style={styles.sheetTitle}>
            {copy.aboutCommunityRate}
          </Text>
          <Text maxFontSizeMultiplier={2} style={styles.sheetBody}>
            {copy.aboutCommunityRateSub}
          </Text>
        </AboutConsentSheetShell>
      </BottomSheet>
    </View>
  );
}
