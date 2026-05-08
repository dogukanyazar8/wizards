"use client";

import {
  ConnectionState,
  type AudioProcessorOptions,
  LocalAudioTrack,
  LocalTrack,
  LocalVideoTrack,
  Room,
  Track,
  VideoPresets,
  type AudioCaptureOptions,
  type Participant,
  type RemoteVideoTrack,
  type TrackProcessor,
  type VideoCaptureOptions,
} from "livekit-client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import type { KrispNoiseFilterProcessor } from "@livekit/krisp-noise-filter";
import { useI18n } from "@/components/providers/locale-provider";
import { VoiceAudioRenderer } from "@/components/voice/voice-audio-renderer";
import { WHISPR_DESKTOP_BEFORE_CLOSE_EVENT, isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import { logError } from "@/lib/logger";
import { getSocket } from "@/lib/socket/client";
import type { UserProfileUpdatedPayload } from "@/lib/socket/events";
import {
  deleteVoiceState,
  fetchLiveKitToken,
  sendVoiceHeartbeat,
  upsertVoiceState,
  voiceQueryKeys,
} from "@/lib/voice/client";
import { VOICE_HEARTBEAT_INTERVAL_MS, type VoiceChannelStateDTO } from "@/lib/voice/types";
import {
  applyScreenShareEncodingToSender,
  getScreenShareCaptureOptions,
  getScreenSharePublishOptions,
  getScreenShareQualityPreset,
  type ScreenShareQualityId,
} from "@/lib/voice/screen-share";
import {
  DEFAULT_AUDIO_DEVICE_ID,
  DEFAULT_CAMERA_DEVICE_ID,
  DEFAULT_PARTICIPANT_VOLUME,
  type VoiceAudioPreferences,
  type VoiceCameraPreferences,
  useVoiceStore,
} from "@/store/voice-store";

type VoiceProviderProps = {
  children: ReactNode;
  currentUser: {
    id: string;
    avatarUrl?: string | null;
    displayName: string;
    username: string;
  };
};

export interface VoiceParticipantViewModel {
  audioLevel: number;
  avatarUrl: string | null;
  cameraTrack: LocalVideoTrack | RemoteVideoTrack | null;
  displayName: string | null;
  isCameraEnabled: boolean;
  isLocal: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  userId: string;
  username: string;
}

type VoiceParticipantAudioActivity = Pick<
  VoiceParticipantViewModel,
  "audioLevel" | "isMuted" | "isSpeaking"
>;

const VOICE_AUDIO_LEVEL_SYNC_INTERVAL_MS = 33;
const VOICE_AUDIO_LEVEL_CHANGE_THRESHOLD = 0.01;
const VOICE_AUDIO_LEVEL_IDLE_THRESHOLD = 0.006;
const VOICE_AUDIO_LEVEL_SPEAKING_THRESHOLD = 0.025;

type WindowWithWebkitAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
};

type LocalVoiceAudioLevelMonitor = {
  dispose: () => void;
  readLevel: () => number;
};

function normalizeVoiceAudioLevel(audioLevel: number) {
  if (!Number.isFinite(audioLevel)) {
    return 0;
  }

  return Math.min(1, Math.max(0, audioLevel));
}

function getParticipantAudioActivity(participant: Participant): VoiceParticipantAudioActivity {
  const microphonePublication = participant.getTrackPublication(Track.Source.Microphone);
  const isMuted = microphonePublication?.isMuted ?? !participant.isMicrophoneEnabled;
  const audioLevel = isMuted ? 0 : normalizeVoiceAudioLevel(participant.audioLevel);
  const isSpeaking =
    !isMuted &&
    audioLevel > VOICE_AUDIO_LEVEL_IDLE_THRESHOLD &&
    (participant.isSpeaking || audioLevel >= VOICE_AUDIO_LEVEL_SPEAKING_THRESHOLD);

  return {
    audioLevel,
    isMuted,
    isSpeaking,
  };
}

function shouldUpdateParticipantAudioActivity(
  current: VoiceParticipantViewModel,
  next: VoiceParticipantAudioActivity,
) {
  return (
    current.isMuted !== next.isMuted ||
    current.isSpeaking !== next.isSpeaking ||
    Math.abs(current.audioLevel - next.audioLevel) >= VOICE_AUDIO_LEVEL_CHANGE_THRESHOLD
  );
}

function createLocalVoiceAudioLevelMonitor(
  track: LocalAudioTrack,
): LocalVoiceAudioLevelMonitor | null {
  if (typeof window === "undefined" || track.mediaStreamTrack.readyState !== "live") {
    return null;
  }

  const AudioContextConstructor =
    window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  try {
    const audioContext = new AudioContextConstructor();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));

    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.18;
    const samples = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    void audioContext.resume().catch(() => undefined);

    return {
      dispose: () => {
        source.disconnect();
        void audioContext.close().catch(() => undefined);
      },
      readLevel: () => {
        analyser.getByteTimeDomainData(samples);

        let sum = 0;
        for (const sample of samples) {
          const amplitude = (sample - 128) / 128;
          sum += amplitude * amplitude;
        }

        const rms = Math.sqrt(sum / samples.length);
        return normalizeVoiceAudioLevel((rms - 0.008) * 8);
      },
    };
  } catch {
    return null;
  }
}

export interface VoiceScreenShareViewModel {
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  isLocal: boolean;
  participantId: string;
  track: LocalVideoTrack | RemoteVideoTrack | null;
  trackSid: string;
  username: string;
}

export type KrispAvailability =
  | "available"
  | "blocked_by_security_policy"
  | "checking"
  | "requires_livekit_cloud"
  | "unavailable"
  | "unsupported_browser";

export type VoiceCameraStatus =
  | "device-unavailable"
  | "disabled"
  | "enabled"
  | "error"
  | "permission-denied"
  | "starting"
  | "stopping";

type VoiceContextValue = {
  activeChannelId: string | null;
  audioPreferences: VoiceAudioPreferences;
  cameraError: string | null;
  cameraStatus: VoiceCameraStatus;
  connectionState: ConnectionState;
  errorMessage: string | null;
  getParticipantVolume: (userId: string) => number;
  isCameraEnabled: boolean;
  isApplyingAudioPreferences: boolean;
  isDeafened: boolean;
  isJoining: boolean;
  isKrispNoiseCancellationActive: boolean;
  isRecoveringKrispNoiseCancellation: boolean;
  isMuted: boolean;
  isScreenSharing: boolean;
  krispAvailability: KrispAvailability;
  participants: VoiceParticipantViewModel[];
  resetParticipantVolume: (userId: string) => void;
  room: Room | null;
  screenShareError: string | null;
  screenShares: VoiceScreenShareViewModel[];
  screenShareQuality: ScreenShareQualityId;
  serverId: string | null;
  activeScreenShareId: string | null;
  setAudioPreference: <Key extends keyof VoiceAudioPreferences>(
    key: Key,
    value: VoiceAudioPreferences[Key],
  ) => void;
  setActiveScreenShareId: (id: string) => void;
  setParticipantVolume: (userId: string, volume: number) => void;
  setScreenShareQuality: (qualityId: ScreenShareQualityId) => Promise<void>;
  retryKrispNoiseCancellation: () => Promise<boolean>;
  prepareForVoiceJoin: () => Promise<boolean>;
  joinChannel: (input: { channelId: string; serverId: string }) => Promise<void>;
  leaveChannel: () => Promise<void>;
  stopCamera: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  isApplyingScreenShareQuality: boolean;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
};

type ParticipantMetadata = {
  avatarUrl?: string | null;
  displayName?: string | null;
  username?: string | null;
};

type VoiceAccountUpdatedEventPayload = Partial<Omit<UserProfileUpdatedPayload, "userId">> & {
  id?: string;
};

const NEXT_PUBLIC_LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";
const RECONNECT_TIMEOUT_MS = 30_000;
const E2E_VOICE_HEARTBEAT_INTERVAL_MS = 10_000;
const E2E_CAMERA_DENIED_KEY = "whispr:e2e:deny-camera";
const E2E_MICROPHONE_DENIED_KEY = "whispr:e2e:deny-microphone";
const E2E_SCREEN_SHARE_DENIED_KEY = "whispr:e2e:deny-screen-share";
const E2E_CAMERA_TRACK = {
  attach: (element: HTMLMediaElement) => element,
  detach: (element?: HTMLMediaElement) => (element ? [element] : []),
} as unknown as LocalVideoTrack;
const KRISP_PROCESSOR_NAME = "livekit-noise-filter";
const PREFERRED_KRISP_QUALITY = "high";
const FALLBACK_KRISP_QUALITY = "medium";
const KRISP_BUFFER_DROP_MS = 300;
const KRISP_BUFFER_OVERFLOW_MS = 200;
const LIVEKIT_CONNECT_RETRY_DELAYS_MS = [650, 1_500] as const;

const VoiceContext = createContext<VoiceContextValue | null>(null);

function isE2EVoiceMockEnabled() {
  return process.env.NEXT_PUBLIC_E2E_TEST_MODE === "true" && process.env.NODE_ENV !== "production";
}

function getE2EFlag(key: string) {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(key) === "true";
}

function isMicrophonePermissionDenied(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError" ||
      error.name === "SecurityError"
    );
  }

  return (
    error instanceof Error &&
    /notallowederror|permission denied|permissiondeniederror|securityerror/i.test(error.message)
  );
}

function isMicrophoneDeviceUnavailable(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === "AbortError" ||
      error.name === "NotFoundError" ||
      error.name === "NotReadableError" ||
      error.name === "OverconstrainedError"
    );
  }

  return (
    error instanceof Error &&
    /aborterror|notfounderror|notreadableerror|overconstrainederror|could not start audio source|device not found|requested device not found|audio input device/i.test(
      error.message,
    )
  );
}

function isMicrophoneConstraintError(error: unknown) {
  if (error instanceof DOMException) {
    return error.name === "OverconstrainedError" || error.name === "ConstraintNotSatisfiedError";
  }

  return (
    error instanceof Error &&
    /overconstrainederror|constraintnotsatisfiederror|constraint/i.test(error.message)
  );
}

function isCameraPermissionDenied(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError" ||
      error.name === "SecurityError"
    );
  }

  return (
    error instanceof Error &&
    /notallowederror|permission denied|permissiondeniederror|securityerror/i.test(error.message)
  );
}

function isCameraDeviceUnavailable(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === "AbortError" ||
      error.name === "NotFoundError" ||
      error.name === "NotReadableError" ||
      error.name === "OverconstrainedError"
    );
  }

  return (
    error instanceof Error &&
    /aborterror|notfounderror|notreadableerror|overconstrainederror|could not start video source|device not found|requested device not found|video input device/i.test(
      error.message,
    )
  );
}

function isTransientLiveKitConnectionError(error: unknown) {
  return (
    error instanceof Error &&
    /could not establish pc connection|ice|network|timeout|transport|signaling/i.test(error.message)
  );
}

function isLikelyKrispSecurityPolicyError(error: unknown) {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "";

  return /content security policy|script-src|worker-src|wasm|webassembly|unsafe-eval|audioWorklet|worklet|blob:/i.test(
    message,
  );
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function connectLiveKitRoomWithRetry(room: Room, url: string, token: string) {
  for (let attempt = 0; attempt <= LIVEKIT_CONNECT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await room.connect(url, token);
      return;
    } catch (error) {
      const retryDelay = LIVEKIT_CONNECT_RETRY_DELAYS_MS[attempt];
      if (retryDelay === undefined || !isTransientLiveKitConnectionError(error)) {
        throw error;
      }

      await room.disconnect(true).catch(() => undefined);
      await wait(retryDelay);
    }
  }
}

