import React, { useState } from "react";
import { Text } from "react-native";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

import { activeMobileCopy } from "../src/locale/mobile-locale-preferences";
import {
  MobileScreenShareViewer,
  MobileVoiceChannelScreen,
  PushToTalkButton,
  ScreenShareConsentSheet,
} from "../src/app/screens/voice-screen";
import type {
  MobileScreenShareTrackReference,
  MobileVoiceRoomParticipant,
  MobileVoiceRoomState,
} from "../src/voice/mobile-voice-room-contract";

const copy = activeMobileCopy;

function createParticipant(
  overrides: Partial<MobileVoiceRoomParticipant> = {},
): MobileVoiceRoomParticipant {
  return {
    audioLevel: 0,
    avatarUrl: null,
    displayName: "Ada Lovelace",
    isCameraEnabled: false,
    isMuted: false,
    isScreenSharing: false,
    isSelf: false,
    isSpeaking: false,
    userId: "user-ada",
    username: "ada",
    ...overrides,
  };
}

function createConnectedVoiceRoom(
  overrides: Partial<MobileVoiceRoomState> = {},
): MobileVoiceRoomState {
  return {
    channelId: "voice-general",
    channelName: "General Voice",
    errorMessage: null,
    participants: [createParticipant({ isSelf: true, userId: "self", username: "me" })],
    screenShareStatus: "off",
    selfAudioOutput: "default",
    selfCameraEnabled: false,
    selfMuted: false,
    selfScreenShareEnabled: false,
    serverId: "server-1",
    sessionId: "session-1",
    status: "connected",
    updatedAt: 1,
    ...overrides,
  };
}

function PushToTalkHarness() {
  const [phase, setPhase] = useState<"holding" | "idle" | "release-cushion">("idle");

  return (
    <PushToTalkButton
      disabled={false}
      inputMode="push-to-talk"
      phase={phase}
      onBegin={async () => {
        setPhase("holding");
      }}
      onEnd={() => {
        setPhase("release-cushion");
      }}
    />
  );
}

