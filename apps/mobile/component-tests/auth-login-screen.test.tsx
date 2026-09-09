import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";

import { AuthLoginScreen } from "../src/app/screens/auth/auth-login-screen";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { mobileCopy } from "../src/locale/mobile-copy";

const copy = mobileCopy.tr;

type SocialSignInResult = Awaited<
  ReturnType<React.ComponentProps<typeof AuthLoginScreen>["onSocialSignIn"]>
>;

type SignInInput = {
  email: string;
  password: string;
  twoFactorCode?: string;
};

function renderLogin(props?: Partial<React.ComponentProps<typeof AuthLoginScreen>>) {
  return render(
    <MobileThemeProvider>
      <MobileLocaleProvider>
        <AuthLoginScreen
          developmentCredentials={props?.developmentCredentials}
          onForgotPassword={props?.onForgotPassword ?? jest.fn()}
          onOpenLanguagePicker={props?.onOpenLanguagePicker ?? jest.fn()}
          onRegister={props?.onRegister ?? jest.fn()}
          onSignIn={
            props?.onSignIn ??
            jest.fn<Promise<{ ok: true }>, [SignInInput]>().mockResolvedValue({ ok: true })
          }
          onSocialSignIn={
            props?.onSocialSignIn ??
            jest
              .fn<Promise<SocialSignInResult>, ["google"]>()
              .mockResolvedValue({ ok: true, via: "in-app" })
          }
        />
      </MobileLocaleProvider>
    </MobileThemeProvider>,
  );
}

async function fillValidCredentials(view: Awaited<ReturnType<typeof render>>) {
  await fireEvent.changeText(
    view.getByTestId("mobile-auth-login-email-input"),
    " User@Example.COM ",
  );
  await fireEvent.changeText(view.getByTestId("mobile-auth-login-password-input"), "safe-password");
  await waitFor(() =>
    expect(view.getByTestId("mobile-auth-login-email-input").props.value).toBe(
      " User@Example.COM ",
    ),
  );
  await waitFor(() =>
    expect(view.getByTestId("mobile-auth-login-password-input").props.value).toBe("safe-password"),
  );
}

function resolvePressableStyle(style: unknown) {
  if (typeof style === "function") {
    return StyleSheet.flatten(style({ focused: false, hovered: false, pressed: false }));
  }

  return StyleSheet.flatten(style);
}

