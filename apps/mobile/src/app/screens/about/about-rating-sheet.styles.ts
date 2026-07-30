import type { TextStyle, ViewStyle } from "react-native";

import type { MobileTheme } from "../../../design/themes";
import { mobileAboutMetrics } from "../../../design/tokens";
import { useThemedStyles } from "../../providers/mobile-theme-provider";

export const createAboutRatingSheetStyles = (theme: MobileTheme) =>
  ({
    backdrop: { backgroundColor: theme.about.scrim },
    panel: {
      backgroundColor: "transparent",
      borderWidth: 0,
      elevation: 0,
      overflow: "visible",
      paddingBottom: 0,
      shadowOpacity: 0,
    },
    hiddenHandleArea: { height: 0, paddingBottom: 0, paddingTop: 0 },
    hiddenHandle: { height: 0, width: 0 },
    content: { paddingHorizontal: 0 },

    centered: { alignItems: "center" },
    logo: {
      alignItems: "center",
      elevation: 8,
      height: 52,
      justifyContent: "center",
      shadowColor: theme.about.logoShadow,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: 1,
      shadowRadius: 26,
      width: 52,
    },
    titleFocus: { alignSelf: "stretch", marginTop: 16 },
    title: {
      color: theme.about.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 19,
      lineHeight: 24,
      textAlign: "center",
    },
    reason: {
      color: theme.about.textSecondary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 12.5,
      lineHeight: 18.75,
      marginTop: 6,
      textAlign: "center",
    },
    stars: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginTop: 20,
    },
    starTarget: {
      alignItems: "center",
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    pressed: { opacity: 0.72 },
    selectionLabel: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 12,
      minHeight: 17,
      textAlign: "center",
    },

    feedback: {
      alignSelf: "stretch",
      backgroundColor: theme.about.screen,
      borderRadius: mobileAboutMetrics.ratingFeedbackRadius,
      marginTop: 18,
      paddingHorizontal: 15,
      paddingVertical: 14,
    },
    feedbackTitle: {
      color: theme.about.text,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13,
      lineHeight: 18,
    },
    feedbackDescription: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11.5,
      lineHeight: 16.675,
      marginTop: 5,
    },
    topics: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      marginTop: 12,
    },
    topic: {
      backgroundColor: theme.about.card,
      borderColor: theme.about.cardBorder,
      borderRadius: mobileAboutMetrics.ratingTopicRadius,
      borderWidth: 1,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    topicSelected: {
      backgroundColor: theme.about.accentSurface,
      borderColor: theme.about.accentSurface,
    },
    topicLabel: {
      color: theme.about.textSecondary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11.5,
      lineHeight: 16,
    },
    topicLabelSelected: { color: theme.about.accent },
    storeHint: {
      color: theme.about.textSecondary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 12.5,
      lineHeight: 18,
      marginTop: 18,
      textAlign: "center",
    },

    primary: {
      alignItems: "center",
      alignSelf: "stretch",
      backgroundColor: theme.about.accent,
      borderRadius: mobileAboutMetrics.footerButtonRadius,
      elevation: 6,
      justifyContent: "center",
      marginTop: 16,
      minHeight: 48,
      paddingVertical: 14,
      shadowColor: theme.about.accent,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: 0.24,
      shadowRadius: 24,
    },
    primaryDisabled: { opacity: 0.45 },
    primaryLabel: {
      color: theme.about.updateOnGradient,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 14,
    },
    later: {
      alignItems: "center",
      alignSelf: "stretch",
      justifyContent: "center",
      paddingBottom: 0,
      paddingTop: 13,
    },
    laterLabel: {
      color: theme.about.textSecondary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13.5,
    },
  }) satisfies Record<string, TextStyle | ViewStyle>;

export const useAboutRatingSheetStyles = () => useThemedStyles(createAboutRatingSheetStyles);
