import React, { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
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

import { activeMobileCopy } from "../src/locale/mobile-locale-preferences";
import {
  MobileScreenShareViewer,
  PushToTalkButton,
  ScreenShareConsentSheet,
  VoiceScreen,
} from "../src/app/screens/voice-screen";
import { createInitialMobileVoiceRuntimeState } from "../src/voice/mobile-voice-contract";
import { MobileVoiceCameraGrid } from "../src/voice/mobile-camera-grid";
import { MobileVoiceSettingsSheet } from "../src/voice/mobile-voice-settings-sheet";
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
    availableAudioInputs: [],
    availableAudioOutputs: [],
    cameraFacingMode: "user",
    channelId: "voice-general",
    channelName: "General Voice",
    errorMessage: null,
    noiseSuppressionEnabled: true,
    participants: [createParticipant({ isSelf: true, userId: "self", username: "me" })],
    screenShareStatus: "off",
    selectedAudioInputId: null,
    selectedAudioOutputId: null,
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

function createVoiceScreenProps(
  overrides: Partial<React.ComponentProps<typeof VoiceScreen>> = {},
): React.ComponentProps<typeof VoiceScreen> {
  return {
    onLeaveVoiceChannel: async () => undefined,
    onToggleVoiceMute: async () => undefined,
    testID: "mobile-voice-room-screen",
    voiceRoomState: createConnectedVoiceRoom({
      participants: [
        createParticipant({ isSpeaking: true, userId: "speaker" }),
        createParticipant({ isMuted: true, userId: "muted" }),
      ],
    }),
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
  it("renders the active-room controls and real speaking and muted participant states", async () => {
    const view = await render(<VoiceScreen {...createVoiceScreenProps()} />);

    expect(view.getByTestId("mobile-voice-room-screen")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-minimize")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-participant-speaker")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-participant-muted-muted-badge")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-mute-toggle")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-audio-output")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-chat")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-leave")).toBeTruthy();
  });

  it("shows the real DM title for a direct call without a server", async () => {
    const view = await render(
      <VoiceScreen
        {...createVoiceScreenProps({
          serverName: null,
          voiceRoomState: createConnectedVoiceRoom({
            channelId: null,
            channelName: "Ada Lovelace",
            conversationId: "conversation-1",
            participants: [
              createParticipant({
                displayName: "Current user",
                isSelf: true,
                userId: "self",
                username: "me",
              }),
            ],
            serverId: null,
            sessionMode: "direct",
          }),
        })}
      />,
    );

    expect(view.getByText("Ada Lovelace")).toBeTruthy();
  });

  it("minimizes and routes the active-room controls through their existing actions", async () => {
    const onLeaveVoiceChannel = jest.fn(async () => undefined);
    const onMinimize = jest.fn();
    const onOpenChat = jest.fn();
    const onSelectVoiceAudioOutput = jest.fn(async () => undefined);
    const onToggleVoiceMute = jest.fn(async () => undefined);
    const view = await render(
      <VoiceScreen
        {...createVoiceScreenProps({
          onLeaveVoiceChannel,
          onMinimize,
          onOpenChat,
          onSelectVoiceAudioOutput,
          onToggleVoiceMute,
        })}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-voice-minimize"));
    await fireEvent.press(view.getByTestId("mobile-voice-mute-toggle"));
    await fireEvent.press(view.getByTestId("mobile-voice-audio-output"));
    await fireEvent.press(view.getByTestId("mobile-voice-chat"));
    await fireEvent.press(view.getByTestId("mobile-voice-leave"));

    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(onToggleVoiceMute).toHaveBeenCalledTimes(1);
    expect(onSelectVoiceAudioOutput).toHaveBeenCalledWith("speaker");
    expect(onOpenChat).toHaveBeenCalledTimes(1);
    expect(onLeaveVoiceChannel).toHaveBeenCalledTimes(1);
  });

  it("opens the inline invite sheet with online members instead of leaving the room", async () => {
    const onSendInvite = jest.fn();
    const view = await render(
      <VoiceScreen
        {...createVoiceScreenProps({
          inviteCandidates: [
            {
              avatarUrl: null,
              label: "Grace Hopper",
              status: "ONLINE",
              userId: "grace",
              username: "grace",
            },
          ],
          onSendInvite,
        })}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-voice-invite"));
    expect(view.getByText(copy.voiceInviteSheetSubtitle)).toBeTruthy();

    await fireEvent.press(view.getByLabelText(`${copy.voiceInviteAction}: Grace Hopper`));
    expect(onSendInvite).toHaveBeenCalledWith("grace");
  });

  it("renders bounded camera tracks and exposes the camera flip action", async () => {
    const trackRef = {
      participant: {},
      publication: {},
      source: "camera",
    } as MobileVoiceRoomParticipant["cameraTrackRef"];
    const view = await render(
      <MobileVoiceCameraGrid
        canFlip
        onFlip={() => undefined}
        participants={[
          createParticipant({ cameraTrackRef: trackRef, isCameraEnabled: true, isSelf: true }),
        ]}
      />,
    );

    expect(view.getByTestId("mobile-voice-camera-grid")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-camera-flip")).toBeTruthy();
    expect(view.getByTestId("mobile-livekit-video-track")).toBeTruthy();
  });

  it("renders device choices and a persisted noise toggle in the voice settings sheet", async () => {
    const onSelectNoiseSuppression = jest.fn();
    const view = await render(
      <MobileVoiceSettingsSheet
        audioInputs={[{ id: "mic-1", kind: "audioinput", label: "Phone microphone" }]}
        audioOutputs={[{ id: "speaker", kind: "audiooutput", labelKey: "speaker" }]}
        noiseSuppressionEnabled
        onClose={() => undefined}
        onRefresh={() => undefined}
        onSelectAudioInput={() => undefined}
        onSelectAudioOutput={() => undefined}
        onSelectNoiseSuppression={onSelectNoiseSuppression}
        open
        selectedAudioInputId="mic-1"
        selectedAudioOutputId="speaker"
      />,
    );

    expect(view.getByTestId("mobile-voice-device-sheet-panel")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-device-refresh")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-voice-noise-toggle"));
    expect(onSelectNoiseSuppression).toHaveBeenCalledWith(false);
  });

  it("updates the push-to-talk label and accessibility state while the user holds and releases", async () => {
    const view = await render(<PushToTalkHarness />);

    const button = view.getByLabelText(copy.voicePushToTalkAccessibilityLabel);
    expect(button.props.accessibilityState).toEqual(
      expect.objectContaining({ busy: false, disabled: false, selected: false }),
    );
    expect(view.getByText(copy.voicePushToTalkHoldAction)).toBeTruthy();

    await fireEvent(button, "pressIn");
    expect(view.getByText(copy.voicePushToTalkHolding)).toBeTruthy();
    expect(
      view.getByLabelText(copy.voicePushToTalkAccessibilityLabel).props.accessibilityState,
    ).toEqual(expect.objectContaining({ busy: false, selected: true }));

    await fireEvent(view.getByLabelText(copy.voicePushToTalkAccessibilityLabel), "pressOut");
    expect(view.getByText(copy.voicePushToTalkReleaseCushion)).toBeTruthy();
    expect(
      view.getByLabelText(copy.voicePushToTalkAccessibilityLabel).props.accessibilityState,
    ).toEqual(expect.objectContaining({ busy: true, selected: true }));
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
        participants={[
          createParticipant({ isScreenSharing: true, screenShareTrackRef: undefined }),
        ]}
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

  it("keeps the fullscreen screen-share stream above an Android three-button navigation bar", async () => {
    const trackRef = {
      participant: {},
      publication: {},
      source: "screen_share",
    } as MobileScreenShareTrackReference;

    const view = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 844, width: 390, x: 0, y: 0 },
          insets: { bottom: 48, left: 0, right: 0, top: 42 },
        }}
      >
        <MobileScreenShareViewer
          participants={[createParticipant({ isScreenSharing: true, screenShareTrackRef: trackRef })]}
        />
      </SafeAreaProvider>,
    );

    await fireEvent.press(view.getByLabelText(copy.voiceScreenShareExpandViewerAction));

    // The viewer is its own modal window, so the shell's reservation misses it.
    expect(
      StyleSheet.flatten(
        view.getByTestId("mobile-voice-screen-share-fullscreen").props.style as never,
      ),
    ).toMatchObject({ paddingBottom: 48 });
  });
});

function TextMarker({ label }: { label: string }) {
  return <Text>{label}</Text>;
}
