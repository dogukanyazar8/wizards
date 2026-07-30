import type { TextStyle, ViewStyle } from "react-native";

import type { MobileTheme } from "../../../design/themes";
import { useThemedStyles } from "../../providers/mobile-theme-provider";

export const createAboutUpdateSheetStyles = (theme: MobileTheme) =>
  ({
    backdrop: { backgroundColor: theme.about.scrim },
    panel: {
      backgroundColor: theme.about.card,
      borderBottomLeftRadius: 44,
      borderBottomRightRadius: 44,
      borderColor: theme.about.cardBorder,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      borderWidth: 0,
      shadowColor: theme.about.sheetShadow,
      shadowOffset: { height: -14, width: 0 },
      shadowOpacity: 0.18,
      shadowRadius: 40,
    },
    handleArea: { paddingBottom: 16, paddingTop: 10 },
    handle: {
      backgroundColor: theme.about.grabber,
      borderRadius: 2,
      height: 4,
      width: 38,
    },
    content: { paddingHorizontal: 20 },
    header: { alignItems: "center", flexDirection: "row", gap: 13 },
    logoShadow: {
      borderRadius: 11.5,
      elevation: 8,
      height: 46,
      shadowColor: theme.about.logoShadow,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: 1,
      shadowRadius: 22,
      width: 46,
    },
    headerText: { flex: 1, gap: 3, minWidth: 0 },
    title: {
      color: theme.about.text,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 15.5,
    },
    meta: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11.5,
    },
    percent: {
      color: theme.about.accent,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 15,
    },
    progressTrack: {
      backgroundColor: theme.about.progressTrack,
      borderRadius: 4,
      height: 8,
      marginTop: 14,
      overflow: "hidden",
    },
    progressFill: {
      backgroundColor: theme.about.accent,
      borderRadius: 4,
      height: 8,
    },
    indeterminate: {
      backgroundColor: theme.about.accent,
      borderRadius: 4,
      height: 8,
      width: "35%",
    },
    steps: { gap: 11, marginTop: 16 },
    stepRow: { alignItems: "center", flexDirection: "row", gap: 10 },
    stepCircle: {
      alignItems: "center",
      borderRadius: 10,
      height: 20,
      justifyContent: "center",
      width: 20,
    },
    stepPending: { backgroundColor: theme.about.control },
    stepActive: {
      borderColor: theme.about.accent,
      borderTopColor: theme.about.spinnerTrail,
      borderWidth: 2.5,
    },
    stepDanger: {
      borderColor: theme.about.danger,
      borderWidth: 2.5,
    },
    stepComplete: { backgroundColor: theme.about.successSurface },
    stepLabel: {
      color: theme.about.text,
      flex: 1,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12.5,
    },
    stepLabelPending: {
      color: theme.about.textMuted,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    stepLabelDanger: { color: theme.about.danger },
    network: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11.5,
    },
    actions: { flexDirection: "row", gap: 9, marginTop: 18 },
    action: {
      alignItems: "center",
      backgroundColor: theme.about.control,
      borderRadius: 15,
      flex: 1,
      justifyContent: "center",
      minHeight: 44,
      paddingVertical: 13,
    },
    actionPressed: { opacity: 0.82 },
    actionText: {
      color: theme.about.text,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13.5,
    },
    retry: { backgroundColor: theme.about.danger },
    retryText: { color: theme.about.updateOnGradient },
    note: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11,
      marginTop: 12,
      textAlign: "center",
    },
    noteDanger: { color: theme.about.danger },
  }) satisfies Record<string, TextStyle | ViewStyle>;

export const useAboutUpdateSheetStyles = () => useThemedStyles(createAboutUpdateSheetStyles);
