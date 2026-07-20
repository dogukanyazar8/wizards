import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, type ViewStyle } from "react-native";

/** Ring cadence for an unanswered call: one expanding wave every 1.8s. */
const RINGING_PULSE_DURATION_MS = 1_800;
const RINGING_PULSE_COUNT = 3;
/** Speaking rings follow the level fast enough to feel live without visible stepping. */
const SPEAKING_PULSE_DURATION_MS = 140;

export function normalizeMobileVoiceLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return 0;
  }

  return Math.min(1, Math.max(0, level));
}

/**
 * Expanding rings behind a callee avatar while the call rings (7a/7b). Each ring starts a
 * third of a cycle apart, which reads as a continuous outward wave.
 */
export function MobileRingingPulse({
  color,
  size,
  borderRadius,
  testID,
}: {
  borderRadius: number;
  color: string;
  size: number;
  testID?: string;
}) {
  const progressValues = useMemo(
    () => Array.from({ length: RINGING_PULSE_COUNT }, () => new Animated.Value(0)),
    [],
  );

  useEffect(() => {
    const animations = progressValues.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay((RINGING_PULSE_DURATION_MS / RINGING_PULSE_COUNT) * index),
          Animated.timing(value, {
            duration: RINGING_PULSE_DURATION_MS,
            easing: Easing.out(Easing.ease),
            toValue: 1,
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    for (const animation of animations) {
      animation.start();
    }

    return () => {
      for (const animation of animations) {
        animation.stop();
      }
      for (const value of progressValues) {
        value.setValue(0);
      }
    };
  }, [progressValues]);

  return (
    <>
      {progressValues.map((value, index) => (
        <Animated.View
          key={index}
          pointerEvents="none"
          style={{
            borderColor: color,
            borderRadius,
            borderWidth: 2,
            height: size,
            opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
            position: "absolute",
            transform: [
              { scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] }) },
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
