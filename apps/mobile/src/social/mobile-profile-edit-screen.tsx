import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  MOBILE_PROFILE_BANNER_COLORS,
  MOBILE_PROFILE_BIO_MAX_LENGTH,
  MOBILE_PROFILE_CUSTOM_STATUS_MAX_LENGTH,
  MOBILE_PROFILE_DISPLAY_NAME_MAX_LENGTH,
  MOBILE_USERNAME_COOLDOWN_ERROR_CODE,
  type MobileAccountSettingsResponse,
} from "@wizards/types";

import { useMobileAccountSettingsQuery } from "../account/mobile-account-settings-query";
import { OptionSheet, Skeleton, type SheetIconName, type SheetTone } from "../app/components/kit";
import { MessageEmojiPicker } from "../app/components/message-emoji-picker";
import { MobileCachedImage } from "../app/components/mobile-cached-image";
import { useToast } from "../app/components/kit/toast";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { useMobileAuth } from "../auth/mobile-auth-context";
import type { MobileSessionUser } from "../auth/session-types";
import { getMobileAvatarInitials } from "../design/mobile-avatar-color";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { mobileCopy, type MobileLocale } from "../locale/mobile-copy";
import { useMobileImageUpload } from "../media/use-mobile-image-upload";
import { useMobileBootstrapQuery } from "../query/mobile-bootstrap-query";
import { patchMobileProfileAvatarCaches } from "../query/mobile-profile-cache";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import type { MobileFriendPresenceStatus } from "./mobile-social-client";
import { useMobileSocialMutations } from "./mobile-social-query";
import {
  buildMobileProfileEditPatch,
  createMobileProfileEditDraft,
  type MobileProfileEditBaseline,
  type MobileProfileEditDraft,
} from "./mobile-profile-edit-state";
import {
  describeMobileStatusExpiry,
  MOBILE_STATUS_EXPIRY_CHOICES,
  type MobileStatusExpiryChoice,
} from "./mobile-profile-status-expiry";
import { useMobileProfileEditStyles } from "./mobile-profile-edit-screen.styles";

const PRESENCE_OPTIONS: readonly MobileFriendPresenceStatus[] = [
  "ONLINE",
  "IDLE",
  "DND",
  "OFFLINE",
];
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{2,32}$/;
/** README: the banner keeps the brand indigo in both themes. */
const DEFAULT_BANNER_COLOR = MOBILE_PROFILE_BANNER_COLORS[0];

type MobileAccountProfile = MobileAccountSettingsResponse["account"];

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

function getExpiryChoiceLabel(locale: MobileLocale, choice: MobileStatusExpiryChoice): string {
  const copy = mobileCopy[locale];
  switch (choice) {
    case "30m":
      return copy.profileEditStatusExpiry30Minutes;
    case "1h":
      return copy.profileEditStatusExpiry1Hour;
    case "4h":
      return copy.profileEditStatusExpiry4Hours;
    case "today":
      return copy.profileEditStatusExpiryToday;
    default:
      return copy.profileEditStatusExpiryNeverOption;
  }
}

/** "{süre} sonra otomatik temizlenir" for a live deadline, or the permanent copy. */
function getExpiryNotice(input: {
  choice: MobileStatusExpiryChoice;
  expiresAt: string | null;
  locale: MobileLocale;
  now: Date;
}): string {
  const copy = mobileCopy[input.locale];
  const description =
    input.choice === "never"
      ? ({ kind: "none" } as const)
      : describeMobileStatusExpiry(input.expiresAt, input.now);

  if (description.kind === "none" || description.kind === "expired") {
    const preview = getExpiryChoiceLabel(input.locale, input.choice);
    return input.choice === "never"
      ? copy.profileEditStatusExpiryNever
      : copy.profileEditStatusExpiryNotice.replace("{duration}", preview);
  }

  const template =
    description.kind === "minutes"
      ? copy.profileEditStatusExpiryMinutes
      : description.kind === "hours"
        ? copy.profileEditStatusExpiryHours
        : copy.profileEditStatusExpiryDays;

  return copy.profileEditStatusExpiryNotice.replace(
    "{duration}",
    template.replace("{count}", String(description.count)),
  );
}

