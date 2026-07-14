import { Text, View } from "react-native";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import type { MobileTheme } from "../../design/themes";
import { useThemedStyles } from "../providers/mobile-theme-provider";

const createStyles = (theme: MobileTheme) => ({
  banner: {
    alignItems: "center" as const,
    backgroundColor: theme.status.warningSoft,
    minHeight: 32,
    paddingHorizontal: theme.spacing.page,
    paddingVertical: 6,
    width: "100%" as const,
    zIndex: 90,
  },
  text: { ...theme.typography.label, color: theme.status.onStatus, textAlign: "center" as const },
});

export function MobileOfflineBanner() {
  const styles = useThemedStyles(createStyles);
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={styles.banner}
      testID="mobile-offline-banner"
    >
      <Text style={styles.text}>{copy.offlineBannerMessage}</Text>
    </View>
  );
}
