import React from "react";
import { Text, View } from "react-native";
import { render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

const mockRequestNotifications = jest.fn();
const mockRequestCamera = jest.fn();
const mockRequestDocument = jest.fn();
const mockRequestPhotoPicker = jest.fn();
const mockRequestPhotoPermission = jest.fn();
const mockRequestMicrophone = jest.fn();

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({
    apiClient: {},
    completeAuthHandoff: jest.fn(async () => true),
    session: null,
  }),
}));

jest.mock("../src/locale/expo-mobile-locale-preferences", () => ({
  mobileLocalePreferenceRepository: {
    load: jest.fn(async () => "tr"),
    save: jest.fn(async () => undefined),
  },
}));

jest.mock("../src/notifications/mobile-notification-runtime", () => ({
  requestMobileNotificationsAfterUserAction: mockRequestNotifications,
}));

jest.mock("../src/media/mobile-media-runtime", () => ({
  requestMobileCameraPermissionAfterUserAction: mockRequestCamera,
  requestMobileDocumentPickerAfterUserAction: mockRequestDocument,
  requestMobilePhotoLibraryPickerAfterUserAction: mockRequestPhotoPicker,
  requestMobilePhotoLibraryPermissionAfterUserAction: mockRequestPhotoPermission,
}));

jest.mock("../src/voice/expo-mobile-voice-preferences", () => ({
  mobileVoicePreferenceRepository: {
    loadInputMode: jest.fn(async () => "voice-activity"),
    saveInputMode: jest.fn(async () => undefined),
  },
}));

jest.mock("../src/voice/use-mobile-voice-room", () => ({
  useMobileVoiceRoom: () => ({
    beginPushToTalk: jest.fn(),
    endPushToTalk: jest.fn(),
    joinVoiceChannel: jest.fn(),
    leaveVoiceChannel: jest.fn(),
    permissionState: {
      errorMessage: null,
      hasMicrophonePermission: false,
      lastAttemptAt: null,
      microphoneStatus: "unknown",
      status: "not-requested",
    },
    pushToTalkState: {
      phase: "idle",
      restoreMuted: false,
      startedAt: null,
    },
    requestMicrophonePermission: mockRequestMicrophone,
    roomState: {
      channelId: null,
      channelName: null,
      errorMessage: null,
      participants: [],
      screenShareStatus: "off",
      selfAudioOutput: "default",
      selfCameraEnabled: false,
      selfMuted: false,
      selfScreenShareEnabled: false,
      serverId: null,
      sessionId: null,
      status: "idle",
      updatedAt: null,
    },
    selectAudioOutput: jest.fn(),
    syncParticipantAudioLevelFromServer: jest.fn(),
    syncParticipantsFromServer: jest.fn(),
    toggleCamera: jest.fn(),
    toggleMute: jest.fn(),
    toggleScreenShare: jest.fn(),
  }),
}));

jest.mock("../src/deep-link/use-mobile-deep-links", () => ({
  useMobileDeepLinks: jest.fn(),
}));

import { MobileAppProviders } from "../src/app/providers/mobile-app-providers";
import { useMobileDeepLinkRuntime } from "../src/app/providers/mobile-deep-link-provider";
import { useMobileLocaleRuntime } from "../src/app/providers/mobile-locale-provider";
import { useMobileMediaRuntime } from "../src/app/providers/mobile-media-provider";
import { useMobileNotificationRuntime } from "../src/app/providers/mobile-notification-provider";
import { useMobileVoiceRuntime } from "../src/app/providers/mobile-voice-provider";

function ProviderConsumer() {
  const locale = useMobileLocaleRuntime();
  const media = useMobileMediaRuntime();
  const notifications = useMobileNotificationRuntime();
  const voice = useMobileVoiceRuntime();
  const deepLink = useMobileDeepLinkRuntime();

  return (
    <View>
      <Text testID="provider-locale">{locale.locale}</Text>
      <Text testID="provider-media">{media.state.status}</Text>
      <Text testID="provider-notifications">{notifications.state.status}</Text>
      <Text testID="provider-voice">{voice.roomState.status}</Text>
      <Text testID="provider-deep-link">{deepLink.lastDeepLink ? "received" : "idle"}</Text>
    </View>
  );
}

describe("mobile app providers", () => {
  it("provides initial lifecycle state without requesting native permissions", async () => {
    const view = await render(
      <MobileAppProviders>
        <ProviderConsumer />
      </MobileAppProviders>,
    );

    await waitFor(() => expect(view.getByTestId("provider-locale").props.children).toBe("tr"));
    expect(view.getByTestId("provider-media").props.children).toBe("not-requested");
    expect(view.getByTestId("provider-notifications").props.children).toBe("not-requested");
    expect(view.getByTestId("provider-voice").props.children).toBe("idle");
    expect(view.getByTestId("provider-deep-link").props.children).toBe("idle");

    expect(mockRequestNotifications).not.toHaveBeenCalled();
    expect(mockRequestCamera).not.toHaveBeenCalled();
    expect(mockRequestDocument).not.toHaveBeenCalled();
    expect(mockRequestPhotoPicker).not.toHaveBeenCalled();
    expect(mockRequestPhotoPermission).not.toHaveBeenCalled();
    expect(mockRequestMicrophone).not.toHaveBeenCalled();
  });
});