function toBaseline(
  account: MobileAccountProfile | null,
  user: MobileSessionUser | null,
): MobileProfileEditBaseline {
  return {
    bannerColor: account?.bannerColor ?? null,
    bannerUrl: account?.bannerUrl ?? null,
    bio: account?.bio ?? null,
    customStatus: account?.customStatus ?? null,
    customStatusEmoji: account?.customStatusEmoji ?? null,
    customStatusExpiresAt: account?.customStatusExpiresAt ?? null,
    displayName: user?.displayName ?? null,
    username: user?.username ?? "",
  };
}

export function MobileProfileEditScreen({ onBack }: { onBack(): void }) {
  const { apiClient, replaceSessionUser, session, status } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useMobileProfileEditStyles();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const isSignedIn = status === "signed-in";
  const accountQuery = useMobileAccountSettingsQuery(apiClient, isSignedIn);
  const bootstrapQuery = useMobileBootstrapQuery(apiClient, isSignedIn);
  const mutations = useMobileSocialMutations(apiClient);
  const { isBusy: isUploadBusy, selectAndUpload } = useMobileImageUpload();

  const [user, setUser] = useState<MobileSessionUser | null>(session?.user ?? null);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [bannerPreviewUri, setBannerPreviewUri] = useState<string | null>(null);
  const [uploadingTarget, setUploadingTarget] = useState<"avatar" | "banner" | null>(null);
  const [isPresenceSheetOpen, setPresenceSheetOpen] = useState(false);
  const [isEmojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const account = accountQuery.data?.account ?? null;
  const presence = bootstrapQuery.data?.user.status ?? null;
  const serverBaseline = useMemo(() => toBaseline(account, user), [account, user]);
  const [baseline, setBaseline] = useState<MobileProfileEditBaseline>(serverBaseline);
  const [draft, setDraft] = useState<MobileProfileEditDraft>(() =>
    createMobileProfileEditDraft(serverBaseline),
  );
  const baselineSignature = JSON.stringify(serverBaseline);
  const appliedSignatureRef = useRef(baselineSignature);

  useEffect(() => {
    setUser(session?.user ?? null);
  }, [session?.user]);

  // A background refetch that returns what the editor already committed must not wipe
  // the in-progress draft, so only a genuinely new server value reseeds it.
  useEffect(() => {
    if (appliedSignatureRef.current === baselineSignature) {
      return;
    }

    appliedSignatureRef.current = baselineSignature;
    setBaseline(serverBaseline);
    setDraft(createMobileProfileEditDraft(serverBaseline));
  }, [baselineSignature, serverBaseline]);

  useEffect(() => {
    setError(null);
    setUsernameError(null);
  }, [locale]);

  const cooldownUntil = useMemo(() => {
    const raw = account?.nextUsernameChangeAt ?? null;
    if (!raw) {
      return null;
    }
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) && parsed.getTime() > Date.now() ? parsed : null;
  }, [account?.nextUsernameChangeAt]);

  const patch = buildMobileProfileEditPatch({ baseline, draft });
  const isDirty = Object.keys(patch).length > 0;
  const isUsernameValid = USERNAME_PATTERN.test(draft.username.trim());
  const isBioOverLimit = draft.bio.length > MOBILE_PROFILE_BIO_MAX_LENGTH;
  const canSave =
    isDirty && isUsernameValid && !isBioOverLimit && !mutations.updateProfile.isPending;
  const avatarUrl = avatarPreviewUri ?? user?.avatarUrl ?? null;
  const bannerUrl = bannerPreviewUri ?? draft.bannerUrl;
  const bannerColor = draft.bannerColor ?? DEFAULT_BANNER_COLOR;
  const isBannerImageActive = bannerUrl !== null;
  const profileName = user?.displayName ?? user?.username ?? "";

  const applyServerProfile = (next: MobileProfileEditBaseline) => {
    setBaseline(next);
    setDraft(createMobileProfileEditDraft(next));
    appliedSignatureRef.current = JSON.stringify(next);
  };

  const patchAccountCache = (next: Partial<MobileAccountProfile>) => {
    queryClient.setQueryData<MobileAccountSettingsResponse>(
      mobileQueryKeys.accountSettings(),
      (current) => (current ? { ...current, account: { ...current.account, ...next } } : current),
    );
  };

  if (!isSignedIn) {
    return (
      <ScrollView
        contentContainerStyle={styles.content}
        style={styles.root}
        testID="mobile-profile-edit-screen"
      >
        <ProfileEditHeader canSave={false} locale={locale} onBack={onBack} onSave={() => {}} />
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
        <ProfileEditHeader canSave={false} locale={locale} onBack={onBack} onSave={() => {}} />
        <View style={styles.card} testID="mobile-profile-edit-skeleton">
          <Skeleton borderRadius={0} height={88} />
          <View style={styles.skeletonRow}>
            <Skeleton borderRadius={26} height={76} width={76} />
            <Skeleton height={14} width="42%" />
          </View>
        </View>
      </ScrollView>
    );
  }

  const uploadImage = async (target: "avatar" | "banner") => {
    if (!user || isUploadBusy) {
      return;
    }

    setError(null);
    setUploadingTarget(target);
    const setPreview = target === "avatar" ? setAvatarPreviewUri : setBannerPreviewUri;
    const result = await selectAndUpload(
      { purpose: target === "avatar" ? "profile-avatar" : "profile-banner" },
      setPreview,
    );
    setUploadingTarget(null);
    setPreview(null);

    if (result.status === "cancelled") {
      return;
    }

    if (result.status === "error") {
      setError(result.message);
      return;
    }

    if (target === "banner") {
      if (result.response.purpose !== "profile-banner" || result.response.banner.id !== user.id) {
        setError(copy.profileEditAvatarNotPersisted);
        return;
      }

      const nextBannerUrl = result.response.banner.bannerUrl;
      patchAccountCache({ bannerUrl: nextBannerUrl });
      applyServerProfile({ ...baseline, bannerUrl: nextBannerUrl });
      showToast({ message: copy.profileEditSaved, tone: "success" });
      return;
    }

    if (result.response.purpose !== "profile-avatar" || result.response.profile.id !== user.id) {
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
    showToast({ message: copy.profileEditSaved, tone: "success" });

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

  const save = async () => {
    if (!canSave) {
      return;
    }

    setError(null);
    setUsernameError(null);

    let response;
    try {
      response = await mutations.updateProfile.mutateAsync(patch);
    } catch (caught) {
      const serverCode = (caught as { serverCode?: string | null } | null)?.serverCode ?? null;
      if (serverCode === MOBILE_USERNAME_COOLDOWN_ERROR_CODE) {
        setUsernameError(copy.profileEditUsernameCooldownError);
      } else if (serverCode === "USERNAME_TAKEN") {
        setUsernameError(copy.profileEditUsernameTaken);
      } else {
        setError(copy.profileEditUpdateError);
      }
      return;
    }

    const saved = response.user;
    patchAccountCache({
      bannerColor: saved.bannerColor,
      bannerUrl: saved.bannerUrl,
      bio: saved.bio,
      customStatus: saved.customStatus,
      customStatusEmoji: saved.customStatusEmoji,
      customStatusExpiresAt: saved.customStatusExpiresAt,
      nextUsernameChangeAt: saved.nextUsernameChangeAt,
    });
    setUser(saved);
    applyServerProfile({
      bannerColor: saved.bannerColor,
      bannerUrl: saved.bannerUrl,
      bio: saved.bio,
      customStatus: saved.customStatus,
      customStatusEmoji: saved.customStatusEmoji,
      customStatusExpiresAt: saved.customStatusExpiresAt,
      displayName: saved.displayName,
      username: saved.username,
    });
    showToast({ message: copy.profileEditSaved, tone: "success" });

    if (patch.displayName !== undefined || patch.username !== undefined) {
      let sessionReplaced = false;
      try {
        sessionReplaced = await replaceSessionUser(saved);
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
    try {
      await mutations.updatePresence.mutateAsync(next);
    } catch {
      setError(copy.profileEditUpdateError);
    } finally {
      setPresenceSheetOpen(false);
    }
  };

  const presenceColor =
    presence === "ONLINE"
      ? theme.status.success
      : presence === "IDLE"
        ? theme.status.warning
        : presence === "DND"
          ? theme.status.danger
          : theme.text.soft;
  const statusText = draft.customStatus.trim();
  const expiryNotice = getExpiryNotice({
    choice: draft.statusExpiry,
    expiresAt: baseline.customStatusExpiresAt,
    locale,
    now: new Date(),
  });

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.root}
      testID="mobile-profile-edit-screen"
    >
      <ProfileEditHeader
        busy={mutations.updateProfile.isPending}
        canSave={canSave}
        locale={locale}
        onBack={onBack}
        onSave={() => void save()}
      />

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

      <View style={styles.card} testID="mobile-profile-edit-preview">
        <View style={[styles.banner, { backgroundColor: bannerColor }]}>
          {bannerUrl ? (
            <MobileCachedImage
              accessibilityIgnoresInvertColors
              importantForAccessibility="no"
              source={{ uri: bannerUrl }}
              style={styles.bannerImage}
              testID="mobile-profile-edit-banner-image"
            />
          ) : null}
          {isBannerImageActive ? (
            <Pressable
              accessibilityLabel={copy.profileEditBannerRemove}
              accessibilityRole="button"
              onPress={() => setDraft((current) => ({ ...current, bannerUrl: null }))}
              style={({ pressed }) => [styles.bannerRemove, pressed && styles.pressed]}
              testID="mobile-profile-edit-banner-remove"
            >
              <MobileLineIcon color={theme.text.onInverse} name="close" size={13} />
              <Text style={styles.bannerRemoveLabel}>{copy.profileEditBannerRemoveShort}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel={copy.profileEditBannerAction}
            accessibilityRole="button"
            accessibilityState={{ busy: uploadingTarget === "banner" }}
            hitSlop={8}
            onPress={() => void uploadImage("banner")}
            style={({ pressed }) => [styles.bannerAction, pressed && styles.pressed]}
            testID="mobile-profile-edit-banner-picker"
          >
            <MobileLineIcon color={theme.text.onInverse} name="camera" size={16} />
          </Pressable>
        </View>

        <View style={styles.previewBody}>
          <View style={styles.avatarWrap}>
            {avatarUrl ? (
              <MobileCachedImage
                accessibilityIgnoresInvertColors
                importantForAccessibility="no"
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <View style={styles.avatarSurface}>
                <Text style={styles.avatarInitials} testID="mobile-profile-edit-avatar-initials">
                  {getMobileAvatarInitials(profileName, locale)}
                </Text>
              </View>
            )}
            <Pressable
              accessibilityLabel={copy.profileEditAvatarAction}
              accessibilityRole="button"
              accessibilityState={{ busy: uploadingTarget === "avatar" }}
              hitSlop={10}
              onPress={() => void uploadImage("avatar")}
              style={({ pressed }) => [styles.avatarCamera, pressed && styles.pressed]}
              testID="mobile-profile-edit-avatar-picker"
            >
              <MobileLineIcon color={theme.text.onPrimary} name="camera" size={13} />
            </Pressable>
          </View>

          <View style={styles.swatchBlock}>
            <Text style={styles.fieldLabel}>{copy.profileEditBannerColorHeading}</Text>
            <View style={styles.swatchRow} testID="mobile-profile-edit-banner-colors">
              {MOBILE_PROFILE_BANNER_COLORS.map((color) => {
                const isSelected = !isBannerImageActive && bannerColor === color;
                return (
                  <Pressable
                    accessibilityLabel={copy.profileEditBannerColorOption.replace("{color}", color)}
                    accessibilityRole="radio"
                    accessibilityState={{ disabled: isBannerImageActive, selected: isSelected }}
                    disabled={isBannerImageActive}
                    key={color}
                    onPress={() => setDraft((current) => ({ ...current, bannerColor: color }))}
                    style={styles.swatchTarget}
                    testID={`mobile-profile-edit-banner-color-${color.slice(1).toLowerCase()}`}
                  >
                    <View style={[styles.swatchRing, isSelected && styles.swatchRingSelected]}>
                      <View
                        style={[
                          styles.swatch,
                          { backgroundColor: color },
                          isBannerImageActive && styles.swatchDisabled,
                        ]}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {isBannerImageActive ? (
              <Text style={styles.fieldHint} testID="mobile-profile-edit-banner-locked">
                {copy.profileEditBannerColorLocked}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.formCard} testID="mobile-profile-edit-form">
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{copy.profileEditDisplayNameLabel}</Text>
          <TextInput
            accessibilityLabel={copy.profileEditDisplayName}
            maxLength={MOBILE_PROFILE_DISPLAY_NAME_MAX_LENGTH}
            onChangeText={(value) => setDraft((current) => ({ ...current, displayName: value }))}
            placeholder={copy.profileEditDisplayNamePlaceholder}
            placeholderTextColor={theme.text.placeholder}
            style={styles.input}
            testID="mobile-profile-edit-display-name-input"
            value={draft.displayName}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{copy.profileEditUsernameLabel}</Text>
          <View style={[styles.inputRow, usernameError !== null && styles.inputRowInvalid]}>
            <TextInput
              accessibilityLabel={copy.profileEditUsername}
              autoCapitalize="none"
              autoCorrect={false}
              editable={cooldownUntil === null}
              maxLength={32}
              onChangeText={(value) => {
                setUsernameError(null);
                setDraft((current) => ({ ...current, username: value }));
              }}
              placeholderTextColor={theme.text.placeholder}
              style={[styles.inputInline, cooldownUntil !== null && styles.inputInlineLocked]}
              testID="mobile-profile-edit-username-input"
              value={draft.username}
            />
            <MobileLineIcon color={theme.text.placeholder} name="lock" size={14} />
          </View>
          {usernameError ? (
            <Text
              accessibilityRole="alert"
              style={styles.fieldError}
              testID="mobile-profile-edit-username-error"
            >
              {usernameError}
            </Text>
          ) : !isUsernameValid ? (
            <Text
              accessibilityRole="alert"
              style={styles.fieldError}
              testID="mobile-profile-edit-username-error"
            >
              {copy.profileEditUsernameInvalid}
            </Text>
          ) : (
            <Text style={styles.fieldHint} testID="mobile-profile-edit-username-hint">
              {cooldownUntil
                ? copy.profileEditUsernameCooldownActive.replace(
                    "{date}",
                    cooldownUntil.toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US"),
                  )
                : copy.profileEditUsernameCooldownHint}
            </Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{copy.profileEditAboutLabel}</Text>
          <View style={styles.textAreaShell}>
            <TextInput
              accessibilityLabel={copy.profileEditBio}
              maxLength={MOBILE_PROFILE_BIO_MAX_LENGTH}
              multiline
              onChangeText={(value) => setDraft((current) => ({ ...current, bio: value }))}
              placeholder={copy.profileEditAboutPlaceholder}
              placeholderTextColor={theme.text.placeholder}
              style={styles.textArea}
              testID="mobile-profile-edit-bio-input"
              value={draft.bio}
            />
            <Text
              style={[styles.counter, isBioOverLimit && styles.counterOverLimit]}
              testID="mobile-profile-edit-bio-counter"
            >
              {`${draft.bio.length}/${MOBILE_PROFILE_BIO_MAX_LENGTH}`}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.formCard} testID="mobile-profile-edit-status">
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{copy.profileEditStatusLabel}</Text>
          <View style={styles.inputRow}>
            <Pressable
              accessibilityLabel={copy.profileEditStatusEmojiAction}
              accessibilityRole="button"
              onPress={() => setEmojiPickerOpen(true)}
              style={({ pressed }) => [styles.statusEmojiButton, pressed && styles.pressed]}
              testID="mobile-profile-edit-status-emoji"
            >
              {draft.customStatusEmoji ? (
                <Text style={styles.statusEmoji}>{draft.customStatusEmoji}</Text>
              ) : (
                <MobileLineIcon color={theme.text.placeholder} name="emoji" size={16} />
              )}
            </Pressable>
            <TextInput
              accessibilityLabel={copy.profileEditCustomStatus}
              maxLength={MOBILE_PROFILE_CUSTOM_STATUS_MAX_LENGTH}
              onChangeText={(value) => setDraft((current) => ({ ...current, customStatus: value }))}
              placeholder={copy.profileEditStatusPlaceholder}
              placeholderTextColor={theme.text.placeholder}
              style={styles.inputInline}
              testID="mobile-profile-edit-status-input"
              value={draft.customStatus}
            />
            {statusText || draft.customStatusEmoji ? (
              <Pressable
                accessibilityLabel={copy.profileEditStatusClearAction}
                accessibilityRole="button"
                onPress={() =>
                  setDraft((current) => ({
                    ...current,
                    customStatus: "",
                    customStatusEmoji: null,
                    statusExpiry: "never",
                  }))
                }
                style={({ pressed }) => [styles.statusClear, pressed && styles.pressed]}
                testID="mobile-profile-edit-status-clear"
              >
                <MobileLineIcon color={theme.text.placeholder} name="close" size={14} />
              </Pressable>
            ) : null}
          </View>
          <View
            accessibilityLabel={copy.profileEditStatusExpiryAction}
            accessibilityRole="radiogroup"
            style={styles.expiryRow}
          >
            {MOBILE_STATUS_EXPIRY_CHOICES.map((choice) => {
              const isSelected = draft.statusExpiry === choice;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  key={choice}
                  onPress={() => setDraft((current) => ({ ...current, statusExpiry: choice }))}
                  style={({ pressed }) => [
                    styles.expiryChip,
                    isSelected && styles.expiryChipSelected,
                    pressed && styles.pressed,
                  ]}
                  testID={`mobile-profile-edit-status-expiry-${choice}`}
                >
                  <Text
                    style={[styles.expiryChipLabel, isSelected && styles.expiryChipLabelSelected]}
                  >
                    {getExpiryChoiceLabel(locale, choice)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.fieldHint} testID="mobile-profile-edit-status-expiry-notice">
            {expiryNotice}
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{copy.profileEditPresence}</Text>
          <Pressable
            accessibilityLabel={`${copy.profileEditPresence}: ${getPresenceLabel(locale, presence)}`}
            accessibilityRole="button"
            onPress={() => setPresenceSheetOpen(true)}
            style={({ pressed }) => [styles.presenceRow, pressed && styles.pressed]}
            testID="mobile-profile-edit-presence-row"
          >
            <View style={[styles.presenceDot, { backgroundColor: presenceColor }]} />
            <Text numberOfLines={1} style={styles.presenceLabel}>
              {getPresenceLabel(locale, presence)}
            </Text>
            <MobileLineIcon color={theme.control.chevron} name="chevron-down" size={16} />
          </Pressable>
        </View>
      </View>

      <View style={styles.footer}>
        <MobileLineIcon color={theme.text.placeholder} name="info" size={12} />
        <Text style={styles.footerLabel} testID="mobile-profile-edit-footer">
          {copy.profileEditFooterNote}
        </Text>
      </View>

      <MessageEmojiPicker
        isOpen={isEmojiPickerOpen}
        onClose={() => setEmojiPickerOpen(false)}
        onSelect={(emoji) => {
          setDraft((current) => ({ ...current, customStatusEmoji: emoji }));
          setEmojiPickerOpen(false);
        }}
      />

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
        selectedValue={PRESENCE_OPTIONS.find((option) => option === presence) ?? null}
        testID="mobile-profile-edit-presence"
        title={copy.profileEditPresence}
      />
    </ScrollView>
  );
}

function ProfileEditHeader({
  busy,
  canSave,
  locale,
  onBack,
  onSave,
}: {
  busy?: boolean;
  canSave: boolean;
  locale: MobileLocale;
  onBack(): void;
  onSave(): void;
}) {
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
          <MobileLineIcon color={theme.text.primary} name="back-arrow" size={17} />
        </View>
      </Pressable>
      <Text numberOfLines={1} style={styles.title}>
        {copy.profileEditTitle}
      </Text>
      <Pressable
        accessibilityLabel={copy.profileEditSave}
        accessibilityRole="button"
        accessibilityState={{ busy: busy === true, disabled: !canSave }}
        disabled={!canSave}
        onPress={onSave}
        style={({ pressed }) => [
          styles.saveChip,
          !canSave && styles.saveChipDisabled,
          pressed && styles.pressed,
        ]}
        testID="mobile-profile-edit-save"
      >
        <Text style={[styles.saveChipLabel, !canSave && styles.saveChipLabelDisabled]}>
          {copy.profileEditSave}
        </Text>
      </Pressable>
    </View>
  );
}
