import type { MobileFriendPresenceStatus } from "@wizards/types";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { BottomSheet, useSheetPresentation } from "../app/components/kit";
import { useMobileHaptics } from "../app/providers/mobile-haptics-provider";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import type { MobileApiClient } from "../api/mobile-api-client";
import { MobileLineIcon } from "../design/mobile-line-icons";
import type { MobileTheme } from "../design/themes";
import { mobileCopy, type MobileLocale } from "../locale/mobile-copy";
import { useMobileProfileSheetStyles } from "./mobile-profile-sheets.styles";
import {
  MOBILE_STATUS_PICKER_OPTIONS,
  toMobilePresenceStatus,
  toMobileStatusPickerOption,
  type MobileStatusPickerOption,
} from "./mobile-status-picker-model";
import { useMobileSocialMutations } from "./mobile-social-query";

export const MOBILE_STATUS_PICKER_SHEET_TEST_ID = "mobile-profile-status-sheet";

function getStatusLabel(locale: MobileLocale, option: MobileStatusPickerOption): string {
  const copy = mobileCopy[locale];
  switch (option) {
    case "ONLINE":
      return copy.profileStatusOnline;
    case "IDLE":
      return copy.profileStatusIdle;
    case "DND":
      return copy.profileStatusDnd;
    default:
      return copy.profileStatusInvisible;
  }
}

function getStatusDescription(
  locale: MobileLocale,
  option: MobileStatusPickerOption,
): string | null {
  const copy = mobileCopy[locale];
  switch (option) {
    case "DND":
      return copy.profileStatusDndDescription;
    case "INVISIBLE":
      return copy.profileStatusInvisibleDescription;
    default:
      return null;
  }
}

function getStatusTileColor(theme: MobileTheme, option: MobileStatusPickerOption): string {
  switch (option) {
    case "ONLINE":
      return theme.profileSheet.statusOnlineSurface;
    case "IDLE":
      return theme.profileSheet.statusIdleSurface;
    case "DND":
      return theme.profileSheet.statusDndSurface;
    default:
      return theme.profileSheet.statusInvisibleSurface;
  }
}

export interface MobileStatusPickerSheetProps {
  readonly client: MobileApiClient;
  /** Current status message preview shown on the "add status message" row. */
  readonly customStatus: string | null;
  readonly customStatusEmoji: string | null;
  readonly onClose: () => void;
  /** Opens the status-message editor; the picker closes first so one sheet is up at a time. */
  readonly onOpenCustomStatus: () => void;
  readonly open: boolean;
  readonly presence: MobileFriendPresenceStatus | null;
}

/**
 * Handoff 2c. Picking a status writes presence immediately and closes — there is
 * no confirm step, because the row that was tapped is the confirmation, and the
 * dots everywhere else follow from the presence cache patch.
 */
