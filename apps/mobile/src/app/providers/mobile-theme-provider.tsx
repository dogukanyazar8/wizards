import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { StyleSheet, useColorScheme } from "react-native";
import {
  getMobileTheme,
  MOBILE_THEME_PREFERENCE_KEY,
  normalizeMobileThemeMode,
  resolveMobileTheme,
  type MobileResolvedTheme,
  type MobileThemeMode,
} from "../../design/mobile-theme-runtime";
import {
  composeMobileTheme,
  MOBILE_ACCENT_PREFERENCE_KEY,
  MOBILE_DEFAULT_ACCENT_ID,
  MOBILE_DEFAULT_FONT_SCALE_STEP,
  MOBILE_DEFAULT_VOICE_APPEARANCE,
  MOBILE_FONT_SCALE_PREFERENCE_KEY,
  MOBILE_VOICE_APPEARANCE_PREFERENCE_KEY,
  normalizeMobileAccentId,
  normalizeMobileFontScaleStep,
  normalizeMobileVoiceRoomAppearance,
  resolveMobileVoiceRoomBaseTheme,
  type MobileAccentId,
  type MobileFontScaleStep,
  type MobileVoiceRoomAppearance,
} from "../../design/mobile-appearance-preferences";
import type { MobileTheme } from "../../design/themes";

interface MobileThemePreferenceRuntime {
  readonly mode: MobileThemeMode;
  readonly resolvedTheme: MobileResolvedTheme;
  setMode(mode: MobileThemeMode): void;
}

interface MobileAppearancePreferenceRuntime extends MobileThemePreferenceRuntime {
  readonly accent: MobileAccentId;
  readonly fontScaleStep: MobileFontScaleStep;
  readonly voiceRoomAppearance: MobileVoiceRoomAppearance;
  setAccent(accent: MobileAccentId): void;
  setFontScaleStep(step: MobileFontScaleStep): void;
  setVoiceRoomAppearance(appearance: MobileVoiceRoomAppearance): void;
}

const ThemeContext = createContext<MobileTheme | null>(null);
const ThemePreferenceContext = createContext<MobileAppearancePreferenceRuntime | null>(null);
const styleCache = new WeakMap<Function, WeakMap<MobileTheme, object>>();

