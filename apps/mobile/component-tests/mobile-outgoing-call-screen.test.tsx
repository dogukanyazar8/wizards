import React from "react";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import {
  MobileOutgoingVideoCallScreen,
  MobileOutgoingVoiceCallScreen,
} from "../src/app/screens/mobile-outgoing-call-screen";
import type {
  MobileVoiceRoomParticipant,
  MobileVoiceRoomState,
} from "../src/voice/mobile-voice-room-contract";

const cameraTrackRef = {
  participant: {},
  publication: {},
  source: "camera",
} as MobileVoiceRoomParticipant["cameraTrackRef"];

function createRingingRoom(overrides: Partial<MobileVoiceRoomState> = {}): MobileVoiceRoomState {
  return {
    availableAudioInputs: [],
    availableAudioOutputs: [],
    cameraFacingMode: "user",
    channelId: null,
    channelName: "ogi_uat",
    conversationId: "conversation-1",
    connectedAt: null,
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
    sessionMode: "direct",
    sessionId: "session-1",
    status: "connecting",
    updatedAt: 1,
    ...overrides,
  };
}

describe("7a outgoing voice call screen", () => {
  it("rings inside the room chrome: header, session strip and callee card", async () => {
    const view = await render(
      <MobileOutgoingVoiceCallScreen
        calleeName="ogi_uat"
        onCancelCall={jest.fn()}
        onToggleVoiceMute={async () => undefined}
        voiceRoomState={createRingingRoom()}
      />,
    );

    expect(view.getByTestId("mobile-outgoing-voice-call-screen")).toBeTruthy();
    expect(view.getAllByText("ogi_uat").length).toBeGreaterThan(0);
    expect(view.getByText(`${copy.directCallTitle} · ${copy.directCallEncrypted}`)).toBeTruthy();
    expect(view.getByText(copy.directCallEncryptedBadge)).toBeTruthy();
    // The strip carries the ringing state the room would use for its connection.
    expect(view.getByTestId("mobile-voice-session-strip")).toBeTruthy();
    expect(view.getAllByText(copy.directCallRingingVoice).length).toBeGreaterThan(0);
    expect(view.getByTestId("mobile-outgoing-call-pulse")).toBeTruthy();
    expect(view.getByText(copy.directCallLeaveMessageHint)).toBeTruthy();
  });

  it("cancels the call from the dock and keeps screen sharing disabled while ringing", async () => {
    const onCancelCall = jest.fn();
    const view = await render(
      <MobileOutgoingVoiceCallScreen
        calleeName="ogi_uat"
        onCancelCall={onCancelCall}
        onToggleVoiceMute={async () => undefined}
        voiceRoomState={createRingingRoom()}
      />,
    );

    expect(
      view.getByTestId("mobile-outgoing-call-screen-share").props.accessibilityState,
    ).toMatchObject({ disabled: true });

    await fireEvent.press(view.getByTestId("mobile-outgoing-call-cancel"));
    expect(onCancelCall).toHaveBeenCalledTimes(1);
  });

  it("toggles microphone and speaker through the waiting dock", async () => {
    const onToggleVoiceMute = jest.fn(async () => undefined);
    const onSelectVoiceAudioOutput = jest.fn(async () => undefined);
    const view = await render(
      <MobileOutgoingVoiceCallScreen
        calleeName="ogi_uat"
        onCancelCall={jest.fn()}
        onSelectVoiceAudioOutput={onSelectVoiceAudioOutput}
        onToggleVoiceMute={onToggleVoiceMute}
        voiceRoomState={createRingingRoom()}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-outgoing-call-mic"));
    await fireEvent.press(view.getByTestId("mobile-outgoing-call-speaker"));

    expect(onToggleVoiceMute).toHaveBeenCalledTimes(1);
    expect(onSelectVoiceAudioOutput).toHaveBeenCalledWith("speaker");
  });

  it("hides the noise toggle until a handler is wired", async () => {
    const view = await render(
      <MobileOutgoingVoiceCallScreen
        calleeName="ogi_uat"
        onCancelCall={jest.fn()}
        onToggleVoiceMute={async () => undefined}
        voiceRoomState={createRingingRoom()}
      />,
    );

    expect(view.queryByTestId("mobile-voice-noise-toggle")).toBeNull();
  });
});

describe("7b outgoing video call screen", () => {
  it("labels the video ring and keeps the callee card until a camera goes live", async () => {
    const view = await render(
      <MobileOutgoingVideoCallScreen
        calleeName="ogi_uat"
        onCancelCall={jest.fn()}
        onToggleVoiceMute={async () => undefined}
        voiceRoomState={createRingingRoom()}
      />,
    );

    expect(view.getByTestId("mobile-outgoing-video-call-screen")).toBeTruthy();
    expect(
      view.getByText(`${copy.directCallVideoTitle} · ${copy.directCallEncrypted}`),
    ).toBeTruthy();
    expect(view.getAllByText(copy.directCallRingingVideo).length).toBeGreaterThan(0);
    expect(view.getByTestId("mobile-outgoing-video-call-callee")).toBeTruthy();
    // The voice-only hint belongs to 7a.
    expect(view.queryByText(copy.directCallLeaveMessageHint)).toBeNull();
  });

  it("hands the stage to the self camera once it publishes", async () => {
    const view = await render(
      <MobileOutgoingVideoCallScreen
        calleeName="ogi_uat"
        onCancelCall={jest.fn()}
        onToggleVoiceMute={async () => undefined}
        voiceRoomState={createRingingRoom({
          participants: [
            {
              audioLevel: 0,
              avatarUrl: null,
              cameraTrackRef,
              displayName: "You",
              isCameraEnabled: true,
              isMuted: false,
              isScreenSharing: false,
              isSelf: true,
              isSpeaking: false,
              userId: "self",
              username: "me",
            },
          ],
          selfCameraEnabled: true,
        })}
      />,
    );

    expect(view.getByTestId("mobile-voice-stage")).toBeTruthy();
    expect(view.queryByTestId("mobile-outgoing-video-call-callee")).toBeNull();
  });

  it("flips the camera from the self stage tile", async () => {
    const onFlipVoiceCamera = jest.fn(async () => undefined);
    const view = await render(
      <MobileOutgoingVideoCallScreen
        calleeName="ogi_uat"
        onCancelCall={jest.fn()}
        onFlipVoiceCamera={onFlipVoiceCamera}
        onToggleVoiceMute={async () => undefined}
        voiceRoomState={createRingingRoom({
          participants: [
            {
              audioLevel: 0,
              avatarUrl: null,
              cameraTrackRef,
              displayName: "You",
              isCameraEnabled: true,
              isMuted: false,
              isScreenSharing: false,
              isSelf: true,
              isSpeaking: false,
              userId: "self",
              username: "me",
            },
          ],
          selfCameraEnabled: true,
        })}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-voice-participant-self-flip"));
    expect(onFlipVoiceCamera).toHaveBeenCalledTimes(1);
  });
});
