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
import { MobileDirectCallScreen } from "../src/app/screens/mobile-direct-call-screen";
import type {
  MobileVoiceRoomParticipant,
  MobileVoiceRoomState,
} from "../src/voice/mobile-voice-room-contract";

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

function createDirectCallRoom(overrides: Partial<MobileVoiceRoomState> = {}): MobileVoiceRoomState {
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
      createParticipant({ displayName: "You", isSelf: true, userId: "self", username: "me" }),
      createParticipant({ displayName: "ogi_uat", userId: "ogi", username: "ogi_uat" }),
    ],
    screenShareStatus: "off",
    selectedAudioInputId: null,
    selectedAudioOutputId: null,
    selfAudioOutput: "default",
    selfCameraEnabled: false,
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

function createProps(overrides: Partial<React.ComponentProps<typeof MobileDirectCallScreen>> = {}) {
  return {
    onLeaveVoiceChannel: async () => undefined,
    onToggleVoiceMute: async () => undefined,
    voiceRoomState: createDirectCallRoom(),
    ...overrides,
  } satisfies React.ComponentProps<typeof MobileDirectCallScreen>;
}

describe("5e direct call screen", () => {
  it("renders the encrypted call header, callee, and connection chip", async () => {
    const view = await render(<MobileDirectCallScreen {...createProps()} />);

    expect(view.getByTestId("mobile-direct-call-screen")).toBeTruthy();
    expect(view.getByText(copy.directCallTitle)).toBeTruthy();
    expect(view.getByText(copy.directCallEncrypted)).toBeTruthy();
    expect(view.getByText("ogi_uat")).toBeTruthy();
    expect(view.getByText(copy.directCallConnectionGood)).toBeTruthy();
    expect(view.getByTestId("mobile-direct-call-leave")).toBeTruthy();
  });

  it("routes the dock controls to their handlers", async () => {
    const onLeaveVoiceChannel = jest.fn(async () => undefined);
    const onToggleVoiceMute = jest.fn(async () => undefined);
    const view = await render(
      <MobileDirectCallScreen {...createProps({ onLeaveVoiceChannel, onToggleVoiceMute })} />,
    );

    await fireEvent.press(view.getByTestId("mobile-direct-call-mic"));
    await fireEvent.press(view.getByTestId("mobile-direct-call-leave"));

    expect(onToggleVoiceMute).toHaveBeenCalledTimes(1);
    expect(onLeaveVoiceChannel).toHaveBeenCalledTimes(1);
  });

  it("opens the audio-output selector on long press and selects a device", async () => {
    const onRefreshVoiceDevices = jest.fn(async () => undefined);
    const onSelectVoiceAudioOutputDevice = jest.fn(async () => undefined);
    const view = await render(
      <MobileDirectCallScreen
        {...createProps({ onRefreshVoiceDevices, onSelectVoiceAudioOutputDevice })}
      />,
    );

    await fireEvent(view.getByTestId("mobile-direct-call-speaker"), "longPress");
    expect(onRefreshVoiceDevices).toHaveBeenCalled();
    expect(view.getByTestId("mobile-direct-call-output-selector")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-direct-call-output-earpiece"));
    expect(onSelectVoiceAudioOutputDevice).toHaveBeenCalledWith("earpiece");
  });

  it("disables the dock controls until the call is connected", async () => {
    const view = await render(
      <MobileDirectCallScreen
        {...createProps({ voiceRoomState: createDirectCallRoom({ status: "connecting" }) })}
      />,
    );

    expect(view.getByTestId("mobile-direct-call-mic").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(view.getByText(copy.directCallConnecting)).toBeTruthy();
  });
});
