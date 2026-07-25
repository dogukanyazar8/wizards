import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import type { MobileTheme } from "../design/themes";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

/**
 * The 1d/1e create flow (channel, category) settled the visual language every
 * "make something new" sheet uses: an extrabold title block, icon-led option
 * cards, uppercase micro labels over accent-bordered fields, and one elevated
 * call to action. This module owns those pieces so a second create surface
 * cannot drift from the first one by re-typing its own paddings.
 */
export const createMobileCreateSheetStyles = (theme: MobileTheme) => ({
  titleBlock: { gap: 2, paddingBottom: 14, paddingTop: 4 },
  title: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 19,
  },
  subtitleText: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontSize: 12,
    minWidth: 0,
  },
  formHeader: {
    alignItems: "flex-start" as const,
    flexDirection: "row" as const,
    gap: 12,
    justifyContent: "space-between" as const,
    paddingBottom: 14,
    paddingTop: 4,
  },
  formHeaderText: { flex: 1, gap: 1, minWidth: 0 },
  formHeaderIcon: {
    alignItems: "center" as const,
    borderRadius: 14,
    height: 40,
    justifyContent: "center" as const,
    width: 40,
  },
  formClose: {
    alignItems: "center" as const,
    height: 30,
    justifyContent: "center" as const,
    width: 30,
  },
  optionColumn: { gap: 10 },
  optionCard: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.base,
    borderColor: theme.border.subtle,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 14,
    padding: 14,
  },
  optionIcon: {
    alignItems: "center" as const,
    borderRadius: 16,
    height: 46,
    justifyContent: "center" as const,
    width: 46,
  },
  optionCardText: { flex: 1, gap: 1, minWidth: 0 },
  optionTitle: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 15,
  },
  optionDescription: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
  },
  fieldBlock: { gap: 7, marginTop: 14 },
  fieldLabel: {
    color: theme.text.visualFaint,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
  },
  field: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.base,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: "row" as const,
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  fieldFocus: { borderColor: theme.accent.default },
  fieldError: { borderColor: theme.status.danger },
  fieldInput: {
    color: theme.text.primary,
    flex: 1,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 14.5,
    includeFontPadding: false,
    minWidth: 0,
    padding: 0,
  },
  fieldHint: { color: theme.text.visualPlaceholder, fontSize: 11 },
  errorText: {
    color: theme.status.dangerOnBase,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontSize: 11.5,
  },
  primaryCta: {
    alignItems: "center" as const,
    backgroundColor: theme.accent.action,
    borderRadius: 16,
    flexDirection: "row" as const,
    gap: 8,
    justifyContent: "center" as const,
    marginTop: 16,
    padding: 14,
    ...theme.elevation.primaryAction,
  },
  primaryCtaDisabled: { opacity: 0.5 },
  primaryCtaText: {
    color: theme.text.onPrimary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 14.5,
  },
  cancelButton: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.base,
    borderRadius: 15,
    justifyContent: "center" as const,
    marginTop: 14,
    padding: 13,
  },
  cancelButtonDisabled: { opacity: 0.5 },
  cancelText: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 14,
  },
  footerRow: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 6,
    justifyContent: "center" as const,
    marginTop: 12,
  },
  footerText: {
    color: theme.text.visualPlaceholder,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontSize: 11,
  },
  pressed: { opacity: 0.78 },
});

