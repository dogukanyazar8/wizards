import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { AccessibilityInfo } from "react-native";

import { shouldPerformMobileHaptic } from "../../haptics/mobile-haptics-contract";
import {
  expoMobileHaptics,
  mobileHapticsPreferenceRepository,
} from "../../haptics/expo-mobile-haptics";

interface MobileHapticsRuntime {
  readonly enabled: boolean;
  impact(): void;
  notification(tone: "error" | "success" | "warning"): void;
  selection(): void;
  setEnabled(enabled: boolean): void;
}

const noop = () => undefined;
const MobileHapticsContext = createContext<MobileHapticsRuntime>({
  enabled: true,
  impact: noop,
  notification: noop,
  selection: noop,
  setEnabled: noop,
});

export function MobileHapticsProvider({ children }: PropsWithChildren) {
  const [enabled, setEnabledState] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void mobileHapticsPreferenceRepository
      .load()
      .then((stored) => active && setEnabledState(stored));
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => active && setReduceMotion(value),
    );
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const canPerform = shouldPerformMobileHaptic({ preferenceEnabled: enabled, reduceMotion });
  const perform = useCallback(
    (effect: () => Promise<void>) => {
      if (canPerform) {
        void effect().catch(() => undefined);
      }
    },
    [canPerform],
  );
  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    void mobileHapticsPreferenceRepository.save(next).catch(() => undefined);
  }, []);
  const value = useMemo<MobileHapticsRuntime>(
    () => ({
      enabled,
      impact: () => perform(expoMobileHaptics.impact),
      notification: (tone) => perform(() => expoMobileHaptics.notification(tone)),
      selection: () => perform(expoMobileHaptics.selection),
      setEnabled,
    }),
    [enabled, perform, setEnabled],
  );

  return <MobileHapticsContext.Provider value={value}>{children}</MobileHapticsContext.Provider>;
}

export function useMobileHaptics(): MobileHapticsRuntime {
  return useContext(MobileHapticsContext);
}
