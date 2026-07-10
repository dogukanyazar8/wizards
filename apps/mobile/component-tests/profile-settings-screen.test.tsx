import React, { type ComponentProps } from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

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
import type { MobileSyncHealthSummary } from "../src/sync/mobile-sync-contract";

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
    authStatusLabel: "signed-in-test-session",
    bootstrapState: INITIAL_BOOTSTRAP_STATE,
    error: null,
    locale: "tr",
    mediaState: createInitialMobileMediaRuntimeState(),
    permissionReadiness,
    permissionSummary: summarizeMobilePermissionReadiness(permissionReadiness),
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

function createReadyBootstrapState(): MobileBootstrapViewState {
  return {
    error: null,
    payload: {
      app: {
        releaseChannel: "component-test",
        version: READY_APP_VERSION,
      },
      user: {
        avatarUrl: null,
        displayName: "Ada Test",
        username: "ada_test",
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

    await view.rerender(<ProfileSettingsScreen {...terminalProps} />);

    expect(
      view.getByTestId("mobile-settings-permission-action-camera").props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
    expect(
      view.getByTestId("mobile-settings-permission-action-notifications").props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
    expect(view.getAllByText(copy.settingsReadyLabel).length).toBeGreaterThan(0);
    expect(view.getAllByText(copy.settingsBlockedLabel).length).toBeGreaterThan(0);
  });

  it("opens support and privacy destinations from their real actions", async () => {
    const onOpenPrivacyPolicy = jest.fn();
    const onOpenSupport = jest.fn();
    const props = createProfileSettingsScreenProps({ onOpenPrivacyPolicy, onOpenSupport });
    const view = await render(<ProfileSettingsScreen {...props} />);

    await fireEvent.press(view.getByLabelText(copy.settingsSupportAction));
    await fireEvent.press(view.getByLabelText(copy.settingsPrivacyPolicyAction));

    expect(onOpenSupport).toHaveBeenCalledTimes(1);
    expect(onOpenPrivacyPolicy).toHaveBeenCalledTimes(1);
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

    await view.rerender(<ProfileSettingsScreen {...errorProps} />);

    expect(view.getByText(copy.bootstrapLoadErrorTitle)).toBeTruthy();
    expect(view.getByText(BOOTSTRAP_ERROR)).toBeTruthy();
    expect(view.getByText(copy.syncHealthErrorTitle)).toBeTruthy();
  });
});
