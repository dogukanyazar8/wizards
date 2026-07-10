import React from "react";
import * as ReactNative from "react-native";
import { StyleSheet } from "react-native";
import { fireEvent } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { AuthGate } from "../src/app/screens/auth-gate";
import { darkTheme, lightTheme } from "../src/design/themes";
import { activeMobileCopy } from "../src/locale/mobile-locale-preferences";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const copy = activeMobileCopy;

async function renderAuthGate() {
  return render(
    <AuthGate
      onOpenWebRegister={() => undefined}
      onOpenWebSignIn={() => undefined}
      onRefresh={() => undefined}
      onRegisterWithPassword={jest.fn(async () => ({ email: "ada@example.com", ok: true }))}
      onRequestPasswordReset={jest.fn(async () => ({ email: "ada@example.com", ok: true }))}
      onRequestVerificationEmail={jest.fn(async () => ({ email: "ada@example.com", ok: true }))}
      onSignInWithPassword={jest.fn(async () => ({ ok: true }))}
      reason="auth-required"
    />,
  );
}

describe("mobile auth gate component rendering", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("uses the %s semantic auth background", async (scheme, theme) => {
    jest.spyOn(ReactNative, "useColorScheme").mockReturnValue(scheme);
    const view = await renderAuthGate();

    expect(
      StyleSheet.flatten(view.getByTestId("mobile-auth-screen").props.style).backgroundColor,
    ).toBe(theme.surface.base);
  });

  it("renders the missing-field validation error after a real sign-in submit press", async () => {
    const view = await renderAuthGate();

    await fireEvent.press(view.getByLabelText(copy.authNativeSignInAction));

    expect(view.getByText(copy.authNativeMissingFields)).toBeTruthy();
  });

  it("renders the invalid-email validation error after the user types an invalid address", async () => {
    const view = await renderAuthGate();

    await fireEvent.changeText(view.getByLabelText(copy.authNativeEmailLabel), "not-an-email");
    await fireEvent.changeText(view.getByLabelText(copy.authNativePasswordLabel), "long-enough");
    await fireEvent.press(view.getByLabelText(copy.authNativeSignInAction));

    expect(view.getByText(copy.authNativeInvalidEmail)).toBeTruthy();
  });

  it("renders the short-password validation error after the user submits a short password", async () => {
    const view = await renderAuthGate();

    await fireEvent.changeText(view.getByLabelText(copy.authNativeEmailLabel), "ada@example.com");
    await fireEvent.changeText(view.getByLabelText(copy.authNativePasswordLabel), "short");
    await fireEvent.press(view.getByLabelText(copy.authNativeSignInAction));

    expect(view.getByText(copy.authNativePasswordTooShort)).toBeTruthy();
  });
});
