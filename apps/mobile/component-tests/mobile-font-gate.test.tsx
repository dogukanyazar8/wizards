import React from "react";
import { Text } from "react-native";
import { render, waitFor } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

const mockUseMobileFonts = jest.fn();
const mockInstallMobileFontDefaults = jest.fn();

jest.mock("../src/design/mobile-fonts", () => ({
  installMobileFontDefaults: () => mockInstallMobileFontDefaults(),
  useMobileFonts: () => mockUseMobileFonts(),
}));

import { MOBILE_FONT_FALLBACK_DIAGNOSTIC, MobileFontGate } from "../src/design/mobile-font-gate";

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
