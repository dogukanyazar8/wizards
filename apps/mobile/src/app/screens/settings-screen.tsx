import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  Ionicons,
  Pressable,
  ScrollView,
  Text,
  View,
  copy,
  getMobileNoiseSuppressionLabel,
  getMobileFeatureEvidence,
  getMobileInviteReadiness,
  getMobilePermissionEvidence,
  getMobilePermissionNativeMetadata,
  getMobileReleaseEvidence,
  getMobileSessionEvidence,
  getMobileStoreEvidence,
  mobilePackageJson,
  mobileProductionReadinessSummary,
  type MobileAppLockAvailability,
  mobileQualitySummary,
  mobileStoreReadiness,
  MOBILE_BOOTSTRAP_ENDPOINT,
  MOBILE_LOCALE_OPTIONS,
  MOBILE_MANUAL_QA_CHECKS,
  MOBILE_PRODUCTION_READINESS_GATES,
  MOBILE_QA_DEVICE_MATRIX,
  MOBILE_RELEASE_BUDGETS,
  runtimeConfig,
  summarizeMobileFeatureReadiness,
  summarizeMobileMediaRuntimeState,
  type MobileBootstrapPayload,
  type MobileBootstrapViewState,
  type MobileDeepLinkParseResult,
  type MobileIoniconName,
  type MobileInviteReadiness,
  type MobileLocale,
  type MobileMediaRuntimeState,
  type MobilePermissionIntentId,
  type MobilePermissionReadiness,
  type MobilePermissionSummary,
  type MobileSessionDiagnostics,
  type MobileSettingsEvidenceItem,
  type MobileSyncHealthSummary,
  type MobileSyncSnapshot,
  type MobileVoiceInputMode,
  type ReactNode,
} from "../mobile-root-screen-shared";
import { mobileCopy } from "../../locale/mobile-copy";
import {
  ActionButton,
  AvatarMark,
  BootstrapStateNotice,
  DiagnosticPill,
  MetricMiniPill,
  MetricTile,
  MobileSyncHealthBanner,
  MobileSyncStatusCard,
  ScreenShell,
} from "../components/ui-atoms";
import { formatMobileMediaAssetMeta } from "../components/media-primitives";
import { useTheme, useThemePreference } from "../providers/mobile-theme-provider";
import type { MobileThemeMode } from "../../design/mobile-theme-runtime";
import { useSettingsScreenStyles } from "./settings-screen.styles";
import { MobileAccountSettingsScreen } from "./mobile-account-settings-screen";
import { MobileAboutSettingsScreen } from "./mobile-about-settings-screen";
import { MobileAppearanceSettingsScreen } from "./mobile-appearance-settings-screen";
import { MobileLanguageSettingsScreen } from "./mobile-language-settings-screen";
import { MobileNotificationSettingsScreen } from "./mobile-notification-settings-screen";
import { MobileSecuritySettingsScreen } from "./mobile-security-settings-screen";
import { SocialAccountQuickActions } from "../../social/social-account-screens";
import { Button, DestructiveConfirmationSheet, Skeleton } from "../components/kit";
import { useToast } from "../components/kit/toast";
import { Avatar } from "../components/kit/avatar";
import { mobileNavigationRef } from "../../navigation/mobile-navigation-ref";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useMobileWorkspaceLayoutPreference } from "../providers/mobile-workspace-layout-provider";
import type { MobileFriendPresenceStatus } from "../../social/mobile-social-client";
import type { MobileLegalDocumentId } from "@wizards/types";
import { MobileCachedImage } from "../components/mobile-cached-image";
import { mobileBannerContentPosition } from "../../social/mobile-banner-offset";
import { MobileProfileStatusCard } from "../../social/mobile-profile-status-card";
import { MobileStatusPickerSheetView } from "../../social/mobile-status-picker-sheet";
import { toMobilePresenceStatus } from "../../social/mobile-status-picker-model";
import { MOBILE_ABOUT_PREFERENCE_KEYS } from "../../about/mobile-about-preferences";
import { isMobileReleaseNewer } from "../../about/mobile-about-model";

const MOBILE_PROFILE_PRESENCE_STATUSES: readonly MobileFriendPresenceStatus[] = [
  "ONLINE",
  "IDLE",
  "DND",
  "OFFLINE",
];

function openMobileLegalDocument(documentId: MobileLegalDocumentId): void {
  if (mobileNavigationRef.isReady()) {
    mobileNavigationRef.navigate("LegalDocument", { documentId });
  }
}

function openMobileOpenSourceLicenses(): void {
  if (mobileNavigationRef.isReady()) {
    mobileNavigationRef.navigate("OpenSourceLicenses");
  }
}

function openMobileFeedback(): void {
  if (mobileNavigationRef.isReady()) {
    mobileNavigationRef.navigate("Feedback");
  }
}

function openMobileAdminQueue(): void {
  if (mobileNavigationRef.isReady()) {
    mobileNavigationRef.navigate("AdminIncidents");
  }
}

function getMobileProfilePresenceStatus(value: string | null): MobileFriendPresenceStatus | null {
  return MOBILE_PROFILE_PRESENCE_STATUSES.includes(value as MobileFriendPresenceStatus)
    ? (value as MobileFriendPresenceStatus)
    : null;
}

function getMobilePermissionLabel(intentId: MobilePermissionIntentId): string {
  switch (intentId) {
    case "camera":
      return copy.permissionCamera;
    case "microphone":
      return copy.permissionMicrophone;
    case "notifications":
      return copy.permissionNotifications;
    case "photoLibrary":
      return copy.permissionPhotoLibrary;
    case "screenCapture":
      return copy.permissionScreenCapture;
  }
}

function getSettingsEvidenceLabels() {
  return {
    available: copy.settingsFeatureAvailable,
    automation: copy.settingsAutomationLabel,
    blocked: copy.settingsBlockedLabel,
    disabled: copy.settingsFeatureDisabled,
    manualQa: copy.settingsManualQaLabel,
    missing: copy.settingsMissingLabel,
    pending: copy.settingsPendingLabel,
    performance: copy.settingsPerformanceLabel,
    ready: copy.settingsReadyLabel,
    refreshToken: copy.settingsRefreshTokenLabel,
    scopeCount: copy.settingsScopeCountLabel,
    session: copy.settingsSessionLabel,
    storeBlockers: copy.settingsStoreBlockersLabel,
    storeWarnings: copy.settingsStoreWarningsLabel,
  };
}

function navigateToMobileSettingsDetail(section: string) {
  if (mobileNavigationRef.isReady()) {
    mobileNavigationRef.navigate("SettingsDetail", { section });
  }
}

