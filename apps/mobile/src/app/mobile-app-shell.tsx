import type { ReactNode } from "react";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MobileTheme } from "../design/themes";
import { resolveMobileBottomKeyboardSpacing } from "./mobile-bottom-system-inset";
import {
  MobileChatKeyboardScopeProvider,
  useMobileChatKeyboardOwnership,
} from "./mobile-chat-keyboard-region";
import { useThemedStyles } from "./providers/mobile-theme-provider";

interface MobileAppShellProps {
  authStatus: "checking" | "error" | "signed-in" | "signed-out";
  children: ReactNode;
}

export function MobileAppShell({ authStatus, children }: MobileAppShellProps) {
  return (
    <MobileChatKeyboardScopeProvider>
      <MobileAppShellSurface authStatus={authStatus}>{children}</MobileAppShellSurface>
    </MobileChatKeyboardScopeProvider>
  );
}

/**
 * The shell owns the top edge for every signed-in screen. A full-bleed header
 * (11c banner) negates exactly this value to reach back under the status bar,
 * so the formula lives here instead of being re-derived per screen.
 */
export function getMobileShellTopInset(safeAreaTop: number): number {
  return Math.max(safeAreaTop - 10, 12);
}

function MobileAppShellSurface({ authStatus, children }: MobileAppShellProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createMobileAppShellStyles);
  const keyboard = useReanimatedKeyboardAnimation();
  const topInset = getMobileShellTopInset(insets.top);
  const isSignedIn = authStatus === "signed-in";
  const contentContainerStyle = isSignedIn ? styles.contentSignedIn : styles.contentUnauthenticated;
  // The shell is the single owner of the bottom edge: signed-in screens clear the
  // Android navigation bar here instead of each screen re-deriving the inset, and
  // top-anchored screens — auth included — shrink by the tracked keyboard height
  // so a focused form field is never covered. Chat screens opt out through
  // MobileChatKeyboardRegion and ride the IME with a transform instead, because
  // animating this padding re-runs Yoga layout for the whole tree every frame.
  const systemBottomInset = isSignedIn ? insets.bottom : 0;
  const isKeyboardOwnedByChat = useMobileChatKeyboardOwnership();
  const bottomInsetStyle = useAnimatedStyle(
    () => ({
      paddingBottom: resolveMobileBottomKeyboardSpacing({
        keyboardHeight: isKeyboardOwnedByChat ? 0 : -keyboard.height.value,
        minimumSpacing: 0,
        systemInset: systemBottomInset,
      }),
    }),
    [isKeyboardOwnedByChat, systemBottomInset],
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
