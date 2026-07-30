import type { TextStyle, ViewStyle } from "react-native";

import { mobileAboutMetrics } from "../../../design/tokens";
import type { MobileTheme } from "../../../design/themes";
import { useThemedStyles } from "../../providers/mobile-theme-provider";

export const createMobileAboutReleaseHistoryStyles = (theme: MobileTheme) =>
  ({
    root: {
      backgroundColor: theme.about.screen,
      flex: 1,
    },
    totalBadge: {
      backgroundColor: theme.about.card,
      borderColor: theme.about.cardBorder,
      borderRadius: mobileAboutMetrics.pillRadius,
      borderWidth: 1,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },
    totalBadgeLabel: {
      color: theme.about.textSecondary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12.5,
    },
    searchSpacing: {
      marginTop: 12,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingBottom: 40,
    },
    yearCard: {
      paddingVertical: 4,
    },
    releaseRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      minHeight: mobileAboutMetrics.minRowHeight,
      paddingHorizontal: mobileAboutMetrics.cardPadding,
      paddingVertical: 11,
    },
    releaseRowDivider: {
      borderTopColor: theme.about.hairline,
      borderTopWidth: 1,
    },
    marker: {
      alignItems: "center",
      borderRadius: 8,
      flexShrink: 0,
      height: 16,
      justifyContent: "center",
      marginLeft: 1,
      width: 16,
    },
    installedMarker: {
      backgroundColor: theme.about.accentSurface,
    },
    dot: {
      borderRadius: mobileAboutMetrics.pillRadius,
      height: 9,
      width: 9,
    },
    installedDot: {
      backgroundColor: theme.about.accent,
    },
    timelineDot: {
      backgroundColor: theme.about.timelineDot,
    },
    releaseText: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    titleLine: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      minWidth: 0,
    },
    versionTitle: {
      color: theme.about.text,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13.5,
      minWidth: 0,
    },
    codename: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 13.5,
    },
    statusChip: {
      borderRadius: mobileAboutMetrics.chipRadiusSmall,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    installedChip: {
      backgroundColor: theme.about.accentSurface,
    },
    skippedChip: {
      backgroundColor: theme.about.control,
    },
    statusChipLabel: {
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 9,
      letterSpacing: 0.54,
    },
    installedChipLabel: {
      color: theme.about.accent,
    },
    skippedChipLabel: {
      color: theme.about.textTertiary,
    },
    releaseMeta: {
      color: theme.about.textTertiary,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11,
    },
    chevron: {
      flexShrink: 0,
    },
    loadOlderRow: {
      alignItems: "center",
      borderTopColor: theme.about.hairline,
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 8,
      minHeight: mobileAboutMetrics.minRowHeight,
      paddingHorizontal: mobileAboutMetrics.cardPadding,
      paddingVertical: 13,
    },
    loadOlderLabel: {
      color: theme.about.accent,
      flex: 1,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12.5,
    },
    loading: {
      alignItems: "center",
      paddingVertical: 32,
    },
    stateCard: {
      marginTop: 16,
    },
    emptyState: {
      marginHorizontal: mobileAboutMetrics.cardMargin,
      marginTop: 16,
    },
    searchScopeRow: {
      justifyContent: "center",
      minHeight: mobileAboutMetrics.minRowHeight,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    searchScopeLabel: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11,
      textAlign: "center",
    },
    pressed: {
      opacity: 0.82,
    },
  }) satisfies Record<string, TextStyle | ViewStyle>;

export const useMobileAboutReleaseHistoryStyles = () =>
  useThemedStyles(createMobileAboutReleaseHistoryStyles);
