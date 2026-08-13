import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Clipboard from "expo-clipboard";

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

import { MobileAccountSettingsScreen } from "../src/app/screens/mobile-account-settings-screen";
import { ToastProvider } from "../src/app/components/kit/toast";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import { MOBILE_ACCOUNT_VISIBILITY_PREFERENCE_KEYS } from "../src/account/mobile-account-settings-client";

const accountSettings = {
  appearance: {
    messageCompact: false,
    messageFollowSystemFont: false,
    messageFontSize: "medium" as const,
  },
  account: {
    bannerColor: null,
    bannerOffsetX: null,
    bannerOffsetY: null,
    bannerUrl: null,
    bio: "Shipping Whispr",
    customStatus: null,
    customStatusEmoji: null,
    customStatusExpiresAt: null,
    email: "ada@example.com",
    emailVerified: true,
    nextUsernameChangeAt: null,
    pronouns: null,
    twoFactorEnabled: false,
  },
  privacy: {
    dmPermission: "MUTUAL_SERVERS" as const,
    friendRequests: "MUTUAL_FRIENDS" as const,
    // 2b §7's switch. Defaulted open by the schema, so the parsed payload
    // carries it even when the fixture predates the field.
    groupInvites: true,
  },
};
const sessionUser = {
  avatarUrl: null,
  displayName: "Ada Lovelace",
  id: "user-1",
  username: "ada",
};
const accountPreferences = {
  dateFormat: "LOCALE" as const,
  interfaceDensity: "COMFORTABLE" as const,
  presenceVisibility: "FRIENDS" as const,
  profileVisibility: "EVERYONE" as const,
  timeFormat: "LOCALE" as const,
  timeZone: "AUTO" as const,
};

function renderScreen(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <ToastProvider>
            <MobileAccountSettingsScreen onBack={jest.fn()} presence="ONLINE" />
          </ToastProvider>
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </QueryClientProvider>,
  );
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Number.POSITIVE_INFINITY },
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
}

function authenticatedApi(options: {
  profileResponse?: unknown;
  rejectPreferences?: boolean;
  rejectPrivacy?: boolean;
}) {
  return {
    requestJson: jest.fn(async (path: string, request?: { body?: unknown; method?: string }) => {
      if (path === "/api/v1/mobile/account/preferences" && request?.method === "PATCH") {
        if (options.rejectPreferences) throw new Error("preferences unavailable");
        return { ...accountPreferences, ...(request.body as object) };
      }
      if (path === "/api/v1/mobile/account/preferences") return accountPreferences;
      if (path === "/api/v1/mobile/account/settings" && request?.method === "PATCH") {
        if (options.rejectPrivacy) throw new Error("privacy unavailable");
        return accountSettings;
      }
      if (path === "/api/v1/mobile/account/settings") return accountSettings;
      if (path === "/api/v1/mobile/account/profile") return options.profileResponse;
      throw new Error(`Unexpected integration request: ${path}`);
    }),
  };
}

