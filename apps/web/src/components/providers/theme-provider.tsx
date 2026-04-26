"use client";

import {
  DEFAULT_WIZARDS_THEME,
  WIZARDS_THEME_IDS,
} from "@/lib/appearance";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={DEFAULT_WIZARDS_THEME}
      disableTransitionOnChange
      enableSystem={false}
      themes={WIZARDS_THEME_IDS}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
