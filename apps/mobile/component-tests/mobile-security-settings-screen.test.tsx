import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockUseMobileAuth = jest.fn();

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => mockUseMobileAuth(),
}));

jest.mock("../src/app/components/kit/bottom-sheet", () => {
  const ReactRuntime = require("react");
  const { View } = require("react-native");
  return {
    BottomSheet: ({
      children,
      open,
      testID,
    }: {
      children: React.ReactNode;
      open: boolean;
      testID: string;
    }) => (open ? ReactRuntime.createElement(View, { testID: `${testID}-panel` }, children) : null),
  };
});

import { MobileSecuritySettingsScreen } from "../src/app/screens/mobile-security-settings-screen";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";

const accountSettings = {
  account: {
    bio: null,
    customStatus: null,
    email: "ada@example.com",
    emailVerified: true,
    twoFactorEnabled: true,
  },
  privacy: { dmPermission: "FRIENDS" as const, friendRequests: "EVERYONE" as const },
};

const activeSession = {
  hasRefreshToken: true,
  hasSession: true,
  isExpired: false,
  scopeCount: 1,
  secondsUntilExpiry: 600,
  status: "signed-in" as const,
};

const authSessions = {
  sessions: [
    {
      appVersion: "0.8.15",
      browser: null,
      clientType: "MOBILE" as const,
      countryCode: "TR",
      createdAt: "2026-08-13T08:00:00.000Z",
      current: true,
      deviceType: "MOBILE" as const,
      expiresAt: "2026-09-12T08:00:00.000Z",
      id: "mobile-current",
      lastSeenAt: "2026-08-13T09:00:00.000Z",
      os: "Android",
    },
  ],
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Number.POSITIVE_INFINITY },
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
}

function createProps(
  overrides: Partial<React.ComponentProps<typeof MobileSecuritySettingsScreen>> = {},
) {
  return {
    appLockAvailability: "available" as const,
    appLockEnabled: false,
    isSignedIn: true,
    onBack: jest.fn(),
    onOpenTwoFactor: jest.fn(),
    onRefreshSession: jest.fn(),
    onSignOut: jest.fn(),
    onToggleAppLock: jest.fn(),
    sessionDiagnostics: activeSession,
    ...overrides,
  } satisfies React.ComponentProps<typeof MobileSecuritySettingsScreen>;
}

function renderScreen(
  overrides: Partial<React.ComponentProps<typeof MobileSecuritySettingsScreen>> = {},
) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <MobileSecuritySettingsScreen {...createProps(overrides)} />
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </QueryClientProvider>,
  );
}

function authenticatedApi(
  handler: (path: string, request?: { method?: string; body?: unknown }) => unknown = (path) =>
    path === "/api/v1/mobile/account/sessions" ? authSessions : accountSettings,
) {
  return { requestJson: jest.fn(handler) };
}

beforeEach(() => {
  mockUseMobileAuth.mockReset();
  mockUseMobileAuth.mockReturnValue({
    apiClient: authenticatedApi(),
    deviceIntegrityStatus: "clean",
    status: "signed-in",
  });
});

