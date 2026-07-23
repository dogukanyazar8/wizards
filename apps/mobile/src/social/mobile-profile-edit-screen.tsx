import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { getMobileAccountProfileCompletion } from "../account/mobile-account-settings-client";
import { useMobileAccountSettingsQuery } from "../account/mobile-account-settings-query";
import {
  BottomSheet,
  Button,
  OptionSheet,
  SheetHeader,
  Skeleton,
  useSheetPresentation,
  type SheetIconName,
  type SheetTone,
} from "../app/components/kit";
import { MobileCachedImage } from "../app/components/mobile-cached-image";
import { useToast } from "../app/components/kit/toast";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { useMobileAuth } from "../auth/mobile-auth-context";
import type { MobileSessionUser } from "../auth/session-types";
import { getMobileAvatarInitials } from "../design/mobile-avatar-color";
import { mobileCopy, type MobileLocale } from "../locale/mobile-copy";
import { useMobileImageUpload } from "../media/use-mobile-image-upload";
import { useMobileBootstrapQuery } from "../query/mobile-bootstrap-query";
import { patchMobileProfileAvatarCaches } from "../query/mobile-profile-cache";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import type { MobileFriendPresenceStatus } from "./mobile-social-client";
import { useMobileSocialMutations } from "./mobile-social-query";
import { useMobileProfileEditStyles } from "./mobile-profile-edit-screen.styles";

const PRESENCE_OPTIONS: readonly MobileFriendPresenceStatus[] = [
  "ONLINE",
  "IDLE",
  "DND",
  "OFFLINE",
];
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{2,32}$/;
const DISPLAY_NAME_MAX = 60;
const CUSTOM_STATUS_MAX = 128;
const BIO_MAX = 500;

type ProfileEditorField = "bio" | "customStatus" | "displayName" | "username";

function getPresenceLabel(locale: MobileLocale, presence: string | null): string {
  const copy = mobileCopy[locale];
  switch (presence) {
    case "ONLINE":
      return copy.profileEditPresenceOnline;
    case "IDLE":
      return copy.profileEditPresenceIdle;
    case "DND":
      return copy.profileEditPresenceDnd;
    default:
      return copy.profileEditPresenceOffline;
  }
}

function getPresenceIcon(presence: MobileFriendPresenceStatus): SheetIconName {
  switch (presence) {
    case "ONLINE":
      return "ellipse";
    case "IDLE":
      return "moon-outline";
    case "DND":
      return "remove-circle-outline";
    default:
      return "ellipse-outline";
  }
}

function getPresenceTone(presence: MobileFriendPresenceStatus): SheetTone {
  switch (presence) {
    case "ONLINE":
      return "success";
    case "IDLE":
      return "warning";
    case "DND":
      return "danger";
    default:
      return "neutral";
  }
}

function getFieldLimit(field: ProfileEditorField): number {
  switch (field) {
    case "bio":
      return BIO_MAX;
    case "customStatus":
      return CUSTOM_STATUS_MAX;
    case "username":
      return 32;
    case "displayName":
    default:
      return DISPLAY_NAME_MAX;
  }
}

