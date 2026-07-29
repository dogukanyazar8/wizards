import React from "react";
import { Text } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

const mockUseMobileFonts = jest.fn();
const mockInstallMobileFontDefaults = jest.fn();

jest.mock("../src/design/mobile-fonts", () => ({
  installMobileFontDefaults: () => mockInstallMobileFontDefaults(),
  useMobileFonts: () => mockUseMobileFonts(),
}));

import {
  MOBILE_FONT_FALLBACK_DIAGNOSTIC,
  MOBILE_FONT_GATE_DEADLINE_MS,
  MobileFontGate,
} from "../src/design/mobile-font-gate";

afterEach(() => {
  jest.restoreAllMocks();
  mockInstallMobileFontDefaults.mockReset();
  mockUseMobileFonts.mockReset();
});

describe("MobileFontGate", () => {
  it("keeps the product tree unmounted while vendored fonts are pending", async () => {
    mockUseMobileFonts.mockReturnValue([false, null]);

    const view = await render(
      <MobileFontGate>
        <Text testID="font-gated-product">product</Text>
      </MobileFontGate>,
    );

    expect(view.queryByTestId("font-gated-product")).toBeNull();
    expect(mockInstallMobileFontDefaults).not.toHaveBeenCalled();
  });

  // A cold start held a blank window for as long as the font load took. The hold
  // is now bounded: past the deadline the app draws with the system face and
  // swaps to Jakarta when the load finishes.
  it("stops holding the tree once the font deadline lapses", async () => {
    jest.useFakeTimers();
    mockUseMobileFonts.mockReturnValue([false, null]);

    try {
      const view = await render(
        <MobileFontGate>
          <Text testID="font-gated-product">product</Text>
        </MobileFontGate>,
      );

      expect(view.queryByTestId("font-gated-product")).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(MOBILE_FONT_GATE_DEADLINE_MS);
      });

      expect(view.getByTestId("font-gated-product")).toBeTruthy();
      expect(mockInstallMobileFontDefaults).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("installs Jakarta defaults when the load finishes after the deadline", async () => {
    jest.useFakeTimers();
    mockUseMobileFonts.mockReturnValue([false, null]);

    try {
      const view = await render(
        <MobileFontGate>
          <Text testID="font-gated-product">product</Text>
        </MobileFontGate>,
      );
      await act(async () => {
        jest.advanceTimersByTime(MOBILE_FONT_GATE_DEADLINE_MS);
      });

      mockUseMobileFonts.mockReturnValue([true, null]);
      await act(async () => {
        await view.rerender(
          <MobileFontGate>
            <Text testID="font-gated-product">product</Text>
          </MobileFontGate>,
        );
      });

      expect(mockInstallMobileFontDefaults).toHaveBeenCalledTimes(1);
      expect(view.getByTestId("font-gated-product")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("installs Jakarta defaults before the first product-tree render", async () => {
    const events: string[] = [];
    mockUseMobileFonts.mockReturnValue([true, null]);
    mockInstallMobileFontDefaults.mockImplementation(() => {
      events.push("defaults");
    });

    function ProductProbe() {
      events.push("product");
      return <Text testID="font-gated-product">product</Text>;
    }

    const view = await render(
      <MobileFontGate>
        <ProductProbe />
      </MobileFontGate>,
    );

    await waitFor(() => expect(view.getByTestId("font-gated-product")).toBeTruthy());
    expect(events).toEqual(["defaults", "product"]);
  });

  it("renders with the system fallback and records one constant diagnostic on load failure", async () => {
    const fontError = new Error("bearer top-secret font URL");
    mockUseMobileFonts.mockReturnValue([false, fontError]);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const view = await render(
      <MobileFontGate>
        <Text testID="font-gated-product">product</Text>
      </MobileFontGate>,
    );

    await waitFor(() => expect(view.getByTestId("font-gated-product")).toBeTruthy());
    await view.rerender(
      <MobileFontGate>
        <Text testID="font-gated-product">product</Text>
      </MobileFontGate>,
    );

    expect(mockInstallMobileFontDefaults).not.toHaveBeenCalled();
    expect(warn.mock.calls).toEqual([[MOBILE_FONT_FALLBACK_DIAGNOSTIC]]);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining(fontError.message));
  });
});
