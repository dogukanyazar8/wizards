import { Pressable, Text, View } from "react-native";

import { BottomSheet, useSheetPresentation } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { mobileCopy } from "../locale/mobile-copy";
import { useMobileProfileSheetStyles } from "../social/mobile-profile-sheets.styles";
import { useMobileFeedbackStyles } from "./mobile-feedback-screen.styles";

export const MOBILE_FEEDBACK_DIAGNOSTICS_SHEET_TEST_ID = "mobile-feedback-diagnostics-sheet";

/**
 * "Neler gönderilir?" — the list here and the payload
 * `buildMobileFeedbackDiagnostics` sends are the same six fields. If one
 * changes the other has to, which is the whole point of showing it.
 */
export function MobileFeedbackDiagnosticsSheet({
  onClose,
  open,
}: {
  onClose(): void;
  readonly open: boolean;
}) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const sheetStyles = useMobileProfileSheetStyles();
  const styles = useMobileFeedbackStyles();
  const theme = useTheme();
  const presentation = useSheetPresentation();

  const fields = [
    copy.feedbackDiagnosticsFieldApp,
    copy.feedbackDiagnosticsFieldDevice,
    copy.feedbackDiagnosticsFieldOs,
    copy.feedbackDiagnosticsFieldLocale,
    copy.feedbackDiagnosticsFieldTheme,
    copy.feedbackDiagnosticsFieldFaults,
  ];

  return (
    <BottomSheet
      accessibilityLabel={copy.feedbackDiagnosticsSheetTitle}
      onClose={onClose}
      open={open}
      presentation={{
        contentStyle: sheetStyles.content,
        handleAreaStyle: sheetStyles.handleArea,
        handleStyle: sheetStyles.handle,
        panelStyle: [presentation.panelStyle, sheetStyles.panel],
      }}
      sizing="content"
      testID={MOBILE_FEEDBACK_DIAGNOSTICS_SHEET_TEST_ID}
    >
      <View style={styles.sheetList}>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          {copy.feedbackDiagnosticsSheetTitle}
        </Text>
        <Text style={styles.sheetNote}>{copy.feedbackDiagnosticsSheetDescription}</Text>
        {fields.map((field) => (
          <View key={field} style={styles.sheetRow}>
            <MobileLineIcon color={theme.status.successText} name="check" size={14} />
            <Text style={styles.sheetRowLabel}>{field}</Text>
          </View>
        ))}
        <Text style={styles.sheetNote}>{copy.feedbackDiagnosticsSheetNote}</Text>
        <Pressable
          accessibilityLabel={copy.feedbackDiagnosticsSheetClose}
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
          testID={`${MOBILE_FEEDBACK_DIAGNOSTICS_SHEET_TEST_ID}-close`}
        >
          <Text style={styles.primaryActionLabel}>{copy.feedbackDiagnosticsSheetClose}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
