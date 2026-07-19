import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "../components/kit/bottom-sheet";
import { Toggle } from "../components/kit/toggle";
import { mobileCopy, type MobileLocale } from "../../locale/mobile-copy";
import {
  MOBILE_QUIET_HOURS_TIME_OPTIONS,
  MOBILE_SERVER_NOTIFICATION_MODES,
  formatMobileQuietHoursRange,
  type MobileServerNotificationMode,
} from "../../notifications/mobile-notification-preferences";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { useMobileNotificationPreferences } from "../providers/mobile-notification-preferences-provider";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMobileNotificationSettingsStyles } from "./mobile-notification-settings-screen.styles";

type NotificationIconTone = "amber" | "danger" | "green" | "indigo" | "muted";

type IoniconName = keyof typeof Ionicons.glyphMap;

function useIconTone(tone: NotificationIconTone) {
  const theme = useTheme();
  const styles = useMobileNotificationSettingsStyles();
  switch (tone) {
    case "amber":
      return { boxStyle: styles.iconBoxAmber, color: theme.status.warning };
    case "danger":
      return { boxStyle: styles.iconBoxDanger, color: theme.status.danger };
    case "green":
      return { boxStyle: styles.iconBoxGreen, color: theme.status.success };
    case "muted":
      return { boxStyle: styles.iconBoxMuted, color: theme.text.muted };
    case "indigo":
    default:
      return { boxStyle: styles.iconBoxIndigo, color: theme.accent.default };
  }
}

function NotificationIconBox({ icon, tone }: { icon: IoniconName; tone: NotificationIconTone }) {
  const styles = useMobileNotificationSettingsStyles();
  const { boxStyle, color } = useIconTone(tone);
  return (
    <View style={[styles.iconBox, boxStyle]}>
      <Ionicons color={color} name={icon} size={17} />
    </View>
  );
}

function getServerModeLabel(locale: MobileLocale, mode: MobileServerNotificationMode): string {
  const copy = mobileCopy[locale];
  switch (mode) {
    case "all":
      return copy.notificationSettingsServerModeAll;
    case "none":
      return copy.notificationSettingsServerModeNone;
    case "mentions":
    default:
      return copy.notificationSettingsServerModeMentions;
  }
}

function NotificationToggleRow({
  disabled = false,
  hint,
  icon,
  isLast = false,
  label,
  onValueChange,
  testID,
  tone,
  value,
}: {
  disabled?: boolean;
  hint?: string;
  icon: IoniconName;
  isLast?: boolean;
  label: string;
  onValueChange(next: boolean): void;
  testID: string;
  tone: NotificationIconTone;
  value: boolean;
}) {
  const styles = useMobileNotificationSettingsStyles();
  return (
    <View
      style={[styles.row, !isLast && styles.rowDivider, disabled && styles.rowDisabled]}
      testID={testID}
    >
      <NotificationIconBox icon={icon} tone={tone} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Toggle
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={onValueChange}
        testID={`${testID}-toggle`}
        value={value}
      />
    </View>
  );
}

function NotificationChevronRow({
  disabled = false,
  hint,
  icon,
  isLast = false,
  label,
  onPress,
  testID,
  tone,
  value,
}: {
  disabled?: boolean;
  hint?: string;
  icon: IoniconName;
  isLast?: boolean;
  label: string;
  onPress(): void;
  testID: string;
  tone: NotificationIconTone;
  value?: string;
}) {
  const theme = useTheme();
  const styles = useMobileNotificationSettingsStyles();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !isLast && styles.rowDivider,
        disabled && styles.rowDisabled,
        pressed && !disabled && styles.pressed,
      ]}
      testID={testID}
    >
      <NotificationIconBox icon={icon} tone={tone} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {value ? (
        <Text numberOfLines={1} style={styles.rowValue}>
          {value}
        </Text>
      ) : null}
      <Ionicons color={theme.text.soft} name="chevron-forward" size={16} />
    </Pressable>
  );
}

