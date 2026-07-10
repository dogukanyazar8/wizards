import { View, type ViewProps } from "react-native";
import { useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";

export interface CardProps extends ViewProps {
  readonly padding?: "none" | "sm" | "md";
  readonly variant?: "default" | "elevated" | "soft";
}

const createStyles = (theme: MobileTheme) => ({
  root: {
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.card,
    borderWidth: 1,
  },
  default: {
    backgroundColor: theme.surface.card,
    ...theme.elevation.card,
  },
  elevated: {
    backgroundColor: theme.surface.elevated,
    ...theme.elevation.floating,
  },
  soft: { backgroundColor: theme.surface.soft },
  paddingNone: { padding: 0 },
  paddingSmall: { padding: theme.spacing.row },
  paddingMedium: { padding: theme.spacing.section },
});

export function Card({ padding = "md", style, variant = "default", ...props }: CardProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <View
      {...props}
      style={[
        styles.root,
        styles[variant],
        padding === "none"
          ? styles.paddingNone
          : padding === "sm"
            ? styles.paddingSmall
            : styles.paddingMedium,
        style,
      ]}
    />
  );
}
