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

import { MobileProfileStatusCard } from "../src/social/mobile-profile-status-card";
import { ToastProvider } from "../src/app/components/kit/toast";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";

const account = {
  bannerColor: null,
  bannerUrl: null,
  bio: null,
  customStatus: null,
  customStatusEmoji: null,
  customStatusExpiresAt: null,
  email: "ada@example.com",
  emailVerified: true,
  nextUsernameChangeAt: null,
  pronouns: null,
  twoFactorEnabled: false,
};

const savedProfile = {
  avatarUrl: null,
  bannerColor: null,
  bannerUrl: null,
  bio: null,
  customStatus: null,
  customStatusEmoji: null,
  customStatusExpiresAt: null,
  displayName: "Ada Lovelace",
  id: "user-1",
  nextUsernameChangeAt: null,
  pronouns: null,
  status: "ONLINE" as const,
  twoFactorEnabled: false,
  username: "ada",
};

function accountSettings(overrides: Partial<typeof account> = {}) {
  return {
    account: { ...account, ...overrides },
    privacy: { dmPermission: "FRIENDS" as const, friendRequests: "EVERYONE" as const },
  };
}

function createQueryClient(settings = accountSettings()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Number.POSITIVE_INFINITY },
      queries: {
        gcTime: Number.POSITIVE_INFINITY,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  queryClient.setQueryData(mobileQueryKeys.accountSettings(), settings);
  return queryClient;
}

function profilePatchApi(settings = accountSettings()) {
  return jest.fn(async (path: string, request?: { body?: unknown; method?: string }) => {
    if (path === "/api/v1/mobile/account/profile" && request?.method === "PATCH") {
      return { user: { ...savedProfile, ...(request.body as Record<string, unknown>) } };
    }
    return settings;
  });
}

function authenticatedApi(requestJson: jest.Mock) {
  mockUseMobileAuth.mockReturnValue({
    apiClient: { requestJson },
    replaceSessionUser: jest.fn(async () => true),
    session: { user: savedProfile },
    status: "signed-in",
  });
}

function renderCard(
  queryClient: QueryClient,
  overrides: Partial<React.ComponentProps<typeof MobileProfileStatusCard>> = {},
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <ToastProvider>
            <MobileProfileStatusCard
              locale="tr"
              onOpenPresencePicker={jest.fn()}
              presence="ONLINE"
              presenceDisabled={false}
              presenceError={null}
              {...overrides}
            />
          </ToastProvider>
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </QueryClientProvider>,
  );
}

