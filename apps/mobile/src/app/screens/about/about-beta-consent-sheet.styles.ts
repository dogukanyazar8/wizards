import type { TextStyle, ViewStyle } from "react-native";

import type { MobileTheme } from "../../../design/themes";
import { mobileAboutMetrics } from "../../../design/tokens";
import { useThemedStyles } from "../../providers/mobile-theme-provider";

export const createAboutBetaConsentSheetStyles = (theme: MobileTheme) =>
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

    headerIcon: {
      alignItems: "center",
      backgroundColor: theme.about.accentSurface,
      borderRadius: mobileAboutMetrics.iconBox44Radius,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    titleFocus: { alignSelf: "stretch", marginTop: 14 },
    title: {
      color: theme.about.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 19,
      lineHeight: 24,
    },
    intro: {
      color: theme.about.textSecondary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 12.5,
      lineHeight: 18.75,
      marginTop: 6,
    },
    conditions: { gap: 13, marginTop: 18 },
    condition: { alignItems: "flex-start", flexDirection: "row", gap: 11 },
    conditionIcon: {
      alignItems: "center",
      borderRadius: mobileAboutMetrics.iconBox26Radius,
      height: mobileAboutMetrics.iconBox26,
      justifyContent: "center",
      width: mobileAboutMetrics.iconBox26,
    },
    conditionIconBenefit: { backgroundColor: theme.about.accentSurface },
    conditionIconRisk: { backgroundColor: theme.about.warningSurface },
    conditionIconSafety: { backgroundColor: theme.about.successSurface },
    conditionText: {
      color: theme.about.text,
      flex: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 12.5,
      lineHeight: 18.125,
    },
    consentRow: {
      alignItems: "center",
      backgroundColor: theme.about.screen,
      borderRadius: mobileAboutMetrics.rowRadiusInner,
      flexDirection: "row",
      gap: 11,
      marginTop: 18,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    checkbox: {
      alignItems: "center",
      borderRadius: mobileAboutMetrics.currentBadgeRadius,
      height: 20,
      justifyContent: "center",
      width: 20,
    },
    checkboxIdle: {
      backgroundColor: theme.about.card,
      borderColor: theme.about.radioBorder,
      borderWidth: 1,
    },
    checkboxChecked: { backgroundColor: theme.about.accent },
    consentLabel: {
      color: theme.about.text,
      flex: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 12,
      lineHeight: 16.8,
    },
    primary: {
      alignItems: "center",
      backgroundColor: theme.about.accent,
      borderRadius: mobileAboutMetrics.footerButtonRadius,
      elevation: 6,
      justifyContent: "center",
      marginTop: 16,
      paddingVertical: 14,
      shadowColor: theme.about.accent,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: 0.24,
      shadowRadius: 24,
    },
    primaryDisabled: { opacity: 0.45 },
    primaryPressed: { opacity: 0.84 },
    primaryLabel: {
      color: theme.about.updateOnGradient,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 14,
    },
    cancel: {
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: 0,
      paddingTop: 13,
    },
    cancelPressed: { opacity: 0.72 },
    cancelLabel: {
      color: theme.about.textSecondary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13.5,
    },
  }) satisfies Record<string, TextStyle | ViewStyle>;

export const useAboutBetaConsentSheetStyles = () =>
  useThemedStyles(createAboutBetaConsentSheetStyles);
