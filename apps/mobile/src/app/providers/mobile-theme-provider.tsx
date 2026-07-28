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
import { PixelRatio, StyleSheet, useColorScheme } from "react-native";
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
  MOBILE_DEFAULT_MESSAGE_COMPACT,
  MOBILE_DEFAULT_MESSAGE_FOLLOW_SYSTEM_FONT,
  MOBILE_DEFAULT_VOICE_APPEARANCE,
  MOBILE_FONT_SCALE_PREFERENCE_KEY,
  MOBILE_MESSAGE_COMPACT_PREFERENCE_KEY,
  MOBILE_MESSAGE_FOLLOW_SYSTEM_PREFERENCE_KEY,
  MOBILE_MESSAGE_FONT_SIZE_PREFERENCE_KEY,
  MOBILE_VOICE_APPEARANCE_PREFERENCE_KEY,
  getMobileThemeFontScale,
  getMobileThemeStyleSource,
  normalizeMobileAccentId,
  normalizeMobileFontScaleStep,
  normalizeMobileMessageBooleanPreference,
  normalizeMobileVoiceRoomAppearance,
  resolveMobileVoiceRoomBaseTheme,
  scaleMobileStyleSheetText,
  type MobileAccentId,
  type MobileFontScaleStep,
  type MobileVoiceRoomAppearance,
} from "../../design/mobile-appearance-preferences";
import {
  getMobileMessageBodyStyle,
  getMobileMessageSpacing,
  MOBILE_DEFAULT_MESSAGE_FONT_SIZE,
  normalizeMobileMessageFontSize,
  type MobileMessageBodyStyle,
  type MobileMessageFontSize,
  type MobileMessageSurface,
} from "../../design/mobile-message-typography";
import type { MobileTheme } from "../../design/themes";

interface MobileThemePreferenceRuntime {
  readonly mode: MobileThemeMode;
  readonly resolvedTheme: MobileResolvedTheme;
  setMode(mode: MobileThemeMode): void;
}

interface MobileAppearancePreferenceRuntime extends MobileThemePreferenceRuntime {
  readonly accent: MobileAccentId;
  readonly fontScaleStep: MobileFontScaleStep;
  /** §3: message-body preferences, independent of `fontScaleStep` (K5). */
  readonly messageCompact: boolean;
  readonly messageFollowSystemFont: boolean;
  readonly messageFontSize: MobileMessageFontSize;
  /**
   * False until the three stored message preferences have been read back. The
   * M4A account sync waits on this so it never reconciles the server against a
   * value that is only the shipped default because storage has not answered yet.
   */
  readonly messagePreferencesReady: boolean;
  readonly voiceRoomAppearance: MobileVoiceRoomAppearance;
  setAccent(accent: MobileAccentId): void;
  setFontScaleStep(step: MobileFontScaleStep): void;
  setMessageCompact(compact: boolean): void;
  setMessageFollowSystemFont(followSystemFont: boolean): void;
  setMessageFontSize(size: MobileMessageFontSize): void;
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
  const [messageFontSize, setMessageFontSizeState] = useState<MobileMessageFontSize>(
    MOBILE_DEFAULT_MESSAGE_FONT_SIZE,
  );
  const [messageCompact, setMessageCompactState] = useState(MOBILE_DEFAULT_MESSAGE_COMPACT);
  const [messageFollowSystemFont, setMessageFollowSystemFontState] = useState(
    MOBILE_DEFAULT_MESSAGE_FOLLOW_SYSTEM_FONT,
  );
  const [messagePreferencesReady, setMessagePreferencesReady] = useState(false);
  const userSelectionVersion = useRef(0);
  const accentSelectionVersion = useRef(0);
  const fontScaleSelectionVersion = useRef(0);
  const voiceAppearanceSelectionVersion = useRef(0);
  const messageFontSizeSelectionVersion = useRef(0);
  const messageCompactSelectionVersion = useRef(0);
  const messageFollowSystemSelectionVersion = useRef(0);

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

  useEffect(() => {
    let active = true;
    const fontSizeVersionAtStart = messageFontSizeSelectionVersion.current;
    const compactVersionAtStart = messageCompactSelectionVersion.current;
    const followSystemVersionAtStart = messageFollowSystemSelectionVersion.current;

    const loads = [
      AsyncStorage.getItem(MOBILE_MESSAGE_FONT_SIZE_PREFERENCE_KEY)
        .then((storedSize) => {
          if (active && messageFontSizeSelectionVersion.current === fontSizeVersionAtStart) {
            setMessageFontSizeState(normalizeMobileMessageFontSize(storedSize));
          }
        })
        .catch(() => undefined),
      AsyncStorage.getItem(MOBILE_MESSAGE_COMPACT_PREFERENCE_KEY)
        .then((storedCompact) => {
          if (active && messageCompactSelectionVersion.current === compactVersionAtStart) {
            setMessageCompactState(
              normalizeMobileMessageBooleanPreference(
                storedCompact,
                MOBILE_DEFAULT_MESSAGE_COMPACT,
              ),
            );
          }
        })
        .catch(() => undefined),
      AsyncStorage.getItem(MOBILE_MESSAGE_FOLLOW_SYSTEM_PREFERENCE_KEY)
        .then((storedFollowSystem) => {
          if (
            active &&
            messageFollowSystemSelectionVersion.current === followSystemVersionAtStart
          ) {
            setMessageFollowSystemFontState(
              normalizeMobileMessageBooleanPreference(
                storedFollowSystem,
                MOBILE_DEFAULT_MESSAGE_FOLLOW_SYSTEM_FONT,
              ),
            );
          }
        })
        .catch(() => undefined),
    ];

    void Promise.all(loads).then(() => {
      if (active) {
        setMessagePreferencesReady(true);
      }
    });

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
    void AsyncStorage.setItem(MOBILE_VOICE_APPEARANCE_PREFERENCE_KEY, normalizedAppearance).catch(
      () => undefined,
    );
  }, []);

