import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import {
  MOBILE_PROFILE_CUSTOM_STATUS_MAX_LENGTH,
  type MobileFriendPresenceStatus,
} from "@wizards/types";

import { useMobileAccountSettingsQuery } from "../account/mobile-account-settings-query";
import { BottomSheet, Skeleton, useSheetPresentation } from "../app/components/kit";
import { useToast } from "../app/components/kit/toast";
import { MessageEmojiPicker } from "../app/components/message-emoji-picker";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { mobileCopy, type MobileLocale } from "../locale/mobile-copy";
import { useMobileProfileSheetStyles } from "./mobile-profile-sheets.styles";
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
import { useMobileProfileStatusCardStyles } from "./mobile-profile-status-card.styles";
import { useMobileSocialMutations } from "./mobile-social-query";

export const MOBILE_PROFILE_STATUS_CARD_TEST_ID = "mobile-profile-status-card";

/**
 * Only the status keys ever move here, so every other field is pinned to the value the
 * shared patch builder treats as unchanged. That keeps one implementation of "clearing the
 * message drops its emoji and deadline" instead of a second copy that can drift.
 */
function toStatusBaseline(
  account: {
    readonly customStatus: string | null;
    readonly customStatusEmoji: string | null;
    readonly customStatusExpiresAt: string | null;
  } | null,
): MobileProfileEditBaseline {
  return {
    bannerColor: null,
    bannerOffsetX: null,
    bannerOffsetY: null,
    bannerUrl: null,
    bio: null,
    customStatus: account?.customStatus ?? null,
    customStatusEmoji: account?.customStatusEmoji ?? null,
    customStatusExpiresAt: account?.customStatusExpiresAt ?? null,
    displayName: null,
    username: "",
  };
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
    if (input.choice === "never") {
      return copy.profileEditStatusExpiryNever;
    }

    // "Bugün" names a moment, not a duration, so it cannot ride the "{duration} sonra"
    // template the way "4 saat" does.
    if (input.choice === "today") {
      return copy.profileEditStatusExpiryTodayNotice;
    }

    const preview = getExpiryChoiceLabel(input.locale, input.choice);
    return copy.profileEditStatusExpiryNotice.replace("{duration}", preview);
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

/** OFFLINE reads as "Görünmez"/"Invisible" here, the same four rows the picker sheet shows. */
function getPresenceLabel(locale: MobileLocale, presence: string | null): string {
  const copy = mobileCopy[locale];
  switch (presence) {
    case "ONLINE":
      return copy.profileHubOnline;
    case "IDLE":
      return copy.profileHubIdle;
    case "DND":
      return copy.profileHubDnd;
    case "OFFLINE":
      return copy.profileHubOffline;
    default:
      return copy.profileHubPresenceUnavailable;
  }
}

export interface MobileProfileStatusCardProps {
  readonly locale: MobileLocale;
  /** The hub owns the presence sheet, because it is handed the authenticated write. */
  readonly onOpenPresencePicker: () => void;
  readonly presence: MobileFriendPresenceStatus | null;
  readonly presenceDisabled: boolean;
  readonly presenceError: string | null;
}

/**
 * Status message + online status, directly under the profile banner. The presence half is
 * driven by the hub; the message half owns its own draft and PATCH, because the hub has no
 * save affordance of its own.
 */
export function MobileProfileStatusCard({
  locale,
  onOpenPresencePicker,
  presence,
  presenceDisabled,
  presenceError,
}: MobileProfileStatusCardProps) {
  const { apiClient, status } = useMobileAuth();
  const copy = mobileCopy[locale];
  const styles = useMobileProfileStatusCardStyles();
  const theme = useTheme();
  const { showToast } = useToast();

  const isSignedIn = status === "signed-in";
  const accountQuery = useMobileAccountSettingsQuery(apiClient, isSignedIn);
  const mutations = useMobileSocialMutations(apiClient);

  const account = accountQuery.data?.account ?? null;
  const serverBaseline = useMemo(() => toStatusBaseline(account), [account]);
  const [baseline, setBaseline] = useState<MobileProfileEditBaseline>(serverBaseline);
  const [draft, setDraft] = useState<MobileProfileEditDraft>(() =>
    createMobileProfileEditDraft(serverBaseline),
  );
  const [isEmojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [isExpirySheetOpen, setExpirySheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baselineSignature = JSON.stringify(serverBaseline);
  const appliedSignatureRef = useRef(baselineSignature);

  // A background refetch that returns what this card already committed must not wipe an
  // in-progress draft, so only a genuinely new server value reseeds it.
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
  }, [locale]);

  const patch = buildMobileProfileEditPatch({ baseline, draft });
  const isDirty = Object.keys(patch).length > 0;
  const canSave = isDirty && !mutations.updateProfile.isPending;
  const statusText = draft.customStatus.trim();
  const expiryNotice = getExpiryNotice({
    choice: draft.statusExpiry,
    expiresAt: baseline.customStatusExpiresAt,
    locale,
    now: new Date(),
  });

  const save = async () => {
    if (!canSave) {
      return;
    }

    setError(null);
    let response;
    try {
      response = await mutations.updateProfile.mutateAsync(patch);
    } catch {
      setError(copy.profileEditUpdateError);
      return;
    }

    const saved = toStatusBaseline(response.user);
    setBaseline(saved);
    setDraft(createMobileProfileEditDraft(saved));
    appliedSignatureRef.current = JSON.stringify(saved);
    // Same confirmation the 2a editor gives: the hub writes the same profile PATCH, so it
    // should not be the one surface where a save lands silently.
    showToast({ message: copy.profileEditSaved, tone: "success" });
  };

  if (accountQuery.isLoading && !account) {
    return (
      <View style={styles.card} testID={`${MOBILE_PROFILE_STATUS_CARD_TEST_ID}-loading`}>
        <Skeleton borderRadius={14} height={44} />
        <Skeleton borderRadius={14} height={44} />
      </View>
    );
  }

  return (
    <View style={styles.card} testID={MOBILE_PROFILE_STATUS_CARD_TEST_ID}>
      <View style={styles.field}>
        <View style={styles.fieldHeader}>
          <Text style={styles.fieldLabel}>{copy.profileEditStatusLabel}</Text>
          {isDirty ? (
            <Pressable
              accessibilityLabel={copy.profileEditSave}
              accessibilityRole="button"
              accessibilityState={{
                busy: mutations.updateProfile.isPending,
                disabled: !canSave,
              }}
              disabled={!canSave}
              onPress={() => void save()}
              style={({ pressed }) => [
                styles.saveChip,
                !canSave && styles.saveChipDisabled,
                pressed && styles.pressed,
              ]}
              testID="mobile-profile-status-save"
            >
              <Text style={[styles.saveChipLabel, !canSave && styles.saveChipLabelDisabled]}>
                {copy.profileEditSave}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.inputRow}>
          <Pressable
            accessibilityLabel={copy.profileEditStatusEmojiAction}
            accessibilityRole="button"
            onPress={() => setEmojiPickerOpen(true)}
            style={({ pressed }) => [styles.statusEmojiButton, pressed && styles.pressed]}
            testID="mobile-profile-status-emoji"
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
            style={styles.input}
            testID="mobile-profile-status-input"
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
              testID="mobile-profile-status-clear"
            >
              <MobileLineIcon color={theme.text.placeholder} name="close" size={14} />
            </Pressable>
          ) : null}
        </View>

        {/* Five chips took a whole row each on narrow phones; one control row plus a
            sheet says the same thing in 44px. */}
        <Pressable
          accessibilityLabel={copy.profileEditStatusExpiryAction}
          accessibilityRole="button"
          accessibilityValue={{ text: getExpiryChoiceLabel(locale, draft.statusExpiry) }}
          onPress={() => setExpirySheetOpen(true)}
          style={({ pressed }) => [styles.controlRow, pressed && styles.pressed]}
          testID="mobile-profile-status-expiry-open"
        >
          <MobileLineIcon color={theme.text.soft} name="clock" size={15} />
          <Text numberOfLines={1} style={styles.controlLabel}>
            {copy.profileEditStatusExpiryAction}
          </Text>
          <Text numberOfLines={1} style={styles.controlValue}>
            {getExpiryChoiceLabel(locale, draft.statusExpiry)}
          </Text>
          <MobileLineIcon color={theme.control.chevron} name="chevron-down" size={16} />
        </Pressable>
        <Text style={styles.fieldHint} testID="mobile-profile-status-expiry-notice">
          {expiryNotice}
        </Text>
        {error ? (
          <Text
            accessibilityRole="alert"
            style={styles.errorText}
            testID="mobile-profile-status-error"
          >
            {error}
          </Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{copy.profileEditPresence}</Text>
        <Pressable
          accessibilityLabel={copy.profilePresenceAction}
          accessibilityRole="button"
          accessibilityState={{ disabled: presenceDisabled }}
          disabled={presenceDisabled}
          onPress={onOpenPresencePicker}
          style={({ pressed }) => [styles.controlRow, pressed && styles.pressed]}
          testID="mobile-profile-presence-open"
        >
          <View
            style={[
              styles.presenceDot,
              {
                backgroundColor:
                  presence === "ONLINE"
                    ? theme.status.success
                    : presence === "IDLE"
                      ? theme.status.warning
                      : presence === "DND"
                        ? theme.status.danger
                        : theme.text.soft,
              },
            ]}
          />
          <Text numberOfLines={1} style={styles.controlLabel}>
            {getPresenceLabel(locale, presence)}
          </Text>
          <MobileLineIcon color={theme.control.chevron} name="chevron-down" size={16} />
        </Pressable>
        {presenceError ? (
          <Text accessibilityRole="alert" style={styles.errorText}>
            {presenceError}
          </Text>
        ) : null}
      </View>

      <MessageEmojiPicker
        isOpen={isEmojiPickerOpen}
        onClose={() => setEmojiPickerOpen(false)}
        onSelect={(emoji) => {
          setDraft((current) => ({ ...current, customStatusEmoji: emoji }));
          setEmojiPickerOpen(false);
        }}
      />

      <MobileStatusExpirySheet
        locale={locale}
        onClose={() => setExpirySheetOpen(false)}
        onSelect={(choice) => {
          setDraft((current) => ({ ...current, statusExpiry: choice }));
          setExpirySheetOpen(false);
        }}
        open={isExpirySheetOpen}
        selected={draft.statusExpiry}
      />
    </View>
  );
}

export const MOBILE_STATUS_EXPIRY_SHEET_TEST_ID = "mobile-profile-status-expiry-sheet";

/** The five auto-clear durations, as one sheet instead of a chip row. */
export function MobileStatusExpirySheet({
  locale,
  onClose,
  onSelect,
  open,
  selected,
}: {
  readonly locale: MobileLocale;
  readonly onClose: () => void;
  readonly onSelect: (choice: MobileStatusExpiryChoice) => void;
  readonly open: boolean;
  readonly selected: MobileStatusExpiryChoice;
}) {
  const copy = mobileCopy[locale];
  const sheetStyles = useMobileProfileSheetStyles();
  const theme = useTheme();
  const presentation = useSheetPresentation();

  return (
    <BottomSheet
      accessibilityLabel={copy.profileEditStatusExpirySheetTitle}
      onClose={onClose}
      open={open}
      presentation={{
        contentStyle: sheetStyles.content,
        handleAreaStyle: sheetStyles.handleArea,
        handleStyle: sheetStyles.handle,
        panelStyle: [presentation.panelStyle, sheetStyles.panel],
      }}
      sizing="content"
      testID={MOBILE_STATUS_EXPIRY_SHEET_TEST_ID}
    >
      <View>
        <Text accessibilityRole="header" style={sheetStyles.statusTitle}>
          {copy.profileEditStatusExpirySheetTitle}
        </Text>
        <View
          accessibilityRole="radiogroup"
          style={sheetStyles.statusOptions}
          testID={`${MOBILE_STATUS_EXPIRY_SHEET_TEST_ID}-options`}
        >
          {MOBILE_STATUS_EXPIRY_CHOICES.map((choice) => {
            const isSelected = choice === selected;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected, selected: isSelected }}
                key={choice}
                onPress={() => onSelect(choice)}
                style={({ pressed }) => [
                  sheetStyles.statusRow,
                  isSelected && sheetStyles.statusRowSelected,
                  pressed && sheetStyles.statusRowPressed,
                ]}
                testID={`mobile-profile-status-expiry-${choice}`}
              >
                <View
                  style={[
                    sheetStyles.statusTile,
                    { backgroundColor: theme.profileSheet.selectedSurface },
                  ]}
                >
                  <MobileLineIcon color={theme.profileSheet.check} name="clock" size={15} />
                </View>
                <View style={sheetStyles.statusText}>
                  <Text
                    numberOfLines={1}
                    style={[sheetStyles.statusLabel, isSelected && sheetStyles.statusLabelSelected]}
                  >
                    {getExpiryChoiceLabel(locale, choice)}
                  </Text>
                </View>
                {isSelected ? (
                  <MobileLineIcon color={theme.profileSheet.check} name="check" size={18} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </BottomSheet>
  );
}