async function getMicrophonePermissionState() {
  if (typeof navigator === "undefined" || !("permissions" in navigator)) {
    return null;
  }

  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return status.state;
  } catch {
    return null;
  }
}

function isScreenSharePermissionDenied(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError" ||
      error.name === "AbortError" ||
      error.name === "SecurityError"
    );
  }

  return (
    error instanceof Error &&
    /notallowederror|permission denied|permissiondeniederror|aborterror|securityerror/i.test(
      error.message,
    )
  );
}

function isScreenShareSupported() {
  return Boolean(typeof navigator !== "undefined" && navigator.mediaDevices?.getDisplayMedia);
}

function isCameraSupported() {
  return Boolean(typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia);
}

function isLiveKitCloudUrl(url: string) {
  return /livekit\.cloud/i.test(url);
}

function supportsMediaConstraint(name: string) {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getSupportedConstraints) {
    return false;
  }

  return (
    (navigator.mediaDevices.getSupportedConstraints() as Record<string, boolean>)[name] === true
  );
}

function buildAudioCaptureOptions(audioPreferences: VoiceAudioPreferences): AudioCaptureOptions {
  const options: AudioCaptureOptions = {
    autoGainControl: audioPreferences.autoGainControl,
    channelCount: { ideal: 1 },
    echoCancellation: audioPreferences.echoCancellation,
    noiseSuppression: audioPreferences.noiseSuppression,
    // Keep advanced browser cleanup as a preference, not a hard requirement.
    // Unsupported or unavailable implementations should not block microphone access.
    voiceIsolation:
      audioPreferences.voiceIsolation && supportsMediaConstraint("voiceIsolation")
        ? { ideal: true }
        : false,
  };

  if (audioPreferences.inputDeviceId !== DEFAULT_AUDIO_DEVICE_ID) {
    options.deviceId = audioPreferences.inputDeviceId;
  }

  return options;
}

function buildCameraCaptureOptions(cameraPreferences: VoiceCameraPreferences): VideoCaptureOptions {
  const options: VideoCaptureOptions = {
    facingMode: "user",
    frameRate: { ideal: 30, max: 30 },
    resolution: VideoPresets.h720.resolution,
  };

  if (cameraPreferences.deviceId !== DEFAULT_CAMERA_DEVICE_ID) {
    options.deviceId = cameraPreferences.deviceId;
  }

  return options;
}

function getAudioCaptureRestartSignature(audioPreferences: VoiceAudioPreferences) {
  return audioPreferences.inputDeviceId;
}

function mergeCurrentUserProfile(
  currentUser: VoiceProviderProps["currentUser"],
  profile: Pick<UserProfileUpdatedPayload, "avatarUrl" | "displayName" | "username">,
): VoiceProviderProps["currentUser"] {
  const username = profile.username?.trim() || currentUser.username;

  return {
    ...currentUser,
    avatarUrl: profile.avatarUrl ?? null,
    displayName: profile.displayName?.trim() || username,
    username,
  };
}

function useVoiceCurrentUserSnapshot(currentUser: VoiceProviderProps["currentUser"]) {
  const [snapshot, setSnapshot] = useState(currentUser);

  useEffect(() => {
    setSnapshot(currentUser);
  }, [currentUser]);

  useEffect(() => {
    const applyProfileUpdate = (profile: UserProfileUpdatedPayload) => {
      if (profile.userId !== currentUser.id) {
        return;
      }

      setSnapshot((current) => mergeCurrentUserProfile(current, profile));
    };

    const handleAccountUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }

      const detail = event.detail as VoiceAccountUpdatedEventPayload | null;
      const username = detail?.username;
      if (!detail || detail.id !== currentUser.id || typeof username !== "string") {
        return;
      }

      setSnapshot((current) =>
        mergeCurrentUserProfile(current, {
          avatarUrl: detail.avatarUrl ?? null,
          displayName: detail.displayName ?? null,
          username,
        }),
      );
    };

    const socket = getSocket();
    socket.on("user:profile:updated", applyProfileUpdate);
    window.addEventListener("whispr:account-updated", handleAccountUpdated);

    return () => {
      socket.off("user:profile:updated", applyProfileUpdate);
      window.removeEventListener("whispr:account-updated", handleAccountUpdated);
    };
  }, [currentUser.id]);

  return snapshot;
}

