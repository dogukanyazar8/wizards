import type { ImageStyle, TextStyle, ViewStyle } from "react-native";

import type { MobileTheme } from "../../design/themes";
import { useThemedStyles } from "../providers/mobile-theme-provider";

const AVATAR_SIZE = 64;

export const createMobileIncomingRequestSheetStyles = (theme: MobileTheme) =>
  ({
    root: { gap: 18 },
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: 14,
    },
    avatarWrap: {
      alignItems: "center",
      height: AVATAR_SIZE,
      justifyContent: "center",
      width: AVATAR_SIZE,
    },
    halo: {
      borderRadius: AVATAR_SIZE / 2,
      height: AVATAR_SIZE,
      position: "absolute",
      width: AVATAR_SIZE,
    },
    badge: {
      alignItems: "center",
      borderColor: theme.surface.card,
      borderRadius: 14,
      borderWidth: 2,
      bottom: -2,
      height: 28,
      justifyContent: "center",
      position: "absolute",
      right: -2,
      width: 28,
    },
    headerText: { flex: 1, gap: 3, minWidth: 0 },
    title: { ...theme.typography.title, color: theme.text.primary },
    subtitle: { ...theme.typography.body, color: theme.text.secondary },
    error: { ...theme.typography.caption, color: theme.status.dangerOnBase, marginTop: 2 },
    actions: { flexDirection: "row", gap: 10 },
    action: { flex: 1 },
  }) satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;

export const useMobileIncomingRequestSheetStyles = () =>
  useThemedStyles(createMobileIncomingRequestSheetStyles);
