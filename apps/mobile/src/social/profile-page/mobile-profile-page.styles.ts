import type { TextStyle, ViewStyle } from "react-native";

import type { MobileTheme } from "../../design/themes";

/**
 * Handoff 1c (light) and 1f (dark), `Whispr Profil Ekranı.dc.html` lines 465-586
 * and 749-871. Every measure below is read from those two blocks; colours come
 * from the shared `profileCard` token family so the dark page needs no branch.
 */
export const MOBILE_PROFILE_PAGE_METRICS = {
  aboutBioLineHeight: 20.25,
  avatar: 84,
  avatarBorder: 4,
  avatarOffsetLeft: 18,
  avatarOffsetTop: -40,
  avatarRadius: 28,
  bannerHeight: 148,
  bannerNavPaddingHorizontal: 16,
  bannerNavPaddingTop: 6,
  cardGap: 12,
  cardPaddingHorizontal: 18,
  cardPaddingVertical: 14,
  cardRadius: 24,
  identityCardOverlap: -30,
  identityPaddingTop: 48,
  mediaTileRadius: 14,
  /** 1b/1c draw the same 196px anchored menu; the page reuses the card measure. */
  menuWidth: 196,
  menuRadius: 16,
  /** Nav row top (6) + its 36pt control + the 6pt gap the handoff leaves. */
  menuTop: 48,
  metaGlyph: 14,
  mutualAvatar: 30,
  mutualAvatarBorder: 2,
  mutualAvatarOverlap: -9,
  mutualAvatarRadius: 11,
  navControl: 36,
  navControlRadius: 13,
  pageHorizontalMargin: 16,
  presenceDot: 19,
  presenceDotBorder: 3,
  presenceDotOffset: -2,
  roleChipDot: 8,
  roleChipRadius: 10,
  secondaryAction: 44,
  serverAvatar: 40,
  serverAvatarRadius: 14,
  statusDot: 9,
} as const;

const METRICS = MOBILE_PROFILE_PAGE_METRICS;

