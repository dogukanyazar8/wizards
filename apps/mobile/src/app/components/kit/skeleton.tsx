import { useEffect } from "react";
import { View, type DimensionValue, type ViewProps } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";

export interface SkeletonProps extends Omit<ViewProps, "children"> {
  readonly borderRadius?: number;
  readonly height: number;
  readonly width?: DimensionValue;
}

const createStyles = (theme: MobileTheme) => ({
  root: { backgroundColor: theme.surface.soft, overflow: "hidden" as const },
  shimmer: {
    backgroundColor: theme.surface.overlay,
    bottom: 0,
    left: 0,
    position: "absolute" as const,
    right: 0,
    top: 0,
  },
});

export function Skeleton({
  borderRadius,
  height,
  style,
  testID,
  width = "100%",
  ...props
}: SkeletonProps) {
  const styles = useThemedStyles(createStyles);
  const reducedMotion = useReducedMotion() === true;
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 0;
      return;
    }

    progress.value = withRepeat(withTiming(1, { duration: 1_100 }), -1, true);
    return () => cancelAnimation(progress);
  }, [progress, reducedMotion]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: 0.24 + progress.value * 0.34,
  }));

  return (
    <View
      {...props}
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.root,
        { borderRadius: borderRadius ?? Math.min(height / 2, 12), height, width },
        style,
      ]}
      testID={testID}
    >
      {!reducedMotion ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[styles.shimmer, shimmerStyle]}
          testID={testID ? `${testID}-shimmer` : undefined}
        />
      ) : null}
    </View>
  );
}
