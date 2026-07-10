import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { getMobileThemeCompatibilityColors } from "../../design/mobile-theme-compat";
import type { MobileTheme } from "../../design/themes";
import { useThemedStyles } from "../providers/mobile-theme-provider";
import { createSharedStyles } from "../styles/shared-styles";

export const createNotificationsScreenStyles = (theme: MobileTheme) => {
  const mobileColors = getMobileThemeCompatibilityColors(theme);
  const mobileRadii = theme.radii;
  const mobileSizing = theme.sizing;
  const notificationsScreenStyles = {
    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      minWidth: 0,
    },
    mediaRuntimeStatusRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      minWidth: 0,
    },
    mediaSelectedAssetCard: {
      minWidth: 0,
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.white,
      paddingHorizontal: 11,
      paddingVertical: 9,
    },
  } satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;

  return { ...createSharedStyles(theme), ...notificationsScreenStyles };
};

export function useNotificationsScreenStyles() {
  return useThemedStyles(createNotificationsScreenStyles);
}
