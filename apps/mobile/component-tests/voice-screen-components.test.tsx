import React, { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { act, fireEvent } from "@testing-library/react-native";
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
import { lightTheme } from "../src/design/themes";
import { ToastProvider } from "../src/app/components/kit/toast";
import { TOGGLE_TRACK_HEIGHT, TOGGLE_TRACK_WIDTH } from "../src/app/components/kit/toggle";
import {
  MobileScreenShareViewer,
  PushToTalkButton,
  ScreenShareConsentSheet,
  VoiceScreen,
} from "../src/app/screens/voice-screen";
import { createInitialMobileVoiceRuntimeState } from "../src/voice/mobile-voice-contract";
import {
  getMobileVoiceInputMeterSegments,
  MobileVoiceSettingsSheet,
} from "../src/voice/mobile-voice-settings-sheet";
import type {
  MobileScreenShareTrackReference,
  MobileVoiceRoomParticipant,
  MobileVoiceRoomState,
} from "../src/voice/mobile-voice-room-contract";

const copy = activeMobileCopy;

/** A subscribed camera publication, minus the livekit machinery the UI never reads. */
function createCameraTrackRef(): MobileVoiceRoomParticipant["cameraTrackRef"] {
  return {
    participant: {},
    publication: { dimensions: { height: 720, width: 1280 } },
    source: "camera",
  } as MobileVoiceRoomParticipant["cameraTrackRef"];
}

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

/** The room raises a toast when noise suppression flips, so it needs the runtime. */
function renderVoiceScreen(props: React.ComponentProps<typeof VoiceScreen>) {
  return render(
    <ToastProvider>
      <VoiceScreen {...props} />
    </ToastProvider>,
  );
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
    const view = await renderVoiceScreen(createVoiceScreenProps());

    expect(view.getByTestId("mobile-voice-room-screen")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-minimize")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-participant-speaker")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-participant-muted-status-badge")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-mute-toggle")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-audio-output")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-leave")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-session-strip")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-noise-toggle")).toBeTruthy();
    expect(view.queryByTestId("mobile-voice-noise-badge")).toBeNull();
    expect(view.queryByTestId("mobile-voice-chat")).toBeNull();
    expect(view.getByTestId("mobile-voice-settings")).toBeTruthy();
    expect(view.queryByText(copy.voiceRoomPermissionFootnote)).toBeNull();
  });

  it("reflects the noise-suppression state in the session-strip switch", async () => {
    const on = await renderVoiceScreen(createVoiceScreenProps());
    expect(on.getByTestId("mobile-voice-noise-toggle").props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );
    expect(on.getByLabelText(copy.voiceRoomNoiseOnAccessibility)).toBeTruthy();

    const off = await renderVoiceScreen(
      createVoiceScreenProps({
        voiceRoomState: createConnectedVoiceRoom({
          noiseSuppressionEnabled: false,
          participants: [createParticipant({ isSelf: true, userId: "self", username: "me" })],
        }),
      }),
    );
    expect(off.getByLabelText(copy.voiceRoomNoiseOffAccessibility)).toBeTruthy();
    expect(off.getByTestId("mobile-voice-noise-toggle").props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false }),
    );

    // The room keeps its green "on" state while sharing the app-wide switch shape.
    const onTrack = StyleSheet.flatten(on.getByTestId("mobile-voice-noise-toggle").props.style);
    expect(onTrack.backgroundColor).toBe(lightTheme.voiceRoom.success);
    expect(onTrack).toMatchObject({ height: TOGGLE_TRACK_HEIGHT, width: TOGGLE_TRACK_WIDTH });
  });

  it("applies the noise-suppression switch immediately and confirms it with a toast", async () => {
    const onSelectVoiceNoiseSuppression = jest.fn(async () => undefined);
    const view = await renderVoiceScreen(createVoiceScreenProps({ onSelectVoiceNoiseSuppression }));

    await fireEvent.press(view.getByTestId("mobile-voice-noise-toggle"));

    expect(onSelectVoiceNoiseSuppression).toHaveBeenCalledWith(false);
    expect(view.getByText(copy.voiceRoomNoiseOffToast)).toBeTruthy();
  });

  it("lays the header out as back, channel identity, and a single invite pill", async () => {
    const view = await renderVoiceScreen(createVoiceScreenProps({ serverName: "Test" }));

    expect(view.getByText("General Voice")).toBeTruthy();
    expect(view.getByText(`Test · ${copy.voiceRoomChannelTypeLabel}`)).toBeTruthy();
    expect(view.getByText(copy.voiceRoomInviteAction)).toBeTruthy();
    expect(view.getAllByTestId("mobile-voice-invite")).toHaveLength(1);
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-voice-minimize").props.style as never),
    ).toMatchObject({ borderRadius: 13, height: 36, width: 36 });
  });

  it("carries the connection state and the elapsed session time in one strip", async () => {
    const connected = await renderVoiceScreen(
      createVoiceScreenProps({
        voiceRoomState: createConnectedVoiceRoom({ connectedAt: Date.now() - 112_000 }),
      }),
    );

    expect(connected.getByText(copy.voiceRoomConnectionConnected)).toBeTruthy();
    expect(connected.getByText("1:52")).toBeTruthy();

    const reconnecting = await renderVoiceScreen(
      createVoiceScreenProps({
        voiceRoomState: createConnectedVoiceRoom({
          connectedAt: Date.now() - 112_000,
          status: "reconnecting",
        }),
      }),
    );

    expect(reconnecting.getByText(copy.voiceRoomConnectionReconnecting)).toBeTruthy();
  });

  it("advances the session clock every second while the room is connected", async () => {
    jest.useFakeTimers();

    try {
      const view = await renderVoiceScreen(
        createVoiceScreenProps({
          voiceRoomState: createConnectedVoiceRoom({ connectedAt: Date.now() - 5_000 }),
        }),
      );

      expect(view.getByText("0:05")).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(2_000);
      });
      expect(view.getByText("0:07")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("freezes the elapsed session time while the room is reconnecting", async () => {
    jest.useFakeTimers();

    try {
      const view = await renderVoiceScreen(
        createVoiceScreenProps({
          voiceRoomState: createConnectedVoiceRoom({
            connectedAt: Date.now() - 5_000,
            status: "reconnecting",
          }),
        }),
      );

      expect(view.getByText("0:05")).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(3_000);
      });
      expect(view.getByText("0:05")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("draws the one-person room as a solo card with a live status badge", async () => {
    const view = await renderVoiceScreen(
      createVoiceScreenProps({
        voiceRoomState: createConnectedVoiceRoom({
          participants: [
            createParticipant({ displayName: "DGKNYZR", isSelf: true, userId: "self" }),
          ],
        }),
      }),
    );

    expect(view.getByText("DGKNYZR")).toBeTruthy();
    expect(view.getByText(copy.voiceRoomListening)).toBeTruthy();
    expect(
      StyleSheet.flatten(
        view.getByTestId("mobile-voice-participant-self-status-badge").props.style as never,
      ),
    ).toMatchObject({ borderWidth: 3, height: 30, width: 30 });
  });

  it("follows the real audio route on the dock icon and the self badge", async () => {
    const headset = await renderVoiceScreen(
      createVoiceScreenProps({
        voiceRoomState: createConnectedVoiceRoom({
          availableAudioOutputs: [
            { id: "default", kind: "audiooutput", labelKey: "default" },
            { id: "headset", kind: "audiooutput", labelKey: "headset" },
          ],
          participants: [createParticipant({ isSelf: true, userId: "self" })],
        }),
      }),
    );

    expect(headset.getByLabelText(copy.voiceRoomOutputHeadsetA11y)).toBeTruthy();

    // The headset is gone and the speaker is off: the room is on the earpiece.
    const earpiece = await renderVoiceScreen(
      createVoiceScreenProps({
        voiceRoomState: createConnectedVoiceRoom({
          availableAudioOutputs: [
            { id: "default", kind: "audiooutput", labelKey: "default" },
            { id: "earpiece", kind: "audiooutput", labelKey: "earpiece" },
          ],
          participants: [createParticipant({ isSelf: true, userId: "self" })],
        }),
      }),
    );

    expect(earpiece.getByLabelText(copy.voiceRoomOutputEarpieceA11y)).toBeTruthy();
    expect(earpiece.queryByLabelText(copy.voiceRoomOutputHeadsetA11y)).toBeNull();
  });

  it("fills the microphone control while the user is muted", async () => {
    const muted = await renderVoiceScreen(
      createVoiceScreenProps({
        voiceRoomState: createConnectedVoiceRoom({
          participants: [createParticipant({ isSelf: true, userId: "self" })],
          selfMuted: true,
        }),
      }),
    );
    const live = await renderVoiceScreen(createVoiceScreenProps());

    const mutedStyle = StyleSheet.flatten(
      muted.getByTestId("mobile-voice-mute-toggle").props.style as never,
    ) as { backgroundColor: string };
    const liveStyle = StyleSheet.flatten(
      live.getByTestId("mobile-voice-mute-toggle").props.style as never,
    ) as { backgroundColor: string };

    expect(mutedStyle.backgroundColor).not.toEqual(liveStyle.backgroundColor);
    expect(muted.getByLabelText(copy.voiceUnmuteAction)).toBeTruthy();
  });

  it("lays out camera publishers as stage tiles and sends mic-only members to the rail", async () => {
    const trackRef = {
      participant: {},
      publication: {},
      source: "camera",
    } as MobileVoiceRoomParticipant["cameraTrackRef"];
    const view = await renderVoiceScreen(
      createVoiceScreenProps({
        voiceRoomState: createConnectedVoiceRoom({
          participants: [
            createParticipant({
              cameraTrackRef: trackRef,
              isCameraEnabled: true,
              isSelf: true,
              joinedAt: 1,
              userId: "self",
              username: "me",
            }),
            createParticipant({ joinedAt: 2, userId: "listener", username: "ada" }),
          ],
        }),
      }),
    );

    expect(view.getByTestId("mobile-voice-stage")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-participant-self")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-participant-self-flip")).toBeTruthy();
    expect(view.getByTestId("mobile-livekit-video-track")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-rail-listener")).toBeTruthy();
  });

  it("promotes a screen share to a stage tile that opens the fullscreen viewer", async () => {
    const trackRef = {
      participant: {},
      publication: {},
      source: "screen_share",
    } as MobileScreenShareTrackReference;
    const view = await renderVoiceScreen(
      createVoiceScreenProps({
        voiceRoomState: createConnectedVoiceRoom({
          participants: [
            createParticipant({
              isScreenSharing: true,
              isSelf: true,
              joinedAt: 1,
              screenShareTrackRef: trackRef,
              userId: "self",
              username: "me",
            }),
          ],
        }),
      }),
    );

    const tile = view.getByTestId("mobile-voice-participant-self-screen");
    expect(tile).toBeTruthy();
    await fireEvent.press(tile);
    expect(view.getByTestId("mobile-voice-screen-share-fullscreen")).toBeTruthy();
  });

  it("shows the real DM title for a direct call without a server", async () => {
    const view = await renderVoiceScreen(
      createVoiceScreenProps({
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
      }),
    );

    expect(view.getByText("Ada Lovelace")).toBeTruthy();
  });

  it("minimizes and routes the active-room controls through their existing actions", async () => {
    const onLeaveVoiceChannel = jest.fn(async () => undefined);
    const onMinimize = jest.fn();
    const onSelectVoiceAudioOutput = jest.fn(async () => undefined);
    const onToggleVoiceMute = jest.fn(async () => undefined);
    const view = await renderVoiceScreen(
      createVoiceScreenProps({
        onLeaveVoiceChannel,
        onMinimize,
        onSelectVoiceAudioOutput,
        onToggleVoiceMute,
      }),
    );

    await fireEvent.press(view.getByTestId("mobile-voice-minimize"));
    await fireEvent.press(view.getByTestId("mobile-voice-mute-toggle"));
    await fireEvent.press(view.getByTestId("mobile-voice-audio-output"));
    await fireEvent.press(view.getByTestId("mobile-voice-leave"));

    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(onToggleVoiceMute).toHaveBeenCalledTimes(1);
    expect(onSelectVoiceAudioOutput).toHaveBeenCalledWith("speaker");
    expect(onLeaveVoiceChannel).toHaveBeenCalledTimes(1);
  });

  it("opens the inline invite sheet with online members instead of leaving the room", async () => {
    const onSendInvite = jest.fn();
    const view = await renderVoiceScreen(
      createVoiceScreenProps({
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
      }),
    );

    await fireEvent.press(view.getByTestId("mobile-voice-invite"));

    expect(view.getByText(copy.voiceInviteTitle)).toBeTruthy();
    // The header counts the room's online members instead of a nested list card.
    expect(view.getByText(copy.voiceInviteOnlineCount.replace("{count}", "1"))).toBeTruthy();
    expect(view.getByTestId("mobile-voice-invite-sheet-header-close")).toBeTruthy();

    // The whole row is the invite target, not a small trailing pill.
    await fireEvent.press(view.getByTestId("mobile-voice-invite-candidate-grace"));
    expect(onSendInvite).toHaveBeenCalledWith("grace");
  });

  it("locks an invite row once it is sent and keeps a failed one retryable", async () => {
    const onSendInvite = jest.fn();
    const view = await renderVoiceScreen(
      createVoiceScreenProps({
        inviteCandidates: [
          {
            avatarUrl: null,
            label: "Grace Hopper",
            status: "ONLINE",
            userId: "grace",
            username: "grace",
          },
          {
            avatarUrl: null,
            label: "Alan Turing",
            status: "ONLINE",
            userId: "alan",
            username: "alan",
          },
        ],
        inviteSendStates: {
          alan: {
            errorMessage: "Invite could not be delivered.",
            expiresAt: null,
            inviteId: null,
            status: "failed",
          },
          grace: { errorMessage: null, expiresAt: null, inviteId: "invite-1", status: "sent" },
        },
        onSendInvite,
      }),
    );

    await fireEvent.press(view.getByTestId("mobile-voice-invite"));

    const sent = view.getByTestId("mobile-voice-invite-candidate-grace");
    expect(sent.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(sent);
    expect(onSendInvite).not.toHaveBeenCalled();

    // A failed invite shows its reason in place of the handle and can be retried.
    expect(view.getByText("Invite could not be delivered.")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-voice-invite-candidate-alan"));
    expect(onSendInvite).toHaveBeenCalledWith("alan");
  });

  it("shows a compact empty state when nobody is online to invite", async () => {
    const view = await renderVoiceScreen(createVoiceScreenProps({ inviteCandidates: [] }));

    await fireEvent.press(view.getByTestId("mobile-voice-invite"));

    expect(view.getByTestId("mobile-voice-invite-empty")).toBeTruthy();
    expect(view.getByText(copy.voiceInviteEmpty)).toBeTruthy();
    expect(view.getByText(copy.voiceInviteSheetSubtitle)).toBeTruthy();
  });

  it("keeps a single header invite action and a pinned control dock in audio mode", async () => {
    const view = await renderVoiceScreen(createVoiceScreenProps());

    expect(view.getByTestId("mobile-voice-dock")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-audience")).toBeTruthy();
    // One button, in the header: the full-width dashed invite row is gone.
    expect(view.getByTestId("mobile-voice-invite")).toBeTruthy();
    expect(view.queryByText(copy.voiceRoomInviteFriends)).toBeNull();
  });

  it("keeps the dock at four round controls plus the leave button", async () => {
    const view = await renderVoiceScreen(createVoiceScreenProps());
    const controlIds = [
      "mobile-voice-mute-toggle",
      "mobile-voice-audio-output",
      "mobile-voice-camera",
      "mobile-voice-screen-share",
    ];

    for (const controlId of controlIds) {
      expect(StyleSheet.flatten(view.getByTestId(controlId).props.style as never)).toMatchObject({
        height: 48,
        width: 48,
      });
    }

    expect(
      StyleSheet.flatten(view.getByTestId("mobile-voice-leave").props.style as never),
    ).toMatchObject({ height: 52, width: 52 });
  });

  it("keeps the same header invite action in video mode instead of a rail duplicate", async () => {
    const trackRef = {
      participant: {},
      publication: {},
      source: "camera",
    } as MobileVoiceRoomParticipant["cameraTrackRef"];
    const view = await renderVoiceScreen(
      createVoiceScreenProps({
        voiceRoomState: createConnectedVoiceRoom({
          participants: [
            createParticipant({
              cameraTrackRef: trackRef,
              isCameraEnabled: true,
              isSelf: true,
              joinedAt: 1,
              userId: "self",
              username: "me",
            }),
            createParticipant({ joinedAt: 2, userId: "listener", username: "ada" }),
          ],
        }),
      }),
    );

    expect(view.getByTestId("mobile-voice-invite")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-dock")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-rail-listener")).toBeTruthy();
  });

  it("lays a crowded audio room out in balanced rows with every member on screen", async () => {
    const participants = ["self", "b", "c", "d", "e", "f", "g"].map((userId, index) =>
      createParticipant({
        isSelf: index === 0,
        joinedAt: index,
        userId,
        username: userId,
      }),
    );
    const view = await renderVoiceScreen(
      createVoiceScreenProps({
        voiceRoomState: createConnectedVoiceRoom({ participants }),
      }),
    );

    for (const participant of participants) {
      expect(view.getByTestId(`mobile-voice-participant-${participant.userId}`)).toBeTruthy();
    }
    expect(view.getAllByTestId(/^mobile-voice-audience-row-/)).toHaveLength(3);
  });

  it("mirrors the publisher's own front camera on the stage it actually ships", async () => {
    const view = await renderVoiceScreen(
      createVoiceScreenProps({
        voiceRoomState: createConnectedVoiceRoom({
          cameraFacingMode: "user",
          participants: [
            createParticipant({
              cameraTrackRef: createCameraTrackRef(),
              isCameraEnabled: true,
              isSelf: true,
              userId: "self",
            }),
          ],
        }),
      }),
    );

    expect(view.getByTestId("mobile-livekit-video-track").props.mirror).toBe(true);
  });

  it("never mirrors a remote tile or a rear-facing self view", async () => {
    const rearView = await renderVoiceScreen(
      createVoiceScreenProps({
        voiceRoomState: createConnectedVoiceRoom({
          cameraFacingMode: "environment",
          participants: [
            createParticipant({
              cameraTrackRef: createCameraTrackRef(),
              isCameraEnabled: true,
              isSelf: true,
              userId: "self",
            }),
          ],
        }),
      }),
    );

    expect(rearView.getByTestId("mobile-livekit-video-track").props.mirror).toBe(false);

    const remoteView = await renderVoiceScreen(
      createVoiceScreenProps({
        voiceRoomState: createConnectedVoiceRoom({
          cameraFacingMode: "user",
          participants: [
            createParticipant({
              cameraTrackRef: createCameraTrackRef(),
              isCameraEnabled: true,
              isSelf: false,
              userId: "remote-1",
            }),
          ],
        }),
      }),
    );

    expect(remoteView.getByTestId("mobile-livekit-video-track").props.mirror).toBe(false);
  });

  it("pins the visible stage page to the top layer and releases the page behind it", async () => {
    // livekit's VideoQuality: LOW 0, MEDIUM 1, HIGH 2.
    const setVideoQuality = Array.from({ length: 5 }, () => jest.fn());
    const participants = setVideoQuality.map((mock, index) =>
      createParticipant({
        cameraTrackRef: {
          participant: {},
          publication: {
            dimensions: { height: 720, width: 1280 },
            isSubscribed: true,
            setVideoQuality: mock,
          },
          source: "camera",
        },
        isCameraEnabled: true,
        userId: `user-${index}`,
        username: `user-${index}`,
      } as Partial<MobileVoiceRoomParticipant>),
    );

    await renderVoiceScreen(
      createVoiceScreenProps({
        voiceRoomState: createConnectedVoiceRoom({ participants }),
      }),
    );

    // Four tiles fit a page; the first four are on screen, the fifth is not.
    expect(setVideoQuality[0]).toHaveBeenCalledWith(2);
    expect(setVideoQuality[3]).toHaveBeenCalledWith(2);
    expect(setVideoQuality[4]).toHaveBeenCalledWith(1);
  });

  it("skips a stage tile whose publication went away instead of throwing", async () => {
    const participants = [
      createParticipant({
        cameraTrackRef: {
          participant: {},
          publication: {},
          source: "camera",
        },
        isCameraEnabled: true,
        userId: "user-no-publication",
        username: "user-no-publication",
      } as Partial<MobileVoiceRoomParticipant>),
    ];

    const view = await renderVoiceScreen(
      createVoiceScreenProps({
        voiceRoomState: createConnectedVoiceRoom({ participants }),
      }),
    );

    expect(view.getByTestId("mobile-voice-stage")).toBeTruthy();
  });

  it("opens the settings sheet from the channel room header and refreshes devices first", async () => {
    const onRefreshVoiceDevices = jest.fn(async () => undefined);
    const view = await renderVoiceScreen(createVoiceScreenProps({ onRefreshVoiceDevices }));

    expect(view.queryByTestId("mobile-voice-device-sheet-panel")).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-voice-settings"));

    // Twice by design, same as the DM call: the press refreshes, then the sheet
    // refreshes again on open so a device plugged in mid-call still shows up.
    expect(onRefreshVoiceDevices).toHaveBeenCalledTimes(2);
    expect(view.getByTestId("mobile-voice-device-sheet-panel")).toBeTruthy();
  });

  it("reaches the screen-share quality rows from the channel room", async () => {
    const onSelectVoiceScreenShareQuality = jest.fn();
    const view = await renderVoiceScreen(
      createVoiceScreenProps({
        onSelectVoiceScreenShareQuality,
        voiceScreenShareQualityId: "h720fps30",
      }),
    );

    await fireEvent.press(view.getByTestId("mobile-voice-settings"));

    expect(view.getByTestId("mobile-voice-screen-share-quality-h720fps30")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-voice-screen-share-quality-h1080fps30"));

    expect(onSelectVoiceScreenShareQuality).toHaveBeenCalledWith("h1080fps30");
  });

  it("keeps the settings entry disabled until the room is connected", async () => {
    const onRefreshVoiceDevices = jest.fn(async () => undefined);
    const view = await renderVoiceScreen(
      createVoiceScreenProps({
        onRefreshVoiceDevices,
        voiceRoomState: createConnectedVoiceRoom({ status: "connecting" }),
      }),
    );

    const settings = view.getByTestId("mobile-voice-settings");
    expect(settings.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

    await fireEvent.press(settings);

    expect(onRefreshVoiceDevices).not.toHaveBeenCalled();
    expect(view.queryByTestId("mobile-voice-device-sheet-panel")).toBeNull();
  });

  it("renders device choices and a persisted noise toggle in the voice settings sheet", async () => {
    const onSelectNoiseSuppression = jest.fn();
    const view = await render(
      <MobileVoiceSettingsSheet
        audioInputs={[{ id: "mic-1", kind: "audioinput", label: "Phone microphone" }]}
        audioOutputs={[{ id: "speaker", kind: "audiooutput", labelKey: "speaker" }]}
        connectionStatus="connected"
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
    expect(view.getByTestId("mobile-voice-audio-input-mic-1")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-audio-output-speaker")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-voice-noise-suppression-toggle"));
    expect(onSelectNoiseSuppression).toHaveBeenCalledWith(false);
  });

  it("carries the live input meter, talk mode and the rest of the capture chain", async () => {
    const onSelectAudioProcessing = jest.fn();
    const onSelectInputMode = jest.fn();
    const onToggleMic = jest.fn();
    const view = await render(
      <MobileVoiceSettingsSheet
        audioInputs={[{ id: "mic-1", kind: "audioinput", label: "Phone microphone" }]}
        audioOutputs={[{ id: "speaker", kind: "audiooutput", labelKey: "speaker" }]}
        audioProcessing={{
          autoGainControlEnabled: true,
          echoCancellationEnabled: true,
          noiseSuppressionEnabled: true,
        }}
        connectionStatus="connected"
        inputLevel={0.3}
        inputMode="voice-activity"
        micMuted
        noiseSuppressionEnabled
        onClose={() => undefined}
        onRefresh={() => undefined}
        onSelectAudioInput={() => undefined}
        onSelectAudioOutput={() => undefined}
        onSelectAudioProcessing={onSelectAudioProcessing}
        onSelectInputMode={onSelectInputMode}
        onSelectNoiseSuppression={() => undefined}
        onToggleMic={onToggleMic}
        open
        participantCount={3}
        selectedAudioInputId="mic-1"
        selectedAudioOutputId="speaker"
      />,
    );

    // A muted microphone says so, offers the fix, and parks the meter at zero.
    expect(view.getByTestId("mobile-voice-settings-muted-notice")).toBeTruthy();
    const meter = view.getByLabelText(copy.voiceSettingsMicLevelLabel);
    expect(meter.props.accessibilityValue).toMatchObject({ now: 0 });
    await fireEvent.press(view.getByTestId("mobile-voice-settings-unmute"));
    expect(onToggleMic).toHaveBeenCalled();

    await fireEvent.press(view.getByTestId("mobile-voice-input-mode-push-to-talk"));
    expect(onSelectInputMode).toHaveBeenCalledWith("push-to-talk");

    await fireEvent.press(view.getByTestId("mobile-voice-echo-cancellation-toggle"));
    expect(onSelectAudioProcessing).toHaveBeenCalledWith({ echoCancellationEnabled: false });
    await fireEvent.press(view.getByTestId("mobile-voice-auto-gain-toggle"));
    expect(onSelectAudioProcessing).toHaveBeenCalledWith({ autoGainControlEnabled: false });
  });

  it("fills the input meter from the live capture level", async () => {
    const view = await render(
      <MobileVoiceSettingsSheet
        audioInputs={[]}
        audioOutputs={[]}
        connectionStatus="connected"
        inputLevel={0.28}
        noiseSuppressionEnabled
        onClose={() => undefined}
        onRefresh={() => undefined}
        onSelectAudioInput={() => undefined}
        onSelectAudioOutput={() => undefined}
        onSelectNoiseSuppression={() => undefined}
        open
        selectedAudioInputId={null}
        selectedAudioOutputId={null}
      />,
    );

    expect(getMobileVoiceInputMeterSegments(0)).toBe(0);
    expect(getMobileVoiceInputMeterSegments(0.28)).toBe(12);
    expect(
      view.getByLabelText(copy.voiceSettingsMicLevelLabel).props.accessibilityValue,
    ).toMatchObject({ now: 12 });
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
          participants={[
            createParticipant({ isScreenSharing: true, screenShareTrackRef: trackRef }),
          ]}
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
