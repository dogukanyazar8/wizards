import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { getMobileThemeCompatibilityColors } from "../../design/mobile-theme-compat";
import type { MobileTheme } from "../../design/themes";
import { useThemedStyles } from "../providers/mobile-theme-provider";
import { createSharedStyles } from "../styles/shared-styles";

export const createMediaPrimitiveStyles = (theme: MobileTheme) => {
  const mobileColors = getMobileThemeCompatibilityColors(theme);
  const mobileRadii = theme.radii;

  return {
    mediaRuntimeStatusLabel: {
      color: mobileColors.text,
      fontSize: 12,
      fontWeight: "900",
    },
    mediaRuntimeStatusPill: {
      minHeight: 46,
      flexGrow: 1,
      flexBasis: 138,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.control,
      backgroundColor: theme.surface.soft,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    mediaRuntimeStatusText: {
      flex: 1,
      minWidth: 0,
    },
    mediaRuntimeStatusValue: {
      marginTop: 2,
      color: mobileColors.muted,
      fontSize: 11,
      fontWeight: "800",
    },
    ...createSharedStyles(theme),
  } satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;
};

export const useMediaPrimitiveStyles = () => useThemedStyles(createMediaPrimitiveStyles);
