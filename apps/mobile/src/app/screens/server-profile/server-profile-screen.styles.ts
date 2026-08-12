import type { MobileTheme } from "../../../design/themes";

/**
 * 6d/6e server profile. Every colour *and* every measurement comes from
 * `theme.serverProfile` (Faz 2 §C1): the handoff binds the two together — a
 * 28px icon box and its tint are one decision — so this file reads one table
 * rather than mixing tokens with literals.
 *
 * The section labels are `theme.workspace.categoryLabel`/`categoryCount` on
 * purpose: 6d's "KANALLAR 12" and 6b's category header are the same type ramp,
 * and a second copy of it would be a second thing to keep in step.
 */
export const createMobileServerProfileStyles = (theme: MobileTheme) => {
  const profile = theme.serverProfile;
  const card = {
    backgroundColor: profile.statCard.bg,
    borderColor: profile.statCard.border,
    borderWidth: 1,
  } as const;

  return {
    root: { backgroundColor: theme.surface.base, flex: 1 },
    scroll: { flex: 1 },

    /* Banner ---------------------------------------------------------- */
    banner: { height: profile.bannerHeight, overflow: "hidden" as const, width: "100%" as const },
    bannerImage: { height: profile.bannerHeight, width: "100%" as const },
    bannerOverlay: {
      backgroundColor: profile.bannerOverlay,
      bottom: 0,
      left: 0,
      position: "absolute" as const,
      right: 0,
      top: 0,
    },
    bannerBlob: {
      backgroundColor: profile.bannerBlob.color,
      borderRadius: profile.bannerBlob.size / 2,
      height: profile.bannerBlob.size,
      position: "absolute" as const,
      right: profile.bannerBlob.offsetRight,
      top: profile.bannerBlob.offsetTop,
      width: profile.bannerBlob.size,
    },
    bannerActions: {
      alignItems: "center" as const,
      flexDirection: "row" as const,
      gap: 8,
      left: 0,
      paddingHorizontal: profile.bottomBar.paddingHorizontal,
      paddingTop: profile.stickyHeader.paddingTop,
      position: "absolute" as const,
      right: 0,
    },
    bannerActionsSpacer: { flex: 1 },
    bannerButton: {
      alignItems: "center" as const,
      backgroundColor: profile.bannerButton.bg,
      borderRadius: profile.bannerButton.radius,
      height: profile.bannerButton.size,
      justifyContent: "center" as const,
      width: profile.bannerButton.size,
    },

    /* 6e sticky header ------------------------------------------------ */
    stickyHeader: {
      backgroundColor: profile.stickyHeader.bg,
      borderBottomColor: profile.stickyHeader.border,
      borderBottomWidth: 1,
      left: 0,
      position: "absolute" as const,
      right: 0,
      top: 0,
    },
    stickyRow: {
      alignItems: "center" as const,
      flexDirection: "row" as const,
      gap: 10,
      paddingBottom: profile.stickyHeader.paddingBottom,
      paddingHorizontal: profile.bottomBar.paddingHorizontal,
      paddingTop: profile.stickyHeader.paddingTop,
    },
    stickyIconButton: {
      alignItems: "center" as const,
      backgroundColor: theme.surface.base,
      borderColor: profile.stickyHeader.border,
      borderRadius: profile.stickyHeader.backRadius,
      borderWidth: 1,
      height: profile.stickyHeader.back,
      justifyContent: "center" as const,
      width: profile.stickyHeader.back,
    },
    stickyMenuButton: {
      alignItems: "center" as const,
      borderRadius: profile.stickyHeader.menuRadius,
      height: profile.stickyHeader.menu,
      justifyContent: "center" as const,
      width: profile.stickyHeader.menu,
    },
    stickyName: {
      color: theme.text.primary,
      flex: 1,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.stickyHeader.name.fontSize,
      letterSpacing: profile.stickyHeader.name.letterSpacing,
      lineHeight: profile.stickyHeader.name.lineHeight,
      minWidth: 0,
    },

    /* Sheet ------------------------------------------------------------ */
    sheet: {
      backgroundColor: theme.surface.base,
      borderTopLeftRadius: profile.sheetRadius,
      borderTopRightRadius: profile.sheetRadius,
      marginTop: profile.sheetTop - profile.bannerHeight,
      paddingHorizontal: profile.bottomBar.paddingHorizontal,
    },

    /* B2 identity ------------------------------------------------------ */
    identityRow: { alignItems: "flex-end" as const, flexDirection: "row" as const, gap: 10 },
    logoFrame: {
      borderColor: profile.logo.borderColor,
      borderRadius: profile.logo.radius,
      borderWidth: profile.logo.borderWidth,
      marginTop: profile.logo.marginTop,
    },
    /**
     * 6D draws the initials at 24/800 inside the 74pt tile. The kit avatar sizes
     * its fallback text off its own `lg` preset, which is built for a much
     * smaller mark — the handoff already carries the numbers, so the tile passes
     * them in rather than inheriting a preset meant for a list row.
     */
    logoInitials: {
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.logo.fontSize,
    },
    statusChips: {
      alignItems: "flex-end" as const,
      flex: 1,
      gap: 6,
      minWidth: 0,
      paddingBottom: 6,
    },
    chipOnline: {
      alignItems: "center" as const,
      backgroundColor: profile.statusChipOnline.bg,
      borderRadius: profile.tagChip.radius,
      flexDirection: "row" as const,
      gap: 5,
      paddingHorizontal: profile.tagChip.paddingHorizontal,
      paddingVertical: profile.tagChip.paddingVertical,
    },
    chipOnlineDot: {
      backgroundColor: profile.statusChipOnline.dot,
      borderRadius: 3,
      height: 6,
      width: 6,
    },
    chipOnlineText: {
      color: profile.statusChipOnline.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.statusChipOnline.textFontSize,
    },
    nameRow: {
      alignItems: "center" as const,
      flexDirection: "row" as const,
      gap: 6,
      marginTop: 10,
    },
    name: {
      color: theme.text.primary,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.profileName.fontSize,
      letterSpacing: profile.profileName.letterSpacing,
      lineHeight: profile.profileName.lineHeight,
      minWidth: 0,
    },
    verifiedBadge: {
      alignItems: "center" as const,
      backgroundColor: profile.verifiedBadge.fill,
      borderRadius: profile.verifiedBadge.size / 2,
      height: profile.verifiedBadge.size,
      justifyContent: "center" as const,
      width: profile.verifiedBadge.size,
    },
    addressRow: {
      alignItems: "center" as const,
      flexDirection: "row" as const,
      gap: 6,
      marginTop: 4,
    },
    addressText: {
      color: profile.inviteAddress.color,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: profile.inviteAddress.fontSize,
    },
    description: {
      color: profile.description.color,
      fontFamily: theme.typography.fontFamily,
      fontSize: profile.description.fontSize,
      lineHeight: profile.description.lineHeight,
      marginTop: 8,
    },
    /**
     * The unclamped twin used to count the description's real lines. Absolute
     * so it takes no space, `left/right: 0` so it wraps at exactly the width the
     * visible copy does, and invisible rather than `display: none` — a node that
     * is not laid out is never measured.
     */
    descriptionMeasure: {
      left: 0,
      marginTop: 0,
      opacity: 0,
      position: "absolute" as const,
      right: 0,
      top: 0,
    },
    descriptionMore: {
      color: profile.eventJoinPill.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.description.fontSize,
      marginTop: 2,
    },
    tagRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6, marginTop: 10 },
    tagChip: {
      backgroundColor: profile.tagChip.bg,
      borderRadius: profile.tagChip.radius,
      paddingHorizontal: profile.tagChip.paddingHorizontal,
      paddingVertical: profile.tagChip.paddingVertical,
    },
    tagChipText: {
      color: profile.tagChip.text,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: profile.tagChip.textFontSize,
    },

    /* B3 stat card ----------------------------------------------------- */
    statCard: {
      ...card,
      borderRadius: profile.statCard.radius,
      flexDirection: "row" as const,
      marginTop: 12,
    },
    statCell: {
      alignItems: "center" as const,
      flex: 1,
      gap: 2,
      paddingVertical: profile.statCard.cellPaddingVertical,
    },
    statCellDivider: {
      borderLeftColor: profile.statDivider.color,
      borderLeftWidth: profile.statDivider.width,
    },
    statValue: {
      color: profile.statValue.color,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.statValue.fontSize,
    },
    statValueVoice: { color: profile.statValue.voice },
    statLabel: {
      color: profile.statLabel.color,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: profile.statLabel.fontSize,
    },

    /* B4 mutual friends ------------------------------------------------ */
    friendsRow: {
      ...card,
      alignItems: "center" as const,
      borderRadius: profile.friendsRow.radius,
      flexDirection: "row" as const,
      gap: 10,
      marginTop: 10,
      paddingHorizontal: profile.friendsRow.paddingHorizontal,
      paddingVertical: profile.friendsRow.paddingVertical,
    },
    friendsStack: { flexDirection: "row" as const },
    friendAvatar: {
      borderColor: profile.statCard.bg,
      borderRadius: profile.friendsRow.avatar / 2,
      borderWidth: 2,
    },
    friendAvatarOverlap: { marginLeft: profile.friendsRow.overlap },
    friendsText: {
      color: profile.friendsRow.text,
      flex: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: profile.friendsRow.textFontSize,
      minWidth: 0,
    },
    /** 6d sets the counter apart in 800 and the darker ink; the sentence stays 600. */
    friendsTextStrong: {
      color: profile.friendsRow.strongText,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },

    /* B5 upcoming event ------------------------------------------------ */
    eventCard: {
      ...card,
      alignItems: "center" as const,
      borderRadius: profile.eventCard.radius,
      flexDirection: "row" as const,
      gap: profile.eventCard.gap,
      marginTop: 8,
      paddingHorizontal: profile.eventCard.paddingHorizontal,
      paddingVertical: profile.eventCard.paddingVertical,
    },
    eventDateBlock: {
      alignItems: "center" as const,
      backgroundColor: profile.eventDateBlock.bg,
      borderRadius: profile.eventDateBlock.radius,
      gap: 1,
      paddingVertical: 5,
      width: profile.eventDateBlock.width,
    },
    eventDateLabel: {
      color: profile.eventDateBlock.label,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.eventDateBlock.labelFontSize,
      letterSpacing: profile.eventDateBlock.labelLetterSpacing,
    },
    eventDateTime: {
      color: profile.eventDateBlock.time,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.eventDateBlock.timeFontSize,
    },
    eventBody: { flex: 1, gap: 2, minWidth: 0 },
    eventName: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.channelPreviewRow.nameFontSize,
    },
    eventSubtitle: {
      color: profile.inviteAddress.color,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: profile.eventJoinPill.textFontSize,
    },
    eventPill: {
      backgroundColor: profile.eventJoinPill.bg,
      borderRadius: profile.eventJoinPill.radius,
      paddingHorizontal: profile.eventJoinPill.paddingHorizontal,
      paddingVertical: profile.eventJoinPill.paddingVertical,
    },
    eventPillText: {
      color: profile.eventJoinPill.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.eventJoinPill.textFontSize,
    },

    /* Section headers -------------------------------------------------- */
    sectionHeader: {
      alignItems: "center" as const,
      flexDirection: "row" as const,
      gap: 6,
      paddingBottom: 6,
      paddingHorizontal: 4,
      paddingTop: 14,
    },
    sectionHeaderTight: { paddingTop: 12 },
    sectionLabel: {
      color: theme.workspace.categoryLabel.color,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: theme.workspace.categoryLabel.fontSize,
      letterSpacing: theme.workspace.categoryLabel.letterSpacing,
      // Platform casing rather than `toUpperCase()`: a category name is user
      // text, and Turkish dotted/dotless I is wrong under the JS default locale.
      textTransform: "uppercase" as const,
    },
    sectionCount: {
      color: theme.workspace.categoryCount.color,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: theme.workspace.categoryCount.fontSize,
    },

    /* B6/C2 channel list ------------------------------------------------ */
    channelCard: { ...card, borderRadius: profile.friendsRow.radius, overflow: "hidden" as const },
    channelRow: {
      alignItems: "center" as const,
      flexDirection: "row" as const,
      gap: 10,
      paddingHorizontal: profile.channelPreviewRow.paddingHorizontal,
      paddingVertical: profile.channelPreviewRow.paddingVertical,
    },
    rowDivider: {
      borderTopColor: profile.channelPreviewRow.divider,
      borderTopWidth: 1,
    },
    channelIconBox: {
      alignItems: "center" as const,
      backgroundColor: theme.surface.base,
      borderRadius: profile.channelPreviewRow.iconRadius,
      height: profile.channelPreviewRow.iconBox,
      justifyContent: "center" as const,
      width: profile.channelPreviewRow.iconBox,
    },
    channelIconBoxVoice: { backgroundColor: profile.statusChipOnline.bg },
    channelName: {
      color: theme.text.primary,
      flex: 1,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: profile.channelPreviewRow.nameFontSize,
      minWidth: 0,
    },
    channelVoiceCount: {
      color: profile.statValue.voice,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: profile.statusChipOnline.textFontSize,
    },
    channelActivity: {
      color: profile.statLabel.color,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: profile.statusChipOnline.textFontSize,
    },
    participantStack: { flexDirection: "row" as const },
    participantAvatar: {
      borderColor: profile.statCard.bg,
      borderRadius: 10,
      borderWidth: 2,
    },
    participantAvatarOverlap: { marginLeft: -7 },
    privateChip: {
      alignItems: "center" as const,
      backgroundColor: profile.privateChip.bg,
      borderRadius: profile.privateChip.radius,
      flexDirection: "row" as const,
      gap: 4,
      paddingHorizontal: profile.privateChip.paddingHorizontal,
      paddingVertical: profile.privateChip.paddingVertical,
    },
    privateChipText: {
      color: profile.privateChip.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.privateChip.textFontSize,
    },

    /* C3 "Kalan n kanalı gör" ------------------------------------------- */
    showRemaining: {
      ...card,
      alignItems: "center" as const,
      borderRadius: profile.eventJoinPill.radius + 3,
      flexDirection: "row" as const,
      gap: 4,
      justifyContent: "center" as const,
      marginTop: 9,
      paddingVertical: 10,
    },
    showRemainingText: {
      color: profile.eventJoinPill.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.friendsRow.textFontSize,
    },

    /* C4 admins --------------------------------------------------------- */
    adminAvatarWrap: { position: "relative" as const },
    adminPresenceDot: {
      backgroundColor: profile.statValue.voice,
      borderColor: profile.statCard.bg,
      borderRadius: 5,
      borderWidth: 2,
      bottom: 0,
      height: 10,
      position: "absolute" as const,
      right: 0,
      width: 10,
    },
    adminBody: { flex: 1, gap: 1, minWidth: 0 },
    adminName: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.channelPreviewRow.nameFontSize,
    },
    adminSubtitle: {
      color: profile.statLabel.color,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: profile.statusChipOnline.textFontSize,
    },
    roleChip: {
      borderRadius: profile.roleChip.radius,
      paddingHorizontal: profile.roleChip.paddingHorizontal,
      paddingVertical: profile.roleChip.paddingVertical,
    },
    roleChipOwner: { backgroundColor: profile.roleChipOwner.bg },
    roleChipAdmin: { backgroundColor: profile.roleChipAdmin.bg },
    roleChipText: {
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.roleChip.textFontSize,
      letterSpacing: profile.roleChip.letterSpacing,
    },
    roleChipTextOwner: { color: profile.roleChipOwner.text },
    roleChipTextAdmin: { color: profile.roleChipAdmin.text },

    /* C5 about ---------------------------------------------------------- */
    aboutRow: {
      alignItems: "center" as const,
      flexDirection: "row" as const,
      gap: 10,
      paddingHorizontal: profile.eventCard.paddingHorizontal,
      paddingVertical: profile.eventCard.paddingVertical,
    },
    aboutLabel: {
      color: profile.aboutRowLabel.color,
      flex: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: profile.aboutRowLabel.fontSize,
      minWidth: 0,
    },
    aboutValue: {
      color: profile.aboutRowValue.color,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: profile.aboutRowValue.fontSize,
    },

    /* B7 bottom bar ------------------------------------------------------ */
    bottomBar: {
      ...theme.elevation.serverProfileBottomBar,
      backgroundColor: profile.bottomBar.bg,
      borderTopColor: profile.bottomBar.border,
      borderTopWidth: 1,
      flexDirection: "row" as const,
      gap: profile.bottomBar.gap,
      paddingHorizontal: profile.bottomBar.paddingHorizontal,
      paddingTop: profile.bottomBar.paddingTop,
    },
    primaryAction: {
      ...theme.elevation.serverProfilePrimaryAction,
      alignItems: "center" as const,
      backgroundColor: profile.bottomBar.primary.bg,
      borderRadius: profile.bottomBar.primary.radius,
      flex: 1,
      height: profile.bottomBar.primary.height,
      justifyContent: "center" as const,
    },
    primaryActionLabel: {
      color: profile.bottomBar.primary.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.bottomBar.primary.textFontSize,
    },
    barIconButton: {
      alignItems: "center" as const,
      backgroundColor: profile.bottomBar.iconButton.bg,
      borderColor: profile.bottomBar.iconButton.border,
      borderRadius: profile.bottomBar.iconButton.radius,
      borderWidth: 1,
      height: profile.bottomBar.iconButton.size,
      justifyContent: "center" as const,
      width: profile.bottomBar.iconButton.size,
    },

    /* Loading / empty ----------------------------------------------------- */
    loadingBlock: { gap: 12, padding: profile.bottomBar.paddingHorizontal },
    emptyState: {
      alignItems: "center" as const,
      flex: 1,
      gap: 14,
      justifyContent: "center" as const,
      padding: 32,
    },
    emptyTitle: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: profile.aboutRowValue.fontSize,
      textAlign: "center" as const,
    },
    emptyAction: {
      backgroundColor: profile.bottomBar.primary.bg,
      borderRadius: profile.bottomBar.primary.radius,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    emptyActionLabel: {
      color: profile.bottomBar.primary.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: profile.bottomBar.primary.textFontSize,
    },
    pressed: { opacity: 0.82 },
  };
};
