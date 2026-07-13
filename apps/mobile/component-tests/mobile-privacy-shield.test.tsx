import React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { act } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { MobilePrivacyShield } from "../src/app/components/mobile-privacy-shield";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

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

    const view = await render(<MobilePrivacyShield />);
    await act(() => onChange?.("active"));
    expect(view.queryByTestId("mobile-privacy-shield")).toBeNull();

    await act(() => onChange?.("inactive"));
    expect(view.getByTestId("mobile-privacy-shield")).toBeTruthy();
    await act(() => onChange?.("background"));
    expect(view.getByTestId("mobile-privacy-shield")).toBeTruthy();

    await act(() => onChange?.("active"));
    expect(view.queryByTestId("mobile-privacy-shield")).toBeNull();
  });
});
