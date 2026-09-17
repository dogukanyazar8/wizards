import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AndroidAudioTypePresets, AudioSession } from "@livekit/react-native";
import { AppState, Platform } from "react-native";
import { mobileScreenShareWatching } from "./mobile-screen-share-watching";
import Constants from "expo-constants";
import { resolveMobileScreenShareSupport } from "./mobile-screen-share-platform";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";

// Keep shipping builds gated until the native extension passes TestFlight acceptance.
const screenShareSupported =
  resolveMobileScreenShareSupport({
    platform: Platform.OS,
    hasBroadcastExtension:
      Boolean(Constants.expoConfig?.ios?.infoPlist?.RTCAppGroupIdentifier) &&
      Constants.expoConfig?.extra?.iosBroadcastValidated === true,
  }) === "supported";
import {
  LocalAudioTrack,
  LocalVideoTrack,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  TrackEvent,
  type TrackPublication,
  type Participant,
  type RemoteParticipant,
} from "livekit-client";

import type { MobileApiClient } from "../api/mobile-api-client";
import type { MobileSessionUser } from "../auth/session-types";
import {
  fetchMobileVoiceToken,
  joinMobileVoiceState,
  leaveMobileVoiceState,
  sendMobileVoiceHeartbeat,
} from "./mobile-voice-client";
import {
  createCheckingMobileVoiceRuntimeState,
  createErroredMobileVoiceRuntimeState,
  createInitialMobileVoiceRuntimeState,
  createMobileVoiceRuntimeStateFromPermission,
  type MobileVoiceRuntimeState,
} from "./mobile-voice-contract";
import {
  advanceMobileVoiceSessionGeneration,
  createInitialMobileVoiceRoomState,
  createMobileVoiceSessionId,
  createSelfVoiceRoomParticipant,
  isCurrentMobileVoiceSessionGeneration,
  mapServerVoiceParticipantToRoomParticipant,
  mergeMobileVoiceRoomParticipants,
  redactMobileVoiceRoomError,
  transitionMobileVoiceRoomConnectionState,
  type MobileVoiceAudioOutputMode,
  type MobileVoiceRoomParticipant,
  type MobileVoiceRoomState,
  type MobileVoiceScreenShareStatus,
} from "./mobile-voice-room-contract";
import {
  getMobileScreenShareCaptureOptions,
  getMobileScreenSharePublishOptions,
  normalizeMobileScreenShareQualityId,
  setPreferredMobileScreenShareQualityId,
} from "./mobile-screen-share";
import {
  MOBILE_SCREEN_SHARE_BACKGROUND_STOP_MESSAGE,
  buildMobileScreenShareHeartbeatPayload,
  isMobileScreenSharePermissionDenied,
  redactMobileScreenShareError,
} from "./mobile-screen-share-contract";
import {
  MOBILE_VOICE_DISCONNECTED_MESSAGE,
  MOBILE_VOICE_HEARTBEAT_INTERVAL_MS,
  MOBILE_VOICE_LEVEL_CHANGE_THRESHOLD,
  MOBILE_VOICE_LEVEL_INTERVAL_MS,
  reconcileMobileVoiceForegroundInterval,
  runMobileVoiceLevelTick,
} from "./mobile-voice-lifecycle-contract";
import {
  resumeRemoteVideoFromBackground,
  suspendRemoteVideoForBackground,
} from "./mobile-remote-video-background";
import { syncMobileScreenShareAudioMute } from "./mobile-screen-share-audio";
import { shouldSuspendVoiceMediaOnAppStateChange } from "./mobile-voice-background-media";
import {
  createInitialMobilePushToTalkState,
  createMobilePushToTalkController,
  type MobilePushToTalkState,
  type MobileVoiceInputMode,
} from "./mobile-voice-ptt-contract";
import {
  getMobileMicrophoneCaptureOptions,
  setMobileMicrophoneEnabledWithNoiseSuppression,
} from "./mobile-voice-noise-contract";
import { requestMobileVoicePermissionAfterUserAction } from "./mobile-voice-runtime";
import type { MobileVoiceStateParticipant } from "@wizards/types";
import {
  DEFAULT_MOBILE_CAMERA_FACING_MODE,
  getMobileCameraCaptureOptions,
  getNextMobileCameraFacingMode,
} from "./mobile-camera-contract";
import {
  applyMobileVoiceAudioBitrate,
  enableMobileCameraWithCodecFallback,
  getMobileCameraRoomDefaults,
  type MobileCameraVideoCodec,
} from "./mobile-video-quality";
import { getMobileVoiceRoomSubscriptionOptions } from "./mobile-video-subscription";
import {
  DEFAULT_MOBILE_VOICE_DEVICE_PREFERENCES,
  getMobileVoiceAudioProcessing,
  sanitizeMobileVoiceDeviceId,
  toMobileVoiceInputOptions,
  toMobileVoiceOutputOptions,
  type MobileVoiceAudioProcessing,
  type MobileVoiceDevicePreferences,
} from "./mobile-voice-device-contract";
import { hasMobileVoiceAudioRouteInputChanged } from "./mobile-voice-audio-route";
import {
  createMobileScreenShareHealthSampler,
  resolveMobileScreenShareHealthSource,
  shouldSampleMobileScreenShareHealthOnTick,
} from "./mobile-screen-share-health";
import {
  createMobileVoiceAudioActivityFromPeer,
  getFreshMobileVoiceAudioActivity,
  measureMobileVoiceAudioActivity,
  readMobileVoiceAudioLevel,
  type MobileVoiceAudioActivity,
  type MobileVoiceAudioLevelDirection,
  type MobileVoiceAudioStatsReport,
} from "./mobile-voice-audio-meter";

/**
 * How often a connected room re-reads the platform's output list. Plugging a
 * headset in or pulling it out is not an event the app can subscribe to, so the
 * dock icon and status badges catch up on the next tick.
 */
const MOBILE_VOICE_AUDIO_ROUTE_SYNC_INTERVAL_MS = 4_000;

type JoinVoiceChannelInput = {
  channelId: string;
  channelName: string;
  permission?: MobileVoiceRuntimeState;
  serverId: string;
};

export type JoinDirectCallInput = {
  conversationId: string;
  title: string;
  video: boolean;
};

type JoinVoiceSessionInput =
  | (JoinVoiceChannelInput & { sessionMode: "channel"; video: false })
  | (JoinDirectCallInput & {
      channelId: null;
      channelName: string;
      serverId: null;
      sessionMode: "direct";
    });

type SyncServerVoiceParticipantsInput = {
  channelId: string;
  participants: readonly MobileVoiceStateParticipant[];
  serverId: string;
};

type SyncServerVoiceAudioLevelInput = {
  audioLevel: number;
  channelId: string;
  isMuted: boolean;
  isSpeaking: boolean;
  userId: string;
};

function toBoundedAudioLevel(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value ?? 0));
}

function participantIdentityToUserId(identity: string): string {
  return identity.replace(/^user:/, "");
}

function getScreenShareTrackKey(participant: MobileVoiceRoomParticipant): string | null {
  const publication = participant.screenShareTrackRef?.publication;
  if (!publication) {
    return null;
  }

  return `${publication.trackSid}:${publication.track ? "subscribed" : "pending"}`;
}

function getCameraTrackKey(participant: MobileVoiceRoomParticipant): string | null {
  const publication = participant.cameraTrackRef?.publication;
  return publication
    ? `${publication.trackSid}:${publication.track ? "subscribed" : "pending"}`
    : null;
}

function voiceParticipantsChanged(
  current: readonly MobileVoiceRoomParticipant[],
  next: readonly MobileVoiceRoomParticipant[],
): boolean {
  if (current.length !== next.length) {
    return true;
  }

  const currentByUserId = new Map(current.map((participant) => [participant.userId, participant]));

  for (const participant of next) {
    const previous = currentByUserId.get(participant.userId);
    if (!previous) {
      return true;
    }

    if (
      previous.isCameraEnabled !== participant.isCameraEnabled ||
      previous.isMuted !== participant.isMuted ||
      previous.isScreenSharing !== participant.isScreenSharing ||
      previous.isSpeaking !== participant.isSpeaking ||
      getCameraTrackKey(previous) !== getCameraTrackKey(participant) ||
      getScreenShareTrackKey(previous) !== getScreenShareTrackKey(participant) ||
      Math.abs(previous.audioLevel - participant.audioLevel) >= MOBILE_VOICE_LEVEL_CHANGE_THRESHOLD
    ) {
      return true;
    }
  }

  return false;
}

function getCameraTrackRef(participant: Participant): MobileVoiceRoomParticipant["cameraTrackRef"] {
  const publication = participant.getTrackPublication(Track.Source.Camera);
  if (!publication?.track) {
    return undefined;
  }

  return {
    participant,
    publication,
    source: Track.Source.Camera,
  };
}

function getScreenShareTrackRef(
  participant: Participant,
): MobileVoiceRoomParticipant["screenShareTrackRef"] {
  const publication = participant.getTrackPublication(Track.Source.ScreenShare);
  if (!publication?.track) {
    return undefined;
  }

  return {
    participant,
    publication,
    source: Track.Source.ScreenShare,
  };
}

