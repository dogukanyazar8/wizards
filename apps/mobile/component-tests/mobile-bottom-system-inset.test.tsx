import React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { expect, it } from "@jest/globals";
import { render } from "@testing-library/react-native";
import {
  resolveMobileBottomKeyboardSpacing,
  resolveMobileKeyboardLift,
} from "../src/app/mobile-bottom-system-inset";
import { useMobileBottomSystemSpacing } from "../src/app/use-mobile-bottom-system-spacing";

function BottomInsetHarness({ minimumSpacing }: { readonly minimumSpacing: number }) {
  const paddingBottom = useMobileBottomSystemSpacing(minimumSpacing);
  return <View style={{ paddingBottom }} testID="mobile-bottom-inset-harness" />;
}

it("uses SafeAreaProvider bottom inset when Android navigation is taller than the design minimum", async () => {
  const view = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 844, width: 390, x: 0, y: 0 },
        insets: { bottom: 48, left: 0, right: 0, top: 42 },
      }}
    >
      <BottomInsetHarness minimumSpacing={18} />
    </SafeAreaProvider>,
  );

  expect(
    StyleSheet.flatten(view.getByTestId("mobile-bottom-inset-harness").props.style),
  ).toMatchObject({
    paddingBottom: 48,
  });
});

it("keeps a shared primitive at its design minimum when rendered without SafeAreaProvider", async () => {
  const view = await render(<BottomInsetHarness minimumSpacing={18} />);

  expect(
    StyleSheet.flatten(view.getByTestId("mobile-bottom-inset-harness").props.style),
  ).toMatchObject({
    paddingBottom: 18,
  });
});

it("hands the bottom edge to the keyboard instead of stacking it on the system inset", () => {
  expect(
    resolveMobileBottomKeyboardSpacing({
      keyboardHeight: 312,
      minimumSpacing: 0,
      systemInset: 48,
    }),
  ).toBe(312);
});

it("falls back to the Android system-bar inset once the keyboard is closed", () => {
  expect(
    resolveMobileBottomKeyboardSpacing({
      keyboardHeight: 0,
      minimumSpacing: 0,
      systemInset: 48,
    }),
  ).toBe(48);
});

it("lifts a bottom-anchored sheet only by the distance the keyboard adds past the system bar", () => {
  expect(resolveMobileKeyboardLift({ keyboardHeight: 312, systemInset: 48 })).toBe(264);
  expect(resolveMobileKeyboardLift({ keyboardHeight: 0, systemInset: 48 })).toBe(0);
  expect(resolveMobileKeyboardLift({ keyboardHeight: 20, systemInset: 48 })).toBe(0);
});

it("never lets a mid-animation keyboard value shrink a surface below its design minimum", () => {
  expect(
    resolveMobileBottomKeyboardSpacing({
      keyboardHeight: 4,
      minimumSpacing: 18,
      systemInset: 0,
    }),
  ).toBe(18);
  expect(
    resolveMobileBottomKeyboardSpacing({
      keyboardHeight: Number.NaN,
      minimumSpacing: 18,
      systemInset: 48,
    }),
  ).toBe(48);
});
