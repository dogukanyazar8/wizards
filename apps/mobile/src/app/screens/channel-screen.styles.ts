import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import type { MobileTheme } from "../../design/themes";
import { mobileMessagingMetrics } from "../../design/tokens";
import { useThemedStyles } from "../providers/mobile-theme-provider";
import { createSharedStyles } from "../styles/shared-styles";

const metrics = mobileMessagingMetrics;

/**
 * MSG-1e text channel. §1.10 allows two surface tones here and no more: the
 * flow and its chrome are `messaging.surface`, and the helper blocks (pinned
 * strip, link preview, thread source) are `messaging.screen`.
 */
export const createChannelScreenStyles = (theme: MobileTheme) => {
  const mobileRadii = theme.radii;
  return {
    channelScrollToBottomButton: {
      position: "absolute",
      right: 14,
      bottom: 14,
      zIndex: 3,
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.surface.card,
      shadowColor: theme.elevation.headerCard.shadowColor,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: theme.dark ? 0 : 0.12,
      shadowRadius: 20,
      elevation: theme.dark ? 0 : 6,
    },
    dmPreviewMeta: {
      marginTop: 2,
      color: theme.text.muted,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyBold,
    },
    /** 26x38 strip: the chevron sits flush with the hash square beside it. */
    mobileChannelChatBackButton: {
      width: 26,
      height: metrics.iconButton,
      alignItems: "flex-start",
      justifyContent: "center",
    },
    mobileChannelChatBody: {
      flex: 1,
      minWidth: 0,
    },
    /**
     * §2 "1e".4: `padding: 8px 0 6px`. The flow has no horizontal padding at
     * all — every row, separator and system line pads itself to 16, which is
     * what lets the mention row's fill run edge to edge.
     */
    mobileChannelChatBodyContent: {
      flexGrow: 1,
      minHeight: 180,
      minWidth: 0,
      gap: 0,
      paddingHorizontal: 0,
      paddingTop: metrics.channel.flowPaddingTop,
      paddingBottom: metrics.channel.flowPaddingBottom,
    },
    /** Rows pad themselves, so the empty/loading/error states have to pad here. */
    mobileChannelChatBodyEmptyContent: {
      justifyContent: "center",
      paddingHorizontal: metrics.channel.rowPaddingHorizontal,
    },
    mobileChannelChatBodyShell: {
      position: "relative",
      flex: 1,
      minWidth: 0,
    },
    mobileChannelStreamItem: {
      minWidth: 0,
    },
    mobileChannelChatHash: {
      width: metrics.iconButton,
      height: metrics.iconButton,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: metrics.iconButtonRadius,
      backgroundColor: theme.messaging.accentSoft,
    },
    mobileChannelChatHeader: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.messaging.divider,
      backgroundColor: theme.messaging.surface,
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 10,
    },
    /** §2 "1g".1: the header — and only the header — fades behind the menu. */
    mobileChannelChatHeaderDimmed: { opacity: 0.5 },
    mobileChannelChatHeaderText: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    mobileChannelChatHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexShrink: 0,
    },
    mobileChannelChatIconButtonActive: {
      backgroundColor: theme.messaging.accentSoft,
    },
    mobileChannelChatIconButtonDisabled: {
      opacity: 0.58,
    },
    mobileChannelChatKeyboard: {
      flex: 1,
      minWidth: 0,
    },
    mobileChannelChatScreen: {
      flex: 1,
      minWidth: 0,
      gap: 0,
      backgroundColor: theme.messaging.surface,
    },
    mobileChannelChatTitle: {
      minWidth: 0,
      color: theme.messaging.textPrimary,
      fontSize: 15.5,
      letterSpacing: -0.155,
      fontFamily: theme.typography.fontFamilyExtraBold,
      includeFontPadding: false,
      lineHeight: 20,
    },
    mobileChannelChatTopic: {
      color: theme.messaging.textSecondary,
      fontSize: 11.5,
      lineHeight: 15,
      fontFamily: theme.typography.fontFamilySemiBold,
      includeFontPadding: false,
    },
    /** §2 "1e".13: the typing line starts where the message bodies start. */
    mobileChannelTypingIndicator: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingLeft: metrics.channel.continuationPaddingLeft,
      paddingRight: metrics.channel.rowPaddingHorizontal,
      paddingTop: metrics.channel.typingPaddingTop,
      paddingBottom: metrics.channel.typingPaddingBottom,
    },
    mobileChannelTypingText: {
      minWidth: 0,
      flexShrink: 1,
      color: theme.messaging.textSecondary,
      fontSize: 11.5,
      lineHeight: 15,
      fontFamily: theme.typography.fontFamilyBold,
    },
    workspaceChannelIconLarge: {
      width: 34,
      height: 34,
      borderRadius: 13,
      overflow: "hidden",
      backgroundColor: theme.accent.soft,
      color: theme.accent.strong,
      fontSize: 18,
      fontFamily: theme.typography.fontFamilyExtraBold,
      lineHeight: 34,
      textAlign: "center",
    },
    /**
     * §2 "1e".3 pinned strip: one line on the screen tone, ruled top and bottom.
     * It is the second of the screen's two tones, so it carries no card chrome.
     */
    pinnedBanner: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor: theme.messaging.screen,
      borderTopWidth: 1,
      borderTopColor: theme.messaging.divider,
      borderBottomWidth: 1,
      borderBottomColor: theme.messaging.divider,
      paddingHorizontal: metrics.channel.pinnedStripPaddingHorizontal,
      paddingVertical: metrics.channel.pinnedStripPaddingVertical,
    },
    pinnedBannerBody: {
      flex: 1,
      minWidth: 0,
    },
    pinnedBannerContent: {
      color: theme.messaging.textSecondary,
      fontSize: 12,
      lineHeight: 16,
      fontFamily: theme.typography.fontFamilyMedium,
    },
    pinnedBannerCountButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      flexShrink: 0,
    },
    pinnedBannerCount: {
      color: theme.messaging.accentText,
      fontSize: 12,
      lineHeight: 16,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    pinnedSheetList: {
      marginTop: 8,
    },
    pinnedSheetRow: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: mobileRadii.row,
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    pinnedSheetRowPressed: {
      backgroundColor: theme.surface.soft,
    },
    pinnedSheetRowBody: {
      flex: 1,
      minWidth: 0,
    },
    pinnedSheetRowAuthor: {
      color: theme.text.primary,
      fontSize: 13,
      lineHeight: 17,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    pinnedSheetRowContent: {
      color: theme.text.visualSecondary,
      fontSize: 12,
      lineHeight: 16,
    },
    pinnedSheetRowTime: {
      color: theme.text.visualPlaceholder,
      fontSize: 10.5,
      lineHeight: 14,
    },
    pinnedSheetUnpinButton: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    pinnedSheetEmptyText: {
      color: theme.text.muted,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 12,
    },
    ...createSharedStyles(theme),
    /** Declared after the shared sheet on purpose: it overrides the 8c square. */
    mobileChannelChatIconButton: {
      width: metrics.iconButton,
      height: metrics.iconButton,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 0,
      borderRadius: metrics.iconButtonRadius,
      backgroundColor: theme.messaging.field,
    },
  } satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;
};

export const useChannelScreenStyles = () => useThemedStyles(createChannelScreenStyles);
