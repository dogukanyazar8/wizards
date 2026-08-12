import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import type { MobileTheme } from "../../design/themes";
import { useThemedStyles } from "../providers/mobile-theme-provider";
import { createSharedStyles } from "../styles/shared-styles";

export const createNotificationsScreenStyles = (theme: MobileTheme) => {
  const mobileRadii = theme.radii;
  const mobileSizing = theme.sizing;
  const notificationsScreenStyles = {
    // A notification is a headline, not body copy: the regular weight read as
    // washed out next to the avatar and badge.
    notificationFeedBody: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 14,
      lineHeight: 20,
    },
    notificationFeedBodyUnread: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyBold,
    },
    notificationFeedIcon: {
      alignItems: "center" as const,
      backgroundColor: theme.accent.soft,
      borderRadius: 16,
      height: 44,
      justifyContent: "center" as const,
      width: 44,
    },
    notificationFeedIconVoice: {
      backgroundColor: theme.status.successSoft,
    },
    /**
     * 07 §4. A badge row is drawn as the badge: the tile takes the badge's own
     * tint and ring, so the feed reads like the badge sheet rather than like a
     * system notice with a bell on it. The two colours come from the badge, so
     * they are set inline.
     */
    notificationFeedIconBadge: {
      borderWidth: 1.5,
    },
    /** The badge's own name, the line the row is actually about. */
    notificationFeedHeadline: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 14,
    },
    notificationFeedMeta: {
      color: theme.text.soft,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11.5,
    },
    notificationFeedQuote: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 12.5,
    },
    notificationFeedRow: {
      alignItems: "flex-start" as const,
      borderRadius: 18,
      flexDirection: "row" as const,
      gap: 14,
      minHeight: theme.layout.fixed.notificationFeedRowMinHeight,
      marginBottom: 6,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    notificationFeedRowUnread: {
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: mobileRadii.bubble,
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
      minHeight: mobileSizing.minTouchTarget,
      paddingHorizontal: 14,
    },
    notificationPermissionActionText: {
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13,
    },
    notificationPermissionCard: {
      alignItems: "center" as const,
      backgroundColor: theme.accent.soft,
      borderColor: theme.border.focus,
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: "row" as const,
      gap: 14,
      marginHorizontal: 20,
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
    },
    notificationUnreadDot: {
      backgroundColor: theme.accent.default,
      borderRadius: 4,
      height: 8,
      marginTop: 6,
      width: 8,
    },
    notificationVoiceJoinAction: {
      alignItems: "center" as const,
      alignSelf: "center" as const,
      backgroundColor: theme.status.successSoft,
      borderRadius: 12,
      justifyContent: "center" as const,
      minHeight: mobileSizing.minTouchTarget,
      paddingHorizontal: 14,
    },
    notificationVoiceJoinActionText: {
      color: theme.status.successText,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12.5,
    },
    notificationActorAvatarWrap: {
      height: mobileSizing.avatarL,
      position: "relative" as const,
      width: mobileSizing.avatarL,
    },
    notificationMentionBadge: {
      alignItems: "center" as const,
      backgroundColor: theme.accent.default,
      borderColor: theme.surface.card,
      borderRadius: 8,
      borderWidth: 2,
      bottom: theme.layout.notifications.mentionBadgeOffset,
      height: mobileSizing.unreadBadgeMinHeight,
      justifyContent: "center" as const,
      position: "absolute" as const,
      right: theme.layout.notifications.mentionBadgeOffset,
      width: mobileSizing.unreadBadgeMinHeight,
    },
    notificationMentionBadgeText: {
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 10,
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
      alignItems: "center" as const,
      flexDirection: "row" as const,
      gap: 10,
      justifyContent: "space-between" as const,
      paddingHorizontal: 24,
      paddingTop: 16,
    },
    notificationsHeaderText: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    notificationsSubtitle: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamily,
      fontSize: 13,
      lineHeight: 18,
    },
    notificationsList: {
      gap: 10,
      paddingBottom: theme.layout.notifications.contentBottomPadding,
      paddingHorizontal: 12,
    },
    notificationsListViewport: {
      flex: 1,
      minHeight: 0,
      minWidth: 0,
    },
    notificationsLoadingSkeleton: {
      gap: 6,
      paddingHorizontal: 12,
      paddingTop: 6,
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
    },
    notificationsScreen: {
      backgroundColor: theme.surface.base,
      flex: 1,
      gap: 8,
      minWidth: 0,
    },
    notificationsHeaderActions: {
      alignItems: "center" as const,
      flexDirection: "row" as const,
      gap: 6,
    },
    // Three controls share this row now (okundu say · ayarlar · tümünü temizle),
    // so the buttons trade 4px each to keep the title on one line.
    notificationsHeaderIconButton: {
      alignItems: "center" as const,
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 13,
      borderWidth: 1,
      height: 36,
      justifyContent: "center" as const,
      width: 36,
    },
    notificationsHeaderIconButtonDisabled: {
      opacity: theme.layout.opacity.notificationMarkAllReadDisabled,
    },
    // "Tümünü temizle" sits beside the settings control now, so it needs the
    // destructive tint the old footer pill carried.
    notificationsHeaderDangerButton: {
      backgroundColor: theme.status.dangerSoft,
      borderColor: theme.status.dangerSoft,
    },
    notificationsSegmentTrack: {
      backgroundColor: theme.surface.rail,
      borderRadius: 16,
      flexDirection: "row" as const,
      gap: 4,
      marginHorizontal: 20,
      padding: 4,
    },
    notificationsSegmentItem: {
      alignItems: "center" as const,
      borderRadius: 13,
      flex: 1,
      flexDirection: "row" as const,
      gap: 6,
      justifyContent: "center" as const,
      minWidth: 0,
      paddingVertical: 9,
    },
    notificationsSegmentItemActive: {
      backgroundColor: theme.surface.card,
      elevation: theme.dark ? 0 : 2,
      shadowColor: theme.text.primary,
      shadowOffset: { height: 2, width: 0 },
      shadowOpacity: theme.dark ? 0 : 0.08,
      shadowRadius: 6,
    },
    notificationsSegmentLabel: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 13,
      lineHeight: 17,
    },
    notificationsSegmentLabelActive: {
      color: theme.accent.default,
      fontFamily: theme.typography.fontFamilyBold,
    },
    notificationsSegmentBadge: {
      alignItems: "center" as const,
      backgroundColor: theme.accent.default,
      borderRadius: 9,
      height: 18,
      justifyContent: "center" as const,
      minWidth: 18,
      paddingHorizontal: 5,
    },
    notificationsSegmentBadgeText: {
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 10.5,
      lineHeight: 14,
    },
    notificationFriendActions: {
      flexDirection: "row" as const,
      gap: 8,
      paddingTop: 8,
    },
    notificationFriendAcceptAction: {
      alignItems: "center" as const,
      backgroundColor: theme.accent.action,
      borderRadius: 999,
      justifyContent: "center" as const,
      minHeight: 34,
      paddingHorizontal: 16,
    },
    notificationFriendAcceptActionText: {
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12.5,
    },
    notificationFriendDeclineAction: {
      alignItems: "center" as const,
      backgroundColor: theme.surface.soft,
      borderRadius: 999,
      justifyContent: "center" as const,
      minHeight: 34,
      paddingHorizontal: 16,
    },
    notificationFriendDeclineActionText: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12.5,
    },
    notificationsSectionTitle: {
      color: theme.text.soft,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11.5,
      letterSpacing: 1.38,
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 6,
    },
    notificationsTitle: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 26,
      letterSpacing: -0.52,
      lineHeight: 31,
    },
    notificationSkeletonRow: {
      alignItems: "flex-start" as const,
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row" as const,
      gap: 14,
      minHeight: theme.layout.fixed.notificationFeedRowMinHeight,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    notificationSkeletonText: {
      flex: 1,
      gap: 6,
      minWidth: 0,
      paddingTop: 2,
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
