import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, Pressable, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "../providers/mobile-theme-provider";
import type { MobileWorkspaceLayout } from "../providers/mobile-workspace-layout-provider";
import { useHomeScreenStyles } from "./home-screen.styles";

/** Press depth: deep enough to feel like a button, short of a bounce. */
const ADD_PRESS_SCALE = 0.88;
const ADD_ICON_PRESS_SCALE = 1.1;
/** One outward wave every 2.2s while the rail has nothing else to tap. */
const ADD_PULSE_DURATION_MS = 2_200;
/** 44px tile * 1.34 stays inside the 66px rail, so Android never clips the wave. */
const ADD_PULSE_MAX_SCALE = 1.34;

/**
 * Shared press motion for the two "create" entries (1a rail (+) and 1b floating (+)).
 *
 * Only transform and opacity are animated, so every frame runs on the native driver: both
 * controls sit next to a scrolling list and may not cross the bridge per frame. That is also
 * why a pressed *fill* is a stacked gradient layer rather than an animated `backgroundColor`,
 * which the native driver cannot take.
 */
function useAddActionPress() {
  const press = useRef(new Animated.Value(0)).current;

  const animatePress = useCallback(
    (toValue: number) => {
      Animated.spring(press, {
        friction: 7,
        tension: 260,
        toValue,
        useNativeDriver: true,
      }).start();
    },
    [press],
  );

  return {
    handlePressIn: useCallback(() => animatePress(1), [animatePress]),
    handlePressOut: useCallback(() => animatePress(0), [animatePress]),
    iconScale: press.interpolate({
      inputRange: [0, 1],
      outputRange: [1, ADD_ICON_PRESS_SCALE],
    }),
    press,
    tileScale: press.interpolate({
      inputRange: [0, 1],
      outputRange: [1, ADD_PRESS_SCALE],
    }),
  };
}

export interface MobileServerRailAddButtonProps {
  readonly accessibilityLabel: string;
  /** Set while the member has no servers: the (+) is then the only way forward. */
  readonly highlighted?: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
}

/**
 * 1a rail create/join entry.
 *
 * The handoff drew a flat dashed square, which read as a disabled placeholder next to the
 * server avatars. The dashed outline stays (it is the design system's "create" marker, shared
 * with the 1c new-server row) but the tile now carries the accent tint and a 2px brand-accent
 * outline, presses down into the brand gradient, and pulses while the rail is empty.
 */
export function MobileServerRailAddButton({
  accessibilityLabel,
  highlighted = false,
  onPress,
  testID,
}: MobileServerRailAddButtonProps) {
  const theme = useTheme();
  const styles = useHomeScreenStyles();
  const { handlePressIn, handlePressOut, iconScale, press, tileScale } = useAddActionPress();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!highlighted) {
      pulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(pulse, {
        duration: ADD_PULSE_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    loop.start();

    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [highlighted, pulse]);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: false }}
      hitSlop={8}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.mobileServerRailAddSlot}
      testID={testID}
    >
      {highlighted ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.mobileServerRailAddPulse,
            {
              opacity: pulse.interpolate({
                inputRange: [0, 0.18, 1],
                outputRange: [0, 0.34, 0],
              }),
              transform: [
                {
                  scale: pulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, ADD_PULSE_MAX_SCALE],
                  }),
                },
              ],
            },
          ]}
          {...(testID ? { testID: `${testID}-pulse` } : {})}
        />
      ) : null}
      <Animated.View
        style={[styles.mobileServerRailAddButton, { transform: [{ scale: tileScale }] }]}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.mobileServerRailAddFill, { opacity: press }]}
        >
          <LinearGradient
            colors={theme.gradients.primaryAction}
            style={styles.mobileServerRailAddFillGradient}
            {...(testID ? { testID: `${testID}-fill` } : {})}
          />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.mobileServerRailAddIcon,
            {
              opacity: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              transform: [{ scale: iconScale }],
            },
          ]}
        >
          <Ionicons color={theme.accent.strong} name="add" size={22} />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.mobileServerRailAddIcon,
            { opacity: press, transform: [{ scale: iconScale }] },
          ]}
        >
          <Ionicons color={theme.text.onPrimary} name="add" size={22} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export interface MobileWorkspaceCreateFabProps {
  readonly accessibilityLabel: string;
  /** 6a/6b: "+ Kanal" — the pill is labelled, never a bare (+). */
  readonly label: string;
  readonly layout?: MobileWorkspaceLayout;
  readonly onPress: () => void;
  readonly testID?: string;
}

/**
 * 6a/6b "+ Kanal".
 *
 * The only way into the create menu now that the header (+) and the per-category
 * (+) are gone, which is why it carries a label instead of a bare glyph. Both
 * layouts render it; only its geometry differs (`fab` vs `fabCompact`). The
 * brand gradient fill and the shared press spring stay from the 1b floating (+).
 */
export function MobileWorkspaceCreateFab({
  accessibilityLabel,
  label,
  layout = "compact",
  onPress,
  testID,
}: MobileWorkspaceCreateFabProps) {
  const theme = useTheme();
  const styles = useHomeScreenStyles();
  const { handlePressIn, handlePressOut, iconScale, tileScale } = useAddActionPress();
  const isCompact = layout === "compact";
  const iconSize = isCompact ? theme.workspace.fabCompact.icon : theme.workspace.fab.icon;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={isCompact ? styles.mobileWorkspaceFabAnchorCompact : styles.mobileWorkspaceFabAnchor}
      testID={testID}
    >
      <Animated.View
        style={[
          styles.mobileWorkspaceFab,
          isCompact && styles.mobileWorkspaceFabCompact,
          { transform: [{ scale: tileScale }] },
        ]}
      >
        <LinearGradient
          colors={theme.gradients.primaryAction}
          pointerEvents="none"
          style={[styles.mobileWorkspaceFabFill, isCompact && styles.mobileWorkspaceFabFillCompact]}
          {...(testID ? { testID: `${testID}-fill` } : {})}
        />
        <Animated.View pointerEvents="none" style={{ transform: [{ scale: iconScale }] }}>
          <Ionicons color={theme.text.onPrimary} name="add" size={iconSize} />
        </Animated.View>
        <Text
          style={[
            styles.mobileWorkspaceFabLabel,
            isCompact && styles.mobileWorkspaceFabLabelCompact,
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
