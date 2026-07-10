import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { getMobileThemeCompatibilityColors } from "../../design/mobile-theme-compat";
import type { MobileTheme } from "../../design/themes";
import { useThemedStyles } from "../providers/mobile-theme-provider";
import { createSharedStyles } from "../styles/shared-styles";

export const createSettingsScreenStyles = (theme: MobileTheme) => {
  const mobileColors = getMobileThemeCompatibilityColors(theme);
  const mobileRadii = theme.radii;
  const mobileSizing = theme.sizing;
  const settingsScreenStyles = {
    contractCard: {
      gap: 8,
      minWidth: 0,
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.surfaceSoft,
      padding: 14,
    },
    contractEndpoint: {
      alignSelf: "flex-start",
      maxWidth: "100%",
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.primarySoft,
      color: mobileColors.accentStrong,
      fontSize: 12,
      fontWeight: "800",
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    contractTitle: {
      color: mobileColors.text,
      fontSize: 15,
      fontWeight: "900",
    },
    developerSection: {
      gap: 10,
      minWidth: 0,
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.card,
      backgroundColor: mobileColors.surfaceSoft,
      padding: 12,
    },
    developerSectionHeader: {
      gap: 4,
      minWidth: 0,
    },
    diagnosticsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      minWidth: 0,
    },
    environmentCard: {
      gap: 4,
      minWidth: 0,
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.surfaceSoft,
      padding: 14,
    },
    environmentUrl: {
      color: mobileColors.muted,
      fontSize: 13,
      fontWeight: "600",
    },
    environmentValue: {
      color: mobileColors.text,
      fontSize: 18,
      fontWeight: "800",
    },
    nativeSettingsList: {
      gap: 7,
      minWidth: 0,
    },
    nativeSettingsRow: {
      minHeight: 56,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.white,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    nativeSettingsRowDescription: {
      color: mobileColors.muted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: "700",
    },
    nativeSettingsRowText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    nativeSettingsRowTitle: {
      color: mobileColors.text,
      fontSize: 13,
      fontWeight: "900",
    },
    nativeSettingsRowValue: {
      maxWidth: 92,
      color: mobileColors.muted,
      fontSize: 11,
      fontWeight: "900",
      textAlign: "right",
    },
    nativeSettingsRowValueDanger: {
      color: mobileColors.danger,
    },
    nativeSettingsRowValueSuccess: {
      color: mobileColors.success,
    },
    nativeSettingsRowValueWarning: {
      color: mobileColors.warning,
    },
    qualityGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      minWidth: 0,
    },
    releaseBudgetList: {
      gap: 7,
    },
    releaseBudgetMetric: {
      flexShrink: 1,
      minWidth: 0,
      color: mobileColors.text,
      fontSize: 12,
      fontWeight: "900",
    },
    releaseBudgetRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 10,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.white,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    releaseBudgetTarget: {
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 86,
      textAlign: "right",
      color: mobileColors.muted,
      fontSize: 11,
      fontWeight: "700",
    },
    settingsEvidenceDescription: {
      color: mobileColors.muted,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: "700",
    },
    settingsEvidenceDot: {
      width: 9,
      height: 9,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.mutedSoft,
    },
    settingsEvidenceDotDanger: {
      backgroundColor: mobileColors.danger,
    },
    settingsEvidenceDotSuccess: {
      backgroundColor: mobileColors.success,
    },
    settingsEvidenceDotWarning: {
      backgroundColor: mobileColors.warning,
    },
    settingsEvidenceGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      minWidth: 0,
    },
    settingsEvidenceLabel: {
      color: mobileColors.mutedSoft,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.7,
      textTransform: "uppercase",
    },
    settingsEvidenceList: {
      gap: 7,
      minWidth: 0,
    },
    settingsEvidenceRow: {
      minHeight: 46,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.white,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    settingsEvidenceRowText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    settingsEvidenceRowTitle: {
      color: mobileColors.text,
      fontSize: 13,
      fontWeight: "900",
    },
    settingsEvidenceRowValue: {
      maxWidth: 92,
      color: mobileColors.muted,
      fontSize: 12,
      fontWeight: "900",
      textAlign: "right",
    },
    settingsEvidenceRowValueDanger: {
      color: mobileColors.danger,
    },
    settingsEvidenceRowValueSuccess: {
      color: mobileColors.success,
    },
    settingsEvidenceRowValueWarning: {
      color: mobileColors.warning,
    },
    settingsEvidenceTile: {
      flexGrow: 1,
      flexBasis: 92,
      minWidth: 0,
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.white,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    settingsEvidenceTileDanger: {
      borderColor: mobileColors.danger,
      backgroundColor: mobileColors.dangerSoft,
    },
    settingsEvidenceTileSuccess: {
      borderColor: mobileColors.success,
      backgroundColor: mobileColors.surfaceSoft,
    },
    settingsEvidenceTileWarning: {
      borderColor: mobileColors.warning,
      backgroundColor: mobileColors.surfaceSoft,
    },
    settingsEvidenceValue: {
      marginTop: 4,
      color: mobileColors.text,
      fontSize: 14,
      fontWeight: "900",
    },
    settingsFootnote: {
      color: mobileColors.mutedSoft,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: "700",
    },
    settingsHeroBadge: {
      maxWidth: 128,
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.white,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    settingsHeroBadgeText: {
      color: mobileColors.accentStrong,
      fontSize: 11,
      fontWeight: "900",
    },
    settingsHeroCard: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.surfaceSoft,
      padding: 12,
    },
    settingsHeroMeta: {
      color: mobileColors.muted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "700",
    },
    settingsHeroText: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    settingsHeroTitle: {
      color: mobileColors.text,
      fontSize: 17,
      fontWeight: "900",
    },
    settingsLocaleControl: {
      gap: 8,
      minWidth: 0,
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.white,
      padding: 8,
    },
    settingsLocaleDescription: {
      color: mobileColors.muted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: "700",
    },
    settingsLocaleOption: {
      flex: 1,
      minHeight: mobileSizing.minTouchTarget,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.surfaceSoft,
      paddingHorizontal: 9,
      paddingVertical: 8,
    },
    settingsLocaleOptionLabel: {
      minWidth: 0,
      color: mobileColors.muted,
      fontSize: 12,
      fontWeight: "800",
    },
    settingsLocaleOptionLabelSelected: {
      color: mobileColors.text,
      fontWeight: "900",
    },
    settingsLocaleOptionSelected: {
      borderColor: mobileColors.border,
      backgroundColor: mobileColors.primarySoft,
    },
    settingsLocaleOptions: {
      flexDirection: "row",
      gap: 8,
      minWidth: 0,
    },
    settingsLocaleShortLabel: {
      color: mobileColors.muted,
      fontSize: 11,
      fontWeight: "900",
    },
    settingsLocaleShortLabelSelected: {
      color: mobileColors.accentStrong,
    },
    settingsPermissionActionButton: {
      minHeight: 30,
      maxWidth: 104,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.primarySoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    settingsPermissionActionButtonDisabled: {
      opacity: 0.52,
      backgroundColor: mobileColors.surfaceSoft,
    },
    settingsPermissionActionButtonText: {
      color: mobileColors.accentStrong,
      fontSize: 10,
      fontWeight: "900",
    },
    settingsPermissionActionControls: {
      width: 104,
      alignItems: "flex-end",
      gap: 6,
    },
    settingsPermissionActionIcon: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.primarySoft,
    },
    settingsPermissionActionIconDanger: {
      backgroundColor: mobileColors.dangerSoft,
    },
    settingsPermissionActionIconSuccess: {
      backgroundColor: mobileColors.surfaceSoft,
    },
    settingsPermissionActionIconWarning: {
      backgroundColor: mobileColors.surfaceSoft,
    },
    settingsPermissionActionList: {
      gap: 8,
      minWidth: 0,
    },
    settingsPermissionActionRow: {
      minHeight: 64,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.white,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    settingsPermissionActionText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    settingsPermissionAssetCard: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.surfaceSoft,
      padding: 10,
    },
    settingsPermissionAssetText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    settingsSection: {
      gap: 10,
      minWidth: 0,
      borderWidth: 1,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.surfaceSoft,
      padding: 12,
    },
    settingsSectionActions: {
      minWidth: 0,
    },
    settingsSectionHeader: {
      gap: 4,
      minWidth: 0,
    },
    settingsSessionActionGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      minWidth: 0,
    },
    settingsSummaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      minWidth: 0,
    },
    statusCardWarning: {
      borderColor: mobileColors.warning,
      backgroundColor: mobileColors.surfaceSoft,
    },
    statusIconWarning: {
      backgroundColor: mobileColors.warning,
    },
    storeReadyCard: {
      borderColor: mobileColors.success,
      backgroundColor: mobileColors.surfaceSoft,
    },
  } satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;

  return { ...createSharedStyles(theme), ...settingsScreenStyles };
};

export function useSettingsScreenStyles() {
  return useThemedStyles(createSettingsScreenStyles);
}