  const setMessageFontSize = useCallback((nextSize: MobileMessageFontSize) => {
    const normalizedSize = normalizeMobileMessageFontSize(nextSize);
    messageFontSizeSelectionVersion.current += 1;
    setMessageFontSizeState(normalizedSize);
    void AsyncStorage.setItem(MOBILE_MESSAGE_FONT_SIZE_PREFERENCE_KEY, normalizedSize).catch(
      () => undefined,
    );
  }, []);

  const setMessageCompact = useCallback((nextCompact: boolean) => {
    messageCompactSelectionVersion.current += 1;
    setMessageCompactState(nextCompact);
    void AsyncStorage.setItem(MOBILE_MESSAGE_COMPACT_PREFERENCE_KEY, String(nextCompact)).catch(
      () => undefined,
    );
  }, []);

  const setMessageFollowSystemFont = useCallback((nextFollowSystemFont: boolean) => {
    messageFollowSystemSelectionVersion.current += 1;
    setMessageFollowSystemFontState(nextFollowSystemFont);
    void AsyncStorage.setItem(
      MOBILE_MESSAGE_FOLLOW_SYSTEM_PREFERENCE_KEY,
      String(nextFollowSystemFont),
    ).catch(() => undefined);
  }, []);

  const resolvedTheme = resolveMobileTheme(mode, systemScheme);
  const theme = composeMobileTheme(getMobileTheme(mode, systemScheme), accent, fontScaleStep);
  const preferenceRuntime = useMemo<MobileAppearancePreferenceRuntime>(
    () => ({
      accent,
      fontScaleStep,
      messageCompact,
      messageFollowSystemFont,
      messageFontSize,
      messagePreferencesReady,
      mode,
      resolvedTheme,
      setAccent,
      setFontScaleStep,
      setMessageCompact,
      setMessageFollowSystemFont,
      setMessageFontSize,
      setMode,
      setVoiceRoomAppearance,
      voiceRoomAppearance,
    }),
    [
      accent,
      fontScaleStep,
      messageCompact,
      messageFollowSystemFont,
      messageFontSize,
      messagePreferencesReady,
      mode,
      resolvedTheme,
      setAccent,
      setFontScaleStep,
      setMessageCompact,
      setMessageFollowSystemFont,
      setMessageFontSize,
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

/**
 * The message body's only size source (handoff §3). React Native has no CSS
 * variable, so this hook replaces `--msg-size`: it resolves the preference, the
 * compact toggle and — when "follow system text size" is on — the OS scale.
 *
 * Merge the result as an inline style on top of the `StyleSheet` entry. A
 * fontSize frozen inside `StyleSheet.create` cannot follow the preference, so a
 * size change would not land in the same frame.
 */
export function useMobileMessageBodyStyle(surface: MobileMessageSurface): MobileMessageBodyStyle {
  const runtime = useContext(ThemePreferenceContext);
  const followSystemFont =
    runtime?.messageFollowSystemFont ?? MOBILE_DEFAULT_MESSAGE_FOLLOW_SYSTEM_FONT;
  // Read per render: the OS scale can change while the app is backgrounded.
  const systemFontScale = followSystemFont ? PixelRatio.getFontScale() : 1;

  return useMemo(
    () =>
      getMobileMessageBodyStyle({
        compact: runtime?.messageCompact ?? MOBILE_DEFAULT_MESSAGE_COMPACT,
        fontScale: systemFontScale,
        size: runtime?.messageFontSize ?? MOBILE_DEFAULT_MESSAGE_FONT_SIZE,
        surface,
      }),
    [runtime?.messageCompact, runtime?.messageFontSize, surface, systemFontScale],
  );
}

/**
 * §3.2 companion to `useMobileMessageBodyStyle`: the compact toggle tightens the
 * block around the body as well as the line height, and those measures cannot
 * live in a `StyleSheet` for the same reason the size cannot.
 */
export function useMobileMessageSpacing(): ReturnType<typeof getMobileMessageSpacing> {
  const runtime = useContext(ThemePreferenceContext);
  const compact = runtime?.messageCompact ?? MOBILE_DEFAULT_MESSAGE_COMPACT;

  return useMemo(() => getMobileMessageSpacing(compact), [compact]);
}

/**
 * Builds a factory's sheet for one theme and memoizes it against that theme.
 *
 * The factory is run against the theme's 1x typography and the interface text
 * scale is applied to the finished sheet: most of the app writes its font sizes
 * as literals rather than as typography tokens, so scaling the tokens alone
 * left the preference with almost nothing to move. Caching stays keyed by the
 * theme object because a composed theme is already unique per accent AND step.
 */
function buildThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: MobileTheme) => T,
  theme: MobileTheme,
): T {
  let factoryCache = styleCache.get(factory) as WeakMap<MobileTheme, T> | undefined;

  if (!factoryCache) {
    factoryCache = new WeakMap<MobileTheme, T>();
    styleCache.set(factory, factoryCache);
  }

  let styles = factoryCache.get(theme);
  if (!styles) {
    styles = StyleSheet.create(
      scaleMobileStyleSheetText(
        factory(getMobileThemeStyleSource(theme)),
        getMobileThemeFontScale(theme),
      ),
    );
    factoryCache.set(theme, styles);
  }

  return styles;
}

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: MobileTheme) => T,
): T {
  return buildThemedStyles(factory, useTheme());
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
  return buildThemedStyles(factory, useVoiceRoomTheme());
}
