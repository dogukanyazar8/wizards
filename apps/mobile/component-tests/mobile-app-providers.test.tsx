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
let mockUpdateVoiceRoomState:
  | ((
      updater: (current: typeof mockInitialVoiceRoomState) => typeof mockInitialVoiceRoomState,
    ) => void)
  | null = null;
const mockInitialVoiceRoomState = {
  availableAudioInputs: [],
  availableAudioOutputs: [],
  cameraFacingMode: "user" as const,
  channelId: null,
  channelName: null,
  errorMessage: null,
  noiseSuppressionEnabled: true,
  participants: [] as Array<{
    audioLevel: number;
    id: string;
    isMuted: boolean;
    isSelf: boolean;
    isSpeaking: boolean;
    userId: string;
  }>,
  screenShareStatus: "off" as const,
  selectedAudioInputId: null,
  selectedAudioOutputId: null,
  selfAudioOutput: "default" as const,
  selfCameraEnabled: false,
  selfMuted: false,
  selfScreenShareEnabled: false,
  serverId: null,
  sessionId: null,
  status: "idle" as const,
  updatedAt: null,
};

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
    const ReactModule = jest.requireActual<typeof import("react")>("react");
    const [roomState, setRoomState] = ReactModule.useState(mockInitialVoiceRoomState);
    mockVoiceRoomOptions = options;
    mockUpdateVoiceRoomState = (updater) => setRoomState(updater);
    return {
      beginCaptureConsentGuard: jest.fn(),
      beginPushToTalk: jest.fn(),
      endCaptureConsentGuard: jest.fn(),
      endPushToTalk: jest.fn(),
      flipCamera: jest.fn(),
      joinDirectCall: jest.fn(),
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
      refreshVoiceDevices: jest.fn(),
      requestMicrophonePermission: mockRequestMicrophone,
      roomState,
      screenShareAudioMuted: false,
      screenShareQualityId: "balanced",
      selectAudioDeviceOutput: jest.fn(),
      selectAudioInput: jest.fn(),
      selectAudioOutput: jest.fn(),
      selectAudioProcessing: jest.fn(),
      selectNoiseSuppression: jest.fn(),
      selectScreenShareAudioMuted: jest.fn(),
      selectScreenShareQuality: jest.fn(),
      syncParticipantAudioLevelFromServer: jest.fn(),
      syncParticipantsFromServer: jest.fn(),
      toggleCamera: jest.fn(),
      toggleMute: jest.fn(),
      toggleScreenShare: jest.fn(),
      voiceAudioProcessing: {
        automaticGainControlEnabled: true,
        echoCancellationEnabled: true,
        noiseSuppressionEnabled: true,
      },
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
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
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

let voiceIdentityRenders = 0;
const voiceIdentityValues: Array<ReturnType<typeof useMobileVoiceRuntime>> = [];

function VoiceIdentityConsumer() {
  const voice = useMobileVoiceRuntime();
  voiceIdentityRenders += 1;
  voiceIdentityValues.push(voice);
  return <Text testID="voice-identity-probe">ready</Text>;
}

describe("mobile app providers", () => {
  it("provides initial lifecycle state without requesting native permissions", async () => {
    const view = await render(
      <MobileQueryProvider>
        <MobileThemeProvider>
          <MobileAppProviders>
            <ProviderConsumer />
          </MobileAppProviders>
        </MobileThemeProvider>
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
    expect(mockSyncNotifications).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        status: "not-requested",
      }),
    );
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
        <MobileThemeProvider>
          <MobileAppProviders>
            <ProviderConsumer />
          </MobileAppProviders>
        </MobileThemeProvider>
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

  it("does not republish stable voice actions for participant level ticks", async () => {
    voiceIdentityRenders = 0;
    voiceIdentityValues.length = 0;
    const view = await render(
      <MobileQueryProvider>
        <MobileThemeProvider>
          <MobileAppProviders>
            <VoiceIdentityConsumer />
          </MobileAppProviders>
        </MobileThemeProvider>
      </MobileQueryProvider>,
    );
    await waitFor(() => expect(view.getByTestId("voice-identity-probe")).toBeTruthy());
    await act(async () => {
      await Promise.resolve();
    });
    const rendersBeforeTick = voiceIdentityRenders;
    const valueBeforeTick = voiceIdentityValues.at(-1);

    await act(async () => {
      mockUpdateVoiceRoomState?.((current) => ({
        ...current,
        participants: [
          {
            audioLevel: 0.7,
            id: "participant-1",
            isMuted: false,
            isSelf: false,
            isSpeaking: true,
            userId: "user-1",
          },
        ],
        updatedAt: 2_000,
      }));
    });

    expect(voiceIdentityRenders).toBe(rendersBeforeTick);
    expect(voiceIdentityValues.at(-1)).toBe(valueBeforeTick);
  });
});
