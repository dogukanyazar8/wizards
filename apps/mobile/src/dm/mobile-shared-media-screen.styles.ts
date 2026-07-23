import type { ImageStyle, TextStyle, ViewStyle } from "react-native";

import type { MobileTheme } from "../design/themes";

/**
 * Geometry is read off handoff screen 2d (`Whispr Profil Ekranı.dc.html`, the
 * `#2d` block): 36px back button (r13), 17px/800 title over a 12px subtitle,
 * segment chips at 8×16 padding and r14, month labels at 11.5px/700 with
 * .12em tracking, and a three-up grid of r14 squares with a 6px gutter.
 */
export const createMobileSharedMediaStyles = (theme: MobileTheme) =>
  ({
    root: { backgroundColor: theme.surface.base, flex: 1 },
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      paddingBottom: 6,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    backButton: {
      alignItems: "center",
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 13,
      borderWidth: 1,
      height: theme.sizing.minTouchTarget,
      justifyContent: "center",
      width: theme.sizing.minTouchTarget,
    },
    headerBody: { flex: 1, gap: 1, minWidth: 0 },
    title: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 17,
    },
    subtitle: {
      color: theme.text.visualSecondary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12,
    },
    tabRow: {
      flexDirection: "row",
      gap: 8,
      paddingBottom: 4,
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    tab: {
      alignItems: "center",
      backgroundColor: theme.sharedMedia.tabSurface,
      borderColor: theme.sharedMedia.tabBorder,
      borderRadius: 14,
      borderWidth: 1,
      justifyContent: "center",
      // 2d draws a 34px chip; the touch target is grown to the platform floor
      // without moving the painted pill, which is what hitSlop is for.
      minHeight: 34,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    tabActive: {
      backgroundColor: theme.sharedMedia.tabActiveSurface,
      borderColor: theme.sharedMedia.tabActiveBorder,
    },
    tabLabel: {
      color: theme.sharedMedia.tabText,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 13,
    },
    tabLabelActive: {
      color: theme.sharedMedia.tabActiveText,
      fontFamily: theme.typography.fontFamilyBold,
    },
    listContent: { paddingBottom: 40 },
    monthLabel: {
      color: theme.text.visualFaint,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11.5,
      letterSpacing: 1.38,
      paddingBottom: 6,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    monthLabelSubsequent: { paddingTop: 16 },
    gridRow: { flexDirection: "row", gap: 6, paddingHorizontal: 20, paddingTop: 6 },
    gridRowFirst: { paddingTop: 0 },
    tile: {
      alignItems: "center",
      aspectRatio: 1,
      backgroundColor: theme.sharedMedia.tileSurface,
      borderRadius: 14,
      flex: 1,
      justifyContent: "center",
      overflow: "hidden",
    },
    tileSpacer: { aspectRatio: 1, flex: 1 },
    // Absolute so the play glyph and duration pill stay centred/anchored over
    // the photo instead of being laid out beside it.
    tileImage: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
    tilePressed: { opacity: 0.86 },
    durationBadge: {
      backgroundColor: theme.sharedMedia.durationBadge,
      borderRadius: 8,
      bottom: 6,
      paddingHorizontal: 7,
      paddingVertical: 2,
      position: "absolute",
      right: 6,
    },
    durationLabel: {
      color: theme.sharedMedia.durationBadgeText,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 10,
    },
    row: {
      alignItems: "center",
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginHorizontal: 20,
      marginTop: 8,
      minHeight: 64,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    rowIcon: {
      alignItems: "center",
      backgroundColor: theme.accent.soft,
      borderRadius: 13,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    rowBody: { flex: 1, gap: 2, minWidth: 0 },
    rowTitle: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 14,
    },
    rowMeta: {
      color: theme.text.visualSecondary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12,
    },
    footer: { alignItems: "center", gap: 10, paddingTop: 18 },
    footerLabel: {
      color: theme.text.visualFaint,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11,
    },
    state: { marginHorizontal: 20, marginTop: 40 },
    stateActions: { gap: 10, marginHorizontal: 20, marginTop: 16 },
    error: {
      color: theme.status.dangerOnBase,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12.5,
      lineHeight: 17,
      marginHorizontal: 20,
      marginTop: 8,
    },
    skeletonMonth: { marginHorizontal: 20, marginTop: 12 },
    skeletonRow: { flexDirection: "row", gap: 6, marginTop: 6, paddingHorizontal: 20 },
    skeletonTile: { aspectRatio: 1, flex: 1 },
  }) satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;
