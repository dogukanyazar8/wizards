import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { getMobileThemeCompatibilityColors } from "../../design/mobile-theme-compat";
import type { MobileTheme } from "../../design/themes";
import { useThemedStyles } from "../providers/mobile-theme-provider";
import { createSharedStyles } from "../styles/shared-styles";

export const createMobileVoiceInviteOverlayStyles = (theme: MobileTheme) => {
  const mobileColors = getMobileThemeCompatibilityColors(theme);
  const mobileRadii = theme.radii;

  return {
    mobileVoiceInviteOverlay: {
      position: "absolute",
      top: 10,
      left: 8,
      right: 8,
      zIndex: 30,
    },
    mobileVoiceInviteOverlayActions: {
      gap: 6,
      alignItems: "stretch",
    },
    mobileVoiceInviteOverlayCard: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      borderWidth: 1,
      borderColor: theme.border.focus,
      borderRadius: 22,
      backgroundColor: theme.surface.elevated,
      padding: 10,
      shadowColor: theme.elevation.floating.shadowColor,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: theme.dark ? 0 : 0.14,
      shadowRadius: 18,
      elevation: theme.dark ? 0 : 8,
    },
    mobileVoiceInviteOverlayDescription: {
      marginTop: 2,
      color: mobileColors.muted,
      fontSize: 11,
      fontWeight: "700",
      lineHeight: 15,
    },
    mobileVoiceInviteOverlayGhostButton: {
      minHeight: 30,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.surface.soft,
      paddingHorizontal: 10,
    },
    mobileVoiceInviteOverlayGhostText: {
      color: mobileColors.muted,
      fontSize: 10,
      fontWeight: "900",
    },
    mobileVoiceInviteOverlayIcon: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 15,
      backgroundColor: theme.accent.soft,
    },
    mobileVoiceInviteOverlayPrimaryButton: {
      minHeight: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.accentStrong,
      paddingHorizontal: 12,
    },
    mobileVoiceInviteOverlayPrimaryText: {
      color: theme.text.onPrimary,
      fontSize: 10,
      fontWeight: "900",
    },
    mobileVoiceInviteOverlayText: {
      flex: 1,
      minWidth: 0,
    },
    mobileVoiceInviteOverlayTitle: {
      color: mobileColors.text,
      fontSize: 13,
      fontWeight: "900",
    },
    ...createSharedStyles(theme),
  } satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;
};

export const useMobileVoiceInviteOverlayStyles = () =>
  useThemedStyles(createMobileVoiceInviteOverlayStyles);
