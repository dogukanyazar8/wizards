import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type {
  AccountPreferences,
  AccountPreferencesPatch,
  MobileAccountDmPolicy,
  MobileAccountFriendRequestPolicy,
  MobileAccountSettingsResponse,
  MobileAccountSettingsUpdate,
} from "@wizards/types";
import {
  ACCOUNT_FORMAT_PREVIEW_INSTANT,
  ACCOUNT_PREFERENCES_DEFAULT,
  formatAccountDate,
  formatAccountTime,
  getAccountTimeZoneOptions,
  getInterfaceDensityMetrics,
} from "@wizards/types";

import { getMobileAccountProfileCompletion } from "../../account/mobile-account-settings-client";
import { useMobileInterfaceDensity } from "../../account/use-mobile-interface-density";
import {
  useMobileAccountPreferencesMutation,
  useMobileAccountPreferencesQuery,
} from "../../account/mobile-account-preferences-query";
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
import {
  BottomSheet,
  Button,
  OptionSheet,
  OverlaySurface,
  SheetHeader,
  Skeleton,
  useSheetPresentation,
  type SheetIconName,
  type SheetOption,
  type SheetTone,
} from "../components/kit";
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
/**
 * 2b §7's own side of the picker. Two values rather than the four-rung ladder:
 * a group add is always made by a friend, so "ortak sunucular" has nothing to
 * mean here. `EVERYONE`/`NOBODY` reuse the existing labels and map onto the
 * boolean the settings endpoint stores.
 */
const GROUP_INVITE_POLICIES: readonly string[] = ["EVERYONE", "NOBODY"];
const VISIBILITY_POLICIES: readonly string[] = ["EVERYONE", "FRIENDS", "NOBODY"];

type PolicySheet = "profile" | "presence" | "dm" | "friendRequests" | "groupInvites" | null;
type PreferenceSheet = "date" | "time" | "density" | null;

