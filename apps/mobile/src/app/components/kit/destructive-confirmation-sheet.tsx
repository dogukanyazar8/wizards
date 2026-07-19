import { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

import type { MobileTheme } from "../../../design/themes";
import { activeMobileCopy as copy } from "../../../locale/mobile-locale-preferences";
import { useThemedStyles } from "../../providers/mobile-theme-provider";
import { BottomSheet } from "./bottom-sheet";
import { Button } from "./button";

export interface DestructiveConfirmationSheetProps {
  body: string;
  busy: boolean;
  confirmLabel: string;
  open: boolean;
  requiredText?: string;
  snapPoint?: number;
  testID: string;
  title: string;
  onCancel(): void;
  onConfirm(): void | Promise<void>;
}

const createStyles = (theme: MobileTheme) => ({
  actions: { gap: 10 },
  body: { ...theme.typography.body, color: theme.text.muted },
  error: { ...theme.typography.caption, color: theme.status.danger },
  input: {
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    color: theme.text.primary,
    minHeight: theme.sizing.minTouchTarget,
    paddingHorizontal: 14,
  },
  root: { gap: 14, paddingBottom: 8 },
  status: { ...theme.typography.caption, color: theme.text.muted },
  title: { ...theme.typography.title, color: theme.text.primary },
});

export function DestructiveConfirmationSheet({
  body,
  busy,
  confirmLabel,
  onCancel,
  onConfirm,
  open,
  requiredText,
  snapPoint,
  testID,
  title,
}: DestructiveConfirmationSheetProps) {
  const styles = useThemedStyles(createStyles);
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
      {...(snapPoint !== undefined ? { snapPoint } : {})}
      testID={testID}
    >
      <View style={styles.root}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
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
        <Text accessibilityLiveRegion="polite" style={styles.status} testID={`${testID}-status`}>
          {isBusy ? copy.confirmationWorking : ""}
        </Text>
        {error ? (
          <Text accessibilityLiveRegion="polite" style={styles.error} testID={`${testID}-error`}>
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            disabled={isBusy}
            label={copy.confirmationCancelAction}
            onPress={onCancel}
            testID={`${testID}-cancel`}
            variant="secondary"
          />
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
    </BottomSheet>
  );
}
