import React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { act, render } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { MobilePrivacyShield } from "../src/app/components/mobile-privacy-shield";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";

function renderPrivacyShield() {
  return render(
    <MobileThemeProvider>
      <MobilePrivacyShield />
    </MobileThemeProvider>,
  );
}

describe("MobilePrivacyShield", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("covers the app while inactive or backgrounded and clears after foreground resume", async () => {
    let onChange: ((status: AppStateStatus) => void) | null = null;
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
      onChange = listener;
      return { remove: jest.fn() };
    });

    const view = await renderPrivacyShield();
    await act(async () => {
      onChange?.("active");
    });
    expect(view.queryByTestId("mobile-privacy-shield")).toBeNull();

    await act(async () => {
      onChange?.("inactive");
    });
    expect(view.getByTestId("mobile-privacy-shield")).toBeTruthy();
    await act(async () => {
      onChange?.("background");
    });
    expect(view.getByTestId("mobile-privacy-shield")).toBeTruthy();

    await act(async () => {
      onChange?.("active");
    });
    expect(view.queryByTestId("mobile-privacy-shield")).toBeNull();
  });
});
