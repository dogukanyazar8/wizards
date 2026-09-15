import {
  MOBILE_PROFILE_CUSTOM_STATUS_MAX_LENGTH,
  PROFILE_STATUS_EMOJI_MAX_LENGTH,
  appendProfileStatusEmoji,
} from "@wizards/types";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { BottomSheet, Button, SheetHeader, useSheetPresentation } from "../app/components/kit";
import { MessageEmojiPicker } from "../app/components/message-emoji-picker";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileCopy, type MobileLocale } from "../locale/mobile-copy";
import { useMobileProfileSheetStyles } from "./mobile-profile-sheets.styles";
import {
  MOBILE_STATUS_EXPIRY_CHOICES,
  resolveMobileStatusExpiresAt,
  inferMobileStatusExpiryChoice,
  type MobileStatusExpiryChoice,
} from "./mobile-profile-status-expiry";
import { useMobileSocialMutations } from "./mobile-social-query";

export const MOBILE_CUSTOM_STATUS_SHEET_TEST_ID = "mobile-profile-custom-status-sheet";

function getDurationLabel(locale: MobileLocale, duration: MobileStatusExpiryChoice): string {
  const copy = mobileCopy[locale];
  switch (duration) {
    case "30m":
      return copy.profileCustomStatusDuration30Minutes;
    case "1h":
      return copy.profileCustomStatusDuration1Hour;
    case "4h":
      return copy.profileCustomStatusDuration4Hours;
    case "today":
      return copy.profileCustomStatusDurationToday;
    default:
      return copy.profileCustomStatusDurationNever;
  }
}

export interface MobileCustomStatusSheetProps {
  readonly client: MobileApiClient;
  readonly customStatus: string | null;
  readonly customStatusEmoji: string | null;
  readonly customStatusExpiresAt?: string | null;
  readonly onClose: () => void;
  readonly open: boolean;
}

/**
 * Status-message editor reached from the 2c picker (and from the 1d card's
 * dashed "add status message" row). Emoji, text and expiry are one PATCH so the
 * three never land out of step with each other.
 */
