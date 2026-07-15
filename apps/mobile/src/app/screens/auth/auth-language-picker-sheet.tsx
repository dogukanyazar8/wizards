import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/kit/bottom-sheet";
import { Icon } from "../../components/kit/icon";
import { useMobileHaptics } from "../../providers/mobile-haptics-provider";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import {
  MOBILE_LOCALE_OPTIONS,
  type MobileLocale,
  type MobileLocaleOption,
} from "../../../locale/mobile-locale-preferences";
import { mobileCopy } from "../../../locale/mobile-copy";
import { createAuthLanguagePickerSheetStyles } from "./auth-language-picker-sheet.styles";

export interface AuthLanguagePickerSheetProps {
  readonly locale: MobileLocale;
  readonly onClose: () => void;
  readonly onSelectLocale: (locale: MobileLocale) => void;
  readonly onSetUseDeviceLocale: (enabled: boolean) => void;
  readonly open: boolean;
  readonly usingDeviceLocale: boolean;
}

const AUTO_CLOSE_DELAY_MS = 250;
const SHOW_LANGUAGE_SEARCH = MOBILE_LOCALE_OPTIONS.length > 6;
const LANGUAGE_SHEET_COMPACT_HEIGHT = 360;
const LANGUAGE_SHEET_SEARCHABLE_HEIGHT = 520;

