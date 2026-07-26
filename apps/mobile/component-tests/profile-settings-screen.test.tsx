import React, { type ComponentProps, type ReactElement } from "react";
import { StyleSheet } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockUseMobileAuth = jest.fn();

// The status card under the banner is connected, so the hub now needs an authenticated
// client and a query cache the same way the product shell hands it one.
jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => mockUseMobileAuth(),
}));

const mockMobileAccountSettingsScreen = jest.fn(
  ({ onBack, presence }: { onBack(): void; presence: string | null }) => {
    const ReactRuntime = require("react");
    const { Pressable, Text } = require("react-native");
    return ReactRuntime.createElement(
      Pressable,
      { onPress: onBack, testID: "mobile-account-settings-delegate" },
      ReactRuntime.createElement(Text, null, presence ?? "none"),
    );
  },
);

jest.mock("../src/app/screens/mobile-account-settings-screen", () => ({
  MobileAccountSettingsScreen: (props: { onBack(): void; presence: string | null }) =>
    mockMobileAccountSettingsScreen(props),
}));

const mockNavigate = jest.fn();

jest.mock("../src/navigation/mobile-navigation-ref", () => ({
  mobileNavigationRef: {
    goBack: jest.fn(),
    isReady: () => true,
    navigate: (...args: unknown[]) => mockNavigate(...args),
  },
  navigateMobileRouteIntent: jest.fn(),
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

import {
  INITIAL_BOOTSTRAP_STATE,
  type MobileBootstrapViewState,
} from "../src/app/mobile-screen-state";
import { ProfileSettingsScreen } from "../src/app/screens/settings-screen";
import { activeMobileCopy, MOBILE_LOCALE_OPTIONS } from "../src/locale/mobile-locale-preferences";
import { createInitialMobileMediaRuntimeState } from "../src/media/mobile-media-contract";
import {
  createInitialMobilePermissionReadiness,
  summarizeMobilePermissionReadiness,
  type MobilePermissionReadiness,
  type MobilePermissionStatus,
} from "../src/permissions/mobile-permission-contract";
import { ToastProvider } from "../src/app/components/kit/toast";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import type { MobileSyncHealthSummary } from "../src/sync/mobile-sync-contract";
import { renderWithMobileTheme } from "./render-with-mobile-theme";

const ACCOUNT_SETTINGS = {
  account: {
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
  },
  privacy: { dmPermission: "FRIENDS" as const, friendRequests: "EVERYONE" as const },
};

function createSeededQueryClient() {
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
  queryClient.setQueryData(mobileQueryKeys.accountSettings(), ACCOUNT_SETTINGS);
  return queryClient;
}

function render(ui: ReactElement) {
  const queryClient = createSeededQueryClient();
  return renderWithMobileTheme(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

const copy = activeMobileCopy;
const englishLocaleLabel = MOBILE_LOCALE_OPTIONS.find((option) => option.id === "en")!.label;
const READY_APP_VERSION = "9.9.9-test";
const BOOTSTRAP_ERROR = "Bootstrap test failure";

type ProfileSettingsScreenProps = ComponentProps<typeof ProfileSettingsScreen>;

const healthySync: MobileSyncHealthSummary = {
  failedSources: [],
  failureCount: 0,
  isRefreshing: false,
  status: "healthy",
};

function createProfileSettingsScreenProps(
  overrides: Partial<ProfileSettingsScreenProps> = {},
): ProfileSettingsScreenProps {
  const permissionReadiness = createInitialMobilePermissionReadiness();

  return {
    appLockAvailability: "available",
    appLockEnabled: false,
    authStatusLabel: "signed-in-test-session",
    bootstrapState: INITIAL_BOOTSTRAP_STATE,
    error: null,
    locale: "tr",
    onToggleAppLock: jest.fn(),
    mediaState: createInitialMobileMediaRuntimeState(),
    permissionReadiness,
    permissionSummary: summarizeMobilePermissionReadiness(permissionReadiness),
    sessionDiagnostics: {
      hasRefreshToken: true,
      hasSession: true,
      isExpired: false,
      scopeCount: 1,
      secondsUntilExpiry: 900,
      status: "signed-in",
    },
    signedInUserLabel: "Ada Test",
    status: "signed-in",
    syncHealth: healthySync,
    voiceInputMode: "voice-activity",
    onOpenCookies: jest.fn(),
    onOpenPrivacyPolicy: jest.fn(),
    onOpenSupport: jest.fn(),
    onOpenTerms: jest.fn(),
    onOpenWebRegister: jest.fn(),
    onOpenWebSignIn: jest.fn(),
    onRefresh: jest.fn(),
    onRefreshBootstrap: jest.fn(),
    onRefreshVisibleData: jest.fn(),
    onRequestCameraPermission: jest.fn(async () => undefined),
    onRequestDocumentPicker: jest.fn(async () => undefined),
    onRequestNotificationPermission: jest.fn(async () => undefined),
    onRequestPhotoLibraryPermission: jest.fn(async () => undefined),
    onSelectLocale: jest.fn(),
    onSelectVoiceInputMode: jest.fn(),
    onSignOut: jest.fn(),
    ...overrides,
  };
}

function createPermissionReadiness(
  statuses: Partial<Record<MobilePermissionReadiness["intent"]["id"], MobilePermissionStatus>>,
): readonly MobilePermissionReadiness[] {
  return createInitialMobilePermissionReadiness().map((item) => ({
    ...item,
    status: statuses[item.intent.id] ?? item.status,
  }));
}

function createReadyBootstrapState(
  userOverrides: Record<string, unknown> = {},
): MobileBootstrapViewState {
  return {
    error: null,
    payload: {
      app: {
        releaseChannel: "component-test",
        version: READY_APP_VERSION,
      },
      user: {
        avatarUrl: null,
        bannerColor: null,
        bannerOffsetX: null,
        bannerOffsetY: null,
        bannerUrl: null,
        displayName: "Ada Test",
        id: "user-1",
        locale: "tr",
        status: "ONLINE",
        username: "ada_test",
        ...userOverrides,
      },
    } as never,
    status: "ready",
    summary: {
      directMessageCount: 0,
      serverCount: 0,
    } as never,
  };
}

describe("mobile profile settings screen", () => {
  beforeEach(() => {
    mockUseMobileAuth.mockReset();
    mockUseMobileAuth.mockReturnValue({
      apiClient: { requestJson: jest.fn(async () => ACCOUNT_SETTINGS) },
      replaceSessionUser: jest.fn(async () => true),
      session: { user: { id: "user-1", username: "ada_test" } },
      status: "signed-in",
    });
  });

  it("delegates the account section to the connected screen with live presence and back action", async () => {
    const onBack = jest.fn();
    const view = await render(
      <ProfileSettingsScreen
        {...createProfileSettingsScreenProps({
          activeSection: "account",
          bootstrapState: createReadyBootstrapState(),
          onBack,
          socialActionsEnabled: true,
        })}
      />,
    );

    expect(mockMobileAccountSettingsScreen).toHaveBeenLastCalledWith(
      expect.objectContaining({ onBack, presence: "ONLINE" }),
    );
    await fireEvent.press(view.getByTestId("mobile-account-settings-delegate"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("uses profile-shaped loading and retryable error states without fabricated identity data", async () => {
    const onRefreshBootstrap = jest.fn();
    const loadingView = await render(
      <ProfileSettingsScreen
        {...createProfileSettingsScreenProps({ onRefreshBootstrap, socialActionsEnabled: true })}
      />,
    );

    expect(loadingView.getByTestId("mobile-settings-profile-loading")).toBeTruthy();
    expect(loadingView.queryByText("Whispr")).toBeNull();
    expect(loadingView.queryByText("@whispr")).toBeNull();

    const errorView = await render(
      <ProfileSettingsScreen
        {...createProfileSettingsScreenProps({
          bootstrapState: { error: BOOTSTRAP_ERROR, payload: null, status: "error", summary: null },
          onRefreshBootstrap,
          socialActionsEnabled: true,
        })}
      />,
    );

    await fireEvent.press(errorView.getByTestId("mobile-settings-profile-retry"));
    expect(onRefreshBootstrap).toHaveBeenCalledTimes(1);
  });

  it("requires an explicit confirmation before profile sign out", async () => {
    const onSignOut = jest.fn();
    const view = await render(
      <ProfileSettingsScreen
        {...createProfileSettingsScreenProps({
          bootstrapState: createReadyBootstrapState(),
          onSignOut,
          socialActionsEnabled: true,
        })}
      />,
    );

    await fireEvent.press(view.getByLabelText(copy.signOutAction));
    expect(onSignOut).not.toHaveBeenCalled();
    await fireEvent.press(view.getByTestId("mobile-profile-sign-out-confirmation-confirm"));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("updates the ready profile's real presence through the provided authenticated action", async () => {
    const onUpdatePresence = jest.fn(async () => undefined);
    const view = await render(
      <ProfileSettingsScreen
        {...createProfileSettingsScreenProps({
          bootstrapState: createReadyBootstrapState(),
          onUpdatePresence,
          socialActionsEnabled: true,
        })}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-profile-presence-open"));
    await fireEvent.press(view.getByTestId("mobile-profile-status-sheet-dnd"));

    expect(onUpdatePresence).toHaveBeenCalledWith("DND");
  });

  it("confirms a presence change with the same profile-updated toast as the editor", async () => {
    const view = await render(
      <ProfileSettingsScreen
        {...createProfileSettingsScreenProps({
          bootstrapState: createReadyBootstrapState(),
          onUpdatePresence: jest.fn(async () => undefined),
          socialActionsEnabled: true,
        })}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-profile-presence-open"));
    await fireEvent.press(view.getByTestId("mobile-profile-status-sheet-dnd"));

    await waitFor(() => expect(view.getByTestId("mobile-toast")).toBeTruthy());
    expect(view.getByText(copy.profileEditSaved)).toBeTruthy();
    expect(view.getByTestId("mobile-toast-tone-success")).toBeTruthy();
  });

  it("does not confirm a presence change the server rejected", async () => {
    const view = await render(
      <ProfileSettingsScreen
        {...createProfileSettingsScreenProps({
          bootstrapState: createReadyBootstrapState(),
          onUpdatePresence: jest.fn(async () => {
            throw new Error("boom");
          }),
          socialActionsEnabled: true,
        })}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-profile-presence-open"));
    await fireEvent.press(view.getByTestId("mobile-profile-status-sheet-dnd"));

    await waitFor(() => expect(view.getByText(copy.profileHubPresenceError)).toBeTruthy());
    expect(view.queryByTestId("mobile-toast")).toBeNull();
  });

  it("draws the saved banner on the identity card at its stored focal point", async () => {
    const view = await render(
      <ProfileSettingsScreen
        {...createProfileSettingsScreenProps({
          bootstrapState: createReadyBootstrapState({
            bannerColor: "#22A366",
            bannerOffsetX: 0.25,
            bannerOffsetY: 0.8,
            bannerUrl: "https://cdn.test/banner.png",
          }),
          socialActionsEnabled: true,
        })}
      />,
    );

    const image = view.getByTestId("mobile-profile-identity-banner-image");
    expect(image.props.source).toMatchObject({ uri: "https://cdn.test/banner.png" });
    // Same focal mapping as the editor preview, the card and the full page.
    expect(image.props.contentPosition).toEqual({ left: "25%", top: "80%" });
  });

  // The identity card is the banner now: no body strip under it, no presence chip inside it.
  it("fills the whole identity card with the banner and parks the edit chip on it", async () => {
    const view = await render(
      <ProfileSettingsScreen
        {...createProfileSettingsScreenProps({
          bootstrapState: createReadyBootstrapState({
            bannerUrl: "https://cdn.test/banner.png",
          }),
          onUpdatePresence: jest.fn(async () => undefined),
          socialActionsEnabled: true,
        })}
      />,
    );

    const card = StyleSheet.flatten(
      view.getByTestId("mobile-profile-identity-card").props.style,
    ) as { height?: number };
    const bannerImage = StyleSheet.flatten(
      view.getByTestId("mobile-profile-identity-banner-image").props.style,
    ) as { position?: string };

    expect(card.height).toBeGreaterThan(0);
    // Absolutely filled, not a fixed strip above a body.
    expect(bannerImage.position).toBe("absolute");
    expect(view.getByTestId("mobile-profile-edit")).toBeTruthy();
  });

  it("moves the status message and the presence row below the banner", async () => {
    const view = await render(
      <ProfileSettingsScreen
        {...createProfileSettingsScreenProps({
          bootstrapState: createReadyBootstrapState(),
          onUpdatePresence: jest.fn(async () => undefined),
          socialActionsEnabled: true,
        })}
      />,
    );

    expect(view.getByTestId("mobile-profile-status-card")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-status-input")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-presence-open")).toBeTruthy();
  });

  it("falls back to the chosen banner colour when no banner image is set", async () => {
    const view = await render(
      <ProfileSettingsScreen
        {...createProfileSettingsScreenProps({
          bootstrapState: createReadyBootstrapState({ bannerColor: "#22A366" }),
          socialActionsEnabled: true,
        })}
      />,
    );

    expect(view.queryByTestId("mobile-profile-identity-banner-image")).toBeNull();
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-profile-identity-banner").props.style),
    ).toMatchObject({ backgroundColor: "#22A366" });
  });

  it("opens the shared 2c status picker instead of the old button stack", async () => {
    const view = await render(
      <ProfileSettingsScreen
        {...createProfileSettingsScreenProps({
          bootstrapState: createReadyBootstrapState(),
          onUpdatePresence: jest.fn(async () => undefined),
          socialActionsEnabled: true,
        })}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-profile-presence-open"));

    const options = view.getByTestId("mobile-profile-status-sheet-options");
    expect(options.props.accessibilityRole).toBe("radiogroup");
    // Görünmez, not OFFLINE: the hub now speaks the same four rows as the editor.
    expect(view.getByTestId("mobile-profile-status-sheet-invisible")).toBeTruthy();
    expect(view.queryByTestId("mobile-profile-presence-offline")).toBeNull();
  });

  it("marks the live presence row as the checked option", async () => {
    const view = await render(
      <ProfileSettingsScreen
        {...createProfileSettingsScreenProps({
          bootstrapState: createReadyBootstrapState(),
          onUpdatePresence: jest.fn(async () => undefined),
          socialActionsEnabled: true,
        })}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-profile-presence-open"));

    expect(
      view.getByTestId("mobile-profile-status-sheet-online").props.accessibilityState,
    ).toMatchObject({ checked: true });
  });

  it("signs out from the rendered signed-in session action", async () => {
    const onSignOut = jest.fn();
    const props = createProfileSettingsScreenProps({ onSignOut });
    const view = await render(<ProfileSettingsScreen {...props} />);

    await fireEvent.press(view.getByLabelText(copy.signOutAction));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("renders the locale selector and selects the requested locale", async () => {
    const onSelectLocale = jest.fn();
    const props = createProfileSettingsScreenProps({ onSelectLocale });
    const view = await render(<ProfileSettingsScreen {...props} />);

    expect(view.getByLabelText(copy.settingsLanguageTitle)).toBeTruthy();
    expect(view.getByLabelText(copy.settingsLanguageTurkishValue).props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );

    await fireEvent.press(view.getByLabelText(englishLocaleLabel));

    expect(onSelectLocale).toHaveBeenCalledWith("en");
  });

  it("selects push-to-talk from the rendered voice input controls", async () => {
    const onSelectVoiceInputMode = jest.fn();
    const props = createProfileSettingsScreenProps({ onSelectVoiceInputMode });
    const view = await render(<ProfileSettingsScreen {...props} />);

    expect(view.getByLabelText(copy.settingsVoiceInputModeTitle)).toBeTruthy();
    await fireEvent.press(view.getByLabelText(copy.voiceInputModePushToTalk));

    expect(onSelectVoiceInputMode).toHaveBeenCalledWith("push-to-talk");
  });

  it("enables the biometric app lock from the rendered toggle", async () => {
    const onToggleAppLock = jest.fn();
    const props = createProfileSettingsScreenProps({
      appLockAvailability: "available",
      appLockEnabled: false,
      onToggleAppLock,
    });
    const view = await render(<ProfileSettingsScreen {...props} />);

    const toggle = view.getByLabelText(copy.settingsAppLockToggleLabel);
    expect(toggle.props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false, disabled: false }),
    );

    await fireEvent.press(toggle);

    expect(onToggleAppLock).toHaveBeenCalledWith(true);
  });

  it("disables the toggle and does not fire it when biometrics are unavailable", async () => {
    const onToggleAppLock = jest.fn();
    const props = createProfileSettingsScreenProps({
      appLockAvailability: "unavailable",
      appLockEnabled: false,
      onToggleAppLock,
    });
    const view = await render(<ProfileSettingsScreen {...props} />);

    const toggle = view.getByLabelText(copy.settingsAppLockToggleLabel);
    expect(toggle.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(view.getByText(copy.settingsAppLockUnavailableValue)).toBeTruthy();

    await fireEvent.press(toggle);

    expect(onToggleAppLock).not.toHaveBeenCalled();
  });

  it("requests camera and notification permissions and reflects terminal statuses", async () => {
    const onRequestCameraPermission = jest.fn(async () => undefined);
    const onRequestNotificationPermission = jest.fn(async () => undefined);
    const props = createProfileSettingsScreenProps({
      onRequestCameraPermission,
      onRequestNotificationPermission,
    });
    const view = await render(<ProfileSettingsScreen {...props} />);

    expect(
      view.getByTestId("mobile-settings-permission-action-camera").props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: false }));
    expect(
      view.getByTestId("mobile-settings-permission-action-notifications").props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: false }));

    await fireEvent.press(view.getByLabelText(copy.mediaSetupCameraAction));
    await fireEvent.press(view.getByLabelText(copy.settingsNotificationPermissionAction));

    expect(onRequestCameraPermission).toHaveBeenCalledTimes(1);
    expect(onRequestNotificationPermission).toHaveBeenCalledTimes(1);

    const terminalReadiness = createPermissionReadiness({
      camera: "granted",
      notifications: "blocked",
    });
    const terminalProps = createProfileSettingsScreenProps({
      mediaState: {
        ...createInitialMobileMediaRuntimeState(),
        cameraStatus: "granted",
        hasCameraPermission: true,
        status: "ready-local",
      },
      permissionReadiness: terminalReadiness,
      permissionSummary: summarizeMobilePermissionReadiness(terminalReadiness),
      onRequestCameraPermission,
      onRequestNotificationPermission,
    });

    const terminalView = await render(<ProfileSettingsScreen {...terminalProps} />);

    expect(
      terminalView.getByTestId("mobile-settings-permission-action-camera").props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
    expect(
      terminalView.getByTestId("mobile-settings-permission-action-notifications").props
        .accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
    expect(terminalView.getAllByText(copy.settingsReadyLabel).length).toBeGreaterThan(0);
    expect(terminalView.getAllByText(copy.settingsBlockedLabel).length).toBeGreaterThan(0);
  });

  it("opens support on the web and the legal texts inside the app", async () => {
    const onOpenPrivacyPolicy = jest.fn();
    const onOpenSupport = jest.fn();
    const props = createProfileSettingsScreenProps({ onOpenPrivacyPolicy, onOpenSupport });
    const view = await render(<ProfileSettingsScreen {...props} />);

    await fireEvent.press(view.getByLabelText(copy.settingsSupportAction));
    expect(onOpenSupport).toHaveBeenCalledTimes(1);

    // Legal documents no longer eject to the browser: they route to the in-app
    // reader, which renders the same server-served text.
    await fireEvent.press(view.getByLabelText(copy.settingsPrivacyPolicyAction));
    await fireEvent.press(view.getByLabelText(copy.settingsTermsAction));
    await fireEvent.press(view.getByLabelText(copy.settingsCookiesAction));

    expect(onOpenPrivacyPolicy).not.toHaveBeenCalled();
    expect(mockNavigate.mock.calls).toEqual([
      ["LegalDocument", { documentId: "privacy" }],
      ["LegalDocument", { documentId: "terms" }],
      ["LegalDocument", { documentId: "cookies" }],
    ]);
  });

  it("switches from ready health data to bootstrap and sync error notices", async () => {
    const readyProps = createProfileSettingsScreenProps({
      bootstrapState: createReadyBootstrapState(),
      syncHealth: healthySync,
    });
    const view = await render(<ProfileSettingsScreen {...readyProps} />);

    expect(view.getByText(READY_APP_VERSION)).toBeTruthy();
    expect(view.queryByText(copy.bootstrapLoadErrorTitle)).toBeNull();
    expect(view.queryByText(copy.syncHealthErrorTitle)).toBeNull();

    const errorProps = createProfileSettingsScreenProps({
      bootstrapState: {
        error: BOOTSTRAP_ERROR,
        payload: null,
        status: "error",
        summary: null,
      },
      syncHealth: {
        failedSources: ["bootstrap"],
        failureCount: 1,
        isRefreshing: false,
        status: "error",
      },
    });

    const errorView = await render(<ProfileSettingsScreen {...errorProps} />);

    expect(errorView.getByText(copy.bootstrapLoadErrorTitle)).toBeTruthy();
    expect(errorView.getByText(BOOTSTRAP_ERROR)).toBeTruthy();
    expect(errorView.getByText(copy.syncHealthErrorTitle)).toBeTruthy();
  });
});
