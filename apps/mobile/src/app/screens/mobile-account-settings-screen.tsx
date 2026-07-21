import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type {
  MobileAccountDmPolicy,
  MobileAccountFriendRequestPolicy,
  MobileAccountSettingsResponse,
  MobileAccountSettingsUpdate,
} from "@wizards/types";

import {
  DEFAULT_LOCAL_VISIBILITY,
  getMobileAccountProfileCompletion,
  persistMobileAccountVisibilityPreference,
  readMobileAccountVisibilityPreferences,
  type MobileAccountLocalVisibility,
  type MobileAccountLocalVisibilityField,
  type MobileAccountLocalVisibilityPreferences,
} from "../../account/mobile-account-settings-client";
import {
  useMobileAccountSettingsMutation,
  useMobileAccountSettingsQuery,
} from "../../account/mobile-account-settings-query";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { requestMobileVerificationEmail } from "../../auth/mobile-auth-exchange";
import type { MobileSessionUser } from "../../auth/session-types";
import { getMobileAvatarInitials } from "../../design/mobile-avatar-color";
import { mobileCopy, type MobileLocale } from "../../locale/mobile-copy";
import { useMobileSocialMutations } from "../../social/mobile-social-query";
import { BottomSheet, Button, Skeleton } from "../components/kit";
import { MobileCachedImage } from "../components/mobile-cached-image";
import { useToast } from "../components/kit/toast";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMobileAccountSettingsStyles } from "./mobile-account-settings-screen.styles";

const DM_POLICIES: readonly MobileAccountDmPolicy[] = [
  "EVERYONE",
  "FRIENDS",
  "MUTUAL_SERVERS",
  "NOBODY",
];
const FRIEND_REQUEST_POLICIES: readonly MobileAccountFriendRequestPolicy[] = [
  "EVERYONE",
  "MUTUAL_SERVERS",
  "MUTUAL_FRIENDS",
  "NOBODY",
];
const LOCAL_VISIBILITY_POLICIES: readonly MobileAccountLocalVisibility[] = [
  "EVERYONE",
  "FRIENDS",
  "NOBODY",
];

type PolicySheet = "dm" | "friendRequests" | "presence" | "profile" | null;

export interface MobileAccountSettingsViewProps {
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly isVerificationSending: boolean;
  readonly locale: MobileLocale;
  readonly localVisibility: MobileAccountLocalVisibilityPreferences;
  readonly onBack: () => void;
  readonly onCopyUsername: (username: string) => Promise<void>;
  readonly onRetry: (() => void) | undefined;
  readonly onVerifyEmail: (email: string) => Promise<void>;
  readonly onUpdateLocalVisibility: (
    field: MobileAccountLocalVisibilityField,
    value: MobileAccountLocalVisibility,
  ) => Promise<void>;
  readonly onUpdatePrivacy: (input: MobileAccountSettingsUpdate) => Promise<void>;
  readonly onUpdateProfile: (input: {
    displayName?: string | null;
    username?: string;
  }) => Promise<void>;
  readonly presence: string | null;
  readonly privacyMutationPending: boolean;
  readonly profileMutationPending: boolean;
  readonly settings: MobileAccountSettingsResponse | null;
  readonly user: MobileSessionUser | null;
}

function getPolicyLabel(locale: MobileLocale, value: string): string {
  const copy = mobileCopy[locale];
  switch (value) {
    case "EVERYONE":
      return copy.accountSettingsPolicyEveryone;
    case "FRIENDS":
      return copy.accountSettingsPolicyFriends;
    case "MUTUAL_SERVERS":
      return copy.accountSettingsPolicyMutualServers;
    case "MUTUAL_FRIENDS":
      return copy.accountSettingsPolicyMutualFriends;
    case "NOBODY":
      return copy.accountSettingsPolicyNobody;
    default:
      return value;
  }
}

function AccountHeader({ locale, onBack }: { locale: MobileLocale; onBack(): void }) {
  const copy = mobileCopy[locale];
  const styles = useMobileAccountSettingsStyles();
  const theme = useTheme();

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel={copy.authBackAction}
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        testID="mobile-account-settings-back"
      >
        <View style={styles.backVisual} testID="mobile-account-settings-back-visual">
          <Ionicons color={theme.text.primary} name="chevron-back" size={18} />
        </View>
      </Pressable>
      <View style={styles.headerText}>
        <Text numberOfLines={1} style={styles.title}>
          {copy.settingsAccountTitle}
        </Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {copy.accountSettingsSubtitle}
        </Text>
      </View>
    </View>
  );
}