describe("production mobile account settings integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    jest.mocked(AsyncStorage.removeItem).mockResolvedValue(undefined);
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
    jest.mocked(Clipboard.setStringAsync).mockResolvedValue(undefined);
  });

  it("uses the authenticated query and rolls failed privacy mutations back", async () => {
    const apiClient = authenticatedApi({ rejectPrivacy: true });
    mockUseMobileAuth.mockReturnValue({
      apiClient,
      replaceSessionUser: jest.fn(async () => true),
      session: { user: sessionUser },
      status: "signed-in",
    });
    const queryClient = createQueryClient();
    const view = await renderScreen(queryClient);

    expect(await view.findByText("ada@example.com")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-account-dm-row"));
    await fireEvent.press(view.getByTestId("mobile-account-policy-dm-NOBODY"));

    await waitFor(() =>
      expect(
        view.getByText("Hesap ayarı güncellenemedi. Önceki değer geri yüklendi."),
      ).toBeTruthy(),
    );
    expect(queryClient.getQueryData(mobileQueryKeys.accountSettings())).toEqual(accountSettings);
  });

  it("loads server visibility controls, clears legacy keys, and reports clipboard failures", async () => {
    const apiClient = authenticatedApi({});
    mockUseMobileAuth.mockReturnValue({
      apiClient,
      replaceSessionUser: jest.fn(async () => true),
      session: { user: sessionUser },
      status: "signed-in",
    });
    const queryClient = createQueryClient();
    const view = await renderScreen(queryClient);
    await view.findByText("ada@example.com");

    await fireEvent.press(view.getByTestId("mobile-account-username-copy"));
    await waitFor(() => expect(view.getByText("Kullanıcı adı kopyalandı.")).toBeTruthy());
    await fireEvent.press(view.getByTestId("mobile-toast-dismiss"));
    jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error("clipboard denied"));
    await fireEvent.press(view.getByTestId("mobile-account-username-copy"));
    await waitFor(() => expect(view.getByText("Kullanıcı adı kopyalanamadı.")).toBeTruthy());
    await fireEvent.press(view.getByTestId("mobile-toast-dismiss"));

    expect(view.getByTestId("mobile-account-profile-visibility-row")).toBeTruthy();
    expect(view.getByTestId("mobile-account-presence-visibility-row")).toBeTruthy();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      MOBILE_ACCOUNT_VISIBILITY_PREFERENCE_KEYS.profile,
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      MOBILE_ACCOUNT_VISIBILITY_PREFERENCE_KEYS.presence,
    );
    expect(AsyncStorage.getItem).not.toHaveBeenCalledWith(
      expect.stringContaining("privacy-visibility"),
    );
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      expect.stringContaining("privacy-visibility"),
      expect.anything(),
    );
  });

  it("rolls a rejected visibility preference back to the canonical server value", async () => {
    const apiClient = authenticatedApi({ rejectPreferences: true });
    mockUseMobileAuth.mockReturnValue({
      apiClient,
      replaceSessionUser: jest.fn(async () => true),
      session: { user: sessionUser },
      status: "signed-in",
    });
    const queryClient = createQueryClient();
    const view = await renderScreen(queryClient);

    await view.findByText("ada@example.com");
    await fireEvent.press(view.getByTestId("mobile-account-profile-visibility-row"));
    await fireEvent.press(view.getByTestId("mobile-account-policy-profile-NOBODY"));

    await waitFor(() =>
      expect(queryClient.getQueryData(mobileQueryKeys.accountPreferences())).toEqual(
        accountPreferences,
      ),
    );
    expect(view.getByText("Hesap ayarı güncellenemedi. Önceki değer geri yüklendi.")).toBeTruthy();
  });

  it("keeps server-returned identity canonical when secure session persistence fails", async () => {
    const canonicalProfile = {
      user: {
        avatarUrl: null,
        bannerColor: null,
        bannerOffsetX: null,
        bannerOffsetY: null,
        bannerUrl: null,
        bio: null,
        customStatus: null,
        customStatusEmoji: null,
        customStatusExpiresAt: null,
        displayName: "Ada Byron",
        id: "user-1",
        nextUsernameChangeAt: null,
        pronouns: null,
        status: "ONLINE",
        twoFactorEnabled: false,
        username: "ada_byron",
      },
    };
    const apiClient = authenticatedApi({ profileResponse: canonicalProfile });
    const replaceSessionUser = jest.fn(async () => false);
    mockUseMobileAuth.mockReturnValue({
      apiClient,
      replaceSessionUser,
      session: { user: sessionUser },
      status: "signed-in",
    });
    const queryClient = createQueryClient();
    queryClient.setQueryData(mobileQueryKeys.bootstrap(), {
      user: { ...sessionUser, status: "ONLINE" },
    });
    const view = await renderScreen(queryClient);
    await view.findByText("ada@example.com");

    await fireEvent.press(view.getByTestId("mobile-account-display-name-field"));
    await fireEvent.changeText(
      view.getByTestId("mobile-account-profile-display-name-input"),
      "Ada Byron",
    );
    await fireEvent.changeText(
      view.getByTestId("mobile-account-profile-username-input"),
      "ada_byron",
    );
    await fireEvent.press(view.getByTestId("mobile-account-profile-save"));

    await waitFor(() =>
      expect(
        within(view.getByTestId("mobile-account-profile-card")).getAllByText("Ada Byron"),
      ).not.toHaveLength(0),
    );
    expect(replaceSessionUser).toHaveBeenCalledWith(canonicalProfile.user);
    expect(queryClient.getQueryData(mobileQueryKeys.profile())).toEqual(canonicalProfile);
    expect(
      view.getByText(
        "Profil sunucuda kaydedildi ancak güvenli yerel oturum yenilenemedi. Sonraki girişte yeniden eşitlenecek.",
      ),
    ).toBeTruthy();
    expect(view.queryByText("Hesap ayarı güncellenemedi. Önceki değer geri yüklendi.")).toBeNull();
  });

  it("offers a real verify action for an unverified email and sends the verification request", async () => {
    const unverifiedSettings = {
      ...accountSettings,
      account: { ...accountSettings.account, emailVerified: false },
    };
    const apiClient = {
      requestJson: jest.fn(async (path: string) => {
        if (path === "/api/v1/mobile/account/preferences") return accountPreferences;
        if (path === "/api/v1/mobile/account/settings") return unverifiedSettings;
        if (path === "/api/v1/mobile/auth/verification-email") {
          return {
            email: "ada@example.com",
            message: "Verification email sent",
            status: "accepted",
          };
        }
        throw new Error(`Unexpected integration request: ${path}`);
      }),
    };
    mockUseMobileAuth.mockReturnValue({
      apiClient,
      replaceSessionUser: jest.fn(async () => true),
      session: { user: sessionUser },
      status: "signed-in",
    });
    const view = await renderScreen(createQueryClient());

    const verifyAction = await view.findByTestId("mobile-account-email-verify");
    expect(view.queryByTestId("mobile-account-email-verified-badge")).toBeNull();

    await fireEvent.press(verifyAction);

    await waitFor(() =>
      expect(apiClient.requestJson).toHaveBeenCalledWith(
        "/api/v1/mobile/auth/verification-email",
        expect.objectContaining({
          body: { email: "ada@example.com", locale: "tr" },
          method: "POST",
        }),
      ),
    );
    expect(await view.findByText("Doğrulama bağlantısı e-postana gönderildi.")).toBeTruthy();
  });

  it("keeps the verified badge and hides the verify action for a verified email", async () => {
    const apiClient = authenticatedApi({});
    mockUseMobileAuth.mockReturnValue({
      apiClient,
      replaceSessionUser: jest.fn(async () => true),
      session: { user: sessionUser },
      status: "signed-in",
    });
    const view = await renderScreen(createQueryClient());

    expect(await view.findByTestId("mobile-account-email-verified-badge")).toBeTruthy();
    expect(view.queryByTestId("mobile-account-email-verify")).toBeNull();
  });

  it("surfaces a localized failure when the verification email cannot be sent", async () => {
    const unverifiedSettings = {
      ...accountSettings,
      account: { ...accountSettings.account, emailVerified: false },
    };
    const apiClient = {
      requestJson: jest.fn(async (path: string) => {
        if (path === "/api/v1/mobile/account/preferences") return accountPreferences;
        if (path === "/api/v1/mobile/account/settings") return unverifiedSettings;
        throw new Error("verification transport failure");
      }),
    };
    mockUseMobileAuth.mockReturnValue({
      apiClient,
      replaceSessionUser: jest.fn(async () => true),
      session: { user: sessionUser },
      status: "signed-in",
    });
    const view = await renderScreen(createQueryClient());

    await fireEvent.press(await view.findByTestId("mobile-account-email-verify"));

    expect(await view.findByText("Doğrulama e-postası gönderilemedi. Tekrar dene.")).toBeTruthy();
    expect(view.queryByText("verification transport failure")).toBeNull();
  });

  it("does not query or offer an authenticated retry while signed out", async () => {
    const apiClient = authenticatedApi({});
    mockUseMobileAuth.mockReturnValue({
      apiClient,
      replaceSessionUser: jest.fn(async () => false),
      session: null,
      status: "signed-out",
    });
    const view = await renderScreen(createQueryClient());

    expect(await view.findByTestId("mobile-account-settings-screen")).toBeTruthy();
    expect(apiClient.requestJson).not.toHaveBeenCalled();
    expect(view.queryByTestId("mobile-account-settings-retry")).toBeNull();
  });
});