export function MobileCustomStatusSheet({
  client,
  customStatus,
  customStatusEmoji,
  customStatusExpiresAt = null,
  onClose,
  open,
}: MobileCustomStatusSheetProps) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useMobileProfileSheetStyles();
  const theme = useTheme();
  const presentation = useSheetPresentation();
  const { updateProfile } = useMobileSocialMutations(client);

  const [draft, setDraft] = useState(customStatus ?? "");
  const [emoji, setEmoji] = useState<string | null>(customStatusEmoji);
  const [duration, setDuration] = useState<MobileStatusExpiryChoice>("never");
  const [initialDuration, setInitialDuration] = useState<MobileStatusExpiryChoice>("never");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(customStatus ?? "");
      setEmoji(customStatusEmoji);
      const choice = inferMobileStatusExpiryChoice(customStatusExpiresAt);
      setDuration(choice);
      setInitialDuration(choice);
      setFailed(false);
    }
  }, [customStatus, customStatusEmoji, customStatusExpiresAt, open]);

  const trimmed = draft.trim();
  const canSave = trimmed.length > 0 && !updateProfile.isPending;
  const canClear = (customStatus !== null || trimmed.length > 0) && !updateProfile.isPending;

  const save = () => {
    if (!canSave) {
      return;
    }

    setFailed(false);
    updateProfile.mutate(
      {
        customStatus: trimmed,
        customStatusEmoji: emoji,
        ...(duration !== initialDuration || !customStatus
          ? { customStatusExpiresAt: resolveMobileStatusExpiresAt(duration) }
          : {}),
      },
      { onError: () => setFailed(true), onSuccess: () => onClose() },
    );
  };

  const clear = () => {
    if (!canClear) {
      return;
    }

    setFailed(false);
    updateProfile.mutate(
      { customStatus: null, customStatusEmoji: null, customStatusExpiresAt: null },
      { onError: () => setFailed(true), onSuccess: () => onClose() },
    );
  };

  return (
    <>
      <BottomSheet
        accessibilityLabel={copy.profileCustomStatusSheetTitle}
        onClose={onClose}
        open={open}
        presentation={{
          contentStyle: styles.content,
          handleAreaStyle: styles.handleArea,
          handleStyle: styles.handle,
          panelStyle: [presentation.panelStyle, styles.panel],
        }}
        sizing="content"
        testID={MOBILE_CUSTOM_STATUS_SHEET_TEST_ID}
      >
        <View style={styles.customRoot}>
          <SheetHeader
            closeAccessibilityLabel={copy.sheetCloseAction}
            icon="chatbubble-ellipses-outline"
            onClose={onClose}
            testID={`${MOBILE_CUSTOM_STATUS_SHEET_TEST_ID}-header`}
            title={copy.profileCustomStatusSheetTitle}
          />

          <View style={styles.customRow}>
            <Pressable
              accessibilityLabel={copy.profileCustomStatusEmojiAction}
              accessibilityRole="button"
              onPress={() => setEmojiPickerOpen(true)}
              style={styles.customEmojiButton}
              testID={`${MOBILE_CUSTOM_STATUS_SHEET_TEST_ID}-emoji`}
            >
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.customEmojiGlyph}>
                {emoji ?? "🙂"}
              </Text>
            </Pressable>
            <TextInput
              accessibilityLabel={copy.profileCustomStatusSheetTitle}
              editable={!updateProfile.isPending}
              maxLength={MOBILE_PROFILE_CUSTOM_STATUS_MAX_LENGTH}
              onBlur={() => setFocused(false)}
              onChangeText={setDraft}
              onFocus={() => setFocused(true)}
              placeholder={copy.profileCustomStatusPlaceholder}
              placeholderTextColor={theme.text.placeholder}
              style={[styles.customField, focused && styles.customFieldFocused]}
              testID={`${MOBILE_CUSTOM_STATUS_SHEET_TEST_ID}-input`}
              value={draft}
            />
          </View>

          <Text style={styles.customHeading}>{copy.profileCustomStatusDurationHeading}</Text>
          <View
            accessibilityRole="radiogroup"
            style={styles.customDurations}
            testID={`${MOBILE_CUSTOM_STATUS_SHEET_TEST_ID}-durations`}
          >
            {MOBILE_STATUS_EXPIRY_CHOICES.map((option) => {
              const isSelected = option === duration;
              return (
                <Pressable
                  accessibilityLabel={getDurationLabel(locale, option)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected, selected: isSelected }}
                  key={option}
                  onPress={() => setDuration(option)}
                  style={[styles.customDuration, isSelected && styles.customDurationSelected]}
                  testID={`${MOBILE_CUSTOM_STATUS_SHEET_TEST_ID}-duration-${option}`}
                >
                  <Text
                    style={[
                      styles.customDurationLabel,
                      isSelected && styles.customDurationLabelSelected,
                    ]}
                  >
                    {getDurationLabel(locale, option)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {failed ? (
            <Text
              accessibilityRole="alert"
              style={styles.noteError}
              testID={`${MOBILE_CUSTOM_STATUS_SHEET_TEST_ID}-error`}
            >
              {copy.profileCustomStatusError}
            </Text>
          ) : null}

          <View style={styles.customActions}>
            <View style={styles.customAction}>
              <Button
                disabled={!canClear}
                label={copy.profileCustomStatusClear}
                onPress={clear}
                testID={`${MOBILE_CUSTOM_STATUS_SHEET_TEST_ID}-clear`}
                variant="secondary"
              />
            </View>
            <View style={styles.customAction}>
              <Button
                busy={updateProfile.isPending}
                disabled={!canSave}
                label={copy.profileCustomStatusSave}
                onPress={save}
                testID={`${MOBILE_CUSTOM_STATUS_SHEET_TEST_ID}-save`}
              />
            </View>
          </View>
        </View>
      </BottomSheet>

      <MessageEmojiPicker
        closeOnSelect={false}
        selectedEmojis={emoji ?? ""}
        onClearSelection={() => setEmoji(null)}
        canSelect={(selected) =>
          (emoji?.length ?? 0) + selected.length <= PROFILE_STATUS_EMOJI_MAX_LENGTH
        }
        isOpen={emojiPickerOpen}
        onClose={() => setEmojiPickerOpen(false)}
        onSelect={(selected) => {
          setEmoji((current) => appendProfileStatusEmoji(current, selected));
        }}
      />
    </>
  );
}
