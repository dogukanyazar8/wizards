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
      fontWeight: "700",
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
      fontWeight: "900",
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
      flex: 1,
      minWidth: 0,
      color: theme.text.primary,
      fontSize: 16.5,
      fontWeight: "900",
    },
    mobileChannelChatTopic: {
      marginTop: 1,
      color: theme.text.muted,
      fontSize: 12,
      fontWeight: "700",
    },
    mobileChannelTypingDot: {
      width: 4,
      height: 4,
      borderRadius: 999,
      backgroundColor: theme.text.soft,
    },
    mobileChannelTypingDots: {
      flexDirection: "row",
      gap: 3,
    },
    mobileChannelTypingIndicator: {
      minHeight: 22,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 6,
    },
    mobileChannelTypingText: {
      minWidth: 0,
      flexShrink: 1,
      color: theme.text.muted,
      fontSize: 11,
      fontWeight: "800",
    },
    workspaceChannelIconLarge: {
      width: 34,
      height: 34,
      borderRadius: 13,
      overflow: "hidden",
      backgroundColor: theme.accent.soft,
      color: theme.accent.strong,
      fontSize: 18,
      fontWeight: "900",
      lineHeight: 34,
      textAlign: "center",
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
