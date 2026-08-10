import type { TextStyle, ViewStyle } from "react-native";

import { mobileAboutMetrics } from "../../../design/tokens";
import type { MobileTheme } from "../../../design/themes";
import { useThemedStyles } from "../../providers/mobile-theme-provider";

/**
 * Shared shapes for the thirteen "Hakkında" surfaces (handoff §1.4, §2, §3).
 *
 * The handoff writes tracking in `em`; React Native's `letterSpacing` is in
 * points, so every value here is the em figure multiplied by its own font size
 * (10.5 × .1 = 1.05, 9 × .05 = .45, 9.5 × .08 = .76).
 */
export const createMobileAboutPrimitiveStyles = (theme: MobileTheme) =>
  ({
    // §2 header: 8px 16px 4px, gap 12, a 36px button on either side.
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      paddingBottom: 4,
      paddingHorizontal: mobileAboutMetrics.cardMargin,
      paddingTop: 8,
    },
    headerButton: {
      alignItems: "center",
      backgroundColor: theme.about.card,
      borderColor: theme.about.cardBorder,
      borderRadius: mobileAboutMetrics.headerButtonRadius,
      borderWidth: 1,
      height: mobileAboutMetrics.headerButton,
      justifyContent: "center",
      width: mobileAboutMetrics.headerButton,
    },
    headerTitle: {
      color: theme.about.text,
      flex: 1,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 21,
      minWidth: 0,
    },
    headerActionLabel: {
      color: theme.about.accent,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12,
    },
    // §3.5 1c: a labelled header action is a pill, not a square.
    headerActionLabelled: {
      alignItems: "center",
      backgroundColor: theme.about.card,
      borderColor: theme.about.cardBorder,
      borderRadius: mobileAboutMetrics.headerButtonRadius,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      height: mobileAboutMetrics.headerButton,
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    pressed: { opacity: 0.82 },

    // §3.2 1b sticky header: a white block with its own rule, above the scroll.
    stickyHeader: {
      backgroundColor: theme.about.card,
      borderBottomColor: theme.about.headerDivider,
      borderBottomWidth: 1,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
      zIndex: 2,
    },
    stickyHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      paddingBottom: 12,
      paddingHorizontal: mobileAboutMetrics.cardMargin,
      paddingTop: 6,
    },
    stickyHeaderButton: {
      alignItems: "center",
      backgroundColor: theme.about.control,
      borderRadius: mobileAboutMetrics.stickyHeaderButtonRadius,
      height: mobileAboutMetrics.stickyHeaderButton,
      justifyContent: "center",
      width: mobileAboutMetrics.stickyHeaderButton,
    },
    stickyHeaderTitle: {
      color: theme.about.text,
      flex: 1,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 15.5,
      minWidth: 0,
    },
    stickyHeaderTrailing: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11.5,
    },

    // §2 group label: 10.5/700, uppercase, sitting 4px above its card.
    groupLabel: {
      color: theme.about.groupLabel,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 10.5,
      letterSpacing: 1.05,
      textTransform: "uppercase",
    },
    groupLabelBlock: { paddingBottom: 8, paddingHorizontal: 20, paddingTop: 16 },

    // §1.4: r24 card, 16px outside, 16px inside.
    card: {
      backgroundColor: theme.about.card,
      borderColor: theme.about.cardBorder,
      borderRadius: mobileAboutMetrics.cardRadius,
      borderWidth: 1,
      marginHorizontal: mobileAboutMetrics.cardMargin,
    },

    // §2 list row. Single-line rows pad 13px, rows with a subtitle 11px, and
    // both clear the 44px touch target.
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      minHeight: mobileAboutMetrics.minRowHeight,
      paddingHorizontal: mobileAboutMetrics.cardPadding,
      paddingVertical: 13,
    },
    rowWithSubtitle: { paddingVertical: 11 },
    /** §7.8: an in-card hairline runs the full width via a −16px margin. */
    rowDivider: { borderTopColor: theme.about.hairline, borderTopWidth: 1 },
    rowText: { flex: 1, gap: 2, minWidth: 0 },
    rowTitle: {
      color: theme.about.text,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 14,
    },
    rowSubtitle: {
      color: theme.about.textTertiary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 11,
    },
    rowValue: {
      color: theme.about.textSecondary,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12.5,
      minWidth: 0,
    },

    // §3.3: the 1c type chip is a fixed 62px so four rows share one text column.
    typePill: {
      alignItems: "center",
      borderRadius: mobileAboutMetrics.chipRadiusSmall,
      height: 20,
      justifyContent: "center",
      paddingHorizontal: 6,
      paddingVertical: 3,
    },
    typePillLabel: {
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 9,
      letterSpacing: 0.45,
    },
    typePillNew: { backgroundColor: theme.about.accentChipSurface },
    typePillNewLabel: { color: theme.about.accent },
    typePillImproved: { backgroundColor: theme.about.successChipSurface },
    typePillImprovedLabel: { color: theme.about.successText },
    typePillFixed: { backgroundColor: theme.about.warningChipSurface },
    typePillFixedLabel: { color: theme.about.warningText },

    // §7.25: 2b and 2e share one field.
    searchField: {
      alignItems: "center",
      backgroundColor: theme.about.card,
      borderColor: theme.about.cardBorder,
      borderRadius: mobileAboutMetrics.searchRadius,
      borderWidth: 1,
      flexDirection: "row",
      gap: 9,
      marginHorizontal: mobileAboutMetrics.cardMargin,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    searchInput: {
      color: theme.about.text,
      flex: 1,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 13.5,
      minWidth: 0,
      // Android's TextInput reserves vertical padding of its own, which would
      // push the field past the handoff's 11px.
      paddingVertical: 0,
    },
    searchClear: {
      alignItems: "center",
      justifyContent: "center",
    },

    // §3.8/§7.27: one filled action per screen, pinned 26px above the edge.
    footerButton: {
      alignItems: "center",
      backgroundColor: theme.about.accent,
      borderRadius: mobileAboutMetrics.footerButtonRadius,
      minHeight: 48,
      justifyContent: "center",
      paddingVertical: 14,
      shadowColor: theme.about.accent,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: 0.24,
      shadowRadius: 24,
    },
    footerButtonPinned: {
      bottom: mobileAboutMetrics.footerButtonBottom,
      elevation: 6,
      left: mobileAboutMetrics.cardMargin,
      position: "absolute",
      right: mobileAboutMetrics.cardMargin,
    },
    footerButtonFlow: {
      marginBottom: mobileAboutMetrics.footerButtonBottom,
      marginHorizontal: mobileAboutMetrics.cardMargin,
      marginTop: 18,
      position: "relative",
    },
    footerButtonDisabled: { opacity: 0.45 },
    footerButtonLabel: {
      color: theme.about.updateOnGradient,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 14,
    },

    // §3.9/§3.13: the consent sheets sit in the device corner, so the bottom
    // radius is the phone's, not the sheet's.
    sheet: {
      backgroundColor: theme.about.card,
      borderBottomLeftRadius: mobileAboutMetrics.sheetBottomRadius,
      borderBottomRightRadius: mobileAboutMetrics.sheetBottomRadius,
      borderTopLeftRadius: mobileAboutMetrics.sheetTopRadius,
      borderTopRightRadius: mobileAboutMetrics.sheetTopRadius,
      elevation: 12,
      paddingBottom: 30,
      paddingHorizontal: 20,
      paddingTop: 10,
      shadowColor: theme.about.sheetShadow,
      shadowOffset: { height: -14, width: 0 },
      shadowOpacity: 0.18,
      shadowRadius: 40,
    },
    sheetGrabber: {
      alignSelf: "center",
      backgroundColor: theme.about.grabber,
      borderRadius: 2,
      height: 4,
      marginBottom: 20,
      width: 38,
    },

    brandLogo: { alignItems: "center", justifyContent: "center" },
  }) satisfies Record<string, TextStyle | ViewStyle>;

export const useMobileAboutPrimitiveStyles = () =>
  useThemedStyles(createMobileAboutPrimitiveStyles);
