import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { AuthForgotPasswordScreen } from "../src/app/screens/auth/auth-forgot-password-screen";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { lightTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";

type PasswordResetInput = { email: string };
type PasswordResetResult =
  | { email: string; ok: true; resetLinkTtlMinutes?: number }
  | { message: string; ok: false };

const copy = mobileCopy.tr;

function renderForgotPassword(
  props?: Partial<React.ComponentProps<typeof AuthForgotPasswordScreen>>,
) {
  return render(
    <MobileThemeProvider>
      <MobileLocaleProvider>
        <AuthForgotPasswordScreen
          onBack={props?.onBack ?? jest.fn()}
          onRequestPasswordReset={
            props?.onRequestPasswordReset ??
            jest
              .fn<Promise<PasswordResetResult>, [PasswordResetInput]>()
              .mockResolvedValue({ email: "user@example.com", ok: true })
          }
        />
      </MobileLocaleProvider>
    </MobileThemeProvider>,
  );
}

async function submitEmail(
  view: Awaited<ReturnType<typeof render>>,
  email = " User@Example.COM ",
) {
  await fireEvent.changeText(view.getByTestId("mobile-auth-forgot-email-input"), email);
  await waitFor(() =>
    expect(view.getByTestId("mobile-auth-forgot-email-input").props.value).toBe(email),
  );
  await fireEvent.press(view.getByTestId("mobile-auth-forgot-submit"));
}

async function submitEmailWithFakeTimers(
  view: Awaited<ReturnType<typeof render>>,
  email = " User@Example.COM ",
) {
  await act(async () => {
    fireEvent.changeText(view.getByTestId("mobile-auth-forgot-email-input"), email);
  });
  await act(async () => {
    fireEvent.press(view.getByTestId("mobile-auth-forgot-submit"));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("AuthForgotPasswordScreen", () => {
  afterEach(async () => {
    await cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("uses the canonical 2a canvas and animated brand mark", async () => {
    const view = await renderForgotPassword();

    expect(view.getByTestId("mobile-auth-forgot-password-screen-canonical-background-light")).toBeTruthy();
    expect(
      view.getByTestId("mobile-auth-forgot-top-bar-brand-mark", { includeHiddenElements: true }).props,
    ).toMatchObject({ height: 32, width: 32 });
  });

  it("shows the 30-minute encrypted-data assurance from the canonical reset screen", async () => {
    const view = await renderForgotPassword();

    expect(view.getByTestId("mobile-auth-forgot-security-info")).toBeTruthy();
    expect(view.getByText(copy.authForgotInfoTtlTemplate.replace("{minutes}", "30"))).toBeTruthy();
  });

  it("switches the icon card to the semantic success treatment after a successful reset", async () => {
    const onRequestPasswordReset = jest
      .fn<Promise<PasswordResetResult>, [PasswordResetInput]>()
      .mockResolvedValue({ email: "user@example.com", ok: true });
    const view = await renderForgotPassword({ onRequestPasswordReset });

    await submitEmail(view);
    await waitFor(() => expect(view.getByText(copy.authForgotSuccessTitle)).toBeTruthy());

    expect(onRequestPasswordReset).toHaveBeenCalledWith({ email: "user@example.com" });
    expect(view.getByText(copy.authForgotSuccessTitle)).toBeTruthy();
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-auth-forgot-icon-card").props.style),
    ).toEqual(
      expect.objectContaining({
        backgroundColor: lightTheme.status.successSoft,
        borderColor: lightTheme.status.success,
      }),
    );
    expect(
      view.getByTestId("mobile-auth-forgot-success-icon", { includeHiddenElements: true }).props.color,
    ).toBe(
      lightTheme.status.success,
    );
  });

  it("pins the top bar while vertically centering the reset content with named layout roles", async () => {
    const view = await renderForgotPassword();

    expect(
      StyleSheet.flatten(view.getByTestId("mobile-auth-forgot-password-screen-content").props.style),
    ).toEqual(expect.objectContaining({ flex: 1 }));
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-auth-forgot-top-section").props.style),
    ).toEqual(expect.objectContaining({ paddingHorizontal: lightTheme.spacing.page }));
    expect(StyleSheet.flatten(view.getByTestId("mobile-auth-forgot-content").props.style)).toEqual(
      expect.objectContaining({
        flex: 1,
        justifyContent: "center",
        paddingBottom: lightTheme.layout.auth.forgotContentPaddingBottom,
        paddingHorizontal: lightTheme.layout.auth.forgotContentPaddingHorizontal,
      }),
    );
  });

  it("renders the response TTL exactly and never falls back to a literal reset duration", async () => {
    const source = readFileSync(
      join(process.cwd(), "src", "app", "screens", "auth", "auth-forgot-password-screen.tsx"),
      "utf8",
    );
    const withTtl = await renderForgotPassword({
      onRequestPasswordReset: jest
        .fn<Promise<PasswordResetResult>, [PasswordResetInput]>()
        .mockResolvedValue({ email: "user@example.com", ok: true, resetLinkTtlMinutes: 47 }),
    });

    await submitEmail(withTtl);
    await waitFor(() => expect(withTtl.getByTestId("mobile-auth-forgot-ttl-banner")).toBeTruthy());

    expect(withTtl.getByTestId("mobile-auth-forgot-ttl-banner")).toBeTruthy();
    expect(
      withTtl.getByText(copy.authForgotInfoTtlTemplate.replace("{minutes}", "47")),
    ).toBeTruthy();
    expect(source).not.toContain("30 dakika");
    expect(source).not.toContain("30 minutes");

    const withoutTtl = await renderForgotPassword({
      onRequestPasswordReset: jest
        .fn<Promise<PasswordResetResult>, [PasswordResetInput]>()
        .mockResolvedValue({ email: "user@example.com", ok: true }),
    });

    await submitEmail(withoutTtl);
    await waitFor(() => expect(withoutTtl.getByTestId("mobile-auth-forgot-resend")).toBeTruthy());

    expect(withoutTtl.queryByTestId("mobile-auth-forgot-ttl-banner")).toBeNull();
  });

  it("blocks resend during the 60-second cooldown and later resends only the normalized requested email", async () => {
    const onRequestPasswordReset = jest
      .fn<Promise<PasswordResetResult>, [PasswordResetInput]>()
      .mockResolvedValue({ email: "user@example.com", ok: true });
    const view = await renderForgotPassword({ onRequestPasswordReset });
    jest.useFakeTimers();

    await submitEmailWithFakeTimers(view);
    expect(view.getByTestId("mobile-auth-forgot-resend").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(
      view.getByText(copy.authForgotResendCooldownTemplate.replace("{seconds}", "60")),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-auth-forgot-resend"));
      fireEvent.press(view.getByTestId("mobile-auth-forgot-resend"));
    });
    expect(onRequestPasswordReset).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(view.getByText(copy.authForgotResendAction)).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-auth-forgot-resend"));
    });
    expect(onRequestPasswordReset).toHaveBeenCalledTimes(2);
    expect(onRequestPasswordReset).toHaveBeenLastCalledWith({ email: "user@example.com" });
  });

  it("renders indistinguishable success UI for registered- and unregistered-looking successful responses", async () => {
    const onRequestPasswordReset = jest
      .fn<Promise<PasswordResetResult>, [PasswordResetInput]>()
      .mockResolvedValueOnce({ email: "registered@example.com", ok: true })
      .mockResolvedValueOnce({ email: "unregistered@example.com", ok: true });
    const view = await renderForgotPassword({ onRequestPasswordReset });
    jest.useFakeTimers();

    await submitEmailWithFakeTimers(view);
    const registeredSummary = {
      emailInputVisible: Boolean(view.queryByTestId("mobile-auth-forgot-email-input")),
      initialIconVisible: Boolean(view.queryByTestId("mobile-auth-forgot-key-icon")),
      successIconVisible: Boolean(
        view.queryByTestId("mobile-auth-forgot-success-icon", { includeHiddenElements: true }),
      ),
      successTitle: view.getByText(copy.authForgotSuccessTitle).props.children,
    };

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-auth-forgot-resend"));
      await Promise.resolve();
      await Promise.resolve();
    });
    const unregisteredSummary = {
      emailInputVisible: Boolean(view.queryByTestId("mobile-auth-forgot-email-input")),
      initialIconVisible: Boolean(view.queryByTestId("mobile-auth-forgot-key-icon")),
      successIconVisible: Boolean(
        view.queryByTestId("mobile-auth-forgot-success-icon", { includeHiddenElements: true }),
      ),
      successTitle: view.getByText(copy.authForgotSuccessTitle).props.children,
    };

    expect(onRequestPasswordReset).toHaveBeenNthCalledWith(1, { email: "user@example.com" });
    expect(onRequestPasswordReset).toHaveBeenNthCalledWith(2, { email: "user@example.com" });
    expect(registeredSummary).toEqual(unregisteredSummary);
  });

  it("validates locally, renders only generic caught errors, and calls back once", async () => {
    const onBack = jest.fn();
    const onRequestPasswordReset = jest
      .fn<Promise<PasswordResetResult>, [PasswordResetInput]>()
      .mockRejectedValue(new Error("private upstream failure"));
    const view = await renderForgotPassword({ onBack, onRequestPasswordReset });

    await fireEvent.press(view.getByTestId("mobile-auth-forgot-submit"));
    expect(view.getByText(copy.authNativeMissingFields)).toBeTruthy();

    await submitEmail(view, "not-an-email");
    expect(view.getByText(copy.authNativeInvalidEmail)).toBeTruthy();
    expect(onRequestPasswordReset).not.toHaveBeenCalled();

    await submitEmail(view);
    await waitFor(() => expect(view.getByText(copy.authNativeGenericError)).toBeTruthy());
    expect(view.getByText(copy.authNativeGenericError)).toBeTruthy();
    expect(view.queryByText("private upstream failure")).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-auth-forgot-back-to-sign-in"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("uses the generic fallback for an empty callback message and renders a safe nonempty message", async () => {
    const onRequestPasswordReset = jest
      .fn<Promise<PasswordResetResult>, [PasswordResetInput]>()
      .mockResolvedValueOnce({ message: "", ok: false })
      .mockResolvedValueOnce({ message: "Please try again later.", ok: false });
    const view = await renderForgotPassword({ onRequestPasswordReset });
    const source = readFileSync(
      join(process.cwd(), "src", "app", "screens", "auth", "auth-forgot-password-screen.tsx"),
      "utf8",
    );

    await submitEmail(view);
    await waitFor(() => expect(view.getByText(copy.authNativeGenericError)).toBeTruthy());

    await submitEmail(view, "another@example.com");
    await waitFor(() => expect(view.getByText("Please try again later.")).toBeTruthy());

    expect(onRequestPasswordReset).toHaveBeenNthCalledWith(1, { email: "user@example.com" });
    expect(onRequestPasswordReset).toHaveBeenNthCalledWith(2, { email: "another@example.com" });
    expect(source).not.toMatch(/registered|unregistered|known account|unknown account/i);
  });

  it("dedupes pending requests and clears its countdown interval after unmount", async () => {
    let resolveReset!: (value: PasswordResetResult) => void;
    const pendingReset = new Promise<PasswordResetResult>((resolve) => {
      resolveReset = resolve;
    });
    const onRequestPasswordReset = jest
      .fn<Promise<PasswordResetResult>, [PasswordResetInput]>()
      .mockReturnValue(pendingReset);
    const view = await renderForgotPassword({ onRequestPasswordReset });
    jest.useFakeTimers();
    const clearIntervalSpy = jest.spyOn(global, "clearInterval");

    await submitEmailWithFakeTimers(view, "user@example.com");
    await fireEvent.press(view.getByTestId("mobile-auth-forgot-submit"));
    expect(onRequestPasswordReset).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("mobile-auth-forgot-submit").props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true, disabled: true }),
    );

    await act(async () => {
      resolveReset({ email: "user@example.com", ok: true });
      await pendingReset;
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.getByTestId("mobile-auth-forgot-resend")).toBeTruthy();
    await act(async () => {
      view.unmount();
    });

    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
