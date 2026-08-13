"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type LoginTheme = "dark" | "light";

const LOGIN_THEME_STORAGE_KEY = "whispr.login.theme";
const LOGIN_THEME_CHANGE_EVENT = "whispr:login-theme-change";

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

function getServerTheme(): LoginTheme {
  return "dark";
}

function subscribeToLoginTheme(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === LOGIN_THEME_STORAGE_KEY) {
      onStoreChange();
    }
  };
  const handleThemeChange = () => onStoreChange();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(LOGIN_THEME_CHANGE_EVENT, handleThemeChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(LOGIN_THEME_CHANGE_EVENT, handleThemeChange);
  };
}

export function useLoginTheme() {
  const theme = useSyncExternalStore(subscribeToLoginTheme, readStoredTheme, getServerTheme);

  useEffect(() => {
    applyLoginTheme(theme);
  }, [theme]);

  const setTheme = useCallback((nextTheme: LoginTheme) => {
    applyLoginTheme(nextTheme);
    window.localStorage.setItem(LOGIN_THEME_STORAGE_KEY, nextTheme);
    window.dispatchEvent(new Event(LOGIN_THEME_CHANGE_EVENT));
  }, []);

  return { setTheme, theme };
}
