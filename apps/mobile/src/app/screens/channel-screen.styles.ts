import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import type { MobileTheme } from "../../design/themes";
import { useThemedStyles } from "../providers/mobile-theme-provider";
import { createSharedStyles } from "../styles/shared-styles";

export const createChannelScreenStyles = (theme: MobileTheme) => {
  const mobileRadii = theme.radii;
  const mobileSizing = theme.sizing;

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
    mobileChannelChatBackButton: {
      width: 22,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: mobileRadii.pill,
      backgroundColor: "transparent",
    },
    mobileChannelChatBody: {
      flex: 1,
      minWidth: 0,
    },
    mobileChannelChatBodyContent: {
      flexGrow: 1,
      minHeight: 180,
      minWidth: 0,
      gap: 0,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 18,
    },
    mobileChannelChatBodyEmptyContent: {
      justifyContent: "center",
    },
    mobileChannelChatBodyShell: {
      position: "relative",
      flex: 1,
      minWidth: 0,
    },
    mobileChannelMessageGroupedSpacing: {
      paddingBottom: 5,
    },
    mobileChannelMessageGroupSpacing: {
      paddingBottom: 16,
    },
    mobileChannelMessageItem: {
      gap: 8,
      minWidth: 0,
    },
    mobileChannelChatHash: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 13,
      backgroundColor: theme.accent.soft,
    },
    mobileChannelChatHashText: {
      color: theme.accent.strong,
      fontSize: 17,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileChannelChatHeader: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    mobileChannelChatHeaderText: {
      flex: 1,
      minWidth: 0,
    },
    mobileChannelChatIconButtonActive: {
      borderColor: theme.border.focus,
      backgroundColor: theme.accent.soft,
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
      backgroundColor: theme.surface.base,
    },
    mobileChannelChatTitle: {
      minWidth: 0,
      color: theme.text.primary,
      fontSize: 16.5,
      fontFamily: theme.typography.fontFamilyExtraBold,
      includeFontPadding: false,
      lineHeight: 21,
    },
    mobileChannelChatTopic: {
      marginTop: 1,
      color: theme.text.muted,
      fontSize: 12,
      fontFamily: theme.typography.fontFamily,
    },
    mobileChannelTypingIndicator: {
      minHeight: 26,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingLeft: 52,
      paddingRight: 20,
    },
    mobileChannelTypingText: {
      minWidth: 0,
      flexShrink: 1,
      color: theme.text.muted,
      fontSize: 12,
      fontFamily: theme.typography.fontFamily,
      fontStyle: "italic",
      lineHeight: 18,
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
    // 8c pinned-message banner under the channel header.
    pinnedBanner: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor: theme.accent.soft,
      borderBottomWidth: 1,
      borderBottomColor: theme.accent.softBorder,
      paddingHorizontal: 16,
      paddingVertical: 9,
    },
    pinnedBannerBody: {
      flex: 1,
      minWidth: 0,
    },
    pinnedBannerTitle: {
      color: theme.accent.strong,
      fontSize: 11,
      lineHeight: 14,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    pinnedBannerContent: {
      color: theme.text.secondary,
      fontSize: 12,
      lineHeight: 16,
    },
    pinnedBannerCountButton: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingLeft: 6,
    },
    pinnedBannerCount: {
      color: theme.accent.strong,
      fontSize: 11,
      lineHeight: 14,
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
    mobileChannelChatIconButton: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 13,
      backgroundColor: theme.surface.card,
    },
  } satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;
};

export const useChannelScreenStyles = () => useThemedStyles(createChannelScreenStyles);
