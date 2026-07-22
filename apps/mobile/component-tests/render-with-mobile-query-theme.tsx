import React, { type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react-native";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";

/** Theme + locale + an isolated query client for screens that fetch on mount. */
export function renderWithMobileQueryTheme(ui: ReactElement, options?: RenderOptions) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { gcTime: 0, retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MobileThemeProvider>
        <MobileLocaleProvider>{ui}</MobileLocaleProvider>
      </MobileThemeProvider>
    </QueryClientProvider>,
    options,
  );
}