export function MobileProfileSettingsHub({
  appVersion,
  bootstrapState,
  locale,
  onRefreshBootstrap,
  onSignOut,
  onUpdatePresence,
  sessionDiagnostics,
  signedInUserLabel,
  status,
  themeMode,
}: {
  appVersion: string;
  bootstrapState: MobileBootstrapViewState;
  locale: MobileLocale;
  onRefreshBootstrap(): void;
  onSignOut(): void;
  onUpdatePresence: ((status: MobileFriendPresenceStatus) => Promise<void>) | undefined;
  sessionDiagnostics: MobileSessionDiagnostics;
  signedInUserLabel: string | null;
  status: string;
  themeMode: MobileThemeMode;
}) {
  const styles = useSettingsScreenStyles();
  const theme = useTheme();
  const { showToast } = useToast();
  const [isPresencePickerOpen, setIsPresencePickerOpen] = useState(false);
  const [isSignOutConfirmationOpen, setIsSignOutConfirmationOpen] = useState(false);
  const [isUpdatingPresence, setIsUpdatingPresence] = useState(false);
  const [optimisticPresence, setOptimisticPresence] = useState<MobileFriendPresenceStatus | null>(
    null,
  );
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [seenAboutVersion, setSeenAboutVersion] = useState<string | null | undefined>(undefined);
  const profileCopy = mobileCopy[locale];
  const isSecureSessionActive = sessionDiagnostics.hasSession && !sessionDiagnostics.isExpired;
  const user = bootstrapState.status === "ready" ? bootstrapState.payload.user : null;
  const displayName = user?.displayName ?? user?.username ?? "";
  const username = user ? `@${user.username}` : "";
  const themeLabel =
    themeMode === "dark"
      ? copy.settingsThemeDarkValue
      : themeMode === "light"
        ? copy.settingsThemeLightValue
        : copy.settingsThemeSystemValue;
  const localeLabel =
    locale === "tr" ? copy.settingsLanguageTurkishValue : copy.settingsLanguageEnglishValue;
  const visiblePresence =
    optimisticPresence ?? getMobileProfilePresenceStatus(user?.status ?? null);
  const selectPresence = async (nextPresence: MobileFriendPresenceStatus) => {
    if (!onUpdatePresence || isUpdatingPresence) {
      return;
    }

    const previousPresence = visiblePresence;
    setPresenceError(null);
    setOptimisticPresence(nextPresence);
    setIsUpdatingPresence(true);
    try {
      await onUpdatePresence(nextPresence);
      setIsPresencePickerOpen(false);
      showToast({ title: profileCopy.profileEditSaved, variant: "success" });
    } catch {
      setOptimisticPresence(previousPresence);
      setPresenceError(profileCopy.profileHubPresenceError);
    } finally {
      setIsUpdatingPresence(false);
    }
  };

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(MOBILE_ABOUT_PREFERENCE_KEYS.seenVersion).then((value) => {
      if (active) setSeenAboutVersion(value);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!user) {
    return (
      <ScrollView
        contentContainerStyle={styles.mobileProfileHubContent}
        showsVerticalScrollIndicator={false}
        testID="mobile-settings-screen"
      >
        <Text style={styles.mobileProfileHubTitle}>{copy.tabProfile}</Text>
        {bootstrapState.status === "error" ? (
          <View style={styles.mobileProfileStateCard} testID="mobile-settings-profile-error">
            <Text style={styles.mobileProfileStateText}>{profileCopy.profileHubError}</Text>
            <Button
              label={copy.retryAction}
              onPress={onRefreshBootstrap}
              testID="mobile-settings-profile-retry"
            />
          </View>
        ) : (
          <View style={styles.mobileProfileStateCard} testID="mobile-settings-profile-loading">
            <Skeleton
              borderRadius={24}
              height={72}
              testID="mobile-settings-profile-loading-banner"
            />
            <Skeleton
              borderRadius={26}
              height={76}
              testID="mobile-settings-profile-loading-avatar"
              width={76}
            />
            <Skeleton height={20} testID="mobile-settings-profile-loading-name" width="54%" />
            <Skeleton height={16} testID="mobile-settings-profile-loading-handle" width="38%" />
            <Skeleton
              borderRadius={14}
              height={44}
              testID="mobile-settings-profile-loading-status"
            />
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.mobileProfileHubContent}
      showsVerticalScrollIndicator={false}
      testID="mobile-settings-screen"
    >
      <Text style={styles.mobileProfileHubTitle}>{copy.tabProfile}</Text>
      <View style={styles.mobileProfileIdentityCard} testID="mobile-profile-identity-card">
        <View
          style={[
            styles.mobileProfileIdentityBanner,
            user?.bannerColor ? { backgroundColor: user.bannerColor } : null,
          ]}
          testID="mobile-profile-identity-banner"
        >
          {user?.bannerUrl ? (
            <MobileCachedImage
              accessibilityIgnoresInvertColors
              contentPosition={mobileBannerContentPosition(user.bannerOffsetX, user.bannerOffsetY)}
              importantForAccessibility="no"
              source={{ uri: user.bannerUrl }}
              style={styles.mobileProfileIdentityBannerImage}
              testID="mobile-profile-identity-banner-image"
            />
          ) : null}
          <Pressable
            accessibilityLabel={copy.messageEditAction}
            accessibilityRole="button"
            onPress={() => {
              if (mobileNavigationRef.isReady()) {
                mobileNavigationRef.navigate("ProfileEdit");
              }
            }}
            style={styles.mobileProfileEditAction}
            testID="mobile-profile-edit"
          >
            {({ pressed }) => (
              <View
                style={[
                  styles.mobileProfileEditActionVisual,
                  pressed && styles.actionButtonPressed,
                ]}
              >
                <Ionicons name="pencil-outline" size={13} color={theme.text.onInverse} />
                <Text style={styles.mobileProfileEditActionText}>{copy.messageEditAction}</Text>
              </View>
            )}
          </Pressable>
          <View style={styles.mobileProfileIdentityOverlay}>
            <View style={styles.mobileProfileIdentityPerson}>
              <View style={styles.mobileProfileAvatarRing}>
                <Avatar
                  avatarBorderRadius={theme.layout.fixed.profileIdentityAvatarInnerRadius}
                  avatarBorderWidth={0}
                  dimension={theme.layout.fixed.profileIdentityAvatarInner}
                  fallbackTextStyle={styles.mobileProfileAvatarInitials}
                  fallbackTint={{ bg: theme.accent.soft, fg: theme.accent.strong }}
                  identityId={user?.id}
                  imageUrl={user?.avatarUrl ?? null}
                  label={displayName}
                />
                <View
                  style={[
                    styles.mobileProfileAvatarPresence,
                    {
                      backgroundColor:
                        visiblePresence === "ONLINE"
                          ? theme.status.success
                          : visiblePresence === "IDLE"
                            ? theme.status.warning
                            : visiblePresence === "DND"
                              ? theme.status.danger
                              : theme.text.soft,
                    },
                  ]}
                  testID="mobile-profile-avatar-presence"
                />
              </View>
              <View style={styles.mobileProfileIdentityText}>
                <Text style={styles.mobileProfileDisplayName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={styles.mobileProfileUsername} numberOfLines={1}>
                  {username}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <MobileProfileStatusCard
        locale={locale}
        onOpenPresencePicker={() => setIsPresencePickerOpen(true)}
        presence={visiblePresence}
        presenceDisabled={!onUpdatePresence || isUpdatingPresence}
        presenceError={presenceError}
      />

      <View style={styles.mobileProfileSettingsCard}>
        <MobileProfileHubRow
          icon="person-outline"
          iconTone="accent"
          label={profileCopy.profileHubAccount}
          onPress={() => navigateToMobileSettingsDetail("account")}
        />
        <MobileProfileHubRow
          icon="shield-checkmark-outline"
          iconTone="success"
          label={profileCopy.profileHubSecurity}
          onPress={() => navigateToMobileSettingsDetail("security")}
          value={
            isSecureSessionActive
              ? profileCopy.profileHubSecurityActive
              : profileCopy.profileHubSecurityActionRequired
          }
          valueTone={isSecureSessionActive ? "success" : "default"}
        />
        <MobileProfileHubRow
          icon="sunny-outline"
          iconTone="warning"
          label={profileCopy.profileHubAppearance}
          onPress={() => navigateToMobileSettingsDetail("appearance")}
          value={themeLabel}
        />
        <MobileProfileHubRow
          icon="notifications-outline"
          iconTone="accent"
          label={copy.tabNotifications}
          onPress={() => navigateToMobileSettingsDetail("notifications")}
        />
        <MobileProfileHubRow
          icon="language-outline"
          iconTone="neutral"
          label={profileCopy.profileHubLanguage}
          onPress={() => navigateToMobileSettingsDetail("language")}
          value={localeLabel}
        />
      </View>

      <View style={styles.mobileProfileSettingsCard}>
        {/* F7: `isAdmin` decides whether the row is drawn, nothing else. Every
            endpoint behind the queue re-checks the capability on the server, so
            a stale or forged flag buys a screen that answers 403. */}
        {bootstrapState.status === "ready" && bootstrapState.payload.isAdmin ? (
          <MobileProfileHubRow
            icon="shield-half-outline"
            iconTone="danger"
            label={profileCopy.adminHubRow}
            onPress={openMobileAdminQueue}
          />
        ) : null}
        <MobileProfileHubRow
          icon="megaphone-outline"
          iconTone="accent"
          label={profileCopy.feedbackHubAction}
          onPress={openMobileFeedback}
        />
        <MobileProfileHubRow
          icon="information-circle-outline"
          iconTone="neutral"
          label={profileCopy.profileHubAbout}
          onPress={() => navigateToMobileSettingsDetail("about")}
          showDot={
            seenAboutVersion !== undefined && isMobileReleaseNewer(appVersion, seenAboutVersion)
          }
          value={appVersion}
        />
        <MobileProfileHubRow
          danger
          icon="log-out-outline"
          iconTone="danger"
          label={copy.signOutAction}
          onPress={() => setIsSignOutConfirmationOpen(true)}
          showChevron={false}
        />
      </View>
      <MobileStatusPickerSheetView
        customStatus={null}
        customStatusEmoji={null}
        failed={presenceError !== null}
        onClose={() => setIsPresencePickerOpen(false)}
        onSelect={(option) => void selectPresence(toMobilePresenceStatus(option))}
        open={isPresencePickerOpen}
        pending={isUpdatingPresence}
        presence={visiblePresence}
      />
      <DestructiveConfirmationSheet
        body={profileCopy.profileHubSignOutBody}
        busy={false}
        confirmLabel={copy.signOutAction}
        icon="log-out-outline"
        onCancel={() => setIsSignOutConfirmationOpen(false)}
        onConfirm={onSignOut}
        open={isSignOutConfirmationOpen}
        testID="mobile-profile-sign-out-confirmation"
        title={profileCopy.profileHubSignOutTitle}
      />
    </ScrollView>
  );
}

function MobileProfileHubRow({
  danger = false,
  icon,
  iconTone,
  label,
  onPress,
  showChevron = true,
  showDot = false,
  value,
  valueTone = "default",
}: {
  danger?: boolean;
  icon: MobileIoniconName;
  iconTone: "accent" | "danger" | "neutral" | "success" | "warning";
  label: string;
  onPress(): void;
  showChevron?: boolean;
  showDot?: boolean;
  value?: string;
  valueTone?: "default" | "success";
}) {
  const styles = useSettingsScreenStyles();
  const theme = useTheme();
  const iconColor =
    iconTone === "danger"
      ? theme.status.danger
      : iconTone === "success"
        ? theme.status.success
        : iconTone === "warning"
          ? theme.status.warning
          : iconTone === "neutral"
            ? theme.text.muted
            : theme.accent.strong;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.mobileProfileSettingsRow,
        pressed && styles.actionButtonPressed,
      ]}
    >
      <View
        style={[
          styles.mobileProfileRowIcon,
          iconTone === "success" && styles.mobileProfileRowIconSuccess,
          iconTone === "warning" && styles.mobileProfileRowIconWarning,
          iconTone === "neutral" && styles.mobileProfileRowIconNeutral,
          iconTone === "danger" && styles.mobileProfileRowIconDanger,
        ]}
      >
        <Ionicons name={icon} size={17} color={iconColor} />
      </View>
      <Text
        style={[
          styles.mobileProfileSettingsRowLabel,
          danger && styles.mobileProfileSettingsRowLabelDanger,
        ]}
      >
        {label}
      </Text>
      {value ? (
        <Text
          style={[
            styles.mobileProfileSettingsRowValue,
            valueTone === "success" && styles.mobileProfileSettingsRowValueSuccess,
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}
      {showDot ? (
        <View style={styles.mobileProfileSettingsRowDot} testID="mobile-profile-about-new-dot" />
      ) : null}
      {showChevron ? <Ionicons name="chevron-forward" size={17} color={theme.text.soft} /> : null}
    </Pressable>
  );
}

export function SettingsAccountCard({
  authStatusLabel,
  bootstrapState,
  signedInUserLabel,
  status,
}: {
  authStatusLabel: string;
  bootstrapState: MobileBootstrapViewState;
  signedInUserLabel: string | null;
  status: string;
}) {
  const styles = useSettingsScreenStyles();
  const user = bootstrapState.status === "ready" ? bootstrapState.payload.user : null;
  const displayName =
    user?.displayName ?? signedInUserLabel ?? user?.username ?? copy.settingsAccountSignedOut;
  const releaseLabel =
    bootstrapState.status === "ready"
      ? `${bootstrapState.payload.app.version} / ${bootstrapState.payload.app.releaseChannel}`
      : runtimeConfig.environment;

  return (
    <View style={styles.settingsHeroCard}>
      <AvatarMark
        {...(user?.id ? { identityId: user.id } : {})}
        imageUrl={user?.avatarUrl ?? null}
        label={displayName}
        size="large"
        status={status === "signed-in" ? "active" : "idle"}
      />
      <View style={styles.settingsHeroText}>
        <Text style={styles.environmentLabel}>{copy.settingsAccountTitle}</Text>
        <Text style={styles.settingsHeroTitle} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.settingsHeroMeta} numberOfLines={2}>
          {authStatusLabel}
        </Text>
      </View>
      <View style={styles.settingsHeroBadge}>
        <Text style={styles.settingsHeroBadgeText}>{releaseLabel}</Text>
      </View>
    </View>
  );
}

export function SettingsSessionActionCard({
  isSignedIn,
  onOpenWebRegister,
  onOpenWebSignIn,
  onRefresh,
  onSignOut,
}: {
  isSignedIn: boolean;
  onOpenWebRegister(): void;
  onOpenWebSignIn(): void;
  onRefresh(): void;
  onSignOut(): void;
}) {
  const styles = useSettingsScreenStyles();
  return (
    <SettingsSection
      description={
        isSignedIn
          ? copy.settingsSessionActionsSignedInDescription
          : copy.settingsSessionActionsSignedOutDescription
      }
      title={copy.settingsSessionActionsTitle}
    >
      <View testID="mobile-settings-session-actions" style={styles.settingsSessionActionGrid}>
        <ActionButton
          label={copy.secondaryAction}
          onPress={onRefresh}
          testID="mobile-settings-refresh-session-action"
          variant="secondary"
        />
        {isSignedIn ? (
          <ActionButton
            label={copy.signOutAction}
            onPress={onSignOut}
            testID="mobile-settings-sign-out-action"
            variant="danger"
          />
        ) : (
          <>
            <ActionButton
              label={copy.authOpenSignInAction}
              onPress={onOpenWebSignIn}
              testID="mobile-settings-web-sign-in-action"
              variant="primary"
            />
            <ActionButton
              label={copy.authOpenRegisterAction}
              onPress={onOpenWebRegister}
              testID="mobile-settings-web-register-action"
              variant="secondary"
            />
          </>
        )}
      </View>
    </SettingsSection>
  );
}

export function SettingsMobileOverviewCard({
  bootstrapState,
  diagnostics,
  lastDeepLink,
  permissionSummary,
}: {
  bootstrapState: MobileBootstrapViewState;
  diagnostics: MobileSessionDiagnostics;
  lastDeepLink: MobileDeepLinkParseResult | null;
  permissionSummary: MobilePermissionSummary;
}) {
  const styles = useSettingsScreenStyles();
  const hasHealthySession = diagnostics.hasSession && !diagnostics.isExpired;
  const messagesFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.messages : null;
  const messageSearchFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.messageSearch : null;
  const notificationsFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.pushNotifications : null;
  const voiceFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.voice : null;
  const invitesFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.invites : null;
  const deepLinkStatus = getDeepLinkStatusLabel(lastDeepLink);
  const inviteReadiness = getMobileInviteReadiness({
    invitesFeature,
    lastDeepLink,
  });
  const rows: NativeSettingsRowItem[] = [
    {
      description: hasHealthySession
        ? copy.settingsMobileSessionHealthy
        : copy.settingsMobileSessionActionRequired,
      id: "session",
      label: copy.settingsMobileSessionTitle,
      tone: hasHealthySession ? "success" : "warning",
      value: hasHealthySession ? copy.settingsReadyLabel : copy.settingsMissingLabel,
    },
    {
      description: messagesFeature?.reason ?? copy.settingsMobileMessagingDescription,
      id: "messages",
      label: copy.settingsMobileMessagingTitle,
      tone: getFeatureStatusTone(messagesFeature?.status),
      value: getFeatureStatusLabel(messagesFeature?.status),
    },
    {
      description: messageSearchFeature?.reason ?? copy.settingsMobileSearchDescription,
      id: "message-search",
      label: copy.settingsMobileSearchTitle,
      tone: getFeatureStatusTone(messageSearchFeature?.status),
      value: getFeatureStatusLabel(messageSearchFeature?.status),
    },
    {
      description:
        notificationsFeature?.reason ??
        `${permissionSummary.needsUserAction} ${copy.settingsMobilePermissionNeedsActionSuffix}`,
      id: "notifications",
      label: copy.settingsMobileNotificationsTitle,
      tone: getFeatureStatusTone(notificationsFeature?.status),
      value: getFeatureStatusLabel(notificationsFeature?.status),
    },
    {
      description: voiceFeature?.reason ?? copy.settingsMobileVoiceDescription,
      id: "voice",
      label: copy.settingsMobileVoiceTitle,
      tone: getFeatureStatusTone(voiceFeature?.status),
      value: getFeatureStatusLabel(voiceFeature?.status),
    },
    {
      description: getInviteReadinessDescription(inviteReadiness),
      id: "invites",
      label: copy.settingsMobileInvitesTitle,
      tone: getInviteReadinessTone(inviteReadiness),
      value: getInviteReadinessValue(inviteReadiness),
    },
    {
      description: deepLinkStatus.description,
      id: "deep-link",
      label: copy.settingsMobileDeepLinkTitle,
      tone: lastDeepLink?.ok === false ? "warning" : "success",
      value: lastDeepLink?.ok === false ? copy.settingsPendingLabel : copy.settingsReadyLabel,
    },
  ];

  return (
    <SettingsSection
      description={copy.settingsMobileOverviewDescription}
      title={copy.settingsMobileOverviewTitle}
    >
      <NativeSettingsList rows={rows} />
    </SettingsSection>
  );
}

export function SettingsSupportLegalCard({
  onOpenCookies,
  onOpenPrivacyPolicy,
  onOpenSupport,
  onOpenTerms,
}: {
  onOpenCookies(): void;
  onOpenPrivacyPolicy(): void;
  onOpenSupport(): void;
  onOpenTerms(): void;
}) {
  const styles = useSettingsScreenStyles();
  return (
    <SettingsSection
      description={copy.settingsSupportLegalDescription}
      title={copy.settingsSupportLegalTitle}
    >
      <View testID="mobile-settings-support-legal" style={styles.settingsSessionActionGrid}>
        <ActionButton
          label={copy.settingsSupportAction}
          onPress={onOpenSupport}
          testID="mobile-settings-support-action"
          variant="primary"
        />
        <ActionButton
          label={copy.settingsPrivacyPolicyAction}
          onPress={onOpenPrivacyPolicy}
          testID="mobile-settings-privacy-action"
          variant="secondary"
        />
        <ActionButton
          label={copy.settingsTermsAction}
          onPress={onOpenTerms}
          testID="mobile-settings-terms-action"
          variant="secondary"
        />
        <ActionButton
          label={copy.settingsCookiesAction}
          onPress={onOpenCookies}
          testID="mobile-settings-cookies-action"
          variant="secondary"
        />
      </View>
    </SettingsSection>
  );
}

export function SettingsNativePermissionCard({
  mediaState,
  onRequestCameraPermission,
  onRequestDocumentPicker,
  onRequestNotificationPermission,
  onRequestPhotoLibraryPermission,
  readiness,
  summary,
}: {
  mediaState: MobileMediaRuntimeState;
  onRequestCameraPermission(): Promise<void>;
  onRequestDocumentPicker(): Promise<void>;
  onRequestNotificationPermission(): Promise<void>;
  onRequestPhotoLibraryPermission(): Promise<void>;
  readiness: readonly MobilePermissionReadiness[];
  summary: MobilePermissionSummary;
}) {
  const styles = useSettingsScreenStyles();
  const rows: NativeSettingsRowItem[] = readiness.map((item) => {
    const metadata = getMobilePermissionNativeMetadata(item.intent.id);

    return {
      description: metadata.usageDescription,
      id: item.intent.id,
      label: getMobilePermissionLabel(item.intent.id),
      tone: getPermissionStatusTone(item.status),
      value: getPermissionStatusLabel(item.status),
    };
  });

  return (
    <SettingsSection
      description={copy.settingsMobilePermissionsDescription}
      title={copy.settingsMobilePermissionsTitle}
    >
      <View style={styles.settingsSummaryRow}>
        <MetricMiniPill label={copy.settingsReadyLabel} value={summary.granted} />
        <MetricMiniPill label={copy.settingsPendingLabel} value={summary.needsUserAction} />
        <MetricMiniPill
          label={copy.settingsBlockedLabel}
          value={summary.blocked + summary.denied}
        />
      </View>
      <NativeSettingsList rows={rows} />
      <SettingsPermissionActionList
        mediaState={mediaState}
        onRequestCameraPermission={onRequestCameraPermission}
        onRequestDocumentPicker={onRequestDocumentPicker}
        onRequestNotificationPermission={onRequestNotificationPermission}
        onRequestPhotoLibraryPermission={onRequestPhotoLibraryPermission}
        readiness={readiness}
      />
    </SettingsSection>
  );
}

type SettingsPermissionActionItem = {
  actionLabel: string;
  description: string;
  disabled: boolean;
  icon: MobileIoniconName;
  id: "camera" | "document-picker" | "notifications" | "photo-library";
  label: string;
  onPress(): Promise<void>;
  status: MobilePermissionReadiness["status"];
  testID: string;
};

export function SettingsPermissionActionList({
  mediaState,
  onRequestCameraPermission,
  onRequestDocumentPicker,
  onRequestNotificationPermission,
  onRequestPhotoLibraryPermission,
  readiness,
}: {
  mediaState: MobileMediaRuntimeState;
  onRequestCameraPermission(): Promise<void>;
  onRequestDocumentPicker(): Promise<void>;
  onRequestNotificationPermission(): Promise<void>;
  onRequestPhotoLibraryPermission(): Promise<void>;
  readiness: readonly MobilePermissionReadiness[];
}) {
  const styles = useSettingsScreenStyles();
  const theme = useTheme();
  const mediaSummary = summarizeMobileMediaRuntimeState(mediaState);
  const notificationsStatus =
    getPermissionReadinessById(readiness, "notifications")?.status ?? "unknown";
  const notificationActionDisabled = isSettingsPermissionActionDisabled(notificationsStatus);
  const cameraActionDisabled =
    !mediaSummary.actionEnabled || isSettingsPermissionActionDisabled(mediaState.cameraStatus);
  const photoLibraryActionDisabled =
    !mediaSummary.actionEnabled ||
    isSettingsPermissionActionDisabled(mediaState.photoLibraryStatus);
  const documentPickerStatus: MobilePermissionReadiness["status"] =
    mediaState.hasDocumentPickerAccess ? "granted" : "unknown";
  const documentPickerActionDisabled = !mediaSummary.actionEnabled;
  const actions: SettingsPermissionActionItem[] = [
    {
      actionLabel:
        mediaState.status === "checking-photo-library"
          ? copy.mediaSetupCheckingAction
          : copy.mediaSetupPhotoLibraryAction,
      description: copy.mediaSetupDescription,
      disabled: photoLibraryActionDisabled,
      icon: "images-outline",
      id: "photo-library",
      label: copy.mediaSetupPhotoLibraryLabel,
      onPress: onRequestPhotoLibraryPermission,
      status: mediaState.photoLibraryStatus,
      testID: "mobile-settings-permission-action-photo-library",
    },
    {
      actionLabel:
        mediaState.status === "checking-camera"
          ? copy.mediaSetupCheckingAction
          : copy.mediaSetupCameraAction,
      description: copy.settingsPermissionCameraDescription,
      disabled: cameraActionDisabled,
      icon: "camera-outline",
      id: "camera",
      label: copy.mediaSetupCameraLabel,
      onPress: onRequestCameraPermission,
      status: mediaState.cameraStatus,
      testID: "mobile-settings-permission-action-camera",
    },
    {
      actionLabel:
        mediaState.status === "checking-document-picker"
          ? copy.mediaSetupCheckingAction
          : copy.mediaSetupDocumentPickerAction,
      description: copy.settingsPermissionDocumentPickerDescription,
      disabled: documentPickerActionDisabled,
      icon: "document-attach-outline",
      id: "document-picker",
      label: copy.mediaSetupDocumentPickerLabel,
      onPress: onRequestDocumentPicker,
      status: documentPickerStatus,
      testID: "mobile-settings-permission-action-document-picker",
    },
    {
      actionLabel: copy.settingsNotificationPermissionAction,
      description: copy.settingsNotificationPushDescription,
      disabled: notificationActionDisabled,
      icon: "notifications-outline",
      id: "notifications",
      label: copy.settingsNotificationPushTitle,
      onPress: onRequestNotificationPermission,
      status: notificationsStatus,
      testID: "mobile-settings-permission-action-notifications",
    },
  ];

  return (
    <View style={styles.settingsPermissionActionList}>
      {actions.map((item) => (
        <SettingsPermissionActionRow key={item.id} item={item} />
      ))}
      {mediaState.selectedAsset ? (
        <View style={styles.settingsPermissionAssetCard}>
          <Ionicons name="document-text-outline" size={18} color={theme.accent.strong} />
          <View style={styles.settingsPermissionAssetText}>
            <Text style={styles.mediaSelectedAssetLabel}>{copy.mediaSetupSelectedFileLabel}</Text>
            <Text style={styles.mediaSelectedAssetName} numberOfLines={1}>
              {mediaState.selectedAsset.name}
            </Text>
            <Text style={styles.mediaSelectedAssetMeta} numberOfLines={1}>
              {formatMobileMediaAssetMeta(mediaState.selectedAsset)}
            </Text>
          </View>
        </View>
      ) : null}
      {mediaState.errorMessage ? (
        <Text style={styles.notificationRuntimeError} numberOfLines={2}>
          {mediaState.errorMessage}
        </Text>
      ) : null}
      <Text style={styles.notificationRuntimeFootnote}>{copy.mediaSetupFootnote}</Text>
    </View>
  );
}

export function SettingsPermissionActionRow({ item }: { item: SettingsPermissionActionItem }) {
  const styles = useSettingsScreenStyles();
  const theme = useTheme();
  const tone = getPermissionStatusTone(item.status);

  return (
    <View style={styles.settingsPermissionActionRow}>
      <View
        style={[
          styles.settingsPermissionActionIcon,
          tone === "success" && styles.settingsPermissionActionIconSuccess,
          tone === "danger" && styles.settingsPermissionActionIconDanger,
          tone === "warning" && styles.settingsPermissionActionIconWarning,
        ]}
      >
        <Ionicons
          name={item.icon}
          size={18}
          color={tone === "danger" ? theme.status.danger : theme.accent.strong}
        />
      </View>
      <View style={styles.settingsPermissionActionText}>
        <Text style={styles.nativeSettingsRowTitle} numberOfLines={1}>
          {item.label}
        </Text>
        <Text style={styles.nativeSettingsRowDescription} numberOfLines={2}>
          {item.description}
        </Text>
      </View>
      <View style={styles.settingsPermissionActionControls}>
        <Text
          style={[
            styles.nativeSettingsRowValue,
            tone === "success" && styles.nativeSettingsRowValueSuccess,
            tone === "warning" && styles.nativeSettingsRowValueWarning,
            tone === "danger" && styles.nativeSettingsRowValueDanger,
          ]}
          numberOfLines={1}
        >
          {getPermissionStatusLabel(item.status)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.actionLabel}
          accessibilityState={{ disabled: item.disabled }}
          disabled={item.disabled}
          onPress={() => {
            void item.onPress();
          }}
          style={({ pressed }) => [
            styles.settingsPermissionActionButton,
            item.disabled && styles.settingsPermissionActionButtonDisabled,
            pressed && !item.disabled && styles.actionButtonPressed,
          ]}
          testID={item.testID}
        >
          <Text
            style={[
              styles.settingsPermissionActionButtonText,
              item.disabled && styles.actionButtonTextDisabled,
            ]}
            numberOfLines={1}
          >
            {item.actionLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

type NativeSettingsRowTone = "danger" | "neutral" | "success" | "warning";

type NativeSettingsRowItem = {
  description: string;
  id: string;
  label: string;
  tone: NativeSettingsRowTone;
  value: string;
};

export function NativeSettingsList({ rows }: { rows: readonly NativeSettingsRowItem[] }) {
  const styles = useSettingsScreenStyles();
  return (
    <View style={styles.nativeSettingsList}>
      {rows.map((row) => (
        <View key={row.id} style={styles.nativeSettingsRow}>
          <View
            style={[
              styles.nativeSettingsDot,
              row.tone === "success" && styles.nativeSettingsDotSuccess,
              row.tone === "warning" && styles.nativeSettingsDotWarning,
              row.tone === "danger" && styles.nativeSettingsDotDanger,
            ]}
          />
          <View style={styles.nativeSettingsRowText}>
            <Text style={styles.nativeSettingsRowTitle} numberOfLines={1}>
              {row.label}
            </Text>
            <Text style={styles.nativeSettingsRowDescription} numberOfLines={2}>
              {row.description}
            </Text>
          </View>
          <Text
            style={[
              styles.nativeSettingsRowValue,
              row.tone === "success" && styles.nativeSettingsRowValueSuccess,
              row.tone === "warning" && styles.nativeSettingsRowValueWarning,
              row.tone === "danger" && styles.nativeSettingsRowValueDanger,
            ]}
            numberOfLines={1}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function getFeatureStatusLabel(
  status: MobileBootstrapPayload["features"]["messages"]["status"] | undefined,
) {
  switch (status) {
    case "available":
      return copy.settingsFeatureAvailable;
    case "disabled":
      return copy.settingsFeatureDisabled;
    case "requires-native-permission":
    case "requires-server-contract":
      return copy.settingsPendingLabel;
    default:
      return copy.settingsPendingLabel;
  }
}

function getFeatureStatusTone(
  status: MobileBootstrapPayload["features"]["messages"]["status"] | undefined,
): NativeSettingsRowTone {
  switch (status) {
    case "available":
      return "success";
    case "disabled":
      return "neutral";
    case "requires-native-permission":
    case "requires-server-contract":
    default:
      return "warning";
  }
}

function getPermissionStatusLabel(status: MobilePermissionReadiness["status"]) {
  switch (status) {
    case "granted":
      return copy.settingsReadyLabel;
    case "blocked":
      return copy.settingsBlockedLabel;
    case "denied":
      return copy.settingsFeatureDisabled;
    case "not-requested":
    case "unknown":
    default:
      return copy.settingsPendingLabel;
  }
}

function getPermissionReadinessById(
  readiness: readonly MobilePermissionReadiness[],
  id: MobilePermissionIntentId,
): MobilePermissionReadiness | undefined {
  return readiness.find((item) => item.intent.id === id);
}

function getPermissionStatusTone(
  status: MobilePermissionReadiness["status"],
): NativeSettingsRowTone {
  switch (status) {
    case "granted":
      return "success";
    case "blocked":
    case "denied":
      return "danger";
    case "not-requested":
    case "unknown":
    default:
      return "warning";
  }
}

function isSettingsPermissionActionDisabled(status: MobilePermissionReadiness["status"]) {
  return status === "granted" || status === "blocked" || status === "denied";
}

export function SettingsSecurityCard({
  diagnostics,
  lastDeepLink,
}: {
  diagnostics: MobileSessionDiagnostics;
  lastDeepLink: MobileDeepLinkParseResult | null;
}) {
  const styles = useSettingsScreenStyles();
  const evidence = getMobileSessionEvidence(diagnostics, getSettingsEvidenceLabels());

  return (
    <SettingsSection
      description={copy.settingsSecurityDescription}
      title={copy.settingsSecurityTitle}
    >
      <SettingsEvidenceGrid items={evidence} />
      <DeepLinkStatusCard result={lastDeepLink} />
      <Text style={styles.settingsFootnote}>{copy.settingsNoSensitiveData}</Text>
    </SettingsSection>
  );
}

export function SettingsFeatureReadinessCard({
  features,
}: {
  features: MobileBootstrapPayload["features"];
}) {
  const styles = useSettingsScreenStyles();
  const summary = summarizeMobileFeatureReadiness(features);
  const evidence = getMobileFeatureEvidence(features, getSettingsEvidenceLabels());

  return (
    <SettingsSection
      description={copy.settingsFeatureDescription}
      title={copy.settingsFeatureTitle}
    >
      <View style={styles.settingsSummaryRow}>
        <MetricMiniPill label={copy.settingsFeatureAvailable} value={summary.available} />
        <MetricMiniPill label={copy.settingsPendingLabel} value={summary.pending} />
        <MetricMiniPill label={copy.settingsFeatureDisabled} value={summary.disabled} />
      </View>
      <SettingsEvidenceList items={evidence} />
    </SettingsSection>
  );
}

export function SettingsPermissionEvidenceCard({ summary }: { summary: MobilePermissionSummary }) {
  const styles = useSettingsScreenStyles();
  const evidence = getMobilePermissionEvidence(summary, getSettingsEvidenceLabels());

  return (
    <SettingsSection
      description={copy.settingsPermissionEvidenceDescription}
      title={copy.settingsPermissionEvidenceTitle}
    >
      <SettingsEvidenceGrid items={evidence} />
    </SettingsSection>
  );
}

export function DeveloperDiagnosticsCard({
  bootstrapSyncState,
}: {
  bootstrapSyncState: MobileSyncSnapshot;
}) {
  const styles = useSettingsScreenStyles();
  return (
    <View style={styles.developerSection}>
      <View style={styles.developerSectionHeader}>
        <Text style={styles.environmentLabel}>{copy.settingsDeveloperTitle}</Text>
        <Text style={styles.contractDescription}>{copy.settingsDeveloperDescription}</Text>
      </View>
      <MobileSyncStatusCard
        items={[{ label: copy.syncBootstrapLabel, snapshot: bootstrapSyncState }]}
      />
      <EnvironmentCard />
      <BootstrapContractCard />
      <ReleaseReadinessCard />
      <StoreReadinessCard />
      <ProductionReadinessCard />
      <MobileQualityGateCard />
    </View>
  );
}

export function SettingsReleaseQualityCard() {
  const styles = useSettingsScreenStyles();
  const settingsEvidenceLabels = getSettingsEvidenceLabels();
  const storeEvidence = getMobileStoreEvidence(mobileStoreReadiness, settingsEvidenceLabels);
  const releaseEvidence = getMobileReleaseEvidence({
    budgetCount: MOBILE_RELEASE_BUDGETS.length,
    labels: settingsEvidenceLabels,
    qualitySummary: mobileQualitySummary,
    releaseBudgets: MOBILE_RELEASE_BUDGETS,
  });

  return (
    <SettingsSection
      description={copy.settingsReleaseQualityDescription}
      title={copy.settingsReleaseQualityTitle}
    >
      <View style={styles.settingsSummaryRow}>
        <MetricMiniPill
          label={copy.qualityAutomatedLabel}
          value={mobileQualitySummary.automatedGateCount}
        />
        <MetricMiniPill
          label={copy.qualityManualLabel}
          value={mobileQualitySummary.manualCheckCount}
        />
        <MetricMiniPill label={copy.qualityDeviceLabel} value={mobileQualitySummary.targetCount} />
      </View>
      <SettingsEvidenceList items={[...releaseEvidence, ...storeEvidence]} />
    </SettingsSection>
  );
}

export function EnvironmentCard() {
  const styles = useSettingsScreenStyles();
  return (
    <View style={styles.environmentCard}>
      <Text style={styles.environmentLabel}>{copy.settingsEnvironmentLabel}</Text>
      <Text style={styles.environmentValue}>{runtimeConfig.environment}</Text>
      <Text style={styles.environmentUrl} numberOfLines={1}>
        {runtimeConfig.apiUrl}
      </Text>
    </View>
  );
}

export function BootstrapContractCard() {
  const styles = useSettingsScreenStyles();
  return (
    <View style={styles.contractCard}>
      <Text style={styles.environmentLabel}>{copy.bootstrapTitle}</Text>
      <Text style={styles.contractTitle}>{copy.bootstrapReady}</Text>
      <Text style={styles.contractDescription}>{copy.bootstrapDescription}</Text>
      <Text style={styles.contractEndpoint} numberOfLines={1}>
        {MOBILE_BOOTSTRAP_ENDPOINT}
      </Text>
    </View>
  );
}

export function SettingsLocaleSelector({
  locale,
  onSelectLocale,
}: {
  locale: MobileLocale;
  onSelectLocale(locale: MobileLocale): void;
}) {
  const styles = useSettingsScreenStyles();
  return (
    <View
      accessibilityLabel={copy.settingsLanguageTitle}
      accessibilityRole="radiogroup"
      testID="mobile-settings-language-control"
      style={styles.settingsLocaleControl}
    >
      <Text maxFontSizeMultiplier={2} style={styles.settingsLocaleDescription}>
        {copy.settingsLanguageControlDescription}
      </Text>
      <View style={styles.settingsLocaleOptions}>
        {MOBILE_LOCALE_OPTIONS.map((option) => {
          const isSelected = option.id === locale;

          return (
            <Pressable
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              key={option.id}
              onPress={() => onSelectLocale(option.id)}
              style={({ pressed }) => [
                styles.settingsLocaleOption,
                isSelected && styles.settingsLocaleOptionSelected,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Text
                maxFontSizeMultiplier={2}
                style={[
                  styles.settingsLocaleShortLabel,
                  isSelected && styles.settingsLocaleShortLabelSelected,
                ]}
              >
                {option.shortLabel}
              </Text>
              <Text
                maxFontSizeMultiplier={2}
                style={[
                  styles.settingsLocaleOptionLabel,
                  isSelected && styles.settingsLocaleOptionLabelSelected,
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function getSettingsAppearanceOptions(): ReadonlyArray<{
  id: MobileThemeMode;
  label: string;
}> {
  return [
    { id: "system", label: copy.settingsThemeSystemValue },
    { id: "light", label: copy.settingsThemeLightValue },
    { id: "dark", label: copy.settingsThemeDarkValue },
  ];
}

export function SettingsAppearanceSelector() {
  const styles = useSettingsScreenStyles();
  const { mode, setMode } = useThemePreference();

  return (
    <View
      accessibilityLabel={copy.settingsThemeTitle}
      accessibilityRole="radiogroup"
      testID="mobile-settings-appearance-control"
      style={styles.settingsLocaleControl}
    >
      <Text maxFontSizeMultiplier={2} style={styles.settingsLocaleDescription}>
        {copy.settingsThemeControlDescription}
      </Text>
      <View style={styles.settingsLocaleOptions}>
        {getSettingsAppearanceOptions().map((option) => {
          const isSelected = option.id === mode;

          return (
            <Pressable
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              key={option.id}
              onPress={() => setMode(option.id)}
              style={({ pressed }) => [
                styles.settingsLocaleOption,
                isSelected && styles.settingsLocaleOptionSelected,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Text
                maxFontSizeMultiplier={2}
                style={[
                  styles.settingsLocaleOptionLabel,
                  isSelected && styles.settingsLocaleOptionLabelSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SettingsWorkspaceLayoutSelector() {
  const styles = useSettingsScreenStyles();
  const { layout, setLayout } = useMobileWorkspaceLayoutPreference();
  const options = [
    { id: "rail" as const, label: copy.settingsWorkspaceLayoutRailOption },
    { id: "compact" as const, label: copy.settingsWorkspaceLayoutCompactOption },
  ];

  return (
    <View
      accessibilityLabel={copy.settingsWorkspaceLayoutLabel}
      accessibilityRole="radiogroup"
      style={styles.settingsLocaleControl}
      testID="mobile-settings-workspace-layout-control"
    >
      <Text maxFontSizeMultiplier={2} style={styles.settingsLocaleDescription}>
        {copy.settingsWorkspaceLayoutDescription}
      </Text>
      <View style={styles.settingsLocaleOptions}>
        {options.map((option) => {
          const selected = layout === option.id;
          return (
            <Pressable
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={option.id}
              onPress={() => setLayout(option.id)}
              style={({ pressed }) => [
                styles.settingsLocaleOption,
                selected && styles.settingsLocaleOptionSelected,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Text
                style={[
                  styles.settingsLocaleOptionLabel,
                  selected && styles.settingsLocaleOptionLabelSelected,
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SettingsHapticsControl() {
  const styles = useSettingsScreenStyles();
  const { enabled, setEnabled } = useMobileHaptics();
  const label = enabled ? copy.settingsHapticsEnabled : copy.settingsHapticsDisabled;

  return (
    <Pressable
      accessibilityLabel={copy.settingsHapticsTitle}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      onPress={() => setEnabled(!enabled)}
      style={({ pressed }) => [
        styles.settingsLocaleOption,
        enabled && styles.settingsLocaleOptionSelected,
        pressed && styles.actionButtonPressed,
      ]}
      testID="mobile-haptics-toggle"
    >
      <Text
        style={[
          styles.settingsLocaleOptionLabel,
          enabled && styles.settingsLocaleOptionLabelSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function getMobileVoiceInputModeOptions(): ReadonlyArray<{
  id: MobileVoiceInputMode;
  label: string;
}> {
  return [
    {
      id: "voice-activity",
      label: copy.voiceInputModeVoiceActivity,
    },
    {
      id: "push-to-talk",
      label: copy.voiceInputModePushToTalk,
    },
  ];
}

export function SettingsVoiceInputModeSelector({
  onSelectVoiceInputMode,
  voiceInputMode,
}: {
  onSelectVoiceInputMode(mode: MobileVoiceInputMode): void;
  voiceInputMode: MobileVoiceInputMode;
}) {
  const styles = useSettingsScreenStyles();
  return (
    <View
      accessibilityLabel={copy.settingsVoiceInputModeTitle}
      accessibilityRole="radiogroup"
      testID="mobile-settings-voice-input-mode-control"
      style={styles.settingsLocaleControl}
    >
      <Text maxFontSizeMultiplier={2} style={styles.settingsLocaleDescription}>
        {copy.settingsVoiceInputModeControlDescription}
      </Text>
      <View style={styles.settingsLocaleOptions}>
        {getMobileVoiceInputModeOptions().map((option) => {
          const isSelected = option.id === voiceInputMode;

          return (
            <Pressable
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              key={option.id}
              onPress={() => onSelectVoiceInputMode(option.id)}
              style={({ pressed }) => [
                styles.settingsLocaleOption,
                isSelected && styles.settingsLocaleOptionSelected,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Text
                maxFontSizeMultiplier={2}
                style={[
                  styles.settingsLocaleOptionLabel,
                  isSelected && styles.settingsLocaleOptionLabelSelected,
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SettingsAppLockControl({
  availability,
  enabled,
  onToggle,
}: {
  availability: MobileAppLockAvailability;
  enabled: boolean;
  onToggle(enabled: boolean): void;
}) {
  const styles = useSettingsScreenStyles();
  const unavailable = availability === "unavailable";
  const valueLabel = unavailable
    ? copy.settingsAppLockUnavailableValue
    : enabled
      ? copy.settingsAppLockEnabledValue
      : copy.settingsAppLockDisabledValue;

  return (
    <View style={styles.settingsLocaleControl} testID="mobile-settings-app-lock-control">
      <Text style={styles.settingsLocaleDescription}>
        {unavailable
          ? copy.settingsAppLockUnavailableDescription
          : copy.settingsAppLockControlDescription}
      </Text>
      <Pressable
        accessibilityLabel={copy.settingsAppLockToggleLabel}
        accessibilityRole="switch"
        accessibilityState={{ checked: enabled, disabled: unavailable }}
        disabled={unavailable}
        onPress={() => onToggle(!enabled)}
        style={({ pressed }) => [
          styles.settingsLocaleOption,
          enabled && !unavailable && styles.settingsLocaleOptionSelected,
          pressed && styles.actionButtonPressed,
        ]}
        testID="mobile-settings-app-lock-toggle"
      >
        <Text
          style={[
            styles.settingsLocaleOptionLabel,
            enabled && !unavailable && styles.settingsLocaleOptionLabelSelected,
          ]}
          numberOfLines={1}
        >
          {copy.settingsAppLockToggleLabel}
        </Text>
        <Text
          style={[
            styles.settingsLocaleShortLabel,
            enabled && !unavailable && styles.settingsLocaleShortLabelSelected,
          ]}
        >
          {valueLabel}
        </Text>
      </Pressable>
    </View>
  );
}

export function SettingsPreferenceSection({
  children,
  description,
  rows,
  title,
}: {
  children?: ReactNode;
  description: string;
  rows: readonly NativeSettingsRowItem[];
  title: string;
}) {
  const styles = useSettingsScreenStyles();
  return (
    <SettingsSection description={description} title={title}>
      <NativeSettingsList rows={rows} />
      {children ? <View style={styles.settingsSectionActions}>{children}</View> : null}
    </SettingsSection>
  );
}

export function SettingsSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  const styles = useSettingsScreenStyles();
  return (
    <View style={styles.settingsSection}>
      <View style={styles.settingsSectionHeader}>
        <Text style={styles.environmentLabel}>{title}</Text>
        <Text style={styles.contractDescription}>{description}</Text>
      </View>
      {children}
    </View>
  );
}

export function SettingsEvidenceGrid({ items }: { items: readonly MobileSettingsEvidenceItem[] }) {
  const styles = useSettingsScreenStyles();
  return (
    <View style={styles.settingsEvidenceGrid}>
      {items.map((item) => (
        <View
          key={item.id}
          style={[
            styles.settingsEvidenceTile,
            item.tone === "success" && styles.settingsEvidenceTileSuccess,
            item.tone === "warning" && styles.settingsEvidenceTileWarning,
            item.tone === "danger" && styles.settingsEvidenceTileDanger,
          ]}
        >
          <Text style={styles.settingsEvidenceLabel}>{item.label}</Text>
          <Text style={styles.settingsEvidenceValue} numberOfLines={1}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function SettingsEvidenceList({ items }: { items: readonly MobileSettingsEvidenceItem[] }) {
  const styles = useSettingsScreenStyles();
  return (
    <View style={styles.settingsEvidenceList}>
      {items.map((item) => (
        <View key={item.id} style={styles.settingsEvidenceRow}>
          <View
            style={[
              styles.settingsEvidenceDot,
              item.tone === "success" && styles.settingsEvidenceDotSuccess,
              item.tone === "warning" && styles.settingsEvidenceDotWarning,
              item.tone === "danger" && styles.settingsEvidenceDotDanger,
            ]}
          />
          <View style={styles.settingsEvidenceRowText}>
            <Text style={styles.settingsEvidenceRowTitle} numberOfLines={1}>
              {item.label}
            </Text>
            {item.description ? (
              <Text style={styles.settingsEvidenceDescription} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </View>
          <Text
            style={[
              styles.settingsEvidenceRowValue,
              item.tone === "success" && styles.settingsEvidenceRowValueSuccess,
              item.tone === "warning" && styles.settingsEvidenceRowValueWarning,
              item.tone === "danger" && styles.settingsEvidenceRowValueDanger,
            ]}
            numberOfLines={1}
          >
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ReleaseReadinessCard() {
  const styles = useSettingsScreenStyles();
  return (
    <View style={styles.contractCard}>
      <Text style={styles.environmentLabel}>{copy.releaseTitle}</Text>
      <Text style={styles.contractTitle}>{copy.releaseReady}</Text>
      <View style={styles.releaseBudgetList}>
        {MOBILE_RELEASE_BUDGETS.map((budget) => (
          <View key={budget.metric} style={styles.releaseBudgetRow}>
            <Text style={styles.releaseBudgetMetric}>{budget.metric}</Text>
            <Text style={styles.releaseBudgetTarget}>{budget.target}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function StoreReadinessCard() {
  const styles = useSettingsScreenStyles();
  const isReady = mobileStoreReadiness.blockers.length === 0;

  return (
    <View style={[styles.contractCard, isReady && styles.storeReadyCard]}>
      <Text style={styles.environmentLabel}>{copy.storeTitle}</Text>
      <Text style={styles.contractTitle}>{isReady ? copy.storeReady : copy.storeNeedsReview}</Text>
      <Text style={styles.contractDescription}>{copy.storeDescription}</Text>
      <View style={styles.releaseBudgetRow}>
        <Text style={styles.releaseBudgetMetric}>{copy.storePermissionsLabel}</Text>
        <Text style={styles.releaseBudgetTarget}>{mobileStoreReadiness.permissionCount}</Text>
      </View>
      <View style={styles.releaseBudgetRow}>
        <Text style={styles.releaseBudgetMetric}>{copy.storePrivacyLabel}</Text>
        <Text style={styles.releaseBudgetTarget}>
          {mobileStoreReadiness.privacyRequirementCount}
        </Text>
      </View>
    </View>
  );
}

export function ProductionReadinessCard() {
  const styles = useSettingsScreenStyles();
  const firstGates = MOBILE_PRODUCTION_READINESS_GATES.slice(0, 4)
    .map((gate) => gate.id)
    .join(" - ");

  return (
    <View style={styles.contractCard}>
      <Text style={styles.environmentLabel}>{copy.productionReadinessTitle}</Text>
      <Text style={styles.contractTitle}>{copy.productionReadinessReady}</Text>
      <Text style={styles.contractDescription}>{copy.productionReadinessDescription}</Text>
      <View style={styles.qualityGrid}>
        <MetricTile
          label={copy.productionReadinessStagesLabel}
          value={mobileProductionReadinessSummary.stageCount}
        />
        <MetricTile
          label={copy.productionReadinessGatesLabel}
          value={mobileProductionReadinessSummary.totalGateCount}
        />
        <MetricTile
          label={copy.productionReadinessCriticalLabel}
          value={mobileProductionReadinessSummary.criticalGateCount}
        />
      </View>
      <View style={styles.releaseBudgetRow}>
        <Text style={styles.releaseBudgetMetric}>{copy.productionReadinessAutomationLabel}</Text>
        <Text style={styles.releaseBudgetTarget}>
          {mobileProductionReadinessSummary.automatedGateCount}
        </Text>
      </View>
      <Text style={styles.contractDescription} numberOfLines={2}>
        {firstGates}
      </Text>
    </View>
  );
}

export function MobileQualityGateCard() {
  const styles = useSettingsScreenStyles();
  const firstTargets = MOBILE_QA_DEVICE_MATRIX.slice(0, 3)
    .map((target) => target.label)
    .join(" - ");
  const criticalChecks = MOBILE_MANUAL_QA_CHECKS.filter((check) => check.risk === "critical");

  return (
    <View style={styles.contractCard}>
      <Text style={styles.environmentLabel}>{copy.qualityTitle}</Text>
      <Text style={styles.contractTitle}>{copy.qualityReady}</Text>
      <Text style={styles.contractDescription}>{copy.qualityDescription}</Text>
      <View style={styles.qualityGrid}>
        <MetricTile
          label={copy.qualityAutomatedLabel}
          value={mobileQualitySummary.automatedGateCount}
        />
        <MetricTile label={copy.qualityManualLabel} value={mobileQualitySummary.manualCheckCount} />
        <MetricTile label={copy.qualityDeviceLabel} value={mobileQualitySummary.targetCount} />
      </View>
      <View style={styles.releaseBudgetRow}>
        <Text style={styles.releaseBudgetMetric}>{copy.qualityCriticalLabel}</Text>
        <Text style={styles.releaseBudgetTarget}>
          {criticalChecks.length} / {mobileQualitySummary.manualCheckCount}
        </Text>
      </View>
      <Text style={styles.contractDescription} numberOfLines={2}>
        {firstTargets}
      </Text>
    </View>
  );
}

export function SessionDiagnostics({ diagnostics }: { diagnostics: MobileSessionDiagnostics }) {
  const styles = useSettingsScreenStyles();
  return (
    <View style={styles.diagnosticsRow}>
      <DiagnosticPill
        label={copy.settingsSessionLabel}
        value={diagnostics.hasSession ? copy.settingsReadyLabel : copy.settingsMissingLabel}
      />
      <DiagnosticPill label={copy.settingsScopeCountLabel} value={String(diagnostics.scopeCount)} />
      <DiagnosticPill
        label={copy.settingsRefreshTokenLabel}
        value={diagnostics.hasRefreshToken ? copy.settingsReadyLabel : copy.settingsMissingLabel}
      />
    </View>
  );
}

export function DeepLinkStatusCard({ result }: { result: MobileDeepLinkParseResult | null }) {
  const styles = useSettingsScreenStyles();
  const statusLabel = getDeepLinkStatusLabel(result);
  const isRejected = result?.ok === false;

  return (
    <View style={[styles.statusCard, isRejected && styles.statusCardWarning]}>
      <View style={[styles.statusIcon, isRejected && styles.statusIconWarning]}>
        <Text style={styles.statusIconText}>{isRejected ? "!" : "OK"}</Text>
      </View>
      <View style={styles.statusCardText}>
        <Text style={styles.environmentLabel}>{copy.deepLinkTitle}</Text>
        <Text style={styles.statusCardTitle}>{statusLabel.title}</Text>
        <Text style={styles.statusCardDescription}>{statusLabel.description}</Text>
      </View>
    </View>
  );
}

function getInviteReadinessDescription(readiness: MobileInviteReadiness): string {
  switch (readiness.reason) {
    case "ready":
      return copy.inviteReadinessReady;
    case "disabled":
      return copy.inviteReadinessDisabled;
    case "missing-feature":
      return copy.inviteReadinessMissingFeature;
    case "server-contract-required":
      return copy.inviteReadinessServerPending;
    case "unsafe-link":
      return copy.inviteReadinessUnsafe;
    case "not-an-invite":
    default:
      return copy.inviteReadinessIdle;
  }
}

function getInviteReadinessTone(readiness: MobileInviteReadiness): NativeSettingsRowItem["tone"] {
  if (readiness.reason === "ready") {
    return "success";
  }

  if (readiness.reason === "unsafe-link") {
    return "danger";
  }

  if (readiness.reason === "server-contract-required" || readiness.reason === "missing-feature") {
    return "warning";
  }

  return "neutral";
}

function getInviteReadinessValue(readiness: MobileInviteReadiness): string {
  if (readiness.reason === "ready") {
    return copy.settingsReadyLabel;
  }

  if (readiness.reason === "not-an-invite") {
    return copy.settingsMissingLabel;
  }

  if (readiness.reason === "disabled") {
    return copy.settingsFeatureDisabled;
  }

  return copy.settingsPendingLabel;
}

function getDeepLinkStatusLabel(result: MobileDeepLinkParseResult | null) {
  if (!result) {
    return {
      description: copy.deepLinkReady,
      title: copy.deepLinkReady,
    };
  }

  if (!result.ok) {
    return {
      description: `${copy.deepLinkRejected}: ${result.reason}`,
      title: copy.deepLinkRejected,
    };
  }

  switch (result.intent.type) {
    case "auth-handoff":
      return {
        description: copy.deepLinkAuthPending,
        title: copy.deepLinkAccepted,
      };
    case "invite":
      return {
        description: copy.deepLinkInvitePending,
        title: copy.deepLinkAccepted,
      };
    case "route":
      return {
        description: copy.deepLinkRoutePending,
        title: copy.deepLinkAccepted,
      };
    default:
      return {
        description: copy.deepLinkReady,
        title: copy.deepLinkReady,
      };
  }
}

export function ProfileSettingsScreen({
  activeSection,
  appLockAvailability,
  appLockEnabled,
  authStatusLabel,
  bootstrapState,
  error,
  locale,
  mediaState,
  permissionReadiness,
  permissionSummary,
  signedInUserLabel,
  socialActionsEnabled = false,
  status,
  syncHealth,
  voiceInputMode,
  onOpenWebRegister,
  onOpenWebSignIn,
  onOpenCookies,
  onOpenPrivacyPolicy,
  onOpenSupport,
  onOpenTerms,
  onRefresh,
  onRefreshBootstrap,
  onRefreshVisibleData,
  onRequestCameraPermission,
  onRequestDocumentPicker,
  onRequestNotificationPermission,
  onRequestPhotoLibraryPermission,
  onSelectLocale,
  onSelectVoiceInputMode,
  onSignOut,
  onUpdatePresence,
  sessionDiagnostics,
  onToggleAppLock,
  onBack,
}: {
  activeSection?: string;
  appLockAvailability: MobileAppLockAvailability;
  appLockEnabled: boolean;
  authStatusLabel: string;
  bootstrapState: MobileBootstrapViewState;
  error: string | null;
  locale: MobileLocale;
  mediaState: MobileMediaRuntimeState;
  permissionReadiness: readonly MobilePermissionReadiness[];
  permissionSummary: MobilePermissionSummary;
  signedInUserLabel: string | null;
  socialActionsEnabled?: boolean;
  status: string;
  syncHealth: MobileSyncHealthSummary;
  voiceInputMode: MobileVoiceInputMode;
  onOpenWebRegister(): void;
  onOpenWebSignIn(): void;
  onOpenCookies(): void;
  onOpenPrivacyPolicy(): void;
  onOpenSupport(): void;
  onOpenTerms(): void;
  onRefresh(): void;
  onRefreshBootstrap(): void;
  onRefreshVisibleData(): void;
  onRequestCameraPermission(): Promise<void>;
  onRequestDocumentPicker(): Promise<void>;
  onRequestNotificationPermission(): Promise<void>;
  onRequestPhotoLibraryPermission(): Promise<void>;
  onSelectLocale(locale: MobileLocale): void;
  onSelectVoiceInputMode(mode: MobileVoiceInputMode): void;
  onSignOut(): void;
  onUpdatePresence: ((status: MobileFriendPresenceStatus) => Promise<void>) | undefined;
  sessionDiagnostics: MobileSessionDiagnostics;
  onToggleAppLock(enabled: boolean): void;
  onBack?(): void;
}) {
  const styles = useSettingsScreenStyles();
  const { mode: themeMode } = useThemePreference();
  const isSignedIn = status === "signed-in";
  const appVersion =
    bootstrapState.status === "ready"
      ? bootstrapState.payload.app.version
      : mobilePackageJson.version;
  const releaseChannel =
    bootstrapState.status === "ready"
      ? bootstrapState.payload.app.releaseChannel
      : runtimeConfig.environment;
  const appearanceRows: NativeSettingsRowItem[] = [
    {
      description: copy.settingsLanguageDescription,
      id: "language",
      label: copy.settingsLanguageTitle,
      tone: "success",
      value:
        locale === "tr" ? copy.settingsLanguageTurkishValue : copy.settingsLanguageEnglishValue,
    },
    {
      description: copy.settingsThemeDescription,
      id: "theme",
      label: copy.settingsThemeTitle,
      tone: "success",
      value:
        themeMode === "dark"
          ? copy.settingsThemeDarkValue
          : themeMode === "light"
            ? copy.settingsThemeLightValue
            : copy.settingsThemeSystemValue,
    },
  ];
  const notificationRows: NativeSettingsRowItem[] = [
    {
      description: copy.settingsNotificationPushDescription,
      id: "push-notifications",
      label: copy.settingsNotificationPushTitle,
      tone: getPermissionStatusTone(
        getPermissionReadinessById(permissionReadiness, "notifications")?.status ?? "unknown",
      ),
      value: getPermissionStatusLabel(
        getPermissionReadinessById(permissionReadiness, "notifications")?.status ?? "unknown",
      ),
    },
  ];
  const voiceRows: NativeSettingsRowItem[] = [
    {
      description: copy.settingsVoiceInputModeDescription,
      id: "voice-input-mode",
      label: copy.settingsVoiceInputModeTitle,
      tone: "success",
      value:
        voiceInputMode === "push-to-talk"
          ? copy.voiceInputModePushToTalk
          : copy.voiceInputModeVoiceActivity,
    },
    {
      description: copy.settingsVoiceNoiseSuppressionDescription,
      id: "voice-noise-suppression",
      label: copy.settingsVoiceNoiseSuppressionTitle,
      tone: "success",
      value: getMobileNoiseSuppressionLabel(locale),
    },
  ];
  const privacyRows: NativeSettingsRowItem[] = [
    {
      description: isSignedIn
        ? copy.settingsPrivacySessionHealthyDescription
        : copy.settingsPrivacySessionSignedOutDescription,
      id: "session-security",
      label: copy.settingsPrivacySessionTitle,
      tone: isSignedIn ? "success" : "warning",
      value: isSignedIn ? copy.settingsReadyLabel : copy.settingsMissingLabel,
    },
    {
      description: copy.settingsPrivacyPermissionsDescription,
      id: "permission-scope",
      label: copy.settingsPrivacyPermissionsTitle,
      tone: permissionSummary.blocked + permissionSummary.denied > 0 ? "warning" : "success",
      value: `${permissionSummary.granted}/${permissionReadiness.length}`,
    },
  ];
  const aboutRows: NativeSettingsRowItem[] = [
    {
      description: copy.settingsAboutVersionDescription,
      id: "app-version",
      label: copy.settingsAboutVersionTitle,
      tone: "neutral",
      value: appVersion,
    },
    {
      description: copy.settingsAboutReleaseChannelDescription,
      id: "release-channel",
      label: copy.settingsAboutReleaseChannelTitle,
      tone: "neutral",
      value: releaseChannel,
    },
  ];
  const resolvedSection = activeSection ?? (socialActionsEnabled ? "hub" : "legacy");
  const sectionLabels = {
    account: copy.settingsAccountTitle,
    security: copy.settingsSecurityTitle,
    appearance: copy.settingsAppearanceTitle,
    notifications: copy.settingsNotificationsTitle,
    language: copy.settingsLanguageTitle,
    about: copy.settingsAboutTitle,
    developer: copy.settingsDeveloperTitle,
  } as const;

  const sectionShell = (title: string, children: ReactNode, testID: string) => (
    <ScrollView
      contentContainerStyle={styles.settingsScreenContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.settingsScreenScroll}
    >
      <ScreenShell
        testID={testID}
        eyebrow={copy.tabProfile}
        title={title}
        description={copy.settingsDescription}
      >
        {onBack ? (
          <Button
            label={copy.messageThreadBackAction}
            icon="arrow-back"
            variant="ghost"
            onPress={onBack}
            testID={`${testID}-back`}
          />
        ) : null}
        {children}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScreenShell>
    </ScrollView>
  );

  if (resolvedSection === "hub") {
    return (
      <MobileProfileSettingsHub
        appVersion={appVersion}
        bootstrapState={bootstrapState}
        locale={locale}
        onRefreshBootstrap={onRefreshBootstrap}
        onSignOut={onSignOut}
        onUpdatePresence={onUpdatePresence}
        sessionDiagnostics={sessionDiagnostics}
        signedInUserLabel={signedInUserLabel}
        status={status}
        themeMode={themeMode}
      />
    );
  }

  if (resolvedSection === "account") {
    return (
      <MobileAccountSettingsScreen
        onBack={onBack ?? (() => mobileNavigationRef.isReady() && mobileNavigationRef.goBack())}
        presence={bootstrapState.status === "ready" ? bootstrapState.payload.user.status : null}
      />
    );
  }
  if (resolvedSection === "security") {
    return (
      <MobileSecuritySettingsScreen
        appLockAvailability={appLockAvailability}
        appLockEnabled={appLockEnabled}
        isSignedIn={isSignedIn}
        onBack={onBack ?? (() => mobileNavigationRef.isReady() && mobileNavigationRef.goBack())}
        onOpenTwoFactor={() =>
          mobileNavigationRef.isReady() && mobileNavigationRef.navigate("Security")
        }
        onRefreshSession={onRefresh}
        onSignOut={onSignOut}
        onToggleAppLock={onToggleAppLock}
        sessionDiagnostics={sessionDiagnostics}
      />
    );
  }
  if (resolvedSection === "appearance") {
    return (
      <MobileAppearanceSettingsScreen
        onBack={onBack ?? (() => mobileNavigationRef.isReady() && mobileNavigationRef.goBack())}
      />
    );
  }
  if (resolvedSection === "language") {
    return (
      <MobileLanguageSettingsScreen
        onBack={onBack ?? (() => mobileNavigationRef.isReady() && mobileNavigationRef.goBack())}
      />
    );
  }
  if (resolvedSection === "notifications") {
    return (
      <MobileNotificationSettingsScreen
        onBack={onBack ?? (() => mobileNavigationRef.isReady() && mobileNavigationRef.goBack())}
      />
    );
  }
  if (resolvedSection === "about") {
    return (
      <MobileAboutSettingsScreen
        appVersion={appVersion}
        onBack={onBack ?? (() => mobileNavigationRef.isReady() && mobileNavigationRef.goBack())}
        // Legal texts open in-app now; they are the same server-rendered document
        // the web shows, so there is no reason to eject the user to a browser.
        onOpenCookies={() => openMobileLegalDocument("cookies")}
        onOpenLicenses={openMobileOpenSourceLicenses}
        onOpenPrivacy={() => openMobileLegalDocument("privacy")}
        onOpenTerms={() => openMobileLegalDocument("terms")}
        releaseChannel={releaseChannel}
        serviceOnline={bootstrapState.status === "ready"}
      />
    );
  }
  if (resolvedSection === "developer")
    return sectionShell(
      sectionLabels.developer,
      <>
        <SettingsPermissionEvidenceCard summary={permissionSummary} />
        <SettingsReleaseQualityCard />
        {bootstrapState.status === "ready" ? (
          <SettingsFeatureReadinessCard features={bootstrapState.payload.features} />
        ) : null}
      </>,
      "mobile-settings-developer",
    );

  return (
    <ScrollView
      contentContainerStyle={styles.settingsScreenContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.settingsScreenScroll}
    >
      <ScreenShell
        testID="mobile-settings-screen"
        eyebrow={copy.tabProfile}
        title={copy.settingsTitle}
        description={copy.settingsDescription}
      >
        <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
        <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
        <SettingsAccountCard
          authStatusLabel={authStatusLabel}
          bootstrapState={bootstrapState}
          signedInUserLabel={signedInUserLabel}
          status={status}
        />
        {socialActionsEnabled ? <SocialAccountQuickActions /> : null}
        <SettingsSessionActionCard
          isSignedIn={isSignedIn}
          onOpenWebRegister={onOpenWebRegister}
          onOpenWebSignIn={onOpenWebSignIn}
          onRefresh={onRefresh}
          onSignOut={onSignOut}
        />
        <SettingsSupportLegalCard
          onOpenCookies={() => openMobileLegalDocument("cookies")}
          onOpenPrivacyPolicy={() => openMobileLegalDocument("privacy")}
          onOpenSupport={onOpenSupport}
          onOpenTerms={() => openMobileLegalDocument("terms")}
        />
        <SettingsPreferenceSection
          description={copy.settingsAppearanceDescription}
          rows={appearanceRows}
          title={copy.settingsAppearanceTitle}
        >
          <SettingsLocaleSelector locale={locale} onSelectLocale={onSelectLocale} />
          <SettingsAppearanceSelector />
          <SettingsHapticsControl />
        </SettingsPreferenceSection>
        <SettingsPreferenceSection
          description={copy.settingsNotificationsDescription}
          rows={notificationRows}
          title={copy.settingsNotificationsTitle}
        />
        <SettingsPreferenceSection
          description={copy.settingsVoiceDescription}
          rows={voiceRows}
          title={copy.settingsVoiceTitle}
        >
          <SettingsVoiceInputModeSelector
            voiceInputMode={voiceInputMode}
            onSelectVoiceInputMode={onSelectVoiceInputMode}
          />
        </SettingsPreferenceSection>
        <SettingsPreferenceSection
          description={copy.settingsPrivacyDescription}
          rows={privacyRows}
          title={copy.settingsPrivacyTitle}
        />
        <SettingsPreferenceSection
          description={copy.settingsAppLockDescription}
          rows={[]}
          title={copy.settingsAppLockTitle}
        >
          <SettingsAppLockControl
            availability={appLockAvailability}
            enabled={appLockEnabled}
            onToggle={onToggleAppLock}
          />
        </SettingsPreferenceSection>
        <SettingsNativePermissionCard
          mediaState={mediaState}
          onRequestCameraPermission={onRequestCameraPermission}
          onRequestDocumentPicker={onRequestDocumentPicker}
          onRequestNotificationPermission={onRequestNotificationPermission}
          onRequestPhotoLibraryPermission={onRequestPhotoLibraryPermission}
          readiness={permissionReadiness}
          summary={permissionSummary}
        />
        <SettingsPreferenceSection
          description={copy.settingsAboutDescription}
          rows={aboutRows}
          title={copy.settingsAboutTitle}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScreenShell>
    </ScrollView>
  );
}
