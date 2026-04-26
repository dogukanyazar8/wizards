"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";
import { normalizeWizardsThemeId } from "@/lib/appearance";

type ThemeSessionSyncProps = {
  preferredTheme?: string | null;
};

export function ThemeSessionSync({ preferredTheme }: ThemeSessionSyncProps) {
  const { resolvedTheme, setTheme, theme } = useTheme();

  useEffect(() => {
    const currentTheme = normalizeWizardsThemeId(theme ?? resolvedTheme);
    const nextTheme = normalizeWizardsThemeId(preferredTheme ?? currentTheme);

    if (theme !== nextTheme) {
      setTheme(nextTheme);
    }
  }, [preferredTheme, resolvedTheme, setTheme, theme]);

  return null;
}
