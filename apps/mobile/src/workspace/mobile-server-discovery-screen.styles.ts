import type { ImageStyle, TextStyle, ViewStyle } from "react-native";

import type { MobileTheme } from "../design/themes";

// Geometry mirrors the two established list-screen siblings this reuses:
// header/back button/card shell from mobile-server-members-screen.styles.ts,
// search box from workspace-browser.tsx's mobileWorkspaceSearchBox, counts
// row from mobile-server-settings-screen.styles.ts's profile card. No new
// radius, shadow or colour token is introduced here.
export const createMobileServerDiscoveryStyles = (theme: MobileTheme) =>
  ({
    root: { backgroundColor: theme.surface.base, flex: 1 },
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      paddingBottom: 4,
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    backButton: {
      alignItems: "center",
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 14,
      borderWidth: 1,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    headerBody: { flex: 1, gap: 1, minWidth: 0 },
    title: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 22,
      letterSpacing: -0.44,
    },

    searchRow: { paddingBottom: 10, paddingHorizontal: 20, paddingTop: 2 },
    searchBox: {
      alignItems: "center",
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 15,
      borderWidth: 1,
      flexDirection: "row",
      gap: 9,
      minHeight: 44,
      paddingHorizontal: 14,
    },
    searchInput: {
      color: theme.text.primary,
      flex: 1,
      fontFamily: theme.typography.fontFamily,
      fontSize: 13.5,
      includeFontPadding: false,
      lineHeight: 18,
      minWidth: 0,
      paddingVertical: 0,
    },

    list: { flex: 1 },
    listContent: { paddingBottom: 32, paddingTop: 4 },

    card: {
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 18,
      borderWidth: 1,
      gap: 10,
      marginBottom: 10,
      marginHorizontal: 20,
      padding: 12,
    },
    cardTop: { alignItems: "center", flexDirection: "row", gap: 12 },
    cardInfo: { flex: 1, gap: 3, minWidth: 0 },
    nameRow: { alignItems: "center", flexDirection: "row", gap: 5, minWidth: 0 },
    name: {
      color: theme.text.primary,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 14.5,
    },
    countsRow: { alignItems: "center", flexDirection: "row", gap: 6 },
    countText: {
      color: theme.text.visualSecondary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12.5,
    },
    countDot: {
      backgroundColor: theme.control.separatorDot,
      borderRadius: 1.5,
      height: 3,
      width: 3,
    },
    onlineDot: { backgroundColor: theme.status.success, borderRadius: 3.5, height: 7, width: 7 },
    description: {
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12,
      lineHeight: 16.5,
    },
    pressed: { opacity: 0.82 },

    skeletonCard: {
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 18,
      borderWidth: 1,
      gap: 10,
      marginBottom: 10,
      marginHorizontal: 20,
      padding: 12,
    },
    state: { marginHorizontal: 20, marginTop: 40 },
    stateActions: { gap: 10, marginHorizontal: 20, marginTop: 16 },
    error: {
      color: theme.status.dangerOnBase,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12.5,
      lineHeight: 17,
      marginHorizontal: 24,
      marginTop: 8,
      textAlign: "center",
    },
  }) satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;
