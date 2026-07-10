import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Pressable, type PressableProps } from "react-native";
import { useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";
import { Icon, type IconTone } from "./icon";

export interface IconButtonProps extends Omit<PressableProps, "children"> {
  accessibilityLabel: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  size?: "sm" | "md";
  tone?: IconTone;
}

const createStyles = (theme: MobileTheme) => ({
  root: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.soft,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    justifyContent: "center" as const,
    minHeight: theme.sizing.minTouchTarget,
    minWidth: theme.sizing.minTouchTarget,
  },
  medium: {
    height: 48,
    width: 48,
  },
  small: {
    height: theme.sizing.minTouchTarget,
    width: theme.sizing.minTouchTarget,
  },
  disabled: { opacity: 0.48 },
  pressed: {
    backgroundColor: theme.surface.overlay,
    transform: [{ scale: 0.96 }],
  },
});

export function IconButton({
  accessibilityLabel,
  accessibilityState,
  disabled = false,
  icon,
  size = "md",
  style,
  tone = "primary",
  ...props
}: IconButtonProps) {
  const styles = useThemedStyles(createStyles);
  const isDisabled = disabled === true;

  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled: isDisabled }}
      disabled={isDisabled}
      style={(state) => [
        styles.root,
        size === "sm" ? styles.small : styles.medium,
        isDisabled && styles.disabled,
        state.pressed && !isDisabled && styles.pressed,
        typeof style === "function" ? style(state) : style,
      ]}
    >
      <Icon
        accessibilityElementsHidden
        importantForAccessibility="no"
        name={icon}
        size={size === "sm" ? 18 : 21}
        tone={tone}
      />
    </Pressable>
  );
}
