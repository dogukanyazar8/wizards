import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MobileTheme } from "../design/themes";
import { useThemedStyles } from "./providers/mobile-theme-provider";

interface MobileAppShellProps {
  authStatus: "checking" | "error" | "signed-in" | "signed-out";
  children: ReactNode;
}

export function MobileAppShell({ authStatus, children }: MobileAppShellProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createMobileAppShellStyles);
  const topInset = Math.max(insets.top, 12);
  const isSignedIn = authStatus === "signed-in";
  const contentContainerStyle = isSignedIn ? styles.contentSignedIn : styles.contentUnauthenticated;

  return (
    <View style={[styles.safeArea, isSignedIn && { paddingTop: topInset }]}>
      <View style={[styles.shell, isSignedIn ? styles.shellSignedIn : styles.shellUnauthenticated]}>
        <View style={[styles.contentScroll, contentContainerStyle]}>{children}</View>
      </View>
    </View>
  );
}

export const createMobileAppShellStyles = (theme: MobileTheme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: theme.surface.base,
  },
  shell: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: theme.spacing.page,
    paddingTop: 8,
  },
  shellSignedIn: {
    paddingHorizontal: 14,
    paddingTop: 0,
  },
  shellUnauthenticated: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  contentScroll: {
    flex: 1,
    minWidth: 0,
  },
  contentSignedIn: {
    flex: 1,
    minWidth: 0,
  },
  contentUnauthenticated: {
    flex: 1,
    minWidth: 0,
  },
});
