import type { ImageStyle, TextStyle, ViewStyle } from "react-native";

import type { MobileTheme } from "../design/themes";
import { useThemedStyles } from "../app/providers/mobile-theme-provider";

/**
 * The status block used to live inside the 2a profile editor. It now sits directly under
 * the profile banner, so it wears the hub's card chrome instead of the editor's, while the
 * controls themselves keep the 2a geometry the editor established.
 */
export const createMobileProfileStatusCardStyles = (theme: MobileTheme) =>
  ({
    card: {
      backgroundColor: theme.surface.card,
      borderColor: theme.border.subtle,
      borderRadius: 24,
      borderWidth: 1,
      gap: 12,
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    field: { gap: 7 },
    fieldHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
      minHeight: 30,
    },
    fieldLabel: {
      color: theme.text.soft,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    fieldHint: {
      color: theme.text.soft,
      fontFamily: theme.typography.fontFamily,
      fontSize: 11.5,
      lineHeight: 16,
    },
    errorText: {
      color: theme.status.danger,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12,
    },

    inputRow: {
      alignItems: "center",
      backgroundColor: theme.surface.soft,
      borderColor: theme.border.subtle,
      borderRadius: theme.radii.control,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
    },
    input: {
      color: theme.text.primary,
      flex: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 14,
      minHeight: theme.sizing.minTouchTarget,
      paddingVertical: 0,
    },
    statusEmoji: { fontSize: 15, includeFontPadding: false },
    statusEmojiButton: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: theme.sizing.minTouchTarget,
      minWidth: 26,
    },
    statusClear: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: theme.sizing.minTouchTarget,
      minWidth: 30,
    },

    // 1f status control: 10/14 padding, radius 14, 9px dot. The 44px floor stays for the
    // touch target and is invisible next to the 40px content height. Both the auto-clear
    // menu and the presence picker wear it, so the two rows read as one stack.
    controlRow: {
      alignItems: "center",
      backgroundColor: theme.surface.soft,
      borderColor: theme.border.subtle,
      borderRadius: theme.radii.control,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      minHeight: theme.sizing.minTouchTarget,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    controlLabel: {
      color: theme.text.primary,
      flex: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 13.5,
      minWidth: 0,
    },
    controlValue: {
      color: theme.text.muted,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12.5,
    },
    presenceDot: { borderRadius: 5, height: 9, width: 9 },

    // The hub has no header to hang a "Kaydet" chip on, so the message field grows its
    // own — visible only while the draft actually differs from the saved status.
    saveChip: {
      alignItems: "center",
      backgroundColor: theme.accent.action,
      borderRadius: 12,
      justifyContent: "center",
      minHeight: 30,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    saveChipDisabled: { backgroundColor: theme.interactive.disabled },
    saveChipLabel: {
      color: theme.text.onPrimary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 12,
      includeFontPadding: false,
    },
    saveChipLabelDisabled: { color: theme.text.soft },
    pressed: { opacity: 0.82 },
  }) satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;

export function useMobileProfileStatusCardStyles() {
  return useThemedStyles(createMobileProfileStatusCardStyles);
}
