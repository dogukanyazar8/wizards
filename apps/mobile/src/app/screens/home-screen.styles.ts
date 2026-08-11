import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import type { MobileTheme } from "../../design/themes";
import { useThemedStyles } from "../providers/mobile-theme-provider";
import { createSharedStyles } from "../styles/shared-styles";

export const createHomeScreenStyles = (theme: MobileTheme) => {
  const mobileRadii = theme.radii;
  const mobileSizing = theme.sizing;
  // 6a/6b: every value the servers screen redesign touches comes from this
  // group (Faz 2 §2.1) — a colour or a measurement written as a literal here
  // would be a value the two themes cannot both answer for.
  const workspace = theme.workspace;
  const homeScreenStyles = {
    cardHeaderText: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    channelMentionBadge: {
      minWidth: 22,
      overflow: "hidden",
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.accent.action,
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11,
      includeFontPadding: false,
      lineHeight: 22,
      textAlign: "center",
      paddingHorizontal: 6,
    },
    // 1a/1b: a channel that mentions you shows a red @n badge; a plain unread
    // shows the primary n badge (mobileWorkspaceUnreadBadge). Priority order is
    // enforced by getMobileChannelPriority.
    mobileWorkspaceChannelMentionBadge: {
      minWidth: 18,
      overflow: "hidden",
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.mention.badge,
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 10,
      includeFontPadding: false,
      lineHeight: 18,
      textAlign: "center",
      paddingHorizontal: 5,
    },
    compactList: {
      gap: 8,
      paddingVertical: 1,
    },
    compactListViewport: {
      minHeight: 54,
      maxHeight: 360,
      minWidth: 0,
    },
    compactListMeta: {
      marginTop: 2,
      color: theme.text.muted,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyBold,
    },
    compactListRow: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minWidth: 0,
      borderRadius: mobileRadii.control,
      backgroundColor: theme.surface.card,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    compactListRowButton: {
      borderWidth: 1,
      borderColor: theme.surface.base,
    },
    compactListRowPressed: {
      opacity: 0.86,
    },
    compactListRowSelected: {
      borderColor: theme.border.subtle,
      backgroundColor: theme.accent.soft,
    },
    compactListText: {
      flex: 1,
      minWidth: 0,
    },
    compactListTitle: {
      flex: 1,
      minWidth: 0,
      color: theme.text.primary,
      fontSize: 14,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    compactListTitleRow: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    continueActionBadge: {
      minWidth: 24,
      overflow: "hidden",
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.accent.action,
      color: theme.text.onPrimary,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
      lineHeight: 22,
      textAlign: "center",
      paddingHorizontal: 7,
    },
    continueActionIcon: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: mobileRadii.control,
      backgroundColor: theme.accent.soft,
    },
    continueActionIconServer: {
      backgroundColor: theme.surface.soft,
    },
    continueActionIconText: {
      color: theme.accent.strong,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    continueActionIconVoice: {
      backgroundColor: theme.surface.soft,
    },
    continueActionList: {
      gap: 8,
      minWidth: 0,
    },
    continueActionRow: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minWidth: 0,
      borderWidth: 1,
      borderColor: theme.surface.base,
      borderRadius: 16,
      backgroundColor: theme.surface.soft,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    continueActionRowDisabled: {
      opacity: 0.66,
    },
    continueActionText: {
      flex: 1,
      minWidth: 0,
    },
    continueCard: {
      gap: 10,
      minWidth: 0,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 18,
      backgroundColor: theme.surface.card,
      padding: 12,
    },
    homeGreetingHeader: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minWidth: 0,
    },
    homeGreetingSubtitle: {
      marginTop: 2,
      color: theme.text.muted,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyBold,
    },
    homeGreetingText: {
      flex: 1,
      minWidth: 0,
    },
    homeGreetingTitle: {
      color: theme.text.primary,
      fontSize: 16,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    homeMetricGrid: {
      flexDirection: "row",
      gap: 8,
      minWidth: 0,
    },
    homeNotificationButton: {
      width: mobileSizing.minTouchTarget,
      height: mobileSizing.minTouchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 16,
      backgroundColor: theme.surface.card,
    },
    homeNotificationButtonText: {
      color: theme.text.primary,
      fontSize: 15,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    homePrimaryServerMeta: {
      marginTop: 2,
      color: theme.text.onPrimary,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    homePrimaryServerRow: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
    },
    homePrimaryServerText: {
      flex: 1,
      minWidth: 0,
    },
    homePrimaryServerTitle: {
      color: theme.text.onPrimary,
      fontSize: 18,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    homeScreen: {
      flex: 1,
      flexGrow: 1,
      gap: 12,
      minWidth: 0,
    },
    homeSectionCard: {
      gap: 10,
      minWidth: 0,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 18,
      backgroundColor: theme.surface.card,
      padding: 12,
    },
    homeSummaryCard: {
      gap: 12,
      minWidth: 0,
      borderRadius: 18,
      backgroundColor: theme.accent.action,
      padding: 14,
      shadowColor: theme.accent.action,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.18,
      shadowRadius: 18,
      elevation: 4,
    },
    // 6a B1: 62px rail, 42px avatars at r15, 11px apart.
    mobileServerRail: {
      width: workspace.railWidth,
      alignItems: "center",
      paddingVertical: 12,
    },
    mobileServerRailScroll: {
      flex: 1,
      width: workspace.railWidth,
    },
    // 1a rail create/join entry. The dashed outline is the design system's "create"
    // marker (shared with the 1c new-server row), but it now sits on the accent tint
    // instead of a bare card so the tile reads as an action next to the avatars.
    mobileServerRailAddButton: {
      width: workspace.railAvatarSize,
      height: workspace.railAvatarSize,
      alignItems: "center",
      justifyContent: "center",
      borderStyle: "dashed",
      borderWidth: 2,
      borderColor: theme.accent.default,
      borderRadius: workspace.railAvatarRadius,
      backgroundColor: theme.accent.soft,
    },
    // Gradient layer that fades in while the tile is pressed. It sits over the border
    // box (hence the negative inset and the +2 radius) so the pressed state is one
    // solid squircle instead of a gradient with a dashed outline stitched around it.
    mobileServerRailAddFill: {
      position: "absolute",
      top: -2,
      right: -2,
      bottom: -2,
      left: -2,
      borderRadius: 18,
      overflow: "hidden",
    },
    mobileServerRailAddFillGradient: {
      flex: 1,
    },
    mobileServerRailAddIcon: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    // Attention wave behind the tile while the member has no servers yet.
    mobileServerRailAddPulse: {
      position: "absolute",
      width: workspace.railAvatarSize,
      height: workspace.railAvatarSize,
      borderRadius: workspace.railAvatarRadius,
      backgroundColor: theme.accent.default,
    },
    // The same ring slot the server avatars use, so the (+) stays optically centred.
    mobileServerRailAddSlot: {
      width:
        workspace.railAvatarSize +
        2 * (workspace.railActiveRing.innerWidth + workspace.railActiveRing.outerWidth),
      height:
        workspace.railAvatarSize +
        2 * (workspace.railActiveRing.innerWidth + workspace.railActiveRing.outerWidth),
      alignItems: "center",
      justifyContent: "center",
    },
    // Pinned action zone under the scrolling server list.
    mobileServerRailFooter: {
      alignItems: "center",
      gap: 10,
      paddingTop: 8,
    },
    mobileServerRailBadge: {
      position: "absolute",
      right: -3,
      top: -3,
      minWidth: workspace.mentionBadge.minWidth - 1,
      overflow: "hidden",
      borderWidth: 2,
      borderColor: theme.surface.base,
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.mention.badge,
      color: theme.text.onPrimary,
      fontSize: 9.5,
      fontFamily: theme.typography.fontFamilyExtraBold,
      lineHeight: 13,
      paddingHorizontal: 4,
      textAlign: "center",
    },
    // 1a rail: a server with unread but no mention shows a small primary dot
    // (no number) instead of the red count badge.
    mobileServerRailUnreadDot: {
      position: "absolute",
      right: -2,
      top: -2,
      width: 11,
      height: 11,
      borderRadius: mobileRadii.pill,
      borderWidth: 2,
      borderColor: theme.surface.base,
      backgroundColor: theme.accent.default,
    },
    // Splits the rail into "servers you are in" and the create/join action, so the (+)
    // stops reading as one more (empty) server.
    mobileServerRailDivider: {
      width: workspace.railDivider.width,
      height: workspace.railDivider.height,
      borderRadius: mobileRadii.pill,
      backgroundColor: workspace.railDivider.color,
    },
    // 1a rail: the 44px avatar sits inside a 52px ring slot so the active server
    // can draw the handoff's "2px screen-bg gap + 2px primary ring" without
    // shifting the inactive avatars.
    // The avatar sits inside a slot two ring widths wider, so the active
    // server can draw 6a's "2px screen-bg gap + 2px primary" without shifting
    // the inactive avatars.
    mobileServerRailItem: {
      position: "relative",
      width:
        workspace.railAvatarSize +
        2 * (workspace.railActiveRing.innerWidth + workspace.railActiveRing.outerWidth),
      height:
        workspace.railAvatarSize +
        2 * (workspace.railActiveRing.innerWidth + workspace.railActiveRing.outerWidth),
      alignItems: "center",
      justifyContent: "center",
      borderRadius: workspace.railAvatarRadius + workspace.railActiveRing.innerWidth * 2,
    },
    mobileServerRailItemActive: {
      backgroundColor: workspace.railActiveRing.inner,
      borderColor: workspace.railActiveRing.outer,
      borderWidth: workspace.railActiveRing.outerWidth,
    },
    mobileServerRailAvatarWrap: {
      height: workspace.railAvatarSize,
      position: "relative",
      width: workspace.railAvatarSize,
    },
    // 6a: a 4x28 bar on the left edge of the active tile, rounded on its right.
    mobileServerRailActiveIndicator: {
      position: "absolute",
      left: -9,
      width: workspace.railActiveBar.width,
      height: workspace.railActiveBar.height,
      borderBottomRightRadius: workspace.railActiveBar.radius,
      borderTopRightRadius: workspace.railActiveBar.radius,
      backgroundColor: workspace.railActiveBar.color,
    },
    mobileServerRailList: {
      alignItems: "center",
      gap: workspace.railGap,
      minWidth: 0,
    },
    mobileServerRailLogo: {
      display: "none",
    },
    // 1b channel row icon box; the rail (1a) uses the 30px twin below.
    mobileWorkspaceChannelIcon: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 11,
      backgroundColor: theme.surface.card,
    },
    mobileWorkspaceChannelIconRail: {
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 10,
      backgroundColor: theme.surface.card,
    },
    mobileWorkspaceChannelIconSelected: {
      borderWidth: 0,
      backgroundColor: theme.surface.card,
    },
    mobileWorkspaceChannelIconVoice: {
      borderWidth: 0,
      backgroundColor: theme.status.successSoft,
    },
    mobileWorkspaceChannelList: {
      gap: 2,
      minWidth: 0,
    },
    // Last-message preview under the channel name. The row tone picks the colour:
    // base = unread/active (muted), Strong = a row that mentions you, Faint = read.
    mobileWorkspaceChannelMeta: {
      marginTop: 1,
      color: theme.text.visualSecondary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 11.5,
      includeFontPadding: false,
      lineHeight: 15,
    },
    mobileWorkspaceChannelMetaStrong: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    mobileWorkspaceChannelMetaFaint: {
      color: theme.text.visualPlaceholder,
    },
    mobileWorkspaceChannelMetaMentionToken: {
      color: theme.accent.default,
      fontFamily: theme.typography.fontFamilyBold,
    },
    mobileWorkspaceChannelName: {
      flex: 1,
      minWidth: 0,
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 14.5,
      includeFontPadding: false,
      lineHeight: 18,
    },
    mobileWorkspaceChannelNameActive: {
      color: theme.accent.strong,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    // Unread/mention rows carry the name in extra-bold ink; read rows drop to muted.
    mobileWorkspaceChannelNameStrong: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileWorkspaceChannelNameMuted: {
      color: theme.text.visualSecondary,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    mobileWorkspaceChannelRow: {
      minHeight: 50,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    mobileWorkspaceChannelRowActive: {
      backgroundColor: theme.accent.soft,
    },
    mobileWorkspaceChannelRowRail: {
      minHeight: 46,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    mobileWorkspaceChannelRowRailActive: {
      backgroundColor: theme.accent.soft,
    },
    // Right column of every channel row: timestamp, and the badge under it.
    mobileWorkspaceChannelTrailing: {
      alignItems: "flex-end",
      gap: 3,
    },
    mobileWorkspaceChannelTimestamp: {
      color: theme.text.visualPlaceholder,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 10.5,
      includeFontPadding: false,
      lineHeight: 14,
    },
    mobileWorkspaceChannelText: {
      flex: 1,
      minWidth: 0,
    },
    mobileWorkspaceChannelTextRail: {
      flex: 1,
      minWidth: 0,
    },
    mobileWorkspaceChannelHash: {
      color: theme.text.visualFaint,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 16,
      includeFontPadding: false,
      lineHeight: 20,
    },
    mobileWorkspaceChannelHashActive: {
      color: theme.accent.default,
    },
    /** A row still holding unread darkens its `#` to ink; a read row keeps it faint. */
    mobileWorkspaceChannelHashStrong: {
      color: theme.text.primary,
    },
    mobileWorkspaceChannelHashRail: {
      color: theme.text.visualFaint,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 15,
      includeFontPadding: false,
      lineHeight: 18,
      width: 15,
      textAlign: "center",
    },
    mobileWorkspaceChannelHashRailActive: {
      color: theme.accent.default,
    },
    mobileWorkspaceChannelNameRail: {
      flex: 1,
      minWidth: 0,
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 14,
      includeFontPadding: false,
      lineHeight: 18,
    },
    mobileWorkspaceChannelNameRailActive: {
      color: theme.accent.strong,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileWorkspaceVoiceAvatars: {
      alignItems: "center",
      flexDirection: "row",
      marginLeft: 4,
    },
    mobileWorkspaceVoicePresenceText: {
      color: theme.status.visualText,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11,
      includeFontPadding: false,
      lineHeight: 15,
    },
    // 1a/1b live voice channel card: bordered row + success icon + Katıl pill.
    mobileWorkspaceLiveRow: {
      alignItems: "center",
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginBottom: 6,
      minHeight: 50,
      minWidth: 0,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    mobileWorkspaceLiveText: { flex: 1, gap: 1, minWidth: 0 },
    mobileWorkspaceLiveName: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 14.5,
      includeFontPadding: false,
      lineHeight: 18,
    },
    mobileWorkspaceLiveNameRail: {
      fontSize: 14,
    },
    mobileWorkspaceJoinPill: {
      alignItems: "center",
      backgroundColor: theme.status.visualText,
      borderRadius: 11,
      justifyContent: "center",
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    mobileWorkspaceJoinPillText: {
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 11.5,
      includeFontPadding: false,
      lineHeight: 15,
    },
    mobileWorkspaceEmpty: {
      gap: 8,
      minWidth: 0,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: mobileRadii.card,
      backgroundColor: theme.surface.card,
      padding: 14,
    },
    // 1b server pill: a card that opens the 1c switcher. 1a keeps the title bare
    // on the screen background instead (mobileWorkspaceHeaderRail).
    mobileWorkspaceHeader: {
      ...theme.elevation.headerCard,
      flex: 1,
      minHeight: 54,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 18,
      backgroundColor: theme.surface.card,
      paddingLeft: 8,
      paddingRight: 12,
      paddingVertical: 8,
    },
    mobileWorkspaceHeaderCompact: {
      flex: 1,
      minWidth: 0,
    },
    mobileWorkspaceHeaderRail: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row",
      gap: 7,
      minHeight: 44,
      minWidth: 0,
    },
    // 6f: the name may wrap to two lines, so the row is top-aligned and the
    // buttons keep their own column instead of squeezing the name.
    // 6a: `flex-start` so the "⋯" and search buttons pin to the *first* line of
    // a two-line server name instead of drifting to its vertical centre (6f).
    mobileWorkspaceHeaderRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 8,
      minWidth: 0,
      paddingBottom: 2,
      paddingTop: 6,
    },
    /**
     * 6b draws the same row with `align-items: center` (HTML §t6 line 115): the
     * server card is a ~56px pill and the 42px "⋯" sits centred against it, not
     * hugging its top edge the way 6a's buttons hug the name's first line.
     *
     * Its padding is 6a's too, and does not belong here: `6px 0 2px` exists so a
     * wrapping name has room above the line, while 6b's container is
     * `padding: 8px 16px 0` — the panel already supplies the 8 and the 16, so
     * the row itself adds nothing. Keeping 6a's values pushed the card 6px down
     * and left 2px of dead space under it.
     */
    mobileWorkspaceHeaderRowCompact: {
      alignItems: "center",
      paddingBottom: 0,
      paddingTop: 0,
    },
    mobileWorkspaceHeaderActions: {
      alignItems: "center",
      flexDirection: "row",
      flexGrow: 0,
      flexShrink: 0,
      gap: 8,
    },
    // 6f: `flex: 1, minWidth: 0` is what lets the name wrap instead of pushing
    // the buttons off the row — both halves are required in RN too.
    mobileWorkspaceHeaderNameWrap: {
      alignItems: "flex-start",
      flex: 1,
      flexDirection: "row",
      gap: 6,
      minWidth: 0,
    },
    mobileWorkspaceHeaderChevron: {
      flexGrow: 0,
      flexShrink: 0,
      marginTop: 5,
    },
    // 6a/6b filter strip: three equal segments in a track, selection persisted
    // per user and server.
    mobileWorkspaceFilterTrack: {
      backgroundColor: workspace.filterTrack.bg,
      borderRadius: workspace.filterTrack.radius,
      flexDirection: "row",
      marginBottom: 10,
      minWidth: 0,
      padding: workspace.filterTrack.padding,
    },
    mobileWorkspaceFilterSegment: {
      alignItems: "center",
      borderRadius: workspace.filterSegmentActive.radius,
      flex: 1,
      flexDirection: "row",
      gap: 5,
      justifyContent: "center",
      paddingVertical: 7,
    },
    mobileWorkspaceFilterSegmentActive: {
      ...theme.elevation.workspaceFilterSegment,
      backgroundColor: workspace.filterSegmentActive.bg,
    },
    mobileWorkspaceFilterLabel: {
      color: workspace.filterLabelIdle.color,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: workspace.filterLabelIdle.fontSize,
      includeFontPadding: false,
      lineHeight: workspace.filterLabelIdle.fontSize + 4,
    },
    mobileWorkspaceFilterLabelActive: {
      color: workspace.filterLabelActive.color,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileWorkspaceFilterBadge: {
      backgroundColor: workspace.filterBadge.bg,
      borderRadius: workspace.filterBadge.radius,
      color: workspace.filterBadge.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: workspace.filterBadge.textFontSize,
      includeFontPadding: false,
      lineHeight: workspace.filterBadge.height,
      minWidth: workspace.filterBadge.minWidth,
      overflow: "hidden",
      paddingHorizontal: 4,
      textAlign: "center",
    },
    mobileWorkspaceFilterVoiceDot: {
      backgroundColor: workspace.metaVoice.color,
      borderRadius: 3,
      height: 6,
      width: 6,
    },
    // 6a category header: the count next to the label, and the muted tone a
    // collapsed category takes (plus the dot that admits it hides unread rows).
    mobileWorkspaceSectionCountText: {
      color: workspace.categoryCount.color,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: workspace.categoryCount.fontSize,
      includeFontPadding: false,
      lineHeight: 14,
    },
    mobileWorkspaceSectionCollapsedLabel: {
      color: workspace.categoryCollapsed.label,
    },
    mobileWorkspaceSectionCollapsedCount: {
      color: workspace.categoryCollapsed.label,
    },
    mobileWorkspaceSectionCollapsedDot: {
      backgroundColor: workspace.categoryCollapsed.unreadDot,
      borderRadius: 3,
      height: 6,
      marginLeft: 2,
      width: 6,
    },
    // 6a "Boş · sesli kanal": no card, no Katıl pill — tapping the row connects.
    mobileWorkspaceVoiceEmptyIcon: {
      backgroundColor: workspace.voiceRowEmpty.iconBg,
      borderColor: workspace.voiceRowEmpty.iconBorder,
      borderWidth: 1,
    },
    mobileWorkspaceVoiceEmptyName: {
      color: workspace.voiceRowEmpty.name,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    mobileWorkspaceVoiceEmptySub: {
      color: workspace.voiceRowEmpty.sub,
      fontFamily: theme.typography.fontFamily,
      fontSize: workspace.voiceRowEmpty.subFontSize,
      includeFontPadding: false,
      lineHeight: 15,
    },
    // 6b search results: channel-name matches and server-wide message matches
    // are two labelled sections, never one mixed list.
    mobileWorkspaceSearchSectionLabel: {
      color: workspace.categoryLabel.color,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: workspace.categoryLabel.fontSize,
      includeFontPadding: false,
      letterSpacing: workspace.categoryLabel.letterSpacing,
      lineHeight: 14,
      paddingBottom: 5,
      paddingHorizontal: 4,
      paddingTop: 11,
      textTransform: "uppercase",
    },
    mobileWorkspaceSearchMessageRow: {
      borderRadius: workspace.channelRow.radius,
      gap: 3,
      minWidth: 0,
      paddingHorizontal: workspace.channelRow.paddingHorizontal,
      paddingVertical: workspace.channelRow.paddingVertical,
    },
    mobileWorkspaceSearchMessageHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      minWidth: 0,
    },
    mobileWorkspaceSearchMessageChannel: {
      color: workspace.channelRowActive.name,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: workspace.metaText.fontSize,
      includeFontPadding: false,
      lineHeight: 15,
    },
    mobileWorkspaceSearchMessageAuthor: {
      color: workspace.metaText.color,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: workspace.metaText.fontSize,
      includeFontPadding: false,
      lineHeight: 15,
    },
    mobileWorkspaceSearchMessageTime: {
      color: workspace.categoryCount.color,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: workspace.categoryCount.fontSize,
      includeFontPadding: false,
      lineHeight: 14,
      marginLeft: "auto",
    },
    mobileWorkspaceSearchMessagePreview: {
      color: workspace.voiceRowEmpty.sub,
      fontFamily: theme.typography.fontFamily,
      fontSize: workspace.voiceRowEmpty.subFontSize,
      includeFontPadding: false,
      lineHeight: 16,
    },
    mobileWorkspaceSearchEmpty: {
      color: workspace.metaText.color,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: workspace.metaText.fontSize,
      includeFontPadding: false,
      lineHeight: 18,
      paddingHorizontal: 4,
      paddingVertical: 8,
    },
    // 6c: handle → identity → quick actions → list card. The sheet's own
    // padding is the handoff's `10px 16px 26px`, carried by the panel and the
    // handle area rather than by this content block.
    mobileWorkspaceMenuSheet: {
      paddingHorizontal: workspace.sheetPadding.horizontal,
    },
    mobileWorkspaceMenuPanel: {
      borderTopLeftRadius: workspace.sheetRadius,
      borderTopRightRadius: workspace.sheetRadius,
      paddingBottom: workspace.sheetPadding.bottom,
      ...theme.elevation.workspaceSheet,
    },
    mobileWorkspaceMenuBackdrop: { backgroundColor: workspace.sheetBackdrop },
    mobileWorkspaceMenuHandleArea: {
      alignItems: "center",
      paddingBottom: workspace.sheetHandle.marginBottom,
      paddingTop: workspace.sheetPadding.top,
    },
    mobileWorkspaceMenuHandle: {
      backgroundColor: workspace.sheetHandle.color,
      borderRadius: workspace.sheetHandle.radius,
      height: workspace.sheetHandle.height,
      width: workspace.sheetHandle.width,
    },
    // 6c 1 — identity row.
    mobileWorkspaceMenuIdentity: {
      alignItems: "center",
      flexDirection: "row",
      gap: workspace.menuIdentity.gap,
      paddingBottom: workspace.menuIdentity.paddingBottom,
      paddingHorizontal: workspace.menuIdentity.paddingHorizontal,
    },
    mobileWorkspaceMenuIdentityText: { flex: 1, gap: 2, minWidth: 0 },
    mobileWorkspaceMenuIdentityName: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      includeFontPadding: false,
    },
    mobileWorkspaceMenuIdentityAddress: {
      color: workspace.menuIdentity.inviteAddress.color,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: workspace.menuIdentity.inviteAddress.fontSize,
      includeFontPadding: false,
    },
    mobileWorkspaceMenuProfileAction: {
      backgroundColor: workspace.menuIdentity.profileAction.bg,
      borderRadius: workspace.menuIdentity.profileAction.radius,
      paddingHorizontal: workspace.menuIdentity.profileAction.paddingHorizontal,
      paddingVertical: workspace.menuIdentity.profileAction.paddingVertical,
    },
    mobileWorkspaceMenuProfileActionText: {
      color: workspace.menuIdentity.profileAction.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: workspace.menuIdentity.profileAction.textFontSize,
      includeFontPadding: false,
    },
    // 6c 2 — quick action quartet. Equal widths: a hidden card widens the rest
    // instead of leaving a gap, which is what `flex: 1` per card buys.
    mobileWorkspaceMenuQuickRow: {
      flexDirection: "row",
      gap: workspace.quickActionCard.rowGap,
      paddingBottom: workspace.quickActionCard.rowPaddingBottom,
    },
    mobileWorkspaceMenuQuickCard: {
      alignItems: "center",
      backgroundColor: workspace.quickActionCard.bg,
      borderColor: workspace.quickActionCard.border,
      borderRadius: workspace.quickActionCard.radius,
      borderWidth: 1,
      flex: 1,
      gap: workspace.quickActionCard.gap,
      minWidth: 0,
      paddingVertical: workspace.quickActionCard.paddingVertical,
    },
    mobileWorkspaceMenuQuickCardActive: {
      backgroundColor: workspace.quickActionCard.activeBg,
      borderColor: workspace.quickActionCard.activeBg,
    },
    mobileWorkspaceMenuQuickLabel: {
      color: workspace.quickActionCard.label,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: workspace.quickActionCard.labelFontSize,
      includeFontPadding: false,
      textAlign: "center",
    },
    mobileWorkspaceMenuQuickLabelActive: { color: workspace.quickActionCard.activeTint },
    // 6c D1 — the notification-level layer swaps into the same panel rather
    // than stacking a second sheet over this one.
    mobileWorkspaceMenuLayerHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: workspace.menuIdentity.gap,
      paddingBottom: workspace.menuIdentity.paddingBottom,
      paddingHorizontal: workspace.menuIdentity.paddingHorizontal,
    },
    mobileWorkspaceMenuLayerTitle: {
      color: theme.text.primary,
      flex: 1,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: workspace.menuRow.labelFontSize,
      includeFontPadding: false,
      minWidth: 0,
    },
    mobileWorkspaceMenuRowValue: {
      color: workspace.menuRow.value,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: workspace.menuRow.valueFontSize,
      includeFontPadding: false,
    },
    mobileWorkspaceMenuAdminChip: {
      backgroundColor: workspace.adminChip.bg,
      borderRadius: workspace.adminChip.radius,
      paddingHorizontal: workspace.adminChip.paddingHorizontal,
      paddingVertical: workspace.adminChip.paddingVertical,
    },
    mobileWorkspaceMenuAdminChipText: {
      color: workspace.adminChip.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: workspace.adminChip.textFontSize,
      includeFontPadding: false,
      letterSpacing: workspace.adminChip.letterSpacing,
    },
    mobileWorkspaceMenuCard: {
      backgroundColor: workspace.menuListCard.bg,
      borderColor: workspace.menuListCard.border,
      borderRadius: workspace.menuListCard.radius,
      borderWidth: 1,
      minWidth: 0,
      overflow: "hidden",
    },
    mobileWorkspaceMenuRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      minWidth: 0,
      paddingHorizontal: workspace.menuRow.paddingHorizontal,
      paddingVertical: workspace.menuRow.paddingVertical,
    },
    mobileWorkspaceMenuRowDivider: {
      borderTopColor: workspace.menuRow.divider,
      borderTopWidth: 1,
    },
    mobileWorkspaceMenuRowLabelDanger: {
      color: workspace.dangerRow,
    },
    mobileWorkspaceMenuRowLabel: {
      color: theme.text.primary,
      flex: 1,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: workspace.menuRow.labelFontSize,
      includeFontPadding: false,
      lineHeight: 18,
      minWidth: 0,
    },
    // 6a header icons: at most two (search + "⋯"), 34px squares in the rail
    // layout and 42px in the compact one. Tap area widened by hitSlop.
    mobileWorkspaceHeaderIconButton: {
      alignItems: "center",
      backgroundColor: workspace.headerIconButton.bg,
      borderColor: workspace.headerIconButton.border,
      borderRadius: workspace.headerIconButton.radius,
      borderWidth: 1,
      height: workspace.headerIconButton.size,
      justifyContent: "center",
      width: workspace.headerIconButton.size,
    },
    mobileWorkspaceHeaderIconButtonCompact: {
      alignItems: "center",
      backgroundColor: workspace.headerIconButtonCompact.bg,
      borderColor: workspace.headerIconButtonCompact.border,
      borderRadius: workspace.headerIconButtonCompact.radius,
      borderWidth: 1,
      height: workspace.headerIconButtonCompact.size,
      justifyContent: "center",
      width: workspace.headerIconButtonCompact.size,
    },
    // 6a/6b: the single create entry is now a labelled "+ Kanal" pill. The
    // header (+) and the per-category (+) are both gone, so this is the only
    // way into the 1d create menu.
    mobileWorkspaceFabAnchor: {
      bottom: workspace.fab.bottom,
      position: "absolute",
      right: workspace.fab.right,
    },
    mobileWorkspaceFabAnchorCompact: {
      bottom: workspace.fabCompact.bottom,
      position: "absolute",
      right: workspace.fabCompact.right,
    },
    mobileWorkspaceFab: {
      ...theme.elevation.workspaceFab,
      alignItems: "center",
      backgroundColor: theme.accent.action,
      borderRadius: workspace.fab.radius,
      flexDirection: "row",
      gap: 7,
      height: workspace.fab.height,
      justifyContent: "center",
      paddingHorizontal: workspace.fab.paddingHorizontal,
    },
    mobileWorkspaceFabCompact: {
      borderRadius: workspace.fabCompact.radius,
      height: workspace.fabCompact.height,
      paddingHorizontal: workspace.fabCompact.paddingHorizontal,
    },
    mobileWorkspaceFabFill: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      borderRadius: workspace.fab.radius,
      overflow: "hidden",
    },
    mobileWorkspaceFabFillCompact: {
      borderRadius: workspace.fabCompact.radius,
    },
    mobileWorkspaceFabLabel: {
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: workspace.fab.label,
      includeFontPadding: false,
      lineHeight: workspace.fab.label + 4,
    },
    mobileWorkspaceFabLabelCompact: {
      fontSize: workspace.fabCompact.label,
      lineHeight: workspace.fabCompact.label + 4,
    },
    // 6a category header: chevron + label + count. No trailing button any more —
    // creating a channel goes through the FAB, editing through a long press.
    mobileWorkspaceSectionHeaderToggle: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row",
      gap: 6,
      minWidth: 0,
    },
    mobileWorkspaceHeaderText: {
      flex: 1,
      minWidth: 0,
    },
    mobileWorkspaceHeaderAvatarFallback: {
      color: theme.accent.default,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 15,
      includeFontPadding: false,
      lineHeight: 18,
    },
    // 1b server pill: total unread across the OTHER servers, red badge over the avatar.
    mobileWorkspaceHeaderAvatarWrap: {
      position: "relative",
    },
    mobileWorkspaceHeaderAvatarBadge: {
      backgroundColor: theme.mention.badge,
      borderColor: theme.surface.card,
      borderRadius: mobileRadii.pill,
      borderWidth: 2,
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 8.5,
      includeFontPadding: false,
      lineHeight: 12,
      minWidth: 16,
      overflow: "hidden",
      paddingHorizontal: 3,
      position: "absolute",
      right: -4,
      textAlign: "center",
      top: -4,
    },
    mobileWorkspaceMeta: {
      color: theme.text.visualSecondary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11.5,
      includeFontPadding: false,
      lineHeight: 15,
    },
    mobileWorkspaceMetaCompact: {
      fontSize: 11,
    },
    // 1a/1b header meta row: "N üye · N kanal · ● N seste" (seste in success green).
    // In 1a it is its own full-width row under the title, so the counts never get
    // squeezed by the header buttons.
    mobileWorkspaceMetaRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      minWidth: 0,
    },
    mobileWorkspaceMetaRowRail: {
      paddingTop: 2,
    },
    mobileWorkspaceMetaSep: {
      color: theme.control.separatorDot,
      fontSize: 11.5,
      includeFontPadding: false,
      lineHeight: 15,
    },
    mobileWorkspaceVoiceMeta: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4,
    },
    mobileWorkspaceVoiceMetaDot: {
      backgroundColor: theme.status.visualText,
      borderRadius: 3,
      height: 6,
      width: 6,
    },
    mobileWorkspaceVoiceMetaText: {
      color: theme.status.visualText,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11.5,
      includeFontPadding: false,
      lineHeight: 16,
    },
    mobileWorkspacePanel: {
      flex: 1,
      minWidth: 0,
      gap: 6,
      paddingRight: 14,
      paddingTop: 10,
    },
    mobileWorkspacePanelCompact: {
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    mobileWorkspaceSearchBox: {
      minHeight: 44,
      minWidth: 0,
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 15,
      backgroundColor: theme.surface.card,
      paddingHorizontal: 14,
    },
    mobileWorkspaceSearchInput: {
      minHeight: 44,
      flex: 1,
      minWidth: 0,
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 13.5,
      includeFontPadding: false,
      lineHeight: 18,
      paddingVertical: 0,
    },
    mobileWorkspaceSearchRow: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    mobileWorkspaceSearchRowCompact: {
      marginTop: 4,
    },
    mobileWorkspaceSection: {
      gap: 3,
      minWidth: 0,
    },
    mobileWorkspaceSectionCount: {
      minWidth: 18,
      overflow: "hidden",
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.accent.soft,
      color: theme.accent.strong,
      fontSize: 10,
      fontFamily: theme.typography.fontFamilyExtraBold,
      lineHeight: 17,
      paddingHorizontal: 5,
      textAlign: "center",
    },
    mobileWorkspaceSectionHeader: {
      minHeight: 28,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingBottom: 4,
      paddingTop: 8,
    },
    mobileWorkspaceSectionHeaderRail: {
      minHeight: 28,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: 10,
      paddingHorizontal: 2,
      paddingBottom: 4,
      paddingTop: 10,
    },
    mobileWorkspaceSectionList: {
      gap: 2,
      paddingTop: 4,
      paddingBottom: 8,
    },
    mobileWorkspaceSectionListRail: {
      gap: 2,
      paddingTop: 0,
      paddingBottom: 8,
    },
    mobileWorkspaceSectionListViewport: {
      flex: 1,
      minHeight: 0,
      minWidth: 0,
    },
    // Category label: 10.5px extra-bold uppercase with the handoff's .12em tracking.
    mobileWorkspaceSectionTitle: {
      flex: 1,
      minWidth: 0,
      color: theme.text.visualFaint,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 10.5,
      includeFontPadding: false,
      letterSpacing: 1.26,
      lineHeight: 14,
      textTransform: "uppercase",
    },
    mobileWorkspaceSectionTitleRail: {
      flex: 1,
      minWidth: 0,
      color: theme.text.visualFaint,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 10.5,
      includeFontPadding: false,
      letterSpacing: 1.26,
      lineHeight: 14,
      textTransform: "uppercase",
    },
    mobileWorkspaceTitle: {
      flexShrink: 1,
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 18,
      includeFontPadding: false,
      lineHeight: 24,
    },
    mobileWorkspaceTitleCompact: {
      fontSize: 15,
      lineHeight: 20,
    },
    mobileWorkspaceUnreadDot: {
      minWidth: 18,
      overflow: "hidden",
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.accent.action,
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 10,
      includeFontPadding: false,
      lineHeight: 18,
      paddingHorizontal: 5,
      textAlign: "center",
    },
    workspaceBrowserShell: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "stretch",
      gap: 0,
    },
    workspaceBrowserShellCompact: {
      flexDirection: "column",
    },
    workspaceCard: {
      gap: 10,
      minWidth: 0,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: mobileRadii.card,
      backgroundColor: theme.surface.soft,
      padding: 12,
    },
    workspaceChannelIcon: {
      width: 28,
      color: theme.accent.strong,
      fontSize: 15,
      fontFamily: theme.typography.fontFamilyExtraBold,
      textAlign: "center",
    },
    workspaceChannelList: {
      gap: 7,
      minWidth: 0,
    },
    workspaceChannelRow: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minWidth: 0,
      borderWidth: 1,
      borderColor: theme.surface.base,
      borderRadius: mobileRadii.control,
      backgroundColor: theme.surface.card,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    workspaceHeader: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    workspaceHeaderText: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    workspaceHint: {
      color: theme.text.soft,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: theme.typography.fontFamilyBold,
    },
    workspaceSelectedServer: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: mobileRadii.control,
      backgroundColor: theme.accent.soft,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
  } satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;

  return { ...createSharedStyles(theme), ...homeScreenStyles };
};

export function useHomeScreenStyles() {
  return useThemedStyles(createHomeScreenStyles);
}
