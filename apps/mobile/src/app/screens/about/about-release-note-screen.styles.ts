import type { TextStyle, ViewStyle } from "react-native";

import { mobileAboutMetrics } from "../../../design/tokens";
import type { MobileTheme } from "../../../design/themes";
import { useThemedStyles } from "../../providers/mobile-theme-provider";

export const createMobileAboutReleaseNoteStyles = (theme: MobileTheme) =>
  ({
    root: {
      backgroundColor: theme.about.screen,
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingBottom: 40,
    },
    releaseHeader: {
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    versionRow: {
      alignItems: "baseline",
      flexDirection: "row",
      gap: 9,
    },
    version: {
      color: theme.about.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 26,
      letterSpacing: -0.52,
    },
    codename: {
      color: theme.about.textSecondary,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 15,
      minWidth: 0,
    },
    metaRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      marginTop: 9,
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
    meta: {
      color: theme.about.textTertiary,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11.5,
      minWidth: 0,
    },
    summary: {
      color: theme.about.textSecondary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 12.5,
      lineHeight: 19.375,
      marginTop: 11,
    },
    newCard: {
      gap: 13,
      paddingHorizontal: mobileAboutMetrics.cardPadding,
      paddingVertical: 14,
    },
    newRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 11,
    },
    newIcon: {
      alignItems: "center",
      backgroundColor: theme.about.accentSurface,
      borderRadius: mobileAboutMetrics.iconBox26Radius,
      flexShrink: 0,
      height: mobileAboutMetrics.iconBox26,
      justifyContent: "center",
      width: mobileAboutMetrics.iconBox26,
    },
    newText: {
      flex: 1,
      gap: 3,
      minWidth: 0,
    },
    newTitle: {
      color: theme.about.text,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13.5,
    },
    newDetail: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11.5,
      lineHeight: 16.675,
    },
    flatCard: {
      gap: 11,
      paddingHorizontal: mobileAboutMetrics.cardPadding,
      paddingVertical: 12,
    },
    flatRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 11,
    },
    improvedDot: {
      backgroundColor: theme.about.successText,
      borderRadius: theme.radii.pill,
      flexShrink: 0,
      height: 6,
      marginTop: 6,
      width: 6,
    },
    fixedDot: {
      backgroundColor: theme.about.warningText,
      borderRadius: theme.radii.pill,
      flexShrink: 0,
      height: 6,
      marginTop: 6,
      width: 6,
    },
    flatTextColumn: {
      flex: 1,
      gap: 3,
      minWidth: 0,
    },
    flatText: {
      color: theme.about.text,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 12.5,
      lineHeight: 18.125,
    },
    // The handoff draws improvements and fixes as one descriptive line, but
    // release management writes short titles ("Performans") and puts the
    // sentence in `detail`. Hiding it left those rows with no content at all,
    // so the detail is rendered with the same secondary type as the NEW group.
    flatDetail: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11.5,
      lineHeight: 16.675,
    },
    loadingHeader: {
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    loadingCard: {
      gap: 11,
      marginTop: 16,
      padding: mobileAboutMetrics.cardPadding,
    },
    emptyState: {
      marginHorizontal: mobileAboutMetrics.cardMargin,
      marginTop: 16,
    },
    emptyAction: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: mobileAboutMetrics.minRowHeight,
      paddingHorizontal: 16,
    },
    emptyActionLabel: {
      color: theme.about.accent,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12.5,
    },
    pressed: {
      opacity: 0.82,
    },
  }) satisfies Record<string, TextStyle | ViewStyle>;

export const useMobileAboutReleaseNoteStyles = () =>
  useThemedStyles(createMobileAboutReleaseNoteStyles);
