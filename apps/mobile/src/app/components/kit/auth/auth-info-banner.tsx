import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Text, View } from "react-native";

import type { MobileTheme } from "../../../../design/themes";
import { useTheme, useThemedStyles } from "../../../providers/mobile-theme-provider";

export interface AuthInfoBannerProps {
  readonly iconColor?: string;
  readonly iconName: ComponentProps<typeof Ionicons>["name"];
  readonly testID?: string;
  readonly text: string;
}

const createStyles = (theme: MobileTheme) => ({
  icon: {
    alignItems: "center" as const,
    backgroundColor: theme.status.infoSoft,
    borderRadius: theme.radii.pill,
    height: theme.sizing.minTouchTarget,
    justifyContent: "center" as const,
    width: theme.sizing.minTouchTarget,
  },
  root: {
    alignItems: "center" as const,
    backgroundColor: theme.status.infoSoft,
    borderColor: theme.status.info,
    borderRadius: theme.layout.auth.fieldRadius,
    borderWidth: theme.layout.border.hairline,
    flexDirection: "row" as const,
    gap: theme.spacing.row,
    minWidth: 0,
    padding: theme.spacing.section,
  },
  text: {
    ...theme.typography.authSubtitle,
    color: theme.status.onStatus,
    flex: 1,
  },
});

export function AuthInfoBanner({ iconColor, iconName, testID, text }: AuthInfoBannerProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View accessibilityLiveRegion="polite" style={styles.root} testID={testID}>
      <View style={styles.icon}>
        <Ionicons
          accessibilityElementsHidden
          color={iconColor ?? theme.status.info}
          importantForAccessibility="no"
          name={iconName}
          size={theme.layout.auth.infoBannerGlyph}
          testID={testID ? `${testID}-icon` : undefined}
        />
      </View>
      <Text maxFontSizeMultiplier={2} style={styles.text}>
        {text}
      </Text>
    </View>
  );
}