export function MobileStatusPickerSheet({
  client,
  customStatus,
  customStatusEmoji,
  onClose,
  onOpenCustomStatus,
  open,
  presence,
}: MobileStatusPickerSheetProps) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useMobileProfileSheetStyles();
  const theme = useTheme();
  const haptics = useMobileHaptics();
  const presentation = useSheetPresentation();
  const { updatePresence } = useMobileSocialMutations(client);
  const [failed, setFailed] = useState(false);

  const selected = toMobileStatusPickerOption(presence);
  const customStatusPreview = customStatus
    ? `${customStatusEmoji ? `${customStatusEmoji} ` : ""}${customStatus}`
    : null;

  const select = (option: MobileStatusPickerOption) => {
    if (updatePresence.isPending) {
      return;
    }

    // The haptic fires on intent, not on the round trip: the presence cache is
    // patched optimistically, so the dots have already moved by the next frame.
    haptics.selection();
    setFailed(false);
    updatePresence.mutate(toMobilePresenceStatus(option), {
      onError: () => setFailed(true),
      onSuccess: () => onClose(),
    });
  };

  return (
    <BottomSheet
      accessibilityLabel={copy.profileStatusSheetTitle}
      onClose={onClose}
      open={open}
      presentation={{
        contentStyle: styles.content,
        handleAreaStyle: styles.handleArea,
        handleStyle: styles.handle,
        panelStyle: [presentation.panelStyle, styles.panel],
      }}
      sizing="content"
      testID={MOBILE_STATUS_PICKER_SHEET_TEST_ID}
    >
      <View>
        <Text accessibilityRole="header" style={styles.statusTitle}>
          {copy.profileStatusSheetTitle}
        </Text>

        <View
          accessibilityRole="radiogroup"
          style={styles.statusOptions}
          testID={`${MOBILE_STATUS_PICKER_SHEET_TEST_ID}-options`}
        >
          {MOBILE_STATUS_PICKER_OPTIONS.map((option) => {
            const label = getStatusLabel(locale, option);
            const description = getStatusDescription(locale, option);
            const isSelected = option === selected;

            return (
              <Pressable
                accessibilityLabel={description ? `${label}. ${description}` : label}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected, selected: isSelected }}
                disabled={updatePresence.isPending}
                key={option}
                onPress={() => select(option)}
                style={({ pressed }) => [
                  styles.statusRow,
                  isSelected && styles.statusRowSelected,
                  updatePresence.isPending && styles.statusRowDisabled,
                  pressed && !updatePresence.isPending && styles.statusRowPressed,
                ]}
                testID={`${MOBILE_STATUS_PICKER_SHEET_TEST_ID}-${option.toLowerCase()}`}
              >
                <View
                  style={[styles.statusTile, { backgroundColor: getStatusTileColor(theme, option) }]}
                >
                  {option === "ONLINE" ? (
                    <View
                      style={[
                        styles.statusGlyphDot,
                        { backgroundColor: theme.profileSheet.statusOnlineDot },
                      ]}
                    />
                  ) : null}
                  {option === "IDLE" ? (
                    <MobileLineIcon
                      color={theme.profileSheet.statusIdleIcon}
                      name="moon"
                      size={16}
                    />
                  ) : null}
                  {option === "DND" ? (
                    <MobileLineIcon
                      color={theme.profileSheet.statusDndIcon}
                      name="minus-circle"
                      size={16}
                    />
                  ) : null}
                  {option === "INVISIBLE" ? <View style={styles.statusGlyphRing} /> : null}
                </View>

                <View style={styles.statusText}>
                  <Text
                    numberOfLines={1}
                    style={[styles.statusLabel, isSelected && styles.statusLabelSelected]}
                  >
                    {label}
                  </Text>
                  {description ? (
                    <Text numberOfLines={2} style={styles.statusDescription}>
                      {description}
                    </Text>
                  ) : null}
                </View>

                {isSelected ? (
                  <MobileLineIcon color={theme.profileSheet.check} name="check" size={18} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {failed ? (
          <Text
            accessibilityRole="alert"
            style={styles.statusError}
            testID={`${MOBILE_STATUS_PICKER_SHEET_TEST_ID}-error`}
          >
            {copy.profileStatusError}
          </Text>
        ) : null}

        <View style={styles.statusDivider}>
          <Pressable
            accessibilityLabel={
              customStatusPreview
                ? `${copy.profileCustomStatusEditAction}. ${customStatusPreview}`
                : copy.profileCustomStatusAction
            }
            accessibilityRole="button"
            onPress={() => {
              onClose();
              onOpenCustomStatus();
            }}
            style={({ pressed }) => [styles.statusRow, pressed && styles.statusRowPressed]}
            testID={`${MOBILE_STATUS_PICKER_SHEET_TEST_ID}-custom-status`}
          >
            <View
              style={[
                styles.statusTile,
                { backgroundColor: theme.profileSheet.selectedSurface },
              ]}
            >
              <MobileLineIcon color={theme.profileSheet.check} name="edit" size={15} />
            </View>
            <View style={styles.statusText}>
              <Text numberOfLines={1} style={styles.statusLabel}>
                {customStatusPreview
                  ? copy.profileCustomStatusEditAction
                  : copy.profileCustomStatusAction}
              </Text>
              {customStatusPreview ? (
                <Text numberOfLines={1} style={styles.statusDescription}>
                  {customStatusPreview}
                </Text>
              ) : null}
            </View>
            <MobileLineIcon color={theme.control.chevron} name="chevron-right" size={16} />
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}
