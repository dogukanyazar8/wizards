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
import type { MobileTheme } from "../../design/themes";

interface MobileThemePreferenceRuntime {
  readonly mode: MobileThemeMode;
  readonly resolvedTheme: MobileResolvedTheme;
  setMode(mode: MobileThemeMode): void;
}

const ThemeContext = createContext<MobileTheme | null>(null);
const ThemePreferenceContext = createContext<MobileThemePreferenceRuntime | null>(null);
const styleCache = new WeakMap<Function, WeakMap<MobileTheme, object>>();

export function MobileThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<MobileThemeMode>("system");
  const userSelectionVersion = useRef(0);

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

  const setMode = useCallback((nextMode: MobileThemeMode) => {
    const normalizedMode = normalizeMobileThemeMode(nextMode);
    userSelectionVersion.current += 1;
    setModeState(normalizedMode);
    void AsyncStorage.setItem(MOBILE_THEME_PREFERENCE_KEY, normalizedMode).catch(() => undefined);
  }, []);

  const resolvedTheme = resolveMobileTheme(mode, systemScheme);
  const theme = getMobileTheme(mode, systemScheme);
  const preferenceRuntime = useMemo<MobileThemePreferenceRuntime>(
    () => ({ mode, resolvedTheme, setMode }),
    [mode, resolvedTheme, setMode],
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
