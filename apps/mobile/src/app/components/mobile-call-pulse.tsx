import { useEffect, useMemo } from "react";
import { Animated, Easing } from "react-native";
import Reanimated, {
  Easing as RingEasing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/** One outward wave every 2.6s; three overlapping waves read as a continuous ring. */
const RINGING_WAVE_DURATION_MS = 2_600;
const RINGING_WAVE_COUNT = 3;
/** The glow behind the avatar breathes so the screen never looks frozen. */
const RINGING_GLOW_DURATION_MS = 1_500;
/** Reduced motion parks every layer mid-swell instead of animating. */
const RINGING_STILL_PROGRESS = 0.5;

/**
 * Waves start at the avatar edge and stop **exactly** at the halo bound, so a ring
 * can never expand past its own box and paint over the name below it. Callers give
 * the halo a fixed `diameter` box; nothing here ever scales beyond it.
 */
export function getMobileRingingWaveScaleRange(
  avatarSize: number,
  diameter: number,
): { from: number; to: number } {
  const safeDiameter = Math.max(1, diameter);
  const from = Math.min(1, Math.max(0, avatarSize / safeDiameter));

  return { from, to: 1 };
}

function MobileRingingWave({
  borderRadius,
  color,
  delayMs,
  diameter,
  from,
  reducedMotion,
  testID,
}: {
  borderRadius: number;
  color: string;
  delayMs: number;
  diameter: number;
  from: number;
  reducedMotion: boolean;
  testID?: string;
}) {
  const progress = useSharedValue(reducedMotion ? RINGING_STILL_PROGRESS : 0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = RINGING_STILL_PROGRESS;
      return;
    }

    progress.value = 0;
    progress.value = withDelay(
      delayMs,
      withRepeat(
        withTiming(1, {
          duration: RINGING_WAVE_DURATION_MS,
          easing: RingEasing.out(RingEasing.cubic),
        }),
        -1,
        false,
      ),
    );
  }, [delayMs, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.14, 1], [0, 0.45, 0]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [from, 1]) }],
  }));

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        {
          borderColor: color,
          borderRadius,
          borderWidth: 1.5,
          height: diameter,
          position: "absolute",
          width: diameter,
        },
        animatedStyle,
      ]}
      {...(testID ? { testID } : {})}
    />
  );
}

/**
 * Outgoing-call halo (7a/7b): a breathing glow behind the callee avatar with three
 * thin waves rippling out to the halo bound. Render it inside a box the size of
 * `diameter` — the layout then reserves the whole effect and the card content
 * beneath stays clear of it.
 */
export function MobileRingingHalo({
  avatarRadius,
  avatarSize,
  color,
  diameter,
  glowColor,
  testID,
}: {
  /** Corner radius of the avatar; the rings keep the same squircle ratio. */
  avatarRadius: number;
  avatarSize: number;
  color: string;
  diameter: number;
  /** Soft fill that swells behind the avatar; falls back to the ring colour. */
  glowColor?: string;
  testID?: string;
}) {
  const reducedMotion = useReducedMotion() === true;
  const { from } = getMobileRingingWaveScaleRange(avatarSize, diameter);
  const radiusRatio = avatarSize > 0 ? avatarRadius / avatarSize : 0.35;
  const glowSize = Math.round(avatarSize * 1.32);
  const glow = useSharedValue(reducedMotion ? RINGING_STILL_PROGRESS : 0);
  const waves = useMemo(
    () =>
      Array.from(
        { length: RINGING_WAVE_COUNT },
        (_, index) => (RINGING_WAVE_DURATION_MS / RINGING_WAVE_COUNT) * index,
      ),
    [],
  );

  useEffect(() => {
    if (reducedMotion) {
      glow.value = RINGING_STILL_PROGRESS;
      return;
    }

    glow.value = withRepeat(
      withTiming(1, {
        duration: RINGING_GLOW_DURATION_MS,
        easing: RingEasing.inOut(RingEasing.quad),
      }),
      -1,
      true,
    );
  }, [glow, reducedMotion]);

  const animatedGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.12, 0.26]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [1, 1.08]) }],
  }));

  return (
    <>
      <Reanimated.View
        pointerEvents="none"
        style={[
          {
            backgroundColor: glowColor ?? color,
            borderRadius: Math.round(glowSize * radiusRatio),
            height: glowSize,
            position: "absolute",
            width: glowSize,
          },
          animatedGlowStyle,
        ]}
      />
      {waves.map((delayMs, index) => (
        <MobileRingingWave
          key={delayMs}
          borderRadius={Math.round(diameter * radiusRatio)}
          color={color}
          delayMs={delayMs}
          diameter={diameter}
          from={from}
          reducedMotion={reducedMotion}
          {...(index === 0 && testID ? { testID } : {})}
        />
      ))}
    </>
  );
}

/** Three dots that chase each other while a call rings. */
export function MobileRingingDots({
  color,
  size = 5,
  testID,
}: {
  color: string;
  size?: number;
  testID?: string;
}) {
  const dots = useMemo(
    () => [new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)],
    [],
  );

  useEffect(() => {
    const loops = dots.map((value) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            duration: 420,
            easing: Easing.out(Easing.quad),
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            duration: 420,
            easing: Easing.in(Easing.quad),
            toValue: 0,
            useNativeDriver: true,
          }),
          Animated.delay(360),
        ]),
      ),
    );

    const timers = loops.map((loop, index) => setTimeout(() => loop.start(), index * 200));

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      for (const loop of loops) {
        loop.stop();
      }
      for (const value of dots) {
        value.setValue(0);
      }
    };
  }, [dots]);

  return (
    <Animated.View
      style={{ alignItems: "center", flexDirection: "row", gap: 3 }}
      {...(testID ? { testID } : {})}
    >
      {dots.map((value, index) => (
        <Animated.View
          key={index}
          style={{
            backgroundColor: color,
            borderRadius: size,
            height: size,
            opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.28, 1] }),
            transform: [
              { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.25] }) },
            ],
            width: size,
          }}
        />
      ))}
    </Animated.View>
  );
}
