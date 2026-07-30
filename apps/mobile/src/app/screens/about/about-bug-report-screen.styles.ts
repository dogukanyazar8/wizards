import type { TextStyle, ViewStyle } from "react-native";

import { mobileAboutMetrics } from "../../../design/tokens";
import type { MobileTheme } from "../../../design/themes";
import { useThemedStyles } from "../../providers/mobile-theme-provider";

export const createMobileBugReportStyles = (theme: MobileTheme) =>
  ({
    root: { backgroundColor: theme.about.screen, flex: 1 },
    scroll: { flex: 1 },
    content: { paddingTop: 2 },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      paddingHorizontal: mobileAboutMetrics.cardMargin,
    },
    chip: {
      alignItems: "center",
      borderRadius: mobileAboutMetrics.pillRadius,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: mobileAboutMetrics.minRowHeight,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    chipIdle: {
      backgroundColor: theme.about.card,
      borderColor: theme.about.cardBorder,
    },
    chipSelected: {
      backgroundColor: theme.about.accent,
      borderColor: theme.about.accent,
    },
    chipLabel: {
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 12,
    },
    chipLabelIdle: { color: theme.about.textSecondary },
    chipLabelSelected: {
      color: theme.about.updateOnGradient,
      fontFamily: theme.typography.fontFamilyBold,
    },
    pressed: { opacity: 0.82 },
    descriptionCard: {
      backgroundColor: theme.about.card,
      borderColor: theme.about.cardBorder,
      borderRadius: mobileAboutMetrics.noticeRadius,
      borderWidth: 1,
      marginHorizontal: mobileAboutMetrics.cardMargin,
      paddingBottom: 11,
      paddingHorizontal: mobileAboutMetrics.cardPadding,
      paddingTop: 14,
    },
    input: {
      color: theme.about.text,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 13.5,
      lineHeight: 20.25,
      minHeight: 82,
      padding: 0,
      textAlignVertical: "top",
    },
    counterRow: {
      alignItems: "center",
      borderTopColor: theme.about.hairline,
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 8,
      marginTop: 12,
      paddingTop: 11,
    },
    hint: {
      color: theme.about.textTertiary,
      flex: 1,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11,
    },
    counter: {
      color: theme.about.iconTint,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11,
    },
    counterWarning: { color: theme.about.warningText },
    attachmentsCard: {
      backgroundColor: theme.about.card,
      borderColor: theme.about.cardBorder,
      borderRadius: mobileAboutMetrics.cardRadius,
      borderWidth: 1,
      marginHorizontal: mobileAboutMetrics.cardMargin,
    },
    attachmentRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      minHeight: mobileAboutMetrics.minRowHeight,
      paddingHorizontal: mobileAboutMetrics.cardPadding,
      paddingVertical: 11,
    },
    attachmentDivider: {
      borderTopColor: theme.about.hairline,
      borderTopWidth: 1,
    },
    attachmentText: { flex: 1, gap: 2, minWidth: 0 },
    attachmentTitle: {
      color: theme.about.text,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 14,
    },
    attachmentSubtitle: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11,
    },
    screenshotPreview: {
      alignItems: "center",
      backgroundColor: theme.about.control,
      borderColor: theme.about.cardBorder,
      borderRadius: 8,
      borderWidth: 1,
      height: 44,
      justifyContent: "flex-end",
      overflow: "hidden",
      paddingBottom: 7,
      width: 34,
    },
    screenshotImage: { height: "100%", width: "100%" },
    previewBars: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 2,
    },
    previewBar: {
      backgroundColor: theme.about.timelineDot,
      borderRadius: 2,
      width: 3,
    },
    privacy: {
      alignItems: "flex-start",
      backgroundColor: theme.about.card,
      borderColor: theme.about.cardBorder,
      borderRadius: mobileAboutMetrics.noticeRadius,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      marginHorizontal: mobileAboutMetrics.cardMargin,
      marginTop: 14,
      paddingHorizontal: 15,
      paddingVertical: 12,
    },
    privacyText: {
      color: theme.about.textTertiary,
      flex: 1,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11.5,
      lineHeight: 17.25,
    },
    flowFooter: { width: "100%" },
  }) satisfies Record<string, TextStyle | ViewStyle>;

export const useMobileBugReportStyles = () => useThemedStyles(createMobileBugReportStyles);
