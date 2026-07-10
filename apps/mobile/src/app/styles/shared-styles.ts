import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";
import { getMobileThemeCompatibilityColors } from "../../design/mobile-theme-compat";
import { lightTheme, type MobileTheme } from "../../design/themes";

export const createSharedStyles = (theme: MobileTheme) => {
  const mobileColors = getMobileThemeCompatibilityColors(theme);
  const mobileRadii = theme.radii;
  const mobileSizing = theme.sizing;

  return {
    actionButtonDisabled: {
      opacity: 0.62,
    },
    actionButtonPressed: {
      opacity: 0.78,
    },
    actionButtonTextDisabled: {
      opacity: 0.86,
    },
    contractDescription: {
      color: mobileColors.muted,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: "600",
    },
    dmErrorRow: {
      gap: 10,
      minWidth: 0,
    },
    dmMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 6,
      minWidth: 0,
    },
    dmPreviewCard: {
      gap: 10,
      minWidth: 0,
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.white,
      padding: 12,
    },
    dmPreviewHeader: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    dmPreviewTitle: {
      color: mobileColors.text,
      fontSize: 15,
      fontWeight: "900",
    },
    dmPreviewTitleBlock: {
      flex: 1,
      minWidth: 0,
    },
    dmRefreshButton: {
      minWidth: 54,
      minHeight: mobileSizing.minTouchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.primarySoft,
      paddingHorizontal: 10,
    },
    dmRefreshButtonText: {
      color: mobileColors.accentStrong,
      fontSize: 12,
      fontWeight: "900",
    },
    environmentLabel: {
      color: mobileColors.mutedSoft,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.5,
      textTransform: "uppercase",
    },
    errorText: {
      color: mobileColors.danger,
      fontSize: 13,
      fontWeight: "700",
    },
    mediaSelectedAssetLabel: {
      color: mobileColors.mutedSoft,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    mediaSelectedAssetMeta: {
      marginTop: 2,
      color: mobileColors.muted,
      fontSize: 11,
      fontWeight: "700",
    },
    mediaSelectedAssetName: {
      marginTop: 3,
      color: mobileColors.text,
      fontSize: 13,
      fontWeight: "900",
    },
    messageStreamItem: {
      gap: 8,
      minWidth: 0,
    },
    mobileChannelChatIconButton: {
      width: mobileSizing.minTouchTarget,
      height: mobileSizing.minTouchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: mobileColors.primarySoft,
      borderRadius: 16,
      backgroundColor: mobileColors.surfaceSoft,
    },
    mobileVoiceInviteCandidateError: {
      marginTop: 3,
      color: mobileColors.danger,
      fontSize: 10,
      fontWeight: "800",
    },
    nativeSettingsDot: {
      width: 10,
      height: 10,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.mutedSoft,
    },
    nativeSettingsDotDanger: {
      backgroundColor: mobileColors.danger,
    },
    nativeSettingsDotSuccess: {
      backgroundColor: mobileColors.success,
    },
    nativeSettingsDotWarning: {
      backgroundColor: mobileColors.warning,
    },
    notificationRuntimeCard: {
      gap: 12,
      minWidth: 0,
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.white,
      padding: 12,
    },
    notificationRuntimeCardReady: {
      borderColor: mobileColors.success,
      backgroundColor: mobileColors.surfaceSoft,
    },
    notificationRuntimeCardWarning: {
      borderColor: mobileColors.warning,
      backgroundColor: mobileColors.surfaceSoft,
    },
    notificationRuntimeDescription: {
      color: mobileColors.muted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "700",
    },
    notificationRuntimeError: {
      borderWidth: 1,
      borderColor: mobileColors.danger,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.dangerSoft,
      color: mobileColors.danger,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: "800",
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    notificationRuntimeFootnote: {
      color: mobileColors.mutedSoft,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: "700",
    },
    notificationRuntimeHeader: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    notificationRuntimeIcon: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: mobileColors.primarySoft,
    },
    notificationRuntimeIconText: {
      color: mobileColors.accentStrong,
      fontSize: 14,
      fontWeight: "900",
    },
    notificationRuntimeText: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    notificationRuntimeTitle: {
      color: mobileColors.text,
      fontSize: 15,
      fontWeight: "900",
    },
    retryButton: {
      minHeight: mobileSizing.minTouchTarget,
      justifyContent: "center",
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.white,
      paddingHorizontal: 12,
    },
    retryButtonText: {
      color: mobileColors.accentStrong,
      fontSize: 12,
      fontWeight: "900",
    },
    screenDescription: {
      color: mobileColors.muted,
      fontSize: 14,
      lineHeight: 21,
      fontWeight: "600",
    },
    screenEyebrow: {
      color: mobileColors.accentStrong,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 2,
      textTransform: "uppercase",
    },
    screenTitle: {
      color: mobileColors.text,
      fontSize: 24,
      lineHeight: 31,
      fontWeight: "900",
    },
    statusCard: {
      flexDirection: "row",
      gap: 12,
      minWidth: 0,
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.primarySoft,
      padding: 14,
    },
    statusCardDescription: {
      color: mobileColors.muted,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: "600",
    },
    statusCardText: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    statusCardTitle: {
      color: mobileColors.text,
      fontSize: 15,
      fontWeight: "900",
    },
    statusIcon: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.accent,
    },
    statusIconText: {
      color: mobileColors.white,
      fontSize: 11,
      fontWeight: "900",
    },
  } satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;
};

export const sharedStyles = StyleSheet.create(createSharedStyles(lightTheme));
export const styles = sharedStyles;