describe("mobile voice component rendering", () => {
  it("updates the push-to-talk label and accessibility state while the user holds and releases", async () => {
    const view = await render(<PushToTalkHarness />);

    const button = view.getByLabelText(copy.voicePushToTalkAccessibilityLabel);
    expect(button.props.accessibilityState).toEqual(
      expect.objectContaining({ busy: false, disabled: false, selected: false }),
    );
    expect(view.getByText(copy.voicePushToTalkHoldAction)).toBeTruthy();

    await fireEvent(button, "pressIn");
    expect(view.getByText(copy.voicePushToTalkHolding)).toBeTruthy();
    expect(view.getByLabelText(copy.voicePushToTalkAccessibilityLabel).props.accessibilityState)
      .toEqual(expect.objectContaining({ busy: false, selected: true }));

    await fireEvent(view.getByLabelText(copy.voicePushToTalkAccessibilityLabel), "pressOut");
    expect(view.getByText(copy.voicePushToTalkReleaseCushion)).toBeTruthy();
    expect(view.getByLabelText(copy.voicePushToTalkAccessibilityLabel).props.accessibilityState)
      .toEqual(expect.objectContaining({ busy: true, selected: true }));
  });

  it("hides push-to-talk controls outside push-to-talk input mode", async () => {
    const view = await render(
      <PushToTalkButton
        disabled={false}
        inputMode="voice-activity"
        phase="idle"
        onBegin={async () => undefined}
        onEnd={() => undefined}
      />,
    );

    expect(view.queryByLabelText(copy.voicePushToTalkAccessibilityLabel)).toBeNull();
  });

  it("dismisses the screen-share consent sheet through the cancel action", async () => {
    function ConsentHarness() {
      const [visible, setVisible] = useState(true);

      return (
        <>
          <ScreenShareConsentSheet
            visible={visible}
            onCancel={() => setVisible(false)}
            onConfirm={() => undefined}
          />
          {!visible ? <TextMarker label="consent-dismissed" /> : null}
        </>
      );
    }

    const view = await render(<ConsentHarness />);

    expect(view.getByText(copy.voiceScreenShareConsentTitle)).toBeTruthy();
    await fireEvent.press(view.getByLabelText(copy.voiceScreenShareConsentCancel));

    expect(view.queryByText(copy.voiceScreenShareConsentTitle)).toBeNull();
    expect(view.getByText("consent-dismissed")).toBeTruthy();
  });

  it("confirms the screen-share consent sheet and records the user action", async () => {
    function ConsentHarness() {
      const [confirmed, setConfirmed] = useState(false);
      const [visible, setVisible] = useState(true);

      return (
        <>
          <ScreenShareConsentSheet
            visible={visible}
            onCancel={() => undefined}
            onConfirm={() => {
              setConfirmed(true);
              setVisible(false);
            }}
          />
          {confirmed ? <TextMarker label="screen-share-confirmed" /> : null}
        </>
      );
    }

    const view = await render(<ConsentHarness />);

    await fireEvent.press(view.getByLabelText(copy.voiceScreenShareConsentConfirm));

    expect(view.queryByText(copy.voiceScreenShareConsentTitle)).toBeNull();
    expect(view.getByText("screen-share-confirmed")).toBeTruthy();
  });

  it("renders the screen-share viewer expand action disabled until a video track exists", async () => {
    const view = await render(
      <MobileScreenShareViewer
        participants={[createParticipant({ isScreenSharing: true, screenShareTrackRef: undefined })]}
      />,
    );

    const expandButton = view.getByLabelText(copy.voiceScreenShareExpandViewerAction);
    expect(expandButton.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );

    await fireEvent.press(expandButton);
    expect(view.queryByLabelText(copy.voiceScreenShareCloseViewerAction)).toBeNull();
  });

  it("opens the screen-share viewer when a remote video track is available", async () => {
    const trackRef = {
      participant: {},
      publication: {},
      source: "screen_share",
    } as MobileScreenShareTrackReference;

    const view = await render(
      <MobileScreenShareViewer
        participants={[
          createParticipant({
            isScreenSharing: true,
            screenShareTrackRef: trackRef,
          }),
        ]}
      />,
    );

    await fireEvent.press(view.getByLabelText(copy.voiceScreenShareExpandViewerAction));

    expect(view.getByLabelText(copy.voiceScreenShareCloseViewerAction)).toBeTruthy();
    expect(view.getAllByTestId("mobile-livekit-video-track").length).toBeGreaterThan(0);
  });

  it("disables the microphone control when the voice channel is in push-to-talk mode", async () => {
    const onToggleMute = jest.fn();

    const view = await render(
      <MobileVoiceChannelScreen
        channel={{ id: "voice-general", name: "General Voice", type: "VOICE" } as never}
        inviteCandidates={[]}
        inviteSendStates={{}}
        locale="tr"
        memberCount={3}
        onBack={() => undefined}
        onBeginPushToTalk={async () => undefined}
        onEndPushToTalk={() => undefined}
        onLeave={async () => undefined}
        onSelectAudioOutput={async () => undefined}
        onSendInvite={() => undefined}
        onToggleCamera={async () => undefined}
        onToggleMute={async () => {
          onToggleMute();
        }}
        onToggleScreenShare={async () => undefined}
        room={createConnectedVoiceRoom()}
        serverIconUrl={null}
        serverName="Whispr HQ"
        serverShortName="WH"
        voiceInputMode="push-to-talk"
        voicePushToTalkPhase="idle"
      />,
    );

    const microphoneButton = view.getByLabelText(copy.voiceInputModePushToTalk);
    expect(microphoneButton.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );

    await fireEvent.press(microphoneButton);
    expect(onToggleMute).not.toHaveBeenCalled();
  });
});

function TextMarker({ label }: { label: string }) {
  return <Text>{label}</Text>;
}