describe("secure session settings screen", () => {
  it("renders every section with the real session, device, and sign-in state", async () => {
    const view = await renderScreen();

    expect(view.getByTestId("mobile-security-settings-screen")).toBeTruthy();
    expect(view.getByText(copy.securitySettingsStatusSecureTitle)).toBeTruthy();
    expect(view.getByText(copy.securitySettingsSignInHeading)).toBeTruthy();
    expect(view.getByText(copy.securitySettingsDeviceHeading)).toBeTruthy();
    expect(view.getByText(copy.securitySettingsSessionHeading)).toBeTruthy();
    expect(view.getByText(copy.securitySettingsDeviceIntegrityClean)).toBeTruthy();
    expect(
      view.getByText(copy.securitySettingsSessionExpiryHint.replace("{minutes}", "10")),
    ).toBeTruthy();
    await waitFor(() => expect(view.getByText(copy.securitySettingsEmailVerified)).toBeTruthy());
    await waitFor(() => expect(view.getByText(copy.securitySettingsOn)).toBeTruthy());
  });

  it("warns when there is no usable session", async () => {
    const view = await renderScreen({
      isSignedIn: false,
      sessionDiagnostics: { ...activeSession, hasSession: false, secondsUntilExpiry: null },
    });

    expect(view.getByText(copy.securitySettingsStatusAttentionTitle)).toBeTruthy();
    expect(view.getByText(copy.securitySettingsSessionInactive)).toBeTruthy();
  });

  it("keeps only the still-unbacked recovery-code row marked as coming soon", async () => {
    const view = await renderScreen();

    expect(view.getByTestId("mobile-security-recovery-codes")).toBeTruthy();
    expect(view.queryByTestId("mobile-security-data-export")).toBeNull();
    expect(view.getAllByText(copy.securitySettingsSoon)).toHaveLength(1);
  });

  it("opens the real device list and signs out after revoking the current session", async () => {
    const onSignOut = jest.fn();
    const requestJson = jest.fn(async (path: string, options?: { method?: string }) => {
      if (path === "/api/v1/mobile/account/sessions") return authSessions;
      if (
        path === "/api/v1/mobile/account/sessions/mobile-current" &&
        options?.method === "DELETE"
      ) {
        return { currentSessionRevoked: true, revokedSessionId: "mobile-current" };
      }
      return accountSettings;
    });
    mockUseMobileAuth.mockReturnValue({
      apiClient: { requestJson },
      deviceIntegrityStatus: "clean",
      status: "signed-in",
    });
    const view = await renderScreen({ onSignOut });

    await waitFor(() => expect(view.getByTestId("mobile-security-active-devices")).toBeTruthy());
    await fireEvent.press(view.getByTestId("mobile-security-active-devices"));
    await waitFor(() =>
      expect(view.getByTestId("mobile-security-session-mobile-current")).toBeTruthy(),
    );
    await fireEvent.press(view.getByTestId("mobile-security-session-mobile-current"));
    await fireEvent.press(view.getByTestId("mobile-security-session-revoke"));
    expect(onSignOut).not.toHaveBeenCalled();
    await fireEvent.press(view.getByTestId("mobile-security-session-revoke-sheet-confirm"));

    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
  });

  it("opens two-factor, refreshes the session, and toggles the app lock", async () => {
    const onOpenTwoFactor = jest.fn();
    const onRefreshSession = jest.fn();
    const onToggleAppLock = jest.fn();
    const view = await renderScreen({ onOpenTwoFactor, onRefreshSession, onToggleAppLock });

    await fireEvent.press(view.getByTestId("mobile-settings-open-2fa"));
    await fireEvent.press(view.getByTestId("mobile-security-refresh-session"));
    await fireEvent.press(view.getByTestId("mobile-security-app-lock-toggle"));

    expect(onOpenTwoFactor).toHaveBeenCalledTimes(1);
    expect(onRefreshSession).toHaveBeenCalledTimes(1);
    expect(onToggleAppLock).toHaveBeenCalledWith(true);
    expect(view.getByText(copy.securitySettingsRefreshed)).toBeTruthy();
  });

  it("disables the app lock toggle when biometrics are unavailable", async () => {
    const view = await renderScreen({ appLockAvailability: "unavailable" });

    expect(view.getByText(copy.securitySettingsAppLockUnavailable)).toBeTruthy();
    expect(view.getByTestId("mobile-security-app-lock-toggle").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it("validates the password form before calling the API", async () => {
    const requestJson = jest.fn(async () => accountSettings);
    mockUseMobileAuth.mockReturnValue({
      apiClient: { requestJson },
      deviceIntegrityStatus: "clean",
      status: "signed-in",
    });
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId("mobile-security-change-password"));
    await fireEvent.changeText(
      view.getByTestId("mobile-security-current-password-input"),
      "old-secret",
    );
    await fireEvent.changeText(
      view.getByTestId("mobile-security-new-password-input"),
      "new-secret-1",
    );
    await fireEvent.changeText(
      view.getByTestId("mobile-security-confirm-password-input"),
      "mismatch-1",
    );
    await fireEvent.press(view.getByTestId("mobile-security-password-save"));

    await waitFor(() => expect(view.getByText(copy.securitySettingsPasswordMismatch)).toBeTruthy());
    expect(
      requestJson.mock.calls.some(([path]) => path === "/api/v1/mobile/account/password"),
    ).toBe(false);
  });

  it("submits a valid password change and reports success", async () => {
    const requestJson = jest.fn(async (path: string) =>
      path === "/api/v1/mobile/account/password" ? { success: true } : accountSettings,
    );
    mockUseMobileAuth.mockReturnValue({
      apiClient: { requestJson },
      deviceIntegrityStatus: "clean",
      status: "signed-in",
    });
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId("mobile-security-change-password"));
    await fireEvent.changeText(
      view.getByTestId("mobile-security-current-password-input"),
      "old-secret",
    );
    await fireEvent.changeText(
      view.getByTestId("mobile-security-new-password-input"),
      "new-secret-1",
    );
    await fireEvent.changeText(
      view.getByTestId("mobile-security-confirm-password-input"),
      "new-secret-1",
    );
    await fireEvent.press(view.getByTestId("mobile-security-password-save"));

    await waitFor(() => expect(view.getByTestId("mobile-security-password-success")).toBeTruthy());
    expect(requestJson).toHaveBeenCalledWith("/api/v1/mobile/account/password", {
      body: {
        confirmPassword: "new-secret-1",
        currentPassword: "old-secret",
        newPassword: "new-secret-1",
      },
      method: "POST",
    });
  });

  it("surfaces a rejected current password without closing the sheet", async () => {
    const requestJson = jest.fn(async (path: string) => {
      if (path === "/api/v1/mobile/account/password") {
        throw Object.assign(new Error("rejected"), { status: 401 });
      }
      return accountSettings;
    });
    mockUseMobileAuth.mockReturnValue({
      apiClient: { requestJson },
      deviceIntegrityStatus: "clean",
      status: "signed-in",
    });
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId("mobile-security-change-password"));
    await fireEvent.changeText(
      view.getByTestId("mobile-security-current-password-input"),
      "wrong-one",
    );
    await fireEvent.changeText(
      view.getByTestId("mobile-security-new-password-input"),
      "new-secret-1",
    );
    await fireEvent.changeText(
      view.getByTestId("mobile-security-confirm-password-input"),
      "new-secret-1",
    );
    await fireEvent.press(view.getByTestId("mobile-security-password-save"));

    await waitFor(() =>
      expect(view.getByText(copy.securitySettingsPasswordInvalidCurrent)).toBeTruthy(),
    );
    expect(view.getByTestId("mobile-security-password-sheet-panel")).toBeTruthy();
  });

  it("signs out only after the destructive confirmation", async () => {
    const onSignOut = jest.fn();
    const view = await renderScreen({ onSignOut });

    await fireEvent.press(view.getByTestId("mobile-security-sign-out"));
    expect(onSignOut).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(view.getByTestId("mobile-security-sign-out-sheet-confirm")).toBeTruthy(),
    );
    await fireEvent.press(view.getByTestId("mobile-security-sign-out-sheet-confirm"));

    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
  });
});