export interface MobileAccountSettingsViewProps {
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly isVerificationSending: boolean;
  readonly locale: MobileLocale;
  readonly onBack: () => void;
  readonly onCopyUsername: (username: string) => Promise<void>;
  readonly onRetry: (() => void) | undefined;
  readonly onUpdatePreference: (input: AccountPreferencesPatch) => Promise<void>;
  readonly onVerifyEmail: (email: string) => Promise<void>;
  readonly onUpdatePrivacy: (input: MobileAccountSettingsUpdate) => Promise<void>;
  readonly onUpdateProfile: (input: {
    displayName?: string | null;
    username?: string;
  }) => Promise<void>;
  readonly presence: string | null;
  readonly preferences: AccountPreferences | null;
  readonly preferencesMutationPending: boolean;
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

/** A policy name alone ("Ortak sunucular") does not say who that is; the hint does. */
function getPolicyHint(locale: MobileLocale, value: string): string | undefined {
  const copy = mobileCopy[locale];
  switch (value) {
    case "EVERYONE":
      return copy.accountSettingsPolicyEveryoneHint;
    case "FRIENDS":
      return copy.accountSettingsPolicyFriendsHint;
    case "MUTUAL_SERVERS":
      return copy.accountSettingsPolicyMutualServersHint;
    case "MUTUAL_FRIENDS":
      return copy.accountSettingsPolicyMutualFriendsHint;
    case "NOBODY":
      return copy.accountSettingsPolicyNobodyHint;
    default:
      return undefined;
  }
}

/** Reach widens from a locked padlock to an open globe, so the list reads at a glance. */
function getPolicyVisual(value: string): { icon: SheetIconName; tone: SheetTone } {
  switch (value) {
    case "EVERYONE":
      return { icon: "globe-outline", tone: "accent" };
    case "FRIENDS":
      return { icon: "people-outline", tone: "success" };
    case "MUTUAL_SERVERS":
      return { icon: "server-outline", tone: "accent" };
    case "MUTUAL_FRIENDS":
      return { icon: "people-circle-outline", tone: "warning" };
    case "NOBODY":
    default:
      return { icon: "lock-closed-outline", tone: "neutral" };
  }
}

function buildPolicyOptions(
  locale: MobileLocale,
  values: readonly string[],
): readonly SheetOption<string>[] {
  return values.map((value) => {
    const hint = getPolicyHint(locale, value);
    const visual = getPolicyVisual(value);
    return {
      ...(hint ? { description: hint } : {}),
      icon: visual.icon,
      label: getPolicyLabel(locale, value),
      tone: visual.tone,
      value,
    };
  });
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
        <SettingsLoadingRows count={5} section="privacy" />
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
  icon: SheetIconName;
  label: string;
  onPress(): void;
  testID: string;
  tone: "accent" | "success" | "warning";
  value: string;
  withBorder: boolean;
}) {
  const styles = useMobileAccountSettingsStyles();
  const theme = useTheme();
  const density = useMobileInterfaceDensity();
  const densityMetrics = getInterfaceDensityMetrics(density);
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
        {
          minHeight: density === "COMPACT" ? densityMetrics.controlMinHeight : 56,
          paddingVertical: densityMetrics.verticalPadding,
        },
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
  onBack,
  onCopyUsername,
  onRetry,
  onUpdatePreference,
  onUpdatePrivacy,
  onUpdateProfile,
  onVerifyEmail,
  presence,
  preferences,
  preferencesMutationPending,
  privacyMutationPending,
  profileMutationPending,
  settings,
  user,
}: MobileAccountSettingsViewProps) {
  const copy = mobileCopy[locale];
  const styles = useMobileAccountSettingsStyles();
  const theme = useTheme();
  const [policySheet, setPolicySheet] = useState<PolicySheet>(null);
  const [preferenceSheet, setPreferenceSheet] = useState<PreferenceSheet>(null);
  const [timeZonePickerOpen, setTimeZonePickerOpen] = useState(false);
  const [timeZoneSearch, setTimeZoneSearch] = useState("");
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
    setUsername(user?.username ?? "");
  }, [user?.displayName, user?.username]);

  const resolvedPreferences = preferences ?? ACCOUNT_PREFERENCES_DEFAULT;
  const intlLocale = locale === "tr" ? "tr-TR" : "en-US";
  const timeZoneOptions = useMemo(
    () => getAccountTimeZoneOptions({ selectedTimeZone: resolvedPreferences.timeZone }),
    [resolvedPreferences.timeZone],
  );
  const visibleTimeZones = useMemo(() => {
    const normalized = timeZoneSearch.trim().toLocaleLowerCase(intlLocale);
    return normalized
      ? timeZoneOptions.filter((option) =>
          option.toLocaleLowerCase(intlLocale).includes(normalized),
        )
      : timeZoneOptions;
  }, [intlLocale, timeZoneOptions, timeZoneSearch]);
  const dateOptions = useMemo<readonly SheetOption<AccountPreferences["dateFormat"]>[]>(
    () =>
      (["LOCALE", "DMY", "MDY", "YMD"] as const).map((value) => ({
        description: formatAccountDate(ACCOUNT_FORMAT_PREVIEW_INSTANT, {
          dateFormat: value,
          locale: intlLocale,
          timeZone: resolvedPreferences.timeZone,
        }),
        label:
          value === "LOCALE"
            ? copy.accountSettingsFormatLocale
            : value === "DMY"
              ? copy.accountSettingsDateDmy
              : value === "MDY"
                ? copy.accountSettingsDateMdy
                : copy.accountSettingsDateYmd,
        value,
      })),
    [copy, intlLocale, resolvedPreferences.timeZone],
  );
  const timeOptions = useMemo<readonly SheetOption<AccountPreferences["timeFormat"]>[]>(
    () =>
      (["LOCALE", "H12", "H24"] as const).map((value) => ({
        description: formatAccountTime(ACCOUNT_FORMAT_PREVIEW_INSTANT, {
          locale: intlLocale,
          timeFormat: value,
          timeZone: resolvedPreferences.timeZone,
        }),
        label:
          value === "LOCALE"
            ? copy.accountSettingsFormatLocale
            : value === "H12"
              ? copy.accountSettingsTimeH12
              : copy.accountSettingsTimeH24,
        value,
      })),
    [copy, intlLocale, resolvedPreferences.timeZone],
  );
  const densityOptions = useMemo<readonly SheetOption<AccountPreferences["interfaceDensity"]>[]>(
    () => [
      {
        description: copy.accountSettingsDensityComfortableHint,
        icon: "resize-outline",
        label: copy.accountSettingsDensityComfortable,
        value: "COMFORTABLE",
      },
      {
        description: copy.accountSettingsDensityCompactHint,
        icon: "reorder-three-outline",
        label: copy.accountSettingsDensityCompact,
        value: "COMPACT",
      },
    ],
    [copy],
  );
  const densityMetrics = getInterfaceDensityMetrics(resolvedPreferences.interfaceDensity);

  const openProfileEditor = () => {
    setDisplayName(user?.displayName ?? "");
    setUsername(user?.username ?? "");
    setProfileEditorOpen(true);
  };

  if (isLoading && (!settings || !preferences)) {
    return <SettingsSkeleton locale={locale} onBack={onBack} />;
  }

  if (!settings || !preferences || !user) {
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
  const policyValues =
    policySheet === "profile" || policySheet === "presence"
      ? VISIBILITY_POLICIES
      : policySheet === "dm"
        ? DM_POLICIES
        : policySheet === "friendRequests"
          ? FRIEND_REQUEST_POLICIES
          : policySheet === "groupInvites"
            ? GROUP_INVITE_POLICIES
            : DM_POLICIES;
  const policyOptions = buildPolicyOptions(locale, policyValues);
  const policyPresentation: {
    icon: SheetIconName;
    selected: string;
    subtitle: string;
    title: string;
    tone: SheetTone;
  } =
    policySheet === "profile"
      ? {
          icon: "eye-outline",
          selected: preferences.profileVisibility,
          subtitle: copy.accountSettingsProfileVisibilityHint,
          title: copy.accountSettingsProfileVisibility,
          tone: "accent",
        }
      : policySheet === "presence"
        ? {
            icon: "radio-button-on",
            selected: preferences.presenceVisibility,
            subtitle: copy.accountSettingsPresenceVisibilityHint,
            title: copy.accountSettingsPresenceVisibility,
            tone: "success",
          }
        : policySheet === "dm"
          ? {
              icon: "chatbubble-outline",
              selected: settings.privacy.dmPermission,
              subtitle: copy.accountSettingsDmPermissionHint,
              title: copy.accountSettingsDmPermission,
              tone: "accent",
            }
          : policySheet === "friendRequests"
            ? {
                icon: "person-add-outline",
                selected: settings.privacy.friendRequests,
                subtitle: copy.accountSettingsFriendRequestsHint,
                title: copy.accountSettingsFriendRequests,
                tone: "warning",
              }
            : policySheet === "groupInvites"
              ? {
                  icon: "people-outline",
                  selected: settings.privacy.groupInvites ? "EVERYONE" : "NOBODY",
                  subtitle: copy.accountSettingsGroupInvitesHint,
                  title: copy.accountSettingsGroupInvites,
                  tone: "accent",
                }
              : {
                  icon: "chatbubble-outline",
                  selected: settings.privacy.dmPermission,
                  subtitle: copy.accountSettingsDmPermissionHint,
                  title: copy.accountSettingsDmPermission,
                  tone: "accent",
                };

  const selectPolicy = async (value: string) => {
    if (policySheet === "profile") {
      await onUpdatePreference({
        profileVisibility: value as AccountPreferences["profileVisibility"],
      });
    } else if (policySheet === "presence") {
      await onUpdatePreference({
        presenceVisibility: value as AccountPreferences["presenceVisibility"],
      });
    } else if (policySheet === "dm") {
      await onUpdatePrivacy({ dmPermission: value as MobileAccountDmPolicy });
    } else if (policySheet === "friendRequests") {
      await onUpdatePrivacy({ friendRequests: value as MobileAccountFriendRequestPolicy });
    } else if (policySheet === "groupInvites") {
      await onUpdatePrivacy({ groupInvites: value === "EVERYONE" });
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
                accessibilityState={{
                  busy: isVerificationSending,
                  disabled: isVerificationSending,
                }}
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
          value={getPolicyLabel(locale, preferences.profileVisibility)}
          withBorder
        />
        <PrivacyRow
          icon="radio-button-on"
          label={copy.accountSettingsPresenceVisibility}
          onPress={() => setPolicySheet("presence")}
          testID="mobile-account-presence-visibility-row"
          tone="success"
          value={getPolicyLabel(locale, preferences.presenceVisibility)}
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
          withBorder
        />
        <PrivacyRow
          icon="people-outline"
          label={copy.accountSettingsGroupInvites}
          onPress={() => setPolicySheet("groupInvites")}
          testID="mobile-account-group-invites-row"
          tone="accent"
          value={getPolicyLabel(locale, settings.privacy.groupInvites ? "EVERYONE" : "NOBODY")}
          withBorder={false}
        />
      </View>

      <Text style={styles.sectionHeading}>{copy.accountSettingsRegionalHeading}</Text>
      <View style={styles.listCard}>
        <PrivacyRow
          icon="globe-outline"
          label={copy.accountSettingsTimeZone}
          onPress={() => setTimeZonePickerOpen(true)}
          testID="mobile-account-time-zone-row"
          tone="accent"
          value={
            preferences.timeZone === "AUTO"
              ? copy.accountSettingsTimeZoneAuto
              : preferences.timeZone
          }
          withBorder
        />
        <PrivacyRow
          icon="calendar-outline"
          label={copy.accountSettingsDateFormat}
          onPress={() => setPreferenceSheet("date")}
          testID="mobile-account-date-format-row"
          tone="accent"
          value={formatAccountDate(ACCOUNT_FORMAT_PREVIEW_INSTANT, {
            dateFormat: preferences.dateFormat,
            locale: intlLocale,
            timeZone: preferences.timeZone,
          })}
          withBorder
        />
        <PrivacyRow
          icon="time-outline"
          label={copy.accountSettingsTimeFormat}
          onPress={() => setPreferenceSheet("time")}
          testID="mobile-account-time-format-row"
          tone="success"
          value={formatAccountTime(ACCOUNT_FORMAT_PREVIEW_INSTANT, {
            locale: intlLocale,
            timeFormat: preferences.timeFormat,
            timeZone: preferences.timeZone,
          })}
          withBorder={false}
        />
      </View>

      <Text style={styles.sectionHeading}>{copy.accountSettingsAppearanceHeading}</Text>
      <View style={styles.listCard}>
        <PrivacyRow
          icon="reorder-three-outline"
          label={copy.accountSettingsDensity}
          onPress={() => setPreferenceSheet("density")}
          testID="mobile-account-density-row"
          tone="accent"
          value={
            preferences.interfaceDensity === "COMPACT"
              ? copy.accountSettingsDensityCompact
              : copy.accountSettingsDensityComfortable
          }
          withBorder={false}
        />
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.densityPreview,
            {
              gap: densityMetrics.rowGap,
              minHeight: densityMetrics.controlMinHeight,
              paddingVertical: densityMetrics.verticalPadding,
            },
          ]}
          testID="mobile-account-density-preview"
        >
          <View style={styles.densityPreviewLineLong} />
          <View style={styles.densityPreviewLineShort} />
        </View>
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

      <OptionSheet
        closeAccessibilityLabel={copy.sheetCloseAction}
        disabled={
          policySheet === "profile" || policySheet === "presence"
            ? preferencesMutationPending
            : privacyMutationPending
        }
        icon={policyPresentation.icon}
        onClose={() => setPolicySheet(null)}
        onSelect={(option) => void selectPolicy(option).catch(() => undefined)}
        open={policySheet !== null}
        optionTestID={(option) => `${policySheet}-${option}`}
        options={policyOptions}
        selectedValue={policyPresentation.selected}
        subtitle={policyPresentation.subtitle}
        testID="mobile-account-policy"
        title={policyPresentation.title}
        tone={policyPresentation.tone}
      />
      <OptionSheet
        closeAccessibilityLabel={copy.sheetCloseAction}
        disabled={preferencesMutationPending}
        icon="calendar-outline"
        onClose={() => setPreferenceSheet(null)}
        onSelect={(value) => {
          void onUpdatePreference({ dateFormat: value })
            .then(() => setPreferenceSheet(null))
            .catch(() => undefined);
        }}
        open={preferenceSheet === "date"}
        options={dateOptions}
        selectedValue={preferences.dateFormat}
        subtitle={copy.accountSettingsDateFormatHint}
        testID="mobile-account-date-format"
        title={copy.accountSettingsDateFormat}
      />
      <OptionSheet
        closeAccessibilityLabel={copy.sheetCloseAction}
        disabled={preferencesMutationPending}
        icon="time-outline"
        onClose={() => setPreferenceSheet(null)}
        onSelect={(value) => {
          void onUpdatePreference({ timeFormat: value })
            .then(() => setPreferenceSheet(null))
            .catch(() => undefined);
        }}
        open={preferenceSheet === "time"}
        options={timeOptions}
        selectedValue={preferences.timeFormat}
        subtitle={copy.accountSettingsTimeFormatHint}
        testID="mobile-account-time-format"
        title={copy.accountSettingsTimeFormat}
      />
      <OptionSheet
        closeAccessibilityLabel={copy.sheetCloseAction}
        disabled={preferencesMutationPending}
        icon="reorder-three-outline"
        onClose={() => setPreferenceSheet(null)}
        onSelect={(value) => {
          void onUpdatePreference({ interfaceDensity: value })
            .then(() => setPreferenceSheet(null))
            .catch(() => undefined);
        }}
        open={preferenceSheet === "density"}
        options={densityOptions}
        selectedValue={preferences.interfaceDensity}
        subtitle={copy.accountSettingsDensityHint}
        testID="mobile-account-density"
        title={copy.accountSettingsDensity}
      />
      {timeZonePickerOpen ? (
        <OverlaySurface
          accessibilityLabel={copy.sheetCloseAction}
          animatedBackdropStyle={{ opacity: 1 }}
          backdropStyle={{ backgroundColor: theme.surface.base }}
          onClose={() => {
            setTimeZonePickerOpen(false);
            setTimeZoneSearch("");
          }}
          open
          style={styles.timeZonePicker}
          testID="mobile-account-time-zone-picker"
        >
          <View style={styles.timeZonePicker}>
            <View style={styles.timeZonePickerHeader}>
              <Pressable
                accessibilityLabel={copy.sheetCloseAction}
                accessibilityRole="button"
                onPress={() => {
                  setTimeZonePickerOpen(false);
                  setTimeZoneSearch("");
                }}
                style={styles.timeZoneClose}
                testID="mobile-account-time-zone-close"
              >
                <Ionicons color={theme.text.primary} name="close" size={22} />
              </Pressable>
              <Text style={styles.timeZoneTitle}>{copy.accountSettingsTimeZone}</Text>
            </View>
            <TextInput
              accessibilityLabel={copy.accountSettingsTimeZoneSearch}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setTimeZoneSearch}
              placeholder={copy.accountSettingsTimeZoneSearch}
              placeholderTextColor={theme.text.muted}
              style={styles.timeZoneSearch}
              testID="mobile-account-time-zone-search"
              value={timeZoneSearch}
            />
            <FlatList
              data={visibleTimeZones}
              initialNumToRender={24}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(item) => item}
              ListEmptyComponent={
                <Text style={styles.timeZoneEmpty}>{copy.accountSettingsTimeZoneNoResults}</Text>
              }
              maxToRenderPerBatch={32}
              removeClippedSubviews
              renderItem={({ item }) => {
                const selected = item === preferences.timeZone;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled: preferencesMutationPending }}
                    disabled={preferencesMutationPending}
                    onPress={() => {
                      void onUpdatePreference({ timeZone: item })
                        .then(() => {
                          setTimeZonePickerOpen(false);
                          setTimeZoneSearch("");
                        })
                        .catch(() => undefined);
                    }}
                    style={({ pressed }) => [
                      styles.timeZoneRow,
                      selected && styles.timeZoneRowSelected,
                      pressed && styles.pressed,
                    ]}
                    testID={`mobile-account-time-zone-${item}`}
                  >
                    <Text numberOfLines={2} style={styles.timeZoneRowLabel}>
                      {item === "AUTO" ? copy.accountSettingsTimeZoneAuto : item}
                    </Text>
                    {selected ? (
                      <Ionicons color={theme.accent.strong} name="checkmark" size={20} />
                    ) : null}
                  </Pressable>
                );
              }}
              style={styles.timeZoneList}
              windowSize={7}
            />
          </View>
        </OverlaySurface>
      ) : null}
      <ProfileEditorSheet
        busy={profileMutationPending}
        displayName={displayName}
        locale={locale}
        onChangeDisplayName={setDisplayName}
        onChangeUsername={setUsername}
        onClose={() => setProfileEditorOpen(false)}
        onSave={() =>
          void onUpdateProfile({ displayName: displayName.trim(), username: username.trim() })
            .then(() => setProfileEditorOpen(false))
            .catch(() => undefined)
        }
        open={profileEditorOpen}
        username={username}
      />
    </ScrollView>
  );
}

