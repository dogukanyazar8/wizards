import { useRef } from "react";
import { Pressable, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";

import { mobileAuthMetrics, mobileAuthTypography } from "../../../../design/tokens";
import { useTheme, useThemedStyles } from "../../../providers/mobile-theme-provider";

/**
 * SPEC-GIRIS-KAYIT §4.2 ve §6/3 — altı kod hücresi.
 *
 * Hücreler **tek bir alan gibi davranır**: görünmez tek bir `TextInput` (`oneTimeCode`,
 * `number-pad`) gerçek girdiyi tutar, hücreler onun görsel karşılığıdır. Böylece iOS'un SMS
 * otomatik doldurması ve Android'in `sms-otp` ipucu çalışır.
 *
 * Altıncı hane girildiğinde form **otomatik gönderilmez**; düğme etkinleşir.
 */

export interface AuthCodeCellsProps {
  readonly accessibilityLabel: string;
  readonly autoFocus?: boolean;
  readonly editable?: boolean;
  readonly onChange: (value: string) => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
  readonly tone?: "danger";
  readonly value: string;
}

const createStyles = (theme: ReturnType<typeof useTheme>) => ({
  cell: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: mobileAuthMetrics.codeCellRadius,
    borderWidth: theme.layout.border.hairline,
    flex: 1,
    height: mobileAuthMetrics.codeCellHeight,
    justifyContent: "center" as const,
  },
  cellActive: {
    borderColor: theme.accent.strong,
    borderWidth: 1.5,
  },
  cellDanger: {
    backgroundColor: theme.status.dangerSoft,
    borderColor: theme.status.danger,
    borderWidth: 1.5,
  },
  digit: {
    ...mobileAuthTypography.codeDigit,
    color: theme.text.primary,
  },
  hiddenInput: {
    bottom: 0,
    left: 0,
    opacity: 0,
    position: "absolute" as const,
    right: 0,
    top: 0,
  },
  row: {
    flexDirection: "row" as const,
    gap: mobileAuthMetrics.codeCellGap,
  },
});

export function AuthCodeCells({
  accessibilityLabel,
  autoFocus = false,
  editable = true,
  onChange,
  style,
  testID,
  tone,
  value,
}: AuthCodeCellsProps) {
  const styles = useThemedStyles(createStyles);
  const inputRef = useRef<TextInput | null>(null);
  const digits = value.slice(0, mobileAuthMetrics.codeCellCount).split("");
  const activeIndex = Math.min(digits.length, mobileAuthMetrics.codeCellCount - 1);

  return (
    <View style={style}>
      <Pressable
        accessibilityRole="none"
        onPress={() => inputRef.current?.focus()}
        style={styles.row}
        testID={testID}
      >
        {Array.from({ length: mobileAuthMetrics.codeCellCount }, (_, index) => {
          const digit = digits[index];
          const isActive =
            editable && index === activeIndex && digits.length < mobileAuthMetrics.codeCellCount;

          return (
            <View
              key={index}
              style={[
                styles.cell,
                isActive ? styles.cellActive : null,
                tone === "danger" ? styles.cellDanger : null,
              ]}
            >
              <Text
                maxFontSizeMultiplier={2}
                style={styles.digit}
                testID={testID ? `${testID}-cell-${index}` : undefined}
              >
                {digit ?? ""}
              </Text>
            </View>
          );
        })}
      </Pressable>

      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoComplete="sms-otp"
        autoFocus={autoFocus}
        editable={editable}
        keyboardType="number-pad"
        maxLength={mobileAuthMetrics.codeCellCount}
        onChangeText={(next) =>
          onChange(next.replace(/\D/g, "").slice(0, mobileAuthMetrics.codeCellCount))
        }
        ref={inputRef}
        style={styles.hiddenInput}
        testID={testID ? `${testID}-input` : undefined}
        textContentType="oneTimeCode"
        value={value}
      />
    </View>
  );
}
