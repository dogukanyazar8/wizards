import React from "react";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

jest.mock("react-native-gesture-handler", () => {
  const ReactRuntime = require("react");
  const ReactNative = require("react-native");
  return {
    Gesture: {
      Pan: () => {
        const gesture = {
          enabled: () => gesture,
          onEnd: () => gesture,
          onUpdate: () => gesture,
        };
        return gesture;
      },
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(ReactNative.View, null, children),
  };
});

import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import { MobileDirectVideoCallScreen } from "../src/app/screens/mobile-direct-video-call-screen";
import type {
  MobileVoiceRoomParticipant,
  MobileVoiceRoomState,
} from "../src/voice/mobile-voice-room-contract";

const cameraTrackRef = {
  participant: {},
  publication: {},
  source: "camera",
} as MobileVoiceRoomParticipant["cameraTrackRef"];

function createParticipant(
  overrides: Partial<MobileVoiceRoomParticipant> = {},
): MobileVoiceRoomParticipant {
  return {
    audioLevel: 0,
    avatarUrl: null,
    displayName: null,
    isCameraEnabled: false,
    isMuted: false,
    isScreenSharing: false,
    isSelf: false,
    isSpeaking: false,
    userId: "user-remote",
    username: "remote",
    ...overrides,
  };
}

function createVideoCallRoom(overrides: Partial<MobileVoiceRoomState> = {}): MobileVoiceRoomState {
  return {
    availableAudioInputs: [],
    availableAudioOutputs: [
      { id: "speaker", labelKey: "speaker" },
      { id: "earpiece", labelKey: "earpiece" },
    ],
    cameraFacingMode: "user",
    channelId: null,
    channelName: "ogi_uat",
    conversationId: "conversation-1",
    connectedAt: Date.now() - 5_000,
    errorMessage: null,
    noiseSuppressionEnabled: true,
    participants: [
      createParticipant({
        cameraTrackRef,
        displayName: "You",
        isCameraEnabled: true,
        isSelf: true,
        userId: "self",
        username: "me",
      }),
      createParticipant({
        cameraTrackRef,
        displayName: "ogi_uat",
        isCameraEnabled: true,
        userId: "ogi",
        username: "ogi_uat",
      }),
    ],
    screenShareStatus: "off",
    selectedAudioInputId: null,
    selectedAudioOutputId: null,
    selfAudioOutput: "speaker",
    selfCameraEnabled: true,
    selfMuted: false,
    selfScreenShareEnabled: false,
    serverId: null,
    sessionMode: "direct",
    sessionId: "session-1",
    status: "connected",
    updatedAt: 1,
    ...overrides,
  };
}

function createProps(
  overrides: Partial<React.ComponentProps<typeof MobileDirectVideoCallScreen>> = {},
) {
  return {
    onLeaveVoiceChannel: async () => undefined,
    onToggleVoiceMute: async () => undefined,
    voiceRoomState: createVideoCallRoom(),
    ...overrides,
  } satisfies React.ComponentProps<typeof MobileDirectVideoCallScreen>;
}

describe("5f direct video call screen", () => {
  it("renders full-screen video, the video header, dock, and self PiP", async () => {
    const view = await render(<MobileDirectVideoCallScreen {...createProps()} />);

    expect(view.getByTestId("mobile-direct-video-call-screen")).toBeTruthy();
    expect(view.getByTestId("mobile-direct-video-call-surface")).toBeTruthy();
    expect(view.getByTestId("mobile-direct-video-call-pip")).toBeTruthy();
    expect(view.getByText("ogi_uat")).toBeTruthy();
    expect(view.getByText(new RegExp(copy.directCallVideoLabel))).toBeTruthy();
    expect(view.getByText(copy.directCallControlsHint)).toBeTruthy();
    expect(view.getByTestId("mobile-direct-video-call-leave")).toBeTruthy();
  });

  it("routes the flip and leave controls to their handlers", async () => {
    const onFlipVoiceCamera = jest.fn(async () => undefined);
    const onLeaveVoiceChannel = jest.fn(async () => undefined);
    const view = await render(
      <MobileDirectVideoCallScreen {...createProps({ onFlipVoiceCamera, onLeaveVoiceChannel })} />,
    );

    await fireEvent.press(view.getByTestId("mobile-direct-video-call-flip"));
    await fireEvent.press(view.getByTestId("mobile-direct-video-call-leave"));

    expect(onFlipVoiceCamera).toHaveBeenCalledTimes(1);
    expect(onLeaveVoiceChannel).toHaveBeenCalledTimes(1);
  });

  it("hides the controls when the video surface is tapped", async () => {
    const view = await render(<MobileDirectVideoCallScreen {...createProps()} />);

    expect(view.queryByTestId("mobile-direct-video-call-leave")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-direct-video-call-surface"));
    expect(view.queryByTestId("mobile-direct-video-call-leave")).toBeNull();
    // The self PiP stays visible even while controls are hidden.
    expect(view.getByTestId("mobile-direct-video-call-pip")).toBeTruthy();
  });

  it("opens the audio-output selector on long press", async () => {
    const onSelectVoiceAudioOutputDevice = jest.fn(async () => undefined);
    const view = await render(
      <MobileDirectVideoCallScreen {...createProps({ onSelectVoiceAudioOutputDevice })} />,
    );

    await fireEvent(view.getByTestId("mobile-direct-video-call-speaker"), "longPress");
    await fireEvent.press(view.getByTestId("mobile-direct-video-call-output-earpiece"));

    expect(onSelectVoiceAudioOutputDevice).toHaveBeenCalledWith("earpiece");
  });
});
