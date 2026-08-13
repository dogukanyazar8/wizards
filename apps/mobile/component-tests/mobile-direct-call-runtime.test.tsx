import { act, cleanup, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockOrder: string[] = [];
const mockRooms: MockRoom[] = [];
const mockRequestMicrophonePermission = jest.fn();
const mockConfigureAudio = jest.fn(async () => {
  mockOrder.push("audio-configure");
});
const mockStartAudioSession = jest.fn(async () => {
  mockOrder.push("audio-start");
});
const mockStopAudioSession = jest.fn(async () => {
  mockOrder.push("audio-stop");
});

type MockLocalParticipant = {
  audioLevel: number;
  getTrackPublication: jest.Mock;
  identity: string;
  isCameraEnabled: boolean;
  isMicrophoneEnabled: boolean;
  isSpeaking: boolean;
  setCameraEnabled: jest.Mock;
  setMicrophoneEnabled: jest.Mock;
};

type MockRoom = {
  connect: jest.Mock;
  disconnect: jest.Mock;
  localParticipant: MockLocalParticipant;
  off: jest.Mock;
  on: jest.Mock;
  once: jest.Mock;
  remoteParticipants: Map<string, never>;
  switchActiveDevice: jest.Mock;
};

function mockCreateRoom(): MockRoom {
  const localParticipant: MockLocalParticipant = {
    audioLevel: 0,
    getTrackPublication: jest.fn(() => undefined),
    identity: "user:user-1",
    isCameraEnabled: false,
    isMicrophoneEnabled: false,
    isSpeaking: false,
    setCameraEnabled: jest.fn(async (enabled: boolean) => {
      mockOrder.push(`camera-${enabled ? "on" : "off"}`);
      localParticipant.isCameraEnabled = enabled;
    }),
    setMicrophoneEnabled: jest.fn(async (enabled: boolean) => {
      mockOrder.push(`microphone-${enabled ? "on" : "off"}`);
      localParticipant.isMicrophoneEnabled = enabled;
    }),
  };
  const room: MockRoom = {
    connect: jest.fn(async () => {
      mockOrder.push("room-connect");
    }),
    disconnect: jest.fn(() => {
      mockOrder.push("room-disconnect");
    }),
    localParticipant,
    off: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    remoteParticipants: new Map(),
    switchActiveDevice: jest.fn(async () => undefined),
  };
  mockRooms.push(room);
  return room;
}

let mockNextRoom: MockRoom | null = null;

jest.mock("livekit-client", () => ({
  LocalAudioTrack: class MockLocalAudioTrack {},
  LocalVideoTrack: class MockLocalVideoTrack {},
  Room: class MockRoomConstructor {
    static getLocalDevices = jest.fn(async () => []);

    constructor() {
      return mockNextRoom ?? mockCreateRoom();
    }
  },
  RoomEvent: {
    ActiveSpeakersChanged: "active-speakers-changed",
    Disconnected: "disconnected",
    LocalTrackPublished: "local-track-published",
    LocalTrackUnpublished: "local-track-unpublished",
    ParticipantConnected: "participant-connected",
    ParticipantDisconnected: "participant-disconnected",
    Reconnected: "reconnected",
    Reconnecting: "reconnecting",
    TrackMuted: "track-muted",
    TrackPublished: "track-published",
    TrackSubscribed: "track-subscribed",
    TrackUnmuted: "track-unmuted",
    TrackUnpublished: "track-unpublished",
    TrackUnsubscribed: "track-unsubscribed",
  },
  Track: { Source: { Camera: "camera", Microphone: "microphone", ScreenShare: "screen-share" } },
  VideoPreset: class MockVideoPreset {
    constructor(..._args: unknown[]) {}
  },
  VideoPresets: {
    h360: {
      encoding: { maxBitrate: 500_000, maxFramerate: 20 },
      height: 360,
      width: 640,
    },
  },
  VideoQuality: { HIGH: 2, LOW: 0, MEDIUM: 1 },
}));

import { AudioSession } from "@livekit/react-native";
import type { MobileApiClient, MobileApiRequestOptions } from "../src/api/mobile-api-client";
import * as mobileVoiceRuntime from "../src/voice/mobile-voice-runtime";
import * as voiceRouteNavigation from "../src/voice/mobile-voice-room-route-navigation";
import { useMobileVoiceRoom } from "../src/voice/use-mobile-voice-room";

Object.assign(AudioSession, {
  configureAudio: mockConfigureAudio,
  getAudioOutputs: jest.fn(async () => []),
  selectAudioOutput: jest.fn(async () => undefined),
  startAudioSession: mockStartAudioSession,
  stopAudioSession: mockStopAudioSession,
});

const grantedMicrophonePermission = {
  errorMessage: null,
  hasMicrophonePermission: true,
  lastAttemptAt: 1,
  microphoneStatus: "granted" as const,
  status: "ready" as const,
};

const grantedCameraPermission = {
  errorMessage: null,
  hasCameraPermission: true,
};

async function createHarness({
  beforeTokenResponse = async () => undefined,
  requestCameraPermission = jest.fn(async () => grantedCameraPermission),
}: {
  beforeTokenResponse?: () => Promise<void>;
  requestCameraPermission?: jest.Mock;
} = {}) {
  const apiCalls: Array<{ body: unknown; method: string | undefined; path: string }> = [];
  const apiClient: MobileApiClient = {
    async requestJson<TResponse>(path: string, options: MobileApiRequestOptions = {}) {
      mockOrder.push("token-request");
      apiCalls.push({ body: options.body, method: options.method, path });
      await beforeTokenResponse();
      return {
        conversationId: "conversation-1",
        mediaPolicy: { audioBitrate: 64_000, videoQualityMode: "AUTO" },
        provider: "livekit",
        token: "direct.livekit.jwt.token",
        url: "wss://voice.whispr.test",
      } as TResponse;
    },
  };
  const hook = await renderHook(() =>
    useMobileVoiceRoom({
      apiClient,
      cameraPermissionDeniedMessage: "Video call needs camera access.",
      currentUser: {
        avatarUrl: null,
        displayName: "Ada",
        id: "user-1",
        username: "ada",
      },
      directCallConnectionErrorMessage: "Direct call could not connect.",
      directCallMicrophonePermissionDeniedMessage: "Direct call needs microphone access.",
      directCallVideoErrorMessage: "Video could not be started.",
      requestCameraPermissionAfterUserAction: async () => {
        mockOrder.push("camera-permission");
        return requestCameraPermission();
      },
      voiceInputMode: "voice-activity",
    }),
  );
  return { apiCalls, hook, requestCameraPermission };
}

async function joinDirectCall(
  hook: Awaited<ReturnType<typeof createHarness>>["hook"],
  video: boolean,
): Promise<boolean> {
  let joined = false;
  await act(async () => {
    joined = await hook.result.current.joinDirectCall({
      conversationId: "conversation-1",
      title: "Ada Lovelace",
      video,
    });
  });
  return joined;
}

describe("mobile direct-call runtime", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockOrder.length = 0;
    mockRooms.length = 0;
    mockNextRoom = null;
    mockConfigureAudio.mockClear();
    mockStartAudioSession.mockClear();
    mockStopAudioSession.mockClear();
    mockRequestMicrophonePermission.mockReset();
    mockRequestMicrophonePermission.mockImplementation(async () => {
      mockOrder.push("microphone-permission");
      return grantedMicrophonePermission;
    });
    jest
      .spyOn(mobileVoiceRuntime, "requestMobileVoicePermissionAfterUserAction")
      .mockImplementation(mockRequestMicrophonePermission);
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("orders permissions, exact direct token request, LiveKit connect, and video publish without channel writes", async () => {
    const harness = await createHarness();

    expect(await joinDirectCall(harness.hook, true)).toBe(true);

    expect(mockOrder).toEqual([
      "audio-stop",
      "microphone-permission",
      "camera-permission",
      "token-request",
      "audio-configure",
      "audio-start",
      "room-connect",
      "microphone-on",
      "camera-on",
    ]);
    expect(harness.apiCalls).toEqual([
      {
        body: { conversationId: "conversation-1" },
        method: "POST",
        path: "/api/v1/mobile/voice/token",
      },
    ]);
    expect(harness.hook.result.current.roomState).toMatchObject({
      channelName: "Ada Lovelace",
      conversationId: "conversation-1",
      selfCameraEnabled: true,
      serverId: null,
      sessionMode: "direct",
      status: "connected",
    });

    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(harness.apiCalls).toHaveLength(1);
  });

  it("upgrades an existing audio direct call before returning video success", async () => {
    const harness = await createHarness();
    expect(await joinDirectCall(harness.hook, false)).toBe(true);
    mockOrder.length = 0;

    expect(await joinDirectCall(harness.hook, true)).toBe(true);

    expect(mockRooms).toHaveLength(1);
    expect(mockOrder).toEqual(["camera-permission", "camera-on"]);
    expect(harness.apiCalls).toHaveLength(1);
    expect(harness.hook.result.current.roomState.selfCameraEnabled).toBe(true);
  });

  it("keeps an existing audio call connected and returns false when video upgrade permission is denied", async () => {
    const requestCameraPermission = jest.fn(async () => ({
      errorMessage: "Native camera module failed at diagnostic boundary.",
      hasCameraPermission: false,
    }));
    const harness = await createHarness({ requestCameraPermission });
    expect(await joinDirectCall(harness.hook, false)).toBe(true);

    expect(await joinDirectCall(harness.hook, true)).toBe(false);

    expect(mockRooms[0]?.localParticipant.setCameraEnabled).not.toHaveBeenCalled();
    expect(harness.hook.result.current.roomState).toMatchObject({
      errorMessage: "Video call needs camera access.",
      selfCameraEnabled: false,
      status: "connected",
    });
    expect(harness.hook.result.current.roomState.errorMessage).not.toContain("Native camera");
  });

  it("keeps microphone runtime detail diagnostic-only when a direct call permission fails", async () => {
    mockRequestMicrophonePermission.mockResolvedValueOnce({
      errorMessage: "Native microphone module failed at diagnostic boundary.",
      hasMicrophonePermission: false,
      lastAttemptAt: 2,
      microphoneStatus: "unknown",
      status: "error",
    });
    const harness = await createHarness();

    expect(await joinDirectCall(harness.hook, false)).toBe(false);

    expect(harness.hook.result.current.permissionState.errorMessage).toContain("Native microphone");
    expect(harness.hook.result.current.roomState).toMatchObject({
      errorMessage: "Direct call needs microphone access.",
      sessionMode: "direct",
      status: "permission-denied",
    });
    expect(harness.hook.result.current.roomState.errorMessage).not.toContain("Native microphone");
  });

  it("keeps audio connected and exposes localized copy when a video upgrade publish fails", async () => {
    const harness = await createHarness();
    expect(await joinDirectCall(harness.hook, false)).toBe(true);
    const room = mockRooms[0]!;
    // Both the H.264 publish and its single VP8 retry have to fail before the
    // upgrade is reported as failed.
    room.localParticipant.setCameraEnabled.mockRejectedValueOnce(
      new Error("wss://secret.example camera publish failed"),
    );
    room.localParticipant.setCameraEnabled.mockRejectedValueOnce(
      new Error("wss://secret.example camera publish failed"),
    );

    expect(await joinDirectCall(harness.hook, true)).toBe(false);

    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledTimes(2);
    expect(room.localParticipant.setCameraEnabled.mock.calls[0]?.[2]).toMatchObject({
      videoCodec: "h264",
    });
    expect(room.localParticipant.setCameraEnabled.mock.calls[1]?.[2]).toMatchObject({
      videoCodec: "vp8",
    });
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(harness.hook.result.current.roomState).toMatchObject({
      errorMessage: "Video could not be started.",
      selfCameraEnabled: false,
      status: "connected",
    });
    expect(harness.hook.result.current.roomState.errorMessage).not.toContain("secret.example");
  });

  it("rejects a duplicate concurrent direct join without a second permission or token request", async () => {
    let releaseToken!: () => void;
    const tokenGate = new Promise<void>((resolve) => {
      releaseToken = resolve;
    });
    const harness = await createHarness({ beforeTokenResponse: () => tokenGate });
    const firstPromise = harness.hook.result.current.joinDirectCall({
      conversationId: "conversation-1",
      title: "Ada Lovelace",
      video: false,
    });
    await act(async () => {
      await Promise.resolve();
    });
    const second = await harness.hook.result.current.joinDirectCall({
      conversationId: "conversation-1",
      title: "Ada Lovelace",
      video: false,
    });
    releaseToken();
    await act(async () => {
      await firstPromise;
    });

    expect(second).toBe(false);
    expect(mockRequestMicrophonePermission).toHaveBeenCalledTimes(1);
    expect(harness.apiCalls).toHaveLength(1);
  });

  it("cleans up a failed direct connection and exposes only localized user copy", async () => {
    const harness = await createHarness();
    const room = mockCreateRoom();
    mockRooms.length = 0;
    mockRooms.push(room);
    mockNextRoom = room;
    room.connect.mockRejectedValueOnce(new Error("wss://secret.example transport exploded"));

    expect(await joinDirectCall(harness.hook, false)).toBe(false);

    expect(room.disconnect).toHaveBeenCalled();
    expect(mockStopAudioSession).toHaveBeenCalled();
    expect(harness.hook.result.current.roomState).toMatchObject({
      errorMessage: "Direct call could not connect.",
      status: "error",
    });
    expect(harness.hook.result.current.roomState.errorMessage).not.toContain("secret.example");
  });

  it("opens the call screen before joining so the ringing UI is immediate", async () => {
    expect(voiceRouteNavigation.launchMobileDirectCall).toEqual(expect.any(Function));
    const order: string[] = [];
    const openVoiceRoom = jest.fn(() => {
      order.push("open");
    });
    const join = jest.fn(async () => {
      order.push("join");
      return true;
    });

    const joined = await voiceRouteNavigation.launchMobileDirectCall({
      conversationId: "conversation-1",
      joinDirectCall: join,
      openVoiceRoom,
      title: "Ada Lovelace",
      video: true,
    });

    expect(joined).toBe(true);
    expect(order).toEqual(["open", "join"]);
    expect(openVoiceRoom).toHaveBeenCalledWith({
      channelId: null,
      channelName: "Ada Lovelace",
      conversationId: "conversation-1",
      serverId: null,
      sessionMode: "direct",
    });
  });

  it("reports a failed join so the caller can tear the ring down", async () => {
    const openVoiceRoom = jest.fn();
    const join = jest.fn(async () => false);

    const joined = await voiceRouteNavigation.launchMobileDirectCall({
      conversationId: "conversation-1",
      joinDirectCall: join,
      openVoiceRoom,
      title: "Ada Lovelace",
      video: false,
    });

    expect(joined).toBe(false);
    expect(openVoiceRoom).toHaveBeenCalledTimes(1);
  });
});
