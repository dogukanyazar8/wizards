import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import type { MobileTheme } from "../../design/themes";
import { mobileMessagingMetrics } from "../../design/tokens";
import { useThemedStyles } from "../providers/mobile-theme-provider";

const metrics = mobileMessagingMetrics;

/** Matches the strip/card inset the handoff hangs off the avatar column. */
const MESSAGE_MENU_INCOMING_INSET = 38;

/**
 * MSG-1g long-press layer. Three stacked pieces — reaction strip, the message
 * itself, action card — over a scrim that only covers the conversation.
 */
export const createMessageActionMenuStyles = (theme: MobileTheme) =>
  ({
    trigger: { alignSelf: "stretch" },
    root: { flex: 1 },
    backdrop: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.messaging.menuScrim,
    },
    /** Fallback stack: bottom-anchored, `padding: 0 16 14`, `gap: 9`. */
    content: {
      flex: 1,
      justifyContent: "flex-end",
      paddingHorizontal: 16,
      gap: 9,
    },
    /** Anchored layout: every layer is placed in window coordinates. */
    anchoredRoot: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    anchoredLayer: { position: "absolute", maxWidth: "100%" },
    /**
     * §2 "1g".2: the selected message is drawn at the rectangle it was measured
     * at — same origin, same width, no transform of any kind.
     */
    anchoredMessage: { position: "absolute" },
    incomingInset: { marginLeft: MESSAGE_MENU_INCOMING_INSET },
    alignOwn: { alignSelf: "flex-end" },
    alignIncoming: { alignSelf: "flex-start" },
    /** §2 "1g".2: white r24, `padding: 5px 7px`, five 40px buttons then a "+". */
    quickBar: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 1,
      borderRadius: 24,
      backgroundColor: theme.messaging.surface,
      paddingVertical: 5,
      paddingHorizontal: 7,
      ...theme.elevation.reactionStrip,
    },
    quickEmojiButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    quickEmojiButtonActive: { backgroundColor: theme.messaging.accentSoft },
    quickEmojiText: { fontSize: 21, lineHeight: 26 },
    moreEmojiButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 2,
      backgroundColor: theme.messaging.field,
    },
    previewRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      alignSelf: "flex-start",
      maxWidth: "100%",
    },
    previewRowOwn: { alignSelf: "flex-end" },
    previewAvatar: {
      width: metrics.avatar.dmMessage,
      height: metrics.avatar.dmMessage,
      borderRadius: metrics.avatar.dmMessageRadius,
    },
    /** The bubble the row already draws — plus the one thing 1g adds: a shadow. */
    previewBubble: {
      minWidth: 0,
      flexShrink: 1,
      borderRadius: metrics.bubble.radius,
      borderBottomLeftRadius: metrics.bubble.tailRadius,
      backgroundColor: theme.messaging.bubbleIn,
      paddingTop: metrics.bubble.paddingTop,
      paddingBottom: metrics.bubble.paddingBottom,
      paddingHorizontal: metrics.bubble.paddingHorizontal,
      ...theme.elevation.selectedBubble,
    },
    previewBubbleOwn: {
      borderBottomLeftRadius: metrics.bubble.radius,
      borderBottomRightRadius: metrics.bubble.tailRadius,
      backgroundColor: theme.messaging.bubbleOut,
    },
    /**
     * A channel row has no bubble in the stream (K1). Lifted over the scrim it
     * still needs a readable ground, so it takes the surface and the same
     * shadow — inside the overlay, never in the flow.
     */
    previewBubbleChannel: {
      borderRadius: metrics.bubble.radius,
      backgroundColor: theme.messaging.surface,
      gap: 3,
    },
    previewAuthor: {
      color: theme.messaging.textPrimary,
      fontSize: 13.5,
      lineHeight: 18,
      letterSpacing: -0.135,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    previewBubbleLine: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 9,
      minWidth: 0,
    },
    previewText: {
      flexShrink: 1,
      minWidth: 0,
      color: theme.messaging.bubbleInText,
      fontSize: 15,
      lineHeight: 21.3,
      letterSpacing: -0.075,
      fontFamily: theme.typography.fontFamilyMedium,
    },
    previewTextOwn: { color: theme.messaging.bubbleOutText },
    previewTime: {
      flexShrink: 0,
      paddingBottom: 1,
      color: theme.messaging.bubbleMeta,
      fontSize: 10.5,
      lineHeight: 14,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    previewTimeOwn: { color: theme.messaging.bubbleOutMeta },
    /** §2 "1g".3: width 238, r20, padding 5. */
    actionCard: {
      width: 238,
      borderRadius: 20,
      backgroundColor: theme.messaging.surface,
      padding: 5,
      ...theme.elevation.actionMenu,
    },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      paddingVertical: 10,
      paddingHorizontal: 11,
      borderRadius: 15,
    },
    actionRowPressed: { backgroundColor: theme.messaging.field },
    actionLabel: {
      color: theme.messaging.textPrimary,
      fontSize: 13.5,
      lineHeight: 18,
      fontFamily: theme.typography.fontFamilySemiBold,
      includeFontPadding: false,
    },
    actionLabelPrimary: { fontFamily: theme.typography.fontFamilyBold },
    actionLabelDestructive: {
      color: theme.messaging.danger,
      fontFamily: theme.typography.fontFamilyBold,
    },
    actionSeparator: {
      height: 1,
      backgroundColor: theme.messaging.divider,
      marginVertical: 3,
      marginHorizontal: 10,
    },
  }) satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;

export const useMessageActionMenuStyles = () => useThemedStyles(createMessageActionMenuStyles);
