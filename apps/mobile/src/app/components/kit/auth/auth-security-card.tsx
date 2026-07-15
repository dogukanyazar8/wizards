import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";

import type { MobileTheme } from "../../../../design/themes";
import { activeMobileCopy } from "../../../../locale/mobile-locale-preferences";
import { useTheme, useThemedStyles } from "../../../providers/mobile-theme-provider";

export interface AuthSecurityCardProps {
  readonly description?: string;
  readonly testID?: string;
  readonly title?: string;
}

const createStyles = (theme: MobileTheme) => ({
  badge: {
    alignItems: "center" as const,
    gap: theme.layout.spacing.micro,
    justifyContent: "center" as const,
    minWidth: theme.sizing.minTouchTarget,
  },
  badgeText: {
    ...theme.typography.authEyebrow,
    color: theme.text.primary,
  },
  description: {
    ...theme.typography.authSubtitle,
    color: theme.text.muted,
  },
  icon: {
    alignItems: "center" as const,
    backgroundColor: theme.status.successSoft,
    borderRadius: theme.radii.pill,
    height: theme.sizing.minTouchTarget,
    justifyContent: "center" as const,
    width: theme.sizing.minTouchTarget,
  },
  root: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.layout.auth.fieldRadius,
    borderWidth: theme.layout.border.hairline,
    flexDirection: "row" as const,
    gap: theme.spacing.row,
    minWidth: 0,
    padding: theme.spacing.section,
  },
  text: { flex: 1, gap: theme.layout.spacing.micro, minWidth: 0 },
  title: {
    ...theme.typography.authFieldLabel,
    color: theme.text.primary,
  },
});

export function AuthSecurityCard({ description, testID, title }: AuthSecurityCardProps) {
  const copy = activeMobileCopy;
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.icon}>
        <Ionicons
          accessibilityElementsHidden
          color={theme.status.successText}
          importantForAccessibility="no"
          name="shield-checkmark"
          size={theme.layout.auth.securityShieldIcon}
          testID={testID ? `${testID}-shield-icon` : undefined}
        />
      </View>
      <View style={styles.text}>
        <Text maxFontSizeMultiplier={2} style={styles.title}>
          {title ?? copy.authSecurityStatus}
        </Text>
        <Text maxFontSizeMultiplier={2} style={styles.description}>
          {description ?? copy.authSecurityDescription}
        </Text>
      </View>
      <View style={styles.badge}>
        <Ionicons
          accessibilityElementsHidden
          color={theme.status.warning}
          importantForAccessibility="no"
          name="lock-closed"
          size={theme.layout.auth.securityBadgeIcon}
          testID={testID ? `${testID}-badge-icon` : undefined}
        />
        <Text style={styles.badgeText}>{copy.authSecurityBadge}</Text>
      </View>
    </View>
  );
}
