import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { useTheme } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";

export type IconTone = "accent" | "danger" | "inverse" | "muted" | "primary" | "secondary";

export interface IconProps extends Omit<ComponentProps<typeof Ionicons>, "color" | "name" | "size"> {
  readonly name: ComponentProps<typeof Ionicons>["name"];
  readonly size?: number;
  readonly tone?: IconTone;
}

function getIconColor(theme: MobileTheme, tone: IconTone): string {
  switch (tone) {
    case "accent":
      return theme.accent.default;
    case "danger":
      return theme.status.danger;
    case "inverse":
      return theme.text.inverse;
    case "muted":
      return theme.text.muted;
    case "secondary":
      return theme.text.secondary;
    default:
      return theme.text.primary;
  }
}

export function Icon({ accessibilityLabel, size = 20, tone = "primary", ...props }: IconProps) {
  const theme = useTheme();
  const isAccessible = Boolean(accessibilityLabel);

  return (
    <Ionicons
      {...props}
      accessibilityLabel={accessibilityLabel}
      accessible={isAccessible}
      color={getIconColor(theme, tone)}
      importantForAccessibility={isAccessible ? "yes" : "no"}
      size={size}
    />
  );
}