type MobileVoiceAudioLevelSource = {
  direction: MobileVoiceAudioLevelDirection;
  isMuted: boolean;
  readStats: () => Promise<MobileVoiceAudioStatsReport | null>;
  userId: string;
};

/**
 * One stats reader per live microphone track. Muted publishers are still listed
 * so their entry is zeroed instead of decaying through the release hold, and a
 * participant with no readable sender/receiver is skipped so the LiveKit value
 * keeps driving that avatar.
 */
function collectMobileVoiceAudioLevelSources(room: Room): MobileVoiceAudioLevelSource[] {
  const sources: MobileVoiceAudioLevelSource[] = [];
  const participants: Participant[] = [
    room.localParticipant,
    ...Array.from(room.remoteParticipants.values()),
  ];

  for (const participant of participants) {
    const publication = participant.getTrackPublication(Track.Source.Microphone);
    const track = publication?.track;
    if (!publication || !track) {
      continue;
    }

    const userId = participantIdentityToUserId(participant.identity);
    const isMuted = publication.isMuted;

    if (track instanceof LocalAudioTrack) {
      const sender = track.sender;
      if (sender) {
        sources.push({
          direction: "outbound",
          isMuted,
          readStats: () => sender.getStats() as Promise<MobileVoiceAudioStatsReport>,
          userId,
        });
      }
      continue;
    }

    if (track instanceof RemoteAudioTrack) {
      const receiver = track.receiver;
      if (receiver) {
        sources.push({
          direction: "inbound",
          isMuted,
          readStats: () => receiver.getStats() as Promise<MobileVoiceAudioStatsReport>,
          userId,
        });
      }
    }
  }

  return sources;
}

async function readMobileVoiceAudioLevelForSource(
  source: MobileVoiceAudioLevelSource,
): Promise<number | null> {
  if (source.isMuted) {
    return 0;
  }

  try {
    return readMobileVoiceAudioLevel(await source.readStats(), source.direction);
  } catch {
    // A track torn down mid-read rejects; the LiveKit value covers that avatar
    // until the next tick finds a live sender again.
    return null;
  }
}

function mapLiveKitParticipantToRoomParticipant(
  participant: Participant,
  currentUser: MobileSessionUser,
  measuredActivity?: MobileVoiceAudioActivity | null,
): MobileVoiceRoomParticipant {
  const userId = participantIdentityToUserId(participant.identity);
  const isSelf = userId === currentUser.id;
  const microphonePublication = participant.getTrackPublication(Track.Source.Microphone);
  const screenSharePublication = participant.getTrackPublication(Track.Source.ScreenShare);
  const cameraTrackRef = getCameraTrackRef(participant);
  const screenShareTrackRef = getScreenShareTrackRef(participant);
  // LiveKit carries the display name in the join token; fall back to it so a
  // remote participant never renders as a raw UUID before server state syncs.
  const liveKitName =
    typeof participant.name === "string" && participant.name.trim().length > 0
      ? participant.name.trim()
      : null;

  const isMuted = microphonePublication ? microphonePublication.isMuted : false;
  // A measured level is always fresher than `participant.isSpeaking`, which the
  // SFU only recomputes every few hundred milliseconds, so it wins outright.
  const measured = isMuted ? null : measuredActivity;

  const roomParticipant = {
    audioLevel: measured ? measured.audioLevel : toBoundedAudioLevel(participant.audioLevel),
    avatarUrl: isSelf ? currentUser.avatarUrl : null,
    displayName: isSelf ? currentUser.displayName : liveKitName,
    isCameraEnabled: participant.isCameraEnabled,
    isMuted,
    isScreenSharing: Boolean(
      screenSharePublication &&
      screenSharePublication.track?.mediaStreamTrack.readyState !== "ended",
    ),
    isSelf,
    isSpeaking: isMuted ? false : (measured?.isSpeaking ?? participant.isSpeaking),
    // LiveKit stamps a join time on every participant; it anchors stable stage
    // order so a tile never jumps pages just because its owner started speaking.
    joinedAt: participant.joinedAt instanceof Date ? participant.joinedAt.getTime() : undefined,
    userId,
    username: isSelf ? currentUser.username : userId,
  };

  return {
    ...roomParticipant,
    ...(cameraTrackRef ? { cameraTrackRef } : {}),
    ...(screenShareTrackRef ? { screenShareTrackRef } : {}),
  };
}

function mergeServerParticipants(
  currentUser: MobileSessionUser,
  current: readonly MobileVoiceRoomParticipant[],
  participants: readonly MobileVoiceStateParticipant[],
): MobileVoiceRoomParticipant[] {
  return mergeMobileVoiceRoomParticipants(
    current,
    participants.map((participant) =>
      mapServerVoiceParticipantToRoomParticipant(participant, currentUser.id),
    ),
  );
}

function mergeLiveKitParticipants(
  currentUser: MobileSessionUser,
  current: readonly MobileVoiceRoomParticipant[],
  room: Room,
  audioActivity: ReadonlyMap<string, MobileVoiceAudioActivity>,
): MobileVoiceRoomParticipant[] {
  const now = Date.now();
  const toParticipant = (participant: Participant) =>
    mapLiveKitParticipantToRoomParticipant(
      participant,
      currentUser,
      getFreshMobileVoiceAudioActivity(
        audioActivity.get(participantIdentityToUserId(participant.identity)),
        now,
      ),
    );

  const participants = [
    toParticipant(room.localParticipant),
    ...Array.from(room.remoteParticipants.values()).map(toParticipant),
  ];

  return mergeMobileVoiceRoomParticipants(current, participants);
}

function isLocalParticipantScreenSharing(room: Room): boolean {
  const publication = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
  return Boolean(publication && publication.track?.mediaStreamTrack.readyState !== "ended");
}

function resolveSelfScreenShareStatus(
  currentStatus: MobileVoiceScreenShareStatus,
  isScreenSharing: boolean,
): MobileVoiceScreenShareStatus {
  if (!screenShareSupported) return "unsupported";
  if (isScreenSharing) {
    return "on";
  }

  if (
    currentStatus === "on" ||
    currentStatus === "starting" ||
    currentStatus === "stopping" ||
    currentStatus === "unsupported"
  ) {
    return "off";
  }

  return currentStatus;
}

