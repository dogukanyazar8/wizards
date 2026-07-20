import React from "react";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import {
  MobileOutgoingVideoCallScreen,
  MobileOutgoingVoiceCallScreen,
} from "../src/app/screens/mobile-outgoing-call-screen";
import { createMobileOutgoingCallStyles } from "../src/app/screens/mobile-outgoing-call-screen.styles";
import { darkTheme } from "../src/design/themes";
import type { MobileVoiceRoomState } from "../src/voice/mobile-voice-room-contract";

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
  it("shows the callee, the ringing status and the encryption badge", async () => {
    const view = await render(
      <MobileOutgoingVoiceCallScreen
        calleeName="ogi_uat"
        onCancelCall={jest.fn()}
        onToggleVoiceMute={async () => undefined}
        voiceRoomState={createRingingRoom()}
      />,
    );

    expect(view.getByTestId("mobile-outgoing-voice-call-screen")).toBeTruthy();
    expect(view.getByText(copy.directCallTitle)).toBeTruthy();
    expect(view.getByText(copy.directCallEncrypted)).toBeTruthy();
    expect(view.getByText(copy.directCallEncryptedBadge)).toBeTruthy();
    expect(view.getByText("ogi_uat")).toBeTruthy();
    expect(view.getByText(copy.directCallRingingVoice)).toBeTruthy();
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

    expect(view.getByTestId("mobile-outgoing-call-screen-share").props.accessibilityState).toMatchObject(
      { disabled: true },
    );

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

  it("locks the 7a avatar and dock geometry to the handoff values", () => {
    const styles = createMobileOutgoingCallStyles(darkTheme);

    expect(styles.avatar).toMatchObject({ borderRadius: 44, height: 128, width: 128 });
    expect(styles.avatarRingNear).toMatchObject({ borderRadius: 52, borderWidth: 2, top: -20 });
    expect(styles.avatarRingMid).toMatchObject({ borderRadius: 68, top: -38 });
    expect(styles.avatarRingFar).toMatchObject({ borderRadius: 84, top: -56 });
    expect(styles.dock).toMatchObject({ borderRadius: 28, marginHorizontal: 16 });
    expect(styles.dockButton).toMatchObject({ borderRadius: 20, height: 56, width: 56 });
    expect(styles.screen.backgroundColor).toBe(darkTheme.surface.voiceRoom);
  });
});

describe("7b outgoing video call screen", () => {
  it("labels the video ring and hides the preview chip until the camera is on", async () => {
    const view = await render(
      <MobileOutgoingVideoCallScreen
        calleeName="ogi_uat"
        onCancelCall={jest.fn()}
        onToggleVoiceMute={async () => undefined}
        voiceRoomState={createRingingRoom()}
      />,
    );

    expect(view.getByTestId("mobile-outgoing-video-call-screen")).toBeTruthy();
    expect(view.getByText(copy.directCallVideoTitle)).toBeTruthy();
    expect(view.getByText(copy.directCallRingingVideo)).toBeTruthy();
    expect(view.queryByTestId("mobile-outgoing-video-call-preview-chip")).toBeNull();
  });

  it("shows the self-preview chip and enables the flip control with the camera on", async () => {
    const view = await render(
      <MobileOutgoingVideoCallScreen
        calleeName="ogi_uat"
        onCancelCall={jest.fn()}
        onToggleVoiceMute={async () => undefined}
        voiceRoomState={createRingingRoom({ selfCameraEnabled: true })}
      />,
    );

    expect(view.getByTestId("mobile-outgoing-video-call-preview-chip")).toBeTruthy();
    expect(view.getByText(copy.directCallCameraPreviewHint)).toBeTruthy();
    expect(view.getByTestId("mobile-outgoing-video-call-flip").props.accessibilityState).toMatchObject(
      { disabled: false },
    );
  });

  it("locks the 7b callee card and glass dock to the handoff values", () => {
    const styles = createMobileOutgoingCallStyles(darkTheme);

    expect(styles.videoScreen.backgroundColor).toBe(darkTheme.surface.voiceRoomVideo);
    expect(styles.videoCallee).toMatchObject({ top: 210, gap: 16 });
    expect(styles.videoAvatar).toMatchObject({ borderRadius: 34, height: 96, width: 96 });
    expect(styles.videoAvatarRingNear).toMatchObject({ borderRadius: 42, top: -16 });
    expect(styles.videoAvatarRingFar).toMatchObject({ borderRadius: 54, top: -30 });
    expect(styles.videoPreviewChip).toMatchObject({ bottom: 214 });
    expect(styles.dockGlass).toMatchObject({ bottom: 16, left: 16, right: 16 });
  });
});
