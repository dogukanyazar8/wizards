import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { BottomSheet, useSheetPresentation } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { mobileCopy } from "../locale/mobile-copy";
import { buildMobileFeedbackDiagnostics } from "./mobile-feedback-diagnostics";
import { useMobileFeedbackDiagnosticsSheetStyles } from "./mobile-feedback-diagnostics-sheet.styles";
import {
  MOBILE_FEEDBACK_DIAGNOSTICS_EXCLUSIONS,
  buildMobileFeedbackDiagnosticsRows,
  type MobileFeedbackDiagnosticsExclusionId,
} from "./mobile-feedback-model";

export const MOBILE_FEEDBACK_DIAGNOSTICS_SHEET_TEST_ID = "mobile-feedback-diagnostics-sheet";

type FeedbackCopy = (typeof mobileCopy)[keyof typeof mobileCopy];

function getExclusionCopy(copy: FeedbackCopy, id: MobileFeedbackDiagnosticsExclusionId) {
  switch (id) {
    case "identity":
      return {
        hint: copy.feedbackDiagnosticsExcludedIdentityHint,
        label: copy.feedbackDiagnosticsExcludedIdentity,
      };
    case "messages":
      return {
        hint: copy.feedbackDiagnosticsExcludedMessagesHint,
        label: copy.feedbackDiagnosticsExcludedMessages,
      };
    default:
      return {
        hint: copy.feedbackDiagnosticsExcludedSessionHint,
        label: copy.feedbackDiagnosticsExcludedSession,
      };
  }
}

/**
 * "Neler gönderilir?" — the consent sheet behind the 4a diagnostics toggle.
 *
 * It reads the payload the form would actually build and prints its real
 * values, so the answer is this device's model and this build's version rather
 * than a list someone wrote once. A static list is a promise that goes stale
 * the first time the diagnostics contract grows a field; reading the object
 * makes drift impossible.
 *
 * The second section is the half a field list cannot give: what is deliberately
 * left out. "Cihaz modeli, sürüm ve hata kayıtları" answers what is taken — the
 * question the user is really asking is what is safe.
 */
export function MobileFeedbackDiagnosticsSheet({
  appVersion,
  onClose,
  open,
}: {
  readonly appVersion: string;
  onClose(): void;
  readonly open: boolean;
}) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useMobileFeedbackDiagnosticsSheetStyles();
  const theme = useTheme();
  const presentation = useSheetPresentation();

  const rows = useMemo(() => {
    // Only while the sheet is up. It is built regardless of the toggle — the
    // sheet explains what *would* go, which is the decision the toggle asks the
    // user to make — but reading the device is not something a closed sheet
    // should be doing on every keystroke in the message field.
    if (!open) {
      return [];
    }

    const diagnostics = buildMobileFeedbackDiagnostics({ appVersion, locale, theme: theme.id });

    return buildMobileFeedbackDiagnosticsRows(diagnostics, {
      appVersion: copy.feedbackDiagnosticsFieldApp,
      device: copy.feedbackDiagnosticsFieldDevice,
      faults: copy.feedbackDiagnosticsFieldFaults,
      faultsCount: copy.feedbackDiagnosticsFaultsCount,
      faultsNone: copy.feedbackDiagnosticsFaultsNone,
      locale: copy.feedbackDiagnosticsFieldLocale,
      localeNames: {
        en: copy.feedbackDiagnosticsLocaleEn,
        tr: copy.feedbackDiagnosticsLocaleTr,
      },
      os: copy.feedbackDiagnosticsFieldOs,
      theme: copy.feedbackDiagnosticsFieldTheme,
      themeNames: {
        dark: copy.feedbackDiagnosticsThemeDark,
        light: copy.feedbackDiagnosticsThemeLight,
      },
      unknown: copy.feedbackDiagnosticsUnknown,
    });
  }, [appVersion, copy, locale, open, theme.id]);

  return (
    <BottomSheet
      accessibilityLabel={copy.feedbackDiagnosticsSheetTitle}
      onClose={onClose}
      open={open}
      presentation={{
        contentStyle: styles.content,
        handleAreaStyle: styles.handleArea,
        handleStyle: styles.handle,
        panelStyle: [presentation.panelStyle, styles.panel],
      }}
      sizing="content"
      testID={MOBILE_FEEDBACK_DIAGNOSTICS_SHEET_TEST_ID}
    >
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          {copy.feedbackDiagnosticsSheetTitle}
        </Text>
        <Text style={styles.description}>{copy.feedbackDiagnosticsSheetDescription}</Text>
      </View>

      <Text style={styles.sectionLabel}>{copy.feedbackDiagnosticsIncludedLabel}</Text>
      <View style={styles.rows}>
        {rows.map((row) => (
          <View
            key={row.id}
            style={styles.row}
            testID={`${MOBILE_FEEDBACK_DIAGNOSTICS_SHEET_TEST_ID}-included-${row.id}`}
          >
            <View style={styles.tile}>
              <MobileLineIcon color={theme.accent.default} name={row.icon} size={16} />
            </View>
            <View style={styles.rowText}>
              <Text numberOfLines={1} style={styles.label}>
                {row.label}
              </Text>
              <Text numberOfLines={1} style={styles.value}>
                {row.value}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>{copy.feedbackDiagnosticsExcludedLabel}</Text>
      <View style={styles.rows}>
        {MOBILE_FEEDBACK_DIAGNOSTICS_EXCLUSIONS.map((exclusion) => {
          const { hint, label } = getExclusionCopy(copy, exclusion.id);

          return (
            <View
              key={exclusion.id}
              style={styles.row}
              testID={`${MOBILE_FEEDBACK_DIAGNOSTICS_SHEET_TEST_ID}-excluded-${exclusion.id}`}
            >
              <View style={[styles.tile, styles.tileExcluded]}>
                <MobileLineIcon
                  color={theme.text.visualPlaceholder}
                  name={exclusion.icon}
                  size={16}
                />
              </View>
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={[styles.label, styles.labelExcluded]}>
                  {label}
                </Text>
                <Text numberOfLines={1} style={styles.hint}>
                  {hint}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.note}>
        <MobileLineIcon color={theme.profileSheet.hint} name="lock" size={13} />
        <Text style={styles.noteText}>{copy.feedbackDiagnosticsSheetNote}</Text>
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityLabel={copy.feedbackDiagnosticsSheetClose}
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.closeAction, pressed && styles.pressed]}
          testID={`${MOBILE_FEEDBACK_DIAGNOSTICS_SHEET_TEST_ID}-close`}
        >
          <Text style={styles.closeLabel}>{copy.feedbackDiagnosticsSheetClose}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
