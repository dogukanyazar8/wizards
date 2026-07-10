import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import type { MobileTheme } from "../../design/themes";
import { useThemedStyles } from "../providers/mobile-theme-provider";

const createStyles = (theme: MobileTheme) =>
  ({
    overlay: {
      position: "absolute" as const,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 100,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingHorizontal: 28,
      backgroundColor: theme.surface.base,
    },
    card: {
      width: "100%",
      maxWidth: theme.sizing.maxInlineContentWidth,
      alignItems: "center" as const,
      gap: 12,
    },
    icon: {
      width: 64,
      height: 64,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.radii.card,
      backgroundColor: theme.accent.soft,
    },
    iconGlyph: {
      color: theme.accent.default,
    },
    title: {
      ...theme.typography.title,
      color: theme.text.primary,
      textAlign: "center" as const,
    },
    description: {
      ...theme.typography.body,
      color: theme.text.secondary,
      textAlign: "center" as const,
    },
    actions: {
      marginTop: 12,
      width: "100%",
      gap: 10,
    },
    retryButton: {
      minHeight: theme.sizing.minTouchTarget,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.radii.control,
      paddingHorizontal: 20,
      backgroundColor: theme.accent.default,
    },
    retryButtonPressed: {
      backgroundColor: theme.accent.strong,
    },
    retryLabel: {
      ...theme.typography.button,
      color: theme.text.onPrimary,
    },
    signOutButton: {
      minHeight: theme.sizing.minTouchTarget,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.radii.control,
      paddingHorizontal: 20,
      borderWidth: 1,
      borderColor: theme.border.default,
      backgroundColor: theme.surface.card,
    },
    signOutButtonPressed: {
      backgroundColor: theme.interactive.pressed,
    },
    signOutLabel: {
      ...theme.typography.button,
      color: theme.text.secondary,
    },
  }) satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;

export const useMobileAppLockScreenStyles = () => useThemedStyles(createStyles);
