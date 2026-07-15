import type { TextStyle, ViewStyle } from "react-native";

import type { MobileTheme } from "../../../design/themes";

/** Exact 3a language-picker presentation; interaction is owned by the sheet component. */
export const createAuthLanguagePickerSheetStyles = (theme: MobileTheme) => {
  const language = theme.layout.auth.languageSheet;

  return {
    closeButton: {
      alignItems: "center" as const,
      backgroundColor: theme.authLanguage.closeSurface,
      borderRadius: language.closeRadius,
      height: language.close,
      justifyContent: "center" as const,
      width: language.close,
    },
    content: {
      flex: 1,
      paddingHorizontal: language.contentHorizontalPadding,
    },
    deviceRow: {
      alignItems: "center" as const,
      backgroundColor: theme.authLanguage.deviceSurface,
      borderRadius: language.deviceRadius,
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      marginTop: 12,
      paddingHorizontal: language.rowPaddingHorizontal,
      paddingVertical: 12,
    },
    deviceRowLabel: {
      ...theme.typography.authLanguageOption,
      color: theme.text.primary,
      flex: 1,
      marginRight: 12,
    },
    header: {
      alignItems: "flex-start" as const,
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      marginBottom: 16,
    },
    headerCopy: {
      flex: 1,
      marginRight: 12,
      paddingTop: 2,
    },
    languageBadge: {
      alignItems: "center" as const,
      backgroundColor: theme.authLanguage.selectedSurface,
      borderRadius: language.badgeRadius,
      height: language.badge,
      justifyContent: "center" as const,
      marginRight: 12,
      width: language.badge,
    },
    languageBadgeRtl: {
      marginLeft: 12,
      marginRight: 0,
    },
    languageBadgeLabel: {
      ...theme.typography.label,
      color: theme.accent.strong,
      letterSpacing: 0.4,
    },
    languageCopy: {
      flex: 1,
    },
    languageCopyRtl: {
      alignItems: "flex-end" as const,
    },
    languageList: {
      gap: 8,
    },
    languageNativeName: {
      ...theme.typography.authLanguageOption,
      color: theme.text.primary,
    },
    languageRow: {
      alignItems: "center" as const,
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: language.rowRadius,
      borderWidth: 1.5,
      flexDirection: "row" as const,
      minHeight: 64,
      paddingHorizontal: language.rowPaddingHorizontal,
      paddingVertical: language.rowPaddingVertical,
    },
    languageRowDisabled: {
      opacity: 0.5,
    },
    languageRowSelected: {
      backgroundColor: theme.authLanguage.selectedSurface,
      borderColor: theme.authLanguage.selectedBorder,
    },
    languageRowRtl: {
      flexDirection: "row-reverse" as const,
    },
    languageTextRtl: {
      textAlign: "right" as const,
      writingDirection: "rtl" as const,
    },
    languageTurkishName: {
      ...theme.typography.authLanguageOptionSecondary,
      color: theme.text.muted,
      marginTop: 1,
    },
    radio: {
      alignItems: "center" as const,
      borderColor: theme.authLanguage.radio,
      borderRadius: 11,
      borderWidth: 1.5,
      height: 22,
      justifyContent: "center" as const,
      marginLeft: 12,
      width: 22,
    },
    radioSelected: {
      backgroundColor: theme.authLanguage.selectedBorder,
      borderColor: theme.authLanguage.selectedBorder,
    },
    radioRtl: {
      marginLeft: 0,
      marginRight: 12,
    },
    scrollContent: {
      paddingBottom: language.contentPaddingBottom,
    },
    searchInput: {
      ...theme.typography.authInput,
      backgroundColor: theme.authLanguage.deviceSurface,
      borderColor: theme.border.subtle,
      borderRadius: 16,
      borderWidth: 1,
      color: theme.text.primary,
      marginBottom: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    subtitle: {
      ...theme.typography.authLanguageSheetSubtitle,
      color: theme.text.muted,
      marginTop: 2,
    },
    title: {
      ...theme.typography.authLanguageSheetTitle,
      color: theme.text.primary,
    },
    toggleThumb: {
      backgroundColor: theme.text.onPrimary,
      borderRadius: language.toggleThumb / 2,
      height: language.toggleThumb,
      width: language.toggleThumb,
    },
    toggleThumbEnabled: {
      transform: [{ translateX: language.toggleWidth - language.toggleThumb - 6 }],
    },
    toggleTrack: {
      alignItems: "flex-start" as const,
      backgroundColor: theme.authLanguage.radio,
      borderRadius: language.toggleHeight / 2,
      height: language.toggleHeight,
      justifyContent: "center" as const,
      paddingHorizontal: 3,
      width: language.toggleWidth,
    },
    toggleTrackEnabled: {
      backgroundColor: theme.authLanguage.selectedBorder,
    },
  } satisfies Record<string, TextStyle | ViewStyle>;
};
