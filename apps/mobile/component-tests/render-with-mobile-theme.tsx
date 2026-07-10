import React, { type ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react-native";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";

export function renderWithMobileTheme(ui: ReactElement, options?: RenderOptions) {
  return render(
    <MobileThemeProvider>
      <MobileLocaleProvider>{ui}</MobileLocaleProvider>
    </MobileThemeProvider>,
    options,
  );
}
