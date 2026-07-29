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

/** The call surface raises a toast when noise suppression flips, so it needs the runtime. */
function renderDirectCall(props: React.ComponentProps<typeof MobileDirectCallScreen>) {
  return render(
    <ToastProvider>
      <MobileDirectCallScreen {...props} />
    </ToastProvider>,
  );
}

describe("5e direct call screen", () => {
  it("wears the voice-room chrome: identity header, session strip and audience", async () => {
    const view = await renderDirectCall(createProps());

    expect(view.getByTestId("mobile-direct-call-screen")).toBeTruthy();
    // Header identity: the callee names the call, the type and encryption sit beneath.
    expect(view.getAllByText("ogi_uat").length).toBeGreaterThan(0);
    expect(view.getByText(`${copy.directCallTitle} · ${copy.directCallEncrypted}`)).toBeTruthy();
    // The room's session strip replaced the old connection chip.
    expect(view.getByTestId("mobile-voice-session-strip")).toBeTruthy();
    expect(view.getByText(copy.voiceRoomConnectionConnected)).toBeTruthy();
    expect(view.getByTestId("mobile-voice-noise-toggle")).toBeTruthy();
    // Both members ride the measured audience grid, exactly as in a server room.
    expect(view.getByTestId("mobile-voice-audience")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-participant-ogi")).toBeTruthy();
    expect(view.getByTestId("mobile-voice-participant-self")).toBeTruthy();
    expect(view.getByTestId("mobile-direct-call-dock")).toBeTruthy();
  });

  it("routes the dock controls to their handlers", async () => {
    const onLeaveVoiceChannel = jest.fn(async () => undefined);
    const onToggleVoiceMute = jest.fn(async () => undefined);
    const view = await renderDirectCall(createProps({ onLeaveVoiceChannel, onToggleVoiceMute }));

    await fireEvent.press(view.getByTestId("mobile-direct-call-mic"));
    await fireEvent.press(view.getByTestId("mobile-direct-call-leave"));

    expect(onToggleVoiceMute).toHaveBeenCalledTimes(1);
    expect(onLeaveVoiceChannel).toHaveBeenCalledTimes(1);
  });

  it("flips noise suppression from the session strip", async () => {
    const onSelectVoiceNoiseSuppression = jest.fn(async () => undefined);
    const view = await renderDirectCall(createProps({ onSelectVoiceNoiseSuppression }));

    await fireEvent.press(view.getByTestId("mobile-voice-noise-toggle"));

    expect(onSelectVoiceNoiseSuppression).toHaveBeenCalledWith(false);
  });

  it("opens audio devices from the header settings pill", async () => {
    const onRefreshVoiceDevices = jest.fn(async () => undefined);
    const view = await renderDirectCall(createProps({ onRefreshVoiceDevices }));

    await fireEvent.press(view.getByTestId("mobile-direct-call-settings"));

    expect(onRefreshVoiceDevices).toHaveBeenCalled();
  });

  it("disables the dock controls until the call is connected", async () => {
    const view = await renderDirectCall(
      createProps({ voiceRoomState: createDirectCallRoom({ status: "connecting" }) }),
    );

    expect(view.getByTestId("mobile-direct-call-mic").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(view.getByText(copy.voiceRoomConnectionConnecting)).toBeTruthy();
  });
});
