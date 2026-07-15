import { readFileSync } from "node:fs";
import { join } from "node:path";

import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { Linking } from "react-native";

jest.mock("../src/config/environment", () => ({
  getMobileRuntimeConfig: jest.fn(),
}));

import { getMobileRuntimeConfig } from "../src/config/environment";
import { AuthRegisterScreen } from "../src/app/screens/auth/auth-register-screen";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { mobileCopy } from "../src/locale/mobile-copy";

const mockedRuntimeConfig = jest.mocked(getMobileRuntimeConfig);
const copy = mobileCopy.tr;

type RegisterInput = {
  confirmPassword: string;
  email: string;
  password: string;
  username: string;
};

function setRuntimeConfig() {
  mockedRuntimeConfig.mockReturnValue({
    apiUrl: "http://localhost:3000",
    environment: "development",
    releaseChannel: "development",
    sentryDsn: null,
    socketUrl: "http://localhost:3000",
    webUrl: "https://whispr.test",
  });
}

function isNestedWithin(node: { parent: unknown }, ancestor: unknown) {
  let current = node.parent;

  while (current && typeof current === "object" && "parent" in current) {
    if (current === ancestor) {
      return true;
    }

    current = (current as { parent: unknown }).parent;
  }

  return false;
}

function renderRegister(props?: Partial<React.ComponentProps<typeof AuthRegisterScreen>>) {
  return render(
    <MobileThemeProvider>
      <MobileLocaleProvider>
        <AuthRegisterScreen
          onBack={props?.onBack ?? jest.fn()}
          onRegister={
            props?.onRegister ??
            jest
              .fn<Promise<{ email: string; ok: true }>, [RegisterInput]>()
              .mockResolvedValue({ email: "user@example.com", ok: true })
          }
          onSignIn={props?.onSignIn ?? jest.fn()}
        />
      </MobileLocaleProvider>
    </MobileThemeProvider>,
  );
}

async function fillRegisterFields(
  view: Awaited<ReturnType<typeof render>>,
  values: Partial<Pick<RegisterInput, "confirmPassword" | "email" | "password" | "username">> = {},
) {
  await fireEvent.changeText(
    view.getByTestId("mobile-auth-register-username-input"),
    values.username ?? " wizard_user ",
  );
  await fireEvent.changeText(
    view.getByTestId("mobile-auth-register-email-input"),
    values.email ?? " User@Example.COM ",
  );
  await fireEvent.changeText(
    view.getByTestId("mobile-auth-register-password-input"),
    values.password ?? "safe-password",
  );
  await fireEvent.changeText(
    view.getByTestId("mobile-auth-register-confirm-password-input"),
    values.confirmPassword ?? values.password ?? "safe-password",
  );
}

async function acceptTerms(view: Awaited<ReturnType<typeof render>>) {
  await fireEvent.press(view.getByTestId("mobile-auth-register-terms"));
}

