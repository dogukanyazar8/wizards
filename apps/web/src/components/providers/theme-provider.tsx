"use client";

import { WIZARDS_THEME_IDS } from "@/lib/appearance";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="theme-graphite"
      disableTransitionOnChange
      enableSystem={false}
      themes={WIZARDS_THEME_IDS}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
