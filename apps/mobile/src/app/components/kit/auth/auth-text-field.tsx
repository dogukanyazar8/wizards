import type Ionicons from "@expo/vector-icons/Ionicons";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { MobileTheme } from "../../../../design/themes";
import { activeMobileCopy } from "../../../../locale/mobile-locale-preferences";
import { useTheme, useThemedStyles } from "../../../providers/mobile-theme-provider";
import { Icon } from "../icon";

export interface AuthTextFieldProps
  extends Omit<ComponentProps<typeof TextInput>, "accessibilityLabel" | "style" | "testID"> {
  readonly errorMessage?: string;
  readonly iconName?: ComponentProps<typeof Ionicons>["name"];
  readonly iconSize?: "compact" | "full";
  readonly inputStyle?: ComponentProps<typeof TextInput>["style"];
  readonly label: string;
  /** Optional accessible control rendered alongside the field label. */
  readonly labelAccessory?: ReactNode;
  readonly testID?: string;
  readonly variant?: "form" | "register";
}

const createStyles = (theme: MobileTheme) => ({
  error: {
    ...theme.typography.authSubtitle,
    color: theme.status.dangerOnBase,
  },
  field: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.layout.auth.fieldRadius,
    borderWidth: theme.layout.border.hairline,
    flexDirection: "row" as const,
    gap: theme.layout.spacing.tightPlus,
    minHeight: theme.sizing.minTouchTarget,
    minWidth: 0,
    paddingHorizontal: theme.spacing.section,
  },
  fieldError: {
    borderColor: theme.status.danger,
    borderWidth: theme.layout.border.hairline,
  },
  fieldForm: { paddingVertical: theme.layout.auth.formInputPaddingVertical },
  fieldFocused: {
    borderColor: theme.border.focus,
  },
  fieldRegister: { paddingVertical: theme.layout.auth.inputPaddingVertical },
  fieldWrapper: { minWidth: 0, position: "relative" as const },
  focusRing: {
    borderColor: theme.border.focusRing,
    borderRadius: theme.layout.auth.fieldRadius + theme.layout.auth.focusRingRadius,
    borderWidth: theme.layout.auth.focusRingRadius,
    bottom: -theme.layout.auth.focusRingRadius,
    left: -theme.layout.auth.focusRingRadius,
    pointerEvents: "none" as const,
    position: "absolute" as const,
    right: -theme.layout.auth.focusRingRadius,
    top: -theme.layout.auth.focusRingRadius,
  },
  iconToggle: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginVertical: -theme.layout.auth.formInputPaddingVertical,
    minHeight: theme.sizing.minTouchTarget,
    minWidth: theme.sizing.minTouchTarget,
  },
  input: {
    ...theme.typography.authInput,
    color: theme.text.primary,
    flex: 1,
    minWidth: 0,
    padding: 0,
  },
  label: {
    ...theme.typography.authFieldLabel,
    color: theme.text.primary,
    flexShrink: 1,
  },
  labelRow: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: theme.layout.spacing.tightPlus,
    justifyContent: "space-between" as const,
    minWidth: 0,
  },
  root: {
    gap: theme.layout.auth.labelGap,
    minWidth: 0,
  },
});

export function AuthTextField({
  errorMessage,
  iconName,
  iconSize = "full",
  inputStyle,
  label,
  labelAccessory,
  onBlur,
  onFocus,
  secureTextEntry = false,
  testID,
  variant = "form",
  ...inputProps
}: AuthTextFieldProps) {
  const copy = activeMobileCopy;
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [focused, setFocused] = useState(false);
  const [secureVisible, setSecureVisible] = useState(false);
  const isProtected = secureTextEntry && !secureVisible;
  const inputIconSize =
    iconSize === "compact"
      ? theme.layout.auth.compactRegisterPasswordIcon
      : theme.layout.auth.fullInputIcon;
  const fieldStateStyle = errorMessage
    ? styles.fieldError
    : focused
      ? styles.fieldFocused
      : undefined;

  return (
    <View style={styles.root}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {labelAccessory}
      </View>
      <View style={styles.fieldWrapper}>
        {focused && !errorMessage ? (
          <View style={styles.focusRing} testID={testID ? `${testID}-focus-ring` : undefined} />
        ) : null}
        <View
          style={[
            styles.field,
            variant === "register" ? styles.fieldRegister : styles.fieldForm,
            fieldStateStyle,
          ]}
          testID={testID ? `${testID}-field` : undefined}
        >
          {iconName ? (
            <Icon
              accessibilityElementsHidden
              name={iconName}
              size={inputIconSize}
              testID={testID ? `${testID}-leading-icon` : undefined}
              tone="muted"
            />
          ) : null}
          <TextInput
            {...inputProps}
            accessibilityLabel={label}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            placeholderTextColor={theme.text.placeholder}
            secureTextEntry={isProtected}
            style={[styles.input, inputStyle]}
            testID={testID ? `${testID}-input` : undefined}
          />
          {secureTextEntry ? (
            <Pressable
              accessibilityLabel={secureVisible ? copy.hideSensitiveAction : copy.showSensitiveAction}
              accessibilityRole="button"
              onPress={() => setSecureVisible((current) => !current)}
              style={({ pressed }) => [
                styles.iconToggle,
                pressed && { opacity: theme.layout.opacity.pressed },
              ]}
            >
              <Icon
                accessibilityElementsHidden
                name={secureVisible ? "eye-off-outline" : "eye-outline"}
                size={inputIconSize}
                testID={testID ? `${testID}-trailing-icon` : undefined}
                tone="muted"
              />
            </Pressable>
          ) : null}
        </View>
      </View>
      {errorMessage ? (
        <Text accessibilityLiveRegion="polite" style={styles.error} testID={testID ? `${testID}-error` : undefined}>
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}
