import { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

import type { MobileTheme } from "../../../design/themes";
import { activeMobileCopy as copy } from "../../../locale/mobile-locale-preferences";
import { useThemedStyles } from "../../providers/mobile-theme-provider";
import { BottomSheet } from "./bottom-sheet";
import { Button } from "./button";
import { SheetHeader, useSheetPresentation, type SheetIconName } from "./sheet-primitives";

export interface DestructiveConfirmationSheetProps {
  body: string;
  busy: boolean;
  confirmLabel: string;
  /** Overrides the default warning glyph when the action has a clearer symbol. */
  icon?: SheetIconName;
  open: boolean;
  requiredText?: string;
  testID: string;
  title: string;
  onCancel(): void;
  onConfirm(): void | Promise<void>;
}

const createStyles = (theme: MobileTheme) => ({
  actions: { flexDirection: "row" as const, gap: 10 },
  action: { flex: 1 },
  body: { ...theme.typography.body, color: theme.text.secondary },
  error: { ...theme.typography.caption, color: theme.status.dangerOnBase },
  /** Kept mounted for the live region, but out of layout while it has nothing to say. */
  feedbackHidden: { display: "none" as const },
  feedback: { gap: 4 },
  input: {
    ...theme.typography.body,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    color: theme.text.primary,
    minHeight: theme.sizing.minTouchTarget,
    paddingHorizontal: 14,
  },
  root: { gap: 14 },
  status: { ...theme.typography.caption, color: theme.text.muted },
});

export function DestructiveConfirmationSheet({
  body,
  busy,
  confirmLabel,
  icon = "alert-circle-outline",
  onCancel,
  onConfirm,
  open,
  requiredText,
  testID,
  title,
}: DestructiveConfirmationSheetProps) {
  const styles = useThemedStyles(createStyles);
  const presentation = useSheetPresentation();
  const pendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [value, setValue] = useState("");
  const isBusy = busy || submitting;
  const isRequiredTextValid = requiredText === undefined || value === requiredText;

  useEffect(() => {
    if (!open) {
      pendingRef.current = false;
      setError(null);
      setSubmitting(false);
      setValue("");
    }
  }, [open]);

  const handleConfirm = async () => {
    if (pendingRef.current || isBusy || !isRequiredTextValid) {
      return;
    }

    pendingRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm();
    } catch {
      setError(copy.confirmationError);
    } finally {
      pendingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      accessibilityLabel={title}
      onClose={onCancel}
      open={open}
      presentation={presentation}
      sizing="content"
      testID={testID}
    >
      <View style={styles.root}>
        <SheetHeader icon={icon} testID={`${testID}-header`} title={title} tone="danger" />
        <Text style={styles.body}>{body}</Text>
        {requiredText !== undefined ? (
          <TextInput
            accessibilityLabel={copy.confirmationTypeToConfirm.replace("{value}", requiredText)}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setValue}
            placeholder={requiredText}
            style={styles.input}
            testID={`${testID}-input`}
            value={value}
          />
        ) : null}
        <View style={isBusy || error ? styles.feedback : styles.feedbackHidden}>
          <Text accessibilityLiveRegion="polite" style={styles.status} testID={`${testID}-status`}>
            {isBusy ? copy.confirmationWorking : ""}
          </Text>
          {error ? (
            <Text accessibilityLiveRegion="polite" style={styles.error} testID={`${testID}-error`}>
              {error}
            </Text>
          ) : null}
        </View>
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              disabled={isBusy}
              label={copy.confirmationCancelAction}
              onPress={onCancel}
              testID={`${testID}-cancel`}
              variant="secondary"
            />
          </View>
          <View style={styles.action}>
            <Button
              busy={isBusy}
              disabled={!isRequiredTextValid}
              label={confirmLabel}
              onPress={() => void handleConfirm()}
              testID={`${testID}-confirm`}
              variant="danger"
            />
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}
