import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockUseMobileAuth = jest.fn();
const mockSelectAndUpload = jest.fn();

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => mockUseMobileAuth(),
}));

jest.mock("../src/media/use-mobile-image-upload", () => ({
  useMobileImageUpload: () => ({ isBusy: false, selectAndUpload: mockSelectAndUpload }),
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

import { MobileProfileEditScreen } from "../src/social/mobile-profile-edit-screen";
import { ToastProvider } from "../src/app/components/kit/toast";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";

const sessionUser = {
  avatarUrl: null,
  displayName: "Ada Lovelace",
  id: "user-1",
  username: "ada",
};

const accountSettings = {
  account: {
    bio: null,
    customStatus: null,
    email: "ada@example.com",
    emailVerified: true,
    twoFactorEnabled: false,
  },
  privacy: { dmPermission: "FRIENDS" as const, friendRequests: "EVERYONE" as const },
};

function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Number.POSITIVE_INFINITY },
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  queryClient.setQueryData(mobileQueryKeys.accountSettings(), accountSettings);
  queryClient.setQueryData(mobileQueryKeys.bootstrap(), { user: { ...sessionUser, status: "DND" } });
  return queryClient;
}

function renderScreen(queryClient: QueryClient, onOpenBlockedUsers = jest.fn()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <ToastProvider>
            <MobileProfileEditScreen
              onBack={jest.fn()}
              onOpenBlockedUsers={onOpenBlockedUsers}
            />
          </ToastProvider>
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </QueryClientProvider>,
  );
}

function authenticatedApi(requestJson: jest.Mock) {
  mockUseMobileAuth.mockReturnValue({
    apiClient: { requestJson },
    replaceSessionUser: jest.fn(async () => true),
    session: { user: sessionUser },
    status: "signed-in",
  });
}

describe("mobile profile edit screen", () => {
  beforeEach(() => {
    mockUseMobileAuth.mockReset();
    mockSelectAndUpload.mockReset();
  });

  it("renders the real identity, presence, and about sections from server data", async () => {
    authenticatedApi(jest.fn(async () => accountSettings));
    const view = await renderScreen(createQueryClient());

    expect(view.getByTestId("mobile-profile-edit-display-name-row")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-edit-username-row")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-edit-custom-status-row")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-edit-bio-row")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-edit-presence-pill").props.children).toBe(
      "Rahatsız etmeyin",
    );
    expect(view.getByTestId("mobile-profile-edit-email-row")).toBeTruthy();
  });

  it("saves the bio through the profile mutation and reports the result", async () => {
    const requestJson = jest.fn(async (path: string, request?: { body?: unknown; method?: string }) => {
      if (path === "/api/v1/mobile/account/profile" && request?.method === "PATCH") {
        return {
          user: {
            ...sessionUser,
            bio: (request.body as { bio: string }).bio,
            customStatus: null,
            status: "DND",
            twoFactorEnabled: false,
          },
        };
      }
      return accountSettings;
    });
    authenticatedApi(requestJson);
    const view = await renderScreen(createQueryClient());

    await fireEvent.press(view.getByTestId("mobile-profile-edit-bio-row"));
    await fireEvent.changeText(view.getByTestId("mobile-profile-edit-input"), "  Building Whispr  ");
    await fireEvent.press(view.getByTestId("mobile-profile-edit-save"));

    await waitFor(() =>
      expect(view.getByTestId("mobile-profile-edit-notice").props.children).toBe(
        "Profil güncellendi.",
      ),
    );
    expect(requestJson).toHaveBeenCalledWith(
      "/api/v1/mobile/account/profile",
      expect.objectContaining({ body: { bio: "Building Whispr" }, method: "PATCH" }),
    );
  });

  it("rejects an invalid username before calling the API", async () => {
    const requestJson = jest.fn(async () => accountSettings);
    authenticatedApi(requestJson);
    const view = await renderScreen(createQueryClient());

    await fireEvent.press(view.getByTestId("mobile-profile-edit-username-row"));
    await fireEvent.changeText(view.getByTestId("mobile-profile-edit-input"), "a b!");

    expect(view.getByTestId("mobile-profile-edit-save").props.accessibilityState.disabled).toBe(
      true,
    );
    expect(requestJson).not.toHaveBeenCalledWith(
      "/api/v1/mobile/account/profile",
      expect.anything(),
    );
  });

  it("surfaces the upload failure detail when the avatar cannot be stored", async () => {
    authenticatedApi(jest.fn(async () => accountSettings));
    mockSelectAndUpload.mockResolvedValue({
      message: "The image upload could not be completed. (409 UPLOAD_CLAIM_UNAVAILABLE)",
      status: "error",
    });
    const view = await renderScreen(createQueryClient());

    await fireEvent.press(view.getByTestId("mobile-profile-edit-avatar-picker"));

    await waitFor(() =>
      expect(view.getByTestId("mobile-profile-edit-error").props.children).toBe(
        "The image upload could not be completed. (409 UPLOAD_CLAIM_UNAVAILABLE)",
      ),
    );
  });

  it("changes presence through the presence sheet", async () => {
    const requestJson = jest.fn(async (path: string, request?: { method?: string }) => {
      if (path === "/api/v1/mobile/account/presence" && request?.method === "PUT") {
        return { status: "ONLINE" };
      }
      return accountSettings;
    });
    authenticatedApi(requestJson);
    const view = await renderScreen(createQueryClient());

    await fireEvent.press(view.getByTestId("mobile-profile-edit-presence-row"));
    await fireEvent.press(view.getByTestId("mobile-profile-edit-presence-online"));

    await waitFor(() =>
      expect(requestJson).toHaveBeenCalledWith(
        "/api/v1/mobile/account/presence",
        expect.objectContaining({ body: { status: "ONLINE" }, method: "PUT" }),
      ),
    );
  });
});
