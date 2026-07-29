import type { TextStyle, ViewStyle } from "react-native";

import { mobileAboutMetrics } from "../../../design/tokens";
import type { MobileTheme } from "../../../design/themes";
import { useThemedStyles } from "../../providers/mobile-theme-provider";

export const createMobileAboutWhatsNewStyles = (theme: MobileTheme) =>
  ({
    root: {
      backgroundColor: theme.about.screen,
      flex: 1,
    },
    filterScroller: {
      flexGrow: 0,
    },
    filterContent: {
      flexDirection: "row",
      gap: 8,
      paddingBottom: 4,
      paddingHorizontal: mobileAboutMetrics.cardMargin,
      paddingTop: 12,
    },
    filterChip: {
      borderRadius: mobileAboutMetrics.pillRadius,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    filterChipActive: {
      backgroundColor: theme.about.accent,
    },
    filterChipInactive: {
      backgroundColor: theme.about.card,
      borderColor: theme.about.cardBorder,
      borderWidth: 1,
    },
    filterLabel: {
      color: theme.about.textSecondary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 12,
    },
    filterLabelActive: {
      color: theme.about.updateOnGradient,
      fontFamily: theme.typography.fontFamilyBold,
    },
    contentScroll: {
      flex: 1,
    },
    content: {
      paddingBottom: 40,
    },
    currentCard: {
      backgroundColor: theme.about.accentCardSurface,
      borderColor: theme.about.accentCardBorder,
      marginTop: 12,
      paddingHorizontal: mobileAboutMetrics.cardPadding,
      paddingVertical: 15,
    },
    currentTopRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    currentBadge: {
      backgroundColor: theme.about.accentChipSurface,
      borderRadius: mobileAboutMetrics.currentBadgeRadius,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    currentBadgeLabel: {
      color: theme.about.accent,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 9.5,
      letterSpacing: 0.76,
    },
    currentDate: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11,
      marginLeft: "auto",
    },
    currentVersionRow: {
      alignItems: "baseline",
      flexDirection: "row",
      gap: 8,
      marginTop: 11,
    },
    currentVersion: {
      color: theme.about.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 20,
      letterSpacing: -0.2,
    },
    currentCodename: {
      color: theme.about.textSecondary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 13,
    },
    currentSummary: {
      color: theme.about.textSecondary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 12.5,
      lineHeight: 18.75,
      marginTop: 7,
    },
    changeList: {
      gap: 10,
      marginTop: 13,
    },
    changeRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    changeText: {
      color: theme.about.text,
      flex: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 12.5,
      lineHeight: 17.5,
      minWidth: 0,
    },
    emptyRow: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 12.5,
      lineHeight: 17.5,
      minHeight: 20,
    },
    fullNote: {
      alignItems: "center",
      alignSelf: "flex-start",
      flexDirection: "row",
      gap: 6,
      marginTop: 14,
    },
    fullNoteLabel: {
      color: theme.about.accent,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 12,
    },
    historyRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      minHeight: mobileAboutMetrics.minRowHeight,
      paddingHorizontal: mobileAboutMetrics.cardPadding,
      paddingVertical: 12,
    },
    historyRowDivider: {
      borderTopColor: theme.about.hairline,
      borderTopWidth: 1,
    },
    historyDot: {
      backgroundColor: theme.about.timelineDot,
      borderRadius: theme.radii.pill,
      height: 9,
      width: 9,
    },
    historyText: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    historyTitle: {
      color: theme.about.text,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13.5,
    },
    historyCodename: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 13.5,
    },
    historyMeta: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11,
    },
    allHistoryRow: {
      alignItems: "center",
      borderTopColor: theme.about.hairline,
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 8,
      minHeight: mobileAboutMetrics.minRowHeight,
      paddingHorizontal: mobileAboutMetrics.cardPadding,
      paddingVertical: 13,
    },
    allHistoryLabel: {
      color: theme.about.accent,
      flex: 1,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12.5,
    },
    pressed: {
      opacity: 0.82,
    },
    errorAction: {
      color: theme.about.accent,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12.5,
    },
    skeletonCurrent: {
      gap: 12,
    },
    skeletonHistory: {
      gap: 12,
      marginTop: 18,
      padding: mobileAboutMetrics.cardPadding,
    },
    skeletonLine: {
      marginTop: 2,
    },
  }) satisfies Record<string, TextStyle | ViewStyle>;

export const useMobileAboutWhatsNewStyles = () => useThemedStyles(createMobileAboutWhatsNewStyles);
