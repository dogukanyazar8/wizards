import { useContext } from "react";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { useAnimatedStyle } from "react-native-reanimated";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import {
  resolveMobileBottomSystemSpacing,
  resolveMobileBottomSystemTopUp,
} from "./mobile-bottom-system-inset";

/** Applies the shared Android system-bar policy to one interactive bottom surface. */
export function useMobileBottomSystemSpacing(minimumSpacing: number): number {
  return resolveMobileBottomSystemSpacing(
    useContext(SafeAreaInsetsContext)?.bottom ?? 0,
    minimumSpacing,
  );
}

/**
 * Animated padding for a surface that keeps its own design spacing and only has to
 * grow past a taller three-button navigation bar. Gesture navigation reports an
 * inset below the design spacing, so the style stays at zero there and the surface
 * renders exactly as it does today.
 */
export function useMobileBottomSystemTopUpStyle(minimumSpacing: number) {
  const systemInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const keyboard = useReanimatedKeyboardAnimation();

  return useAnimatedStyle(
    () => ({
      paddingBottom: resolveMobileBottomSystemTopUp({
        keyboardHeight: -keyboard.height.value,
        minimumSpacing,
        systemInset,
      }),
    }),
    [minimumSpacing, systemInset],
  );
}
