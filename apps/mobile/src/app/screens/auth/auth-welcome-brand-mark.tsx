import { useEffect } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Defs,
  FeGaussianBlur,
  FeMerge,
  FeMergeNode,
  Filter,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { mobileBrandPalette, mobilePalette } from "../../../design/palette";

interface AuthWelcomeBrandMarkProps {
  /** Rendered card edge length in device-independent pixels. */
  readonly size?: number;
  /** Rendered card corner radius in device-independent pixels. */
  readonly cornerRadius?: number;
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
const AUTH_EQUALIZER_REDUCE_MOTION = ReduceMotion.Never;
const AUTH_EQUALIZER_RISE_DURATION = AUTH_EQUALIZER_DURATION * AUTH_EQUALIZER_PEAK_AT;
const AUTH_EQUALIZER_FALL_DURATION = AUTH_EQUALIZER_DURATION - AUTH_EQUALIZER_RISE_DURATION;
const WEB_BRAND_ICON_SIZE = 52;
const WEB_BRAND_ICON_RADIUS = 13;

/** Canonical web/desktop Whispr geometry in its native 52px card canvas. */
const CANONICAL_WAVEFORM_BARS: readonly WaveformBar[] = [
  { height: 17, rx: 1.5, width: 3, x: 12.5, y: 17.5 },
  { height: 25, rx: 1.5, width: 3, x: 18.5, y: 13.5 },
  { height: 34, rx: 1.5, width: 3, x: 24.5, y: 9 },
  { height: 24, rx: 1.5, width: 3, x: 30.5, y: 14 },
  { height: 18, rx: 1.5, width: 3, x: 36.5, y: 17 },
];

const AnimatedRect = Animated.createAnimatedComponent(Rect);

function AnimatedWaveformBar({
  bar,
  filterId,
  index,
  testID,
}: {
  readonly bar: WaveformBar;
  readonly filterId: string;
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
          AUTH_EQUALIZER_REDUCE_MOTION,
          withTiming(1, {
            duration: AUTH_EQUALIZER_RISE_DURATION,
            easing: AUTH_EQUALIZER_EASING,
            reduceMotion: AUTH_EQUALIZER_REDUCE_MOTION,
          }),
          withTiming(AUTH_EQUALIZER_MIN_SCALE, {
            duration: AUTH_EQUALIZER_FALL_DURATION,
            easing: AUTH_EQUALIZER_EASING,
            reduceMotion: AUTH_EQUALIZER_REDUCE_MOTION,
          }),
        ),
        -1,
        false,
        undefined,
        AUTH_EQUALIZER_REDUCE_MOTION,
      ),
      AUTH_EQUALIZER_REDUCE_MOTION,
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          AUTH_EQUALIZER_REDUCE_MOTION,
          withTiming(1, {
            duration: AUTH_EQUALIZER_RISE_DURATION,
            easing: AUTH_EQUALIZER_EASING,
            reduceMotion: AUTH_EQUALIZER_REDUCE_MOTION,
          }),
          withTiming(AUTH_EQUALIZER_MIN_OPACITY, {
            duration: AUTH_EQUALIZER_FALL_DURATION,
            easing: AUTH_EQUALIZER_EASING,
            reduceMotion: AUTH_EQUALIZER_REDUCE_MOTION,
          }),
        ),
        -1,
        false,
        undefined,
        AUTH_EQUALIZER_REDUCE_MOTION,
      ),
      AUTH_EQUALIZER_REDUCE_MOTION,
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
      fill={mobilePalette.neutral.white}
      fillOpacity={0.95}
      filter={`url(#${filterId})`}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}

export function AuthWelcomeBrandMark({
  cornerRadius = WEB_BRAND_ICON_RADIUS,
  size = WEB_BRAND_ICON_SIZE,
  testID,
}: AuthWelcomeBrandMarkProps) {
  const surfaceGradientId = `${testID ?? "auth-welcome-brand-mark"}-surface-gradient`;
  const surfaceHighlightId = `${testID ?? "auth-welcome-brand-mark"}-surface-highlight`;
  const barGlowId = `${testID ?? "auth-welcome-brand-mark"}-bar-glow`;
  const viewBoxCornerRadius = (cornerRadius * WEB_BRAND_ICON_SIZE) / size;

  return (
    <Svg
      accessible={false}
      accessibilityElementsHidden
      height={size}
      viewBox={`0 0 ${WEB_BRAND_ICON_SIZE} ${WEB_BRAND_ICON_SIZE}`}
      width={size}
      {...(testID === undefined ? {} : { testID })}
    >
      <Defs>
        <SvgLinearGradient
          id={surfaceGradientId}
          x1="0%"
          x2="100%"
          y1="0%"
          y2="100%"
          {...(testID === undefined ? {} : { testID: `${testID}-surface-gradient` })}
        >
          <Stop
            offset="0%"
            stopColor={mobileBrandPalette.whisprWave.lavender}
            {...(testID === undefined ? {} : { testID: `${testID}-surface-gradient-stop-1` })}
          />
          <Stop
            offset="46%"
            stopColor={mobileBrandPalette.whisprWave.indigo}
            {...(testID === undefined ? {} : { testID: `${testID}-surface-gradient-stop-2` })}
          />
          <Stop
            offset="100%"
            stopColor={mobileBrandPalette.whisprWave.blue}
            {...(testID === undefined ? {} : { testID: `${testID}-surface-gradient-stop-3` })}
          />
        </SvgLinearGradient>
        <RadialGradient
          cx="30%"
          cy="18%"
          id={surfaceHighlightId}
          r="34%"
          {...(testID === undefined ? {} : { testID: `${testID}-surface-highlight` })}
        >
          <Stop offset="0%" stopColor={mobilePalette.neutral.white} stopOpacity={0.34} />
          <Stop offset="100%" stopColor={mobilePalette.neutral.white} stopOpacity={0} />
        </RadialGradient>
        <Filter
          height="180%"
          id={barGlowId}
          width="180%"
          x="-40%"
          y="-40%"
        >
          <FeGaussianBlur in="SourceGraphic" result="blur" stdDeviation={2} />
          <FeMerge>
            <FeMergeNode in="blur" />
            <FeMergeNode in="SourceGraphic" />
          </FeMerge>
        </Filter>
      </Defs>
      <Rect
        fill={`url(#${surfaceGradientId})`}
        height={WEB_BRAND_ICON_SIZE}
        rx={viewBoxCornerRadius}
        width={WEB_BRAND_ICON_SIZE}
        {...(testID === undefined ? {} : { testID: `${testID}-card` })}
      />
      <Rect
        fill={`url(#${surfaceHighlightId})`}
        height={WEB_BRAND_ICON_SIZE}
        rx={viewBoxCornerRadius}
        width={WEB_BRAND_ICON_SIZE}
      />
      {CANONICAL_WAVEFORM_BARS.map((bar, index) => (
        <AnimatedWaveformBar
          bar={bar}
          filterId={barGlowId}
          index={index}
          key={`${bar.x}-${bar.y}`}
          {...(testID === undefined ? {} : { testID: `${testID}-animated-bar-${index + 1}` })}
        />
      ))}
    </Svg>
  );
}
