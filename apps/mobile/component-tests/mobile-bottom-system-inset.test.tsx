import React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { expect, it } from "@jest/globals";
import { render } from "@testing-library/react-native";
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
