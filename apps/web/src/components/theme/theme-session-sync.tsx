"use client";

import { useTheme } from "next-themes";
import { useLayoutEffect } from "react";
import { normalizeWizardsThemeId } from "@/lib/appearance";

type ThemeSessionSyncProps = {
  preferredTheme?: string | null;
};

export function ThemeSessionSync({ preferredTheme }: ThemeSessionSyncProps) {
  const { resolvedTheme, setTheme, theme } = useTheme();

  useLayoutEffect(() => {
    const currentTheme = normalizeWizardsThemeId(theme ?? resolvedTheme);
    const nextTheme = normalizeWizardsThemeId(preferredTheme ?? currentTheme);

    if (theme !== nextTheme) {
      setTheme(nextTheme);
    }
  }, [preferredTheme, resolvedTheme, setTheme, theme]);

  return null;
}