function AccountAvatar({
  locale,
  presence,
  user,
}: {
  locale: MobileLocale;
  presence: string | null;
  user: MobileSessionUser;
}) {
  const styles = useMobileAccountSettingsStyles();
  const theme = useTheme();
  const label = user.displayName ?? user.username;
  // 4b and 1f both paint the signed-in user's own avatar with the accent tint, so the
  // account card and the profile identity card cannot drift apart per identity hash.
  const tint = { bg: theme.accent.soft, fg: theme.accent.strong };
  const presenceColor =
    presence === "ONLINE"
      ? theme.status.success
      : presence === "IDLE"
        ? theme.status.warning
        : presence === "DND"
          ? theme.status.danger
          : theme.text.soft;

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="image"
      accessible
      style={styles.accountAvatar}
      testID="mobile-account-avatar"
    >
      {user.avatarUrl ? (
        <MobileCachedImage
          accessibilityIgnoresInvertColors
          importantForAccessibility="no"
          source={{ uri: user.avatarUrl }}
          style={styles.accountAvatarImage}
        />
      ) : (
        <View style={[styles.accountAvatarSurface, { backgroundColor: tint.bg }]}>
          <Text
            style={[styles.accountAvatarInitials, { color: tint.fg }]}
            testID="mobile-account-avatar-initials"
          >
            {getMobileAvatarInitials(label, locale)}
          </Text>
        </View>
      )}
      <View
        style={[styles.accountAvatarPresence, { backgroundColor: presenceColor }]}
        testID="mobile-account-avatar-presence"
      />
    </View>
  );
}

function SettingsLoadingRows({
  count,
  section,
}: {
  count: number;
  section: "privacy" | "security";
}) {
  const styles = useMobileAccountSettingsStyles();

  return Array.from({ length: count }, (_, index) => (
    <View
      key={index}
      style={[styles.row, index < count - 1 && styles.rowBorder]}
      testID={`mobile-account-settings-loading-${section}-row-${index}`}
    >
      <Skeleton borderRadius={13} height={38} width={38} />
      <Skeleton height={15} width={section === "privacy" ? "48%" : "58%"} />
    </View>
  ));
}

function SettingsSkeleton({ locale, onBack }: { locale: MobileLocale; onBack(): void }) {
  const styles = useMobileAccountSettingsStyles();

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.root}
      testID="mobile-account-settings-screen"
    >
      <AccountHeader locale={locale} onBack={onBack} />
      <View style={styles.profileCard} testID="mobile-account-settings-loading-profile">
        <View style={styles.summary}>
          <Skeleton borderRadius={20} height={58} width={58} />
          <View style={styles.identity}>
            <Skeleton height={20} width="58%" />
            <Skeleton height={15} width="42%" />
          </View>
        </View>
        {[0, 1, 2].map((item) => (
          <View
            key={item}
            style={styles.loadingProfileField}
            testID={`mobile-account-settings-loading-profile-field-${item}`}
          >
            <Skeleton borderRadius={14} height={58} />
          </View>
        ))}
        <View style={styles.completion}>
          <View style={styles.completionHeader}>
            <Skeleton height={13} width="40%" />
            <Skeleton height={13} width={32} />
          </View>
          <Skeleton borderRadius={4} height={7} />
        </View>
      </View>
      <View
        style={styles.loadingSectionHeading}
        testID="mobile-account-settings-loading-privacy-heading"
      />
      <View style={styles.listCard} testID="mobile-account-settings-loading-privacy">
        <SettingsLoadingRows count={4} section="privacy" />
      </View>
      <View
        style={styles.loadingSectionHeading}
        testID="mobile-account-settings-loading-security-heading"
      />
      <View style={styles.listCard} testID="mobile-account-settings-loading-security">
        <SettingsLoadingRows count={2} section="security" />
      </View>
    </ScrollView>
  );
}

