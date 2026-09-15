"use client";

import { useTheme } from "next-themes";
import { useLayoutEffect, useRef } from "react";
import {
  applyWizardsThemeToDocument,
  normalizeWizardsThemeId,
  type WizardsThemeId,
} from "@/lib/appearance";

type ThemeSessionSyncProps = {
  preferredTheme?: string | null;
};

type ThemeSessionSyncDecisionInput = {
  currentTheme?: string | null | undefined;
  lastPreferredTheme?: WizardsThemeId | null | undefined;
  preferredTheme?: string | null | undefined;
};

export function getThemeSessionSyncDecision({
  currentTheme,
  lastPreferredTheme,
  preferredTheme,
}: ThemeSessionSyncDecisionInput) {
  const nextPreferredTheme = preferredTheme ? normalizeWizardsThemeId(preferredTheme) : null;

  if (typeof lastPreferredTheme !== "undefined" && lastPreferredTheme === nextPreferredTheme) {
    return {
      nextLastPreferredTheme: lastPreferredTheme,
      themeToApply: null,
    };
  }

  const normalizedCurrentTheme = normalizeWizardsThemeId(currentTheme);
  // A server action may refresh the session after the user has selected another theme.
  // Once the provider diverges from the last session value, the local choice wins.
  const hasLocalSelection =
    lastPreferredTheme != null && normalizedCurrentTheme !== lastPreferredTheme;

  return {
    nextLastPreferredTheme: nextPreferredTheme,
    themeToApply:
      !hasLocalSelection && nextPreferredTheme && normalizedCurrentTheme !== nextPreferredTheme
        ? nextPreferredTheme
        : null,
  };
}

export function ThemeSessionSync({ preferredTheme }: ThemeSessionSyncProps) {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const lastPreferredThemeRef = useRef<WizardsThemeId | null | undefined>(undefined);

  useLayoutEffect(() => {
    const decision = getThemeSessionSyncDecision({
      currentTheme: theme ?? resolvedTheme,
      lastPreferredTheme: lastPreferredThemeRef.current,
      preferredTheme,
    });

    lastPreferredThemeRef.current = decision.nextLastPreferredTheme;

    if (decision.themeToApply) {
      const nextTheme = applyWizardsThemeToDocument(decision.themeToApply);
      setTheme(nextTheme);
    }
  }, [preferredTheme, resolvedTheme, setTheme, theme]);

  return null;
}