export const createMobileProfilePageStyles = (theme: MobileTheme) =>
  ({
    root: { backgroundColor: theme.surface.base, flex: 1 },
    content: { paddingBottom: 48 },

    banner: { height: METRICS.bannerHeight, overflow: "hidden" },
    bannerImage: { height: "100%", width: "100%" },
    bannerNav: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      left: 0,
      paddingHorizontal: METRICS.bannerNavPaddingHorizontal,
      paddingTop: METRICS.bannerNavPaddingTop,
      position: "absolute",
      right: 0,
    },
    bannerControl: {
      alignItems: "center",
      backgroundColor: theme.profileCard.bannerControl,
      borderRadius: METRICS.navControlRadius,
      height: METRICS.navControl,
      justifyContent: "center",
      width: METRICS.navControl,
    },
    bannerControlActive: { backgroundColor: theme.profileCard.bannerControlActive },
    // 44pt reach without growing the 36pt visual: the hit slop covers the rest.
    bannerControlHitSlop: { bottom: 4, left: 4, right: 4, top: 4 },

    identityCard: {
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: METRICS.cardRadius,
      borderWidth: theme.layout.border.hairline,
      marginHorizontal: METRICS.pageHorizontalMargin,
      marginTop: METRICS.identityCardOverlap,
      paddingBottom: 16,
      paddingHorizontal: METRICS.cardPaddingHorizontal,
      paddingTop: METRICS.identityPaddingTop,
    },
    identityAvatarSlot: {
      left: METRICS.avatarOffsetLeft,
      position: "absolute",
      top: METRICS.avatarOffsetTop,
    },
    identityAvatarFrame: { position: "relative" },
    identityAvatar: {
      borderColor: theme.surface.card,
      borderRadius: METRICS.avatarRadius,
      borderWidth: METRICS.avatarBorder,
      height: METRICS.avatar,
      width: METRICS.avatar,
    },
    identityAvatarInitials: {
      color: theme.accent.strong,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 26,
      includeFontPadding: false,
      lineHeight: 32,
    },
    identityPresenceDot: {
      borderColor: theme.surface.card,
      borderRadius: theme.radii.pill,
      borderWidth: METRICS.presenceDotBorder,
      bottom: METRICS.presenceDotOffset,
      height: METRICS.presenceDot,
      position: "absolute",
      right: METRICS.presenceDotOffset,
      width: METRICS.presenceDot,
    },
    /**
     * Placement only — 1c:490 pins the row to the identity card's top-right
     * corner. The chips come from the shared `ProfileBadgeChips`, which owns
     * their 28×28 r10 geometry for both this page and the 11b card.
     */
    identityBadges: {
      position: "absolute",
      right: 14,
      top: 12,
    },
    identityNameBlock: { flexDirection: "column", gap: 1 },
    identityName: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 20,
      lineHeight: 26,
    },
    identityUsername: {
      color: theme.text.visualSecondary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 13,
      lineHeight: 18,
    },
    identityStatusRow: { alignItems: "center", flexDirection: "row", gap: 7, marginTop: 7 },
    identityStatusDot: {
      borderRadius: theme.radii.pill,
      flexShrink: 0,
      height: METRICS.statusDot,
      width: METRICS.statusDot,
    },
    identityStatusLabel: {
      color: theme.text.visualSecondary,
      flex: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 12.5,
      lineHeight: 17,
    },

    roleChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
    roleChip: {
      alignItems: "center",
      backgroundColor: theme.profileCard.roleChipSurface,
      borderColor: theme.profileCard.roleChipBorder,
      borderRadius: METRICS.roleChipRadius,
      borderWidth: theme.layout.border.hairline,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    roleChipDot: {
      borderRadius: theme.radii.pill,
      height: METRICS.roleChipDot,
      width: METRICS.roleChipDot,
    },
    roleChipLabel: {
      color: theme.profileCard.roleChipText,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12,
      lineHeight: 16,
    },

    actionRow: { flexDirection: "row", gap: 8, marginTop: 14 },
    actionPrimary: {
      alignItems: "center",
      backgroundColor: theme.accent.default,
      borderRadius: theme.radii.control,
      flex: 1,
      flexDirection: "row",
      gap: 7,
      height: theme.sizing.minTouchTarget,
      justifyContent: "center",
      ...theme.elevation.primaryAction,
    },
    actionPrimaryLabel: {
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13.5,
      lineHeight: 18,
    },
    actionSecondary: {
      alignItems: "center",
      backgroundColor: theme.profileCard.secondaryActionSurface,
      borderColor: theme.profileCard.secondaryActionBorder,
      borderRadius: theme.radii.control,
      borderWidth: theme.layout.border.hairline,
      height: METRICS.secondaryAction,
      justifyContent: "center",
      width: METRICS.secondaryAction,
    },
    actionDisabled: { opacity: theme.layout.opacity.disabled },
    actionPressed: { opacity: theme.layout.opacity.pressed },
    actionNotice: {
      color: theme.text.visualFaint,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11.5,
      lineHeight: 15,
      marginTop: 8,
    },

    sectionCard: {
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: METRICS.cardRadius,
      borderWidth: theme.layout.border.hairline,
      marginHorizontal: METRICS.pageHorizontalMargin,
      marginTop: METRICS.cardGap,
      paddingBottom: METRICS.cardPaddingVertical,
      paddingHorizontal: METRICS.cardPaddingHorizontal,
      paddingTop: METRICS.cardPaddingVertical,
    },
    /** 1c gives the server list card a shorter bottom edge; its last row pads itself. */
    sectionCardListBottom: { paddingBottom: 6 },
    sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    sectionLabel: {
      color: theme.text.visualFaint,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 10.5,
      letterSpacing: 1.05,
      lineHeight: 14,
    },
    sectionAction: {
      color: theme.profileCard.viewProfileText,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12,
      lineHeight: 16,
    },
    sectionActionHitSlop: { bottom: 14, left: 12, right: 12, top: 14 },

    aboutBio: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 13.5,
      lineHeight: METRICS.aboutBioLineHeight,
      marginTop: 8,
    },
    aboutDivider: {
      borderTopColor: theme.border.default,
      borderTopWidth: theme.layout.border.hairline,
      marginTop: 10,
      paddingTop: 10,
    },
    aboutMetaRow: { alignItems: "center", flexDirection: "row", gap: 8 },
    aboutMetaRowSpaced: { marginTop: 8 },
    aboutMetaLabel: {
      color: theme.text.visualSecondary,
      flex: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 12.5,
      lineHeight: 17,
    },

    noteField: {
      alignItems: "center",
      backgroundColor: theme.profileCard.mutualSurface,
      borderColor: theme.profileCard.mutualBorder,
      borderRadius: theme.radii.control,
      borderWidth: theme.layout.border.hairline,
      flexDirection: "row",
      gap: 9,
      marginTop: 8,
      minHeight: theme.sizing.minTouchTarget,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    notePlaceholder: {
      color: theme.text.visualPlaceholder,
      flex: 1,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12.5,
      lineHeight: 17,
    },
    noteValue: { color: theme.text.primary },

    serverRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      minHeight: theme.sizing.minTouchTarget,
      paddingVertical: 10,
    },
    serverRowDivided: {
      borderBottomColor: theme.border.default,
      borderBottomWidth: theme.layout.border.hairline,
    },
    serverAvatar: {
      alignItems: "center",
      borderRadius: METRICS.serverAvatarRadius,
      height: METRICS.serverAvatar,
      justifyContent: "center",
      overflow: "hidden",
      width: METRICS.serverAvatar,
    },
    serverAvatarInitials: {
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 12,
      includeFontPadding: false,
      lineHeight: 16,
    },
    serverRowBody: { flex: 1, flexDirection: "column", gap: 1, minWidth: 0 },
    serverRowName: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 14,
      lineHeight: 19,
    },
    serverRowMeta: {
      color: theme.text.visualFaint,
      fontFamily: theme.typography.fontFamily,
      fontSize: 11.5,
      lineHeight: 15,
    },

    mutualFriendsRow: { alignItems: "center", flexDirection: "row", gap: 10, marginTop: 10 },
    mutualFriendsStack: { flexDirection: "row" },
    mutualFriendAvatar: {
      alignItems: "center",
      borderColor: theme.surface.card,
      borderRadius: METRICS.mutualAvatarRadius,
      borderWidth: METRICS.mutualAvatarBorder,
      height: METRICS.mutualAvatar,
      justifyContent: "center",
      overflow: "hidden",
      width: METRICS.mutualAvatar,
    },
    mutualFriendAvatarStacked: { marginLeft: METRICS.mutualAvatarOverlap },
    mutualFriendInitials: {
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 9.5,
      includeFontPadding: false,
      lineHeight: 13,
    },
    mutualFriendOverflow: { backgroundColor: theme.border.default },
    mutualFriendOverflowLabel: { color: theme.text.visualSecondary },
    mutualFriendsSummary: {
      color: theme.text.visualSecondary,
      flex: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 12.5,
      lineHeight: 17,
    },
    /** Expanded "Tümünü gör" list: the same row rhythm the server list uses. */
    mutualFriendRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      minHeight: theme.sizing.minTouchTarget,
      paddingVertical: 8,
    },
    mutualFriendRowDivided: {
      borderBottomColor: theme.border.default,
      borderBottomWidth: theme.layout.border.hairline,
    },
    mutualFriendRowBody: { flex: 1, flexDirection: "column", gap: 1, minWidth: 0 },
    mutualFriendRowName: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 14,
      lineHeight: 19,
    },
    mutualFriendRowMeta: {
      color: theme.text.visualFaint,
      fontFamily: theme.typography.fontFamily,
      fontSize: 11.5,
      lineHeight: 15,
    },
    mutualFriendsList: { marginTop: 4 },

    mediaRow: { flexDirection: "row", gap: 8, marginTop: 10 },
    mediaTile: {
      alignItems: "center",
      aspectRatio: 1,
      backgroundColor: theme.profileCard.mutualSurface,
      borderRadius: METRICS.mediaTileRadius,
      flex: 1,
      justifyContent: "center",
      overflow: "hidden",
    },
    mediaThumbnail: { height: "100%", width: "100%" },
    /** Play glyph and duration pill ride over the frame, exactly like 2d. */
    mediaVideoGlyph: { position: "absolute" },
    mediaDurationBadge: {
      backgroundColor: theme.sharedMedia.durationBadge,
      borderRadius: theme.radii.pill,
      bottom: 6,
      paddingHorizontal: 7,
      paddingVertical: 2,
      position: "absolute",
      right: 6,
    },
    mediaDurationLabel: {
      color: theme.sharedMedia.durationBadgeText,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 10,
    },
    mediaEmpty: {
      color: theme.text.visualFaint,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 12.5,
      lineHeight: 17,
      marginTop: 10,
    },

    stateNotice: {
      alignItems: "center",
      backgroundColor: theme.status.dangerSoft,
      borderRadius: theme.radii.control,
      flexDirection: "row",
      gap: 10,
      marginHorizontal: METRICS.pageHorizontalMargin,
      marginTop: METRICS.cardGap,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    stateNoticeLabel: {
      color: theme.status.dangerOnBase,
      flex: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 12.5,
      lineHeight: 17,
    },
    stateNoticeAction: {
      color: theme.profileCard.viewProfileText,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12.5,
      lineHeight: 17,
    },
    restrictedLabel: {
      color: theme.text.visualSecondary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 12.5,
      lineHeight: 17,
      marginTop: 10,
    },

    /**
     * 1b/1c hang the overflow menu off the three-dot control instead of raising
     * a bottom sheet. It lives outside the scroll view so the banner's
     * `overflow: hidden` cannot clip it, anchored to the control's rest
     * position — the backdrop freezes the page while it is open.
     */
    menuBackdrop: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
    menu: {
      backgroundColor: theme.profileCard.menuSurface,
      borderColor: theme.profileCard.menuBorder,
      borderRadius: METRICS.menuRadius,
      borderWidth: theme.layout.border.hairline,
      overflow: "hidden",
      position: "absolute",
      right: METRICS.pageHorizontalMargin,
      top: METRICS.menuTop,
      width: METRICS.menuWidth,
      ...theme.elevation.headerCard,
    },
    menuItem: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      minHeight: theme.sizing.minTouchTarget,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    menuItemDivided: {
      borderBottomColor: theme.profileCard.menuSeparator,
      borderBottomWidth: theme.layout.border.hairline,
    },
    menuItemPressed: { backgroundColor: theme.profileCard.mutualSurface },
    menuLabel: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 13.5,
      lineHeight: 18,
    },
    menuLabelDanger: {
      color: theme.status.dangerOnBase,
      fontFamily: theme.typography.fontFamilyBold,
    },

    skeletonRow: { flexDirection: "row", gap: 12, marginTop: 10 },
    skeletonStack: { flex: 1, gap: 6 },
  }) satisfies Record<string, TextStyle | ViewStyle>;
