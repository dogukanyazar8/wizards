import React from "react";
import { Text, View } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

const mockRequestNotifications = jest.fn();
const mockSyncNotifications = jest.fn(async (...args: unknown[]) => args[1]);
const mockRequestCamera = jest.fn();
const mockRequestDocument = jest.fn();
const mockRequestPhotoPicker = jest.fn();
const mockRequestPhotoPermission = jest.fn();
const mockRequestMicrophone = jest.fn();
const mockCompleteAuthHandoff = jest.fn(async () => true);
const mockGetAccessToken = jest.fn(async () => null);
let mockVoiceRoomOptions: Record<string, unknown> | null = null;

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({
    apiClient: {},
    completeAuthHandoff: mockCompleteAuthHandoff,
    getAccessToken: mockGetAccessToken,
    session: null,
    status: "signed-out",
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
  syncMobileNotificationPermissionState: (...args: unknown[]) => mockSyncNotifications(...args),
}));

jest.mock("../src/media/mobile-media-runtime", () => ({
  requestMobileCameraPermissionAfterUserAction: (...args: unknown[]) => mockRequestCamera(...args),
  requestMobileDocumentPickerAfterUserAction: mockRequestDocument,
  requestMobilePhotoLibraryPickerAfterUserAction: mockRequestPhotoPicker,
  requestMobilePhotoLibraryPermissionAfterUserAction: mockRequestPhotoPermission,
}));

jest.mock("../src/voice/expo-mobile-voice-preferences", () => ({
  mobileVoicePreferenceRepository: {
    loadDevicePreferences: jest.fn(async () => ({
      audioInputId: null,
      audioOutputId: null,
      noiseSuppressionEnabled: true,
    })),
    loadInputMode: jest.fn(async () => "voice-activity"),
    saveDevicePreferences: jest.fn(async () => undefined),
    saveInputMode: jest.fn(async () => undefined),
  },
}));

jest.mock("../src/voice/use-mobile-voice-room", () => ({
  useMobileVoiceRoom: (options: Record<string, unknown>) => {
    mockVoiceRoomOptions = options;
    return {
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
        availableAudioInputs: [],
        availableAudioOutputs: [],
        cameraFacingMode: "user",
        channelId: null,
        channelName: null,
        errorMessage: null,
        noiseSuppressionEnabled: true,
        participants: [],
        screenShareStatus: "off",
        selectedAudioInputId: null,
        selectedAudioOutputId: null,
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
    };
  },
}));

jest.mock("../src/deep-link/use-mobile-deep-links", () => ({
  useMobileDeepLinks: jest.fn(),
}));

import { MobileAppProviders } from "../src/app/providers/mobile-app-providers";
import { useMobileDeepLinkRuntime } from "../src/app/providers/mobile-deep-link-provider";
import { useMobileLocaleRuntime } from "../src/app/providers/mobile-locale-provider";
import { useMobileMediaRuntime } from "../src/app/providers/mobile-media-provider";
import { useMobileNotificationRuntime } from "../src/app/providers/mobile-notification-provider";
import { MobileQueryProvider } from "../src/app/providers/mobile-query-provider";
import { useMobileRealtimeRuntime } from "../src/app/providers/mobile-realtime-provider";
import { useMobileVoiceRuntime } from "../src/app/providers/mobile-voice-provider";
import { activeMobileCopy } from "../src/locale/mobile-locale-preferences";

function ProviderConsumer() {
  const locale = useMobileLocaleRuntime();
  const media = useMobileMediaRuntime();
  const notifications = useMobileNotificationRuntime();
  const realtime = useMobileRealtimeRuntime();
  const voice = useMobileVoiceRuntime();
  const deepLink = useMobileDeepLinkRuntime();

  return (
    <View>
      <Text testID="provider-locale">{locale.locale}</Text>
      <Text testID="provider-media">{media.state.status}</Text>
      <Text testID="provider-notifications">{notifications.state.status}</Text>
      <Text testID="provider-realtime">{realtime.connection.status}</Text>
      <Text testID="provider-voice">{voice.roomState.status}</Text>
      <Text testID="provider-deep-link">{deepLink.lastDeepLink ? "received" : "idle"}</Text>
    </View>
  );
}

describe("mobile app providers", () => {
  it("provides initial lifecycle state without requesting native permissions", async () => {
    const view = await render(
      <MobileQueryProvider>
        <MobileAppProviders>
          <ProviderConsumer />
        </MobileAppProviders>
      </MobileQueryProvider>,
    );

    await waitFor(() => expect(view.getByTestId("provider-locale").props.children).toBe("tr"));
    expect(view.getByTestId("provider-media").props.children).toBe("not-requested");
    expect(view.getByTestId("provider-notifications").props.children).toBe("not-requested");
    expect(view.getByTestId("provider-realtime").props.children).toBe("idle");
    expect(view.getByTestId("provider-voice").props.children).toBe("idle");
    expect(view.getByTestId("provider-deep-link").props.children).toBe("idle");

    expect(mockRequestNotifications).not.toHaveBeenCalled();
    await waitFor(() => expect(mockSyncNotifications).toHaveBeenCalled());
    expect(mockSyncNotifications).toHaveBeenCalledWith(null, expect.objectContaining({
      status: "not-requested",
    }));
    expect(mockRequestCamera).not.toHaveBeenCalled();
    expect(mockRequestDocument).not.toHaveBeenCalled();
    expect(mockRequestPhotoPicker).not.toHaveBeenCalled();
    expect(mockRequestPhotoPermission).not.toHaveBeenCalled();
    expect(mockRequestMicrophone).not.toHaveBeenCalled();
  });

  it("injects the maintained media-provider camera action into direct-call joins", async () => {
    const cameraState = {
      cameraStatus: "granted",
      errorMessage: null,
      hasCameraPermission: true,
      hasDocumentPickerAccess: false,
      hasPhotoLibraryPermission: false,
      lastAttemptAt: 1,
      lastRequestedTarget: "camera",
      photoLibraryStatus: "unknown",
      selectedAsset: null,
      status: "ready-local",
    };
    mockRequestCamera.mockResolvedValueOnce(cameraState);

    await render(
      <MobileQueryProvider>
        <MobileAppProviders>
          <ProviderConsumer />
        </MobileAppProviders>
      </MobileQueryProvider>,
    );

    const requestCameraPermission = mockVoiceRoomOptions?.[
      "requestCameraPermissionAfterUserAction"
    ] as (() => Promise<typeof cameraState>) | undefined;
    expect(requestCameraPermission).toEqual(expect.any(Function));
    expect(mockVoiceRoomOptions).toMatchObject({
      cameraPermissionDeniedMessage: activeMobileCopy.voiceDirectCallCameraPermissionDenied,
      directCallMicrophonePermissionDeniedMessage:
        activeMobileCopy.voiceDirectCallMicrophonePermissionDenied,
    });
    let result: typeof cameraState | undefined;
    await act(async () => {
      result = await requestCameraPermission?.();
    });

    expect(mockRequestCamera).toHaveBeenCalledTimes(1);
    expect(result).toEqual(cameraState);
  });
});
