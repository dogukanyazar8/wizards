import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { mobileMessagingMetrics } from "../../design/tokens";
import type { MobileTheme } from "../../design/themes";
import { useThemedStyles } from "../providers/mobile-theme-provider";
import { createSharedStyles } from "../styles/shared-styles";

const metrics = mobileMessagingMetrics;

/**
 * MSG-1d DM conversation. Every measure below is read from the reference HTML's
 * inline styles; colours come from `theme.messaging` so the 1h dark variant is a
 * token swap and nothing else.
 */
export const createDMChatStyles = (theme: MobileTheme) =>
  ({
    root: { flex: 1, minWidth: 0, backgroundColor: theme.messaging.screen },
    header: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      // The handoff draws the header edge as `0 1px 0` under the bar, which is a
      // hairline in every practical sense.
      borderBottomWidth: 1,
      borderBottomColor: theme.messaging.divider,
      backgroundColor: theme.messaging.surface,
      paddingTop: 6,
      paddingBottom: 10,
      paddingHorizontal: 16,
    },
    /** §2 "1g".1: only the header fades behind the long-press menu. */
    headerDimmed: { opacity: 0.5 },
    /** 26x38 strip, not a squircle: the chevron sits flush with the avatar. */
    backButton: {
      width: 26,
      height: metrics.iconButton,
      alignItems: "flex-start",
      justifyContent: "center",
    },
    headerAvatarShell: {
      position: "relative",
      width: metrics.avatar.chatHeader,
      height: metrics.avatar.chatHeader,
      flexShrink: 0,
    },
    headerAvatar: {
      width: metrics.avatar.chatHeader,
      height: metrics.avatar.chatHeader,
      borderRadius: metrics.avatar.chatHeaderRadius,
    },
    onlineDot: {
      position: "absolute",
      right: -2,
      bottom: -2,
      width: metrics.presenceDot.avatarSize,
      height: metrics.presenceDot.avatarSize,
      borderRadius: metrics.presenceDot.avatarSize / 2,
      borderWidth: metrics.presenceDot.avatarRingWidth,
      // The ring punches the header surface, not a generic white.
      borderColor: theme.messaging.surface,
      backgroundColor: theme.messaging.online,
    },
    headerIdentityButton: {
      minHeight: metrics.iconButton,
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    headerText: { flex: 1, minWidth: 0, gap: 1 },
    headerTitle: {
      color: theme.messaging.textPrimary,
      fontSize: 15.5,
      lineHeight: 20,
      letterSpacing: -0.155,
      fontFamily: theme.typography.fontFamilyExtraBold,
      includeFontPadding: false,
    },
    headerStatus: {
      color: theme.messaging.textSecondary,
      fontSize: 11.5,
      lineHeight: 15,
      fontFamily: theme.typography.fontFamilyBold,
      includeFontPadding: false,
    },
    headerStatusOnline: { color: theme.messaging.onlineText },
    callActions: { flexDirection: "row", alignItems: "center", gap: 8 },
    callButton: {
      width: metrics.iconButton,
      height: metrics.iconButton,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: metrics.iconButtonRadius,
      backgroundColor: theme.messaging.field,
    },
    callButtonDisabled: { opacity: 0.62 },
    messageArea: { flex: 1, minWidth: 0 },
    messageFlow: { paddingTop: 12, paddingBottom: 8, paddingHorizontal: 16 },
    encryptionPill: {
      alignSelf: "center",
      minHeight: 30,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      borderRadius: 14,
      backgroundColor: theme.messaging.accentSoft,
      paddingVertical: 7,
      paddingHorizontal: 13,
      marginTop: 14,
      marginBottom: 8,
    },
    encryptionText: {
      color: theme.messaging.accentText,
      fontSize: 11.5,
      lineHeight: 15,
      fontFamily: theme.typography.fontFamilySemiBold,
      includeFontPadding: false,
    },
    messageList: { flex: 1, minWidth: 0 },
    /** §1.9: the DM day divider is a centred label with no rules beside it. */
    dateSeparator: { alignItems: "center", paddingTop: 4, paddingBottom: 14 },
    dateText: {
      color: theme.messaging.bubbleMeta,
      fontSize: 10.5,
      lineHeight: 14,
      letterSpacing: 1.26,
      fontFamily: theme.typography.fontFamilyExtraBold,
      textTransform: "uppercase",
    },
    messageRow: {
      width: "100%",
      minWidth: 0,
      flexDirection: "row",
      // The avatar hangs off the bottom of the group, so the row bottom-aligns.
      alignItems: "flex-end",
      gap: 8,
    },
    messageRowOwn: { justifyContent: "flex-end" },
    messageAvatar: {
      width: metrics.avatar.dmMessage,
      height: metrics.avatar.dmMessage,
      borderRadius: metrics.avatar.dmMessageRadius,
    },
    messageAvatarSpacer: { width: metrics.avatar.dmMessage, flexShrink: 0 },
    messageContent: { maxWidth: "76%", minWidth: 0, alignItems: "flex-start" },
    /** An outgoing group has no avatar, so the block indents by the same 38px. */
    messageContentOwn: { alignItems: "flex-end", paddingLeft: 38 },
    bubble: {
      minWidth: 0,
      borderRadius: metrics.bubble.radius,
      paddingTop: metrics.bubble.paddingTop,
      paddingBottom: metrics.bubble.paddingBottom,
      paddingHorizontal: metrics.bubble.paddingHorizontal,
    },
    /** §1.5: a voice note is still a bubble, but a tighter one (9/12). */
    bubbleVoice: {
      paddingTop: 9,
      paddingBottom: 9,
      paddingHorizontal: 12,
    },
    incomingBubble: {
      backgroundColor: theme.messaging.bubbleIn,
      ...theme.elevation.messageBubbleIn,
    },
    outgoingBubble: {
      backgroundColor: theme.messaging.bubbleOut,
      ...theme.elevation.messageBubbleOut,
    },
    /** §0.5: the 7px tail belongs to the last bubble of a group only. */
    incomingBubbleTail: { borderBottomLeftRadius: metrics.bubble.tailRadius },
    outgoingBubbleTail: { borderBottomRightRadius: metrics.bubble.tailRadius },
    messageBodyOwn: { color: theme.messaging.bubbleOutText },
    messageBodyIn: { color: theme.messaging.bubbleInText },
    messageRowHighlighted: {
      backgroundColor: theme.messaging.accentSoft,
      borderRadius: 14,
    },
    forwardedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginBottom: 4,
    },
    forwardedText: {
      color: theme.messaging.bubbleMeta,
      fontSize: 10.5,
      lineHeight: 14,
      fontFamily: theme.typography.fontFamilyBold,
      fontStyle: "italic",
    },
    forwardedTextOwn: { color: theme.messaging.bubbleOutMeta },
    editedText: {
      color: theme.messaging.bubbleMeta,
      fontSize: 10.5,
      lineHeight: 14,
      fontStyle: "italic",
    },
    editedTextOwn: { color: theme.messaging.bubbleOutMeta },
    /**
     * §1.4: the chip row rides 9px up onto the bubble's bottom edge. It is a
     * normal sibling with a negative top margin, not an absolute overlay — an
     * absolute row cannot push the group's own bottom spacing.
     */
    reactionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: metrics.reactionChip.gap,
      marginTop: metrics.reactionChip.dmMarginTop,
      marginLeft: metrics.reactionChip.dmMarginLeft,
    },
    reactionRowOwn: { alignSelf: "flex-start" },
    reactionButton: { minWidth: 0 },
    reactionPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      height: metrics.reactionChip.dmHeight,
      borderRadius: metrics.reactionChip.dmRadius,
      paddingHorizontal: metrics.reactionChip.paddingHorizontal,
      backgroundColor: theme.messaging.reactionOtherSurface,
      ...theme.elevation.reactionChip,
    },
    /**
     * The handoff separates the viewer's own chip with a 1.4px ring drawn as a
     * zero-offset shadow spread. RN has no spread, so the ring is a real border;
     * the height stays 25 and the content box absorbs it.
     */
    reactionPillOwnReaction: {
      backgroundColor: theme.messaging.reactionMineSurface,
      borderWidth: 1.4,
      borderColor: theme.messaging.reactionMineRing,
    },
    reactionEmoji: { fontSize: 12.5, lineHeight: 16 },
    reactionText: {
      color: theme.messaging.reactionOtherText,
      fontSize: 11,
      lineHeight: 15,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    reactionTextOwnReaction: { color: theme.messaging.reactionMineText },
    /**
     * §1.6: an outgoing file card is not a bubble, so its clock cannot ride the
     * last line of one. This is the single exception K2 allows.
     */
    attachmentMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingRight: 2,
      marginTop: 3,
    },
    attachmentMetaText: {
      color: theme.messaging.bubbleMeta,
      fontSize: 10.5,
      lineHeight: 14,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    messageFailedAction: {
      color: theme.messaging.danger,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    messageFailedRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      marginTop: 4,
    },
    messageFailedText: {
      color: theme.messaging.danger,
      fontSize: 12,
    },
    messageSendingDim: { opacity: 0.6 },
    /** §1.7: the indicator is an incoming bubble that happens to hold dots. */
    typingRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 8,
    },
    typingBubble: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: metrics.bubble.radius,
      borderBottomLeftRadius: metrics.bubble.tailRadius,
      backgroundColor: theme.messaging.bubbleIn,
      paddingVertical: 12,
      paddingHorizontal: 14,
      ...theme.elevation.messageBubbleIn,
    },
    /** §4: "↓ N yeni mesaj" — accent pill pinned to the bottom centre. */
    newMessagePill: {
      position: "absolute",
      alignSelf: "center",
      bottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      height: 34,
      borderRadius: 17,
      paddingHorizontal: 14,
      backgroundColor: theme.messaging.accent,
      ...theme.elevation.messageBubbleOut,
    },
    newMessagePillText: {
      color: theme.messaging.bubbleOutText,
      fontSize: 12,
      lineHeight: 16,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    emptyText: { color: theme.messaging.textSecondary, textAlign: "center", padding: 20 },
    errorRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
    ...createSharedStyles(theme),
  }) satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;

export const useDMChatStyles = () => useThemedStyles(createDMChatStyles);