function ProfileEditorSheet({
  busy,
  displayName,
  locale,
  onChangeDisplayName,
  onChangeUsername,
  onClose,
  onSave,
  open,
  username,
}: {
  busy: boolean;
  displayName: string;
  locale: MobileLocale;
  onChangeDisplayName(value: string): void;
  onChangeUsername(value: string): void;
  onClose(): void;
  onSave(): void;
  open: boolean;
  username: string;
}) {
  const copy = mobileCopy[locale];
  const styles = useMobileAccountSettingsStyles();
  const presentation = useSheetPresentation();

  return (
    <BottomSheet
      accessibilityLabel={copy.accountSettingsEditorTitle}
      onClose={onClose}
      open={open}
      presentation={presentation}
      sizing="content"
      testID="mobile-account-profile-editor-sheet"
    >
      <View style={styles.sheet}>
        <SheetHeader
          closeAccessibilityLabel={copy.sheetCloseAction}
          icon="create-outline"
          onClose={onClose}
          subtitle={copy.accountSettingsEditorSubtitle}
          testID="mobile-account-profile-editor-header"
          title={copy.accountSettingsEditorTitle}
        />
        <View style={styles.sheetFields}>
          <View style={styles.sheetField}>
            <Text style={styles.sheetFieldLabel}>{copy.accountSettingsDisplayName}</Text>
            <TextInput
              accessibilityLabel={copy.accountSettingsDisplayName}
              onChangeText={onChangeDisplayName}
              style={styles.input}
              testID="mobile-account-profile-display-name-input"
              value={displayName}
            />
          </View>
          <View style={styles.sheetField}>
            <Text style={styles.sheetFieldLabel}>{copy.accountSettingsUsername}</Text>
            <TextInput
              accessibilityLabel={copy.accountSettingsUsername}
              autoCapitalize="none"
              onChangeText={onChangeUsername}
              style={styles.input}
              testID="mobile-account-profile-username-input"
              value={username}
            />
          </View>
        </View>
        <Button
          busy={busy}
          disabled={username.trim().length < 2 || !displayName.trim()}
          icon="checkmark"
          label={copy.accountSettingsSave}
          onPress={onSave}
          testID="mobile-account-profile-save"
        />
      </View>
    </BottomSheet>
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
  const preferencesQuery = useMobileAccountPreferencesQuery(apiClient, status === "signed-in");
  const preferencesMutation = useMobileAccountPreferencesMutation(apiClient);
  const privacyMutation = useMobileAccountSettingsMutation(apiClient);
  const profileMutations = useMobileSocialMutations(apiClient);
  const [isVerificationSending, setVerificationSending] = useState(false);
  const [canonicalUser, setCanonicalUser] = useState<MobileSessionUser | null>(
    session?.user ?? null,
  );

  useEffect(() => {
    setCanonicalUser(session?.user ?? null);
  }, [session?.user]);

  const updatePrivacy = async (input: MobileAccountSettingsUpdate) => {
    try {
      await privacyMutation.mutateAsync(input);
    } catch (error) {
      showToast({ title: copy.accountSettingsUpdateError, variant: "error" });
      throw error;
    }
  };

  const updatePreference = async (input: AccountPreferencesPatch) => {
    try {
      await preferencesMutation.mutateAsync(input);
    } catch (error) {
      showToast({ title: copy.accountSettingsUpdateError, variant: "error" });
      throw error;
    }
  };

  const updateProfile = async (input: { displayName?: string | null; username?: string }) => {
    let response;
    try {
      response = await profileMutations.updateProfile.mutateAsync(input);
    } catch (error) {
      showToast({ title: copy.accountSettingsUpdateError, variant: "error" });
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
        title: copy.accountSettingsSessionRefreshWarning,
        variant: "warning",
      });
    }
  };

  const copyUsername = async (username: string) => {
    try {
      await Clipboard.setStringAsync(`@${username}`);
      showToast({ title: copy.accountSettingsCopySuccess, variant: "success" });
    } catch (error) {
      showToast({ title: copy.accountSettingsCopyError, variant: "error" });
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
      showToast({ title: copy.accountSettingsEmailVerifySent, variant: "success" });
    } catch {
      showToast({ title: copy.accountSettingsEmailVerifyFailed, variant: "error" });
    } finally {
      setVerificationSending(false);
    }
  };

  return (
    <MobileAccountSettingsView
      error={
        status === "signed-out"
          ? copy.settingsAccountSignedOut
          : query.isError || preferencesQuery.isError
            ? copy.accountSettingsLoadError
            : null
      }
      isLoading={query.isLoading || preferencesQuery.isLoading}
      isVerificationSending={isVerificationSending}
      locale={locale}
      onBack={onBack}
      onCopyUsername={copyUsername}
      onRetry={
        status === "signed-in"
          ? () => void Promise.all([query.refetch(), preferencesQuery.refetch()])
          : undefined
      }
      onUpdatePreference={updatePreference}
      onUpdatePrivacy={updatePrivacy}
      onUpdateProfile={updateProfile}
      onVerifyEmail={verifyEmail}
      presence={presence}
      preferences={preferencesQuery.data ?? null}
      preferencesMutationPending={preferencesMutation.isPending}
      privacyMutationPending={privacyMutation.isPending}
      profileMutationPending={profileMutations.updateProfile.isPending}
      settings={query.data ?? null}
      user={canonicalUser}
    />
  );
}
