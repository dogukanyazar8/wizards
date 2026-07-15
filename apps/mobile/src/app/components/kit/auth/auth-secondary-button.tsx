import type Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Pressable, Text } from "react-native";

import type { MobileTheme } from "../../../../design/themes";
import { useTheme, useThemedStyles } from "../../../providers/mobile-theme-provider";
import { Icon } from "../icon";
import type { AuthButtonVariant } from "./auth-primary-button";

export interface AuthSecondaryButtonProps {
  readonly disabled?: boolean;
  readonly iconName?: ComponentProps<typeof Ionicons>["name"];
  readonly label: string;
  readonly onPress: NonNullable<ComponentProps<typeof Pressable>["onPress"]>;
  readonly testID?: string;
  readonly variant?: AuthButtonVariant;
}

const createStyles = (theme: MobileTheme) => ({
  disabled: { opacity: theme.layout.opacity.disabled },
  form: {
    borderRadius: theme.layout.auth.formCtaRadius,
    height: theme.layout.auth.formCtaHeight,
  },
  label: {
    color: theme.text.primary,
    textAlign: "center" as const,
  },
  labelForm: theme.typography.authCta,
  labelReset: theme.typography.authResetCta,
  labelWelcome: theme.typography.authWelcomeCta,
  root: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderWidth: theme.layout.border.hairline,
    flexDirection: "row" as const,
    gap: theme.layout.auth.ctaContentGap,
    justifyContent: "center" as const,
    minWidth: 0,
  },
  welcome: {
    borderRadius: theme.layout.auth.ctaRadius,
    height: theme.layout.auth.ctaHeight,
  },
});

export function AuthSecondaryButton({
  disabled = false,
  iconName,
  label,
  onPress,
  testID,
  variant = "form",
}: AuthSecondaryButtonProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const labelStyle =
    variant === "welcome"
      ? styles.labelWelcome
      : variant === "reset"
        ? styles.labelReset
        : styles.labelForm;
  const iconSize =
    variant === "welcome"
      ? theme.layout.auth.welcomeSecondaryActionIcon
      : theme.layout.auth.formPrimaryActionIcon;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={(event) => {
        if (!disabled) {
          onPress(event);
        }
      }}
      style={({ pressed }) => [
        styles.root,
        variant === "welcome" ? styles.welcome : styles.form,
        disabled && styles.disabled,
        pressed && !disabled && { backgroundColor: theme.surface.overlay },
      ]}
      testID={testID}
    >
      {iconName ? (
        <Icon
          accessibilityElementsHidden
          name={iconName}
          size={iconSize}
          testID={testID ? `${testID}-icon` : undefined}
          tone="primary"
        />
      ) : null}
      <Text maxFontSizeMultiplier={2} numberOfLines={1} style={[styles.label, labelStyle]}>
        {label}
      </Text>
    </Pressable>
  );
}
