import type Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import type { MobileTheme } from "../../../../design/themes";
import { useTheme, useThemedStyles } from "../../../providers/mobile-theme-provider";
import { Icon } from "../icon";

export type AuthButtonVariant = "form" | "reset" | "welcome";

export interface AuthPrimaryButtonProps {
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly gradient?: boolean;
  readonly iconName?: ComponentProps<typeof Ionicons>["name"];
  readonly label: string;
  readonly onPress: NonNullable<ComponentProps<typeof Pressable>["onPress"]>;
  readonly testID?: string;
  readonly variant?: AuthButtonVariant;
}

const createStyles = (theme: MobileTheme) => ({
  disabled: {
    opacity: theme.layout.opacity.disabled,
  },
  form: {
    borderRadius: theme.layout.auth.formCtaRadius,
    height: theme.layout.auth.formCtaHeight,
  },
  label: {
    color: theme.text.onPrimary,
    textAlign: "center" as const,
  },
  labelForm: theme.typography.authCta,
  labelReset: theme.typography.authResetCta,
  labelWelcome: theme.typography.authWelcomeCta,
  root: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: theme.layout.auth.ctaContentGap,
    justifyContent: "center" as const,
    minWidth: 0,
    ...theme.elevation.authPrimaryAction,
  },
  fill: {
    alignItems: "center" as const,
    flex: 1,
    flexDirection: "row" as const,
    gap: theme.layout.auth.ctaContentGap,
    justifyContent: "center" as const,
    overflow: "hidden" as const,
  },
  fillForm: {
    borderRadius: theme.layout.auth.formCtaRadius,
    height: theme.layout.auth.formCtaHeight,
  },
  fillWelcome: {
    borderRadius: theme.layout.auth.ctaRadius,
    height: theme.layout.auth.ctaHeight,
  },
  solid: {
    backgroundColor: theme.accent.action,
  },
  welcome: {
    borderRadius: theme.layout.auth.ctaRadius,
    height: theme.layout.auth.ctaHeight,
  },
});

export function AuthPrimaryButton({
  busy = false,
  disabled = false,
  gradient = true,
  iconName,
  label,
  onPress,
  testID,
  variant = "form",
}: AuthPrimaryButtonProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const isDisabled = busy || disabled;
  const labelStyle =
    variant === "welcome"
      ? styles.labelWelcome
      : variant === "reset"
        ? styles.labelReset
        : styles.labelForm;
  const rootStyle = [styles.root, variant === "welcome" ? styles.welcome : styles.form];
  const fillStyle = [
    styles.fill,
    variant === "welcome" ? styles.fillWelcome : styles.fillForm,
  ];
  const iconSize =
    variant === "welcome"
      ? theme.layout.auth.welcomePrimaryActionIcon
      : theme.layout.auth.formPrimaryActionIcon;
  const gradientColors =
    isDisabled || variant === "reset"
      ? theme.gradients.authPrimaryActionMuted
      : theme.gradients.authPrimaryAction;
  const icon = iconName ? (
    <Icon
      accessibilityElementsHidden
      name={iconName}
      size={iconSize}
      testID={testID ? `${testID}-icon` : undefined}
      tone="inverse"
    />
  ) : null;
  const spinner = (
    <ActivityIndicator
      accessibilityElementsHidden
      color={theme.text.onPrimary}
      size="small"
      testID={testID ? `${testID}-spinner` : undefined}
    />
  );
  const content = (
    <>
      {busy ? spinner : variant === "welcome" ? null : icon}
      <Text maxFontSizeMultiplier={2} numberOfLines={1} style={[styles.label, labelStyle]}>
        {label}
      </Text>
      {!busy && variant === "welcome" ? icon : null}
    </>
  );

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={(event) => {
        if (!isDisabled) {
          onPress(event);
        }
      }}
      style={({ pressed }) => [
        rootStyle,
        !gradient && styles.solid,
        isDisabled && styles.disabled,
        pressed && !isDisabled && { opacity: theme.layout.opacity.pressed },
      ]}
      testID={testID}
    >
      {gradient ? (
        <LinearGradient
          colors={gradientColors}
          style={fillStyle}
          testID={testID ? `${testID}-gradient` : undefined}
        >
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Pressable>
  );
}
