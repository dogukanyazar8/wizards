import type { TextStyle, ViewStyle } from "react-native";

import type { MobileTheme } from "../../design/themes";
import { useThemedStyles } from "../../app/providers/mobile-theme-provider";

/**
 * Handoff `Whispr Profil Ekranı.dc.html` 1a/1b/1d (light) and 1e (dark). Every
 * measure here is read from those sections; the numbers are deliberately literal
 * rather than mapped onto the spacing scale, exactly like the other
 * reference-critical surfaces in this app.
 */
export const PROFILE_CARD_WIDTH = 330;
export const PROFILE_CARD_BANNER_HEIGHT = 92;
export const PROFILE_CARD_AVATAR_SIZE = 76;
export const PROFILE_CARD_AVATAR_RADIUS = 26;
export const PROFILE_CARD_STATUS_DOT_SIZE = 18;
export const PROFILE_CARD_MENU_WIDTH = 196;
export const PROFILE_CARD_MUTUAL_AVATAR_SIZE = 22;
export const PROFILE_CARD_OPEN_DURATION_MS = 200;

export const createProfileCardStyles = (theme: MobileTheme) => {
  const card = theme.profileCard;
  const bold = theme.typography.fontFamilyBold;
  const semiBold = theme.typography.fontFamilySemiBold;

  const squareAction: ViewStyle = {
    alignItems: "center",
    backgroundColor: card.secondaryActionSurface,
    borderColor: card.secondaryActionBorder,
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  };
  const chipText: TextStyle = {
    fontFamily: bold,
    fontSize: 12,
    includeFontPadding: false,
    lineHeight: 16,
  };

  return {
    // --- layer -------------------------------------------------------------
    surface: { alignItems: "center", flex: 1, justifyContent: "center" } satisfies ViewStyle,
    backdrop: { backgroundColor: card.scrim } satisfies ViewStyle,
    cardShell: {
      backgroundColor: theme.surface.card,
      borderColor: card.cardBorder,
      borderRadius: 28,
      borderWidth: theme.dark ? 1 : 0,
      width: PROFILE_CARD_WIDTH,
      ...theme.elevation.profileCard,
    } satisfies ViewStyle,
    // --- banner ------------------------------------------------------------
    // The banner rounds its own top corners rather than the shell clipping them:
    // the three-dot menu hangs off the banner and must stay drawable (handoff 1b
    // does exactly this).
    banner: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      height: PROFILE_CARD_BANNER_HEIGHT,
      overflow: "hidden",
      position: "relative",
    } satisfies ViewStyle,
    bannerImage: { height: "100%", width: "100%" } satisfies ViewStyle,
    bannerAction: {
      alignItems: "center",
      backgroundColor: card.bannerControl,
      borderRadius: 12,
      height: 32,
      justifyContent: "center",
      position: "absolute",
      right: 12,
      top: 12,
      width: 32,
    } satisfies ViewStyle,
    bannerActionOpen: { backgroundColor: card.bannerControlActive } satisfies ViewStyle,
    bannerEditChip: {
      alignItems: "center",
      backgroundColor: card.bannerControl,
      borderRadius: 12,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      position: "absolute",
      right: 12,
      top: 12,
    } satisfies ViewStyle,
    bannerEditLabel: {
      color: card.bannerControlText,
      fontFamily: bold,
      fontSize: 12,
      includeFontPadding: false,
      lineHeight: 16,
    } satisfies TextStyle,

    // --- body --------------------------------------------------------------
    body: { marginTop: -36, paddingBottom: 18, paddingHorizontal: 18 } satisfies ViewStyle,
    identityRow: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
    } satisfies ViewStyle,
    avatarWrap: { position: "relative", width: PROFILE_CARD_AVATAR_SIZE } satisfies ViewStyle,
    avatar: {
      borderColor: theme.surface.card,
      borderRadius: PROFILE_CARD_AVATAR_RADIUS,
      borderWidth: 4,
    } satisfies ViewStyle,
    statusDot: {
      borderColor: theme.surface.card,
      borderRadius: PROFILE_CARD_STATUS_DOT_SIZE / 2,
      borderWidth: 3,
      bottom: -2,
      height: PROFILE_CARD_STATUS_DOT_SIZE,
      position: "absolute",
      right: -2,
      width: PROFILE_CARD_STATUS_DOT_SIZE,
    } satisfies ViewStyle,
    statusDotOnline: { backgroundColor: card.statusOnline } satisfies ViewStyle,
    statusDotIdle: { backgroundColor: card.statusIdle } satisfies ViewStyle,
    statusDotDnd: { backgroundColor: card.statusDnd } satisfies ViewStyle,
    /** Offline reads as a hollow ring in the handoff, not a filled grey dot. */
    statusDotOffline: {
      backgroundColor: theme.surface.card,
      borderColor: card.statusOffline,
    } satisfies ViewStyle,

    /**
     * Placement only. The chips (28×28 r10, 6px apart) come from the shared
     * `ProfileBadgeChips`, which the 1c page renders too; the card just sits the
     * row on the avatar's baseline the way 1a:329 does.
     */
    badgeRow: { marginBottom: 4 } satisfies ViewStyle,

    nameBlock: { gap: 1, marginTop: 8 } satisfies ViewStyle,
    displayName: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 19,
      includeFontPadding: false,
      lineHeight: 24,
    } satisfies TextStyle,
    username: {
      color: theme.text.visualSecondary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 13,
      includeFontPadding: false,
      lineHeight: 17,
    } satisfies TextStyle,

    presenceRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
      marginTop: 8,
    } satisfies ViewStyle,
    presenceDot: { borderRadius: 4.5, height: 9, width: 9 } satisfies ViewStyle,
    presenceText: {
      color: theme.text.visualSecondary,
      flex: 1,
      fontFamily: semiBold,
      fontSize: 12.5,
      includeFontPadding: false,
      lineHeight: 17,
    } satisfies TextStyle,
    presenceTextOffline: { color: theme.text.visualFaint } satisfies TextStyle,

    // --- roles -------------------------------------------------------------
    rolesBlock: { gap: 8, marginTop: 14 } satisfies ViewStyle,
    rolesHeading: {
      color: theme.text.visualFaint,
      fontFamily: bold,
      fontSize: 10.5,
      includeFontPadding: false,
      letterSpacing: 1.05,
      lineHeight: 14,
    } satisfies TextStyle,
    roleChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 } satisfies ViewStyle,
    roleChip: {
      alignItems: "center",
      backgroundColor: card.roleChipSurface,
      borderColor: card.roleChipBorder,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
    } satisfies ViewStyle,
    roleChipDot: { borderRadius: 4, height: 8, width: 8 } satisfies ViewStyle,
    roleChipLabel: { ...chipText, color: card.roleChipText } satisfies TextStyle,

    // --- mutuals -----------------------------------------------------------
    mutualRow: {
      alignItems: "center",
      backgroundColor: card.mutualSurface,
      borderColor: card.mutualBorder,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      marginTop: 12,
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 9,
    } satisfies ViewStyle,
    mutualAvatars: { flexDirection: "row" } satisfies ViewStyle,
    mutualAvatar: {
      borderColor: card.mutualAvatarRing,
      borderRadius: 8,
      borderWidth: 2,
    } satisfies ViewStyle,
    mutualAvatarStacked: { marginLeft: -8 } satisfies ViewStyle,
    mutualLabel: {
      color: theme.text.visualSecondary,
      flex: 1,
      fontFamily: semiBold,
      fontSize: 12,
      includeFontPadding: false,
      lineHeight: 16,
    } satisfies TextStyle,

    // --- own card rows -----------------------------------------------------
    selfStatusRow: {
      alignItems: "center",
      backgroundColor: card.mutualSurface,
      borderColor: card.mutualBorder,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      marginTop: 12,
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 10,
    } satisfies ViewStyle,
    selfStatusLabel: {
      color: theme.text.primary,
      flex: 1,
      fontFamily: semiBold,
      fontSize: 13,
      includeFontPadding: false,
      lineHeight: 18,
    } satisfies TextStyle,
    customStatusRow: {
      alignItems: "center",
      borderColor: card.dashedBorder,
      borderRadius: 14,
      borderStyle: "dashed",
      borderWidth: 1.5,
      flexDirection: "row",
      gap: 9,
      marginTop: 8,
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 9,
    } satisfies ViewStyle,
    customStatusLabel: {
      color: theme.text.visualFaint,
      fontFamily: semiBold,
      fontSize: 12.5,
      includeFontPadding: false,
      lineHeight: 17,
    } satisfies TextStyle,

    // --- actions -----------------------------------------------------------
    actionRow: { flexDirection: "row", gap: 8, marginTop: 14 } satisfies ViewStyle,
    primaryAction: {
      alignItems: "center",
      backgroundColor: theme.accent.action,
      borderRadius: 14,
      flex: 1,
      flexDirection: "row",
      gap: 7,
      height: 44,
      justifyContent: "center",
      ...theme.elevation.primaryAction,
    } satisfies ViewStyle,
    primaryActionDisabled: {
      backgroundColor: theme.interactive.disabled,
      elevation: 0,
      shadowOpacity: 0,
    } satisfies ViewStyle,
    primaryActionLabel: {
      color: theme.text.onPrimary,
      fontFamily: bold,
      fontSize: 13.5,
      includeFontPadding: false,
      lineHeight: 18,
    } satisfies TextStyle,
    squareAction,
    viewProfileAction: {
      alignItems: "center",
      backgroundColor: card.viewProfileSurface,
      borderColor: card.viewProfileBorder,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      height: 42,
      justifyContent: "center",
      marginTop: 8,
    } satisfies ViewStyle,
    viewProfileLabel: {
      color: card.viewProfileText,
      fontFamily: bold,
      fontSize: 13,
      includeFontPadding: false,
      lineHeight: 17,
    } satisfies TextStyle,
    noticeRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      marginTop: 10,
    } satisfies ViewStyle,
    noticeLabel: {
      color: theme.text.visualPlaceholder,
      fontFamily: semiBold,
      fontSize: 11,
      includeFontPadding: false,
      lineHeight: 15,
    } satisfies TextStyle,

    // --- menu --------------------------------------------------------------
    /**
     * Outside-tap target for the anchored menu. It covers the card itself, and
     * the overlay's own backdrop takes every tap beyond it, so the menu closes
     * from anywhere on screen instead of only from its own rows. Above the body
     * (`zIndex: 1`) and below the menu (`zIndex: 2`), so a row press still lands
     * on the row.
     */
    menuBackdrop: {
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
      zIndex: 1,
    } satisfies ViewStyle,
    menu: {
      backgroundColor: card.menuSurface,
      borderColor: card.menuBorder,
      borderRadius: 16,
      borderWidth: 1,
      overflow: "hidden",
      position: "absolute",
      right: 14,
      top: 50,
      width: PROFILE_CARD_MENU_WIDTH,
      zIndex: 2,
      ...theme.elevation.headerCard,
    } satisfies ViewStyle,
    menuItem: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      // The handoff draws 11px padding; the row is padded out to the 44px touch
      // floor without changing the visual rhythm.
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 11,
    } satisfies ViewStyle,
    menuItemDivided: { borderBottomColor: card.menuSeparator, borderBottomWidth: 1 },
    menuItemPressed: { backgroundColor: card.mutualSurface } satisfies ViewStyle,
    menuLabel: {
      color: theme.text.primary,
      fontFamily: semiBold,
      fontSize: 13.5,
      includeFontPadding: false,
      lineHeight: 18,
    } satisfies TextStyle,
    menuLabelDanger: { color: theme.status.dangerOnBase, fontFamily: bold } satisfies TextStyle,

    // --- states ------------------------------------------------------------
    stateBlock: { alignItems: "center", gap: 10, marginTop: 14 } satisfies ViewStyle,
    stateLabel: {
      color: theme.text.visualSecondary,
      fontFamily: semiBold,
      fontSize: 12.5,
      includeFontPadding: false,
      lineHeight: 17,
      textAlign: "center",
    } satisfies TextStyle,
    skeletonBlock: { backgroundColor: card.mutualSurface, borderRadius: 8 } satisfies ViewStyle,
    skeletonName: { height: 22, marginTop: 8, width: 168 } satisfies ViewStyle,
    skeletonUsername: { height: 14, marginTop: 5, width: 112 } satisfies ViewStyle,
    skeletonPresence: { height: 15, marginTop: 10, width: 210 } satisfies ViewStyle,
    skeletonMutual: { borderRadius: 14, height: 44, marginTop: 12 } satisfies ViewStyle,
    skeletonActions: { borderRadius: 14, height: 44, flex: 1 } satisfies ViewStyle,
    skeletonSquare: { borderRadius: 14, height: 44, width: 44 } satisfies ViewStyle,
    skeletonViewProfile: { borderRadius: 14, height: 42, marginTop: 8 } satisfies ViewStyle,
  };
};

export function useProfileCardStyles() {
  return useThemedStyles(createProfileCardStyles);
}
