import type { TextStyle, ViewStyle } from "react-native";

import { mobileAboutMetrics } from "../../../design/tokens";
import type { MobileTheme } from "../../../design/themes";
import { useThemedStyles } from "../../providers/mobile-theme-provider";

export const createMobileAboutChannelStyles = (theme: MobileTheme) =>
  ({
    root: {
      backgroundColor: theme.about.screen,
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
    content: {},
    intro: {
      color: theme.about.textSecondary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 12.5,
      lineHeight: 19.375,
      paddingHorizontal: 20,
      paddingTop: 8,
    },
    channelCard: {
      marginTop: 14,
    },
    channelRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
      minHeight: mobileAboutMetrics.minRowHeight,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    channelRowDivider: {
      borderTopColor: theme.about.hairline,
      borderTopWidth: 1,
    },
    selectedRow: {
      backgroundColor: theme.about.accentCardSurface,
    },
    selectedFirstRow: {
      borderTopLeftRadius: mobileAboutMetrics.cardRadius,
      borderTopRightRadius: mobileAboutMetrics.cardRadius,
    },
    selectedLastRow: {
      borderBottomLeftRadius: mobileAboutMetrics.cardRadius,
      borderBottomRightRadius: mobileAboutMetrics.cardRadius,
    },
    radio: {
      alignItems: "center",
      borderRadius: 11,
      flexShrink: 0,
      height: 22,
      justifyContent: "center",
      marginTop: 1,
      width: 22,
    },
    radioIdle: {
      borderColor: theme.about.radioBorder,
      borderWidth: 2,
    },
    radioSelected: {
      backgroundColor: theme.about.accent,
    },
    channelText: {
      flex: 1,
      gap: 3,
      minWidth: 0,
    },
    titleLine: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      minWidth: 0,
    },
    channelTitle: {
      color: theme.about.text,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 14.5,
    },
    chip: {
      backgroundColor: theme.about.warningChipSurface,
      borderRadius: mobileAboutMetrics.chipRadiusSmall,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    chipLabel: {
      color: theme.about.warningText,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 9,
      letterSpacing: 0.54,
    },
    channelDescription: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11.5,
      lineHeight: 16.675,
    },
    channelMeta: {
      color: theme.about.textSecondary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11,
      marginTop: 3,
    },
    warningCard: {
      alignItems: "flex-start",
      backgroundColor: theme.about.warningSurface,
      borderRadius: mobileAboutMetrics.noticeRadius,
      flexDirection: "row",
      gap: 11,
      marginHorizontal: 16,
      marginTop: 14,
      paddingHorizontal: 15,
      paddingVertical: 13,
    },
    warningIcon: {
      flexShrink: 0,
      marginTop: 1,
    },
    warningText: {
      color: theme.about.warningNoteText,
      flex: 1,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11.5,
      lineHeight: 17.25,
    },
    effectsCard: {
      gap: 11,
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    effectRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    effectIcon: {
      flexShrink: 0,
    },
    effectText: {
      color: theme.about.text,
      flex: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 12.5,
    },
    pressed: {
      opacity: 0.82,
    },
  }) satisfies Record<string, TextStyle | ViewStyle>;

export const useMobileAboutChannelStyles = () => useThemedStyles(createMobileAboutChannelStyles);
