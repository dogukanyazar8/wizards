import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import type { MobileTheme } from "../../design/themes";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import { planMobilePrivacyShieldTransition } from "../../security/mobile-privacy-shield";
import { useThemedStyles } from "../providers/mobile-theme-provider";

const createStyles = (theme: MobileTheme) => ({
  shield: {
    backgroundColor: theme.surface.base,
    bottom: 0,
    elevation: 10_000,
    left: 0,
    position: "absolute" as const,
    right: 0,
    top: 0,
    zIndex: 10_000,
  },
});

/**
 * Opaque cover over the whole app for every AppState the OS can capture.
 *
 * Covering is immediate and unanimated — the app-switcher snapshot follows the
 * background event within a frame or two, so a fade-in would leak content.
 *
 * Uncovering runs on the UI thread. The shield is the last frame drawn before
 * the surface freezes, so it is exactly what the OS restores on resume: while
 * it is still opaque the user is looking at a blank app. Removing it through a
 * React render would put it behind every other AppState listener's work in the
 * same tick (query refocus, realtime visibility, locale, NetInfo permission
 * refresh) and behind the render those trigger. Driving opacity from a shared
 * value instead uncovers on the first frame after the `active` event, no matter
 * what React is doing; React only runs at the end of the fade, to unmount a
 * view that is already invisible.
 */
export function MobilePrivacyShield() {
  const styles = useThemedStyles(createStyles);
  const reduceMotion = useReducedMotion();
  const [covered, setCovered] = useState(
    () => planMobilePrivacyShieldTransition(AppState.currentState).covered,
  );
  /** The requested state, which during the fade is ahead of `covered`. */
  const coveredRef = useRef(covered);
  const opacity = useSharedValue(covered ? 1 : 0);

  const settleUncovered = useCallback(() => {
    // A background flip that lands mid-fade re-covers, and that request wins
    // over the unmount this fade was started for.
    if (!coveredRef.current) {
      setCovered(false);
    }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status: AppStateStatus) => {
      const transition = planMobilePrivacyShieldTransition(status);
      if (transition.covered === coveredRef.current) {
        return;
      }

      coveredRef.current = transition.covered;
      cancelAnimation(opacity);

      if (transition.covered) {
        opacity.value = 1;
        setCovered(true);
        return;
      }

      if (reduceMotion) {
        opacity.value = 0;
        settleUncovered();
        return;
      }

      opacity.value = withTiming(
        0,
        { duration: transition.durationMs, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) {
            runOnJS(settleUncovered)();
          }
        },
      );
    });

    return () => subscription.remove();
  }, [opacity, reduceMotion, settleUncovered]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!covered) {
    return null;
  }

  return (
    <Animated.View
      accessibilityLabel={copy.privacyShieldAccessibilityLabel}
      accessible
      importantForAccessibility="yes"
      pointerEvents="auto"
      style={[styles.shield, animatedStyle]}
      testID="mobile-privacy-shield"
    />
  );
}