describe("mobile profile status card", () => {
  beforeEach(() => {
    mockUseMobileAuth.mockReset();
  });

  it("renders the status message field, the auto-clear menu and the presence row", async () => {
    authenticatedApi(profilePatchApi());
    const view = await renderCard(createQueryClient());

    expect(view.getByTestId("mobile-profile-status-card")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-status-input")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-status-expiry-open")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-status-expiry-notice")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-presence-open")).toBeTruthy();
    // The five durations live behind the menu now, not in a chip row.
    expect(view.queryByTestId("mobile-profile-status-expiry-4h")).toBeNull();
  });

  it("keeps the picked duration from the menu", async () => {
    authenticatedApi(profilePatchApi());
    const view = await renderCard(createQueryClient());

    await fireEvent.press(view.getByTestId("mobile-profile-status-expiry-open"));
    await fireEvent.press(view.getByTestId("mobile-profile-status-expiry-1h"));

    // Sheet closes and the trigger reports the new value.
    expect(view.queryByTestId("mobile-profile-status-expiry-sheet-panel")).toBeNull();
    expect(
      view.getByTestId("mobile-profile-status-expiry-open").props.accessibilityValue,
    ).toMatchObject({ text: "1 saat" });
  });

  it("names the moment for Bugün instead of pasting it into the duration template", async () => {
    authenticatedApi(profilePatchApi());
    const view = await renderCard(createQueryClient());

    await fireEvent.press(view.getByTestId("mobile-profile-status-expiry-open"));
    await fireEvent.press(view.getByTestId("mobile-profile-status-expiry-today"));

    expect(view.getByTestId("mobile-profile-status-expiry-notice").props.children).toBe(
      "Bugün gün sonunda otomatik temizlenir",
    );
  });

  // The hub has no header chip, so the card grows one only once the draft moved.
  it("shows Kaydet only once the status draft differs from the saved status", async () => {
    authenticatedApi(profilePatchApi());
    const view = await renderCard(createQueryClient());

    expect(view.queryByTestId("mobile-profile-status-save")).toBeNull();

    await fireEvent.changeText(view.getByTestId("mobile-profile-status-input"), "Toplantıda");

    expect(view.getByTestId("mobile-profile-status-save")).toBeTruthy();
  });

  it("converts the picked duration into an absolute expiry on save", async () => {
    const requestJson = profilePatchApi();
    authenticatedApi(requestJson);
    const view = await renderCard(createQueryClient());

    await fireEvent.changeText(view.getByTestId("mobile-profile-status-input"), "Release notları");
    await fireEvent.press(view.getByTestId("mobile-profile-status-expiry-open"));
    await fireEvent.press(view.getByTestId("mobile-profile-status-expiry-4h"));
    await fireEvent.press(view.getByTestId("mobile-profile-status-save"));

    await waitFor(() => expect(requestJson).toHaveBeenCalled());
    const patch = requestJson.mock.calls.find(
      ([path, request]) =>
        path === "/api/v1/mobile/account/profile" &&
        (request as { method?: string } | undefined)?.method === "PATCH",
    )?.[1] as { body: { customStatus: string; customStatusExpiresAt: string } };

    expect(patch.body.customStatus).toBe("Release notları");
    expect(Date.parse(patch.body.customStatusExpiresAt) - Date.now()).toBeGreaterThan(
      3.9 * 60 * 60 * 1000,
    );
  });

  // The hub sends the same profile PATCH as the 2a editor, so it confirms the same way.
  it("confirms a saved status message with the profile-updated toast", async () => {
    authenticatedApi(profilePatchApi());
    const view = await renderCard(createQueryClient());

    await fireEvent.changeText(view.getByTestId("mobile-profile-status-input"), "Toplantıda");
    await fireEvent.press(view.getByTestId("mobile-profile-status-save"));

    await waitFor(() => expect(view.getByTestId("mobile-toast")).toBeTruthy());
    expect(view.getByText("Profil güncellendi.")).toBeTruthy();
    expect(view.getByTestId("mobile-toast-tone-success")).toBeTruthy();
  });

  it("stays quiet when the save fails", async () => {
    const requestJson = jest.fn(async (path: string, request?: { method?: string }) => {
      if (path === "/api/v1/mobile/account/profile" && request?.method === "PATCH") {
        throw new Error("boom");
      }
      return accountSettings();
    });
    authenticatedApi(requestJson);
    const view = await renderCard(createQueryClient());

    await fireEvent.changeText(view.getByTestId("mobile-profile-status-input"), "Toplantıda");
    await fireEvent.press(view.getByTestId("mobile-profile-status-save"));

    await waitFor(() => expect(view.getByTestId("mobile-profile-status-error")).toBeTruthy());
    expect(view.queryByText("Profil güncellendi.")).toBeNull();
  });

  it("clears the emoji and the deadline along with the message", async () => {
    const requestJson = profilePatchApi(
      accountSettings({
        customStatus: "Release notları",
        customStatusEmoji: "🚀",
        customStatusExpiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      }),
    );
    authenticatedApi(requestJson);
    const view = await renderCard(
      createQueryClient(
        accountSettings({
          customStatus: "Release notları",
          customStatusEmoji: "🚀",
          customStatusExpiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        }),
      ),
    );

    await fireEvent.press(view.getByTestId("mobile-profile-status-clear"));
    await fireEvent.press(view.getByTestId("mobile-profile-status-save"));

    await waitFor(() => expect(requestJson).toHaveBeenCalled());
    const patch = requestJson.mock.calls.find(
      ([path, request]) =>
        path === "/api/v1/mobile/account/profile" &&
        (request as { method?: string } | undefined)?.method === "PATCH",
    )?.[1] as { body: Record<string, unknown> };

    expect(patch.body).toMatchObject({
      customStatus: null,
      customStatusEmoji: null,
      customStatusExpiresAt: null,
    });
  });

  it("hands the presence row back to the host instead of writing presence itself", async () => {
    const requestJson = profilePatchApi();
    authenticatedApi(requestJson);
    const onOpenPresencePicker = jest.fn();
    const view = await renderCard(createQueryClient(), { onOpenPresencePicker });

    await fireEvent.press(view.getByTestId("mobile-profile-presence-open"));

    expect(onOpenPresencePicker).toHaveBeenCalledTimes(1);
    expect(
      requestJson.mock.calls.filter(([path]) => path === "/api/v1/mobile/account/presence"),
    ).toHaveLength(0);
  });

  it("reads OFFLINE as the invisible row, matching the picker sheet", async () => {
    authenticatedApi(profilePatchApi());
    const view = await renderCard(createQueryClient(), { presence: "OFFLINE" });

    expect(view.getByText("Görünmez")).toBeTruthy();
  });

  it("surfaces a failed save under the status field", async () => {
    const requestJson = jest.fn(async (path: string, request?: { method?: string }) => {
      if (path === "/api/v1/mobile/account/profile" && request?.method === "PATCH") {
        throw new Error("boom");
      }
      return accountSettings();
    });
    authenticatedApi(requestJson);
    const view = await renderCard(createQueryClient());

    await fireEvent.changeText(view.getByTestId("mobile-profile-status-input"), "Toplantıda");
    await fireEvent.press(view.getByTestId("mobile-profile-status-save"));

    await waitFor(() =>
      expect(view.getByTestId("mobile-profile-status-error").props.children).toBe(
        "Profil güncellenemedi. Yeniden dene.",
      ),
    );
  });
});
