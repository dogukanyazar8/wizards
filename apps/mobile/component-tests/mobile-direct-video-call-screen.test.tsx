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
import { ToastProvider } from "../src/app/components/kit/toast";
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

function renderVideoCall(props: React.ComponentProps<typeof MobileDirectVideoCallScreen>) {
  return render(
    <ToastProvider>
      <MobileDirectVideoCallScreen {...props} />
    </ToastProvider>,
  );
}

describe("5f direct video call screen", () => {
  it("puts both cameras on the room stage under the same chrome", async () => {
    const view = await renderVideoCall(createProps());

    expect(view.getByTestId("mobile-direct-video-call-screen")).toBeTruthy();
    // Equal stage tiles instead of a full-bleed remote feed with a self PiP.
    expect(view.getByTestId("mobile-voice-stage")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-participant-self")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-participant-ogi")).toBeTruthy();
    expect(view.queryByTestId("mobile-direct-video-call-pip")).toBeNull();
    // Same header, strip and dock as the answered voice call.
    expect(
      view.getByText(`${copy.directCallVideoTitle} · ${copy.directCallEncrypted}`),
    ).toBeTruthy();
    expect(view.getByTestId("mobile-voice-session-strip")).toBeTruthy();
    expect(view.getByTestId("mobile-direct-video-call-dock")).toBeTruthy();
  });

  it("routes the tile flip and the dock leave control to their handlers", async () => {
    const onFlipVoiceCamera = jest.fn(async () => undefined);
    const onLeaveVoiceChannel = jest.fn(async () => undefined);
    const view = await renderVideoCall(createProps({ onFlipVoiceCamera, onLeaveVoiceChannel }));

    // The flip button rides the self tile, the way it does in a server room.
    await fireEvent.press(view.getByTestId("mobile-voice-participant-self-flip"));
    await fireEvent.press(view.getByTestId("mobile-direct-video-call-leave"));

    expect(onFlipVoiceCamera).toHaveBeenCalledTimes(1);
    expect(onLeaveVoiceChannel).toHaveBeenCalledTimes(1);
  });

  it("keeps the controls pinned instead of hiding them behind a tap", async () => {
    const view = await renderVideoCall(createProps());

    expect(view.queryByTestId("mobile-direct-video-call-surface")).toBeNull();
    expect(view.getByTestId("mobile-direct-video-call-leave")).toBeTruthy();
  });

  it("falls back to the audience grid when every camera is off", async () => {
    const view = await renderVideoCall(
      createProps({
        voiceRoomState: createVideoCallRoom({
          participants: [
            createParticipant({ displayName: "You", isSelf: true, userId: "self", username: "me" }),
            createParticipant({ displayName: "ogi_uat", userId: "ogi", username: "ogi_uat" }),
          ],
          selfCameraEnabled: false,
        }),
      }),
    );

    expect(view.getByTestId("mobile-voice-audience")).toBeTruthy();
    expect(view.queryByTestId("mobile-voice-stage")).toBeNull();
  });
});