export function MobileProfileEditScreen({
  onBack,
  onOpenBlockedUsers,
}: {
  onBack(): void;
  onOpenBlockedUsers?(): void;
}) {
  const { apiClient, replaceSessionUser, session, status } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useMobileProfileEditStyles();
  const theme = useTheme();
  const sheetPresentation = useSheetPresentation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const isSignedIn = status === "signed-in";
  const accountQuery = useMobileAccountSettingsQuery(apiClient, isSignedIn);
  const bootstrapQuery = useMobileBootstrapQuery(apiClient, isSignedIn);
  const mutations = useMobileSocialMutations(apiClient);
  const { isBusy: isAvatarUploading, selectAndUpload } = useMobileImageUpload();

  const [user, setUser] = useState<MobileSessionUser | null>(session?.user ?? null);
  const [editorField, setEditorField] = useState<ProfileEditorField | null>(null);
  const [draft, setDraft] = useState("");
  const [isPresenceSheetOpen, setPresenceSheetOpen] = useState(false);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setUser(session?.user ?? null);
  }, [session?.user]);

  useEffect(() => {
    setError(null);
    setNotice(null);
  }, [locale]);

  const account = accountQuery.data?.account ?? null;
  const presence = bootstrapQuery.data?.user.status ?? null;
  const avatarUrl = avatarPreviewUri ?? user?.avatarUrl ?? null;
  const profileName = user?.displayName ?? user?.username ?? "";
  const completion = getMobileAccountProfileCompletion({
    avatarUrl: user?.avatarUrl,
    bio: account?.bio,
    customStatus: account?.customStatus,
    displayName: user?.displayName,
    emailVerified: account?.emailVerified,
  });
  const presenceColor =
    presence === "ONLINE"
      ? theme.status.success
      : presence === "IDLE"
        ? theme.status.warning
        : presence === "DND"
          ? theme.status.danger
          : theme.text.soft;

  if (!isSignedIn) {
    return (
      <ScrollView
        contentContainerStyle={styles.content}
        style={styles.root}
        testID="mobile-profile-edit-screen"
      >
        <ProfileEditHeader locale={locale} onBack={onBack} />
        <View style={styles.stateCard}>
          <Text style={styles.errorText}>{copy.profileEditSignedOut}</Text>
        </View>
      </ScrollView>
    );
  }

  if (accountQuery.isLoading && !account) {
    return (
      <ScrollView
        contentContainerStyle={styles.content}
        style={styles.root}
        testID="mobile-profile-edit-screen"
      >
        <ProfileEditHeader locale={locale} onBack={onBack} />
        <View style={styles.profileCard} testID="mobile-profile-edit-skeleton">
          <View style={styles.summary}>
            <Skeleton borderRadius={22} height={66} width={66} />
            <View style={styles.identity}>
              <Skeleton height={20} width="58%" />
              <Skeleton height={15} width="42%" />
            </View>
          </View>
          <Skeleton borderRadius={4} height={7} />
        </View>
      </ScrollView>
    );
  }

  const openEditor = (field: ProfileEditorField) => {
    setError(null);
    setNotice(null);
    setDraft(
      field === "displayName"
        ? (user?.displayName ?? "")
        : field === "username"
          ? (user?.username ?? "")
          : field === "customStatus"
            ? (account?.customStatus ?? "")
            : (account?.bio ?? ""),
    );
    setEditorField(field);
  };

  const saveField = async (field: ProfileEditorField, value: string) => {
    const trimmed = value.trim();

    if (field === "username" && !USERNAME_PATTERN.test(trimmed)) {
      setError(copy.profileEditUsernameInvalid);
      return;
    }

    const input =
      field === "username"
        ? { username: trimmed }
        : field === "displayName"
          ? { displayName: trimmed || null }
          : field === "customStatus"
            ? { customStatus: trimmed || null }
            : { bio: trimmed || null };

    let response;
    try {
      response = await mutations.updateProfile.mutateAsync(input);
    } catch {
      setError(copy.profileEditUpdateError);
      return;
    }

    setUser(response.user);
    setEditorField(null);
    setNotice(copy.profileEditSaved);
    setError(null);

    if (field === "displayName" || field === "username") {
      let sessionReplaced = false;
      try {
        sessionReplaced = await replaceSessionUser(response.user);
      } catch {
        sessionReplaced = false;
      }
      if (!sessionReplaced) {
        showToast({ message: copy.accountSettingsSessionRefreshWarning, tone: "warning" });
      }
    }
  };

  const selectPresence = async (next: MobileFriendPresenceStatus) => {
    setError(null);
    setNotice(null);
    try {
      await mutations.updatePresence.mutateAsync(next);
      setNotice(copy.profileEditSaved);
    } catch {
      setError(copy.profileEditUpdateError);
    } finally {
      setPresenceSheetOpen(false);
    }
  };

  const uploadAvatar = async () => {
    if (!user || isAvatarUploading) {
      return;
    }

    setError(null);
    setNotice(null);
    const result = await selectAndUpload({ purpose: "profile-avatar" }, setAvatarPreviewUri);

    if (result.status === "cancelled") {
      setAvatarPreviewUri(null);
      return;
    }

    if (result.status === "error") {
      setAvatarPreviewUri(null);
      setError(result.message);
      return;
    }

    if (result.response.purpose !== "profile-avatar" || result.response.profile.id !== user.id) {
      setAvatarPreviewUri(null);
      setError(copy.profileEditAvatarNotPersisted);
      return;
    }

    const profile = result.response.profile;
    patchMobileProfileAvatarCaches({
      avatarUrl: profile.avatarUrl,
      queryClient,
      userId: profile.id,
    });
    setUser((current) => (current ? { ...current, avatarUrl: profile.avatarUrl } : current));
    setAvatarPreviewUri(null);
    setNotice(copy.profileEditSaved);

    let sessionReplaced = false;
    try {
      sessionReplaced = await replaceSessionUser({
        avatarUrl: profile.avatarUrl,
        displayName: profile.displayName,
        id: profile.id,
        username: profile.username,
      });
    } catch {
      sessionReplaced = false;
    }
    if (!sessionReplaced) {
      showToast({ message: copy.accountSettingsSessionRefreshWarning, tone: "warning" });
    }

    void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() });
    void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.profile() });
  };

  const copyUsername = async () => {
    if (!user) {
      return;
    }
    try {
      await Clipboard.setStringAsync(`@${user.username}`);
      showToast({ message: copy.accountSettingsCopySuccess, tone: "success" });
    } catch {
      showToast({ message: copy.accountSettingsCopyError, tone: "danger" });
    }
  };

  const editorLimit = editorField ? getFieldLimit(editorField) : 0;
  const isEditorValid =
    editorField === "username" ? USERNAME_PATTERN.test(draft.trim()) : draft.length <= editorLimit;
  const editorTitle =
    editorField === "displayName"
      ? copy.profileEditDisplayName
      : editorField === "username"
        ? copy.profileEditUsername
        : editorField === "customStatus"
          ? copy.profileEditCustomStatus
          : copy.profileEditBio;
  const editorHint =
    editorField === "displayName"
      ? copy.profileEditDisplayNameHint
      : editorField === "username"
        ? copy.profileEditUsernameHint
        : editorField === "customStatus"
          ? copy.profileEditCustomStatusHint
          : copy.profileEditBioHint;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.root}
      testID="mobile-profile-edit-screen"
    >
      <ProfileEditHeader locale={locale} onBack={onBack} />

      {error || accountQuery.isError ? (
        <View style={styles.feedbackWrap}>
          <Text
            accessibilityRole="alert"
            style={styles.errorText}
            testID="mobile-profile-edit-error"
          >
            {error ?? copy.profileEditLoadError}
          </Text>
        </View>
      ) : null}
      {notice ? (
        <View style={styles.feedbackWrap}>
          <Text
            accessibilityLiveRegion="polite"
            style={styles.noticeText}
            testID="mobile-profile-edit-notice"
          >
            {notice}
          </Text>
        </View>
      ) : null}

      <View style={styles.profileCard} testID="mobile-profile-edit-card">
        <View style={styles.summary}>
          <View style={styles.avatarWrap}>
            {avatarUrl ? (
              <MobileCachedImage
                accessibilityIgnoresInvertColors
                importantForAccessibility="no"
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <View style={[styles.avatarSurface, { backgroundColor: theme.accent.soft }]}>
                <Text
                  style={[styles.avatarInitials, { color: theme.accent.strong }]}
                  testID="mobile-profile-edit-avatar-initials"
                >
                  {getMobileAvatarInitials(profileName, locale)}
                </Text>
              </View>
            )}
            <View style={[styles.avatarPresence, { backgroundColor: presenceColor }]} />
            <Pressable
              accessibilityLabel={copy.profileEditAvatarAction}
              accessibilityRole="button"
              accessibilityState={{ busy: isAvatarUploading }}
              hitSlop={10}
              onPress={() => void uploadAvatar()}
              style={({ pressed }) => [styles.cameraBadge, pressed && styles.pressed]}
              testID="mobile-profile-edit-avatar-picker"
            >
              <Ionicons color={theme.text.onPrimary} name="camera" size={13} />
            </Pressable>
          </View>
          <View style={styles.identity}>
            <View style={styles.identityTop}>
              <Text numberOfLines={1} style={styles.name}>
                {profileName}
              </Text>
              <Text
                style={[
                  styles.presencePill,
                  { backgroundColor: theme.surface.soft, color: presenceColor },
                ]}
                testID="mobile-profile-edit-presence-pill"
              >
                {getPresenceLabel(locale, presence)}
              </Text>
            </View>
            <Text numberOfLines={1} style={styles.handle}>
              @{user?.username ?? ""}
            </Text>
            <Text numberOfLines={1} style={styles.statusLine}>
              {isAvatarUploading
                ? copy.profileEditAvatarUploading
                : (account?.customStatus ?? copy.profileEditCustomStatusEmpty)}
            </Text>
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

      <Text style={styles.sectionHeading}>{copy.profileEditIdentityHeading}</Text>
      <View style={styles.listCard}>
        <ProfileValueRow
          icon="person-outline"
          label={copy.profileEditDisplayName}
          onPress={() => openEditor("displayName")}
          placeholder={copy.profileEditDisplayNameEmpty}
          testID="mobile-profile-edit-display-name-row"
          tone="accent"
          value={user?.displayName ?? null}
          withBorder
        />
        <View style={[styles.row, styles.rowBorder]}>
          <View style={[styles.iconBox, styles.iconAccent]}>
            <Ionicons color={theme.accent.strong} name="at-outline" size={17} />
          </View>
          <Pressable
            accessibilityLabel={copy.profileEditUsername}
            accessibilityRole="button"
            onPress={() => openEditor("username")}
            style={styles.rowText}
            testID="mobile-profile-edit-username-row"
          >
            <Text numberOfLines={1} style={styles.rowLabel}>
              {copy.profileEditUsername}
            </Text>
            <Text numberOfLines={1} style={styles.rowSubtitle}>
              @{user?.username ?? ""}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`${copy.profileEditUsername}: @${user?.username ?? ""}`}
            accessibilityRole="button"
            onPress={() => void copyUsername()}
            style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}
            testID="mobile-profile-edit-username-copy"
          >
            <Ionicons color={theme.text.soft} name="copy-outline" size={16} />
          </Pressable>
        </View>
        <ProfileValueRow
          icon="mail-outline"
          label={copy.accountSettingsEmail}
          placeholder={copy.accountSettingsEmail}
          subtitle={
            account?.emailVerified
              ? copy.accountSettingsEmailVerified
              : copy.accountSettingsEmailUnverified
          }
          testID="mobile-profile-edit-email-row"
          tone={account?.emailVerified ? "success" : "warning"}
          value={account?.email ?? null}
          withBorder={false}
        />
      </View>

      <Text style={styles.sectionHeading}>{copy.profileEditPresenceHeading}</Text>
      <View style={styles.listCard}>
        <ProfileValueRow
          icon="radio-button-on"
          label={copy.profileEditPresence}
          onPress={() => setPresenceSheetOpen(true)}
          placeholder={copy.profileEditPresenceOffline}
          testID="mobile-profile-edit-presence-row"
          tone="success"
          value={getPresenceLabel(locale, presence)}
          withBorder
        />
        <ProfileValueRow
          icon="chatbubble-ellipses-outline"
          label={copy.profileEditCustomStatus}
          onPress={() => openEditor("customStatus")}
          placeholder={copy.profileEditCustomStatusEmpty}
          testID="mobile-profile-edit-custom-status-row"
          tone="accent"
          value={account?.customStatus ?? null}
          withBorder={false}
        />
      </View>

      <Text style={styles.sectionHeading}>{copy.profileEditAboutHeading}</Text>
      <View style={styles.listCard}>
        <ProfileValueRow
          icon="document-text-outline"
          label={copy.profileEditBio}
          onPress={() => openEditor("bio")}
          placeholder={copy.profileEditBioEmpty}
          subtitle={account?.bio ?? copy.profileEditBioHint}
          testID="mobile-profile-edit-bio-row"
          tone="accent"
          value={null}
          withBorder={onOpenBlockedUsers !== undefined}
        />
        {onOpenBlockedUsers ? (
          <ProfileValueRow
            icon="ban-outline"
            label={copy.profileEditBlockedUsers}
            onPress={onOpenBlockedUsers}
            placeholder={copy.profileEditBlockedUsersHint}
            subtitle={copy.profileEditBlockedUsersHint}
            testID="mobile-profile-edit-blocked-row"
            tone="warning"
            value={null}
            withBorder={false}
          />
        ) : null}
      </View>

      <BottomSheet
        accessibilityLabel={editorTitle}
        onClose={() => setEditorField(null)}
        open={editorField !== null}
        presentation={sheetPresentation}
        sizing="content"
        testID="mobile-profile-edit-sheet"
      >
        <View style={styles.sheet}>
          <SheetHeader
            closeAccessibilityLabel={copy.sheetCloseAction}
            icon="create-outline"
            onClose={() => setEditorField(null)}
            subtitle={editorHint}
            testID="mobile-profile-edit-sheet-header"
            title={editorTitle}
          />
          <TextInput
            accessibilityLabel={editorTitle}
            autoCapitalize={editorField === "username" ? "none" : "sentences"}
            maxLength={editorLimit}
            multiline={editorField === "bio"}
            onChangeText={setDraft}
            style={[styles.input, editorField === "bio" && styles.inputMultiline]}
            testID="mobile-profile-edit-input"
            value={draft}
          />
          <Text style={styles.counter}>{`${draft.length}/${editorLimit}`}</Text>
          <View style={styles.sheetActions}>
            <View style={styles.sheetAction}>
              <Button
                disabled={mutations.updateProfile.isPending || draft.trim().length === 0}
                label={copy.profileEditClear}
                onPress={() => setDraft("")}
                testID="mobile-profile-edit-clear"
                variant="secondary"
              />
            </View>
            <View style={styles.sheetAction}>
              <Button
                busy={mutations.updateProfile.isPending}
                disabled={!isEditorValid}
                label={copy.profileEditSave}
                onPress={() => {
                  if (editorField) {
                    void saveField(editorField, draft);
                  }
                }}
                testID="mobile-profile-edit-save"
              />
            </View>
          </View>
        </View>
      </BottomSheet>

      <OptionSheet<MobileFriendPresenceStatus>
        closeAccessibilityLabel={copy.sheetCloseAction}
        icon="ellipse"
        onClose={() => setPresenceSheetOpen(false)}
        onSelect={(option) => void selectPresence(option)}
        open={isPresenceSheetOpen}
        optionTestID={(option) => option.toLowerCase()}
        options={PRESENCE_OPTIONS.map((option) => ({
          icon: getPresenceIcon(option),
          label: getPresenceLabel(locale, option),
          tone: getPresenceTone(option),
          value: option,
        }))}
        selectedValue={
          PRESENCE_OPTIONS.find((option) => option === presence) ?? null
        }
        testID="mobile-profile-edit-presence"
        title={copy.profileEditPresence}
      />
    </ScrollView>
  );
}

