import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import type { MobileTheme } from "../../design/themes";
import { useThemedStyles } from "../providers/mobile-theme-provider";
import { createSharedStyles } from "../styles/shared-styles";

export const createNotificationsScreenStyles = (theme: MobileTheme) => {
  const mobileRadii = theme.radii;
  const mobileSizing = theme.sizing;
  const notificationsScreenStyles = {
    markAllReadAction: {
      alignSelf: "flex-start" as const,
      paddingHorizontal: 2,
      paddingVertical: 8,
    },
    markAllReadActionDisabled: {
      opacity: theme.layout.opacity.notificationMarkAllReadDisabled,
    },
    markAllReadActionText: {
      color: theme.accent.strong,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13,
      fontWeight: "700",
    },
    notificationFeedBody: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 14,
      lineHeight: 20,
    },
    notificationFeedIcon: {
      alignItems: "center" as const,
      backgroundColor: theme.accent.soft,
      borderRadius: 16,
      height: 44,
      justifyContent: "center" as const,
      width: 44,
    },
    notificationFeedMeta: {
      color: theme.text.soft,
      fontFamily: theme.typography.fontFamily,
      fontSize: 11.5,
    },
    notificationFeedQuote: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12.5,
    },
    notificationFeedRow: {
      alignItems: "flex-start" as const,
      borderRadius: 18,
      flexDirection: "row" as const,
      gap: 14,
      minHeight: theme.layout.fixed.notificationFeedRowMinHeight,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    notificationFeedRowUnread: {
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderWidth: 1,
    },
    notificationFeedText: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    notificationPermissionAction: {
      alignItems: "center" as const,
      backgroundColor: theme.accent.action,
      borderRadius: 12,
      justifyContent: "center" as const,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    notificationPermissionActionText: {
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13,
      fontWeight: "700",
    },
    notificationPermissionCard: {
      alignItems: "center" as const,
      backgroundColor: theme.accent.soft,
      borderColor: theme.border.focus,
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: "row" as const,
      gap: 14,
      marginHorizontal: 6,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    notificationPermissionDescription: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12.5,
      lineHeight: 18,
    },
    notificationPermissionIcon: {
      alignItems: "center" as const,
      backgroundColor: theme.accent.action,
      borderRadius: 14,
      height: 42,
      justifyContent: "center" as const,
      width: 42,
    },
    notificationPermissionText: {
      flex: 1,
      gap: 1,
      minWidth: 0,
    },
    notificationPermissionTitle: {
      color: theme.accent.strong,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 14,
      fontWeight: "700",
    },
    notificationUnreadDot: {
      backgroundColor: theme.accent.default,
      borderRadius: 4,
      height: 8,
      marginTop: 6,
      width: 8,
    },
    notificationsErrorCard: {
      alignItems: "center" as const,
      backgroundColor: theme.status.dangerSoft,
      borderColor: theme.status.danger,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row" as const,
      gap: 10,
      marginHorizontal: 6,
      padding: 12,
    },
    notificationsErrorText: {
      color: theme.status.danger,
      flex: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 12,
      minWidth: 0,
    },
    notificationsHeader: {
      alignItems: "flex-start" as const,
      flexDirection: "row" as const,
      gap: 10,
      paddingHorizontal: 10,
      paddingTop: 16,
    },
    notificationsHeaderText: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    notificationsDescription: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamily,
      fontSize: 13,
      lineHeight: 18,
    },
    notificationsList: {
      gap: 2,
      paddingBottom: 14,
      paddingHorizontal: 6,
    },
    notificationsListViewport: {
      flex: 1,
      minHeight: 0,
      minWidth: 0,
    },
    notificationsLoadingText: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 13,
      padding: 20,
      textAlign: "center" as const,
    },
    notificationsRetryAction: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.status.danger,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    notificationsRetryActionText: {
      color: theme.status.danger,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12,
      fontWeight: "700",
    },
    notificationsScreen: {
      flex: 1,
      gap: 12,
      minWidth: 0,
    },
    notificationsSectionTitle: {
      color: theme.text.soft,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11.5,
      fontWeight: "700",
      letterSpacing: 1.38,
      paddingHorizontal: 12,
      paddingTop: 6,
      paddingBottom: 6,
    },
    notificationsTitle: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 26,
      fontWeight: "800",
      letterSpacing: -0.52,
    },
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
      borderColor: theme.border.subtle,
      borderRadius: mobileRadii.control,
      backgroundColor: theme.surface.card,
      paddingHorizontal: 11,
      paddingVertical: 9,
    },
  } satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;

  return { ...createSharedStyles(theme), ...notificationsScreenStyles };
};

export function useNotificationsScreenStyles() {
  return useThemedStyles(createNotificationsScreenStyles);
}
