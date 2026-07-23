import type { TextStyle, ViewStyle } from "react-native";

import { useThemedStyles } from "../app/providers/mobile-theme-provider";
import type { MobileTheme } from "../design/themes";

/**
 * Handoff 2b/2c geometry. The sheet panel radius, handle and horizontal rhythm
 * differ from the shared bottom-sheet defaults (r28 vs r22, 44x5 vs 42x4), so
 * both sheets hand `BottomSheet` a presentation instead of restyling the
 * primitive and dragging every other sheet in the app along with them.
 */
const SHEET_TOP_RADIUS = 28;
const HANDLE_WIDTH = 44;
const HANDLE_HEIGHT = 5;
/** 2b field ring: 3px of colour drawn outside the 14px-radius field. */
const FIELD_FOCUS_RING = 3;
const FIELD_RADIUS = 14;
const STATUS_TILE = 36;
const STATUS_TILE_RADIUS = 13;
const STATUS_GLYPH = 13;

export const createMobileProfileSheetStyles = (theme: MobileTheme) =>
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
    /** Both sheets pad their own rows, so the shared content padding steps aside. */
    content: { paddingHorizontal: 0 } satisfies ViewStyle,

    // ---- 2b note sheet ----
    noteRoot: { paddingHorizontal: 20 } satisfies ViewStyle,
    noteHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      paddingBottom: 10,
      paddingTop: 4,
    } satisfies ViewStyle,
    noteTitle: {
      color: theme.text.primary,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 16,
    } satisfies TextStyle,
    noteSaveAction: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: theme.sizing.minTouchTarget,
      minWidth: theme.sizing.minTouchTarget,
    } satisfies ViewStyle,
    noteSaveLabel: {
      color: theme.profileSheet.saveAction,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13,
    } satisfies TextStyle,
    noteSaveLabelDisabled: { color: theme.profileSheet.saveActionDisabled } satisfies TextStyle,
    /**
     * The ring is a padded parent rather than a shadow: RN shadows do not take a
     * solid colour on Android, and a padded parent keeps the field from shifting
     * when focus arrives.
     */
    noteFieldRing: {
      borderRadius: FIELD_RADIUS + FIELD_FOCUS_RING,
      padding: FIELD_FOCUS_RING,
    } satisfies ViewStyle,
    noteFieldRingFocused: {
      backgroundColor: theme.profileSheet.noteFieldFocusRing,
    } satisfies ViewStyle,
    noteField: {
      backgroundColor: theme.profileSheet.noteFieldSurface,
      borderColor: theme.profileSheet.noteFieldBorder,
      borderRadius: FIELD_RADIUS,
      borderWidth: 1.5,
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
    } satisfies ViewStyle,
    noteFieldFocused: { borderColor: theme.profileSheet.noteFieldFocusBorder } satisfies ViewStyle,
    noteInput: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 13.5,
      lineHeight: 20.25,
      minHeight: 62,
      padding: 0,
      textAlignVertical: "top",
    } satisfies TextStyle,
    noteCounter: {
      alignSelf: "flex-end",
      color: theme.profileSheet.hint,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 10.5,
    } satisfies TextStyle,
    notePrivacy: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      marginTop: 10,
    } satisfies ViewStyle,
    notePrivacyLabel: {
      color: theme.profileSheet.hint,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11.5,
    } satisfies TextStyle,
    noteError: {
      color: theme.status.dangerOnBase,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11.5,
      marginTop: 8,
    } satisfies TextStyle,

    // ---- 2c status picker ----
    statusTitle: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 19,
      paddingBottom: 12,
      paddingHorizontal: 24,
      paddingTop: 4,
    } satisfies TextStyle,
    statusOptions: { gap: 4, marginHorizontal: 16 } satisfies ViewStyle,
    statusRow: {
      alignItems: "center",
      borderColor: "transparent",
      borderRadius: theme.radii.row,
      borderWidth: 1,
      flexDirection: "row",
      gap: 13,
      minHeight: theme.sizing.minTouchTarget,
      paddingHorizontal: 12,
      paddingVertical: 11,
    } satisfies ViewStyle,
    statusRowSelected: {
      backgroundColor: theme.profileSheet.selectedSurface,
      borderColor: theme.profileSheet.selectedBorder,
    } satisfies ViewStyle,
    statusRowPressed: { opacity: theme.layout.opacity.pressed } satisfies ViewStyle,
    statusRowDisabled: { opacity: theme.layout.opacity.muted } satisfies ViewStyle,
    statusTile: {
      alignItems: "center",
      borderRadius: STATUS_TILE_RADIUS,
      height: STATUS_TILE,
      justifyContent: "center",
      width: STATUS_TILE,
    } satisfies ViewStyle,
    statusGlyphDot: {
      borderRadius: STATUS_GLYPH / 2,
      height: STATUS_GLYPH,
      width: STATUS_GLYPH,
    } satisfies ViewStyle,
    statusGlyphRing: {
      borderColor: theme.profileSheet.statusInvisibleRing,
      borderRadius: STATUS_GLYPH / 2,
      borderWidth: 2.5,
      height: STATUS_GLYPH,
      width: STATUS_GLYPH,
    } satisfies ViewStyle,
    statusText: { flex: 1, gap: 1, minWidth: 0 } satisfies ViewStyle,
    statusLabel: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 15,
    } satisfies TextStyle,
    statusLabelSelected: {
      color: theme.profileSheet.selectedLabel,
      fontFamily: theme.typography.fontFamilyBold,
    } satisfies TextStyle,
    statusDescription: {
      color: theme.profileSheet.description,
      fontFamily: theme.typography.fontFamily,
      fontSize: 11.5,
    } satisfies TextStyle,
    statusDivider: {
      borderTopColor: theme.profileSheet.divider,
      borderTopWidth: 1,
      marginHorizontal: 16,
      marginTop: 10,
      paddingTop: 10,
    } satisfies ViewStyle,
    statusError: {
      color: theme.status.dangerOnBase,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11.5,
      marginTop: 8,
      paddingHorizontal: 24,
    } satisfies TextStyle,

    // ---- custom status entry ----
    customRoot: { gap: 12, paddingHorizontal: 20 } satisfies ViewStyle,
    customRow: { alignItems: "center", flexDirection: "row", gap: 10 } satisfies ViewStyle,
    customEmojiButton: {
      alignItems: "center",
      backgroundColor: theme.profileSheet.noteFieldSurface,
      borderColor: theme.profileSheet.noteFieldBorder,
      borderRadius: FIELD_RADIUS,
      borderWidth: 1.5,
      height: theme.sizing.minTouchTarget,
      justifyContent: "center",
      width: theme.sizing.minTouchTarget,
    } satisfies ViewStyle,
    customEmojiGlyph: { fontSize: 20 } satisfies TextStyle,
    customField: {
      backgroundColor: theme.profileSheet.noteFieldSurface,
      borderColor: theme.profileSheet.noteFieldBorder,
      borderRadius: FIELD_RADIUS,
      borderWidth: 1.5,
      color: theme.text.primary,
      flex: 1,
      fontFamily: theme.typography.fontFamily,
      fontSize: 14,
      minHeight: theme.sizing.minTouchTarget,
      paddingHorizontal: 14,
      paddingVertical: 11,
    } satisfies TextStyle,
    customFieldFocused: {
      borderColor: theme.profileSheet.noteFieldFocusBorder,
    } satisfies ViewStyle,
    customDurations: { flexDirection: "row", flexWrap: "wrap", gap: 6 } satisfies ViewStyle,
    customDuration: {
      alignItems: "center",
      backgroundColor: theme.profileSheet.noteFieldSurface,
      borderColor: theme.profileSheet.noteFieldBorder,
      borderRadius: theme.radii.chip,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 34,
      paddingHorizontal: 12,
    } satisfies ViewStyle,
    customDurationSelected: {
      backgroundColor: theme.profileSheet.selectedSurface,
      borderColor: theme.profileSheet.selectedBorder,
    } satisfies ViewStyle,
    customDurationLabel: {
      color: theme.text.secondary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 12.5,
    } satisfies TextStyle,
    customDurationLabelSelected: {
      color: theme.profileSheet.selectedLabel,
      fontFamily: theme.typography.fontFamilyBold,
    } satisfies TextStyle,
    customActions: { flexDirection: "row", gap: 10 } satisfies ViewStyle,
    customAction: { flex: 1 } satisfies ViewStyle,
    customHeading: {
      color: theme.profileSheet.hint,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11,
      letterSpacing: theme.layout.typography.sectionTracking,
      textTransform: "uppercase",
    } satisfies TextStyle,
  }) as const;

export function useMobileProfileSheetStyles() {
  return useThemedStyles(createMobileProfileSheetStyles);
}