function ProfileEditHeader({ locale, onBack }: { locale: MobileLocale; onBack(): void }) {
  const copy = mobileCopy[locale];
  const styles = useMobileProfileEditStyles();
  const theme = useTheme();

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel={copy.authBackAction}
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        testID="mobile-profile-edit-back"
      >
        <View style={styles.backVisual}>
          <Ionicons color={theme.text.primary} name="chevron-back" size={18} />
        </View>
      </Pressable>
      <View style={styles.headerText}>
        <Text numberOfLines={1} style={styles.title}>
          {copy.profileEditTitle}
        </Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {copy.profileEditSubtitle}
        </Text>
      </View>
    </View>
  );
}

function ProfileValueRow({
  icon,
  label,
  onPress,
  placeholder,
  subtitle,
  testID,
  tone,
  value,
  withBorder,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  placeholder: string;
  subtitle?: string;
  testID: string;
  tone: "accent" | "success" | "warning";
  value: string | null;
  withBorder: boolean;
}) {
  const styles = useMobileProfileEditStyles();
  const theme = useTheme();
  const iconColor =
    tone === "success"
      ? theme.status.success
      : tone === "warning"
        ? theme.status.warning
        : theme.accent.strong;
  const displayValue = value ?? (subtitle ? null : placeholder);

  const body = (
    <>
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
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={styles.rowLabel}>
          {label}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.rowSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {displayValue ? (
        <Text
          numberOfLines={1}
          style={[styles.rowValue, value === null && styles.rowValueEmpty]}
        >
          {displayValue}
        </Text>
      ) : null}
      {onPress ? <Ionicons color={theme.text.soft} name="chevron-forward" size={16} /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.row, withBorder && styles.rowBorder]} testID={testID}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={`${label}: ${value ?? placeholder}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, withBorder && styles.rowBorder, pressed && styles.pressed]}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}
