import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import type { MobileTheme } from "../../design/themes";
import { mobileMessagingMetrics } from "../../design/tokens";
import { useThemedStyles } from "../providers/mobile-theme-provider";
import { createSharedStyles } from "../styles/shared-styles";

const metrics = mobileMessagingMetrics;

export const createMessagePrimitiveStyles = (theme: MobileTheme) => {
  const mobileRadii = theme.radii;
  const mobileSizing = theme.sizing;

  return {
    dmMessageAuthor: {
      flex: 1,
      minWidth: 0,
      color: theme.text.primary,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    dmMessageBody: {
      marginTop: 5,
      color: theme.text.primary,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    // --- Messaging redesign primitives (handoff §1). One implementation each;
    // DM, channel and thread all render through these.
    /** §1.1: the clock rides the last line of the bubble, never its own row. */
    messageTimestampInline: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 9,
    },
    messageTimestampInlineMeta: {
      flexDirection: "row",
      alignItems: "center",
      flexGrow: 0,
      flexShrink: 0,
      gap: 3,
      paddingBottom: 1,
    },
    messageTimestampInlineText: {
      color: theme.messaging.bubbleMeta,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 10.5,
    },
    messageTimestampInlineTextOutgoing: {
      color: theme.messaging.bubbleOutMeta,
    },
    /** §1.3: no fill and no box — a rule, a name and one clipped line. */
    messageInlineReplyQuote: {
      borderLeftColor: theme.messaging.replyQuoteRule,
      borderLeftWidth: 2.5,
      flexDirection: "column",
      gap: 1,
      marginBottom: 6,
      paddingLeft: 8,
      paddingVertical: 1,
    },
    messageInlineReplyQuoteOutgoing: {
      borderLeftColor: theme.messaging.bubbleOutQuote,
    },
    messageInlineReplyQuoteName: {
      color: theme.messaging.replyQuoteName,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 11.5,
    },
    messageInlineReplyQuoteNameOutgoing: {
      color: theme.messaging.bubbleOutQuote,
    },
    messageInlineReplyQuoteText: {
      color: theme.messaging.replyQuoteText,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 12.5,
      maxWidth: 196,
    },
    messageInlineReplyQuoteTextOutgoing: {
      color: theme.messaging.bubbleOutQuote,
    },
    /** §1.7: 6px inside a DM bubble, 5px in the channel and the inbox row. */
    messageTypingDots: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    messageTypingDotBubble: {
      backgroundColor: theme.messaging.typingDot,
      borderRadius: 3,
      height: 6,
      width: 6,
    },
    messageTypingDotCompact: {
      backgroundColor: theme.messaging.accent,
      borderRadius: 2.5,
      height: 5,
      width: 5,
    },
    /** §2 "1e".12: an inline pill — 700 accent on the mention fill, r6, 1/5. */
    messageMention: {
      backgroundColor: theme.messaging.mentionPill,
      borderRadius: 6,
      color: theme.messaging.accentText,
      fontFamily: theme.typography.fontFamilyBold,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    /** Inside a filled outgoing bubble the accent tints stop reading at all. */
    messageLinkOnAccent: { color: theme.messaging.bubbleOutText },
    messageMentionOnAccent: {
      backgroundColor: theme.messaging.bubbleOutQuote,
      color: theme.messaging.bubbleOut,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    /** 10a: your own handle reads a shade stronger than everyone else's. */
    messageMentionSelf: {
      backgroundColor: theme.mention.selfBackground,
    },
    messageReplyQuote: {
      borderLeftColor: theme.accent.strong,
      borderLeftWidth: 3,
      color: theme.text.muted,
      fontSize: 12,
      lineHeight: 17,
      marginBottom: 6,
      paddingLeft: 8,
    },
    dmMessageHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
    },
    dmMessageList: {
      minHeight: 96,
      maxHeight: 360,
      minWidth: 0,
    },
    dmMessageListContent: {
      gap: 8,
      paddingVertical: 2,
    },
    dmMessageTime: {
      color: theme.text.soft,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    /**
     * §1.6 file card. It is a card in both directions — on the outgoing side it
     * stays a card instead of becoming a bubble, which is why its clock needs
     * the separate meta row K2 otherwise forbids.
     */
    messageAttachmentCard: {
      minWidth: 236,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      borderRadius: 18,
      backgroundColor: theme.messaging.bubbleIn,
      paddingVertical: 9,
      paddingHorizontal: 13,
      ...theme.elevation.messageBubbleIn,
    },
    messageAttachmentIcon: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 13,
      backgroundColor: theme.messaging.dangerSurface,
    },
    messageAttachmentIconText: {
      color: theme.messaging.danger,
      fontSize: 10,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    messageAttachmentImage: {
      width: 38,
      height: 38,
      borderRadius: 13,
      backgroundColor: theme.messaging.accentSoft,
    },
    messageAttachmentInfo: {
      color: theme.messaging.groupLabel,
      fontSize: 11.5,
      lineHeight: 15,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    messageAttachmentList: {
      gap: 7,
      minWidth: 0,
    },
    messageAttachmentMeta: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    messageAttachmentName: {
      color: theme.messaging.textPrimary,
      fontSize: 13.5,
      lineHeight: 18,
      fontFamily: theme.typography.fontFamilyBold,
    },
    /** §2 "1e".7: 15/600 accent, underlined in the accent at 35%. */
    messageLink: {
      color: theme.messaging.accentText,
      fontFamily: theme.typography.fontFamilySemiBold,
      textDecorationLine: "underline",
      textDecorationColor: theme.messaging.linkUnderline,
    },
    messageDateLine: {
      height: 1,
      flex: 1,
      backgroundColor: theme.border.subtle,
    },
    messageDateSeparator: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
    },
    messageDateText: {
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.surface.card,
      color: theme.text.soft,
      fontSize: 10,
      fontFamily: theme.typography.fontFamilyExtraBold,
      letterSpacing: 0.8,
      paddingHorizontal: 12,
      paddingVertical: 4,
      textTransform: "uppercase",
    },
    messageFailedAction: {
      color: theme.status.dangerOnBase,
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
      color: theme.status.dangerOnBase,
      fontSize: 12,
    },
    messageSendingDim: {
      opacity: 0.6,
    },
    messageForwardedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginBottom: 4,
    },
    messageForwardedText: {
      color: theme.text.visualFaint,
      fontSize: 10.5,
      lineHeight: 14,
      fontFamily: theme.typography.fontFamilyBold,
      fontStyle: "italic",
    },
    /**
     * §1.9: the channel day divider is a centred label with a rule on each side
     * (the DM one, drawn in `dm-chat-primitives`, has no rules at all).
     */
    messageDateSeparatorChannel: {
      gap: 10,
      paddingBottom: 10,
      paddingHorizontal: metrics.channel.rowPaddingHorizontal,
      paddingTop: 6,
    },
    messageDateLineChannel: {
      flex: 1,
      height: 1,
      backgroundColor: theme.messaging.divider,
    },
    messageDateTextChannel: {
      borderWidth: 0,
      borderRadius: 0,
      color: theme.messaging.bubbleMeta,
      fontSize: 10.5,
      lineHeight: 14,
      fontFamily: theme.typography.fontFamilyExtraBold,
      letterSpacing: 1.26,
      paddingHorizontal: 0,
      paddingVertical: 0,
      textTransform: "uppercase",
    },
    messageListSkeleton: {
      width: "100%",
      gap: 14,
      paddingVertical: 8,
    },
    messageListSkeletonBubble: {
      flex: 1,
      minWidth: 0,
      gap: 8,
    },
    messageListSkeletonRow: {
      width: "100%",
      minWidth: 0,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    /** §0.4: 13.5/800 with the tight heading tracking. */
    messagePreviewAuthorChannel: {
      flex: 0,
      color: theme.messaging.textPrimary,
      fontSize: 13.5,
      lineHeight: 18,
      letterSpacing: -0.135,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    messagePreviewBodyChannel: {
      marginTop: 0,
      color: theme.messaging.textPrimary,
      // Size and line height come from the punto hook, merged after this.
      letterSpacing: -0.075,
      fontFamily: theme.typography.fontFamilyMedium,
    },
    /** §0.4 BOT badge — accent on accent-soft, never an emoji. */
    messagePreviewBotBadge: {
      alignItems: "center",
      justifyContent: "center",
      borderRadius: metrics.channel.botBadgeRadius,
      backgroundColor: theme.messaging.accentSoft,
      paddingHorizontal: metrics.channel.botBadgePaddingHorizontal,
      paddingVertical: metrics.channel.botBadgePaddingVertical,
    },
    messagePreviewBotBadgeText: {
      color: theme.messaging.accentText,
      fontSize: 9,
      lineHeight: 12,
      letterSpacing: 0.54,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    messagePreviewBubble: {
      flexShrink: 1,
      maxWidth: "86%",
      minWidth: 0,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 18,
      borderBottomLeftRadius: 8,
      backgroundColor: theme.surface.soft,
      paddingHorizontal: 11,
      paddingVertical: 9,
    },
    /**
     * K1: a channel message has no box. This is not a "thinner card" — the
     * bubble style is never applied in channel mode, so there is nothing here
     * to fill, frame or raise; it is pure layout.
     */
    messagePreviewBubbleChannel: {
      alignSelf: "stretch",
      flexShrink: 1,
      maxWidth: "100%",
      minWidth: 0,
      gap: 3,
    },
    messagePreviewBubbleOwn: {
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 8,
      borderColor: theme.border.subtle,
      backgroundColor: theme.accent.soft,
    },
    messagePreviewHeaderChannel: {
      alignItems: "baseline",
      gap: 7,
    },
    messagePreviewOwnerBadge: {
      width: 14,
      height: 14,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 4,
      backgroundColor: theme.accent.ownerBadge,
    },
    messagePreviewOwnerBadgeText: {
      fontSize: 9,
      lineHeight: 12,
    },
    messagePreviewChannelContent: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    messagePreviewRow: {
      width: "100%",
      minWidth: 0,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
    },
    /** §2 "1e".5: the row carries the 16px inset the flow gave up. */
    messagePreviewRowChannel: {
      gap: metrics.channel.rowGap,
      paddingHorizontal: metrics.channel.rowPaddingHorizontal,
      paddingVertical: metrics.channel.rowPaddingVertical,
    },
    messagePreviewRowChannelCompact: {
      paddingVertical: Math.max(4, metrics.channel.rowPaddingVertical - 3),
    },
    /**
     * §1.2: a continuation drops the avatar and indents to 61px instead — row
     * padding (16) + avatar (34) + row gap (11), so the body stays pixel-aligned
     * with the first message of the group.
     */
    messagePreviewRowChannelContinuation: {
      paddingBottom: metrics.channel.continuationPaddingBottom,
      paddingLeft: metrics.channel.continuationPaddingLeft,
      paddingRight: metrics.channel.continuationPaddingRight,
      paddingTop: metrics.channel.continuationPaddingTop,
    },
    messagePreviewRowChannelActive: {
      backgroundColor: theme.messageMenu.rowHighlight,
    },
    // §2 "1e".12: a message that names you takes the mention fill and the accent
    // stripe; stripe + padding still add up to the row's 16px inset.
    messagePreviewRowChannelMention: {
      backgroundColor: theme.messaging.mentionRow,
      borderLeftColor: theme.messaging.accent,
      borderLeftWidth: metrics.channel.mentionRowStripeWidth,
      paddingLeft: metrics.channel.mentionRowPaddingLeft,
      paddingRight: metrics.channel.rowPaddingHorizontal,
      paddingVertical: metrics.channel.mentionRowPaddingVertical,
    },
    /** A mentioning continuation keeps the 61px body, minus the stripe. */
    messagePreviewRowChannelMentionContinuation: {
      paddingLeft: metrics.channel.continuationPaddingLeft - metrics.channel.mentionRowStripeWidth,
    },
    messagePreviewTimeChannel: {
      color: theme.messaging.bubbleMeta,
      fontSize: 10.5,
      fontFamily: theme.typography.fontFamilySemiBold,
      lineHeight: 14,
    },
    messagePreviewRowOwn: {
      justifyContent: "flex-end",
    },
    // 8c reaction chips: white base, accent own-reaction, dashed add chip.
    messageReactionChip: {
      minHeight: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 11,
      backgroundColor: theme.surface.card,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    messageReactionChipOwn: {
      backgroundColor: theme.accent.soft,
      borderColor: theme.accent.default,
    },
    messageReactionEmoji: {
      fontSize: 12,
      lineHeight: 16,
    },
    messageReactionCount: {
      color: theme.text.visualSecondary,
      fontSize: 11,
      lineHeight: 15,
      fontFamily: theme.typography.fontFamilyBold,
    },
    messageReactionCountOwn: {
      color: theme.accent.strong,
    },
    messageReactionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 6,
      marginTop: 8,
      minWidth: 0,
    },
    /** §1.4: in the channel the chips sit under the body, not on a bubble edge. */
    messageReactionRowChannel: {
      gap: metrics.reactionChip.gap,
      marginTop: metrics.reactionChip.channelMarginTop,
    },
    messageReactionChipChannel: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      height: metrics.reactionChip.channelHeight,
      borderRadius: metrics.reactionChip.channelRadius,
      borderWidth: 0,
      backgroundColor: theme.messaging.field,
      paddingHorizontal: 9,
      paddingVertical: 0,
    },
    /** §1.4: my own reaction is the one with the 1.4px ring. */
    messageReactionChipChannelOwn: {
      backgroundColor: theme.messaging.reactionMineSurface,
      borderColor: theme.messaging.reactionMineRing,
      borderWidth: 1.4,
    },
    /** §2 "1f".2: on the screen-tone thread source block they flip to surface. */
    messageReactionChipChannelOnScreen: {
      backgroundColor: theme.messaging.surface,
    },
    messageReactionEmojiChannel: {
      fontSize: 12.5,
      lineHeight: 17,
    },
    messageReactionCountChannel: {
      color: theme.messaging.reactionOtherText,
      fontSize: 11,
      lineHeight: 15,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    messageReactionCountChannelOwn: {
      color: theme.messaging.reactionMineText,
    },
    messageReactionAddChipChannel: {
      width: metrics.reactionChip.channelHeight,
      height: metrics.reactionChip.channelHeight,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 0,
      borderRadius: metrics.reactionChip.channelRadius,
      backgroundColor: theme.messaging.field,
    },
    // 8c compact reply line above the channel author row.
    messageReplyLineChannel: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minWidth: 0,
    },
    messageReplyLineText: {
      flex: 1,
      minWidth: 0,
      color: theme.text.visualSecondary,
      fontSize: 11.5,
      lineHeight: 15,
    },
    messageReplyLineName: {
      color: theme.accent.strong,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    messageReplyLineQuote: {
      color: theme.text.visualPlaceholder,
    },
    /**
     * §2 "1e".9 thread indicator: an accent-soft block, not a card. The facepile
     * borders are the block's own fill, so the avatars punch out of it.
     */
    messageThreadCard: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: metrics.channel.threadIndicatorGap,
      maxWidth: 270,
      minWidth: 0,
      borderWidth: 0,
      borderRadius: metrics.channel.threadIndicatorRadius,
      backgroundColor: theme.messaging.accentSoft,
      paddingLeft: 6,
      paddingRight: 10,
      paddingVertical: 5,
      marginTop: 7,
    },
    messageThreadFacepile: {
      flexDirection: "row",
    },
    messageThreadFace: {
      borderColor: theme.messaging.accentSoft,
      borderRadius: metrics.avatar.threadIndicatorRadius,
      borderWidth: metrics.channel.threadIndicatorFaceBorderWidth,
    },
    messageThreadFaceOverlap: {
      marginLeft: metrics.channel.threadIndicatorFaceOverlap,
    },
    messageThreadReplyCount: {
      color: theme.messaging.accentText,
      fontSize: 12,
      lineHeight: 16,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    messageThreadLastReply: {
      flexShrink: 1,
      minWidth: 0,
      color: theme.messaging.groupLabel,
      fontSize: 11.5,
      lineHeight: 15,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    // 10e replaced the 8c floating action bar with the full action menu; the
    // pressed tint stays for the inline cards that survived it.
    messageRowCardPressed: {
      backgroundColor: theme.surface.soft,
    },
    // §1.9 "YENİ": the danger rule and label, sitting right above the first
    // unread message and pinned there while the screen stays open.
    channelUnreadSeparator: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minWidth: 0,
      paddingBottom: 8,
      paddingHorizontal: metrics.channel.rowPaddingHorizontal,
      paddingTop: 4,
    },
    channelUnreadSeparatorLine: {
      flex: 1,
      height: 1,
      backgroundColor: theme.messaging.newDivider,
    },
    channelUnreadSeparatorLabel: {
      color: theme.messaging.danger,
      fontSize: 10,
      lineHeight: 13,
      fontFamily: theme.typography.fontFamilyExtraBold,
      letterSpacing: 1.2,
    },
    /** §2 "1e".10: a join/leave event is an icon line, never a message row. */
    channelSystemEventRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      minWidth: 0,
      paddingLeft: metrics.channel.systemRowPaddingLeft,
      paddingRight: metrics.channel.rowPaddingHorizontal,
      paddingVertical: metrics.channel.systemRowPaddingVertical,
    },
    channelSystemEventText: {
      flex: 1,
      minWidth: 0,
      color: theme.messaging.systemEventText,
      fontSize: 12,
      lineHeight: 16,
      fontFamily: theme.typography.fontFamilyMedium,
    },
    channelSystemEventName: {
      color: theme.messaging.textTertiary,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    messageSearchButton: {
      minHeight: mobileSizing.minTouchTarget,
      justifyContent: "center",
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.accent.action,
      paddingHorizontal: 12,
    },
    messageSearchButtonDisabled: {
      opacity: 0.52,
    },
    messageSearchButtonText: {
      color: theme.text.onPrimary,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    messageSearchCard: {
      gap: 8,
      minWidth: 0,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: mobileRadii.control,
      backgroundColor: theme.surface.soft,
      padding: 10,
    },
    messageSearchClearButton: {
      width: mobileSizing.minTouchTarget,
      height: mobileSizing.minTouchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.surface.card,
    },
    messageSearchClearText: {
      color: theme.text.muted,
      fontSize: 13,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    messageSearchErrorText: {
      borderWidth: 1,
      borderColor: theme.status.danger,
      borderRadius: 14,
      backgroundColor: theme.status.dangerSoft,
      color: theme.status.onStatus,
      fontSize: 11,
      lineHeight: 16,
      fontFamily: theme.typography.fontFamilyExtraBold,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    messageSearchHelperText: {
      color: theme.text.muted,
      fontSize: 11,
      lineHeight: 16,
      fontFamily: theme.typography.fontFamilyBold,
    },
    messageSearchIcon: {
      color: theme.accent.strong,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
      letterSpacing: 0.7,
      textTransform: "uppercase",
    },
    messageSearchInput: {
      minHeight: mobileSizing.minTouchTarget,
      flex: 1,
      minWidth: 0,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 16,
      backgroundColor: theme.surface.card,
      color: theme.text.primary,
      fontSize: 13,
      fontFamily: theme.typography.fontFamilyBold,
      paddingHorizontal: 11,
      paddingVertical: 0,
    },
    messageSearchInputShell: {
      minHeight: 46,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    messageSearchResultBody: {
      marginTop: 4,
      color: theme.text.primary,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    messageSearchResultCount: {
      minWidth: 28,
      overflow: "hidden",
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.accent.soft,
      color: theme.accent.strong,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
      paddingHorizontal: 8,
      paddingVertical: 4,
      textAlign: "center",
    },
    messageSearchResultList: {
      gap: 7,
      minWidth: 0,
    },
    messageSearchResultMeta: {
      marginTop: 4,
      color: theme.accent.strong,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    messageSearchResultRow: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      borderRadius: 16,
      backgroundColor: theme.surface.card,
      padding: 9,
    },
    messageSearchResultText: {
      flex: 1,
      minWidth: 0,
    },
    messageSearchResults: {
      gap: 8,
      minWidth: 0,
    },
    messageSearchResultsHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
    },
    messageSearchResultsTitle: {
      flex: 1,
      minWidth: 0,
      color: theme.text.primary,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    messageSearchStatusRow: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
    },
    messageSearchStatusText: {
      color: theme.text.muted,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    ...createSharedStyles(theme),
  } satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;
};

export const useMessagePrimitiveStyles = () => useThemedStyles(createMessagePrimitiveStyles);
