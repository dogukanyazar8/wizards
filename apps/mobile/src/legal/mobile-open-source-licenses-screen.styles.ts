import type { TextStyle, ViewStyle } from "react-native";

import type { MobileTheme } from "../design/themes";
import { useThemedStyles } from "../app/providers/mobile-theme-provider";

/**
 * Horizontal inset every card on the settings stack sits at. The list recycles
 * rows, so each row carries the inset itself instead of inheriting it from a
 * scroll container.
 */
const SCREEN_INSET = 20;
/** Card radius shared with the legal reader and the about screen. */
const CARD_RADIUS = 20;

export const createMobileOpenSourceLicensesStyles = (theme: MobileTheme) =>
  ({
    root: { backgroundColor: theme.surface.base, flex: 1 },
    listContent: { paddingBottom: 40, paddingTop: 8 },
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: SCREEN_INSET,
      paddingVertical: 8,
    },
    backButton: {
      alignItems: "center",
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 13,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    headerTitle: {
      color: theme.text.primary,
      flex: 1,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 19,
      minWidth: 0,
    },
    pressed: { opacity: 0.78 },

    heroCard: {
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 22,
      borderWidth: 1,
      gap: 10,
      marginHorizontal: SCREEN_INSET,
      paddingHorizontal: 18,
      paddingVertical: 16,
    },
    heroBadge: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: theme.accent.soft,
      borderRadius: 999,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    heroBadgeText: {
      color: theme.accent.strong,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11.5,
    },
    heroTitle: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 22,
      letterSpacing: -0.4,
    },
    heroDescription: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamily,
      fontSize: 13,
      lineHeight: 19,
    },
    statRow: { flexDirection: "row", gap: 10, paddingTop: 2 },
    statChip: {
      backgroundColor: theme.surface.soft,
      borderColor: theme.border.subtle,
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      gap: 2,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    statValue: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 15,
      letterSpacing: -0.2,
    },
    statLabel: {
      color: theme.text.soft,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11,
    },
    heroMetaRow: { alignItems: "center", flexDirection: "row", gap: 6 },
    heroMetaText: {
      color: theme.text.soft,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11.5,
    },

    searchField: {
      alignItems: "center",
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginHorizontal: SCREEN_INSET,
      marginTop: 14,
      minHeight: 46,
      paddingHorizontal: 14,
    },
    searchInput: {
      color: theme.text.primary,
      flex: 1,
      fontFamily: theme.typography.fontFamily,
      fontSize: 14,
      minWidth: 0,
      paddingVertical: 0,
    },
    searchClear: {
      alignItems: "center",
      backgroundColor: theme.surface.soft,
      borderRadius: 999,
      height: 22,
      justifyContent: "center",
      width: 22,
    },
    listHeaderSpacer: { height: 14 },

    // The list is flat so it can recycle rows; the card outline is assembled
    // from the pieces below instead of wrapping a group in one container.
    groupHeader: {
      alignItems: "center",
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderTopLeftRadius: CARD_RADIUS,
      borderTopRightRadius: CARD_RADIUS,
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginHorizontal: SCREEN_INSET,
      minHeight: 60,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    groupHeaderCollapsed: {
      borderBottomLeftRadius: CARD_RADIUS,
      borderBottomRightRadius: CARD_RADIUS,
      borderBottomWidth: 1,
      marginBottom: 10,
    },
    groupIconBox: {
      alignItems: "center",
      backgroundColor: theme.accent.soft,
      borderRadius: 12,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    groupText: { flex: 1, gap: 2, minWidth: 0 },
    groupLicense: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 14.5,
    },
    groupCountText: {
      color: theme.text.soft,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11.5,
    },

    packageRow: {
      alignItems: "center",
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderTopColor: theme.border.subtle,
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginHorizontal: SCREEN_INSET,
      minHeight: 46,
      paddingHorizontal: 16,
      paddingVertical: 9,
    },
    packageRowLast: {
      borderBottomLeftRadius: CARD_RADIUS,
      borderBottomRightRadius: CARD_RADIUS,
      borderBottomWidth: 1,
      marginBottom: 10,
    },
    packageName: {
      color: theme.text.secondary,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 13,
      minWidth: 0,
    },
    packageVersion: {
      backgroundColor: theme.surface.soft,
      borderRadius: 999,
      color: theme.text.soft,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 10.5,
      overflow: "hidden",
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    packageSpacer: { flex: 1, minWidth: 8 },

    emptyState: { marginHorizontal: SCREEN_INSET },
    note: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 9,
      marginHorizontal: SCREEN_INSET,
      marginTop: 10,
      paddingRight: 4,
    },
    noteText: {
      color: theme.text.soft,
      flex: 1,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12,
      lineHeight: 18,
      minWidth: 0,
    },
  }) satisfies Record<string, TextStyle | ViewStyle>;

export const useMobileOpenSourceLicensesStyles = () =>
  useThemedStyles(createMobileOpenSourceLicensesStyles);
