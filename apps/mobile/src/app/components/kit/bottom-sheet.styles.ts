import type { ViewStyle } from "react-native";
import type { MobileTheme } from "../../../design/themes";

/** Shared semantic surface for all redesign bottom sheets, including the 1g server switcher. */
export const createBottomSheetStyles = (theme: MobileTheme) =>
  ({
    root: { flex: 1, justifyContent: "flex-end" as const },
    backdrop: {
      backgroundColor: theme.surface.scrim,
      bottom: 0,
      left: 0,
      position: "absolute" as const,
      right: 0,
      top: 0,
    },
    panel: {
      backgroundColor: theme.surface.elevated,
      borderColor: theme.border.subtle,
      borderTopLeftRadius: theme.radii.card,
      borderTopRightRadius: theme.radii.card,
      borderWidth: 1,
      overflow: "hidden" as const,
      paddingBottom: theme.spacing.page,
      ...theme.elevation.bottomSheet,
    },
    handleArea: { alignItems: "center" as const, paddingBottom: 10, paddingTop: 10 },
    handle: {
      backgroundColor: theme.border.default,
      borderRadius: theme.radii.pill,
      height: 4,
      width: 42,
    },
    content: { flex: 1, paddingHorizontal: theme.spacing.page },
  }) satisfies Record<string, ViewStyle>;
