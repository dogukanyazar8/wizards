import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";
import { lightTheme, type MobileTheme } from "../../design/themes";

export const createSharedStyles = (theme: MobileTheme) => {
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
      color: theme.text.muted,
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
      borderColor: theme.border.subtle,
      borderRadius: mobileRadii.control,
      backgroundColor: theme.surface.card,
      padding: 12,
    },
    dmPreviewHeader: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    dmPreviewTitle: {
      color: theme.text.primary,
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
      borderColor: theme.border.subtle,
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.accent.soft,
      paddingHorizontal: 10,
    },
    dmRefreshButtonText: {
      color: theme.accent.strong,
      fontSize: 12,
      fontWeight: "900",
    },
    environmentLabel: {
      color: theme.text.soft,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.5,
      textTransform: "uppercase",
    },
    errorText: {
      color: theme.status.danger,
      fontSize: 13,
      fontWeight: "700",
    },
    mediaSelectedAssetLabel: {
      color: theme.text.soft,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    mediaSelectedAssetMeta: {
      marginTop: 2,
      color: theme.text.muted,
      fontSize: 11,
      fontWeight: "700",
    },
    mediaSelectedAssetName: {
      marginTop: 3,
      color: theme.text.primary,
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
      borderColor: theme.accent.soft,
      borderRadius: 16,
      backgroundColor: theme.surface.soft,
    },
    mobileVoiceInviteCandidateError: {
      marginTop: 3,
      color: theme.status.danger,
      fontSize: 10,
      fontWeight: "800",
    },
    nativeSettingsDot: {
      width: 10,
      height: 10,
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.text.soft,
    },
    nativeSettingsDotDanger: {
      backgroundColor: theme.status.danger,
    },
    nativeSettingsDotSuccess: {
      backgroundColor: theme.status.success,
    },
    nativeSettingsDotWarning: {
      backgroundColor: theme.status.warning,
    },
    notificationRuntimeCard: {
      gap: 12,
      minWidth: 0,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: mobileRadii.control,
      backgroundColor: theme.surface.card,
      padding: 12,
    },
    notificationRuntimeCardReady: {
      borderColor: theme.status.success,
      backgroundColor: theme.surface.soft,
    },
    notificationRuntimeCardWarning: {
      borderColor: theme.status.warning,
      backgroundColor: theme.surface.soft,
    },
    notificationRuntimeDescription: {
      color: theme.text.muted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "700",
    },
    notificationRuntimeError: {
      borderWidth: 1,
      borderColor: theme.status.danger,
      borderRadius: mobileRadii.control,
      backgroundColor: theme.status.dangerSoft,
      color: theme.status.danger,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: "800",
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    notificationRuntimeFootnote: {
      color: theme.text.soft,
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
      backgroundColor: theme.accent.soft,
    },
    notificationRuntimeIconText: {
      color: theme.accent.strong,
      fontSize: 14,
      fontWeight: "900",
    },
    notificationRuntimeText: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    notificationRuntimeTitle: {
      color: theme.text.primary,
      fontSize: 15,
      fontWeight: "900",
    },
    retryButton: {
      minHeight: mobileSizing.minTouchTarget,
      justifyContent: "center",
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.surface.card,
      paddingHorizontal: 12,
    },
    retryButtonText: {
      color: theme.accent.strong,
      fontSize: 12,
      fontWeight: "900",
    },
    screenDescription: {
      color: theme.text.muted,
      fontSize: 14,
      lineHeight: 21,
      fontWeight: "600",
    },
    screenEyebrow: {
      color: theme.accent.strong,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 2,
      textTransform: "uppercase",
    },
    screenTitle: {
      color: theme.text.primary,
      fontSize: 24,
      lineHeight: 31,
      fontWeight: "900",
    },
    statusCard: {
      flexDirection: "row",
      gap: 12,
      minWidth: 0,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: mobileRadii.control,
      backgroundColor: theme.accent.soft,
      padding: 14,
    },
    statusCardDescription: {
      color: theme.text.muted,
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
      color: theme.text.primary,
      fontSize: 15,
      fontWeight: "900",
    },
    statusIcon: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.accent.default,
    },
    statusIconText: {
      color: theme.text.onPrimary,
      fontSize: 11,
      fontWeight: "900",
    },
  } satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;
};

export const sharedStyles = StyleSheet.create(createSharedStyles(lightTheme));
export const styles = sharedStyles;
