import type { ReactNode } from "react";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MobileTheme } from "../design/themes";
import { resolveMobileBottomKeyboardSpacing } from "./mobile-bottom-system-inset";
import { useThemedStyles } from "./providers/mobile-theme-provider";

interface MobileAppShellProps {
  authStatus: "checking" | "error" | "signed-in" | "signed-out";
  children: ReactNode;
}

export function MobileAppShell({ authStatus, children }: MobileAppShellProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createMobileAppShellStyles);
  const keyboard = useReanimatedKeyboardAnimation();
  const topInset = Math.max(insets.top - 10, 12);
  const isSignedIn = authStatus === "signed-in";
  const contentContainerStyle = isSignedIn ? styles.contentSignedIn : styles.contentUnauthenticated;
  // The shell is the single owner of the bottom edge: signed-in screens clear the
  // Android navigation bar here instead of each screen re-deriving the inset, and
  // every screen — auth included — shrinks by the tracked keyboard height so a
  // focused composer or form field is never covered.
  const systemBottomInset = isSignedIn ? insets.bottom : 0;
  const bottomInsetStyle = useAnimatedStyle(
    () => ({
      paddingBottom: resolveMobileBottomKeyboardSpacing({
        keyboardHeight: -keyboard.height.value,
        minimumSpacing: 0,
        systemInset: systemBottomInset,
      }),
    }),
    [systemBottomInset],
  );

  return (
    <Animated.View
      style={[styles.safeArea, isSignedIn && { paddingTop: topInset }, bottomInsetStyle]}
      testID="mobile-app-shell"
    >
      <View style={[styles.shell, isSignedIn ? styles.shellSignedIn : styles.shellUnauthenticated]}>
        <View style={[styles.contentScroll, contentContainerStyle]}>{children}</View>
      </View>
    </Animated.View>
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
    paddingHorizontal: 0,
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