function parseParticipantMetadata(participant: Participant): ParticipantMetadata {
  if (!participant.metadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(participant.metadata) as ParticipantMetadata;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function getParticipantProfile(
  participant: Participant,
  currentUser: VoiceProviderProps["currentUser"],
): Pick<VoiceParticipantViewModel, "avatarUrl" | "displayName" | "userId" | "username"> {
  if (participant.identity === currentUser.id) {
    return {
      userId: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName,
      avatarUrl: currentUser.avatarUrl ?? null,
    };
  }

  const metadata = parseParticipantMetadata(participant);
  const username =
    metadata.username?.trim() ||
    metadata.displayName?.trim() ||
    participant.name?.trim() ||
    participant.identity;

  return {
    userId: participant.identity,
    username,
    displayName: metadata.displayName?.trim() || participant.name?.trim() || null,
    avatarUrl: metadata.avatarUrl ?? null,
  };
}

function getParticipantCameraState(
  participant: Participant,
): Pick<VoiceParticipantViewModel, "cameraTrack" | "isCameraEnabled"> {
  const cameraPublication = participant.getTrackPublication(Track.Source.Camera);
  const cameraTrack = cameraPublication?.videoTrack ?? null;
  const isCameraEnabled = Boolean(cameraTrack) && cameraPublication?.isMuted !== true;

  return {
    cameraTrack: isCameraEnabled ? cameraTrack : null,
    isCameraEnabled,
  };
}

function getScreenShareId(participantId: string, trackSid: string) {
  return `${participantId}:${trackSid}`;
}

function collectScreenShares(
  targetRoom: Room,
  currentUser: VoiceProviderProps["currentUser"],
): VoiceScreenShareViewModel[] {
  return [targetRoom.localParticipant, ...targetRoom.remoteParticipants.values()].flatMap(
    (participant) => {
      const profile = getParticipantProfile(participant, currentUser);

      return participant
        .getTrackPublications()
        .filter(
          (publication) => publication.source === Track.Source.ScreenShare && !publication.isMuted,
        )
        .map((publication) => ({
          avatarUrl: profile.avatarUrl,
          displayName: profile.displayName,
          id: getScreenShareId(participant.identity, publication.trackSid),
          isLocal: participant.identity === currentUser.id,
          participantId: participant.identity,
          track: publication.videoTrack ?? null,
          trackSid: publication.trackSid,
          username: profile.username,
        }));
    },
  );
}

function countActiveScreenShares(targetRoom: Room) {
  return [targetRoom.localParticipant, ...targetRoom.remoteParticipants.values()].reduce(
    (count, participant) =>
      count +
      participant
        .getTrackPublications()
        .filter(
          (publication) => publication.source === Track.Source.ScreenShare && !publication.isMuted,
        ).length,
    0,
  );
}

function mapVoiceStateCache(
  states: VoiceChannelStateDTO[] | undefined,
  channelId: string,
  participants: Array<{
    avatarUrl: string | null;
    displayName: string | null;
    isScreenSharing?: boolean;
    userId: string;
    username: string;
  }>,
) {
  const nextStates = states ? [...states] : [];
  const existingIndex = nextStates.findIndex((state) => state.channelId === channelId);

  if (participants.length === 0) {
    if (existingIndex >= 0) {
      nextStates.splice(existingIndex, 1);
    }
    return nextStates;
  }

  const nextState: VoiceChannelStateDTO = {
    channelId,
    participants,
  };

  if (existingIndex >= 0) {
    nextStates[existingIndex] = nextState;
    return nextStates;
  }

  nextStates.push(nextState);
  return nextStates;
}

function mapVoiceScreenShareStateCache(
  states: VoiceChannelStateDTO[] | undefined,
  channelId: string,
  userId: string,
  isScreenSharing: boolean,
) {
  if (!states) {
    return states;
  }

  return states.map((state) => {
    if (state.channelId !== channelId) {
      return state;
    }

    return {
      ...state,
      participants: state.participants.map((participant) =>
        participant.userId === userId
          ? {
              ...participant,
              isScreenSharing,
            }
          : participant,
      ),
    };
  });
}

function resolveParticipantVolume(
  userId: string,
  isDeafened: boolean,
  participantVolumes: Record<string, number>,
) {
  if (isDeafened) {
    return 0;
  }

  return (participantVolumes[userId] ?? DEFAULT_PARTICIPANT_VOLUME) / 100;
}

function getLocalMicrophoneTrack(targetRoom: Room | null) {
  const microphonePublication =
    targetRoom?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track ?? null;

  return microphonePublication instanceof LocalAudioTrack ? microphonePublication : null;
}

function isLocalMicrophoneTrackLive(track: LocalAudioTrack | null) {
  return track?.mediaStreamTrack.readyState === "live";
}

function getLocalCameraTrack(targetRoom: Room | null) {
  const cameraPublication =
    targetRoom?.localParticipant.getTrackPublication(Track.Source.Camera)?.track ?? null;

  return cameraPublication instanceof LocalVideoTrack ? cameraPublication : null;
}

function isLocalCameraTrackLive(track: LocalVideoTrack | null) {
  return track?.mediaStreamTrack.readyState === "live";
}

function getLocalScreenShareTrack(targetRoom: Room | null) {
  const screenShareTrack =
    targetRoom?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track ?? null;

  return screenShareTrack instanceof LocalVideoTrack ? screenShareTrack : null;
}

function isLocalScreenShareTrackLive(track: LocalVideoTrack | null) {
  return track?.mediaStreamTrack.readyState === "live";
}

async function applyScreenShareQualityToTrack(
  track: LocalVideoTrack,
  qualityId: ScreenShareQualityId,
) {
  const preset = getScreenShareQualityPreset(qualityId);

  if (track.sender) {
    await applyScreenShareEncodingToSender(track.sender, preset.encoding);
  }
}

async function stopLocalTracks(room: Room) {
  const publications = room.localParticipant.getTrackPublications();
  const localTracks = publications
    .map((publication) => publication.track)
    .filter((track): track is LocalTrack => track instanceof LocalTrack);

  await Promise.all(
    localTracks.map((track) =>
      track instanceof LocalAudioTrack && track.getProcessor()
        ? track.stopProcessor().catch(() => undefined)
        : Promise.resolve(),
    ),
  );

  await Promise.all(
    localTracks.map((track) =>
      room.localParticipant.unpublishTrack(track, false).catch(() => undefined),
    ),
  );

  for (const track of localTracks) {
    track.stop();
    track.detach();
  }
}

function applyRemoteAudioState(
  room: Room,
  isDeafened: boolean,
  participantVolumes: Record<string, number>,
) {
  for (const participant of room.remoteParticipants.values()) {
    participant.setVolume(
      resolveParticipantVolume(participant.identity, isDeafened, participantVolumes),
      Track.Source.Microphone,
    );
  }
}

function notifyVoiceExit() {
  return fetch("/api/v1/voice/state", {
    method: "DELETE",
    keepalive: true,
  }).catch(() => undefined);
}

function mapE2EVoiceParticipants(
  currentUser: VoiceProviderProps["currentUser"],
  participants: VoiceChannelStateDTO["participants"],
  isCameraEnabled: boolean,
  isMuted: boolean,
): VoiceParticipantViewModel[] {
  return participants.map((participant) => {
    const participantCameraEnabled =
      participant.userId === currentUser.id ? isCameraEnabled : false;

    return {
      audioLevel: 0,
      avatarUrl: participant.avatarUrl,
      cameraTrack: participantCameraEnabled ? E2E_CAMERA_TRACK : null,
      displayName: participant.displayName,
      isCameraEnabled: participantCameraEnabled,
      isLocal: participant.userId === currentUser.id,
      isMuted: participant.userId === currentUser.id ? isMuted : false,
      isSpeaking: false,
      userId: participant.userId,
      username: participant.username,
    };
  });
}

function E2EVoiceProvider({ children, currentUser }: VoiceProviderProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipantViewModel[]>([]);
  const [screenShares, setScreenShares] = useState<VoiceScreenShareViewModel[]>([]);
  const [activeScreenShareId, setActiveScreenShareIdState] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<VoiceCameraStatus>("disabled");
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isApplyingScreenShareQuality, setIsApplyingScreenShareQuality] = useState(false);
  const {
    activeChannelId,
    audioPreferences,
    isDeafened,
    isMuted,
    isScreenSharing,
    participantVolumes,
    screenShareError,
    screenShareQuality,
    serverId,
  } = useVoiceStore(
    useShallow((state) => ({
      activeChannelId: state.activeChannelId,
      audioPreferences: state.audioPreferences,
      isDeafened: state.isDeafened,
      isMuted: state.isMuted,
      isScreenSharing: state.isScreenSharing,
      participantVolumes: state.participantVolumes,
      screenShareError: state.screenShareError,
      screenShareQuality: state.screenShareQuality,
      serverId: state.serverId,
    })),
  );

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(
    (sessionId: string) => {
      stopHeartbeat();
      heartbeatRef.current = setInterval(() => {
        void sendVoiceHeartbeat(sessionId).catch(() => undefined);
      }, E2E_VOICE_HEARTBEAT_INTERVAL_MS);
    },
    [stopHeartbeat],
  );

  const getParticipantVolume = useCallback(
    (userId: string) => participantVolumes[userId] ?? DEFAULT_PARTICIPANT_VOLUME,
    [participantVolumes],
  );

  const syncParticipantsFromState = useCallback(
    (stateParticipants: VoiceChannelStateDTO["participants"]) => {
      setParticipants(
        mapE2EVoiceParticipants(
          currentUser,
          stateParticipants,
          cameraStatus === "enabled",
          useVoiceStore.getState().isMuted,
        ),
      );
    },
    [cameraStatus, currentUser],
  );

  const setVoiceStateCache = useCallback(
    (
      targetServerId: string,
      targetChannelId: string,
      stateParticipants: VoiceChannelStateDTO["participants"],
    ) => {
      queryClient.setQueryData<VoiceChannelStateDTO[] | undefined>(
        voiceQueryKeys.serverStates(targetServerId),
        (current) => mapVoiceStateCache(current, targetChannelId, stateParticipants),
      );
    },
    [queryClient],
  );

  const emitScreenShareState = useCallback(
    (targetChannelId: string | null, targetServerId: string | null, isSharing: boolean) => {
      if (!targetChannelId || !targetServerId) {
        return;
      }

      queryClient.setQueryData<VoiceChannelStateDTO[] | undefined>(
        voiceQueryKeys.serverStates(targetServerId),
        (current) =>
          mapVoiceScreenShareStateCache(current, targetChannelId, currentUser.id, isSharing),
      );

      getSocket().emit("voice:screenshare:update", {
        channelId: targetChannelId,
        isScreenSharing: isSharing,
        serverId: targetServerId,
      });
    },
    [currentUser.id, queryClient],
  );

  const stopScreenShare = useCallback(async () => {
    const store = useVoiceStore.getState();
    const targetChannelId = store.activeChannelId;
    const targetServerId = store.serverId;

    setScreenShares([]);
    setActiveScreenShareIdState(null);
    store.clearScreenShareState();
    emitScreenShareState(targetChannelId, targetServerId, false);
  }, [emitScreenShareState]);

  const stopCamera = useCallback(async () => {
    setCameraStatus("disabled");
    setCameraError(null);
    setParticipants((current) =>
      current.map((participant) =>
        participant.isLocal
          ? {
              ...participant,
              cameraTrack: null,
              isCameraEnabled: false,
            }
          : participant,
      ),
    );
  }, []);

  const leaveChannel = useCallback(async () => {
    const store = useVoiceStore.getState();
    const targetChannelId = store.activeChannelId;
    const targetServerId = store.serverId;

    stopHeartbeat();
    await stopCamera();
    await stopScreenShare();
    setParticipants([]);
    setConnectionState(ConnectionState.Disconnected);
    setErrorMessage(null);

    if (store.sessionId) {
      await deleteVoiceState().catch(() => undefined);
    }

    if (targetServerId && targetChannelId) {
      setVoiceStateCache(targetServerId, targetChannelId, []);
    }

    store.leave();
  }, [setVoiceStateCache, stopCamera, stopHeartbeat, stopScreenShare]);

  const joinChannel = useCallback(
    async ({ channelId, serverId: nextServerId }: { channelId: string; serverId: string }) => {
      const store = useVoiceStore.getState();

      if (store.activeChannelId === channelId && store.serverId === nextServerId) {
        return;
      }

      if (store.activeChannelId || store.sessionId) {
        await leaveChannel();
      }

      setIsJoining(true);
      setErrorMessage(null);

      const sessionId = crypto.randomUUID();
      const hasMicrophoneAccess = !getE2EFlag(E2E_MICROPHONE_DENIED_KEY);

      try {
        const state = await upsertVoiceState({
          channelId,
          serverId: nextServerId,
          sessionId,
        });

        useVoiceStore.getState().join({
          channelId,
          serverId: nextServerId,
          sessionId,
        });
        useVoiceStore.getState().setMuted(!hasMicrophoneAccess);
        useVoiceStore.getState().setDeafened(false);
        setConnectionState(ConnectionState.Connected);
        setVoiceStateCache(nextServerId, channelId, state.participants);
        syncParticipantsFromState(state.participants);
        startHeartbeat(sessionId);

        if (!hasMicrophoneAccess) {
          setErrorMessage(t("voice.errors.microphoneDenied"));
        }
      } catch (error) {
        useVoiceStore.getState().leave();
        setParticipants([]);
        setConnectionState(ConnectionState.Disconnected);
        setErrorMessage(error instanceof Error ? error.message : t("voice.view.errorTitle"));
        throw error;
      } finally {
        setIsJoining(false);
      }
    },
    [leaveChannel, setVoiceStateCache, startHeartbeat, syncParticipantsFromState, t],
  );

  const toggleMute = useCallback(async () => {
    const nextMuted = !useVoiceStore.getState().isMuted;
    useVoiceStore.getState().setMuted(nextMuted);
    setParticipants((current) =>
      current.map((participant) =>
        participant.isLocal
          ? {
              ...participant,
              audioLevel: nextMuted ? 0 : participant.audioLevel,
              isMuted: nextMuted,
              isSpeaking: nextMuted ? false : participant.isSpeaking,
            }
          : participant,
      ),
    );
  }, []);

  const toggleDeafen = useCallback(async () => {
    useVoiceStore.getState().setDeafened(!useVoiceStore.getState().isDeafened);
  }, []);

  const toggleCamera = useCallback(async () => {
    if (cameraStatus === "starting" || cameraStatus === "stopping") {
      return;
    }

    if (cameraStatus === "enabled") {
      setCameraStatus("stopping");
      await stopCamera();
      return;
    }

    setCameraStatus("starting");
    setCameraError(null);

    if (getE2EFlag(E2E_CAMERA_DENIED_KEY)) {
      const message = t("voice.errors.cameraDenied");
      setCameraStatus("permission-denied");
      setCameraError(message);
      return;
    }

    setCameraStatus("enabled");
    setParticipants((current) =>
      current.map((participant) =>
        participant.isLocal
          ? {
              ...participant,
              cameraTrack: E2E_CAMERA_TRACK,
              isCameraEnabled: true,
            }
          : participant,
      ),
    );
  }, [cameraStatus, stopCamera, t]);

  const toggleScreenShare = useCallback(async () => {
    const store = useVoiceStore.getState();
    if (!store.activeChannelId || !store.serverId) {
      return;
    }

    if (store.isScreenSharing) {
      await stopScreenShare();
      return;
    }

    if (getE2EFlag(E2E_SCREEN_SHARE_DENIED_KEY)) {
      const message = t("screenShare.errors.permissionDenied");
      store.setScreenShareError(message);
      setErrorMessage(message);
      return;
    }

    const shareId = `${currentUser.id}:e2e-screen-share`;
    const share: VoiceScreenShareViewModel = {
      avatarUrl: currentUser.avatarUrl ?? null,
      displayName: currentUser.displayName,
      id: shareId,
      isLocal: true,
      participantId: currentUser.id,
      track: null,
      trackSid: "e2e-screen-share",
      username: currentUser.username,
    };

    setScreenShares([share]);
    setActiveScreenShareIdState(shareId);
    store.setScreenShareState({
      activeSharerId: shareId,
      channelId: store.activeChannelId,
      conversationId: null,
      isSharing: true,
      mode: "voice",
    });
    setErrorMessage(null);
    emitScreenShareState(store.activeChannelId, store.serverId, true);
  }, [currentUser, emitScreenShareState, stopScreenShare, t]);

  const setActiveScreenShareId = useCallback((id: string) => {
    setActiveScreenShareIdState(id);
    useVoiceStore.getState().setScreenShareState({
      activeSharerId: id,
      channelId: useVoiceStore.getState().activeChannelId,
      conversationId: null,
      isSharing: useVoiceStore.getState().isScreenSharing,
      mode: "voice",
    });
  }, []);

  const setScreenShareQuality = useCallback(async (qualityId: ScreenShareQualityId) => {
    setIsApplyingScreenShareQuality(true);
    try {
      useVoiceStore.getState().setScreenShareQuality(qualityId);
      setErrorMessage(null);
    } finally {
      setIsApplyingScreenShareQuality(false);
    }
  }, []);

  const prepareForVoiceJoin = useCallback(async () => {
    return !getE2EFlag(E2E_MICROPHONE_DENIED_KEY);
  }, []);

  useEffect(() => {
    setParticipants((current) =>
      current.map((participant) =>
        participant.isLocal
          ? {
              ...participant,
              avatarUrl: currentUser.avatarUrl ?? null,
              displayName: currentUser.displayName,
              username: currentUser.username,
            }
          : participant,
      ),
    );
    setScreenShares((current) =>
      current.map((share) =>
        share.isLocal
          ? {
              ...share,
              avatarUrl: currentUser.avatarUrl ?? null,
              displayName: currentUser.displayName,
              username: currentUser.username,
            }
          : share,
      ),
    );
  }, [currentUser.avatarUrl, currentUser.displayName, currentUser.username]);

  useEffect(() => {
    const socket = getSocket();

    const handleVoiceStateUpdate = (data: {
      action: "join" | "leave";
      channelId: string;
      participants: VoiceChannelStateDTO["participants"];
    }) => {
      if (data.channelId !== useVoiceStore.getState().activeChannelId) {
        return;
      }

      syncParticipantsFromState(data.participants);
    };

    const handleVoiceScreenShareUpdate = (data: {
      channelId: string;
      isScreenSharing: boolean;
      userId: string;
    }) => {
      const store = useVoiceStore.getState();
      if (data.channelId !== store.activeChannelId || data.userId === currentUser.id) {
        return;
      }

      if (!data.isScreenSharing) {
        setScreenShares((current) =>
          current.filter((share) => share.participantId !== data.userId),
        );
        return;
      }

      const participant = participants.find((entry) => entry.userId === data.userId);
      if (!participant) {
        return;
      }

      const shareId = `${data.userId}:e2e-screen-share`;
      setScreenShares((current) => {
        if (current.some((share) => share.id === shareId)) {
          return current;
        }

        return [
          ...current,
          {
            avatarUrl: participant.avatarUrl,
            displayName: participant.displayName,
            id: shareId,
            isLocal: false,
            participantId: participant.userId,
            track: null,
            trackSid: "e2e-screen-share",
            username: participant.username,
          },
        ];
      });
      setActiveScreenShareIdState((current) => current ?? shareId);
    };

    socket.on("voice:state:update", handleVoiceStateUpdate);
    socket.on("voice:screenshare:update", handleVoiceScreenShareUpdate);
    return () => {
      socket.off("voice:state:update", handleVoiceStateUpdate);
      socket.off("voice:screenshare:update", handleVoiceScreenShareUpdate);
    };
  }, [currentUser.id, participants, syncParticipantsFromState]);

  useEffect(() => {
    const handlePageExit = () => {
      const store = useVoiceStore.getState();
      if (store.isScreenSharing && store.screenShareMode === "voice") {
        emitScreenShareState(store.activeChannelId, store.serverId, false);
      }

      if (store.sessionId) {
        void notifyVoiceExit();
      }

      store.leave();
    };

    window.addEventListener("beforeunload", handlePageExit);
    window.addEventListener("pagehide", handlePageExit);
    window.addEventListener(WHISPR_DESKTOP_BEFORE_CLOSE_EVENT, handlePageExit);
    return () => {
      window.removeEventListener("beforeunload", handlePageExit);
      window.removeEventListener("pagehide", handlePageExit);
      window.removeEventListener(WHISPR_DESKTOP_BEFORE_CLOSE_EVENT, handlePageExit);
      stopHeartbeat();
    };
  }, [emitScreenShareState, stopHeartbeat]);

  const value = useMemo<VoiceContextValue>(
    () => ({
      activeChannelId,
      audioPreferences,
      cameraError,
      cameraStatus,
      connectionState,
      errorMessage,
      getParticipantVolume,
      isCameraEnabled: cameraStatus === "enabled",
      isApplyingAudioPreferences: false,
      isApplyingScreenShareQuality,
      isDeafened,
      isJoining,
      isKrispNoiseCancellationActive: false,
      isRecoveringKrispNoiseCancellation: false,
      isMuted,
      isScreenSharing,
      krispAvailability: "requires_livekit_cloud",
      participants,
      resetParticipantVolume: useVoiceStore.getState().resetParticipantVolume,
      room: null,
      screenShareError,
      screenShares,
      screenShareQuality,
      serverId,
      activeScreenShareId,
      setAudioPreference: useVoiceStore.getState().setAudioPreference,
      setActiveScreenShareId,
      setParticipantVolume: useVoiceStore.getState().setParticipantVolume,
      setScreenShareQuality,
      retryKrispNoiseCancellation: async () => false,
      prepareForVoiceJoin,
      joinChannel,
      leaveChannel,
      stopCamera,
      stopScreenShare,
      toggleDeafen,
      toggleCamera,
      toggleMute,
      toggleScreenShare,
    }),
    [
      activeChannelId,
      activeScreenShareId,
      audioPreferences,
      cameraError,
      cameraStatus,
      connectionState,
      errorMessage,
      getParticipantVolume,
      isApplyingScreenShareQuality,
      isDeafened,
      isJoining,
      isMuted,
      isScreenSharing,
      joinChannel,
      leaveChannel,
      participants,
      prepareForVoiceJoin,
      screenShareError,
      screenShareQuality,
      screenShares,
      serverId,
      setActiveScreenShareId,
      setScreenShareQuality,
      stopCamera,
      stopScreenShare,
      toggleCamera,
      toggleDeafen,
      toggleMute,
      toggleScreenShare,
    ],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

function LiveVoiceProvider({ children, currentUser }: VoiceProviderProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const isDesktopRuntime = useMemo(isWhisprDesktopRuntime, []);
  const roomRef = useRef<Room | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinRequestRef = useRef<string | null>(null);
  const preparedMicrophoneAccessRef = useRef<boolean | null>(null);
  const appliedAudioPreferencesSignatureRef = useRef<string | null>(null);
  const microphoneRecoveryPromiseRef = useRef<{
    promise: Promise<boolean>;
    room: Room;
  } | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const krispProcessorRef = useRef<KrispNoiseFilterProcessor | null>(null);
  const lastEmittedScreenShareStateRef = useRef<boolean | null>(null);
  const connectionWarningMessageRef = useRef<string | null>(null);
  const cleanupVoiceResourcesRef = useRef<() => void>(() => undefined);
  const microphoneSettingsFailedMessageRef = useRef(t("voice.errors.microphoneSettingsFailed"));
  const supportsLiveKitCloudNoiseCancellationRef = useRef(
    isLiveKitCloudUrl(NEXT_PUBLIC_LIVEKIT_URL),
  );
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipantViewModel[]>([]);
  const [screenShares, setScreenShares] = useState<VoiceScreenShareViewModel[]>([]);
  const [activeScreenShareId, setActiveScreenShareIdState] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<VoiceCameraStatus>("disabled");
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isApplyingAudioPreferences, setIsApplyingAudioPreferences] = useState(false);
  const [isApplyingScreenShareQuality, setIsApplyingScreenShareQuality] = useState(false);
  const [isKrispNoiseCancellationActive, setIsKrispNoiseCancellationActive] = useState(false);
  const [isRecoveringKrispNoiseCancellation, setIsRecoveringKrispNoiseCancellation] =
    useState(false);

  useEffect(() => {
    microphoneSettingsFailedMessageRef.current = t("voice.errors.microphoneSettingsFailed");
  }, [t]);
  const [krispAvailability, setKrispAvailability] = useState<KrispAvailability>(
    supportsLiveKitCloudNoiseCancellationRef.current ? "checking" : "requires_livekit_cloud",
  );

  const {
    activeChannelId,
    audioPreferences,
    cameraPreferences,
    isDeafened,
    isMuted,
    isScreenSharing,
    participantVolumes,
    screenShareError,
    screenShareQuality,
    serverId,
  } = useVoiceStore(
    useShallow((state) => ({
      activeChannelId: state.activeChannelId,
      audioPreferences: state.audioPreferences,
      cameraPreferences: state.cameraPreferences,
      isDeafened: state.isDeafened,
      isMuted: state.isMuted,
      isScreenSharing: state.isScreenSharing,
      participantVolumes: state.participantVolumes,
      screenShareError: state.screenShareError,
      screenShareQuality: state.screenShareQuality,
      serverId: state.serverId,
    })),
  );

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const setConnectionWarning = useCallback((message: string) => {
    const previousWarning = connectionWarningMessageRef.current;
    connectionWarningMessageRef.current = message;
    setErrorMessage((current) => (!current || current === previousWarning ? message : current));
  }, []);

  const clearConnectionWarning = useCallback(() => {
    const previousWarning = connectionWarningMessageRef.current;
    connectionWarningMessageRef.current = null;
    if (!previousWarning) {
      return;
    }

    setErrorMessage((current) => (current === previousWarning ? null : current));
  }, []);

  const getParticipantVolume = useCallback(
    (userId: string) => participantVolumes[userId] ?? DEFAULT_PARTICIPANT_VOLUME,
    [participantVolumes],
  );

  const requestMicrophonePermission = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    const permissionState = await getMicrophonePermissionState();
    if (permissionState === "denied") {
      return false;
    }

    return true;
  }, []);

  const prepareForVoiceJoin = useCallback(async () => {
    try {
      const granted = await requestMicrophonePermission();
      preparedMicrophoneAccessRef.current = granted;
      return granted;
    } catch (error) {
      if (isMicrophonePermissionDenied(error)) {
        preparedMicrophoneAccessRef.current = false;
        return false;
      }

      preparedMicrophoneAccessRef.current = null;
      throw error;
    }
  }, [requestMicrophonePermission]);

  const syncParticipants = useCallback(
    (targetRoom: Room | null = roomRef.current) => {
      if (!targetRoom) {
        setParticipants([]);
        return;
      }

      const nextParticipants = [
        targetRoom.localParticipant,
        ...targetRoom.remoteParticipants.values(),
      ].map((participant) => {
        const profile = getParticipantProfile(participant, currentUser);
        const audioActivity = getParticipantAudioActivity(participant);
        const cameraState = getParticipantCameraState(participant);

        return {
          ...profile,
          ...audioActivity,
          ...cameraState,
          isLocal: participant.identity === currentUser.id,
        } satisfies VoiceParticipantViewModel;
      });

      setParticipants(nextParticipants);
      setCameraStatus((current) => {
        if (current === "starting" || current === "stopping") {
          return current;
        }

        if (isLocalCameraTrackLive(getLocalCameraTrack(targetRoom))) {
          return "enabled";
        }

        return current === "permission-denied" ||
          current === "device-unavailable" ||
          current === "error"
          ? current
          : "disabled";
      });
    },
    [currentUser],
  );

  useEffect(() => {
    if (!room || typeof window === "undefined") {
      return;
    }

    let animationFrameId = 0;
    let lastSyncAt = 0;
    let localAudioLevelMonitor: LocalVoiceAudioLevelMonitor | null = null;
    let monitoredLocalTrack: MediaStreamTrack | null = null;

    const getLocalAudioLevelMonitor = () => {
      const localMicrophoneTrack = getLocalMicrophoneTrack(room);
      const nextLocalTrack = localMicrophoneTrack?.mediaStreamTrack ?? null;

      if (nextLocalTrack === monitoredLocalTrack) {
        return localAudioLevelMonitor;
      }

      localAudioLevelMonitor?.dispose();
      monitoredLocalTrack = nextLocalTrack;
      localAudioLevelMonitor = localMicrophoneTrack
        ? createLocalVoiceAudioLevelMonitor(localMicrophoneTrack)
        : null;

      return localAudioLevelMonitor;
    };

    const syncAudioLevels = (timestamp: number) => {
      if (timestamp - lastSyncAt >= VOICE_AUDIO_LEVEL_SYNC_INTERVAL_MS) {
        lastSyncAt = timestamp;

        const liveParticipants = new Map<string, Participant>();
        liveParticipants.set(room.localParticipant.identity, room.localParticipant);
        room.remoteParticipants.forEach((participant) => {
          liveParticipants.set(participant.identity, participant);
        });

        setParticipants((currentParticipants) => {
          let hasChanges = false;
          const nextParticipants = currentParticipants.map((participant) => {
            const liveParticipant = liveParticipants.get(participant.userId);

            if (!liveParticipant) {
              return participant;
            }

            const audioActivity = getParticipantAudioActivity(liveParticipant);
            if (
              liveParticipant.identity === room.localParticipant.identity &&
              audioActivity.isMuted
            ) {
              localAudioLevelMonitor?.dispose();
              localAudioLevelMonitor = null;
              monitoredLocalTrack = null;
            }

            const nextAudioActivity =
              liveParticipant.identity === room.localParticipant.identity && !audioActivity.isMuted
                ? (() => {
                    const localAudioLevel =
                      getLocalAudioLevelMonitor()?.readLevel() ?? audioActivity.audioLevel;

                    return {
                      ...audioActivity,
                      audioLevel: localAudioLevel,
                      isSpeaking:
                        localAudioLevel > VOICE_AUDIO_LEVEL_IDLE_THRESHOLD &&
                        (audioActivity.isSpeaking ||
                          localAudioLevel >= VOICE_AUDIO_LEVEL_SPEAKING_THRESHOLD),
                    };
                  })()
                : audioActivity;

            if (!shouldUpdateParticipantAudioActivity(participant, nextAudioActivity)) {
              return participant;
            }

            hasChanges = true;
            return {
              ...participant,
              ...nextAudioActivity,
            };
          });

          return hasChanges ? nextParticipants : currentParticipants;
        });
      }

      animationFrameId = window.requestAnimationFrame(syncAudioLevels);
    };

    animationFrameId = window.requestAnimationFrame(syncAudioLevels);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      localAudioLevelMonitor?.dispose();
    };
  }, [room]);

  const emitVoiceScreenShareState = useCallback(
    (
      targetChannelId: string | null,
      targetServerId: string | null,
      isSharing: boolean,
      options: { force?: boolean } = {},
    ) => {
      if (!targetChannelId || !targetServerId) {
        return;
      }

      if (!options.force && lastEmittedScreenShareStateRef.current === isSharing) {
        return;
      }

      lastEmittedScreenShareStateRef.current = isSharing;
      queryClient.setQueryData<VoiceChannelStateDTO[] | undefined>(
        voiceQueryKeys.serverStates(targetServerId),
        (current) =>
          mapVoiceScreenShareStateCache(current, targetChannelId, currentUser.id, isSharing),
      );

      const socket = getSocket();
      socket.emit("voice:screenshare:update", {
        channelId: targetChannelId,
        isScreenSharing: isSharing,
        serverId: targetServerId,
      });
    },
    [currentUser.id, queryClient],
  );

  const syncScreenShares = useCallback(
    (targetRoom: Room | null = roomRef.current) => {
      if (!targetRoom) {
        setScreenShares([]);
        setActiveScreenShareIdState(null);
        useVoiceStore.getState().clearScreenShareState();
        emitVoiceScreenShareState(
          useVoiceStore.getState().activeChannelId,
          useVoiceStore.getState().serverId,
          false,
        );
        return;
      }

      const nextScreenShares = collectScreenShares(targetRoom, currentUser);
      setScreenShares(nextScreenShares);
      setActiveScreenShareIdState((current) => {
        if (current && nextScreenShares.some((share) => share.id === current)) {
          return current;
        }

        return nextScreenShares[0]?.id ?? null;
      });

      const localShare = nextScreenShares.find((share) => share.isLocal) ?? null;
      if (localShare) {
        useVoiceStore.getState().setScreenShareState({
          activeSharerId: localShare.id,
          channelId: useVoiceStore.getState().activeChannelId,
          conversationId: null,
          isSharing: true,
          mode: "voice",
        });
        emitVoiceScreenShareState(
          useVoiceStore.getState().activeChannelId,
          useVoiceStore.getState().serverId,
          true,
        );
        return;
      }

      const store = useVoiceStore.getState();
      if (store.screenShareMode === "voice") {
        store.clearScreenShareState();
      }
      emitVoiceScreenShareState(store.activeChannelId, store.serverId, false);
    },
    [currentUser, emitVoiceScreenShareState],
  );

  useEffect(() => {
    const activeRoom = room;
    if (!activeRoom) {
      return;
    }

    const metadata = JSON.stringify({
      avatarUrl: currentUser.avatarUrl ?? null,
      displayName: currentUser.displayName,
      username: currentUser.username,
    });
    const name = currentUser.displayName || currentUser.username;

    if (activeRoom.localParticipant.metadata !== metadata) {
      void activeRoom.localParticipant.setMetadata(metadata).catch((error) => {
        logError("[voice] Local participant metadata update failed", error);
      });
    }

    if (activeRoom.localParticipant.name !== name) {
      void activeRoom.localParticipant.setName(name).catch((error) => {
        logError("[voice] Local participant name update failed", error);
      });
    }

    syncParticipants(activeRoom);
    syncScreenShares(activeRoom);
  }, [
    currentUser.avatarUrl,
    currentUser.displayName,
    currentUser.username,
    room,
    syncParticipants,
    syncScreenShares,
  ]);

  const updateVoiceStatesCache = useCallback(
    (
      targetServerId: string,
      targetChannelId: string,
      nextParticipants: Array<{
        avatarUrl: string | null;
        displayName: string | null;
        isScreenSharing?: boolean;
        userId: string;
        username: string;
      }>,
    ) => {
      queryClient.setQueryData<VoiceChannelStateDTO[] | undefined>(
        voiceQueryKeys.serverStates(targetServerId),
        (current) => mapVoiceStateCache(current, targetChannelId, nextParticipants),
      );
    },
    [queryClient],
  );

  const startHeartbeat = useCallback(
    (sessionId: string) => {
      stopHeartbeat();
      heartbeatRef.current = setInterval(() => {
        void sendVoiceHeartbeat(sessionId).catch(() => {
          // If the session vanished on the server, a reconnect or explicit leave
          // will reconcile the local state.
        });
        const store = useVoiceStore.getState();
        if (store.isScreenSharing && store.screenShareMode === "voice") {
          emitVoiceScreenShareState(store.activeChannelId, store.serverId, true, {
            force: true,
          });
        }
      }, VOICE_HEARTBEAT_INTERVAL_MS);
    },
    [emitVoiceScreenShareState, stopHeartbeat],
  );

  const ensureKrispSupport = useCallback(async () => {
    if (!supportsLiveKitCloudNoiseCancellationRef.current) {
      setKrispAvailability("requires_livekit_cloud");
      return null;
    }

    try {
      const krispModule = await import("@livekit/krisp-noise-filter");

      if (!krispModule.isKrispNoiseFilterSupported()) {
        setKrispAvailability("unsupported_browser");
        return null;
      }

      setKrispAvailability("available");
      return krispModule;
    } catch (error) {
      setKrispAvailability(
        isLikelyKrispSecurityPolicyError(error) ? "blocked_by_security_policy" : "unavailable",
      );
      return null;
    }
  }, []);

  const getOrCreateKrispProcessor = useCallback(async () => {
    const krispModule = await ensureKrispSupport();
    if (!krispModule) {
      return null;
    }

    if (!krispProcessorRef.current) {
      krispProcessorRef.current = krispModule.KrispNoiseFilter({
        bufferDropMs: KRISP_BUFFER_DROP_MS,
        bufferOverflowMs: KRISP_BUFFER_OVERFLOW_MS,
        quality: PREFERRED_KRISP_QUALITY,
      });
    }

    return krispProcessorRef.current;
  }, [ensureKrispSupport]);

  const resetKrispProcessor = useCallback(async () => {
    if (krispProcessorRef.current) {
      await krispProcessorRef.current.destroy().catch(() => undefined);
      krispProcessorRef.current = null;
    }

    setIsKrispNoiseCancellationActive(false);
  }, []);

  const createFallbackKrispProcessor = useCallback(async () => {
    const krispModule = await ensureKrispSupport();
    if (!krispModule) {
      return null;
    }

    await resetKrispProcessor();
    krispProcessorRef.current = krispModule.KrispNoiseFilter({
      bufferDropMs: KRISP_BUFFER_DROP_MS,
      bufferOverflowMs: KRISP_BUFFER_OVERFLOW_MS,
      quality: FALLBACK_KRISP_QUALITY,
    });

    return krispProcessorRef.current;
  }, [ensureKrispSupport, resetKrispProcessor]);

  const detachKrispNoiseCancellation = useCallback(
    async (track: LocalAudioTrack | null = getLocalMicrophoneTrack(roomRef.current)) => {
      const processor = krispProcessorRef.current;

      if (processor) {
        await processor.setEnabled(false).catch(() => undefined);
      }

      if (track?.getProcessor()?.name === KRISP_PROCESSOR_NAME) {
        await track.stopProcessor().catch((error) => {
          logError("[voice] Krisp processor cleanup failed", error);
        });
      }

      krispProcessorRef.current = null;
      setIsKrispNoiseCancellationActive(false);
    },
    [],
  );

  const syncKrispNoiseCancellation = useCallback(
    async (track: LocalAudioTrack, enabled: boolean) => {
      if (!enabled) {
        await detachKrispNoiseCancellation(track);
        return false;
      }

      const enableProcessor = async (processor: KrispNoiseFilterProcessor | null) => {
        if (!processor) {
          setIsKrispNoiseCancellationActive(false);
          return false;
        }

        const currentProcessor = track.getProcessor();
        if (currentProcessor?.name === KRISP_PROCESSOR_NAME && currentProcessor !== processor) {
          await track.stopProcessor().catch(() => undefined);
        }

        if (track.getProcessor()?.name !== KRISP_PROCESSOR_NAME) {
          await track.setProcessor(
            processor as unknown as TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>,
          );
        }

        const nextEnabled = await processor.setEnabled(true);
        const isActive = nextEnabled ?? processor.isEnabled();
        setIsKrispNoiseCancellationActive(isActive === true);
        setKrispAvailability("available");
        return isActive === true;
      };

      try {
        const processor = await getOrCreateKrispProcessor();
        return await enableProcessor(processor);
      } catch (error) {
        if (isLikelyKrispSecurityPolicyError(error)) {
          setKrispAvailability("blocked_by_security_policy");
        }
        logError("[voice] High quality Krisp failed, retrying stable quality", error);
      }

      try {
        const fallbackProcessor = await createFallbackKrispProcessor();
        return await enableProcessor(fallbackProcessor);
      } catch (error) {
        // Krisp is an enhancement; keep the published microphone alive and fall back to WebRTC.
        logError("[voice] Krisp noise cancellation failed", error);
        await detachKrispNoiseCancellation(track);
        setKrispAvailability(
          isLikelyKrispSecurityPolicyError(error) ? "blocked_by_security_policy" : "unavailable",
        );
        setIsKrispNoiseCancellationActive(false);
        return false;
      }
    },
    [createFallbackKrispProcessor, detachKrispNoiseCancellation, getOrCreateKrispProcessor],
  );

  const enableLocalMicrophone = useCallback(
    async (targetRoom: Room, preferences: VoiceAudioPreferences) => {
      try {
        await targetRoom.localParticipant.setMicrophoneEnabled(
          true,
          buildAudioCaptureOptions(preferences),
        );

        return {
          preferences,
          track: getLocalMicrophoneTrack(targetRoom),
        };
      } catch (error) {
        const shouldRetryWithDefaultDevice =
          preferences.inputDeviceId !== DEFAULT_AUDIO_DEVICE_ID &&
          isMicrophoneDeviceUnavailable(error);

        const shouldRetryWithStableProcessing =
          !shouldRetryWithDefaultDevice &&
          preferences.voiceIsolation &&
          isMicrophoneConstraintError(error);

        if (!shouldRetryWithDefaultDevice && !shouldRetryWithStableProcessing) {
          throw error;
        }

        logError(
          shouldRetryWithDefaultDevice
            ? "[voice] Selected microphone unavailable, retrying system default"
            : "[voice] Advanced microphone processing unavailable, retrying stable profile",
          error,
        );
        const fallbackPreferences = {
          ...preferences,
          inputDeviceId: shouldRetryWithDefaultDevice
            ? DEFAULT_AUDIO_DEVICE_ID
            : preferences.inputDeviceId,
          voiceIsolation: shouldRetryWithStableProcessing ? false : preferences.voiceIsolation,
        };

        if (shouldRetryWithDefaultDevice) {
          useVoiceStore.getState().setAudioPreference("inputDeviceId", DEFAULT_AUDIO_DEVICE_ID);
        }

        if (shouldRetryWithStableProcessing) {
          useVoiceStore.getState().setAudioPreference("voiceIsolation", false);
        }

        await targetRoom.localParticipant.setMicrophoneEnabled(
          true,
          buildAudioCaptureOptions(fallbackPreferences),
        );

        return {
          preferences: fallbackPreferences,
          track: getLocalMicrophoneTrack(targetRoom),
        };
      }
    },
    [],
  );

  const applyAudioPreferencesToRoom = useCallback(
    async (targetRoom: Room | null = roomRef.current) => {
      const localMicrophoneTrack = getLocalMicrophoneTrack(targetRoom);
      if (!localMicrophoneTrack) {
        setIsKrispNoiseCancellationActive(false);
        return;
      }

      if (useVoiceStore.getState().isMuted) {
        appliedAudioPreferencesSignatureRef.current = null;
        setIsKrispNoiseCancellationActive(false);
        return;
      }

      const nextSignature = getAudioCaptureRestartSignature(audioPreferences);
      const shouldRestartCapture = appliedAudioPreferencesSignatureRef.current !== nextSignature;

      setIsApplyingAudioPreferences(true);

      try {
        if (shouldRestartCapture) {
          try {
            await localMicrophoneTrack.restartTrack(buildAudioCaptureOptions(audioPreferences));
            appliedAudioPreferencesSignatureRef.current = nextSignature;
          } catch (error) {
            const shouldRetryWithDefaultDevice =
              audioPreferences.inputDeviceId !== DEFAULT_AUDIO_DEVICE_ID &&
              isMicrophoneDeviceUnavailable(error);

            const shouldRetryWithStableProcessing =
              !shouldRetryWithDefaultDevice &&
              audioPreferences.voiceIsolation &&
              isMicrophoneConstraintError(error);

            if (!shouldRetryWithDefaultDevice && !shouldRetryWithStableProcessing) {
              throw error;
            }

            logError(
              shouldRetryWithDefaultDevice
                ? "[voice] Microphone restart failed, retrying system default"
                : "[voice] Advanced microphone restart failed, retrying stable profile",
              error,
            );
            const fallbackPreferences = {
              ...audioPreferences,
              inputDeviceId: shouldRetryWithDefaultDevice
                ? DEFAULT_AUDIO_DEVICE_ID
                : audioPreferences.inputDeviceId,
              voiceIsolation: shouldRetryWithStableProcessing
                ? false
                : audioPreferences.voiceIsolation,
            };

            if (shouldRetryWithDefaultDevice) {
              useVoiceStore.getState().setAudioPreference("inputDeviceId", DEFAULT_AUDIO_DEVICE_ID);
            }

            if (shouldRetryWithStableProcessing) {
              useVoiceStore.getState().setAudioPreference("voiceIsolation", false);
            }

            await localMicrophoneTrack.restartTrack(buildAudioCaptureOptions(fallbackPreferences));
            appliedAudioPreferencesSignatureRef.current =
              getAudioCaptureRestartSignature(fallbackPreferences);
          }
        }

        await syncKrispNoiseCancellation(
          localMicrophoneTrack,
          audioPreferences.krispNoiseCancellation,
        );
        syncParticipants(targetRoom);
      } finally {
        setIsApplyingAudioPreferences(false);
      }
    },
    [audioPreferences, syncKrispNoiseCancellation, syncParticipants],
  );

  const ensureLocalMicrophonePublished = useCallback(
    async (targetRoom: Room) => {
      if (useVoiceStore.getState().isMuted) {
        return false;
      }

      if (roomRef.current !== targetRoom || targetRoom.state === ConnectionState.Disconnected) {
        return false;
      }

      if (isLocalMicrophoneTrackLive(getLocalMicrophoneTrack(targetRoom))) {
        return true;
      }

      if (microphoneRecoveryPromiseRef.current?.room === targetRoom) {
        return microphoneRecoveryPromiseRef.current.promise;
      }

      const recovery = (async () => {
        const microphoneDeniedMessage = isDesktopRuntime
          ? t("voice.errors.microphoneDeniedDesktop")
          : t("voice.errors.microphoneDenied");
        const microphoneEnableFailedMessage = t("voice.errors.microphoneEnableFailed");

        try {
          const hasMicrophoneAccess = await requestMicrophonePermission();
          if (!hasMicrophoneAccess) {
            useVoiceStore.getState().setMuted(true);
            setIsKrispNoiseCancellationActive(false);
            setErrorMessage(microphoneDeniedMessage);
            syncParticipants(targetRoom);
            return false;
          }

          if (roomRef.current !== targetRoom || targetRoom.state === ConnectionState.Disconnected) {
            return false;
          }

          const { preferences, track: localMicrophoneTrack } = await enableLocalMicrophone(
            targetRoom,
            useVoiceStore.getState().audioPreferences,
          );

          if (roomRef.current !== targetRoom) {
            await stopLocalTracks(targetRoom).catch(() => undefined);
            return false;
          }

          if (localMicrophoneTrack) {
            await syncKrispNoiseCancellation(
              localMicrophoneTrack,
              preferences.krispNoiseCancellation,
            );
          }

          appliedAudioPreferencesSignatureRef.current =
            getAudioCaptureRestartSignature(preferences);
          useVoiceStore.getState().setMuted(false);
          setErrorMessage(null);
          syncParticipants(targetRoom);
          return true;
        } catch (error) {
          if (isLocalMicrophoneTrackLive(getLocalMicrophoneTrack(targetRoom))) {
            logError(
              "[voice] Microphone recovery reported an error after track was published",
              error,
            );
            useVoiceStore.getState().setMuted(false);
            setErrorMessage(null);
            syncParticipants(targetRoom);
            return true;
          }

          setIsKrispNoiseCancellationActive(false);
          if (isMicrophonePermissionDenied(error)) {
            useVoiceStore.getState().setMuted(true);
            setErrorMessage(microphoneDeniedMessage);
          } else {
            setErrorMessage(microphoneEnableFailedMessage);
          }
          syncParticipants(targetRoom);
          return false;
        }
      })();

      microphoneRecoveryPromiseRef.current = {
        promise: recovery,
        room: targetRoom,
      };

      try {
        return await recovery;
      } finally {
        if (microphoneRecoveryPromiseRef.current?.promise === recovery) {
          microphoneRecoveryPromiseRef.current = null;
        }
      }
    },
    [
      enableLocalMicrophone,
      isDesktopRuntime,
      requestMicrophonePermission,
      syncKrispNoiseCancellation,
      syncParticipants,
      t,
    ],
  );

  const retryKrispNoiseCancellation = useCallback(async () => {
    setIsRecoveringKrispNoiseCancellation(true);
    setKrispAvailability("checking");

    try {
      await resetKrispProcessor();
      useVoiceStore.getState().setAudioPreference("krispNoiseCancellation", true);

      const activeRoom = roomRef.current;
      const localMicrophoneTrack = getLocalMicrophoneTrack(activeRoom);

      if (!activeRoom || !localMicrophoneTrack || useVoiceStore.getState().isMuted) {
        const krispModule = await ensureKrispSupport();
        return krispModule !== null;
      }

      const isActive = await syncKrispNoiseCancellation(localMicrophoneTrack, true);
      syncParticipants(activeRoom);
      return isActive;
    } finally {
      setIsRecoveringKrispNoiseCancellation(false);
    }
  }, [ensureKrispSupport, resetKrispProcessor, syncKrispNoiseCancellation, syncParticipants]);

  const setActiveScreenShareId = useCallback((id: string) => {
    setActiveScreenShareIdState(id);
    useVoiceStore.getState().setScreenShareState({
      activeSharerId: id,
      channelId: useVoiceStore.getState().activeChannelId,
      conversationId: null,
      isSharing: useVoiceStore.getState().isScreenSharing,
      mode: "voice",
    });
  }, []);

  const stopScreenShare = useCallback(
    async (targetRoom?: Room | null) => {
      const activeRoom = targetRoom ?? roomRef.current;
      if (!activeRoom) {
        useVoiceStore.getState().clearScreenShareState();
        setScreenShares([]);
        setActiveScreenShareIdState(null);
        return;
      }

      const localScreenTracks = activeRoom.localParticipant
        .getTrackPublications()
        .filter((publication) => publication.source === Track.Source.ScreenShare)
        .map((publication) => publication.track)
        .filter((track): track is LocalTrack => track instanceof LocalTrack);

      const unpublishedByLiveKit = await activeRoom.localParticipant
        .setScreenShareEnabled(false)
        .then(() => true)
        .catch(() => false);

      if (!unpublishedByLiveKit) {
        await Promise.all(
          localScreenTracks.map((track) =>
            activeRoom.localParticipant.unpublishTrack(track, true).catch(() => undefined),
          ),
        );
      }

      for (const track of localScreenTracks) {
        track.detach();
      }

      useVoiceStore.getState().clearScreenShareState();
      syncScreenShares(activeRoom);
    },
    [syncScreenShares],
  );

  const setScreenShareQuality = useCallback(
    async (qualityId: ScreenShareQualityId) => {
      useVoiceStore.getState().setScreenShareQuality(qualityId);

      const activeRoom = roomRef.current;
      const localScreenShareTrack = getLocalScreenShareTrack(activeRoom);
      if (
        !activeRoom ||
        activeRoom.state === ConnectionState.Disconnected ||
        !localScreenShareTrack ||
        !isLocalScreenShareTrackLive(localScreenShareTrack)
      ) {
        return;
      }

      setIsApplyingScreenShareQuality(true);
      try {
        await applyScreenShareQualityToTrack(localScreenShareTrack, qualityId);
        setErrorMessage(null);
        if (roomRef.current === activeRoom) {
          syncScreenShares(activeRoom);
        }
      } catch {
        const message = t("screenShare.errors.qualityFailed");
        useVoiceStore.getState().setScreenShareError(message);
        setErrorMessage(message);
      } finally {
        setIsApplyingScreenShareQuality(false);
      }
    },
    [syncScreenShares, t],
  );

  const stopCamera = useCallback(
    async (targetRoom?: Room | null, options: { clearError?: boolean } = {}) => {
      const activeRoom = targetRoom ?? roomRef.current;
      setCameraStatus("stopping");

      if (!activeRoom) {
        setCameraStatus("disabled");
        if (options.clearError !== false) {
          setCameraError(null);
        }
        return;
      }

      const localCameraTracks = activeRoom.localParticipant
        .getTrackPublications()
        .filter((publication) => publication.source === Track.Source.Camera)
        .map((publication) => publication.track)
        .filter((track): track is LocalVideoTrack => track instanceof LocalVideoTrack);

      const unpublishedByLiveKit = await activeRoom.localParticipant
        .setCameraEnabled(false)
        .then(() => true)
        .catch(() => false);

      if (!unpublishedByLiveKit) {
        await Promise.all(
          localCameraTracks.map((track) =>
            activeRoom.localParticipant.unpublishTrack(track, true).catch(() => undefined),
          ),
        );
      }

      for (const track of localCameraTracks) {
        track.stop();
        track.detach();
      }

      setCameraStatus("disabled");
      if (options.clearError !== false) {
        setCameraError(null);
      }
      syncParticipants(activeRoom);
    },
    [syncParticipants],
  );

  const toggleCamera = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom || cameraStatus === "starting" || cameraStatus === "stopping") {
      return;
    }

    if (isLocalCameraTrackLive(getLocalCameraTrack(activeRoom))) {
      await stopCamera(activeRoom);
      return;
    }

    if (!isCameraSupported()) {
      const message = t("voice.errors.cameraNotSupported");
      setCameraStatus("error");
      setCameraError(message);
      return;
    }

    setCameraStatus("starting");
    setCameraError(null);

    try {
      const publication = await activeRoom.localParticipant.setCameraEnabled(
        true,
        buildCameraCaptureOptions(cameraPreferences),
        { source: Track.Source.Camera },
      );
      const localCameraTrack =
        publication?.track instanceof LocalVideoTrack
          ? publication.track
          : getLocalCameraTrack(activeRoom);

      if (localCameraTrack) {
        localCameraTrack.mediaStreamTrack.addEventListener(
          "ended",
          () => {
            void stopCamera(activeRoom).catch(() => undefined);
          },
          { once: true },
        );
      }

      setCameraStatus("enabled");
      setCameraError(null);
      syncParticipants(activeRoom);
    } catch (error) {
      await stopCamera(activeRoom, { clearError: false }).catch(() => undefined);

      const status: VoiceCameraStatus = isCameraPermissionDenied(error)
        ? "permission-denied"
        : isCameraDeviceUnavailable(error)
          ? "device-unavailable"
          : "error";
      const message =
        status === "permission-denied"
          ? isDesktopRuntime
            ? t("voice.errors.cameraDeniedDesktop")
            : t("voice.errors.cameraDenied")
          : status === "device-unavailable"
            ? t("voice.errors.cameraUnavailable")
            : t("voice.errors.cameraStartFailed");

      setCameraStatus(status);
      setCameraError(message);
      syncParticipants(activeRoom);
    }
  }, [cameraPreferences, cameraStatus, isDesktopRuntime, stopCamera, syncParticipants, t]);

  const toggleScreenShare = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) {
      return;
    }

    if (useVoiceStore.getState().isScreenSharing) {
      await stopScreenShare();
      return;
    }

    if (!isScreenShareSupported()) {
      const message = isDesktopRuntime
        ? t("screenShare.errors.notSupportedDesktop")
        : t("screenShare.errors.notSupported");
      useVoiceStore.getState().setScreenShareError(message);
      setErrorMessage(message);
      return;
    }

    if (countActiveScreenShares(activeRoom) >= 2) {
      const message = t("screenShare.errors.maxReached");
      useVoiceStore.getState().setScreenShareError(message);
      setErrorMessage(message);
      return;
    }

    try {
      const currentQuality = useVoiceStore.getState().screenShareQuality;
      const publication = await activeRoom.localParticipant.setScreenShareEnabled(
        true,
        getScreenShareCaptureOptions(currentQuality),
        getScreenSharePublishOptions(currentQuality),
      );
      const localScreenTrack = publication?.track;

      if (localScreenTrack instanceof LocalVideoTrack) {
        localScreenTrack.mediaStreamTrack.addEventListener(
          "ended",
          () => {
            void stopScreenShare();
          },
          { once: true },
        );
      }

      setErrorMessage(null);
      syncScreenShares(activeRoom);
    } catch (error) {
      const message = isScreenSharePermissionDenied(error)
        ? isDesktopRuntime
          ? t("screenShare.errors.permissionDeniedDesktop")
          : t("screenShare.errors.permissionDenied")
        : error instanceof Error
          ? error.message
          : t("screenShare.errors.startFailed");

      useVoiceStore.getState().setScreenShareError(message);
      setErrorMessage(message);
      await stopScreenShare(activeRoom).catch(() => undefined);
    }
  }, [isDesktopRuntime, stopScreenShare, syncScreenShares, t]);

  const leaveChannel = useCallback(async () => {
    stopHeartbeat();
    clearReconnectTimeout();
    joinRequestRef.current = null;

    const activeSession = useVoiceStore.getState().sessionId;
    const activeServer = useVoiceStore.getState().serverId;
    const activeChannel = useVoiceStore.getState().activeChannelId;
    const activeRoom = roomRef.current;

    roomRef.current = null;
    appliedAudioPreferencesSignatureRef.current = null;
    microphoneRecoveryPromiseRef.current = null;
    lastEmittedScreenShareStateRef.current = null;
    setRoom(null);
    setParticipants([]);
    setScreenShares([]);
    setActiveScreenShareIdState(null);
    setCameraStatus("disabled");
    setCameraError(null);
    setConnectionState(ConnectionState.Disconnected);
    setErrorMessage(null);

    if (activeRoom) {
      activeRoom.removeAllListeners();
      await stopScreenShare(activeRoom).catch(() => undefined);
      await stopCamera(activeRoom).catch(() => undefined);
      await stopLocalTracks(activeRoom).catch(() => undefined);
      await activeRoom.disconnect(true).catch(() => undefined);
      setParticipants([]);
      setScreenShares([]);
      setActiveScreenShareIdState(null);
      setCameraStatus("disabled");
      useVoiceStore.getState().clearScreenShareState();
    }

    if (activeSession) {
      await deleteVoiceState().catch(() => undefined);
    }

    await resetKrispProcessor();

    if (activeServer && activeChannel) {
      updateVoiceStatesCache(activeServer, activeChannel, []);
    }

    useVoiceStore.getState().leave();
  }, [
    clearReconnectTimeout,
    resetKrispProcessor,
    stopHeartbeat,
    stopCamera,
    stopScreenShare,
    updateVoiceStatesCache,
  ]);

  const joinChannel = useCallback(
    async ({ channelId, serverId: nextServerId }: { channelId: string; serverId: string }) => {
      const currentState = useVoiceStore.getState();
      const nextJoinKey = `${nextServerId}:${channelId}`;
      const microphoneDeniedMessage = isDesktopRuntime
        ? t("voice.errors.microphoneDeniedDesktop")
        : t("voice.errors.microphoneDenied");
      const microphoneEnableFailedMessage = t("voice.errors.microphoneEnableFailed");
      const shouldStartMuted = currentState.isMuted;
      const shouldStartDeafened = currentState.isDeafened;

      if (
        currentState.activeChannelId === channelId &&
        currentState.serverId === nextServerId &&
        roomRef.current &&
        roomRef.current.state !== ConnectionState.Disconnected
      ) {
        return;
      }

      if (joinRequestRef.current === nextJoinKey) {
        return;
      }

      let hasMicrophoneAccess = shouldStartMuted;
      const preparedMicrophoneAccess = preparedMicrophoneAccessRef.current;
      preparedMicrophoneAccessRef.current = null;

      if (shouldStartMuted) {
        hasMicrophoneAccess = true;
      } else if (preparedMicrophoneAccess !== null) {
        hasMicrophoneAccess = preparedMicrophoneAccess;
      } else {
        try {
          hasMicrophoneAccess = await requestMicrophonePermission();
        } catch (error) {
          if (isMicrophonePermissionDenied(error)) {
            hasMicrophoneAccess = false;
          } else {
            throw error;
          }
        }
      }

      if (
        joinRequestRef.current ||
        roomRef.current ||
        currentState.activeChannelId ||
        currentState.sessionId
      ) {
        await leaveChannel();
      }

      joinRequestRef.current = nextJoinKey;
      setIsJoining(true);
      setErrorMessage(null);
      setCameraError(null);
      setCameraStatus("disabled");

      const sessionId = crypto.randomUUID();
      const nextRoom = new Room({
        audioCaptureDefaults: buildAudioCaptureOptions(currentState.audioPreferences),
      });
      roomRef.current = nextRoom;
      setRoom(nextRoom);

      const syncRoomParticipants = () => {
        applyRemoteAudioState(
          nextRoom,
          useVoiceStore.getState().isDeafened,
          useVoiceStore.getState().participantVolumes,
        );
        syncParticipants(nextRoom);
        syncScreenShares(nextRoom);
      };

      nextRoom.on("participantConnected", syncRoomParticipants);
      nextRoom.on("participantDisconnected", syncRoomParticipants);
      nextRoom.on("activeSpeakersChanged", syncRoomParticipants);
      nextRoom.on("trackMuted", syncRoomParticipants);
      nextRoom.on("trackUnmuted", syncRoomParticipants);
      nextRoom.on("localTrackPublished", syncRoomParticipants);
      nextRoom.on("localTrackUnpublished", syncRoomParticipants);
      nextRoom.on("participantMetadataChanged", syncRoomParticipants);
      nextRoom.on("participantNameChanged", syncRoomParticipants);
      nextRoom.on("trackPublished", syncRoomParticipants);
      nextRoom.on("trackUnpublished", syncRoomParticipants);
      nextRoom.on("trackSubscribed", syncRoomParticipants);
      nextRoom.on("trackUnsubscribed", syncRoomParticipants);
      nextRoom.on("connectionStateChanged", (state) => {
        setConnectionState(state);
        syncRoomParticipants();

        if (
          state === ConnectionState.Reconnecting ||
          state === ConnectionState.SignalReconnecting
        ) {
          clearReconnectTimeout();
          setConnectionWarning(t("voice.errors.connectionUnstable"));
          reconnectTimeoutRef.current = setTimeout(() => {
            setConnectionWarning(t("voice.errors.connectionStillReconnecting"));
          }, RECONNECT_TIMEOUT_MS);
          return;
        }

        clearReconnectTimeout();
        if (state === ConnectionState.Connected) {
          clearConnectionWarning();
        }
      });
      nextRoom.on("reconnected", () => {
        clearReconnectTimeout();
        clearConnectionWarning();
        void upsertVoiceState({
          channelId,
          serverId: nextServerId,
          sessionId,
        })
          .then((state) => {
            updateVoiceStatesCache(nextServerId, channelId, state.participants);
          })
          .catch(() => {
            setErrorMessage("Voice state could not be restored.");
          });
        void ensureLocalMicrophonePublished(nextRoom)
          .then((recovered) => {
            if (!recovered) {
              return undefined;
            }

            return applyAudioPreferencesToRoom(nextRoom);
          })
          .catch((error) => {
            if (isLocalMicrophoneTrackLive(getLocalMicrophoneTrack(nextRoom))) {
              logError("[voice] Post-reconnect microphone sync skipped", error);
              return;
            }
            setErrorMessage(microphoneEnableFailedMessage);
          });
        syncRoomParticipants();
      });
      nextRoom.on("disconnected", () => {
        setConnectionState(ConnectionState.Disconnected);
        if (roomRef.current === nextRoom && useVoiceStore.getState().sessionId) {
          setConnectionWarning(t("voice.errors.connectionFailed"));
        }
      });

      try {
        const tokenResponse = await fetchLiveKitToken({ channelId });
        supportsLiveKitCloudNoiseCancellationRef.current = isLiveKitCloudUrl(tokenResponse.url);

        if (!supportsLiveKitCloudNoiseCancellationRef.current) {
          setKrispAvailability("requires_livekit_cloud");
        } else if (krispAvailability === "requires_livekit_cloud") {
          setKrispAvailability("checking");
        }

        await connectLiveKitRoomWithRetry(nextRoom, tokenResponse.url, tokenResponse.token);
        setConnectionState(nextRoom.state);

        const state = await upsertVoiceState({
          channelId,
          serverId: nextServerId,
          sessionId,
        });

        useVoiceStore.getState().join({
          channelId,
          serverId: nextServerId,
          sessionId,
        });
        useVoiceStore.getState().setMuted(shouldStartMuted || !hasMicrophoneAccess);
        useVoiceStore.getState().setDeafened(shouldStartDeafened);

        updateVoiceStatesCache(nextServerId, channelId, state.participants);
        startHeartbeat(sessionId);
        void nextRoom.startAudio().catch(() => undefined);
        applyRemoteAudioState(
          nextRoom,
          shouldStartDeafened,
          useVoiceStore.getState().participantVolumes,
        );
        syncRoomParticipants();

        if (!hasMicrophoneAccess) {
          setIsKrispNoiseCancellationActive(false);
          setErrorMessage(microphoneDeniedMessage);
          syncParticipants(nextRoom);
          return;
        }

        if (shouldStartMuted) {
          setIsKrispNoiseCancellationActive(false);
          setErrorMessage(null);
          syncParticipants(nextRoom);
          return;
        }

        void enableLocalMicrophone(nextRoom, useVoiceStore.getState().audioPreferences)
          .then(async ({ preferences, track: localMicrophoneTrack }) => {
            if (localMicrophoneTrack) {
              await syncKrispNoiseCancellation(
                localMicrophoneTrack,
                preferences.krispNoiseCancellation,
              );
            }
            appliedAudioPreferencesSignatureRef.current =
              getAudioCaptureRestartSignature(preferences);
            setErrorMessage(null);
            useVoiceStore.getState().setMuted(false);
            syncParticipants(nextRoom);
          })
          .catch((error) => {
            if (isLocalMicrophoneTrackLive(getLocalMicrophoneTrack(nextRoom))) {
              logError(
                "[voice] Microphone enable reported an error after track was published",
                error,
              );
              setErrorMessage(null);
              syncParticipants(nextRoom);
              return;
            }

            setIsKrispNoiseCancellationActive(false);
            useVoiceStore.getState().setMuted(true);
            setErrorMessage(
              isMicrophonePermissionDenied(error)
                ? microphoneDeniedMessage
                : microphoneEnableFailedMessage,
            );
            syncParticipants(nextRoom);
          });
      } catch (error) {
        roomRef.current = null;
        setRoom(null);
        setParticipants([]);
        setCameraError(null);
        setCameraStatus("disabled");
        setConnectionState(ConnectionState.Disconnected);
        appliedAudioPreferencesSignatureRef.current = null;
        nextRoom.removeAllListeners();
        await stopLocalTracks(nextRoom).catch(() => undefined);
        await nextRoom.disconnect(true).catch(() => undefined);
        await resetKrispProcessor();
        useVoiceStore.getState().leave();
        setErrorMessage(
          isMicrophonePermissionDenied(error)
            ? microphoneDeniedMessage
            : isMicrophoneDeviceUnavailable(error)
              ? microphoneEnableFailedMessage
              : t("voice.errors.connectionFailed"),
        );
        throw error;
      } finally {
        if (joinRequestRef.current === nextJoinKey) {
          joinRequestRef.current = null;
        }
        setIsJoining(false);
      }
    },
    [
      applyAudioPreferencesToRoom,
      clearConnectionWarning,
      clearReconnectTimeout,
      enableLocalMicrophone,
      ensureLocalMicrophonePublished,
      isDesktopRuntime,
      krispAvailability,
      leaveChannel,
      resetKrispProcessor,
      requestMicrophonePermission,
      startHeartbeat,
      setConnectionWarning,
      syncKrispNoiseCancellation,
      syncParticipants,
      syncScreenShares,
      t,
      updateVoiceStatesCache,
    ],
  );

  const toggleMute = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) {
      useVoiceStore.getState().toggleMute();
      return;
    }

    const nextMuted = !useVoiceStore.getState().isMuted;
    const microphoneDeniedMessage = isDesktopRuntime
      ? t("voice.errors.microphoneDeniedDesktop")
      : t("voice.errors.microphoneDenied");
    const microphoneEnableFailedMessage = t("voice.errors.microphoneEnableFailed");

    if (nextMuted) {
      try {
        await activeRoom.localParticipant.setMicrophoneEnabled(false);
      } catch {
        setErrorMessage(microphoneEnableFailedMessage);
        return;
      }
      appliedAudioPreferencesSignatureRef.current = null;
      setIsKrispNoiseCancellationActive(false);
    } else {
      const nextAudioPreferences = useVoiceStore.getState().audioPreferences;

      try {
        await requestMicrophonePermission();
      } catch (error) {
        if (isMicrophonePermissionDenied(error)) {
          setErrorMessage(microphoneDeniedMessage);
          useVoiceStore.getState().setMuted(true);
          syncParticipants(activeRoom);
          return;
        }

        setErrorMessage(microphoneEnableFailedMessage);
        return;
      }

      try {
        const { preferences, track: localMicrophoneTrack } = await enableLocalMicrophone(
          activeRoom,
          nextAudioPreferences,
        );
        if (localMicrophoneTrack) {
          await syncKrispNoiseCancellation(
            localMicrophoneTrack,
            preferences.krispNoiseCancellation,
          );
        }
        appliedAudioPreferencesSignatureRef.current = getAudioCaptureRestartSignature(preferences);
        setErrorMessage(null);
      } catch (error) {
        if (isLocalMicrophoneTrackLive(getLocalMicrophoneTrack(activeRoom))) {
          logError("[voice] Microphone unmute reported an error after track was published", error);
          useVoiceStore.getState().setMuted(false);
          setErrorMessage(null);
          syncParticipants(activeRoom);
          return;
        }

        setIsKrispNoiseCancellationActive(false);
        useVoiceStore.getState().setMuted(true);
        setErrorMessage(
          isMicrophonePermissionDenied(error)
            ? microphoneDeniedMessage
            : microphoneEnableFailedMessage,
        );
        syncParticipants(activeRoom);
        return;
      }
    }

    useVoiceStore.getState().setMuted(nextMuted);
    syncParticipants(activeRoom);
  }, [
    isDesktopRuntime,
    enableLocalMicrophone,
    requestMicrophonePermission,
    syncKrispNoiseCancellation,
    syncParticipants,
    t,
  ]);

  const toggleDeafen = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) {
      useVoiceStore.getState().toggleDeafen();
      return;
    }

    const nextDeafened = !useVoiceStore.getState().isDeafened;
    useVoiceStore.getState().setDeafened(nextDeafened);
    applyRemoteAudioState(activeRoom, nextDeafened, useVoiceStore.getState().participantVolumes);
    syncParticipants(activeRoom);
  }, [syncParticipants]);

  useEffect(() => {
    if (!supportsLiveKitCloudNoiseCancellationRef.current) {
      setKrispAvailability("requires_livekit_cloud");
      return;
    }

    let cancelled = false;

    void ensureKrispSupport().then((module) => {
      if (cancelled) {
        return;
      }

      if (!module && krispAvailability === "checking") {
        setKrispAvailability("unavailable");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [ensureKrispSupport, krispAvailability]);

  useEffect(() => {
    const activeRoom = roomRef.current;
    if (!activeRoom) {
      return;
    }

    applyRemoteAudioState(activeRoom, isDeafened, participantVolumes);
  }, [isDeafened, participantVolumes]);

  useEffect(() => {
    const activeRoom = roomRef.current;
    if (!activeRoom) {
      return;
    }

    void applyAudioPreferencesToRoom(activeRoom).catch((error) => {
      if (isLocalMicrophoneTrackLive(getLocalMicrophoneTrack(activeRoom))) {
        logError("[voice] Audio preference sync failed while microphone remained live", error);
        return;
      }

      setErrorMessage(microphoneSettingsFailedMessageRef.current);
    });
  }, [applyAudioPreferencesToRoom]);

  const cleanupVoiceResources = useCallback(() => {
    stopHeartbeat();
    clearReconnectTimeout();

    const activeRoom = roomRef.current;
    microphoneRecoveryPromiseRef.current = null;
    if (activeRoom) {
      activeRoom.removeAllListeners();
      void stopScreenShare(activeRoom).catch(() => undefined);
      void stopCamera(activeRoom).catch(() => undefined);
      void stopLocalTracks(activeRoom).catch(() => undefined);
      void activeRoom.disconnect(true).catch(() => undefined);
    }

    void resetKrispProcessor();
  }, [clearReconnectTimeout, resetKrispProcessor, stopCamera, stopHeartbeat, stopScreenShare]);

  useEffect(() => {
    cleanupVoiceResourcesRef.current = cleanupVoiceResources;
  }, [cleanupVoiceResources]);

  useEffect(() => {
    return () => {
      cleanupVoiceResourcesRef.current();
    };
  }, []);

  useEffect(() => {
    const handlePageExit = () => {
      stopHeartbeat();
      clearReconnectTimeout();

      const activeRoom = roomRef.current;
      const store = useVoiceStore.getState();

      if (store.isScreenSharing && store.screenShareMode === "voice") {
        emitVoiceScreenShareState(store.activeChannelId, store.serverId, false, {
          force: true,
        });
      }

      if (activeRoom) {
        void stopScreenShare(activeRoom).catch(() => undefined);
        void stopCamera(activeRoom).catch(() => undefined);
        void stopLocalTracks(activeRoom).catch(() => undefined);
        void activeRoom.disconnect(true).catch(() => undefined);
      }

      if (useVoiceStore.getState().sessionId) {
        void notifyVoiceExit();
      }
    };

    window.addEventListener("beforeunload", handlePageExit);
    window.addEventListener("pagehide", handlePageExit);
    window.addEventListener(WHISPR_DESKTOP_BEFORE_CLOSE_EVENT, handlePageExit);
    return () => {
      window.removeEventListener("beforeunload", handlePageExit);
      window.removeEventListener("pagehide", handlePageExit);
      window.removeEventListener(WHISPR_DESKTOP_BEFORE_CLOSE_EVENT, handlePageExit);
    };
  }, [
    clearReconnectTimeout,
    emitVoiceScreenShareState,
    stopCamera,
    stopHeartbeat,
    stopScreenShare,
  ]);

  const value = useMemo<VoiceContextValue>(
    () => ({
      activeChannelId,
      audioPreferences,
      cameraError,
      cameraStatus,
      connectionState,
      errorMessage,
      getParticipantVolume,
      isCameraEnabled: cameraStatus === "enabled",
      isApplyingAudioPreferences,
      isApplyingScreenShareQuality,
      isDeafened,
      isJoining,
      isKrispNoiseCancellationActive,
      isRecoveringKrispNoiseCancellation,
      isMuted,
      isScreenSharing,
      krispAvailability,
      participants,
      resetParticipantVolume: useVoiceStore.getState().resetParticipantVolume,
      room,
      screenShareError,
      screenShares,
      screenShareQuality,
      serverId,
      activeScreenShareId,
      setAudioPreference: useVoiceStore.getState().setAudioPreference,
      setActiveScreenShareId,
      setParticipantVolume: useVoiceStore.getState().setParticipantVolume,
      setScreenShareQuality,
      retryKrispNoiseCancellation,
      prepareForVoiceJoin,
      joinChannel,
      leaveChannel,
      stopCamera,
      stopScreenShare,
      toggleDeafen,
      toggleCamera,
      toggleMute,
      toggleScreenShare,
    }),
    [
      activeChannelId,
      activeScreenShareId,
      audioPreferences,
      cameraError,
      cameraStatus,
      connectionState,
      errorMessage,
      getParticipantVolume,
      isApplyingAudioPreferences,
      isApplyingScreenShareQuality,
      isDeafened,
      isJoining,
      isKrispNoiseCancellationActive,
      isRecoveringKrispNoiseCancellation,
      isMuted,
      isScreenSharing,
      joinChannel,
      krispAvailability,
      leaveChannel,
      participants,
      prepareForVoiceJoin,
      room,
      retryKrispNoiseCancellation,
      screenShareError,
      screenShares,
      screenShareQuality,
      serverId,
      setActiveScreenShareId,
      setScreenShareQuality,
      stopCamera,
      stopScreenShare,
      toggleCamera,
      toggleDeafen,
      toggleMute,
      toggleScreenShare,
    ],
  );

  return (
    <VoiceContext.Provider value={value}>
      {children}
      <VoiceAudioRenderer outputDeviceId={audioPreferences.outputDeviceId} room={room} />
    </VoiceContext.Provider>
  );
}

export function VoiceProvider(props: VoiceProviderProps) {
  const currentUser = useVoiceCurrentUserSnapshot(props.currentUser);
  const nextProps = { ...props, currentUser };

  if (isE2EVoiceMockEnabled()) {
    return <E2EVoiceProvider {...nextProps} />;
  }

  return <LiveVoiceProvider {...nextProps} />;
}

export function useVoiceConnection() {
  const value = useContext(VoiceContext);

  if (!value) {
    throw new Error("useVoiceConnection must be used within VoiceProvider");
  }

  return value;
}
