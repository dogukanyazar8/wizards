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

import { StyleSheet } from "react-native";

import { MobileProfileEditScreen } from "../src/social/mobile-profile-edit-screen";
import {
  createMobileProfileEditStyles,
  MOBILE_PROFILE_EDIT_METRICS,
} from "../src/social/mobile-profile-edit-screen.styles";
import { darkTheme, lightTheme } from "../src/design/themes";
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
  status: "DND" as const,
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
  queryClient.setQueryData(mobileQueryKeys.bootstrap(), {
    user: { ...sessionUser, status: "DND" },
  });
  return queryClient;
}

function renderScreen(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <ToastProvider>
            <MobileProfileEditScreen onBack={jest.fn()} />
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

function profilePatchApi(settings = accountSettings()) {
  return jest.fn(async (path: string, request?: { body?: unknown; method?: string }) => {
    if (path === "/api/v1/mobile/account/profile" && request?.method === "PATCH") {
      return { user: { ...savedProfile, ...(request.body as Record<string, unknown>) } };
    }
    return settings;
  });
}

describe("mobile profile edit screen (2a)", () => {
  beforeEach(() => {
    mockUseMobileAuth.mockReset();
    mockSelectAndUpload.mockReset();
  });

  it("renders the 2a preview and form blocks without the server footer note", async () => {
    authenticatedApi(jest.fn(async () => accountSettings()));
    const view = await renderScreen(createQueryClient());

    expect(view.getByTestId("mobile-profile-edit-preview")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-edit-banner-colors")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-edit-display-name-input")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-edit-username-input")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-edit-bio-input")).toBeTruthy();
    expect(view.queryByTestId("mobile-profile-edit-footer")).toBeNull();
  });

  // The status message and the online status moved to the profile hub, under the banner.
  it("no longer owns the status message or the presence row", async () => {
    authenticatedApi(jest.fn(async () => accountSettings()));
    const view = await renderScreen(createQueryClient());

    expect(view.queryByTestId("mobile-profile-edit-status")).toBeNull();
    expect(view.queryByTestId("mobile-profile-edit-status-input")).toBeNull();
    expect(view.queryByTestId("mobile-profile-edit-status-expiry-4h")).toBeNull();
    expect(view.queryByTestId("mobile-profile-edit-presence-row")).toBeNull();
  });

  it("keeps Kaydet disabled until a field is dirty", async () => {
    authenticatedApi(profilePatchApi());
    const view = await renderScreen(createQueryClient());

    expect(view.getByTestId("mobile-profile-edit-save").props.accessibilityState.disabled).toBe(
      true,
    );

    await fireEvent.changeText(
      view.getByTestId("mobile-profile-edit-display-name-input"),
      "Ada L.",
    );

    expect(view.getByTestId("mobile-profile-edit-save").props.accessibilityState.disabled).toBe(
      false,
    );
  });

  it("sends every dirty field in a single PATCH", async () => {
    const requestJson = profilePatchApi();
    authenticatedApi(requestJson);
    const view = await renderScreen(createQueryClient());

    await fireEvent.changeText(
      view.getByTestId("mobile-profile-edit-display-name-input"),
      "  Ada L.  ",
    );
    await fireEvent.changeText(view.getByTestId("mobile-profile-edit-bio-input"), "Mobil ekip");
    await fireEvent.press(view.getByTestId("mobile-profile-edit-banner-color-22a366"));
    await fireEvent.press(view.getByTestId("mobile-profile-edit-save"));

    await waitFor(() =>
      expect(requestJson).toHaveBeenCalledWith(
        "/api/v1/mobile/account/profile",
        expect.objectContaining({
          body: { bannerColor: "#22A366", bio: "Mobil ekip", displayName: "Ada L." },
          method: "PATCH",
        }),
      ),
    );
    expect(
      requestJson.mock.calls.filter(
        ([path, request]) =>
          path === "/api/v1/mobile/account/profile" &&
          (request as { method?: string } | undefined)?.method === "PATCH",
      ),
    ).toHaveLength(1);
  });

  it("counts the bio against the contract limit", async () => {
    authenticatedApi(profilePatchApi());
    const view = await renderScreen(createQueryClient());

    await fireEvent.changeText(view.getByTestId("mobile-profile-edit-bio-input"), "Mobil ekip");

    expect(view.getByTestId("mobile-profile-edit-bio-counter").props.children).toBe("10/250");
  });

  it("locks the username field while the 30-day cooldown is running", async () => {
    const settings = accountSettings({ nextUsernameChangeAt: "2099-01-05T00:00:00.000Z" });
    authenticatedApi(jest.fn(async () => settings));
    const view = await renderScreen(createQueryClient(settings));

    expect(view.getByTestId("mobile-profile-edit-username-input").props.editable).toBe(false);
    expect(view.getByTestId("mobile-profile-edit-username-hint").props.children).toContain(
      "değiştirebilirsin",
    );
  });

  it("shows the cooldown rule under the username while a change is allowed", async () => {
    authenticatedApi(profilePatchApi());
    const view = await renderScreen(createQueryClient());

    expect(view.getByTestId("mobile-profile-edit-username-hint").props.children).toBe(
      "Kullanıcı adı 30 günde bir değiştirilebilir",
    );
  });

  it("surfaces the server cooldown rejection under the username input", async () => {
    const requestJson = jest.fn(async (path: string, request?: { method?: string }) => {
      if (path === "/api/v1/mobile/account/profile" && request?.method === "PATCH") {
        throw Object.assign(new Error("cooldown"), {
          serverCode: "USERNAME_CHANGE_COOLDOWN",
          status: 429,
        });
      }
      return accountSettings();
    });
    authenticatedApi(requestJson);
    const view = await renderScreen(createQueryClient());

    await fireEvent.changeText(
      view.getByTestId("mobile-profile-edit-username-input"),
      "ada_lovelace",
    );
    await fireEvent.press(view.getByTestId("mobile-profile-edit-save"));

    await waitFor(() =>
      expect(view.getByTestId("mobile-profile-edit-username-error").props.children).toBe(
        "Kullanıcı adı 30 günde bir değiştirilebilir.",
      ),
    );
  });

  // Same width, same height as the profile card, so the crop positioned here is the crop
  // the profile screen draws — no more guessing from an 88px letterbox.
  it("previews a picked banner in the profile card's own box", async () => {
    const settings = accountSettings({ bannerUrl: "https://cdn.test/banner.png" });
    authenticatedApi(jest.fn(async () => settings));
    const view = await renderScreen(createQueryClient(settings));

    expect(
      StyleSheet.flatten(view.getByTestId("mobile-profile-edit-banner").props.style),
    ).toMatchObject({ height: lightTheme.layout.fixed.profileIdentityCardHeight });
    // The image fills that box instead of carrying a height of its own.
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-profile-edit-banner-image").props.style).position,
    ).toBe("absolute");
  });

  it("keeps the compact box while the banner is only a colour", async () => {
    authenticatedApi(jest.fn(async () => accountSettings()));
    const view = await renderScreen(createQueryClient());

    expect(
      StyleSheet.flatten(view.getByTestId("mobile-profile-edit-banner").props.style),
    ).toMatchObject({ height: MOBILE_PROFILE_EDIT_METRICS.banner });
  });

  it("disables the color swatches and offers removal while a banner image is set", async () => {
    const settings = accountSettings({ bannerUrl: "https://cdn.test/banner.png" });
    authenticatedApi(jest.fn(async () => settings));
    const view = await renderScreen(createQueryClient(settings));

    expect(view.getByTestId("mobile-profile-edit-banner-image")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-edit-banner-reposition-hint")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-edit-banner-locked")).toBeTruthy();
    expect(
      view.getByTestId("mobile-profile-edit-banner-color-22a366").props.accessibilityState.disabled,
    ).toBe(true);

    await fireEvent.press(view.getByTestId("mobile-profile-edit-banner-remove"));

    expect(view.queryByTestId("mobile-profile-edit-banner-image")).toBeNull();
    expect(view.getByTestId("mobile-profile-edit-save").props.accessibilityState.disabled).toBe(
      false,
    );
  });

  it("arms an explicit reposition mode instead of always fighting the page scroll", async () => {
    const settings = accountSettings({ bannerUrl: "https://cdn.test/banner.png" });
    authenticatedApi(jest.fn(async () => settings));
    const view = await renderScreen(createQueryClient(settings));

    const screen = view.getByTestId("mobile-profile-edit-screen");
    expect(screen.props.scrollEnabled).toBe(true);
    expect(view.queryByTestId("mobile-profile-edit-banner-grid")).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-profile-edit-banner-reposition-hint"));

    // In reposition mode the page stops scrolling, the thirds grid appears and
    // the destructive banner controls step out of the way.
    expect(view.getByTestId("mobile-profile-edit-screen").props.scrollEnabled).toBe(false);
    expect(view.getByTestId("mobile-profile-edit-banner-grid")).toBeTruthy();
    expect(view.queryByTestId("mobile-profile-edit-banner-remove")).toBeNull();
    expect(view.queryByTestId("mobile-profile-edit-banner-picker")).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-profile-edit-banner-reposition-done"));

    expect(view.getByTestId("mobile-profile-edit-screen").props.scrollEnabled).toBe(true);
    expect(view.queryByTestId("mobile-profile-edit-banner-grid")).toBeNull();
    expect(view.getByTestId("mobile-profile-edit-banner-picker")).toBeTruthy();
  });

  it("recenters the banner from the reposition bar and makes that saveable", async () => {
    const settings = accountSettings({
      bannerOffsetX: 0.2,
      bannerOffsetY: 0.9,
      bannerUrl: "https://cdn.test/banner.png",
    });
    authenticatedApi(jest.fn(async () => settings));
    const view = await renderScreen(createQueryClient(settings));

    await fireEvent.press(view.getByTestId("mobile-profile-edit-banner-reposition-hint"));
    await fireEvent.press(view.getByTestId("mobile-profile-edit-banner-reposition-reset"));

    expect(view.getByTestId("mobile-profile-edit-banner-image").props.contentPosition).toEqual({
      left: "50%",
      top: "50%",
    });
    expect(view.getByTestId("mobile-profile-edit-save").props.accessibilityState.disabled).toBe(
      false,
    );
  });

  it("keeps every banner overlay control on the image scrim so a white banner still shows them", () => {
    const styles = createMobileProfileEditStyles(lightTheme);

    for (const style of [
      styles.bannerAction,
      styles.bannerRemove,
      styles.bannerRepositionHint,
      styles.bannerRepositionInstruction,
      styles.bannerRepositionAction,
    ]) {
      expect(style).toMatchObject({
        backgroundColor: lightTheme.surface.imageScrim,
        borderColor: lightTheme.border.imageScrim,
      });
    }
    expect(lightTheme.surface.imageScrim).toBe(darkTheme.surface.imageScrim);
  });

  it("uploads a banner through the profile-banner purpose and keeps the editor clean", async () => {
    authenticatedApi(profilePatchApi());
    mockSelectAndUpload.mockResolvedValue({
      response: {
        banner: { bannerUrl: "https://cdn.test/next.png", id: "user-1" },
        claimId: "claim-1",
        claimedAt: "2026-07-23T08:00:00.000Z",
        purpose: "profile-banner",
      },
      status: "claimed",
    });
    const view = await renderScreen(createQueryClient());

    await fireEvent.press(view.getByTestId("mobile-profile-edit-banner-picker"));

    await waitFor(() => expect(view.getByTestId("mobile-profile-edit-banner-image")).toBeTruthy());
    expect(mockSelectAndUpload).toHaveBeenCalledWith(
      { purpose: "profile-banner" },
      expect.any(Function),
    );
    expect(view.getByTestId("mobile-profile-edit-save").props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it("keeps the avatar upload flow and its failure detail intact", async () => {
    authenticatedApi(jest.fn(async () => accountSettings()));
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
    expect(mockSelectAndUpload).toHaveBeenCalledWith(
      { purpose: "profile-avatar" },
      expect.any(Function),
    );
  });
});