/** Sheet opening block: what this sheet makes, and where it makes it. */
export function MobileCreateSheetTitleBlock({
  subtitle,
  testID,
  title,
}: {
  readonly subtitle?: string;
  readonly testID?: string;
  readonly title: string;
}) {
  const styles = useThemedStyles(createMobileCreateSheetStyles);

  return (
    <View style={styles.titleBlock} {...(testID ? { testID } : {})}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text numberOfLines={2} style={styles.subtitleText}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** Form step header: same title metrics, plus a leading badge and a close tap. */
export function MobileCreateSheetFormHeader({
  closeAccessibilityLabel,
  icon,
  iconColor,
  iconSurface,
  onClose,
  subtitle,
  testID,
  title,
}: {
  readonly closeAccessibilityLabel: string;
  readonly icon?: IoniconName;
  readonly iconColor?: string;
  readonly iconSurface?: string;
  onClose(): void;
  readonly subtitle?: string;
  readonly testID: string;
  readonly title: string;
}) {
  const styles = useThemedStyles(createMobileCreateSheetStyles);
  const theme = useTheme();

  return (
    <View style={styles.formHeader} testID={testID}>
      {icon ? (
        <View
          style={[styles.formHeaderIcon, { backgroundColor: iconSurface ?? theme.accent.soft }]}
        >
          <Ionicons color={iconColor ?? theme.accent.default} name={icon} size={19} />
        </View>
      ) : null}
      <View style={styles.formHeaderText}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={styles.subtitleText}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityLabel={closeAccessibilityLabel}
        accessibilityRole="button"
        onPress={onClose}
        style={({ pressed }) => [styles.formClose, pressed && styles.pressed]}
        testID={`${testID}-close`}
      >
        <Ionicons color={theme.text.visualPlaceholder} name="close" size={18} />
      </Pressable>
    </View>
  );
}

/** Icon-led branch card: one tap picks which form the sheet moves to. */
export function MobileCreateSheetOptionCard({
  description,
  icon,
  iconSurface,
  onPress,
  testID,
  title,
}: {
  readonly description: string;
  readonly icon: ReactNode;
  readonly iconSurface: string;
  onPress(): void;
  readonly testID: string;
  readonly title: string;
}) {
  const styles = useThemedStyles(createMobileCreateSheetStyles);
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel={`${title}. ${description}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.optionCard, pressed && styles.pressed]}
      testID={testID}
    >
      <View style={[styles.optionIcon, { backgroundColor: iconSurface }]}>{icon}</View>
      <View style={styles.optionCardText}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDescription}>{description}</Text>
      </View>
      <Ionicons color={theme.text.visualPlaceholder} name="chevron-forward" size={15} />
    </Pressable>
  );
}

/** Uppercase label + accent-bordered input + one hint or one error, never both. */
export function MobileCreateSheetField({
  accessibilityLabel,
  autoCapitalize = "none",
  autoCorrect = false,
  error,
  errorTestID,
  hint,
  icon,
  label,
  maxLength,
  onChangeText,
  placeholder,
  testID,
  value,
}: {
  readonly accessibilityLabel: string;
  readonly autoCapitalize?: "none" | "sentences" | "words";
  readonly autoCorrect?: boolean;
  readonly error?: string | null;
  /** Callers with an existing flow contract keep their own error id. */
  readonly errorTestID?: string;
  readonly hint?: string;
  readonly icon: IoniconName;
  readonly label: string;
  readonly maxLength?: number;
  onChangeText(value: string): void;
  readonly placeholder: string;
  readonly testID: string;
  readonly value: string;
}) {
  const styles = useThemedStyles(createMobileCreateSheetStyles);
  const theme = useTheme();

  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.field, error ? styles.fieldError : styles.fieldFocus]}>
        <Ionicons color={theme.text.visualPlaceholder} name={icon} size={15} />
        <TextInput
          accessibilityLabel={accessibilityLabel}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          {...(maxLength === undefined ? {} : { maxLength })}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.text.visualPlaceholder}
          style={styles.fieldInput}
          testID={testID}
          value={value}
        />
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={styles.errorText}
          testID={errorTestID ?? `${testID}-error`}
        >
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** The single elevated commit action a create step ends on. */
export function MobileCreateSheetPrimaryCta({
  busy = false,
  disabled = false,
  icon,
  label,
  onPress,
  testID,
}: {
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly icon: IoniconName;
  readonly label: string;
  onPress(): void;
  readonly testID: string;
}) {
  const styles = useThemedStyles(createMobileCreateSheetStyles);
  const theme = useTheme();
  const isBlocked = disabled || busy;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: isBlocked }}
      disabled={isBlocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryCta,
        isBlocked && styles.primaryCtaDisabled,
        pressed && !isBlocked && styles.pressed,
      ]}
      testID={testID}
    >
      {busy ? (
        <ActivityIndicator color={theme.text.onPrimary} size="small" />
      ) : (
        <Ionicons color={theme.text.onPrimary} name={icon} size={15} />
      )}
      <Text style={styles.primaryCtaText}>{label}</Text>
    </Pressable>
  );
}

/** Quiet secondary exit that never competes with the primary action. */
export function MobileCreateSheetCancelButton({
  disabled = false,
  label,
  onPress,
  testID,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  onPress(): void;
  readonly testID: string;
}) {
  const styles = useThemedStyles(createMobileCreateSheetStyles);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cancelButton,
        disabled && styles.cancelButtonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
      testID={testID}
    >
      <Text style={styles.cancelText}>{label}</Text>
    </Pressable>
  );
}

/** Closing reassurance line: what stays changeable after this sheet. */
export function MobileCreateSheetFooterHint({
  testID,
  text,
}: {
  readonly testID?: string;
  readonly text: string;
}) {
  const styles = useThemedStyles(createMobileCreateSheetStyles);
  const theme = useTheme();

  return (
    <View style={styles.footerRow} {...(testID ? { testID } : {})}>
      <Ionicons color={theme.text.visualPlaceholder} name="information-circle-outline" size={12} />
      <Text style={styles.footerText}>{text}</Text>
    </View>
  );
}