export function useMobileVoiceRoom({
  apiClient,
  cameraPermissionDeniedMessage = "Camera permission is required for a video call.",
  currentUser,
  directCallConnectionErrorMessage = "Direct call could not connect.",
  directCallMicrophonePermissionDeniedMessage = "Microphone permission is required for a direct call.",
  directCallVideoErrorMessage = "Video could not be started.",
  onVoiceDevicePreferencesChange,
  requestCameraPermissionAfterUserAction,
  voiceDevicePreferences = DEFAULT_MOBILE_VOICE_DEVICE_PREFERENCES,
  voiceInputMode,
}: {
  apiClient: MobileApiClient;
  cameraPermissionDeniedMessage?: string;
  currentUser: MobileSessionUser | null;
  directCallConnectionErrorMessage?: string;
  directCallMicrophonePermissionDeniedMessage?: string;
  directCallVideoErrorMessage?: string;
  onVoiceDevicePreferencesChange?(preferences: MobileVoiceDevicePreferences): void;
  requestCameraPermissionAfterUserAction?(): Promise<{
    readonly errorMessage: string | null;
    readonly hasCameraPermission: boolean;
  }>;
  voiceDevicePreferences?: MobileVoiceDevicePreferences;
  voiceInputMode: MobileVoiceInputMode;
}) {
  const [permissionState, setPermissionState] = useState<MobileVoiceRuntimeState>(
    createInitialMobileVoiceRuntimeState,
  );
  const [roomState, setRoomState] = useState<MobileVoiceRoomState>(
    createInitialMobileVoiceRoomState,
  );
  const [pushToTalkState, setPushToTalkState] = useState<MobilePushToTalkState>(
    createInitialMobilePushToTalkState,
  );
  // Every camera publish carries the facing mode, so the stored direction and the
  // physical camera cannot drift apart and make the first flip a no-op.
  const cameraFacingMode = roomState.cameraFacingMode;
  const roomRef = useRef<Room | null>(null);
  const screenShareOperationRef = useRef<Room | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const screenShareAudioMuteSignatureRef = useRef<string | null>(null);
  const screenShareAudioMuteRoomRef = useRef<Room | null>(null);
  /** Measured (or peer-reported) speaking state per user, keyed by user id. */
  const audioActivityRef = useRef<Map<string, MobileVoiceAudioActivity>>(new Map());
  /** Guards the stats batch so a slow device throttles itself by dropping ticks. */
  const audioSampleInFlightRef = useRef(false);
  // Ş0.2: screen share health rides the level ticker (T7 — no timer of its own).
  // Tick counter picks every 22nd tick; the baseline turns counters into rates;
  // the in-flight flag drops a tick while the previous native read resolves.
  const screenShareHealthTickRef = useRef(0);
  const screenShareHealthSampler = useMemo(
    () =>
      createMobileScreenShareHealthSampler({
        onSample: (screenShareHealth, screenShareHealthTrack) => {
          setRoomState((current) =>
            current.screenShareHealth === screenShareHealth &&
            current.screenShareHealthTrack === screenShareHealthTrack
              ? current
              : {
                  ...current,
                  screenShareHealth,
                  screenShareHealthTrack,
                },
          );
        },
      }),
    [],
  );
  const sessionIdRef = useRef<string | null>(null);
  const sessionModeRef = useRef<"channel" | "direct" | null>(null);
  const joinPendingRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const currentUserRef = useRef<MobileSessionUser | null>(currentUser);
  const voiceDevicePreferencesRef = useRef(voiceDevicePreferences);
  const isIntentionalLeaveRef = useRef(false);
  const intentionallyDisconnectedRoomsRef = useRef<WeakSet<Room>>(new WeakSet());
  // >0 while a user-initiated capture dialog (screen-share consent, camera
  // permission, iOS broadcast picker) is up. A counter, not a flag, so an
  // overlapping camera+screen flow cannot end the guard early.
  const captureConsentDepthRef = useRef(0);
  // Track sids this hook disabled when the app went to the background. Only
  // these are re-enabled on the way back; a publication someone else disabled is
  // never resumed on our behalf.
  const backgroundSuspendedRemoteVideoSidsRef = useRef<Set<string>>(new Set());

  const startSessionGeneration = useCallback(() => {
    sessionGenerationRef.current = advanceMobileVoiceSessionGeneration(
      sessionGenerationRef.current,
    );
    return sessionGenerationRef.current;
  }, []);

  const isCurrentSessionGeneration = useCallback(
    (generation: number) =>
      isCurrentMobileVoiceSessionGeneration(generation, sessionGenerationRef.current),
    [],
  );

  const beginCaptureConsentGuard = useCallback(() => {
    captureConsentDepthRef.current += 1;
  }, []);

  const endCaptureConsentGuard = useCallback(() => {
    captureConsentDepthRef.current = Math.max(0, captureConsentDepthRef.current - 1);
  }, []);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    voiceDevicePreferencesRef.current = voiceDevicePreferences;
    // Mirrored into the screen-share contract so even a call site that publishes
    // without an explicit quality still honours what the user picked.
    setPreferredMobileScreenShareQualityId(voiceDevicePreferences.screenShareQualityId);
    setRoomState((current) => ({
      ...current,
      noiseSuppressionEnabled: voiceDevicePreferences.noiseSuppressionEnabled,
      selectedAudioInputId: voiceDevicePreferences.audioInputId,
      selectedAudioOutputId: voiceDevicePreferences.audioOutputId,
    }));
  }, [voiceDevicePreferences]);

  const clearHeartbeat = useCallback(() => {
    if (!heartbeatRef.current) {
      return;
    }

    clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
  }, []);

  const clearLevelTicker = useCallback(() => {
    screenShareHealthTickRef.current = 0;
    screenShareHealthSampler.stop();
    audioActivityRef.current.clear();
    audioSampleInFlightRef.current = false;

    if (!levelTickerRef.current) {
      return;
    }

    clearInterval(levelTickerRef.current);
    levelTickerRef.current = null;
  }, [screenShareHealthSampler]);

  const updateParticipantsFromRoom = useCallback(
    (generation?: number) => {
      if (generation !== undefined && !isCurrentSessionGeneration(generation)) {
        return;
      }

      const user = currentUserRef.current;
      const room = roomRef.current;

      if (!user || !room) {
        return;
      }

      // Level ticks also refresh participant state. Native volume only changes
      // when the preference, room, or remote participant set actually changes.
      if (screenShareAudioMuteRoomRef.current !== room) {
        screenShareAudioMuteRoomRef.current = room;
        screenShareAudioMuteSignatureRef.current = null;
      }
      screenShareAudioMuteSignatureRef.current = syncMobileScreenShareAudioMute(
        room,
        voiceDevicePreferencesRef.current.screenShareAudioMuted,
        screenShareAudioMuteSignatureRef.current,
      );

      setRoomState((current) => {
        if (generation !== undefined && !isCurrentSessionGeneration(generation)) {
          return current;
        }

        const participants = mergeLiveKitParticipants(
          user,
          current.participants,
          room,
          audioActivityRef.current,
        );
        const selfCameraEnabled = room.localParticipant.isCameraEnabled;
        const selfMuted = !room.localParticipant.isMicrophoneEnabled;
        const selfScreenShareEnabled = isLocalParticipantScreenSharing(room);
        const screenShareStatus = resolveSelfScreenShareStatus(
          current.screenShareStatus,
          selfScreenShareEnabled,
        );

        if (
          current.selfCameraEnabled === selfCameraEnabled &&
          current.selfMuted === selfMuted &&
          current.selfScreenShareEnabled === selfScreenShareEnabled &&
          current.screenShareStatus === screenShareStatus &&
          !voiceParticipantsChanged(current.participants, participants)
        ) {
          return current;
        }

        return {
          ...current,
          participants,
          screenShareStatus,
          selfCameraEnabled,
          selfMuted,
          selfScreenShareEnabled,
          updatedAt: Date.now(),
        };
      });
    },
    [isCurrentSessionGeneration],
  );

  const setMobileMicrophoneEnabled = useCallback(
    async (enabled: boolean) => {
      const room = roomRef.current;
      if (!room) {
        return;
      }

      await setMobileMicrophoneEnabledWithNoiseSuppression(
        room.localParticipant,
        enabled,
        getMobileMicrophoneCaptureOptions(
          getMobileVoiceAudioProcessing(voiceDevicePreferencesRef.current),
        ),
      );
      updateParticipantsFromRoom();
    },
    [updateParticipantsFromRoom],
  );

  const pushToTalkController = useMemo(
    () =>
      createMobilePushToTalkController({
        onStateChange: setPushToTalkState,
        setMicrophoneEnabled: setMobileMicrophoneEnabled,
        timers: {
          clearTimeout,
          now: () => Date.now(),
          setTimeout,
        },
      }),
    [setMobileMicrophoneEnabled],
  );

  const requestMicrophonePermission = useCallback(async () => {
    setPermissionState((current) => createCheckingMobileVoiceRuntimeState(current));
    const nextState = await requestMobileVoicePermissionAfterUserAction();
    setPermissionState(nextState);
    return nextState;
  }, []);

  const commitVoiceDevicePreferences = useCallback(
    (nextPreferences: MobileVoiceDevicePreferences) => {
      voiceDevicePreferencesRef.current = nextPreferences;
      onVoiceDevicePreferencesChange?.(nextPreferences);
      setRoomState((current) => ({
        ...current,
        noiseSuppressionEnabled: nextPreferences.noiseSuppressionEnabled,
        selectedAudioInputId: nextPreferences.audioInputId,
        selectedAudioOutputId: nextPreferences.audioOutputId,
        updatedAt: Date.now(),
      }));
    },
    [onVoiceDevicePreferencesChange],
  );

  const enumerateVoiceDevices = useCallback(
    async (room: Room, generation?: number) => {
      const [rawInputs, rawOutputs] = await Promise.all([
        Room.getLocalDevices("audioinput"),
        AudioSession.getAudioOutputs(),
      ]);
      if (generation !== undefined && !isCurrentSessionGeneration(generation)) {
        return;
      }
      const availableAudioInputs = toMobileVoiceInputOptions(rawInputs);
      const availableAudioOutputs = toMobileVoiceOutputOptions(rawOutputs);
      const currentPreferences = voiceDevicePreferencesRef.current;
      const selectedAudioInputId = availableAudioInputs.some(
        ({ id }) => id === currentPreferences.audioInputId,
      )
        ? currentPreferences.audioInputId
        : null;
      const selectedAudioOutputId = availableAudioOutputs.some(
        ({ id }) => id === currentPreferences.audioOutputId,
      )
        ? currentPreferences.audioOutputId
        : null;

      if (selectedAudioInputId) {
        await room.switchActiveDevice("audioinput", selectedAudioInputId);
      }
      if (selectedAudioOutputId) {
        await AudioSession.selectAudioOutput(selectedAudioOutputId);
      }
      if (generation !== undefined && !isCurrentSessionGeneration(generation)) {
        return;
      }

      if (
        selectedAudioInputId !== currentPreferences.audioInputId ||
        selectedAudioOutputId !== currentPreferences.audioOutputId
      ) {
        commitVoiceDevicePreferences({
          ...currentPreferences,
          audioInputId: selectedAudioInputId,
          audioOutputId: selectedAudioOutputId,
        });
      }

      setRoomState((current) => ({
        ...current,
        availableAudioInputs,
        availableAudioOutputs,
        selectedAudioInputId,
        selectedAudioOutputId,
        selfAudioOutput:
          selectedAudioOutputId === "speaker" || selectedAudioOutputId === "force_speaker"
            ? "speaker"
            : "default",
        updatedAt: Date.now(),
      }));
    },
    [commitVoiceDevicePreferences, isCurrentSessionGeneration],
  );

  /**
   * Read-only route sync. `enumerateVoiceDevices` re-applies the stored device
   * selection as a side effect, so polling it would fight whatever the OS just
   * did; this path reads the list, nothing more, and the diff guard keeps a
   * quiet tick from producing a render.
   */
  const syncVoiceAudioRoute = useCallback(async () => {
    const generation = sessionGenerationRef.current;
    const rawOutputs = await AudioSession.getAudioOutputs().catch(() => null);
    if (!rawOutputs || !isCurrentSessionGeneration(generation)) {
      return;
    }

    const availableAudioOutputs = toMobileVoiceOutputOptions(rawOutputs);
    const preferredOutputId = voiceDevicePreferencesRef.current.audioOutputId;
    const selectedAudioOutputId = availableAudioOutputs.some(({ id }) => id === preferredOutputId)
      ? preferredOutputId
      : null;

    setRoomState((current) => {
      if (
        !hasMobileVoiceAudioRouteInputChanged(
          {
            availableAudioOutputs: current.availableAudioOutputs,
            selectedAudioOutputId: current.selectedAudioOutputId,
          },
          { availableAudioOutputs, selectedAudioOutputId },
        )
      ) {
        return current;
      }

      return {
        ...current,
        availableAudioOutputs,
        selectedAudioOutputId,
        selfAudioOutput:
          selectedAudioOutputId === "speaker" || selectedAudioOutputId === "force_speaker"
            ? "speaker"
            : "default",
        updatedAt: Date.now(),
      };
    });
  }, [isCurrentSessionGeneration]);

  const refreshVoiceDevices = useCallback(async () => {
    const room = roomRef.current;
    if (!room) {
      return;
    }

    const generation = sessionGenerationRef.current;

    try {
      await enumerateVoiceDevices(room, generation);
    } catch (error) {
      if (!isCurrentSessionGeneration(generation)) {
        return;
      }

      setRoomState((current) => ({
        ...current,
        errorMessage: redactMobileVoiceRoomError(error),
        updatedAt: Date.now(),
      }));
    }
  }, [enumerateVoiceDevices, isCurrentSessionGeneration]);

  const leaveVoiceChannel = useCallback(async () => {
    const generation = startSessionGeneration();
    const sessionId = sessionIdRef.current;
    const room = roomRef.current;
    isIntentionalLeaveRef.current = true;
    if (room) {
      intentionallyDisconnectedRoomsRef.current.add(room);
    }

    // Muting a track whose peer connection already closed rejects; leaving must continue.
    await pushToTalkController.cancel({ closeMicrophone: true }).catch(() => undefined);
    clearHeartbeat();
    clearLevelTicker();
    setRoomState((current) =>
      current.status === "idle"
        ? current
        : transitionMobileVoiceRoomConnectionState(current, "leaving", Date.now()),
    );

    try {
      try {
        // disconnect() is async: when the peer already tore the peer connection down it
        // rejects with "PC manager is closed", so the rejection must be swallowed here
        // instead of surfacing as an unhandled promise.
        await room?.disconnect(true).catch(() => undefined);
      } catch {
        // Room disconnect is best-effort; server state cleanup is still attempted.
      } finally {
        roomRef.current = null;
        backgroundSuspendedRemoteVideoSidsRef.current.clear();
      }

      try {
        await AudioSession.stopAudioSession();
      } catch {
        // Audio session cleanup must not block server-side voice state cleanup.
      }

      if (sessionId && sessionModeRef.current === "channel") {
        try {
          await leaveMobileVoiceState(apiClient, { sessionId });
        } catch {
          // Stale server state is bounded by the heartbeat timeout.
        }
      }

      if (isCurrentSessionGeneration(generation)) {
        sessionIdRef.current = null;
        sessionModeRef.current = null;
        setRoomState(createInitialMobileVoiceRoomState());
      }
    } finally {
      isIntentionalLeaveRef.current = false;
    }
  }, [
    apiClient,
    clearHeartbeat,
    clearLevelTicker,
    isCurrentSessionGeneration,
    pushToTalkController,
    startSessionGeneration,
  ]);

  /**
   * Reads every live microphone's WebRTC audio level and folds it into the
   * activity map the participant snapshot renders from. One batched read per
   * tick; a tick that arrives while the previous batch is still resolving is
   * dropped, so a slow device degrades to a lower sample rate instead of piling
   * up bridge calls.
   */
  const sampleRoomAudioActivity = useCallback(
    async (generation: number): Promise<boolean> => {
      const room = roomRef.current;
      if (!room || audioSampleInFlightRef.current || !isCurrentSessionGeneration(generation)) {
        return false;
      }

      const sources = collectMobileVoiceAudioLevelSources(room);
      if (sources.length === 0) {
        audioActivityRef.current.clear();
        return true;
      }

      audioSampleInFlightRef.current = true;
      try {
        const readings = await Promise.all(
          sources.map(async (source) => ({
            level: await readMobileVoiceAudioLevelForSource(source),
            source,
          })),
        );

        if (roomRef.current !== room || !isCurrentSessionGeneration(generation)) {
          return false;
        }

        const now = Date.now();
        const activity = audioActivityRef.current;
        const liveUserIds = new Set(sources.map((source) => source.userId));

        for (const { level, source } of readings) {
          if (level === null) {
            // No level on this platform: drop the stale entry so the LiveKit
            // value takes the avatar back instead of freezing it mid-state.
            activity.delete(source.userId);
            continue;
          }

          activity.set(
            source.userId,
            measureMobileVoiceAudioActivity({
              isMuted: source.isMuted,
              level,
              now,
              previous: activity.get(source.userId),
            }),
          );
        }

        for (const userId of [...activity.keys()]) {
          if (!liveUserIds.has(userId)) {
            activity.delete(userId);
          }
        }
        return true;
      } finally {
        audioSampleInFlightRef.current = false;
      }
    },
    [isCurrentSessionGeneration],
  );

  /**
   * Ş0.2 / K16: one `getStats` on the share on stage about every 2 s, riding
   * the level ticker. The sample lands in `roomState.screenShareHealth` for the
   * viewer title and in the shared tracker the health reporter drains.
   */
  const sampleScreenShareHealthOnTick = useCallback(
    async (generation: number): Promise<void> => {
      screenShareHealthTickRef.current += 1;
      if (
        !shouldSampleMobileScreenShareHealthOnTick(screenShareHealthTickRef.current) ||
        !isCurrentSessionGeneration(generation)
      )
        return;
      await screenShareHealthSampler.sample(resolveMobileScreenShareHealthSource(roomRef.current));
    },
    [isCurrentSessionGeneration, screenShareHealthSampler],
  );

  const startLevelTicker = useCallback(
    (generation: number) => {
      clearLevelTicker();
      levelTickerRef.current = reconcileMobileVoiceForegroundInterval({
        appState: appStateRef.current,
        clearTimer: clearInterval,
        current: levelTickerRef.current,
        enabled: true,
        intervalMs: MOBILE_VOICE_LEVEL_INTERVAL_MS,
        run: () => {
          mobileScreenShareWatching.tick();
          void runMobileVoiceLevelTick({
            sample: () =>
              appStateRef.current === "active"
                ? sampleRoomAudioActivity(generation)
                : Promise.resolve(false),
            updateParticipants: () => updateParticipantsFromRoom(generation),
          });
          void sampleScreenShareHealthOnTick(generation);
        },
        setTimer: setInterval,
      });
    },
    [
      clearLevelTicker,
      sampleRoomAudioActivity,
      sampleScreenShareHealthOnTick,
      updateParticipantsFromRoom,
    ],
  );

  const startHeartbeat = useCallback(
    (sessionId: string, generation: number) => {
      clearHeartbeat();
      heartbeatRef.current = setInterval(() => {
        if (!isCurrentSessionGeneration(generation)) {
          return;
        }

        const room = roomRef.current;
        const isScreenSharing = Boolean(room && isLocalParticipantScreenSharing(room));
        void sendMobileVoiceHeartbeat(apiClient, {
          ...buildMobileScreenShareHeartbeatPayload({ isScreenSharing, sessionId }),
          selfVideo: Boolean(room?.localParticipant.isCameraEnabled),
        }).catch(() => {
          if (!isCurrentSessionGeneration(generation)) {
            return;
          }
          // Heartbeat failures are surfaced by reconnect/state refresh paths.
        });
      }, MOBILE_VOICE_HEARTBEAT_INTERVAL_MS);
    },
    [apiClient, clearHeartbeat, isCurrentSessionGeneration],
  );

  const cleanupDisconnectedRoom = useCallback(
    (room: Room, generation: number) => {
      if (!isCurrentSessionGeneration(generation)) {
        return;
      }

      const terminalGeneration = startSessionGeneration();
      clearHeartbeat();
      clearLevelTicker();
      void pushToTalkController.cancel({ closeMicrophone: true }).catch(() => undefined);

      if (roomRef.current === room) {
        roomRef.current = null;
      }
      backgroundSuspendedRemoteVideoSidsRef.current.clear();

      void AudioSession.stopAudioSession().catch(() => undefined);

      if (isIntentionalLeaveRef.current || intentionallyDisconnectedRoomsRef.current.has(room)) {
        return;
      }

      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;

      if (sessionId && sessionModeRef.current === "channel") {
        // Unexpected LiveKit disconnects perform server-leave cleanup to avoid stale mobile voice state.
        void leaveMobileVoiceState(apiClient, { sessionId }).catch(() => undefined);
      }
      sessionModeRef.current = null;

      setRoomState((current) => {
        if (!isCurrentSessionGeneration(terminalGeneration)) {
          return current;
        }

        if (current.status === "idle" || current.status === "leaving") {
          return current;
        }

        return transitionMobileVoiceRoomConnectionState(
          {
            ...current,
            errorMessage: MOBILE_VOICE_DISCONNECTED_MESSAGE,
            sessionId: null,
          },
          "error",
          Date.now(),
        );
      });
    },
    [
      apiClient,
      clearHeartbeat,
      clearLevelTicker,
      isCurrentSessionGeneration,
      pushToTalkController,
      startSessionGeneration,
    ],
  );

  const bindRoomEvents = useCallback(
    (room: Room, generation: number) => {
      const endedListeners = new Map<
        TrackPublication,
        { track: NonNullable<TrackPublication["track"]>; ended: () => void }
      >();
      const unwatchScreenTrack = (publication: TrackPublication) => {
        const entry = endedListeners.get(publication);
        if (entry) entry.track.off(TrackEvent.Ended, entry.ended);
        endedListeners.delete(publication);
      };
      const watchScreenTrack = (publication: TrackPublication) => {
        if (
          publication.source !== Track.Source.ScreenShare ||
          !publication.track ||
          endedListeners.has(publication)
        )
          return;
        const ended = () => {
          if (!isCurrentSessionGeneration(generation) || roomRef.current !== room) return;
          const sessionId = sessionIdRef.current;
          if (sessionId)
            void sendMobileVoiceHeartbeat(
              apiClient,
              buildMobileScreenShareHeartbeatPayload({ isScreenSharing: false, sessionId }),
            ).catch(() => undefined);
          setRoomState((current) => ({
            ...current,
            screenShareStatus: "off",
            selfScreenShareEnabled: false,
            errorMessage:
              current.screenShareStatus === "stopping"
                ? null
                : activeMobileCopy.voiceScreenShareStoppedBySystem,
            updatedAt: Date.now(),
          }));
        };
        publication.track.on(TrackEvent.Ended, ended);
        endedListeners.set(publication, { track: publication.track, ended });
      };
      room.localParticipant.getTrackPublications().forEach(watchScreenTrack);
      const refresh = () => updateParticipantsFromRoom(generation);
      const refreshOnParticipant = (_participant: RemoteParticipant) => refresh();
      const handleDisconnected = () => {
        refresh();
        cleanupDisconnectedRoom(room, generation);
      };
      const handleReconnecting = () => {
        if (!isCurrentSessionGeneration(generation)) {
          return;
        }

        setRoomState((current) =>
          isCurrentSessionGeneration(generation)
            ? transitionMobileVoiceRoomConnectionState(current, "reconnecting", Date.now())
            : current,
        );
      };
      const handleReconnected = () => {
        if (!isCurrentSessionGeneration(generation)) {
          return;
        }

        setRoomState((current) =>
          isCurrentSessionGeneration(generation)
            ? transitionMobileVoiceRoomConnectionState(current, "connected", Date.now())
            : current,
        );
        refresh();
      };

      room.on(RoomEvent.ActiveSpeakersChanged, refresh);
      room.on(RoomEvent.ParticipantConnected, refreshOnParticipant);
      room.on(RoomEvent.ParticipantDisconnected, refreshOnParticipant);
      room.on(RoomEvent.TrackMuted, refresh);
      room.on(RoomEvent.TrackUnmuted, refresh);
      room.on(RoomEvent.TrackPublished, refresh);
      room.on(RoomEvent.TrackUnpublished, refresh);
      room.on(RoomEvent.TrackSubscribed, refresh);
      room.on(RoomEvent.TrackUnsubscribed, refresh);
      room.on(RoomEvent.LocalTrackPublished, refresh);
      room.on(RoomEvent.LocalTrackPublished, watchScreenTrack);
      room.on(RoomEvent.LocalTrackUnpublished, unwatchScreenTrack);
      room.on(RoomEvent.LocalTrackUnpublished, refresh);
      room.on(RoomEvent.Reconnecting, handleReconnecting);
      room.on(RoomEvent.Reconnected, handleReconnected);
      room.on(RoomEvent.Disconnected, handleDisconnected);

      return () => {
        room.off(RoomEvent.LocalTrackPublished, watchScreenTrack);
        room.off(RoomEvent.LocalTrackUnpublished, unwatchScreenTrack);
        for (const publication of endedListeners.keys()) unwatchScreenTrack(publication);
        room.off(RoomEvent.ActiveSpeakersChanged, refresh);
        room.off(RoomEvent.ParticipantConnected, refreshOnParticipant);
        room.off(RoomEvent.ParticipantDisconnected, refreshOnParticipant);
        room.off(RoomEvent.TrackMuted, refresh);
        room.off(RoomEvent.TrackUnmuted, refresh);
        room.off(RoomEvent.TrackPublished, refresh);
        room.off(RoomEvent.TrackUnpublished, refresh);
        room.off(RoomEvent.TrackSubscribed, refresh);
        room.off(RoomEvent.TrackUnsubscribed, refresh);
        room.off(RoomEvent.LocalTrackPublished, refresh);
        room.off(RoomEvent.LocalTrackUnpublished, refresh);
        room.off(RoomEvent.Reconnecting, handleReconnecting);
        room.off(RoomEvent.Reconnected, handleReconnected);
        room.off(RoomEvent.Disconnected, handleDisconnected);
      };
    },
    [apiClient, cleanupDisconnectedRoom, isCurrentSessionGeneration, updateParticipantsFromRoom],
  );

  const enableDirectCallVideo = useCallback(async (): Promise<boolean> => {
    const room = roomRef.current;
    const generation = sessionGenerationRef.current;
    if (!room || sessionModeRef.current !== "direct") {
      return false;
    }
    if (room.localParticipant.isCameraEnabled) {
      return true;
    }

    const cameraPermission = await requestCameraPermissionAfterUserAction?.();
    if (!isCurrentSessionGeneration(generation) || roomRef.current !== room) {
      return false;
    }
    if (!cameraPermission?.hasCameraPermission) {
      setRoomState((current) =>
        current.status === "connected" && current.sessionMode === "direct"
          ? {
              ...current,
              errorMessage: cameraPermissionDeniedMessage,
              updatedAt: Date.now(),
            }
          : current,
      );
      return false;
    }

    try {
      const publishResult = await enableMobileCameraWithCodecFallback(room.localParticipant, {
        facingMode: cameraFacingMode,
      });
      if (!isCurrentSessionGeneration(generation) || roomRef.current !== room) {
        return false;
      }
      if (!room.localParticipant.isCameraEnabled) {
        throw new Error("Direct-call camera publication did not become active.");
      }
      updateParticipantsFromRoom();
      setRoomState((current) => ({
        ...current,
        cameraVideoCodec: publishResult.codec,
        errorMessage: null,
        selfCameraEnabled: true,
        updatedAt: Date.now(),
      }));
      return true;
    } catch {
      updateParticipantsFromRoom();
      setRoomState((current) =>
        current.status === "connected" && current.sessionMode === "direct"
          ? {
              ...current,
              errorMessage: directCallVideoErrorMessage,
              selfCameraEnabled: room.localParticipant.isCameraEnabled,
              updatedAt: Date.now(),
            }
          : current,
      );
      return false;
    }
  }, [
    cameraFacingMode,
    cameraPermissionDeniedMessage,
    directCallVideoErrorMessage,
    isCurrentSessionGeneration,
    requestCameraPermissionAfterUserAction,
    updateParticipantsFromRoom,
  ]);

  const joinVoiceSession = useCallback(
    async (input: JoinVoiceSessionInput): Promise<boolean> => {
      const isDirectCall = input.sessionMode === "direct";
      const channelId = isDirectCall ? null : input.channelId;
      const channelName = isDirectCall ? input.title : input.channelName;
      const conversationId = isDirectCall ? input.conversationId : null;
      const preparedPermission = isDirectCall ? undefined : input.permission;
      const serverId = isDirectCall ? null : input.serverId;
      const video = isDirectCall && input.video;
      const user = currentUserRef.current;
      if (!user) {
        setRoomState((current) => ({
          ...current,
          channelId,
          channelName,
          conversationId,
          errorMessage: "Voice room requires an active mobile session.",
          serverId,
          sessionMode: input.sessionMode,
          status: "error",
          updatedAt: Date.now(),
        }));
        return false;
      }

      if (
        roomState.status === "connected" &&
        roomState.sessionMode === input.sessionMode &&
        (isDirectCall
          ? roomState.conversationId === conversationId
          : roomState.channelId === channelId)
      ) {
        return video && !roomRef.current?.localParticipant.isCameraEnabled
          ? enableDirectCallVideo()
          : true;
      }

      await leaveVoiceChannel();
      const generation = startSessionGeneration();

      setRoomState({
        ...createInitialMobileVoiceRoomState(),
        channelId,
        channelName,
        conversationId,
        participants: [createSelfVoiceRoomParticipant(user)],
        serverId,
        sessionMode: input.sessionMode,
        status: "checking-permission",
        updatedAt: Date.now(),
      });

      const permission = preparedPermission ?? (await requestMicrophonePermission());
      if (!isCurrentSessionGeneration(generation)) {
        return false;
      }

      if (!permission.hasMicrophonePermission) {
        setRoomState((current) => ({
          ...transitionMobileVoiceRoomConnectionState(current, "permission-denied", Date.now()),
          errorMessage: isDirectCall
            ? directCallMicrophonePermissionDeniedMessage
            : permission.errorMessage,
        }));
        return false;
      }

      if (video) {
        const cameraPermission = await requestCameraPermissionAfterUserAction?.();
        if (!isCurrentSessionGeneration(generation)) {
          return false;
        }
        if (!cameraPermission?.hasCameraPermission) {
          setRoomState((current) => ({
            ...transitionMobileVoiceRoomConnectionState(current, "permission-denied", Date.now()),
            errorMessage: cameraPermissionDeniedMessage,
          }));
          return false;
        }
      }

      const sessionId = isDirectCall ? null : createMobileVoiceSessionId();
      sessionIdRef.current = sessionId;
      sessionModeRef.current = input.sessionMode;
      setRoomState((current) => ({
        ...current,
        sessionId,
        status: "connecting",
        updatedAt: Date.now(),
      }));

      let directFailureMessage = directCallConnectionErrorMessage;
      try {
        const serverParticipants = isDirectCall
          ? []
          : (
              await joinMobileVoiceState(apiClient, {
                channelId: channelId!,
                serverId: serverId!,
                sessionId: sessionId!,
              })
            ).participants;
        if (!isCurrentSessionGeneration(generation)) {
          return false;
        }

        const tokenResponse = isDirectCall
          ? await fetchMobileVoiceToken(apiClient, { conversationId: conversationId! })
          : await fetchMobileVoiceToken(apiClient, { channelId: channelId! });
        if (!isCurrentSessionGeneration(generation)) {
          return false;
        }

        const cameraRoomDefaults = getMobileCameraRoomDefaults(DEFAULT_MOBILE_CAMERA_FACING_MODE);
        const room = new Room({
          // A DM call shows one fullscreen remote video, so adaptive stream only
          // costs sharpness there; a channel room keeps it.
          ...getMobileVoiceRoomSubscriptionOptions({ sessionMode: input.sessionMode }),
          publishDefaults: applyMobileVoiceAudioBitrate(
            cameraRoomDefaults.publishDefaults,
            tokenResponse.mediaPolicy.audioBitrate,
          ),
          videoCaptureDefaults: cameraRoomDefaults.videoCaptureDefaults,
        });
        const unbindRoomEvents = bindRoomEvents(room, generation);

        roomRef.current = room;
        // A fresh room carries none of the previous room's track sids.
        backgroundSuspendedRemoteVideoSidsRef.current.clear();
        await AudioSession.configureAudio({
          android: {
            audioTypeOptions: AndroidAudioTypePresets.communication,
            preferredOutputList: ["bluetooth", "headset", "speaker", "earpiece"],
          },
          ios: {
            defaultOutput: "speaker",
          },
        });
        if (!isCurrentSessionGeneration(generation)) {
          return false;
        }

        await AudioSession.startAudioSession();
        if (!isCurrentSessionGeneration(generation)) {
          return false;
        }

        await room.connect(tokenResponse.url, tokenResponse.token, {
          autoSubscribe: true,
        });
        if (!isCurrentSessionGeneration(generation)) {
          return false;
        }

        await setMobileMicrophoneEnabledWithNoiseSuppression(
          room.localParticipant,
          voiceInputMode === "voice-activity",
          getMobileMicrophoneCaptureOptions(
            getMobileVoiceAudioProcessing(voiceDevicePreferencesRef.current),
          ),
        );
        if (!isCurrentSessionGeneration(generation)) {
          return false;
        }

        let cameraVideoCodec: MobileCameraVideoCodec | null = null;
        if (video) {
          directFailureMessage = directCallVideoErrorMessage;
          const publishResult = await enableMobileCameraWithCodecFallback(room.localParticipant, {
            facingMode: DEFAULT_MOBILE_CAMERA_FACING_MODE,
          });
          if (!room.localParticipant.isCameraEnabled) {
            throw new Error("Direct-call camera publication did not become active.");
          }
          cameraVideoCodec = publishResult.codec;
        }
        if (!isCurrentSessionGeneration(generation)) {
          return false;
        }

        await enumerateVoiceDevices(room, generation).catch(() => undefined);
        if (!isCurrentSessionGeneration(generation)) {
          return false;
        }

        if (sessionId) {
          startHeartbeat(sessionId, generation);
        }
        startLevelTicker(generation);

        setRoomState((current) => {
          if (!isCurrentSessionGeneration(generation)) {
            return current;
          }

          return {
            ...transitionMobileVoiceRoomConnectionState(current, "connected", Date.now()),
            cameraVideoCodec,
            channelId,
            channelName,
            conversationId,
            errorMessage: null,
            participants: mergeLiveKitParticipants(
              user,
              mergeServerParticipants(user, current.participants, serverParticipants),
              room,
              audioActivityRef.current,
            ),
            noiseSuppressionEnabled: voiceDevicePreferencesRef.current.noiseSuppressionEnabled,
            screenShareStatus: screenShareSupported ? "off" : "unsupported",
            selfCameraEnabled: room.localParticipant.isCameraEnabled,
            selfMuted: !room.localParticipant.isMicrophoneEnabled,
            selfScreenShareEnabled: false,
            serverId,
            sessionId,
            sessionMode: input.sessionMode,
            videoQualityMode: tokenResponse.mediaPolicy.videoQualityMode,
          };
        });

        room.once(RoomEvent.Disconnected, unbindRoomEvents);

        return true;
      } catch (error) {
        if (!isCurrentSessionGeneration(generation)) {
          return false;
        }

        await leaveVoiceChannel();
        const terminalGeneration = sessionGenerationRef.current;
        if (!isCurrentSessionGeneration(terminalGeneration)) {
          return false;
        }

        setPermissionState((current) =>
          current.hasMicrophonePermission ? current : createErroredMobileVoiceRuntimeState(error),
        );
        setRoomState({
          ...createInitialMobileVoiceRoomState(),
          channelId,
          channelName,
          conversationId,
          errorMessage: isDirectCall ? directFailureMessage : redactMobileVoiceRoomError(error),
          serverId,
          sessionMode: input.sessionMode,
          status: "error",
          updatedAt: Date.now(),
        });
        return false;
      }
    },
    [
      apiClient,
      bindRoomEvents,
      cameraPermissionDeniedMessage,
      directCallConnectionErrorMessage,
      directCallMicrophonePermissionDeniedMessage,
      directCallVideoErrorMessage,
      enableDirectCallVideo,
      enumerateVoiceDevices,
      isCurrentSessionGeneration,
      leaveVoiceChannel,
      requestMicrophonePermission,
      requestCameraPermissionAfterUserAction,
      roomState.channelId,
      roomState.conversationId,
      roomState.sessionMode,
      roomState.status,
      startSessionGeneration,
      startHeartbeat,
      startLevelTicker,
      voiceInputMode,
    ],
  );

  const joinVoiceSessionOnce = useCallback(
    async (input: JoinVoiceSessionInput): Promise<boolean> => {
      if (joinPendingRef.current) {
        return false;
      }
      joinPendingRef.current = true;
      try {
        return await joinVoiceSession(input);
      } finally {
        joinPendingRef.current = false;
      }
    },
    [joinVoiceSession],
  );

  const joinVoiceChannel = useCallback(
    (input: JoinVoiceChannelInput) =>
      joinVoiceSessionOnce({ ...input, sessionMode: "channel", video: false }),
    [joinVoiceSessionOnce],
  );

  const joinDirectCall = useCallback(
    ({ conversationId, title, video }: JoinDirectCallInput) =>
      joinVoiceSessionOnce({
        channelId: null,
        channelName: title,
        conversationId,
        serverId: null,
        sessionMode: "direct",
        title,
        video,
      }),
    [joinVoiceSessionOnce],
  );

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room || roomState.status !== "connected" || voiceInputMode === "push-to-talk") {
      return;
    }

    const nextEnabled = !room.localParticipant.isMicrophoneEnabled;
    await setMobileMicrophoneEnabledWithNoiseSuppression(
      room.localParticipant,
      nextEnabled,
      getMobileMicrophoneCaptureOptions(
        getMobileVoiceAudioProcessing(voiceDevicePreferencesRef.current),
      ),
    );
    updateParticipantsFromRoom();
  }, [roomState.status, updateParticipantsFromRoom, voiceInputMode]);

  const beginPushToTalk = useCallback(async () => {
    const room = roomRef.current;
    if (!room || roomState.status !== "connected" || voiceInputMode !== "push-to-talk") {
      return;
    }

    await pushToTalkController.begin({
      isMicrophoneEnabled: room.localParticipant.isMicrophoneEnabled,
    });
    updateParticipantsFromRoom();
  }, [pushToTalkController, roomState.status, updateParticipantsFromRoom, voiceInputMode]);

  const endPushToTalk = useCallback(() => {
    if (voiceInputMode !== "push-to-talk") {
      return;
    }

    pushToTalkController.end();
  }, [pushToTalkController, voiceInputMode]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room || roomState.status !== "connected") {
      return;
    }

    const nextEnabled = !room.localParticipant.isCameraEnabled;
    try {
      let nextCameraVideoCodec: MobileCameraVideoCodec | null = null;
      if (nextEnabled) {
        const publishResult = await enableMobileCameraWithCodecFallback(room.localParticipant, {
          facingMode: cameraFacingMode,
        });
        nextCameraVideoCodec = publishResult.codec;
      } else {
        await room.localParticipant.setCameraEnabled(false);
      }
      updateParticipantsFromRoom();
      setRoomState((current) => ({
        ...current,
        cameraVideoCodec: nextCameraVideoCodec,
        updatedAt: Date.now(),
      }));
      if (sessionIdRef.current && sessionModeRef.current === "channel") {
        void sendMobileVoiceHeartbeat(apiClient, {
          selfVideo: nextEnabled,
          sessionId: sessionIdRef.current,
        });
      }
    } catch (error) {
      setRoomState((current) => ({
        ...current,
        errorMessage: redactMobileVoiceRoomError(error),
        updatedAt: Date.now(),
      }));
    }
  }, [apiClient, cameraFacingMode, roomState.status, updateParticipantsFromRoom]);

  const flipCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room || roomState.status !== "connected" || !room.localParticipant.isCameraEnabled) {
      return;
    }

    const cameraTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
    if (!(cameraTrack instanceof LocalVideoTrack)) {
      return;
    }

    const facingMode = getNextMobileCameraFacingMode(roomState.cameraFacingMode);
    try {
      await cameraTrack.restartTrack(getMobileCameraCaptureOptions(facingMode));
      setRoomState((current) => ({
        ...current,
        cameraFacingMode: facingMode,
        errorMessage: null,
        updatedAt: Date.now(),
      }));
      updateParticipantsFromRoom();
    } catch (error) {
      setRoomState((current) => ({
        ...current,
        errorMessage: redactMobileVoiceRoomError(error),
        updatedAt: Date.now(),
      }));
    }
  }, [roomState.cameraFacingMode, roomState.status, updateParticipantsFromRoom]);

  const sendScreenShareHeartbeat = useCallback(
    (isScreenSharing: boolean) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }

      void sendMobileVoiceHeartbeat(
        apiClient,
        buildMobileScreenShareHeartbeatPayload({ isScreenSharing, sessionId }),
      ).catch(() => undefined);
    },
    [apiClient],
  );

  const toggleScreenShare = useCallback(async () => {
    if (!screenShareSupported) return;
    const room = roomRef.current;
    if (!room || roomState.status !== "connected" || screenShareOperationRef.current === room) {
      return;
    }
    screenShareOperationRef.current = room;

    const nextEnabled = !isLocalParticipantScreenSharing(room);
    // Enabling raises the MediaProjection / broadcast-picker consent dialog, which
    // backgrounds the app. Guard so that transient background does not tear down a
    // camera the user is publishing alongside the screen share.
    if (nextEnabled) {
      beginCaptureConsentGuard();
    }
    setRoomState((current) => ({
      ...current,
      errorMessage: null,
      screenShareStatus: nextEnabled ? "starting" : "stopping",
      updatedAt: Date.now(),
    }));

    const screenShareQualityId = voiceDevicePreferencesRef.current.screenShareQualityId;

    try {
      await room.localParticipant.setScreenShareEnabled(
        nextEnabled,
        getMobileScreenShareCaptureOptions(screenShareQualityId),
        getMobileScreenSharePublishOptions(screenShareQualityId),
      );
      if (roomRef.current !== room) return;
      updateParticipantsFromRoom();
      sendScreenShareHeartbeat(nextEnabled);
      setRoomState((current) => ({
        ...current,
        errorMessage: null,
        screenShareStatus: nextEnabled ? "on" : "off",
        selfScreenShareEnabled: nextEnabled,
        updatedAt: Date.now(),
      }));
    } catch (error) {
      if (roomRef.current !== room) return;
      sendScreenShareHeartbeat(false);
      setRoomState((current) => ({
        ...current,
        errorMessage: isMobileScreenSharePermissionDenied(error)
          ? activeMobileCopy.voiceScreenSharePermissionDenied
          : redactMobileScreenShareError(error),
        screenShareStatus: isMobileScreenSharePermissionDenied(error)
          ? "permission-denied"
          : "error",
        selfScreenShareEnabled: false,
        updatedAt: Date.now(),
      }));
    } finally {
      if (screenShareOperationRef.current === room) screenShareOperationRef.current = null;
      if (nextEnabled) {
        endCaptureConsentGuard();
      }
    }
  }, [
    beginCaptureConsentGuard,
    endCaptureConsentGuard,
    roomState.status,
    sendScreenShareHeartbeat,
    updateParticipantsFromRoom,
  ]);

  const selectAudioInput = useCallback(
    async (rawDeviceId: string) => {
      const room = roomRef.current;
      const deviceId = sanitizeMobileVoiceDeviceId(rawDeviceId);
      if (
        !room ||
        !deviceId ||
        roomState.status !== "connected" ||
        !roomState.availableAudioInputs.some(({ id }) => id === deviceId)
      ) {
        return;
      }

      try {
        await room.switchActiveDevice("audioinput", deviceId);
        commitVoiceDevicePreferences({
          ...voiceDevicePreferencesRef.current,
          audioInputId: deviceId,
        });
        setRoomState((current) => ({ ...current, errorMessage: null }));
      } catch (error) {
        setRoomState((current) => ({
          ...current,
          errorMessage: redactMobileVoiceRoomError(error),
          updatedAt: Date.now(),
        }));
      }
    },
    [commitVoiceDevicePreferences, roomState.availableAudioInputs, roomState.status],
  );

  const selectAudioDeviceOutput = useCallback(
    async (rawDeviceId: string) => {
      const deviceId = sanitizeMobileVoiceDeviceId(rawDeviceId);
      if (
        !deviceId ||
        roomState.status !== "connected" ||
        (roomState.availableAudioOutputs.length > 0 &&
          !roomState.availableAudioOutputs.some(({ id }) => id === deviceId))
      ) {
        return;
      }

      try {
        await AudioSession.selectAudioOutput(deviceId);
        commitVoiceDevicePreferences({
          ...voiceDevicePreferencesRef.current,
          audioOutputId: deviceId,
        });
        setRoomState((current) => ({
          ...current,
          errorMessage: null,
          selfAudioOutput:
            deviceId === "speaker" || deviceId === "force_speaker" ? "speaker" : "default",
          updatedAt: Date.now(),
        }));
      } catch (error) {
        setRoomState((current) => ({
          ...current,
          errorMessage: redactMobileVoiceRoomError(error),
          updatedAt: Date.now(),
        }));
      }
    },
    [commitVoiceDevicePreferences, roomState.availableAudioOutputs, roomState.status],
  );

  const selectAudioOutput = useCallback(
    async (mode: MobileVoiceAudioOutputMode) => {
      const speakerId = roomState.availableAudioOutputs.some(({ id }) => id === "force_speaker")
        ? "force_speaker"
        : "speaker";
      await selectAudioDeviceOutput(mode === "speaker" ? speakerId : "default");
    },
    [roomState.availableAudioOutputs, selectAudioDeviceOutput],
  );

  /**
   * Screen-share quality is a device preference, not room state: it survives the
   * call and applies to the next share. A live share is not restarted here — the
   * user chose a ceiling, not a reason to drop the stream mid-sentence.
   */
  /**
   * A listener-side mute, stored with the device preferences so it survives the
   * call. Applied immediately; participant sync re-applies only when the room
   * or remote participant set changes.
   */
  const selectScreenShareAudioMuted = useCallback(
    (muted: boolean) => {
      screenShareAudioMuteSignatureRef.current = syncMobileScreenShareAudioMute(
        roomRef.current,
        muted,
        null,
      );
      commitVoiceDevicePreferences({
        ...voiceDevicePreferencesRef.current,
        screenShareAudioMuted: muted,
      });
    },
    [commitVoiceDevicePreferences],
  );

  const selectScreenShareQuality = useCallback(
    (qualityId: unknown) => {
      const normalized = normalizeMobileScreenShareQualityId(qualityId);
      setPreferredMobileScreenShareQualityId(normalized);
      commitVoiceDevicePreferences({
        ...voiceDevicePreferencesRef.current,
        screenShareQualityId: normalized,
      });
    },
    [commitVoiceDevicePreferences],
  );

  /**
   * Every capture filter lands the same way: restart the published microphone
   * track with the new options, then persist. One path, so noise suppression,
   * echo cancellation and auto gain can never drift apart.
   */
  const selectAudioProcessing = useCallback(
    async (patch: Partial<MobileVoiceAudioProcessing>) => {
      const room = roomRef.current;
      if (!room || roomState.status !== "connected") {
        return;
      }

      const nextPreferences: MobileVoiceDevicePreferences = {
        ...voiceDevicePreferencesRef.current,
        ...patch,
      };

      try {
        const microphoneTrack = room.localParticipant.getTrackPublication(
          Track.Source.Microphone,
        )?.track;
        if (
          room.localParticipant.isMicrophoneEnabled &&
          microphoneTrack instanceof LocalAudioTrack
        ) {
          await microphoneTrack.restartTrack(
            getMobileMicrophoneCaptureOptions(getMobileVoiceAudioProcessing(nextPreferences)),
          );
        }
        commitVoiceDevicePreferences(nextPreferences);
        setRoomState((current) => ({ ...current, errorMessage: null }));
      } catch (error) {
        setRoomState((current) => ({
          ...current,
          errorMessage: redactMobileVoiceRoomError(error),
          updatedAt: Date.now(),
        }));
      }
    },
    [commitVoiceDevicePreferences, roomState.status],
  );

  const selectNoiseSuppression = useCallback(
    async (enabled: boolean) => selectAudioProcessing({ noiseSuppressionEnabled: enabled }),
    [selectAudioProcessing],
  );

  const syncParticipantsFromServer = useCallback(
    ({ channelId, participants, serverId }: SyncServerVoiceParticipantsInput) => {
      const generation = sessionGenerationRef.current;
      const user = currentUserRef.current;
      if (!user || !isCurrentSessionGeneration(generation)) {
        return;
      }

      setRoomState((current) => {
        if (
          !isCurrentSessionGeneration(generation) ||
          current.channelId !== channelId ||
          current.serverId !== serverId
        ) {
          return current;
        }

        return {
          ...current,
          participants: mergeServerParticipants(user, current.participants, participants),
          updatedAt: Date.now(),
        };
      });
    },
    [isCurrentSessionGeneration],
  );

  const syncParticipantAudioLevelFromServer = useCallback(
    ({ audioLevel, channelId, isMuted, isSpeaking, userId }: SyncServerVoiceAudioLevelInput) => {
      const generation = sessionGenerationRef.current;
      const level = toBoundedAudioLevel(audioLevel);

      // Without this the level ticker would overwrite the peer's fast update
      // with the lagging LiveKit value on the very next tick.
      audioActivityRef.current.set(
        userId,
        createMobileVoiceAudioActivityFromPeer({
          audioLevel: level,
          isMuted,
          isSpeaking,
          now: Date.now(),
        }),
      );

      setRoomState((current) => {
        if (
          !isCurrentSessionGeneration(generation) ||
          current.channelId !== channelId ||
          current.participants.length === 0
        ) {
          return current;
        }

        let changed = false;
        const participants = current.participants.map((participant) => {
          if (participant.userId !== userId) {
            return participant;
          }

          const nextSpeaking = isMuted ? false : isSpeaking;
          if (
            participant.isMuted === isMuted &&
            participant.isSpeaking === nextSpeaking &&
            Math.abs(participant.audioLevel - level) < MOBILE_VOICE_LEVEL_CHANGE_THRESHOLD
          ) {
            return participant;
          }

          changed = true;
          return {
            ...participant,
            audioLevel: isMuted ? 0 : level,
            isMuted,
            isSpeaking: nextSpeaking,
          };
        });

        if (!changed) {
          return current;
        }

        return {
          ...current,
          participants,
          updatedAt: Date.now(),
        };
      });
    },
    [isCurrentSessionGeneration],
  );

  useEffect(() => {
    if (voiceInputMode !== "push-to-talk") {
      void pushToTalkController.cancel().catch(() => undefined);
      return;
    }

    if (roomState.status !== "connected") {
      void pushToTalkController.cancel({ closeMicrophone: true }).catch(() => undefined);
      return;
    }

    void pushToTalkController
      .cancel({ closeMicrophone: true })
      .catch(() => undefined)
      .finally(updateParticipantsFromRoom);
  }, [pushToTalkController, roomState.status, updateParticipantsFromRoom, voiceInputMode]);

  useEffect(() => {
    if (roomState.status !== "connected") {
      return;
    }

    let interval: ReturnType<typeof setInterval> | null = null;
    const reconcileInterval = (appState: string) => {
      interval = reconcileMobileVoiceForegroundInterval({
        appState,
        clearTimer: clearInterval,
        current: interval,
        enabled: true,
        intervalMs: MOBILE_VOICE_AUDIO_ROUTE_SYNC_INTERVAL_MS,
        run: () => void syncVoiceAudioRoute(),
        setTimer: setInterval,
      });
    };
    if (AppState.currentState === "active") {
      void syncVoiceAudioRoute();
    }
    reconcileInterval(AppState.currentState);
    // Returning from Settings or from a Bluetooth pairing sheet is the other
    // moment the route commonly changed while the app was not looking.
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void syncVoiceAudioRoute();
      }
      reconcileInterval(nextState);
    });

    return () => {
      if (interval) {
        clearInterval(interval);
      }
      subscription.remove();
    };
  }, [roomState.status, syncVoiceAudioRoute]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;
      const suspendedRemoteVideoSids = backgroundSuspendedRemoteVideoSidsRef.current;

      if (nextState === "active") {
        if (roomState.status === "connected") {
          startLevelTicker(sessionGenerationRef.current);
        }
        const activeRoom = roomRef.current;
        if (activeRoom) {
          resumeRemoteVideoFromBackground(activeRoom, suspendedRemoteVideoSids);
        }
        // Cleared either way: a sid we cannot resume now is not ours to resume later.
        suspendedRemoteVideoSids.clear();
        return;
      }

      clearLevelTicker();

      const room = roomRef.current;
      if (!room) {
        return;
      }

      if (voiceInputMode === "push-to-talk") {
        void pushToTalkController
          .cancel({ closeMicrophone: true })
          .catch(() => undefined)
          .finally(updateParticipantsFromRoom);
      }

      // A capture-consent dialog backgrounds the app while its system UI is up;
      // stopping media then would kill the stream the user is starting. Only a
      // real background (no consent in flight) suspends camera and screen share.
      const backgroundPolicy = shouldSuspendVoiceMediaOnAppStateChange({
        nextAppState: nextState,
        captureConsentInProgress: captureConsentDepthRef.current > 0,
        platform: Platform.OS,
        isScreenSharing: isLocalParticipantScreenSharing(room),
      });
      if (!backgroundPolicy.suspendCamera && !backgroundPolicy.suspendScreenShare) {
        return;
      }

      // livekit's own `pauseVideoInBackground` never fires on React Native, so
      // remote video is stopped here instead. Runs before the local teardown so
      // the download stops even when nothing local is publishing.
      for (const trackSid of suspendRemoteVideoForBackground(room)) {
        suspendedRemoteVideoSids.add(trackSid);
      }

      if (backgroundPolicy.suspendCamera && room.localParticipant.isCameraEnabled) {
        void room.localParticipant
          .setCameraEnabled(false)
          .catch(() => undefined)
          .finally(() => {
            const sessionId = sessionIdRef.current;
            if (sessionId) {
              void sendMobileVoiceHeartbeat(apiClient, {
                selfVideo: false,
                sessionId,
              }).catch(() => undefined);
            }
            updateParticipantsFromRoom();
          });
      }

      if (backgroundPolicy.suspendScreenShare && isLocalParticipantScreenSharing(room)) {
        void room.localParticipant
          .setScreenShareEnabled(false)
          .catch(() => undefined)
          .finally(() => {
            sendScreenShareHeartbeat(false);
            updateParticipantsFromRoom();
            setRoomState((current) => ({
              ...current,
              errorMessage: MOBILE_SCREEN_SHARE_BACKGROUND_STOP_MESSAGE,
              screenShareStatus: screenShareSupported ? "off" : "unsupported",
              selfScreenShareEnabled: false,
              updatedAt: Date.now(),
            }));
          });
      }
    });

    return () => subscription.remove();
  }, [
    apiClient,
    clearLevelTicker,
    pushToTalkController,
    roomState.status,
    sendScreenShareHeartbeat,
    startLevelTicker,
    updateParticipantsFromRoom,
    voiceInputMode,
  ]);

  useEffect(
    () => () => {
      startSessionGeneration();
      clearHeartbeat();
      clearLevelTicker();
      isIntentionalLeaveRef.current = true;
      const room = roomRef.current;
      if (room) {
        intentionallyDisconnectedRoomsRef.current.add(room);
      }
      void pushToTalkController.cancel({ closeMicrophone: true }).catch(() => undefined);
      try {
        // Same rejection guard as leaveVoiceChannel: unmount must never leave a dangling
        // rejected disconnect promise behind.
        void room?.disconnect(true).catch(() => undefined);
      } catch {
        // Best-effort cleanup on unmount.
      }
      if (sessionIdRef.current) {
        void leaveMobileVoiceState(apiClient, { sessionId: sessionIdRef.current }).catch(
          () => undefined,
        );
        sessionIdRef.current = null;
      }
      sessionModeRef.current = null;
      roomRef.current = null;
      backgroundSuspendedRemoteVideoSidsRef.current.clear();
      void AudioSession.stopAudioSession().catch(() => undefined);
    },
    [apiClient, clearHeartbeat, clearLevelTicker, pushToTalkController, startSessionGeneration],
  );

  return {
    beginCaptureConsentGuard,
    beginPushToTalk,
    endCaptureConsentGuard,
    endPushToTalk,
    flipCamera,
    joinVoiceChannel,
    joinDirectCall,
    leaveVoiceChannel,
    permissionState,
    pushToTalkState,
    requestMicrophonePermission,
    refreshVoiceDevices,
    roomState,
    screenShareAudioMuted: voiceDevicePreferences.screenShareAudioMuted,
    screenShareQualityId: voiceDevicePreferences.screenShareQualityId,
    selectAudioDeviceOutput,
    selectAudioInput,
    selectAudioOutput,
    selectAudioProcessing,
    selectNoiseSuppression,
    voiceAudioProcessing: getMobileVoiceAudioProcessing(voiceDevicePreferences),
    selectScreenShareAudioMuted,
    selectScreenShareQuality,
    syncParticipantAudioLevelFromServer,
    syncParticipantsFromServer,
    toggleCamera,
    toggleMute,
    toggleScreenShare,
  };
}
