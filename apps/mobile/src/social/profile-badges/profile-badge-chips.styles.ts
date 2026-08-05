import type { TextStyle, ViewStyle } from "react-native";

import type { MobileTheme } from "../../design/themes";

/**
 * Chip geometry from the handoff: 1a:330-332 (card) and 1c:491-493 (page) draw
 * the identical 28×28 r10 box with a 14px glyph, so the three numbers live here
 * once instead of in the card styles and the page `METRICS` block.
 */
export const PROFILE_BADGE_CHIP_SIZE = 28;
export const PROFILE_BADGE_CHIP_RADIUS = 10;
export const PROFILE_BADGE_GLYPH_SIZE = 14;
/** Both mocks leave 6px between chips. */
export const PROFILE_BADGE_CHIP_GAP = 6;
/** Tier 3 marker; a dot rather than a numeral, per 04 §3. */
export const PROFILE_BADGE_TIER_DOT_SIZE = 6;
/**
 * The chip stays 28px, so a touchable chip grows its target with hit slop:
 * (44 - 28) / 2 on each edge reaches the platform minimum.
 */
export const PROFILE_BADGE_HIT_SLOP = 8;

export const createProfileBadgeChipStyles = (theme: MobileTheme) =>
  ({
    /**
     * The row keeps its height whether or not it has chips: the badge read is a
     * separate request from the profile read, and a row that collapses while it
     * is in flight moves everything under it when the badges land.
     */
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: PROFILE_BADGE_CHIP_GAP,
      height: PROFILE_BADGE_CHIP_SIZE,
    } satisfies ViewStyle,
    chip: {
      alignItems: "center",
      borderRadius: PROFILE_BADGE_CHIP_RADIUS,
      borderWidth: 1,
      height: PROFILE_BADGE_CHIP_SIZE,
      justifyContent: "center",
      width: PROFILE_BADGE_CHIP_SIZE,
    } satisfies ViewStyle,
    /** Tier 2 and 3 thicken the border and take the tint's icon tone for it. */
    chipTiered: { borderWidth: 1.5 } satisfies ViewStyle,
    tierDot: {
      borderRadius: PROFILE_BADGE_TIER_DOT_SIZE / 2,
      height: PROFILE_BADGE_TIER_DOT_SIZE,
      position: "absolute",
      right: -1,
      top: -1,
      width: PROFILE_BADGE_TIER_DOT_SIZE,
    } satisfies ViewStyle,
    overflowLabel: {
      color: theme.profileBadge.neutral.icon,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 11,
      includeFontPadding: false,
      lineHeight: 14,
    } satisfies TextStyle,
  }) as const;
