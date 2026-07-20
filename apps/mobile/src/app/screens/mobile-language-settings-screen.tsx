import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useMobileAuth } from "../../auth/mobile-auth-context";
import { mobileCopy, type MobileLocale } from "../../locale/mobile-copy";
import { syncMobileAccountLocale } from "../../locale/mobile-locale-client";
import {
  getMobileIntlLocale,
  MOBILE_LOCALE_OPTIONS,
  type MobileLocaleOption,
} from "../../locale/mobile-locale-preferences";
import { Toggle } from "../components/kit";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMobileLanguageSettingsStyles } from "./mobile-language-settings-screen.styles";

type IoniconName = keyof typeof Ionicons.glyphMap;

const FORMAT_PREVIEW_SAMPLE_NUMBER = 1234567.89;

export function getMobileLanguageTranslatedName(
  locale: MobileLocale,
  option: MobileLocaleOption,
): string {
  const copy = mobileCopy[locale];
  return option.id === "tr" ? copy.settingsLanguageTurkishValue : copy.settingsLanguageEnglishValue;
}

/**
 * Real `Intl` output for the active language, so the preview cannot drift from
 * what the rest of the app renders.
 */
export function getMobileLocaleFormatPreview(
  locale: MobileLocale,
  now: Date,
): { date: string; number: string; time: string } {
  const intlLocale = getMobileIntlLocale(locale);
  return {
    date: new Intl.DateTimeFormat(intlLocale, {
      day: "numeric",
      month: "long",
      weekday: "long",
      year: "numeric",
    }).format(now),
    number: new Intl.NumberFormat(intlLocale).format(FORMAT_PREVIEW_SAMPLE_NUMBER),
    time: new Intl.DateTimeFormat(intlLocale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(now),
  };
}

function InfoRow({
  icon,
  isLast = false,
  label,
  testID,
  value,
}: {
  icon: IoniconName;
  isLast?: boolean;
  label: string;
  testID: string;
  value: string;
}) {
  const theme = useTheme();
  const styles = useMobileLanguageSettingsStyles();
  return (
    <View style={[styles.row, !isLast && styles.rowDivider]} testID={testID}>
      <View style={[styles.iconBox, styles.iconBoxMuted]}>
        <Ionicons color={theme.text.muted} name={icon} size={17} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
}

function SoonRow({
  hint,
  icon,
  isLast = false,
  label,
  soonLabel,
  testID,
}: {
  hint: string;
  icon: IoniconName;
  isLast?: boolean;
  label: string;
  soonLabel: string;
  testID: string;
}) {
  const theme = useTheme();
  const styles = useMobileLanguageSettingsStyles();
  return (
    <View
      style={[styles.row, !isLast && styles.rowDivider, styles.rowDisabled]}
      testID={testID}
    >
      <View style={[styles.iconBox, styles.iconBoxMuted]}>
        <Ionicons color={theme.text.muted} name={icon} size={17} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <View style={styles.soonBadge}>
        <Text style={styles.soonBadgeText}>{soonLabel}</Text>
      </View>
    </View>
  );
}

export function MobileLanguageSettingsScreen({ onBack }: { onBack(): void }) {
  const theme = useTheme();
  const styles = useMobileLanguageSettingsStyles();
  const { locale, selectLocale, setUseDeviceLocale, usingDeviceLocale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const { selection } = useMobileHaptics();
  const { apiClient, status } = useMobileAuth();
  const isSignedIn = status === "signed-in";

  const languageOptions = useMemo(
    () =>
      [...MOBILE_LOCALE_OPTIONS].sort((left, right) =>
        left.nativeName.localeCompare(right.nativeName, "tr"),
      ),
    [],
  );
  const formatPreview = useMemo(() => getMobileLocaleFormatPreview(locale, new Date()), [locale]);

  const handleSelectLanguage = (nextLocale: MobileLocale) => {
    if (usingDeviceLocale) {
      return;
    }

    selection();
    selectLocale(nextLocale);
    syncMobileAccountLocale(apiClient, nextLocale, isSignedIn);
  };

  const handleToggleDeviceLanguage = (enabled: boolean) => {
    selection();
    setUseDeviceLocale(enabled);
    if (!enabled) {
      syncMobileAccountLocale(apiClient, locale, isSignedIn);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.root}
      testID="mobile-language-settings-screen"
    >
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={copy.authBackAction}
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          testID="mobile-language-settings-back"
        >
          <View style={styles.backVisual}>
            <Ionicons color={theme.text.primary} name="chevron-back" size={18} />
          </View>
        </Pressable>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.title}>
            {copy.languageSettingsTitle}
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {copy.languageSettingsSubtitle}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionHeading}>{copy.languageSettingsAppHeading}</Text>
      <View accessibilityRole="radiogroup" style={styles.card}>
        {languageOptions.map((option, index) => {
          const isSelected = !usingDeviceLocale && option.id === locale;
          const isLast = index === languageOptions.length - 1;

          return (
            <Pressable
              accessibilityLabel={`${option.nativeName}, ${getMobileLanguageTranslatedName(locale, option)}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected, disabled: usingDeviceLocale }}
              disabled={usingDeviceLocale}
              key={option.id}
              onPress={() => handleSelectLanguage(option.id)}
              style={({ pressed }) => [
                styles.row,
                !isLast && styles.rowDivider,
                usingDeviceLocale && styles.rowDisabled,
                pressed && !usingDeviceLocale && styles.pressed,
              ]}
              testID={`mobile-language-option-${option.id}`}
            >
              <View style={[styles.languageBadge, isSelected && styles.languageBadgeSelected]}>
                <Text
                  style={[
                    styles.languageBadgeLabel,
                    isSelected && styles.languageBadgeLabelSelected,
                  ]}
                >
                  {option.code}
                </Text>
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.languageName, isSelected && styles.languageNameSelected]}>
                  {option.nativeName}
                </Text>
                <Text style={styles.languageTranslatedName}>
                  {getMobileLanguageTranslatedName(locale, option)}
                </Text>
              </View>
              <View style={[styles.radio, isSelected && styles.radioSelected]}>
                {isSelected ? (
                  <Ionicons color={theme.text.onPrimary} name="checkmark" size={14} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionHeading}>{copy.languageSettingsDeviceHeading}</Text>
      <View style={styles.card}>
        <View style={styles.row} testID="mobile-language-device-row">
          <View style={[styles.iconBox, styles.iconBoxIndigo]}>
            <Ionicons color={theme.accent.default} name="phone-portrait-outline" size={17} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{copy.languageSettingsUseDeviceLanguage}</Text>
            <Text style={styles.rowHint}>
              {usingDeviceLocale
                ? copy.languageSettingsDeviceLocked
                : copy.languageSettingsUseDeviceLanguageHint}
            </Text>
          </View>
          <Toggle
            accessibilityLabel={copy.languageSettingsUseDeviceLanguage}
            onValueChange={handleToggleDeviceLanguage}
            testID="mobile-language-device-toggle"
            value={usingDeviceLocale}
          />
        </View>
      </View>

      <Text style={styles.sectionHeading}>{copy.languageSettingsFormatHeading}</Text>
      <View style={styles.card}>
        <InfoRow
          icon="calendar-outline"
          label={copy.languageSettingsFormatDate}
          testID="mobile-language-format-date"
          value={formatPreview.date}
        />
        <InfoRow
          icon="time-outline"
          label={copy.languageSettingsFormatTime}
          testID="mobile-language-format-time"
          value={formatPreview.time}
        />
        <InfoRow
          icon="calculator-outline"
          isLast
          label={copy.languageSettingsFormatNumber}
          testID="mobile-language-format-number"
          value={formatPreview.number}
        />
      </View>

      <Text style={styles.sectionHeading}>{copy.languageSettingsSoonHeading}</Text>
      <View style={styles.card}>
        <SoonRow
          hint={copy.languageSettingsTranslateMessagesHint}
          icon="language-outline"
          label={copy.languageSettingsTranslateMessages}
          soonLabel={copy.languageSettingsSoon}
          testID="mobile-language-translate-messages"
        />
        <SoonRow
          hint={copy.languageSettingsTimeZoneHint}
          icon="globe-outline"
          isLast
          label={copy.languageSettingsTimeZone}
          soonLabel={copy.languageSettingsSoon}
          testID="mobile-language-time-zone"
        />
      </View>

      <View style={styles.infoNote}>
        <Ionicons color={theme.accent.strong} name="information-circle-outline" size={17} />
        <Text style={styles.infoNoteText}>{copy.languageSettingsNote}</Text>
      </View>
    </ScrollView>
  );
}
