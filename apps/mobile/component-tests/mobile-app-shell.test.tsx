import React from "react";
import { StyleSheet, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { describe, expect, it } from "@jest/globals";
import { createMobileAppShellStyles, MobileAppShell } from "../src/app/mobile-app-shell";
import { MobileChatKeyboardRegion } from "../src/app/mobile-chat-keyboard-region";
import { lightTheme } from "../src/design/themes";
import { renderWithMobileTheme } from "./render-with-mobile-theme";

const androidThreeButtonMetrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 48, left: 0, right: 0, top: 42 },
};

async function renderShell(authStatus: "signed-in" | "signed-out") {
  const view = await renderWithMobileTheme(
    <SafeAreaProvider initialMetrics={androidThreeButtonMetrics}>
      <MobileAppShell authStatus={authStatus}>
        <Text testID="mobile-app-shell-child">child</Text>
      </MobileAppShell>
    </SafeAreaProvider>,
  );

  expect(view.getByTestId("mobile-app-shell-child")).toBeTruthy();

  return StyleSheet.flatten(view.getByTestId("mobile-app-shell").props.style as never) as {
    paddingBottom?: number;
  };
}

describe("MobileAppShell", () => {
  it("clears the Android navigation bar once for every signed-in screen", async () => {
    expect(await renderShell("signed-in")).toMatchObject({ paddingBottom: 48 });
  });

  it("leaves the bottom edge to the auth layout while signed out", async () => {
    expect(await renderShell("signed-out")).toMatchObject({ paddingBottom: 0 });
  });

  it("does not reserve a fixed bottom gap for signed-in navigation", () => {
    const styles = createMobileAppShellStyles(lightTheme);

    expect(styles.contentSignedIn).toMatchObject(styles.contentUnauthenticated);
    expect(styles.contentSignedIn).not.toHaveProperty("paddingBottom");
    expect(styles.contentSignedIn).not.toHaveProperty("paddingTop");
  });

  it("leaves unauthenticated auth screens full-bleed so their canonical layout owns safe areas", () => {
    const styles = createMobileAppShellStyles(lightTheme);

    expect(styles.shellUnauthenticated).toMatchObject({
      paddingHorizontal: 0,
      paddingTop: 0,
    });
    expect(styles.contentUnauthenticated).not.toHaveProperty("paddingBottom");
    expect(styles.contentUnauthenticated).not.toHaveProperty("paddingTop");
  });
});

describe("MobileChatKeyboardRegion", () => {
  it("keeps the shell's system-inset reservation while a chat region owns the keyboard", async () => {
    const view = await renderWithMobileTheme(
      <SafeAreaProvider initialMetrics={androidThreeButtonMetrics}>
        <MobileAppShell authStatus="signed-in">
          <MobileChatKeyboardRegion testID="mobile-chat-keyboard-region">
            <Text testID="mobile-chat-keyboard-region-child">chat</Text>
          </MobileChatKeyboardRegion>
        </MobileAppShell>
      </SafeAreaProvider>,
    );

    expect(view.getByTestId("mobile-chat-keyboard-region-child")).toBeTruthy();
    // A mounted region moves keyboard avoidance to the chat body, but the
    // shell must keep clearing the Android navigation bar.
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-app-shell").props.style as never) as {
        paddingBottom?: number;
      },
    ).toMatchObject({ paddingBottom: 48 });
    // The lifted chat body is clipped so it slides under the screen header
    // instead of painting over it.
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-chat-keyboard-region").props.style as never) as {
        overflow?: string;
      },
    ).toMatchObject({ overflow: "hidden" });
  });
});