function PrivacyRow({
  icon,
  label,
  onPress,
  testID,
  tone,
  value,
  withBorder,
}: {
  icon: "chatbubble-outline" | "eye-outline" | "person-add-outline" | "radio-button-on";
  label: string;
  onPress(): void;
  testID: string;
  tone: "accent" | "success" | "warning";
  value: string;
  withBorder: boolean;
}) {
  const styles = useMobileAccountSettingsStyles();
  const theme = useTheme();
  const iconColor =
    tone === "success"
      ? theme.status.success
      : tone === "warning"
        ? theme.status.warning
        : theme.accent.strong;

  return (
    <Pressable
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        withBorder && styles.rowBorder,
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      <View
        style={[
          styles.iconBox,
          tone === "accent"
            ? styles.iconAccent
            : tone === "success"
              ? styles.iconSuccess
              : styles.iconWarning,
        ]}
      >
        <Ionicons color={iconColor} name={icon} size={17} />
      </View>
      <Text numberOfLines={1} style={styles.rowLabel}>
        {label}
      </Text>
      <Text numberOfLines={1} style={styles.rowValue}>
        {value}
      </Text>
      <Ionicons color={theme.text.soft} name="chevron-forward" size={16} />
    </Pressable>
  );
}

function SecurityRow({
  icon,
  label,
  locale,
  subtitle,
  testID,
  withBorder,
}: {
  icon: "key-outline" | "shield-checkmark-outline";
  label: string;
  locale: MobileLocale;
  subtitle: string;
  testID: string;
  withBorder: boolean;
}) {
  const copy = mobileCopy[locale];
  const styles = useMobileAccountSettingsStyles();
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel={`${label}. ${subtitle}. ${copy.accountSettingsSoon}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      disabled
      style={[styles.row, withBorder && styles.rowBorder]}
      testID={testID}
    >
      <View
        style={[
          styles.iconBox,
          icon === "shield-checkmark-outline" ? styles.iconSuccess : styles.iconAccent,
        ]}
      >
        <Ionicons
          color={icon === "shield-checkmark-outline" ? theme.status.success : theme.accent.strong}
          name={icon}
          size={17}
        />
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={styles.rowLabel}>
          {label}
        </Text>
        <Text numberOfLines={1} style={styles.rowSubtitle}>
          {subtitle}
        </Text>
      </View>
      <Text style={styles.soon}>{copy.accountSettingsSoon}</Text>
    </Pressable>
  );
}

export function MobileAccountSettingsView({
  error,
  isLoading,
  isVerificationSending,
  locale,
  localVisibility,
  onBack,
  onCopyUsername,
  onRetry,
  onUpdateLocalVisibility,
  onUpdatePrivacy,
  onUpdateProfile,
  onVerifyEmail,
  presence,
  privacyMutationPending,
  profileMutationPending,
  settings,
  user,
}: MobileAccountSettingsViewProps) {
  const copy = mobileCopy[locale];
  const styles = useMobileAccountSettingsStyles();
  const theme = useTheme();
  const [policySheet, setPolicySheet] = useState<PolicySheet>(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
    setUsername(user?.username ?? "");
  }, [user?.displayName, user?.username]);

  const openProfileEditor = () => {
    setDisplayName(user?.displayName ?? "");
    setUsername(user?.username ?? "");
    setProfileEditorOpen(true);
  };

  if (isLoading && !settings) {
    return <SettingsSkeleton locale={locale} onBack={onBack} />;
  }

  if (!settings || !user) {
    return (
      <ScrollView
        contentContainerStyle={styles.content}
        style={styles.root}
        testID="mobile-account-settings-screen"
      >
        <AccountHeader locale={locale} onBack={onBack} />
        <View style={styles.stateCard}>
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>
            {error ?? copy.accountSettingsLoadError}
          </Text>
          {onRetry ? (
            <Button
              label={copy.retryAction}
              onPress={onRetry}
              testID="mobile-account-settings-retry"
            />
          ) : null}
        </View>
      </ScrollView>
    );
  }

  const completion = getMobileAccountProfileCompletion({
    avatarUrl: user.avatarUrl,
    bio: settings.account.bio,
    customStatus: settings.account.customStatus,
    displayName: user.displayName,
    emailVerified: settings.account.emailVerified,
  });
  const profileName = user.displayName ?? user.username;
  const isOnline = presence === "ONLINE";
  const policyOptions =
    policySheet === "dm"
      ? DM_POLICIES
      : policySheet === "friendRequests"
        ? FRIEND_REQUEST_POLICIES
        : LOCAL_VISIBILITY_POLICIES;
  const policyTitle =
    policySheet === "dm"
      ? copy.accountSettingsDmPermission
      : policySheet === "friendRequests"
        ? copy.accountSettingsFriendRequests
        : policySheet === "presence"
          ? copy.accountSettingsPresenceVisibility
          : copy.accountSettingsProfileVisibility;

  const selectPolicy = async (value: string) => {
    if (policySheet === "dm") {
      await onUpdatePrivacy({ dmPermission: value as MobileAccountDmPolicy });
    } else if (policySheet === "friendRequests") {
      await onUpdatePrivacy({ friendRequests: value as MobileAccountFriendRequestPolicy });
    } else if (policySheet === "presence" || policySheet === "profile") {
      await onUpdateLocalVisibility(policySheet, value as MobileAccountLocalVisibility);
    }
    setPolicySheet(null);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.root}
      testID="mobile-account-settings-screen"
    >
      <AccountHeader locale={locale} onBack={onBack} />
      {error ? (
        <View style={styles.stateCard}>
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>
            {error}
          </Text>
          {onRetry ? (
            <Button
              label={copy.retryAction}
              onPress={onRetry}
              testID="mobile-account-settings-retry"
            />
          ) : null}
        </View>
      ) : null}
      <View style={styles.profileCard} testID="mobile-account-profile-card">
        <View style={styles.summary}>
          <AccountAvatar locale={locale} presence={presence} user={user} />
          <View style={styles.identity}>
            <View style={styles.identityTop}>
              <Text numberOfLines={1} style={styles.name}>
                {profileName}
              </Text>
              {isOnline ? (
                <Text style={styles.onlinePill}>{copy.accountSettingsPresenceOnline}</Text>
              ) : null}
            </View>
            <Text numberOfLines={1} style={styles.handle}>
              @{user.username}
            </Text>
          </View>
        </View>
        <View style={styles.fields}>
          <Pressable
            accessibilityLabel={copy.accountSettingsDisplayName}
            accessibilityRole="button"
            onPress={openProfileEditor}
            style={({ pressed }) => [styles.field, pressed && styles.pressed]}
            testID="mobile-account-display-name-field"
          >
            <Text style={styles.fieldLabel}>{copy.accountSettingsDisplayName}</Text>
            <Text numberOfLines={1} style={styles.fieldValue}>
              {profileName}
            </Text>
          </Pressable>
          <View style={[styles.field, styles.fieldRow]}>
            <Pressable
              accessibilityLabel={copy.accountSettingsUsername}
              accessibilityRole="button"
              onPress={openProfileEditor}
              style={styles.fieldValuePressable}
              testID="mobile-account-username-field"
            >
              <Text style={styles.fieldLabel}>{copy.accountSettingsUsername}</Text>
              <Text numberOfLines={1} style={styles.fieldValue}>
                @{user.username}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={`${copy.accountSettingsUsername}: @${user.username}`}
              accessibilityRole="button"
              onPress={() => void onCopyUsername(user.username).catch(() => undefined)}
              style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}
              testID="mobile-account-username-copy"
            >
              <Ionicons color={theme.text.soft} name="copy-outline" size={16} />
            </Pressable>
          </View>
          <View style={[styles.field, styles.fieldRow]}>
            <View style={styles.fieldText}>
              <Text style={styles.fieldLabel}>{copy.accountSettingsEmail}</Text>
              <Text numberOfLines={1} style={styles.fieldValue}>
                {settings.account.email}
              </Text>
            </View>
            {settings.account.emailVerified ? (
              <View style={styles.verifiedBadge} testID="mobile-account-email-verified-badge">
                <Ionicons color={theme.status.successText} name="checkmark" size={12} />
                <Text style={styles.verifiedText}>{copy.accountSettingsEmailVerified}</Text>
              </View>
            ) : (
              <Pressable
                accessibilityLabel={copy.accountSettingsEmailVerifyAction}
                accessibilityRole="button"
                accessibilityState={{ busy: isVerificationSending, disabled: isVerificationSending }}
                disabled={isVerificationSending}
                onPress={() => void onVerifyEmail(settings.account.email)}
                style={({ pressed }) => [styles.verifyActionTarget, pressed && styles.pressed]}
                testID="mobile-account-email-verify"
              >
                <View style={styles.verifyAction}>
                  <Ionicons
                    color={theme.status.warning}
                    name={isVerificationSending ? "hourglass-outline" : "mail-outline"}
                    size={12}
                  />
                  <Text style={styles.verifyActionText}>
                    {copy.accountSettingsEmailVerifyAction}
                  </Text>
                </View>
              </Pressable>
            )}
          </View>
        </View>
        <View style={styles.completion}>
          <View style={styles.completionHeader}>
            <Text style={styles.completionLabel}>{copy.accountSettingsCompletion}</Text>
            <Text style={styles.completionValue}>%{completion}</Text>
          </View>
          <View style={styles.completionTrack}>
            <LinearGradient
              colors={theme.gradients.primaryAction}
              end={{ x: 1, y: 0 }}
              start={{ x: 0, y: 0 }}
              style={[styles.completionFill, { width: `${completion}%` }]}
            />
          </View>
        </View>
      </View>

      <Text style={styles.sectionHeading}>{copy.accountSettingsPrivacyHeading}</Text>
      <View style={styles.listCard}>
        <PrivacyRow
          icon="eye-outline"
          label={copy.accountSettingsProfileVisibility}
          onPress={() => setPolicySheet("profile")}
          testID="mobile-account-profile-visibility-row"
          tone="accent"
          value={getPolicyLabel(locale, localVisibility.profile)}
          withBorder
        />
        <PrivacyRow
          icon="radio-button-on"
          label={copy.accountSettingsPresenceVisibility}
          onPress={() => setPolicySheet("presence")}
          testID="mobile-account-presence-visibility-row"
          tone="success"
          value={getPolicyLabel(locale, localVisibility.presence)}
          withBorder
        />
        <PrivacyRow
          icon="chatbubble-outline"
          label={copy.accountSettingsDmPermission}
          onPress={() => setPolicySheet("dm")}
          testID="mobile-account-dm-row"
          tone="accent"
          value={getPolicyLabel(locale, settings.privacy.dmPermission)}
          withBorder
        />
        <PrivacyRow
          icon="person-add-outline"
          label={copy.accountSettingsFriendRequests}
          onPress={() => setPolicySheet("friendRequests")}
          testID="mobile-account-friend-requests-row"
          tone="warning"
          value={getPolicyLabel(locale, settings.privacy.friendRequests)}
          withBorder={false}
        />
      </View>

      <Text style={styles.sectionHeading}>{copy.accountSettingsSecurityHeading}</Text>
      <View style={styles.listCard}>
        <SecurityRow
          icon="shield-checkmark-outline"
          label={copy.accountSettingsTwoFactor}
          locale={locale}
          subtitle={copy.accountSettingsTwoFactorSubtitle}
          testID="mobile-account-security-2fa"
          withBorder
        />
        <SecurityRow
          icon="key-outline"
          label={copy.accountSettingsBackupCodes}
          locale={locale}
          subtitle={copy.accountSettingsBackupCodesSubtitle}
          testID="mobile-account-security-backup-codes"
          withBorder={false}
        />
      </View>

      <BottomSheet
        accessibilityLabel={policyTitle}
        onClose={() => setPolicySheet(null)}
        open={policySheet !== null}
        testID="mobile-account-policy-sheet"
      >
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{policyTitle}</Text>
          {policyOptions.map((option) => (
            <Button
              busy={privacyMutationPending}
              key={option}
              label={getPolicyLabel(locale, option)}
              onPress={() => void selectPolicy(option).catch(() => undefined)}
              testID={`mobile-account-policy-${policySheet}-${option}`}
              variant="secondary"
            />
          ))}
        </View>
      </BottomSheet>
      <BottomSheet
        accessibilityLabel={copy.accountSettingsEditorTitle}
        onClose={() => setProfileEditorOpen(false)}
        open={profileEditorOpen}
        testID="mobile-account-profile-editor-sheet"
      >
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{copy.accountSettingsEditorTitle}</Text>
          <TextInput
            accessibilityLabel={copy.accountSettingsDisplayName}
            onChangeText={setDisplayName}
            style={styles.input}
            testID="mobile-account-profile-display-name-input"
            value={displayName}
          />
          <TextInput
            accessibilityLabel={copy.accountSettingsUsername}
            autoCapitalize="none"
            onChangeText={setUsername}
            style={styles.input}
            testID="mobile-account-profile-username-input"
            value={username}
          />
          <Button
            busy={profileMutationPending}
            disabled={username.trim().length < 2 || !displayName.trim()}
            label={copy.accountSettingsSave}
            onPress={() =>
              void onUpdateProfile({ displayName: displayName.trim(), username: username.trim() })
                .then(() => setProfileEditorOpen(false))
                .catch(() => undefined)
            }
            testID="mobile-account-profile-save"
          />
        </View>
      </BottomSheet>
    </ScrollView>
  );
}

export function MobileAccountSettingsScreen({
  onBack,
  presence,
}: {
  onBack(): void;
  presence: string | null;
}) {
  const { apiClient, replaceSessionUser, session, status } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const { showToast } = useToast();
  const copy = mobileCopy[locale];
  const query = useMobileAccountSettingsQuery(apiClient, status === "signed-in");
  const privacyMutation = useMobileAccountSettingsMutation(apiClient);
  const profileMutations = useMobileSocialMutations(apiClient);
  const [localVisibility, setLocalVisibility] = useState(DEFAULT_LOCAL_VISIBILITY);
  const [isVerificationSending, setVerificationSending] = useState(false);
  const [canonicalUser, setCanonicalUser] = useState<MobileSessionUser | null>(
    session?.user ?? null,
  );

  useEffect(() => {
    setCanonicalUser(session?.user ?? null);
  }, [session?.user]);

  useEffect(() => {
    let mounted = true;
    readMobileAccountVisibilityPreferences(AsyncStorage)
      .then((value) => mounted && setLocalVisibility(value))
      .catch(() => showToast({ message: copy.accountSettingsLoadError, tone: "danger" }));
    return () => {
      mounted = false;
    };
  }, [copy.accountSettingsLoadError, showToast]);

  const updateLocalVisibility = async (
    field: MobileAccountLocalVisibilityField,
    value: MobileAccountLocalVisibility,
  ) => {
    const previous = localVisibility;
    try {
      await persistMobileAccountVisibilityPreference({
        current: previous,
        field,
        onChange: setLocalVisibility,
        storage: AsyncStorage,
        value,
      });
    } catch (error) {
      showToast({ message: copy.accountSettingsUpdateError, tone: "danger" });
      throw error;
    }
  };

  const updatePrivacy = async (input: MobileAccountSettingsUpdate) => {
    try {
      await privacyMutation.mutateAsync(input);
    } catch (error) {
      showToast({ message: copy.accountSettingsUpdateError, tone: "danger" });
      throw error;
    }
  };

  const updateProfile = async (input: { displayName?: string | null; username?: string }) => {
    let response;
    try {
      response = await profileMutations.updateProfile.mutateAsync(input);
    } catch (error) {
      showToast({ message: copy.accountSettingsUpdateError, tone: "danger" });
      throw error;
    }

    setCanonicalUser(response.user);
    let sessionReplaced = false;
    try {
      sessionReplaced = await replaceSessionUser(response.user);
    } catch {
      sessionReplaced = false;
    }
    if (!sessionReplaced) {
      showToast({
        message: copy.accountSettingsSessionRefreshWarning,
        tone: "warning",
      });
    }
  };

  const copyUsername = async (username: string) => {
    try {
      await Clipboard.setStringAsync(`@${username}`);
      showToast({ message: copy.accountSettingsCopySuccess, tone: "success" });
    } catch (error) {
      showToast({ message: copy.accountSettingsCopyError, tone: "danger" });
      throw error;
    }
  };

  const verifyEmail = async (email: string) => {
    if (!apiClient || isVerificationSending) {
      return;
    }

    setVerificationSending(true);
    try {
      await requestMobileVerificationEmail(apiClient, { email, locale });
      showToast({ message: copy.accountSettingsEmailVerifySent, tone: "success" });
    } catch {
      showToast({ message: copy.accountSettingsEmailVerifyFailed, tone: "danger" });
    } finally {
      setVerificationSending(false);
    }
  };

  return (
    <MobileAccountSettingsView
      error={
        status === "signed-out"
          ? copy.settingsAccountSignedOut
          : query.isError
            ? copy.accountSettingsLoadError
            : null
      }
      isLoading={query.isLoading}
      isVerificationSending={isVerificationSending}
      locale={locale}
      localVisibility={localVisibility}
      onBack={onBack}
      onCopyUsername={copyUsername}
      onRetry={status === "signed-in" ? () => void query.refetch() : undefined}
      onUpdateLocalVisibility={updateLocalVisibility}
      onUpdatePrivacy={updatePrivacy}
      onUpdateProfile={updateProfile}
      onVerifyEmail={verifyEmail}
      presence={presence}
      privacyMutationPending={privacyMutation.isPending}
      profileMutationPending={profileMutations.updateProfile.isPending}
      settings={query.data ?? null}
      user={canonicalUser}
    />
  );
}
