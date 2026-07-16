import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import type { MobileTheme } from "../../design/themes";
import { useThemedStyles } from "../providers/mobile-theme-provider";
import { createSharedStyles } from "../styles/shared-styles";

export const createMediaPrimitiveStyles = (theme: MobileTheme) => {
  const mobileRadii = theme.radii;

  return {
    mediaRuntimeStatusLabel: {
      color: theme.text.primary,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyExtraBold,
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
      borderColor: theme.border.subtle,
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
      color: theme.text.muted,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    ...createSharedStyles(theme),
  } satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;
};

export const useMediaPrimitiveStyles = () => useThemedStyles(createMediaPrimitiveStyles);
