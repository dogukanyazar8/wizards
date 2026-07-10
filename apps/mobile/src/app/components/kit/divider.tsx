import { View, type ViewProps } from "react-native";
import { useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";

const createStyles = (theme: MobileTheme) => ({
  root: { backgroundColor: theme.border.subtle, height: 1, width: "100%" as const },
});

export function Divider({ role = "separator", style, ...props }: ViewProps) {
  const styles = useThemedStyles(createStyles);
  return <View {...props} role={role} style={[styles.root, style]} />;
}
