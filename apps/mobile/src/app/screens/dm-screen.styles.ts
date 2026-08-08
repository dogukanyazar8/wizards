import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";
import { useMemo } from "react";
import { mobileMessagingMetrics as msg } from "../../design/tokens";
import {
  scaleMobileMessagingMetric,
  useMobileMessagingScale,
} from "../../design/mobile-messaging-scale";
import type { MobileTheme } from "../../design/themes";
import { useTheme } from "../providers/mobile-theme-provider";
import { createSharedStyles } from "../styles/shared-styles";

/**
 * `scale` maps the handoff's 390pt frame onto the real screen — see
 * `mobile-messaging-scale`. It defaults to the baseline so anything reading
 * these styles without a window (tests, snapshots) still gets the design's own
 * numbers.
 */
export const createDmScreenStyles = (theme: MobileTheme, scale = 1) => {
  const mobileRadii = theme.radii;
  const mobileSizing = theme.sizing;
  const s = (value: number) => scaleMobileMessagingMetric(value, scale);

  return {
    chatScreen: {
      flex: 1,
      flexGrow: 1,
      gap: 14,
      minWidth: 0,
    },
    /** §0.5: 13px on a list row, ringed 2.5px in the screen tone. */
    dmActivePresenceDot: {
      position: "absolute",
      right: s(msg.presenceDot.offset),
      bottom: s(msg.presenceDot.offset),
      width: s(msg.presenceDot.listSize),
      height: s(msg.presenceDot.listSize),
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.messaging.online,
      borderColor: theme.messaging.screen,
      borderWidth: s(msg.presenceDot.listRingWidth),
    },
    dmActivePresencePill: {
      minHeight: 24,
      maxWidth: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderWidth: 1,
      borderColor: theme.status.success,
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.status.successSoft,
      paddingHorizontal: 8,
    },
    dmActivePresenceText: {
      color: theme.status.successText,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    dmBackButton: {
      width: mobileSizing.minTouchTarget,
      height: mobileSizing.minTouchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 15,
      backgroundColor: theme.surface.soft,
    },
    dmBackButtonText: {
      color: theme.text.primary,
      fontSize: 18,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    dmComposeButton: {
      width: msg.headerFab,
      height: msg.headerFab,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: msg.headerFabRadius,
      backgroundColor: theme.messaging.accent,
      ...theme.elevation.headerFab,
    },
    /**
     * §2 "1a".6: `padding: 10px 20px`, gap 13. K1's no-card rule reaches the
     * list too — a row is avatar + text + meta with a hairline under it, never a
     * bordered card, which is what fits 7 conversations on one screen.
     */
    dmConversationCard: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: s(msg.onlineStrip.gap),
      paddingHorizontal: s(20),
      paddingVertical: s(10),
    },
    dmConversationCardPressed: {
      backgroundColor: theme.messaging.field,
    },
    dmConversationCardSelected: {
      backgroundColor: theme.messaging.field,
    },
    dmConversationContent: {
      flex: 1,
      minWidth: 0,
      gap: s(3),
    },
    dmConversationAvatar: {
      height: s(msg.avatar.conversationList),
      width: s(msg.avatar.conversationList),
      borderRadius: s(msg.avatar.conversationListRadius),
    },
    dmConversationAvatarWrap: {
      height: s(msg.avatar.conversationList),
      width: s(msg.avatar.conversationList),
      position: "relative",
      flexShrink: 0,
    },
    /** §2 "1a".6: the hairline starts past the avatar, at 79px. */
    dmConversationHairline: {
      // Stays 1dp at every scale: a divider that grows with the row reads as a
      // rule between blocks instead of the seam the design draws.
      height: 1,
      marginLeft: s(msg.listHairlineInset.conversations),
      backgroundColor: theme.messaging.hairline,
    },
    dmConversationGroupBadge: {
      alignItems: "center",
      justifyContent: "center",
      position: "absolute",
      bottom: theme.layout.dmInbox.groupBadgeOffset,
      right: theme.layout.dmInbox.groupBadgeOffset,
      width: s(16),
      height: s(16),
      borderRadius: s(6),
      borderColor: theme.surface.base,
      borderWidth: s(2.5),
      backgroundColor: theme.accent.soft,
    },
    dmConversationFooterRow: {
      minHeight: 0,
      minWidth: 0,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 4,
    },
    dmConversationHeader: {
      minHeight: 58,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: mobileRadii.control,
      backgroundColor: theme.surface.card,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    dmConversationHeaderText: {
      flex: 1,
      minWidth: 0,
    },
    dmConversationList: {
      paddingVertical: 0,
    },
    dmConversationListViewport: {
      flex: 1,
      minHeight: 0,
      minWidth: 0,
    },
    /** §0.4 list row name: read 15/700, unread 15/800, `ls -.01em`. */
    dmConversationName: {
      flex: 1,
      minWidth: 0,
      color: theme.messaging.textPrimary,
      fontSize: s(15),
      lineHeight: s(20),
      fontFamily: theme.typography.fontFamilyBold,
      letterSpacing: msg.listType.rowNameTracking,
    },
    dmConversationNameUnread: {
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    /** §0.4 preview: read 13/500 secondary, unread 13/600 tertiary. */
    dmConversationPreview: {
      color: theme.messaging.textSecondary,
      fontSize: s(13),
      lineHeight: s(18),
      fontFamily: theme.typography.fontFamilyMedium,
    },
    dmConversationPreviewUnread: {
      color: theme.messaging.textTertiary,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    /** §2 "1a".6: time over badge, right-aligned, stacked. */
    dmConversationRightMeta: {
      flexShrink: 0,
      alignItems: "flex-end",
      gap: s(6),
    },
    dmConversationTime: {
      color: theme.messaging.listTime,
      fontSize: s(11),
      lineHeight: s(14),
      fontFamily: theme.typography.fontFamilyBold,
    },
    dmConversationTimeUnread: {
      color: theme.messaging.accent,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    /** §2 "1a".6: the preview line can carry a leading glyph (tick, mic, dots). */
    dmConversationPreviewRow: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: s(5),
    },
    dmConversationPreviewText: {
      flexShrink: 1,
      minWidth: 0,
    },
    /** §2 "1a".6.2: three 5px accent dots, then "yazıyor". */
    dmTypingDots: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(2.5),
    },
    dmTypingDot: {
      width: s(5),
      height: s(5),
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.messaging.accent,
    },
    dmTypingDotSecond: { opacity: msg.typingDotOpacity.second },
    dmTypingDotThird: { opacity: msg.typingDotOpacity.third },
    dmTypingLabel: {
      color: theme.messaging.accent,
      fontSize: s(13),
      lineHeight: s(18),
      fontFamily: theme.typography.fontFamilyBold,
    },
    /** §2 "1a".6.3: a 20px accent square holding the white @ mark. */
    dmMentionBadge: {
      width: s(20),
      height: s(20),
      alignItems: "center",
      justifyContent: "center",
      borderRadius: s(10),
      backgroundColor: theme.messaging.accent,
    },
    /** §0.4 BOT badge: 9/800 `ls .06em`, accent on accentSoft. */
    dmBotBadge: {
      borderRadius: msg.channel.botBadgeRadius,
      backgroundColor: theme.messaging.accentSoft,
      paddingHorizontal: msg.channel.botBadgePaddingHorizontal,
      paddingVertical: msg.channel.botBadgePaddingVertical,
    },
    dmBotBadgeText: {
      color: theme.messaging.accentText,
      fontSize: s(9),
      lineHeight: s(12),
      letterSpacing: msg.listType.botBadgeTracking,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    dmConversationNameRow: {
      minWidth: 0,
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: s(6),
    },
    dmConversationTitleRow: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: s(8),
    },
    /** §2 "1a".2 header band: `padding: 8px 20px 10px`, no subtitle line. */
    dmInboxHeader: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: s(12),
      paddingHorizontal: s(20),
      paddingTop: s(8),
      paddingBottom: s(10),
    },
    /**
     * Faz 5 §13.1: the header carries two actions on the Chats tab (create
     * group, then compose) and one everywhere else, so the buttons live in
     * their own row instead of being direct children of the header band.
     */
    dmInboxHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    dmInboxScreen: {
      gap: 0,
      backgroundColor: theme.messaging.screen,
    },
    /** §0.4 screen title: 23 / 800, `ls -.03em`. */
    dmInboxTitle: {
      flex: 1,
      minWidth: 0,
      color: theme.messaging.textPrimary,
      fontSize: s(msg.listType.titleSize),
      lineHeight: s(29),
      fontFamily: theme.typography.fontFamilyExtraBold,
      letterSpacing: msg.listType.titleTracking,
    },
    dmInboxBody: {
      flex: 1,
      minHeight: 0,
      minWidth: 0,
    },
    dmListCard: {
      flex: 1,
      minWidth: 0,
      paddingTop: 14,
    },
    dmSearchFilterButton: {
      width: 50,
      height: 50,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 18,
      backgroundColor: theme.surface.card,
    },
    dmSearchRow: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    dmSearchShell: {
      minHeight: 48,
      minWidth: 0,
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 16,
      backgroundColor: theme.surface.card,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    dmSectionHeaderRow: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    dmSectionTitle: {
      color: theme.text.muted,
      fontSize: 13,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    dmSummaryCard: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 18,
      backgroundColor: theme.surface.overlay,
      padding: 14,
      shadowColor: theme.accent.default,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: theme.dark ? 0 : 0.08,
      shadowRadius: 18,
      elevation: theme.dark ? 0 : 3,
    },
    dmSummaryContent: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    dmSummaryDescription: {
      color: theme.text.muted,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: theme.typography.fontFamilyBold,
    },
    dmSummaryIcon: {
      width: 42,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 16,
      backgroundColor: theme.accent.soft,
    },
    dmSummaryMetricGrid: {
      gap: 8,
      width: 88,
    },
    dmSummaryTitle: {
      color: theme.text.primary,
      fontSize: 16,
      lineHeight: 21,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    /** §2 "1a".6.1: minWidth 20, h20, r10, `padding: 0 6`. */
    dmUnreadBadge: {
      minWidth: s(20),
      overflow: "hidden",
      borderRadius: s(10),
      backgroundColor: theme.messaging.accent,
      color: theme.text.onPrimary,
      fontSize: s(11),
      fontFamily: theme.typography.fontFamilyExtraBold,
      lineHeight: s(20),
      textAlign: "center",
      paddingHorizontal: s(6),
    },
    inboxFilterButton: {
      minHeight: theme.layout.dmInbox.segmentMinHeight,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 14,
      backgroundColor: theme.surface.card,
      paddingHorizontal: 18,
    },
    inboxFilterButtonActive: {
      borderColor: theme.surface.inverse,
      borderRadius: 14,
      backgroundColor: theme.surface.inverse,
    },
    inboxFilterButtonDisabled: {
      opacity: 0.56,
    },
    inboxFilterButtonText: {
      color: theme.text.visualSecondary,
      fontSize: 13.5,
      lineHeight: 17,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    inboxFilterButtonTextActive: {
      color: theme.text.onInverse,
      fontFamily: theme.typography.fontFamilyBold,
    },
    inboxFilterButtonTextDisabled: {
      color: theme.text.soft,
    },
    inboxFilterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      minWidth: 0,
      paddingHorizontal: 24,
      paddingTop: 16,
    },
    inboxResultText: {
      color: theme.text.soft,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    inboxSearchInput: {
      minHeight: 24,
      flex: 1,
      minWidth: 0,
      color: theme.text.primary,
      fontSize: 14.5,
      fontFamily: theme.typography.fontFamily,
      paddingVertical: 0,
    },
    inboxFilterRequestCount: {
      color: theme.accent.default,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    dmInboxSearchArea: {
      paddingHorizontal: 24,
      paddingTop: 14,
      paddingBottom: 4,
    },
    dmInboxListArea: {
      flex: 1,
      minHeight: 0,
    },
    dmInboxSkeletonRow: {
      height: theme.layout.dmInbox.conversationRowMinHeight,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    dmInboxSkeletonAvatar: {
      width: 50,
      height: 50,
      borderRadius: 18,
      backgroundColor: theme.surface.card,
    },
    dmInboxSkeletonText: {
      flex: 1,
      gap: 8,
    },
    dmInboxSkeletonLine: {
      height: 13,
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.surface.card,
    },
    dmInboxSkeletonTitle: {
      maxWidth: "58%",
    },
    dmInboxEmptyState: {
      flex: 1,
      minHeight: 0,
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      paddingHorizontal: 24,
    },
    dmInboxEmptyTitle: {
      color: theme.text.visualSecondary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 15,
      textAlign: "center",
    },
    dmInboxEmptyAction: {
      minHeight: mobileSizing.minTouchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: theme.accent.action,
      paddingHorizontal: 18,
    },
    dmInboxEmptyActionText: {
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13.5,
    },
    // ---- 6A/6B unified Messages chrome (HTML lines 52-89) ----
    /**
     * §2 "1a".3. The whole band — track, item height and the 20px inset — is
     * identical on all three tabs, which is what keeps the header from shifting
     * when the segment changes.
     */
    dmSegmentTrack: {
      flexDirection: "row",
      gap: s(msg.segment.gap),
      marginHorizontal: s(20),
      borderRadius: s(msg.segment.trackRadius),
      backgroundColor: theme.messaging.segmentTrack,
      padding: s(msg.segment.trackPadding),
    },
    dmSegmentItem: {
      flex: 1,
      minWidth: 0,
      height: s(msg.segment.itemHeight),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: s(6),
      borderRadius: s(msg.segment.itemRadius),
    },
    dmSegmentItemActive: {
      backgroundColor: theme.messaging.surface,
      ...theme.elevation.segmentActive,
    },
    dmSegmentLabel: {
      color: theme.messaging.textSecondary,
      fontSize: s(13),
      lineHeight: s(17),
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    dmSegmentLabelActive: {
      color: theme.messaging.textPrimary,
      fontFamily: theme.typography.fontFamilyBold,
    },
    dmSegmentRequestBadge: {
      minWidth: s(17),
      height: s(17),
      alignItems: "center",
      justifyContent: "center",
      borderRadius: s(9),
      backgroundColor: theme.messaging.danger,
      paddingHorizontal: s(5),
    },
    dmSegmentRequestBadgeText: {
      color: theme.text.onPrimary,
      fontSize: s(10),
      lineHeight: s(13),
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    /** §2 "1a".4: `margin: 12px 20px 0`, h42 r14, no border. */
    dmUnifiedSearchWrap: {
      marginHorizontal: s(20),
      marginTop: s(12),
    },
    dmUnifiedSearchPill: {
      minWidth: 0,
      height: s(msg.searchPillHeight),
      flexDirection: "row",
      alignItems: "center",
      gap: s(9),
      borderRadius: s(msg.searchPillRadius),
      backgroundColor: theme.messaging.segmentTrack,
      paddingHorizontal: s(13),
    },
    dmUnifiedSearchInput: {
      flex: 1,
      minWidth: 0,
      color: theme.messaging.textPrimary,
      fontSize: s(13.5),
      fontFamily: theme.typography.fontFamilyMedium,
      paddingVertical: 0,
    },
    /** §2 "1a".5: group label row, `padding: 15px 20px 9px`, gap 7. */
    dmOnlineStripLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(7),
      paddingTop: s(15),
      paddingHorizontal: s(20),
      paddingBottom: s(9),
    },
    dmOnlineStripLabel: {
      color: theme.messaging.groupLabel,
      fontSize: s(11),
      lineHeight: s(14),
      letterSpacing: msg.listType.groupLabelTracking,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    dmOnlineStripCount: {
      color: theme.messaging.onlineText,
      fontSize: s(11),
      lineHeight: s(14),
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    dmConversationsSectionLabel: {
      paddingTop: s(14),
      paddingHorizontal: s(20),
      paddingBottom: s(6),
      color: theme.messaging.groupLabel,
      fontSize: s(11),
      lineHeight: s(14),
      letterSpacing: msg.listType.groupLabelTracking,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    dmOnlineStripContent: {
      flexDirection: "row",
      gap: s(msg.onlineStrip.gap),
      paddingHorizontal: s(20),
    },
    dmOnlineStripCell: {
      width: s(msg.onlineStrip.cellWidth),
      alignItems: "center",
      gap: s(6),
    },
    dmOnlineStripAvatarWrap: {
      width: s(msg.avatar.onlineStrip),
      height: s(msg.avatar.onlineStrip),
      position: "relative",
    },
    dmOnlineStripDot: {
      position: "absolute",
      right: s(msg.presenceDot.offset),
      bottom: s(msg.presenceDot.offset),
      width: s(msg.presenceDot.listSize),
      height: s(msg.presenceDot.listSize),
      borderRadius: mobileRadii.pill,
      borderWidth: s(msg.presenceDot.listRingWidth),
      borderColor: theme.messaging.screen,
      backgroundColor: theme.messaging.online,
    },
    /**
     * §2 "1a".5: someone in a voice room is NOT a dot — it is a 19x19 r7 surface
     * tile carrying the accent wave, so "talking" never reads as "online".
     */
    dmOnlineStripVoiceTile: {
      position: "absolute",
      right: s(msg.onlineStrip.voiceTileOffset),
      bottom: s(msg.onlineStrip.voiceTileOffset),
      width: s(msg.onlineStrip.voiceTileSize),
      height: s(msg.onlineStrip.voiceTileSize),
      alignItems: "center",
      justifyContent: "center",
      borderRadius: s(msg.onlineStrip.voiceTileRadius),
      borderWidth: s(msg.onlineStrip.voiceTileRingWidth),
      borderColor: theme.messaging.screen,
      backgroundColor: theme.messaging.surface,
    },
    /**
     * §2 "1a".5 on a conversation row: the same tile, sized against the smaller
     * 46px row avatar so it does not swallow the corner.
     */
    dmConversationVoiceTile: {
      position: "absolute",
      right: s(msg.onlineStrip.voiceTileOffset),
      bottom: s(msg.onlineStrip.voiceTileOffset),
      width: s(msg.presenceDot.rowVoiceTileSize),
      height: s(msg.presenceDot.rowVoiceTileSize),
      alignItems: "center",
      justifyContent: "center",
      borderRadius: s(msg.onlineStrip.voiceTileRadius),
      borderWidth: s(msg.onlineStrip.voiceTileRingWidth),
      borderColor: theme.messaging.screen,
      backgroundColor: theme.messaging.surface,
    },
    dmOnlineStripName: {
      maxWidth: s(msg.onlineStrip.cellWidth),
      color: theme.messaging.textSecondary,
      fontSize: s(10.5),
      lineHeight: s(14),
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    dmOnlineStripAddCell: {
      width: s(msg.avatar.onlineStrip),
      height: s(msg.avatar.onlineStrip),
      alignItems: "center",
      justifyContent: "center",
      borderRadius: s(msg.avatar.onlineStripRadius),
      borderWidth: s(msg.onlineStrip.addTileBorderWidth),
      borderStyle: "dashed",
      borderColor: theme.messaging.addTileBorder,
      backgroundColor: "transparent",
    },
    dmOnlineStripAddLabel: {
      color: theme.messaging.groupLabel,
      fontSize: s(10.5),
      lineHeight: s(14),
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    /**
     * Faz 5 §15.2 group creation. It shares this sheet rather than owning one
     * because it draws the same list rows, avatars and pills the inbox does —
     * a second sheet would be a second set of numbers to keep in step.
     */
    groupCreateScreen: {
      flex: 1,
      minWidth: 0,
      backgroundColor: theme.messaging.screen,
    },
    groupCreateHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(12),
      paddingHorizontal: s(20),
      paddingTop: s(8),
      paddingBottom: s(10),
    },
    groupCreateHeaderTitle: {
      flex: 1,
      minWidth: 0,
      color: theme.messaging.textPrimary,
      fontSize: s(19),
      lineHeight: s(25),
      fontFamily: theme.typography.fontFamilyExtraBold,
      letterSpacing: msg.listType.titleTracking,
    },
    groupCreateCounter: {
      color: theme.messaging.textSecondary,
      fontSize: s(13),
      lineHeight: s(18),
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    groupCreateStepLabel: {
      paddingHorizontal: s(20),
      paddingBottom: s(8),
    },
    groupCreateChipStrip: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: s(8),
      paddingHorizontal: s(20),
      paddingBottom: s(10),
    },
    groupCreateChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(6),
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.messaging.segmentTrack,
      paddingHorizontal: s(10),
      paddingVertical: s(6),
    },
    groupCreateChipText: {
      color: theme.messaging.textPrimary,
      fontSize: s(12.5),
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    groupCreateFriendRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(12),
      paddingHorizontal: s(20),
      paddingVertical: s(10),
    },
    /** Full rows stay visible but stop reading as tappable. */
    groupCreateFriendRowDisabled: {
      opacity: 0.4,
    },
    groupCreateFriendText: {
      flex: 1,
      minWidth: 0,
    },
    groupCreateFriendName: {
      color: theme.messaging.textPrimary,
      fontSize: s(14.5),
      lineHeight: s(19),
      fontFamily: theme.typography.fontFamilyBold,
    },
    groupCreateFriendUsername: {
      color: theme.messaging.textSecondary,
      fontSize: s(12.5),
      lineHeight: s(17),
      fontFamily: theme.typography.fontFamilyMedium,
    },
    groupCreateSelectionMark: {
      width: s(22),
      height: s(22),
      alignItems: "center",
      justifyContent: "center",
      borderRadius: mobileRadii.pill,
      borderWidth: 1.5,
      borderColor: theme.border.subtle,
    },
    groupCreateSelectionMarkOn: {
      borderColor: theme.messaging.accent,
      backgroundColor: theme.messaging.accent,
    },
    groupCreateIdentityBody: {
      gap: s(14),
      paddingHorizontal: s(20),
      paddingTop: s(6),
    },
    groupCreatePhotoButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: s(12),
    },
    groupCreatePhotoBadge: {
      width: s(56),
      height: s(56),
      alignItems: "center",
      justifyContent: "center",
      borderRadius: s(28),
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: theme.messaging.addTileBorder,
    },
    groupCreatePhotoLabel: {
      color: theme.messaging.textSecondary,
      fontSize: s(13.5),
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    groupCreateFieldLabel: {
      color: theme.messaging.groupLabel,
      fontSize: s(11.5),
      fontFamily: theme.typography.fontFamilyExtraBold,
      letterSpacing: 0.4,
    },
    groupCreateNameField: {
      minHeight: mobileSizing.minTouchTarget,
      justifyContent: "center",
      borderRadius: s(msg.searchPillRadius),
      backgroundColor: theme.messaging.segmentTrack,
      paddingHorizontal: s(13),
    },
    groupCreateNameInput: {
      color: theme.messaging.textPrimary,
      fontSize: s(14),
      fontFamily: theme.typography.fontFamilyMedium,
      paddingVertical: 0,
    },
    groupCreateHint: {
      color: theme.messaging.textSecondary,
      fontSize: s(12),
      lineHeight: s(17),
      fontFamily: theme.typography.fontFamilyMedium,
    },
    groupCreateFooter: {
      gap: s(8),
      paddingHorizontal: s(20),
      paddingTop: s(10),
      paddingBottom: s(16),
    },
    groupCreatePrimaryButton: {
      minHeight: mobileSizing.minTouchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: s(msg.searchPillRadius),
      backgroundColor: theme.messaging.accent,
    },
    groupCreatePrimaryButtonDisabled: {
      opacity: 0.45,
    },
    groupCreatePrimaryButtonText: {
      color: theme.messaging.surface,
      fontSize: s(14.5),
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    ...createSharedStyles(theme),
  } satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;
};

type DmScreenStyles = ReturnType<typeof createDmScreenStyles>;

/**
 * Two-level cache — theme, then scale. `useThemedStyles` keys on the theme
 * alone, and every conversation row calls this hook, so recreating the sheet per
 * row (or per rotation) is not an option.
 */
const dmScreenStyleCache = new WeakMap<MobileTheme, Map<number, DmScreenStyles>>();

export const useDmScreenStyles = (): DmScreenStyles => {
  const theme = useTheme();
  const scale = useMobileMessagingScale();

  return useMemo(() => {
    let byScale = dmScreenStyleCache.get(theme);
    if (!byScale) {
      byScale = new Map<number, DmScreenStyles>();
      dmScreenStyleCache.set(theme, byScale);
    }

    const cached = byScale.get(scale);
    if (cached) {
      return cached;
    }

    const created = StyleSheet.create(createDmScreenStyles(theme, scale)) as DmScreenStyles;
    byScale.set(scale, created);
    return created;
  }, [scale, theme]);
};