function normalizeSearchTerm(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

export function AuthLanguagePickerSheet({
  locale,
  onClose,
  onSelectLocale,
  onSetUseDeviceLocale,
  open,
  usingDeviceLocale,
}: AuthLanguagePickerSheetProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createAuthLanguagePickerSheetStyles);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const haptics = useMobileHaptics();
  const copy = mobileCopy[locale];
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState("");
  const requestedSheetHeight = SHOW_LANGUAGE_SEARCH
    ? LANGUAGE_SHEET_SEARCHABLE_HEIGHT
    : LANGUAGE_SHEET_COMPACT_HEIGHT;
  const sheetHeight = Math.max(240, Math.min(requestedSheetHeight, windowHeight - insets.top - 16));
  const languageOptions = useMemo<readonly MobileLocaleOption[]>(
    () => [...MOBILE_LOCALE_OPTIONS].sort((left, right) => left.nativeName.localeCompare(right.nativeName, "tr")),
    [],
  );
  const visibleLanguageOptions = useMemo(() => {
    if (!SHOW_LANGUAGE_SEARCH || query.trim().length === 0) {
      return languageOptions;
    }

    const normalizedQuery = normalizeSearchTerm(query);
    return languageOptions.filter((option) =>
      [option.code, option.nativeName, option.turkishName].some((value) =>
        value.toLocaleLowerCase("tr-TR").includes(normalizedQuery),
      ),
    );
  }, [languageOptions, query]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  useEffect(() => {
    if (!open) {
      clearCloseTimer();
    }
  }, [clearCloseTimer, open]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, AUTO_CLOSE_DELAY_MS);
  }, [clearCloseTimer, onClose]);

  const handleSelectLanguage = useCallback(
    (nextLocale: MobileLocale) => {
      if (usingDeviceLocale) {
        return;
      }

      haptics.selection();
      onSelectLocale(nextLocale);
      scheduleClose();
    },
    [haptics, onSelectLocale, scheduleClose, usingDeviceLocale],
  );

  return (
    <BottomSheet
      accessibilityLabel={copy.authLanguagePickerTitle}
      onClose={onClose}
      open={open}
      presentation={{
        backdropBlurIntensity: 2,
        backdropStyle: { backgroundColor: theme.authLanguage.backdrop },
        contentStyle: { paddingHorizontal: 0 },
        handleAreaStyle: { paddingBottom: 14 },
        handleStyle: {
          backgroundColor: theme.authLanguage.handle,
          borderRadius: theme.layout.auth.languageSheet.handleRadius,
          height: theme.layout.auth.languageSheet.handleHeight,
          width: theme.layout.auth.languageSheet.handleWidth,
        },
        panelStyle: {
          backgroundColor: theme.surface.elevated,
          borderTopLeftRadius: theme.layout.auth.languageSheet.panelRadius,
          borderTopRightRadius: theme.layout.auth.languageSheet.panelRadius,
          borderWidth: 0,
          paddingBottom: 0,
        },
      }}
      snapPoint={sheetHeight}
      testID="mobile-auth-language-sheet"
    >
      <View style={styles.content}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: theme.layout.auth.languageSheet.contentPaddingBottom + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text maxFontSizeMultiplier={1.5} style={styles.title}>
                {copy.authLanguagePickerTitle}
              </Text>
              <Text maxFontSizeMultiplier={1.5} style={styles.subtitle}>
                {copy.authLanguagePickerSubtitle}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={copy.authLanguagePickerClose}
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={styles.closeButton}
              testID="mobile-auth-language-close"
            >
              <Icon accessibilityElementsHidden name="close" size={18} tone="secondary" />
            </Pressable>
          </View>

          {SHOW_LANGUAGE_SEARCH ? (
            <TextInput
              accessibilityLabel={copy.authLanguagePickerSearchPlaceholder}
              onChangeText={setQuery}
              placeholder={copy.authLanguagePickerSearchPlaceholder}
              placeholderTextColor={theme.text.placeholder}
              style={styles.searchInput}
              testID="mobile-auth-language-search"
              value={query}
            />
          ) : null}

          <View accessibilityRole="radiogroup" style={styles.languageList}>
            {visibleLanguageOptions.map((option) => {
              const rightToLeft = option.direction === "rtl";
              const selected = !usingDeviceLocale && option.id === locale;

              return (
                <Pressable
                  accessibilityLabel={`${option.nativeName}, ${option.turkishName}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: usingDeviceLocale }}
                  disabled={usingDeviceLocale}
                  key={option.id}
                  onPress={() => handleSelectLanguage(option.id)}
                  style={[
                    styles.languageRow,
                    rightToLeft && styles.languageRowRtl,
                    selected && styles.languageRowSelected,
                    usingDeviceLocale && styles.languageRowDisabled,
                  ]}
                  testID={`mobile-auth-language-option-${option.id}`}
                >
                  <View style={[styles.languageBadge, rightToLeft && styles.languageBadgeRtl]}>
                    <Text maxFontSizeMultiplier={1.2} style={styles.languageBadgeLabel}>
                      {option.code}
                    </Text>
                  </View>
                  <View style={[styles.languageCopy, rightToLeft && styles.languageCopyRtl]}>
                    <Text
                      maxFontSizeMultiplier={1.5}
                      style={[styles.languageNativeName, rightToLeft && styles.languageTextRtl]}
                    >
                      {option.nativeName}
                    </Text>
                    <Text
                      maxFontSizeMultiplier={1.5}
                      style={[styles.languageTurkishName, rightToLeft && styles.languageTextRtl]}
                    >
                      {option.turkishName}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radio,
                      rightToLeft && styles.radioRtl,
                      selected && styles.radioSelected,
                    ]}
                  >
                    {selected ? (
                      <Icon accessibilityElementsHidden name="checkmark" size={15} tone="inverse" />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.deviceRow}>
            <Text maxFontSizeMultiplier={1.5} style={styles.deviceRowLabel}>
              {copy.authLanguagePickerDeviceMode}
            </Text>
            <Pressable
              accessibilityLabel={copy.authLanguagePickerDeviceMode}
              accessibilityRole="switch"
              accessibilityState={{ checked: usingDeviceLocale }}
              hitSlop={8}
              onPress={() => onSetUseDeviceLocale(!usingDeviceLocale)}
              style={[styles.toggleTrack, usingDeviceLocale && styles.toggleTrackEnabled]}
              testID="mobile-auth-language-device-toggle"
            >
              <View style={[styles.toggleThumb, usingDeviceLocale && styles.toggleThumbEnabled]} />
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </BottomSheet>
  );
}
