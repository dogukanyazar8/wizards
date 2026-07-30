import type { TextStyle, ViewStyle } from "react-native";

import { mobileAboutMetrics } from "../../../design/tokens";
import type { MobileTheme } from "../../../design/themes";
import { useThemedStyles } from "../../providers/mobile-theme-provider";

export const createMobileAboutHelpCenterStyles = (theme: MobileTheme) =>
  ({
    root: {
      backgroundColor: theme.about.screen,
      flex: 1,
    },
    searchSpacing: {
      marginTop: 12,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingBottom: 40,
    },
    loading: {
      alignItems: "center",
      paddingVertical: 32,
    },
    popularCard: {
      overflow: "hidden",
    },
    articleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      minHeight: mobileAboutMetrics.minRowHeight,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    articleRowDivider: {
      borderTopColor: theme.about.hairline,
      borderTopWidth: 1,
    },
    /**
     * §3.10's explicit exception: `iconTint` is permitted for the 12/800 rank
     * glyph, not body copy. Its role and weight keep the measured contrast.
     */
    articleRank: {
      color: theme.about.iconTint,
      flexShrink: 0,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 12,
      width: 14,
    },
    searchCategory: {
      color: theme.about.textTertiary,
      flexShrink: 0,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 10.5,
      maxWidth: 72,
      textTransform: "uppercase",
    },
    articleText: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    articleTitle: {
      color: theme.about.text,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 13.5,
    },
    articleMeta: {
      color: theme.about.textTertiary,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11,
    },
    chevron: {
      flexShrink: 0,
    },
    categoryGrid: {
      gap: 10,
      marginHorizontal: mobileAboutMetrics.cardMargin,
    },
    categoryGridRow: {
      alignItems: "stretch",
      flexDirection: "row",
      gap: 10,
    },
    categoryTile: {
      backgroundColor: theme.about.card,
      borderColor: theme.about.cardBorder,
      borderRadius: mobileAboutMetrics.noticeRadius,
      borderWidth: 1,
      flex: 1,
      gap: 9,
      padding: 14,
    },
    categoryIconBox: {
      alignItems: "center",
      borderRadius: mobileAboutMetrics.iconBox30Radius,
      height: 30,
      justifyContent: "center",
      width: 30,
    },
    categoryAccountIcon: {
      backgroundColor: theme.about.accentSurface,
    },
    categoryChatIcon: {
      backgroundColor: theme.about.successSurface,
    },
    categoryMediaIcon: {
      backgroundColor: theme.about.warningSurface,
    },
    categoryServerIcon: {
      backgroundColor: theme.about.control,
    },
    categoryTitle: {
      color: theme.about.text,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13,
    },
    categoryCount: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 10.5,
    },
    contactCard: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      marginTop: 16,
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    contactText: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    contactTitle: {
      color: theme.about.text,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 14,
    },
    contactMeta: {
      color: theme.about.textTertiary,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11,
    },
    writeButton: {
      alignItems: "center",
      backgroundColor: theme.about.accentSurface,
      borderRadius: mobileAboutMetrics.writeButtonRadius,
      flexShrink: 0,
      justifyContent: "center",
      minHeight: 36,
      paddingHorizontal: 13,
      paddingVertical: 9,
    },
    writeButtonLabel: {
      color: theme.about.accent,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12.5,
    },
    readerContent: {
      paddingBottom: 48,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    pressed: {
      opacity: 0.82,
    },
  }) satisfies Record<string, TextStyle | ViewStyle>;

export const useMobileAboutHelpCenterStyles = () =>
  useThemedStyles(createMobileAboutHelpCenterStyles);
