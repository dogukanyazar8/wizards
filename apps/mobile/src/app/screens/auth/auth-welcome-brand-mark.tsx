import { useEffect } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";

import { useTheme } from "../../providers/mobile-theme-provider";

interface AuthWelcomeBrandMarkProps {
  readonly testID?: string;
}

interface WaveformBar {
  readonly height: number;
  readonly rx: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

const AUTH_EQUALIZER_DURATION = 2_100;
const AUTH_EQUALIZER_PEAK_AT = 0.45;
const AUTH_EQUALIZER_DELAY = 130;
const AUTH_EQUALIZER_MIN_SCALE = 0.55;
const AUTH_EQUALIZER_MIN_OPACITY = 0.72;
const AUTH_EQUALIZER_EASING = Easing.bezier(0.45, 0, 0.2, 1);
const AUTH_EQUALIZER_RISE_DURATION = AUTH_EQUALIZER_DURATION * AUTH_EQUALIZER_PEAK_AT;
const AUTH_EQUALIZER_FALL_DURATION = AUTH_EQUALIZER_DURATION - AUTH_EQUALIZER_RISE_DURATION;

/** Canonical web/desktop Whispr geometry, scaled into the 24pt welcome SVG canvas. */
const CANONICAL_WAVEFORM_BARS: readonly WaveformBar[] = [
  { height: 8.5, rx: 1.3, width: 2.4, x: 3.6, y: 7.75 },
  { height: 12.5, rx: 1.3, width: 2.4, x: 6.8, y: 5.75 },
  { height: 17, rx: 1.3, width: 2.4, x: 10, y: 3.5 },
  { height: 12, rx: 1.3, width: 2.4, x: 13.2, y: 6 },
  { height: 9, rx: 1.3, width: 2.4, x: 16.4, y: 7.5 },
];

const AnimatedRect = Animated.createAnimatedComponent(Rect);

function AnimatedWaveformBar({
  bar,
  index,
  testID,
}: {
  readonly bar: WaveformBar;
  readonly index: number;
  readonly testID?: string;
}) {
  const opacity = useSharedValue(AUTH_EQUALIZER_MIN_OPACITY);
  const scale = useSharedValue(AUTH_EQUALIZER_MIN_SCALE);

  useEffect(() => {
    const delay = index * AUTH_EQUALIZER_DELAY;
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: AUTH_EQUALIZER_RISE_DURATION, easing: AUTH_EQUALIZER_EASING }),
          withTiming(AUTH_EQUALIZER_MIN_SCALE, {
            duration: AUTH_EQUALIZER_FALL_DURATION,
            easing: AUTH_EQUALIZER_EASING,
          }),
        ),
        -1,
        false,
      ),
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: AUTH_EQUALIZER_RISE_DURATION, easing: AUTH_EQUALIZER_EASING }),
          withTiming(AUTH_EQUALIZER_MIN_OPACITY, {
            duration: AUTH_EQUALIZER_FALL_DURATION,
            easing: AUTH_EQUALIZER_EASING,
          }),
        ),
        -1,
        false,
      ),
    );

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(scale);
    };
  }, [index, opacity, scale]);

  const animatedProps = useAnimatedProps(() => {
    const height = bar.height * scale.value;

    return {
      height,
      opacity: opacity.value,
      y: bar.y + (bar.height - height) / 2,
    };
  });

  return (
    <AnimatedRect
      {...bar}
      animatedProps={animatedProps}
      fill="#FFFFFF"
      {...(testID === undefined ? {} : { testID })}
    />
  );
}

export function AuthWelcomeBrandMark({ testID }: AuthWelcomeBrandMarkProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion() === true;
  const size = theme.layout.auth.welcomeBrandAsset;

  return (
    <Svg
      accessible={false}
      accessibilityElementsHidden
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...(testID === undefined ? {} : { testID })}
    >
      {CANONICAL_WAVEFORM_BARS.map((bar, index) =>
        reducedMotion ? (
          <Rect
            {...bar}
            fill={theme.text.onPrimary}
            key={`${bar.x}-${bar.y}`}
            {...(testID === undefined ? {} : { testID: `${testID}-static-bar-${index + 1}` })}
          />
        ) : (
          <AnimatedWaveformBar
            bar={bar}
            index={index}
            key={`${bar.x}-${bar.y}`}
            {...(testID === undefined
              ? {}
              : { testID: `${testID}-animated-bar-${index + 1}` })}
          />
        ),
      )}
    </Svg>
  );
}
