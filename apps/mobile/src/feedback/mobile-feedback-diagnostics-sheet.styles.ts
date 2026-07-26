import type { TextStyle, ViewStyle } from "react-native";

import { useThemedStyles } from "../app/providers/mobile-theme-provider";
import type { MobileTheme } from "../design/themes";

/**
 * "Neler gönderilir?" geometry.
 *
 * Built on the 2b/2c sheet language rather than the 4a page: r28 panel, 44x5
 * handle, a 19px title at the 24px gutter, and 36px glyph tiles on 16px rows.
 * It borrowed the note sheet's styles when it first shipped, which meant it
 * inherited a text-field sheet's rhythm for what is really a two-section list.
 */
const SHEET_TOP_RADIUS = 28;
const HANDLE_WIDTH = 44;
const HANDLE_HEIGHT = 5;
const TILE = 36;
const TILE_RADIUS = 13;

const createStyles = (theme: MobileTheme) =>
  ({
    panel: {
      borderTopLeftRadius: SHEET_TOP_RADIUS,
      borderTopRightRadius: SHEET_TOP_RADIUS,
    } satisfies ViewStyle,
    handleArea: { paddingBottom: 6, paddingTop: 10 } satisfies ViewStyle,
    handle: {
      backgroundColor: theme.profileSheet.handle,
      borderRadius: 3,
      height: HANDLE_HEIGHT,
      width: HANDLE_WIDTH,
    } satisfies ViewStyle,
    /** The rows pad themselves, so the shared content padding steps aside. */
    content: { paddingHorizontal: 0 } satisfies ViewStyle,

    header: { gap: 6, paddingHorizontal: 24, paddingTop: 4 } satisfies ViewStyle,
    title: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 19,
      includeFontPadding: false,
      lineHeight: 25,
    } satisfies TextStyle,
    description: {
      color: theme.profileSheet.description,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12.5,
      includeFontPadding: false,
      lineHeight: 18,
    } satisfies TextStyle,

    sectionLabel: {
      color: theme.text.visualFaint,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 10.5,
      includeFontPadding: false,
      letterSpacing: 1.05,
      lineHeight: 14,
      paddingHorizontal: 24,
      paddingTop: 16,
    } satisfies TextStyle,

    rows: { marginHorizontal: 16, marginTop: 8 } satisfies ViewStyle,
    row: {
      alignItems: "center",
      borderRadius: theme.radii.row,
      flexDirection: "row",
      gap: 13,
      minHeight: theme.sizing.minTouchTarget,
      paddingHorizontal: 12,
      paddingVertical: 9,
    } satisfies ViewStyle,
    tile: {
      alignItems: "center",
      backgroundColor: theme.accent.soft,
      borderRadius: TILE_RADIUS,
      height: TILE,
      justifyContent: "center",
      width: TILE,
    } satisfies ViewStyle,
    /** Excluded rows are neutral, not alarming: nothing here is a warning. */
    tileExcluded: {
      backgroundColor: theme.surface.base,
      borderColor: theme.border.subtle,
      borderWidth: 1,
    } satisfies ViewStyle,
    rowText: { flex: 1, gap: 1, minWidth: 0 } satisfies ViewStyle,
    label: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 14.5,
      includeFontPadding: false,
      lineHeight: 19,
    } satisfies TextStyle,
    labelExcluded: { color: theme.text.visualSecondary } satisfies TextStyle,
    /**
     * The live value carries the weight, because it is the part the user came
     * to check: this is their phone, their build, their fault count.
     */
    value: {
      color: theme.accent.strong,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11.5,
      includeFontPadding: false,
      lineHeight: 16,
    } satisfies TextStyle,
    hint: {
      color: theme.profileSheet.description,
      fontFamily: theme.typography.fontFamily,
      fontSize: 11.5,
      includeFontPadding: false,
      lineHeight: 16,
    } satisfies TextStyle,

    divider: {
      borderTopColor: theme.profileSheet.divider,
      borderTopWidth: 1,
      marginHorizontal: 16,
      marginTop: 14,
    } satisfies ViewStyle,

    note: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 8,
      marginTop: 16,
      paddingHorizontal: 24,
    } satisfies ViewStyle,
    noteText: {
      color: theme.profileSheet.hint,
      flex: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11.5,
      includeFontPadding: false,
      lineHeight: 17,
      minWidth: 0,
    } satisfies TextStyle,

    footer: { paddingHorizontal: 20, paddingTop: 16 } satisfies ViewStyle,
    closeAction: {
      alignItems: "center",
      backgroundColor: theme.accent.action,
      borderRadius: 16,
      justifyContent: "center",
      minHeight: theme.sizing.minTouchTarget,
      paddingVertical: 13,
      ...theme.elevation.primaryAction,
    } satisfies ViewStyle,
    closeLabel: {
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 14.5,
      includeFontPadding: false,
      lineHeight: 20,
    } satisfies TextStyle,
    pressed: { opacity: theme.layout.opacity.pressed } satisfies ViewStyle,
  }) as const;

export function useMobileFeedbackDiagnosticsSheetStyles() {
  return useThemedStyles(createStyles);
}
