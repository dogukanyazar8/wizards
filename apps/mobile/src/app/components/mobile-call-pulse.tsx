import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, type ViewStyle } from "react-native";

/** One outward wave every 2.1s; three waves overlap for a continuous ring. */
const RINGING_WAVE_DURATION_MS = 2_100;
const RINGING_WAVE_COUNT = 3;
/** The callee avatar breathes with the wave so the screen never looks frozen. */
const RINGING_BREATH_DURATION_MS = 1_050;
/** Speaking rings follow the level fast enough to feel live without visible stepping. */
const SPEAKING_PULSE_DURATION_MS = 140;

export function normalizeMobileVoiceLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return 0;
  }

  return Math.min(1, Math.max(0, level));
}

/**
 * Expanding halo behind a callee avatar while a call rings (7a/7b).
 *
 * Each wave gets its own `Animated.loop` around a single timing: looping a *sequence* only
 * resets its first child, which made the rings play once and then sit still.
 */
export function MobileRingingPulse({
  color,
  fillColor,
  size,
  borderRadius,
  testID,
}: {
  borderRadius: number;
  color: string;
  /** Soft tint that swells with each wave; falls back to the ring colour. */
  fillColor?: string;
  size: number;
  testID?: string;
}) {
  const waves = useMemo(
    () => Array.from({ length: RINGING_WAVE_COUNT }, () => new Animated.Value(0)),
    [],
  );
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const loops = waves.map((value) =>
      Animated.loop(
        Animated.timing(value, {
          duration: RINGING_WAVE_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
      ),
    );

    loops.forEach((loop, index) => {
      if (index === 0) {
        loop.start();
        return;
      }

      timers.push(
        setTimeout(
          () => loop.start(),
          (RINGING_WAVE_DURATION_MS / RINGING_WAVE_COUNT) * index,
        ),
      );
    });

    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          duration: RINGING_BREATH_DURATION_MS,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          duration: RINGING_BREATH_DURATION_MS,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    breathLoop.start();

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      for (const loop of loops) {
        loop.stop();
      }
      breathLoop.stop();
      for (const value of waves) {
        value.setValue(0);
      }
      breath.setValue(0);
    };
  }, [breath, waves]);

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={{
          backgroundColor: fillColor ?? color,
          borderRadius,
          height: size,
          opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.24] }),
          position: "absolute",
          transform: [
            { scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
          ],
          width: size,
        }}
      />
      {waves.map((value, index) => (
        <Animated.View
          key={index}
          pointerEvents="none"
          style={{
            borderColor: color,
            borderRadius,
            borderWidth: 2.5,
            height: size,
            opacity: value.interpolate({
              inputRange: [0, 0.15, 1],
              outputRange: [0, 0.55, 0],
            }),
            position: "absolute",
            transform: [
              { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.9] }) },
            ],
            width: size,
          }}
          {...(index === 0 && testID ? { testID } : {})}
        />
      ))}
    </>
  );
}

/**
 * Halo that tracks how loudly the remote participant is speaking, mirroring the glow the
 * web room draws around a speaking avatar.
 */
export function MobileSpeakingPulse({
  color,
  size,
  borderRadius,
  isSpeaking,
  level,
  testID,
}: {
  borderRadius: number;
  color: string;
  isSpeaking: boolean;
  level: number;
  size: number;
  testID?: string;
}) {
  const intensity = useRef(new Animated.Value(0)).current;
  const target = isSpeaking ? normalizeMobileVoiceLevel(level) : 0;

  useEffect(() => {
    const animation = Animated.timing(intensity, {
      duration: SPEAKING_PULSE_DURATION_MS,
      easing: Easing.out(Easing.quad),
      toValue: target,
      useNativeDriver: true,
    });
    animation.start();

    return () => animation.stop();
  }, [intensity, target]);

  const style: ViewStyle = {
    borderColor: color,
    borderRadius,
    borderWidth: 3,
    height: size,
    position: "absolute",
    width: size,
  };

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          opacity: intensity.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }),
          transform: [
            { scale: intensity.interpolate({ inputRange: [0, 1], outputRange: [1.02, 1.3] }) },
          ],
        },
      ]}
      {...(testID ? { testID } : {})}
    />
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
  const dots = useMemo(() => [new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)], []);

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