export function MobileNotificationSettingsScreen({ onBack }: { onBack(): void }) {
  const theme = useTheme();
  const styles = useMobileNotificationSettingsStyles();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const { selection } = useMobileHaptics();
  const { preferences, updatePreferences } = useMobileNotificationPreferences();
  const [serverSheetOpen, setServerSheetOpen] = useState(false);
  const [quietHoursSheetOpen, setQuietHoursSheetOpen] = useState(false);
  const [exceptionsSheetOpen, setExceptionsSheetOpen] = useState(false);

  const pushDisabled = !preferences.allowNotifications;
  const toggle =
    (key: keyof typeof preferences) =>
    (next: boolean) => {
      selection();
      updatePreferences({ [key]: next });
    };

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.root}
        testID="mobile-notification-settings-screen"
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={copy.authBackAction}
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            testID="mobile-notification-settings-back"
          >
            <View style={styles.backVisual}>
              <Ionicons color={theme.text.primary} name="chevron-back" size={18} />
            </View>
          </Pressable>
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={styles.title}>
              {copy.notificationSettingsTitle}
            </Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {copy.notificationSettingsSubtitle}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionHeading}>{copy.notificationSettingsPushHeading}</Text>
        <View style={styles.card}>
          <NotificationToggleRow
            hint={copy.notificationSettingsAllowHint}
            icon="notifications-outline"
            label={copy.notificationSettingsAllow}
            onValueChange={toggle("allowNotifications")}
            testID="mobile-notification-allow"
            tone="indigo"
            value={preferences.allowNotifications}
          />
          <NotificationToggleRow
            disabled={pushDisabled}
            icon="chatbubble-outline"
            label={copy.notificationSettingsDirectMessages}
            onValueChange={toggle("directMessages")}
            testID="mobile-notification-dm"
            tone="indigo"
            value={preferences.directMessages}
          />
          <NotificationChevronRow
            disabled={pushDisabled}
            hint={copy.notificationSettingsServerMessagesHint}
            icon="at-outline"
            label={copy.notificationSettingsServerMessages}
            onPress={() => setServerSheetOpen(true)}
            testID="mobile-notification-server"
            tone="amber"
            value={getServerModeLabel(locale, preferences.serverMessages)}
          />
          <NotificationToggleRow
            disabled={pushDisabled}
            icon="call-outline"
            isLast
            label={copy.notificationSettingsCalls}
            onValueChange={toggle("calls")}
            testID="mobile-notification-calls"
            tone="green"
            value={preferences.calls}
          />
        </View>

        <Text style={styles.sectionHeading}>{copy.notificationSettingsSoundHeading}</Text>
        <View style={styles.card}>
          <NotificationToggleRow
            disabled={pushDisabled}
            icon="volume-high-outline"
            label={copy.notificationSettingsSounds}
            onValueChange={toggle("notificationSounds")}
            testID="mobile-notification-sounds"
            tone="indigo"
            value={preferences.notificationSounds}
          />
          <NotificationToggleRow
            disabled={pushDisabled}
            icon="phone-portrait-outline"
            isLast
            label={copy.notificationSettingsVibration}
            onValueChange={toggle("vibration")}
            testID="mobile-notification-vibration"
            tone="muted"
            value={preferences.vibration}
          />
        </View>

        <Text style={styles.sectionHeading}>{copy.notificationSettingsDndHeading}</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowDivider, pushDisabled && styles.rowDisabled]}>
            <Pressable
              accessibilityLabel={copy.notificationSettingsQuietHours}
              accessibilityRole="button"
              accessibilityState={{ disabled: pushDisabled }}
              disabled={pushDisabled}
              onPress={() => setQuietHoursSheetOpen(true)}
              style={({ pressed }) => [
                styles.row,
                { flex: 1, minHeight: 0, paddingHorizontal: 0, paddingVertical: 0 },
                pressed && !pushDisabled && styles.pressed,
              ]}
              testID="mobile-notification-quiet-hours"
            >
              <NotificationIconBox icon="remove-circle-outline" tone="danger" />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{copy.notificationSettingsQuietHours}</Text>
                <Text style={styles.rowHint}>
                  {formatMobileQuietHoursRange(
                    preferences.quietHoursStart,
                    preferences.quietHoursEnd,
                  )}
                </Text>
              </View>
            </Pressable>
            <Toggle
              accessibilityLabel={copy.notificationSettingsQuietHours}
              disabled={pushDisabled}
              onValueChange={toggle("quietHoursEnabled")}
              testID="mobile-notification-quiet-hours-toggle"
              value={preferences.quietHoursEnabled}
            />
          </View>
          <NotificationChevronRow
            disabled={pushDisabled}
            hint={copy.notificationSettingsExceptionsHint}
            icon="shield-checkmark-outline"
            isLast
            label={copy.notificationSettingsExceptions}
            onPress={() => setExceptionsSheetOpen(true)}
            testID="mobile-notification-exceptions"
            tone="indigo"
          />
        </View>

        <View style={styles.infoNote}>
          <Ionicons color={theme.accent.strong} name="information-circle-outline" size={16} />
          <Text style={styles.infoNoteText}>{copy.notificationSettingsServerHint}</Text>
        </View>
      </ScrollView>

      <BottomSheet
        accessibilityLabel={copy.notificationSettingsServerMessages}
        onClose={() => setServerSheetOpen(false)}
        open={serverSheetOpen}
        snapPoint={380}
        testID="mobile-notification-server-sheet"
      >
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{copy.notificationSettingsServerMessages}</Text>
          <Text style={styles.sheetSubtitle}>
            {copy.notificationSettingsServerModeSheetSubtitle}
          </Text>
          {MOBILE_SERVER_NOTIFICATION_MODES.map((mode) => {
            const selected = preferences.serverMessages === mode;
            return (
              <Pressable
                accessibilityLabel={getServerModeLabel(locale, mode)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, selected }}
                key={mode}
                onPress={() => {
                  selection();
                  updatePreferences({ serverMessages: mode });
                  setServerSheetOpen(false);
                }}
                style={({ pressed }) => [
                  styles.optionRow,
                  selected && styles.optionRowSelected,
                  pressed && styles.pressed,
                ]}
                testID={`mobile-notification-server-mode-${mode}`}
              >
                <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                  {getServerModeLabel(locale, mode)}
                </Text>
                {selected ? (
                  <Ionicons color={theme.accent.default} name="checkmark" size={20} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      <BottomSheet
        accessibilityLabel={copy.notificationSettingsQuietHours}
        onClose={() => setQuietHoursSheetOpen(false)}
        open={quietHoursSheetOpen}
        snapPoint={420}
        testID="mobile-notification-quiet-hours-sheet"
      >
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{copy.notificationSettingsQuietHours}</Text>
          <Text style={styles.sheetSubtitle}>
            {copy.notificationSettingsQuietHoursSheetSubtitle}
          </Text>
          <View style={styles.quietHoursColumns}>
            <QuietHoursColumn
              label={copy.notificationSettingsQuietHoursStart}
              onSelect={(time) => {
                selection();
                updatePreferences({ quietHoursStart: time });
              }}
              selected={preferences.quietHoursStart}
              testID="mobile-notification-quiet-start"
            />
            <QuietHoursColumn
              label={copy.notificationSettingsQuietHoursEnd}
              onSelect={(time) => {
                selection();
                updatePreferences({ quietHoursEnd: time });
              }}
              selected={preferences.quietHoursEnd}
              testID="mobile-notification-quiet-end"
            />
          </View>
        </View>
      </BottomSheet>

      <BottomSheet
        accessibilityLabel={copy.notificationSettingsExceptions}
        onClose={() => setExceptionsSheetOpen(false)}
        open={exceptionsSheetOpen}
        snapPoint={320}
        testID="mobile-notification-exceptions-sheet"
      >
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{copy.notificationSettingsExceptions}</Text>
          <Text style={styles.sheetSubtitle}>
            {copy.notificationSettingsExceptionsSheetSubtitle}
          </Text>
          <View style={styles.card}>
            <NotificationToggleRow
              icon="call-outline"
              isLast
              label={copy.notificationSettingsDmCallsAlwaysRing}
              onValueChange={toggle("dmCallsAlwaysRing")}
              testID="mobile-notification-dm-calls-ring"
              tone="green"
              value={preferences.dmCallsAlwaysRing}
            />
          </View>
        </View>
      </BottomSheet>
    </>
  );
}

function QuietHoursColumn({
  label,
  onSelect,
  selected,
  testID,
}: {
  label: string;
  onSelect(time: string): void;
  selected: string;
  testID: string;
}) {
  const styles = useMobileNotificationSettingsStyles();
  return (
    <View style={styles.quietHoursColumn}>
      <Text style={styles.quietHoursColumnLabel}>{label}</Text>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.quietHoursList}
        testID={testID}
      >
        {MOBILE_QUIET_HOURS_TIME_OPTIONS.map((time) => {
          const isSelected = time === selected;
          return (
            <Pressable
              accessibilityLabel={`${label} ${time}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected, selected: isSelected }}
              key={time}
              onPress={() => onSelect(time)}
              style={({ pressed }) => [
                styles.timeOption,
                isSelected && styles.timeOptionSelected,
                pressed && styles.pressed,
              ]}
              testID={`${testID}-${time}`}
            >
              <Text style={[styles.timeOptionText, isSelected && styles.timeOptionTextSelected]}>
                {time}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
