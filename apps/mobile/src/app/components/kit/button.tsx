import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";
import { Icon } from "./icon";
import { useMobileHaptics } from "../../providers/mobile-haptics-provider";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";

export interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  readonly busy?: boolean;
  readonly fullWidth?: boolean;
  readonly icon?: ComponentProps<typeof Ionicons>["name"];
  readonly label: string;
  readonly variant?: ButtonVariant;
}

const createStyles = (theme: MobileTheme) => ({
  root: {
    alignItems: "center" as const,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 8,
    justifyContent: "center" as const,
    minHeight: theme.sizing.minTouchTarget,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  fullWidth: { width: "100%" as const },
  primary: {
    backgroundColor: theme.accent.action,
    borderColor: theme.accent.action,
  },
  secondary: {
    backgroundColor: theme.surface.elevated,
    borderColor: theme.border.subtle,
  },
  ghost: {
    backgroundColor: theme.surface.base,
    borderColor: theme.surface.base,
  },
  danger: {
    backgroundColor: theme.status.dangerAction,
    borderColor: theme.status.dangerAction,
  },
  success: {
    backgroundColor: theme.status.success,
    borderColor: theme.status.success,
  },
  disabled: {
    backgroundColor: theme.surface.soft,
    borderColor: theme.border.subtle,
    opacity: 0.72,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  label: {
    ...theme.typography.button,
    color: theme.text.primary,
    flexShrink: 1,
    textAlign: "center" as const,
  },
  labelOnColor: { color: theme.text.onPrimary },
  labelGhost: { color: theme.accent.strong },
  labelDisabled: { color: theme.text.soft },
});

export function Button({
  accessibilityLabel,
  accessibilityState,
  busy = false,
  disabled = false,
  fullWidth = false,
  icon,
  label,
  onPress,
  variant = "primary",
  ...props
}: ButtonProps) {
  const theme = useTheme();
  const haptics = useMobileHaptics();
  const styles = useThemedStyles(createStyles);
  const isDisabled = disabled === true || busy;
  const usesColorFill = variant === "primary" || variant === "danger" || variant === "success";
  const spinnerColor = usesColorFill ? theme.text.onPrimary : theme.accent.default;

  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, busy, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={(event) => {
        haptics.selection();
        onPress?.(event);
      }}
      style={({ pressed }) => [
        styles.root,
        styles[variant],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator accessibilityElementsHidden color={spinnerColor} size="small" />
      ) : icon ? (
        <Icon
          accessibilityElementsHidden
          importantForAccessibility="no"
          name={icon}
          size={18}
          tone={usesColorFill ? "inverse" : "accent"}
        />
      ) : null}
      <Text
        maxFontSizeMultiplier={2}
        numberOfLines={2}
        style={[
          styles.label,
          usesColorFill && styles.labelOnColor,
          variant === "ghost" && styles.labelGhost,
          isDisabled && styles.labelDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
