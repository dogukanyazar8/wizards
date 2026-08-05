import type { TextStyle, ViewStyle } from "react-native";

import type { MobileTheme } from "../../design/themes";
import { PROFILE_BADGE_LOCKED_OPACITY } from "./profile-badge-detail-sheet.styles";

/** Row chip geometry is the profile row's, unchanged: 28×28 r10, 14px glyph. */
export const BADGES_SCREEN_CHIP_SIZE = 28;
export const BADGES_SCREEN_CHIP_RADIUS = 10;
export const BADGES_SCREEN_GLYPH_SIZE = 14;
export const BADGES_SCREEN_SUMMARY_BAR_HEIGHT = 6;

export { PROFILE_BADGE_LOCKED_OPACITY };

export const createMobileBadgesScreenStyles = (theme: MobileTheme) =>
  ({
    root: { backgroundColor: theme.surface.base, flex: 1 },
    content: { paddingBottom: 40 },
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      paddingBottom: 4,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    back: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
    backVisual: {
      alignItems: "center",
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 14,
      borderWidth: 1,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    pressed: { opacity: 0.82 },
    headerText: { flex: 1, gap: 1, minWidth: 0 },
    title: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 22,
      letterSpacing: -0.44,
    },
    subtitle: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12.5,
    },
    summaryCard: {
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 24,
      borderWidth: 1,
      gap: 10,
      marginHorizontal: 20,
      marginTop: 12,
      padding: 16,
    },
    summaryRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    summaryLabel: {
      color: theme.text.muted,
      flex: 1,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12.5,
    },
    summaryValue: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 17,
    },
    summaryTrack: {
      backgroundColor: theme.surface.soft,
      borderRadius: BADGES_SCREEN_SUMMARY_BAR_HEIGHT / 2,
      height: BADGES_SCREEN_SUMMARY_BAR_HEIGHT,
      overflow: "hidden",
      width: "100%",
    },
    summaryFill: {
      backgroundColor: theme.accent.strong,
      borderRadius: BADGES_SCREEN_SUMMARY_BAR_HEIGHT / 2,
      height: "100%",
    },
    sectionHeading: {
      color: theme.text.soft,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11.5,
      letterSpacing: 1.38,
      paddingBottom: 4,
      paddingHorizontal: 24,
      paddingTop: 20,
      textTransform: "uppercase",
    },
    familyHeading: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12,
      paddingBottom: 6,
      paddingHorizontal: 24,
      paddingTop: 12,
    },
    card: {
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 24,
      borderWidth: 1,
      marginHorizontal: 20,
      overflow: "hidden",
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    rowDivider: { borderBottomColor: theme.border.subtle, borderBottomWidth: 1 },
    chip: {
      alignItems: "center",
      borderRadius: BADGES_SCREEN_CHIP_RADIUS,
      borderWidth: 1,
      height: BADGES_SCREEN_CHIP_SIZE,
      justifyContent: "center",
      width: BADGES_SCREEN_CHIP_SIZE,
    },
    chipLocked: { opacity: PROFILE_BADGE_LOCKED_OPACITY },
    rowText: { flex: 1, gap: 2, minWidth: 0 },
    rowTitleLine: { alignItems: "baseline", flexDirection: "row", flexWrap: "wrap", gap: 6 },
    rowLabel: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 14,
    },
    rowTier: {
      color: theme.accent.strong,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11.5,
    },
    rowHint: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12,
      lineHeight: 16,
    },
    rowMeta: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11.5,
      textAlign: "right",
    },
    emptyText: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12.5,
      paddingHorizontal: 24,
      paddingTop: 8,
    },
    stateCard: {
      alignItems: "center",
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 24,
      borderWidth: 1,
      gap: 12,
      marginHorizontal: 20,
      marginTop: 12,
      paddingHorizontal: 20,
      paddingVertical: 28,
    },
    stateText: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamily,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "center",
    },
    retryButton: {
      backgroundColor: theme.accent.action,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    retryLabel: {
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13,
    },
  }) satisfies Record<string, TextStyle | ViewStyle>;
