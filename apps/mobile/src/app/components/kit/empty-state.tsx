import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import { Text, View, type ViewProps } from "react-native";
import { useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";
import { Icon } from "./icon";

export interface EmptyStateProps extends ViewProps {
  readonly action?: ReactNode;
  readonly description?: string;
  readonly icon?: ComponentProps<typeof Ionicons>["name"];
  readonly title: string;
}

const createStyles = (theme: MobileTheme) => ({
  root: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.soft,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.card,
    borderWidth: 1,
    padding: 24,
  },
  icon: {
    alignItems: "center" as const,
    backgroundColor: theme.accent.soft,
    borderRadius: theme.radii.pill,
    height: 48,
    justifyContent: "center" as const,
    marginBottom: 12,
    width: 48,
  },
  title: { ...theme.typography.title, color: theme.text.primary, textAlign: "center" as const },
  description: {
    ...theme.typography.body,
    color: theme.text.muted,
    marginTop: 6,
    maxWidth: 360,
    textAlign: "center" as const,
  },
  action: { marginTop: theme.spacing.section },
});

export function EmptyState({
  action,
  description,
  icon = "sparkles-outline",
  style,
  title,
  ...props
}: EmptyStateProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <View {...props} style={[styles.root, style]}>
      <View style={styles.icon}>
        <Icon
          accessibilityElementsHidden
          importantForAccessibility="no"
          name={icon}
          size={24}
          tone="accent"
        />
      </View>
      <Text accessibilityRole="header" maxFontSizeMultiplier={2} style={styles.title}>
        {title}
      </Text>
      {description ? (
        <Text maxFontSizeMultiplier={2} style={styles.description}>
          {description}
        </Text>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}
