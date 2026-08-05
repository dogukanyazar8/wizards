import type { TextStyle, ViewStyle } from "react-native";

import type { MobileTheme } from "../../design/themes";

/**
 * 06 §2 hands this sheet the 2b/2c geometry: r28 top corners and a 44×5 handle,
 * which is why it passes `BottomSheet` a presentation instead of restyling the
 * primitive and dragging every other sheet in the app along with it.
 */
const SHEET_TOP_RADIUS = 28;
const HANDLE_WIDTH = 44;
const HANDLE_HEIGHT = 5;

/** Hero glyph box, 06 §1: 56×56 at r18 with a 28px glyph. */
export const PROFILE_BADGE_DETAIL_TILE_SIZE = 56;
export const PROFILE_BADGE_DETAIL_TILE_RADIUS = 18;
export const PROFILE_BADGE_DETAIL_GLYPH_SIZE = 28;
/** Grid cell chip in the "all badges" view — the row chip's 28px, unchanged. */
export const PROFILE_BADGE_DETAIL_CELL_GLYPH_SIZE = 14;
export const PROFILE_BADGE_DETAIL_CELL_CHIP_SIZE = 28;
export const PROFILE_BADGE_DETAIL_PROGRESS_HEIGHT = 6;
/** Locked rows and locked details keep the neutral tint at 40% (06 §1, 07 §1). */
export const PROFILE_BADGE_LOCKED_OPACITY = 0.4;

export const createProfileBadgeDetailStyles = (theme: MobileTheme) =>
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
    content: { paddingHorizontal: 0 } satisfies ViewStyle,

    root: { gap: 10, paddingHorizontal: 20 } satisfies ViewStyle,
    /**
     * Back sits above the content rather than beside the title: the sheet body
     * is swapped in place, so the control has to stay put while everything
     * under it changes.
     */
    backRow: { flexDirection: "row" } satisfies ViewStyle,
    backAction: {
      alignItems: "center",
      backgroundColor: theme.surface.soft,
      borderRadius: theme.radii.pill,
      height: 32,
      justifyContent: "center",
      width: 32,
    } satisfies ViewStyle,
    backActionPressed: { opacity: theme.layout.opacity.pressed } satisfies ViewStyle,

    detail: { alignItems: "center", gap: 8 } satisfies ViewStyle,
    tile: {
      alignItems: "center",
      borderRadius: PROFILE_BADGE_DETAIL_TILE_RADIUS,
      borderWidth: 1,
      height: PROFILE_BADGE_DETAIL_TILE_SIZE,
      justifyContent: "center",
      width: PROFILE_BADGE_DETAIL_TILE_SIZE,
    } satisfies ViewStyle,
    /** 06 §1: a badge you have not earned yet sits at 40%. */
    tileLocked: { opacity: PROFILE_BADGE_LOCKED_OPACITY } satisfies ViewStyle,
    name: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 19,
      textAlign: "center",
    } satisfies TextStyle,
    tierLabel: {
      color: theme.profileSheet.selectedLabel,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12.5,
      textAlign: "center",
    } satisfies TextStyle,
    description: {
      color: theme.text.secondary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 13.5,
      lineHeight: 13.5 * 1.5,
      textAlign: "center",
    } satisfies TextStyle,
    meta: {
      color: theme.profileSheet.hint,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11.5,
      textAlign: "center",
    } satisfies TextStyle,

    /** Own profile only: a peer never sees a counter (00 §4). */
    progressBlock: { alignSelf: "stretch", gap: 6, marginTop: 6 } satisfies ViewStyle,
    progressTrack: {
      borderRadius: PROFILE_BADGE_DETAIL_PROGRESS_HEIGHT / 2,
      height: PROFILE_BADGE_DETAIL_PROGRESS_HEIGHT,
      overflow: "hidden",
      width: "100%",
    } satisfies ViewStyle,
    progressFill: {
      borderRadius: PROFILE_BADGE_DETAIL_PROGRESS_HEIGHT / 2,
      height: "100%",
    } satisfies ViewStyle,
    progressLabel: {
      color: theme.text.secondary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12,
      textAlign: "center",
    } satisfies TextStyle,

    listTitle: {
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 19,
      paddingBottom: 4,
    } satisfies TextStyle,
    /** Two columns, 06 §2. Each cell is a chip plus the badge's catalog name. */
    grid: { flexDirection: "row", flexWrap: "wrap" } satisfies ViewStyle,
    gridCell: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      minHeight: theme.sizing.minTouchTarget,
      paddingRight: 8,
      paddingVertical: 6,
      width: "50%",
    } satisfies ViewStyle,
    gridCellPressed: { opacity: theme.layout.opacity.pressed } satisfies ViewStyle,
    gridChip: {
      alignItems: "center",
      borderRadius: 10,
      borderWidth: 1,
      height: PROFILE_BADGE_DETAIL_CELL_CHIP_SIZE,
      justifyContent: "center",
      width: PROFILE_BADGE_DETAIL_CELL_CHIP_SIZE,
    } satisfies ViewStyle,
    gridLabel: {
      color: theme.text.primary,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 12.5,
    } satisfies TextStyle,
  }) as const;