export function MobileThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<MobileThemeMode>("system");
  const [accent, setAccentState] = useState<MobileAccentId>(MOBILE_DEFAULT_ACCENT_ID);
  const [fontScaleStep, setFontScaleStepState] = useState<MobileFontScaleStep>(
    MOBILE_DEFAULT_FONT_SCALE_STEP,
  );
  const [voiceRoomAppearance, setVoiceRoomAppearanceState] = useState<MobileVoiceRoomAppearance>(
    MOBILE_DEFAULT_VOICE_APPEARANCE,
  );
  const userSelectionVersion = useRef(0);
  const accentSelectionVersion = useRef(0);
  const fontScaleSelectionVersion = useRef(0);
  const voiceAppearanceSelectionVersion = useRef(0);

  useEffect(() => {
    let active = true;
    const selectionVersionAtStart = userSelectionVersion.current;

    void AsyncStorage.getItem(MOBILE_THEME_PREFERENCE_KEY)
      .then((storedMode) => {
        if (active && userSelectionVersion.current === selectionVersionAtStart) {
          setModeState(normalizeMobileThemeMode(storedMode));
        }
      })
      .catch(() => {
        if (active && userSelectionVersion.current === selectionVersionAtStart) {
          setModeState("system");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const accentVersionAtStart = accentSelectionVersion.current;
    const fontScaleVersionAtStart = fontScaleSelectionVersion.current;
    const voiceAppearanceVersionAtStart = voiceAppearanceSelectionVersion.current;

    void AsyncStorage.getItem(MOBILE_ACCENT_PREFERENCE_KEY)
      .then((storedAccent) => {
        if (active && accentSelectionVersion.current === accentVersionAtStart) {
          setAccentState(normalizeMobileAccentId(storedAccent));
        }
      })
      .catch(() => undefined);
    void AsyncStorage.getItem(MOBILE_FONT_SCALE_PREFERENCE_KEY)
      .then((storedStep) => {
        if (active && fontScaleSelectionVersion.current === fontScaleVersionAtStart) {
          setFontScaleStepState(normalizeMobileFontScaleStep(storedStep));
        }
      })
      .catch(() => undefined);
    void AsyncStorage.getItem(MOBILE_VOICE_APPEARANCE_PREFERENCE_KEY)
      .then((storedAppearance) => {
        if (active && voiceAppearanceSelectionVersion.current === voiceAppearanceVersionAtStart) {
          setVoiceRoomAppearanceState(normalizeMobileVoiceRoomAppearance(storedAppearance));
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((nextMode: MobileThemeMode) => {
    const normalizedMode = normalizeMobileThemeMode(nextMode);
    userSelectionVersion.current += 1;
    setModeState(normalizedMode);
    void AsyncStorage.setItem(MOBILE_THEME_PREFERENCE_KEY, normalizedMode).catch(() => undefined);
  }, []);

  const setAccent = useCallback((nextAccent: MobileAccentId) => {
    const normalizedAccent = normalizeMobileAccentId(nextAccent);
    accentSelectionVersion.current += 1;
    setAccentState(normalizedAccent);
    void AsyncStorage.setItem(MOBILE_ACCENT_PREFERENCE_KEY, normalizedAccent).catch(
      () => undefined,
    );
  }, []);

  const setFontScaleStep = useCallback((nextStep: MobileFontScaleStep) => {
    const normalizedStep = normalizeMobileFontScaleStep(nextStep);
    fontScaleSelectionVersion.current += 1;
    setFontScaleStepState(normalizedStep);
    void AsyncStorage.setItem(MOBILE_FONT_SCALE_PREFERENCE_KEY, String(normalizedStep)).catch(
      () => undefined,
    );
  }, []);

  const setVoiceRoomAppearance = useCallback((nextAppearance: MobileVoiceRoomAppearance) => {
    const normalizedAppearance = normalizeMobileVoiceRoomAppearance(nextAppearance);
    voiceAppearanceSelectionVersion.current += 1;
    setVoiceRoomAppearanceState(normalizedAppearance);
    void AsyncStorage.setItem(
      MOBILE_VOICE_APPEARANCE_PREFERENCE_KEY,
      normalizedAppearance,
    ).catch(() => undefined);
  }, []);

  const resolvedTheme = resolveMobileTheme(mode, systemScheme);
  const theme = composeMobileTheme(getMobileTheme(mode, systemScheme), accent, fontScaleStep);
  const preferenceRuntime = useMemo<MobileAppearancePreferenceRuntime>(
    () => ({
      accent,
      fontScaleStep,
      mode,
      resolvedTheme,
      setAccent,
      setFontScaleStep,
      setMode,
      setVoiceRoomAppearance,
      voiceRoomAppearance,
    }),
    [
      accent,
      fontScaleStep,
      mode,
      resolvedTheme,
      setAccent,
      setFontScaleStep,
      setMode,
      setVoiceRoomAppearance,
      voiceRoomAppearance,
    ],
  );

  return (
    <ThemePreferenceContext.Provider value={preferenceRuntime}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </ThemePreferenceContext.Provider>
  );
}

export function useTheme(): MobileTheme {
  const theme = useContext(ThemeContext);

  if (!theme) {
    throw new Error("useTheme must be used within MobileThemeProvider");
  }

  return theme;
}

export function useThemePreference(): MobileThemePreferenceRuntime {
  const runtime = useContext(ThemePreferenceContext);

  if (!runtime) {
    throw new Error("useThemePreference must be used within MobileThemeProvider");
  }

  return runtime;
}

export function useMobileAppearancePreferences(): MobileAppearancePreferenceRuntime {
  const runtime = useContext(ThemePreferenceContext);

  if (!runtime) {
    throw new Error("useMobileAppearancePreferences must be used within MobileThemeProvider");
  }

  return runtime;
}

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: MobileTheme) => T,
): T {
  const theme = useTheme();
  let factoryCache = styleCache.get(factory) as WeakMap<MobileTheme, T> | undefined;

  if (!factoryCache) {
    factoryCache = new WeakMap<MobileTheme, T>();
    styleCache.set(factory, factoryCache);
  }

  let styles = factoryCache.get(theme);
  if (!styles) {
    styles = StyleSheet.create(factory(theme));
    factoryCache.set(theme, styles);
  }

  return styles;
}

/**
 * The theme the voice room should render with: honours the dedicated voice
 * appearance preference (system/dark/light) over the active app theme, while
 * still applying the user's accent and text-size choices.
 */
export function useVoiceRoomTheme(): MobileTheme {
  const appTheme = useTheme();
  const runtime = useContext(ThemePreferenceContext);
  const appearance = runtime?.voiceRoomAppearance ?? MOBILE_DEFAULT_VOICE_APPEARANCE;
  const base = resolveMobileVoiceRoomBaseTheme(appearance, appTheme);
  return composeMobileTheme(
    base,
    runtime?.accent ?? MOBILE_DEFAULT_ACCENT_ID,
    runtime?.fontScaleStep ?? MOBILE_DEFAULT_FONT_SCALE_STEP,
  );
}

/** `useThemedStyles`, but resolved against the voice-room theme. */
export function useVoiceRoomThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: MobileTheme) => T,
): T {
  const theme = useVoiceRoomTheme();
  let factoryCache = styleCache.get(factory) as WeakMap<MobileTheme, T> | undefined;

  if (!factoryCache) {
    factoryCache = new WeakMap<MobileTheme, T>();
    styleCache.set(factory, factoryCache);
  }

  let styles = factoryCache.get(theme);
  if (!styles) {
    styles = StyleSheet.create(factory(theme));
    factoryCache.set(theme, styles);
  }

  return styles;
}
