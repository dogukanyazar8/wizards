import { Text, View } from "react-native";

import type { MobileTheme } from "../../../../design/themes";
import { useThemedStyles } from "../../../providers/mobile-theme-provider";

export interface AuthEyebrowHeaderProps {
  readonly eyebrow?: string;
  readonly subtitle?: string;
  readonly testID?: string;
  readonly title: string;
}

const createStyles = (theme: MobileTheme) => ({
  eyebrow: {
    ...theme.typography.authEyebrow,
    color: theme.accent.strong,
    textAlign: "center" as const,
    textTransform: "uppercase" as const,
  },
  root: {
    alignItems: "center" as const,
    gap: theme.layout.spacing.tight,
    minWidth: 0,
  },
  subtitle: {
    ...theme.typography.authSubtitle,
    color: theme.text.muted,
    textAlign: "center" as const,
  },
  title: {
    ...theme.typography.authTitle,
    color: theme.text.primary,
    textAlign: "center" as const,
  },
});

export function AuthEyebrowHeader({ eyebrow, subtitle, testID, title }: AuthEyebrowHeaderProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.root} testID={testID}>
      {eyebrow ? (
        <Text maxFontSizeMultiplier={2} style={styles.eyebrow}>
          {eyebrow}
        </Text>
      ) : null}
      <Text accessibilityRole="header" maxFontSizeMultiplier={2} style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text maxFontSizeMultiplier={2} style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
