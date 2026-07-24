"use client";

import { useCallback, useEffect, useState } from "react";

export type LoginTheme = "dark" | "light";

const LOGIN_THEME_STORAGE_KEY = "whispr.login.theme";

function getSystemTheme(): LoginTheme {
  if (typeof window === "undefined") {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readStoredTheme(): LoginTheme {
  if (typeof window === "undefined") {
    return "dark";
  }

  const storedTheme = window.localStorage.getItem(LOGIN_THEME_STORAGE_KEY);

  return storedTheme === "light" || storedTheme === "dark" ? storedTheme : getSystemTheme();
}

function applyLoginTheme(theme: LoginTheme) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
}

export function useLoginTheme() {
  const [theme, setThemeState] = useState<LoginTheme>(readStoredTheme);

  useEffect(() => {
    applyLoginTheme(theme);
  }, [theme]);

  const setTheme = useCallback((nextTheme: LoginTheme) => {
    setThemeState(nextTheme);
    applyLoginTheme(nextTheme);
    window.localStorage.setItem(LOGIN_THEME_STORAGE_KEY, nextTheme);
  }, []);

  return { setTheme, theme };
}