describe("AuthRegisterScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setRuntimeConfig();
  });

  it("uses the canonical 2a canvas and animated brand mark", async () => {
    const view = await renderRegister();

    expect(view.getByTestId("mobile-auth-register-screen-canonical-background-light")).toBeTruthy();
    expect(
      view.getByTestId("mobile-auth-register-top-bar-brand-mark", { includeHiddenElements: true }).props,
    ).toMatchObject({ height: 32, width: 32 });
  });

  it("keeps the primary action disabled without accepted terms when the form is valid", async () => {
    const onRegister = jest
      .fn<Promise<{ email: string; ok: true }>, [RegisterInput]>()
      .mockResolvedValue({ email: "user@example.com", ok: true });
    const view = await renderRegister({ onRegister });

    await fillRegisterFields(view);

    expect(view.getByTestId("mobile-auth-register-submit").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    await fireEvent.press(view.getByTestId("mobile-auth-register-submit"));

    expect(onRegister).not.toHaveBeenCalled();
  });

  it("rejects a password mismatch locally without dispatching registration", async () => {
    const onRegister = jest
      .fn<Promise<{ email: string; ok: true }>, [RegisterInput]>()
      .mockResolvedValue({ email: "user@example.com", ok: true });
    const view = await renderRegister({ onRegister });

    await fillRegisterFields(view, { confirmPassword: "different-password" });
    await acceptTerms(view);
    await fireEvent.press(view.getByTestId("mobile-auth-register-submit"));

    expect(await view.findByText(copy.authNativePasswordMismatch)).toBeTruthy();
    expect(onRegister).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than the server-compatible minimum without dispatching registration", async () => {
    const onRegister = jest
      .fn<Promise<{ email: string; ok: true }>, [RegisterInput]>()
      .mockResolvedValue({ email: "user@example.com", ok: true });
    const view = await renderRegister({ onRegister });

    await fillRegisterFields(view, { confirmPassword: "short7", password: "short7" });
    await acceptTerms(view);
    await fireEvent.press(view.getByTestId("mobile-auth-register-submit"));

    expect(await view.findByText(copy.authNativePasswordTooShort)).toBeTruthy();
    expect(onRegister).not.toHaveBeenCalled();
  });

  it("rejects a username outside the server-compatible format without dispatching registration", async () => {
    const onRegister = jest
      .fn<Promise<{ email: string; ok: true }>, [RegisterInput]>()
      .mockResolvedValue({ email: "user@example.com", ok: true });
    const view = await renderRegister({ onRegister });

    await fillRegisterFields(view, { username: "not valid" });
    await acceptTerms(view);
    await fireEvent.press(view.getByTestId("mobile-auth-register-submit"));

    expect(await view.findByText(copy.authNativeUsernameInvalid)).toBeTruthy();
    expect(onRegister).not.toHaveBeenCalled();
  });

  it("uses the localized username label without carrying the obsolete name-field copy", async () => {
    const view = await renderRegister();
    const source = readFileSync(
      join(process.cwd(), "src", "app", "screens", "auth", "auth-register-screen.tsx"),
      "utf8",
    );

    expect(view.getByTestId("mobile-auth-register-username-input").props.accessibilityLabel).toBe(
      copy.authUsernameFieldLabel,
    );
    expect(source).not.toContain("Ad Soyad");
    expect(source).not.toContain("Full Name");
  });

  it("submits the exact normalized registration payload and renders the returned verification notice", async () => {
    const onRegister = jest
      .fn<Promise<{ email: string; ok: true }>, [RegisterInput]>()
      .mockResolvedValue({ email: "verified@example.com", ok: true });
    const view = await renderRegister({ onRegister });

    await fillRegisterFields(view);
    await acceptTerms(view);
    await fireEvent.press(view.getByTestId("mobile-auth-register-submit"));

    await waitFor(() =>
      expect(onRegister).toHaveBeenCalledWith({
        confirmPassword: "safe-password",
        email: "user@example.com",
        password: "safe-password",
        username: "wizard_user",
      }),
    );
    expect(Object.keys(onRegister.mock.calls[0]![0]).sort()).toEqual([
      "confirmPassword",
      "email",
      "password",
      "username",
    ]);
    expect(
      await view.findByText(copy.authNativeVerificationNotice.replace("{email}", "verified@example.com")),
    ).toBeTruthy();
  });

  it("submits an accepted registration directly without rendering a human-verification card", async () => {
    const onRegister = jest
      .fn<Promise<{ email: string; ok: true }>, [RegisterInput]>()
      .mockResolvedValue({ email: "user@example.com", ok: true });
    const view = await renderRegister({ onRegister });

    await fillRegisterFields(view);
    await acceptTerms(view);
    await fireEvent.press(view.getByTestId("mobile-auth-register-submit"));

    expect(view.queryByTestId("mobile-auth-register-human-check")).toBeNull();
    await waitFor(() =>
      expect(onRegister).toHaveBeenCalledWith({
        confirmPassword: "safe-password",
        email: "user@example.com",
        password: "safe-password",
        username: "wizard_user",
      }),
    );
  });

  it("keeps Terms and Privacy links outside the checkbox target while retaining their roles and toggle", async () => {
    const view = await renderRegister();
    const checkbox = view.getByTestId("mobile-auth-register-terms");
    const termsLink = view.getByTestId("mobile-auth-register-terms-link");
    const privacyLink = view.getByTestId("mobile-auth-register-privacy-link");

    expect(checkbox.props.accessibilityRole).toBe("checkbox");
    expect(checkbox.props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
    expect(termsLink.props.accessibilityRole).toBe("link");
    expect(privacyLink.props.accessibilityRole).toBe("link");
    expect(isNestedWithin(termsLink, checkbox)).toBe(false);
    expect(isNestedWithin(privacyLink, checkbox)).toBe(false);

    await fireEvent.press(checkbox);

    expect(view.getByTestId("mobile-auth-register-terms").props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );
  });

  it("opens the exact safe runtime Terms and Privacy Policy targets", async () => {
    const openUrl = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const view = await renderRegister();

    await fireEvent.press(view.getByTestId("mobile-auth-register-terms-link"));
    await fireEvent.press(view.getByTestId("mobile-auth-register-privacy-link"));

    await waitFor(() =>
      expect(openUrl).toHaveBeenNthCalledWith(1, "https://whispr.test/terms"),
    );
    expect(openUrl).toHaveBeenNthCalledWith(2, "https://whispr.test/privacy");
  });

  it("exposes a busy disabled state and prevents a second registration request while the first is pending", async () => {
    let resolveRegister!: (value: { email: string; ok: true }) => void;
    const pendingRegister = new Promise<{ email: string; ok: true }>((resolve) => {
      resolveRegister = resolve;
    });
    const onRegister = jest.fn<Promise<{ email: string; ok: true }>, [RegisterInput]>().mockReturnValue(pendingRegister);
    const view = await renderRegister({ onRegister });

    await fillRegisterFields(view);
    await acceptTerms(view);
    await fireEvent.press(view.getByTestId("mobile-auth-register-submit"));
    await fireEvent.press(view.getByTestId("mobile-auth-register-submit"));

    expect(onRegister).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("mobile-auth-register-submit").props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true, disabled: true }),
    );

    await act(async () => {
      resolveRegister({ email: "verified@example.com", ok: true });
      await pendingRegister;
    });
  });
});
