import { Text, View, type ViewProps } from "react-native";
import { useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";

export type BadgeTone = "accent" | "danger" | "neutral" | "success" | "warning";

export interface BadgeProps extends ViewProps {
  readonly label: string;
  readonly tone?: BadgeTone;
}

const createStyles = (theme: MobileTheme) => ({
  root: {
    alignItems: "center" as const,
    alignSelf: "flex-start" as const,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    minHeight: 24,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  accent: { backgroundColor: theme.accent.soft, borderColor: theme.accent.default },
  danger: { backgroundColor: theme.status.dangerSoft, borderColor: theme.status.danger },
  neutral: { backgroundColor: theme.surface.soft, borderColor: theme.border.subtle },
  success: { backgroundColor: theme.surface.soft, borderColor: theme.status.success },
  warning: { backgroundColor: theme.surface.soft, borderColor: theme.status.warning },
  label: { ...theme.typography.caption, color: theme.text.secondary },
  accentLabel: { color: theme.accent.strong },
  dangerLabel: { color: theme.status.onStatus },
  successLabel: { color: theme.status.successText },
  warningLabel: { color: theme.status.warning },
});

export function Badge({ label, style, tone = "neutral", ...props }: BadgeProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <View
      {...props}
      accessibilityLabel={props.accessibilityLabel ?? label}
      style={[styles.root, styles[tone], style]}
    >
      <Text
        maxFontSizeMultiplier={2}
        numberOfLines={1}
        style={[
          styles.label,
          tone === "accent" && styles.accentLabel,
          tone === "danger" && styles.dangerLabel,
          tone === "success" && styles.successLabel,
          tone === "warning" && styles.warningLabel,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