describe("AuthLoginScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses the canonical 2a canvas, animated brand mark, and compact configured social grid", async () => {
    const view = await renderLogin();

    expect(view.getByTestId("mobile-auth-login-screen-canonical-background-light")).toBeTruthy();
    /*
     * SPEC-GIRIS-KAYIT §6/1 — karsilama ekrani kalktigi icin giris yigin koku (K4): geri
     * satiri yok, basligin ustunde dil secici durur.
     */
    expect(view.queryByTestId("mobile-auth-login-top-bar")).toBeNull();
    expect(view.getByTestId("mobile-auth-login-language")).toBeTruthy();
    expect(
      resolvePressableStyle(view.getByTestId("mobile-auth-social-google").props.style),
    ).toEqual(expect.objectContaining({ flexBasis: 0, flexGrow: 1, height: 48, maxWidth: 78 }));
    expect(view.queryByText(copy.authSocialGoogle)).toBeNull();
  });

  it("keeps the login footer independent from the scrollable form layout", async () => {
    const view = await renderLogin();

    expect(
      resolvePressableStyle(view.getByTestId("mobile-auth-login-main-content").props.style),
    ).toEqual(expect.objectContaining({ flexGrow: 1, paddingBottom: 18, paddingTop: 18 }));
    expect(resolvePressableStyle(view.getByTestId("mobile-auth-login-footer").props.style)).toEqual(
      expect.objectContaining({ paddingBottom: 26, paddingTop: 14 }),
    );
  });

  it("fails locally for empty required credentials without dispatching sign-in", async () => {
    const onSignIn = jest
      .fn<Promise<{ ok: true }>, [SignInInput]>()
      .mockResolvedValue({ ok: true });
    const view = await renderLogin({ onSignIn });

    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));

    expect(await view.findByText(copy.authNativeMissingFields)).toBeTruthy();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it("normalizes before rejecting an invalid email without dispatching sign-in", async () => {
    const onSignIn = jest
      .fn<Promise<{ ok: true }>, [SignInInput]>()
      .mockResolvedValue({ ok: true });
    const view = await renderLogin({ onSignIn });

    await fireEvent.changeText(view.getByTestId("mobile-auth-login-email-input"), "invalid-email");
    await fireEvent.changeText(
      view.getByTestId("mobile-auth-login-password-input"),
      "safe-password",
    );
    await waitFor(() =>
      expect(view.getByTestId("mobile-auth-login-email-input").props.value).toBe("invalid-email"),
    );
    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));

    expect(await view.findByText(copy.authNativeInvalidEmail)).toBeTruthy();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it("submits valid credentials directly without rendering a human-verification card", async () => {
    const onSignIn = jest
      .fn<Promise<{ ok: true }>, [SignInInput]>()
      .mockResolvedValue({ ok: true });
    const view = await renderLogin({ onSignIn });

    await fillValidCredentials(view);
    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));

    expect(view.queryByTestId("mobile-auth-login-human-check")).toBeNull();
    await waitFor(() =>
      expect(onSignIn).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "safe-password",
      }),
    );
  });

  it("leaves the second step to its own route instead of an inline code field", async () => {
    const onSignIn = jest
      .fn<
        Promise<{ message: string; ok: false; requiresTwoFactor: true } | { ok: true }>,
        [SignInInput]
      >()
      .mockResolvedValue({
        message: "2FA is required for this account.",
        ok: false,
        requiresTwoFactor: true,
      });
    const view = await renderLogin({ onSignIn });

    await fillValidCredentials(view);
    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));

    await waitFor(() => expect(onSignIn).toHaveBeenCalledTimes(1));
    /*
     * SPEC-GIRIS-KAYIT §4.2 ve K2 — konteyner ikinci adim rotasina gecer. Ekran ne kod alani
     * acar ne de hata gosterir; yoksa kullanici hem yonlendirilir hem kirmizi bant gorurdu.
     */
    expect(view.queryByTestId("mobile-auth-login-two-factor-code-input")).toBeNull();
    expect(view.queryByText("2FA is required for this account.")).toBeNull();
    expect(view.queryByTestId("mobile-auth-login-error")).toBeNull();
  });

  it("disables repeated sign-in presses while the current request is pending", async () => {
    let resolveSignIn!: (value: { ok: true }) => void;
    const pendingSignIn = new Promise<{ ok: true }>((resolve) => {
      resolveSignIn = resolve;
    });
    const onSignIn = jest.fn<Promise<{ ok: true }>, [SignInInput]>().mockReturnValue(pendingSignIn);
    const view = await renderLogin({ onSignIn });

    await fillValidCredentials(view);
    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));
    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));

    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("mobile-auth-login-submit").props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true, disabled: true }),
    );

    await act(async () => {
      resolveSignIn({ ok: true });
      await pendingSignIn;
    });
  });

  it("completes the in-app Google session without printing a browser hand-off hint", async () => {
    const onSocialSignIn = jest
      .fn<Promise<SocialSignInResult>, ["google"]>()
      .mockResolvedValue({ ok: true, via: "in-app" });
    const view = await renderLogin({ onSocialSignIn });

    await fireEvent.press(view.getByTestId("mobile-auth-social-google"));

    expect(onSocialSignIn).toHaveBeenCalledTimes(1);
    expect(onSocialSignIn).toHaveBeenCalledWith("google");
    await waitFor(() => expect(view.queryByTestId("mobile-auth-login-notice")).toBeNull());
    expect(view.queryByTestId("mobile-auth-login-error")).toBeNull();
  });

  it("hints at the browser hand-off only when the in-app session is unavailable", async () => {
    const onSocialSignIn = jest
      .fn<Promise<SocialSignInResult>, ["google"]>()
      .mockResolvedValue({ ok: true, via: "external-browser" });
    const view = await renderLogin({ onSocialSignIn });

    await fireEvent.press(view.getByTestId("mobile-auth-social-google"));

    await waitFor(() =>
      expect(view.getByTestId("mobile-auth-login-notice").props.children).toBe(
        copy.authSocialRedirectNotice,
      ),
    );
  });

  it("keeps a cancelled consent sheet silent instead of raising an error", async () => {
    const onSocialSignIn = jest
      .fn<Promise<SocialSignInResult>, ["google"]>()
      .mockResolvedValue({ ok: false, reason: "cancelled" });
    const view = await renderLogin({ onSocialSignIn });

    await fireEvent.press(view.getByTestId("mobile-auth-social-google"));

    await waitFor(() => expect(onSocialSignIn).toHaveBeenCalledTimes(1));
    expect(view.queryByTestId("mobile-auth-login-error")).toBeNull();
    expect(view.queryByTestId("mobile-auth-login-notice")).toBeNull();
  });

  it("previews the unwired providers without dispatching an OAuth session", async () => {
    const onSocialSignIn = jest
      .fn<Promise<SocialSignInResult>, ["google"]>()
      .mockResolvedValue({ ok: true, via: "in-app" });
    const view = await renderLogin({ onSocialSignIn });

    for (const provider of ["microsoft", "apple", "discord"] as const) {
      expect(view.getByTestId(`mobile-auth-social-${provider}`)).toBeTruthy();
    }

    await fireEvent.press(view.getByTestId("mobile-auth-social-discord"));

    expect(onSocialSignIn).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(view.getByTestId("mobile-auth-login-notice").props.children).toBe(
        copy.authSocialProviderComingSoon.replace("{provider}", "Discord"),
      ),
    );
  });

  it("surfaces a recoverable error when the Google session fails", async () => {
    const onSocialSignIn = jest
      .fn<Promise<SocialSignInResult>, ["google"]>()
      .mockResolvedValue({ ok: false, reason: "failed" });
    const view = await renderLogin({ onSocialSignIn });

    await fireEvent.press(view.getByTestId("mobile-auth-social-google"));

    await waitFor(() =>
      expect(view.getByTestId("mobile-auth-login-error").props.children).toBe(
        copy.authSocialSignInFailed,
      ),
    );
  });

  it("keeps the forgot action in the password label row", async () => {
    const view = await renderLogin();

    expect(view.getByTestId("mobile-auth-login-forgot-password").parent).toBe(
      view.getByText(copy.authNativePasswordLabel).parent,
    );
  });

  it("keeps the remember-me checkbox as the only control under the password row", async () => {
    const view = await renderLogin();

    // K2: satir ici 2FA baglantisi kaldirildi; kutu tek basina kaldi.
    expect(view.queryByTestId("mobile-auth-login-two-factor-link")).toBeNull();
    const rememberMe = view.getByTestId("mobile-auth-login-remember-me");

    expect(rememberMe.props.accessibilityRole).toBe("checkbox");
    expect(rememberMe.props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false }),
    );

    await fireEvent.press(rememberMe);
    expect(view.getByTestId("mobile-auth-login-remember-me").props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );
  });

  it("uses the supplied multicolor Google mark instead of recoloring it with a Whispr token", async () => {
    const view = await renderLogin();

    expect(
      view.getByTestId("mobile-auth-social-google-icon", { includeHiddenElements: true }).props,
    ).toMatchObject({ height: 20, width: 20 });
  });

  it("sends exactly the normalized credential pair and nothing else", async () => {
    const onSignIn = jest
      .fn<Promise<{ ok: true }>, [SignInInput]>()
      .mockResolvedValue({ ok: true });
    const view = await renderLogin({ onSignIn });

    // K1: telefon alani yok, K4: profil secici yok — yuk iki alandan ibaret.
    expect(view.queryByTestId("mobile-auth-login-profile")).toBeNull();
    await fillValidCredentials(view);
    await fireEvent.press(view.getByTestId("mobile-auth-login-submit"));

    await waitFor(() => expect(onSignIn).toHaveBeenCalledTimes(1));
    expect(Object.keys(onSignIn.mock.calls[0]![0])).toEqual(["email", "password"]);
    expect(onSignIn).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "safe-password",
    });
  });

  it("opens the language picker from the header trigger", async () => {
    const onOpenLanguagePicker = jest.fn();
    const view = await renderLogin({ onOpenLanguagePicker });

    await fireEvent.press(view.getByTestId("mobile-auth-login-language"));

    expect(onOpenLanguagePicker).toHaveBeenCalledTimes(1);
  });

  it("pre-fills development credentials on mount so UAT testing skips manual entry", async () => {
    const view = await renderLogin({
      developmentCredentials: {
        email: "dev@example.com",
        password: "development-password",
      },
    });

    await waitFor(() =>
      expect(view.getByTestId("mobile-auth-login-email-input").props.value).toBe("dev@example.com"),
    );
    expect(view.getByTestId("mobile-auth-login-password-input").props.value).toBe(
      "development-password",
    );

    // The explicit fill action remains available and re-applies the credentials
    // with confirmation feedback.
    await fireEvent.press(view.getByTestId("mobile-auth-login-fill-dev-credentials"));
    expect(view.getByText(copy.authNativeDevCredentialsFilled)).toBeTruthy();
  });

  it("does not render the development credential action without a container-supplied value", async () => {
    const view = await renderLogin();

    expect(view.queryByTestId("mobile-auth-login-fill-dev-credentials")).toBeNull();
  });
});
