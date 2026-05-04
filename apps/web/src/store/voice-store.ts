"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_SCREEN_SHARE_QUALITY_ID,
  isScreenShareQualityId,
  type ScreenShareQualityId,
} from "@/lib/voice/screen-share";

export const DEFAULT_PARTICIPANT_VOLUME = 100;
export const MAX_PARTICIPANT_VOLUME = 100;
export const MIN_PARTICIPANT_VOLUME = 0;
export const DEFAULT_AUDIO_DEVICE_ID = "default";
export const VOICE_PREFERENCES_STORAGE_KEY = "wizards-voice";

export interface VoiceAudioPreferences {
  autoGainControl: boolean;
  echoCancellation: boolean;
  inputDeviceId: string;
  krispNoiseCancellation: boolean;
  noiseSuppression: boolean;
  outputDeviceId: string;
}

export const DEFAULT_VOICE_AUDIO_PREFERENCES: VoiceAudioPreferences = {
  autoGainControl: true,
  echoCancellation: true,
  inputDeviceId: DEFAULT_AUDIO_DEVICE_ID,
  krispNoiseCancellation: true,
  noiseSuppression: true,
  outputDeviceId: DEFAULT_AUDIO_DEVICE_ID,
};

function clampParticipantVolume(value: number) {
  return Math.min(MAX_PARTICIPANT_VOLUME, Math.max(MIN_PARTICIPANT_VOLUME, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeParticipantVolumes(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([userId, volume]) =>
      typeof volume === "number" && Number.isFinite(volume)
        ? [[userId, clampParticipantVolume(volume)]]
        : [],
    ),
  );
}

function sanitizeAudioPreferences(value: unknown): VoiceAudioPreferences {
  if (!isRecord(value)) {
    return DEFAULT_VOICE_AUDIO_PREFERENCES;
  }

  return {
    autoGainControl:
      typeof value.autoGainControl === "boolean"
        ? value.autoGainControl
        : DEFAULT_VOICE_AUDIO_PREFERENCES.autoGainControl,
    echoCancellation:
      typeof value.echoCancellation === "boolean"
        ? value.echoCancellation
        : DEFAULT_VOICE_AUDIO_PREFERENCES.echoCancellation,
    inputDeviceId:
      typeof value.inputDeviceId === "string" && value.inputDeviceId.trim()
        ? value.inputDeviceId
        : DEFAULT_VOICE_AUDIO_PREFERENCES.inputDeviceId,
    krispNoiseCancellation:
      typeof value.krispNoiseCancellation === "boolean"
        ? value.krispNoiseCancellation
        : DEFAULT_VOICE_AUDIO_PREFERENCES.krispNoiseCancellation,
    noiseSuppression:
      typeof value.noiseSuppression === "boolean"
        ? value.noiseSuppression
        : DEFAULT_VOICE_AUDIO_PREFERENCES.noiseSuppression,
    outputDeviceId:
      typeof value.outputDeviceId === "string" && value.outputDeviceId.trim()
        ? value.outputDeviceId
        : DEFAULT_VOICE_AUDIO_PREFERENCES.outputDeviceId,
  };
}

function sanitizeScreenShareQuality(value: unknown): ScreenShareQualityId {
  return isScreenShareQualityId(value) ? value : DEFAULT_SCREEN_SHARE_QUALITY_ID;
}

type PersistedVoiceStoreState = {
  audioPreferences: VoiceAudioPreferences;
  hasConfiguredKrispPreference: boolean;
  participantVolumes: Record<string, number>;
  screenShareQuality: ScreenShareQualityId;
};

interface VoiceStoreState extends PersistedVoiceStoreState {
  activeChannelId: string | null;
  clearParticipantVolumes: () => void;
  clearScreenShareState: () => void;
  isScreenSharing: boolean;
  isDeafened: boolean;
  isMuted: boolean;
  screenShareActiveSharerId: string | null;
  screenShareChannelId: string | null;
  screenShareConversationId: string | null;
  screenShareError: string | null;
  screenShareMode: "dm" | "voice" | null;
  serverId: string | null;
  sessionId: string | null;
  join: (input: { channelId: string; serverId: string; sessionId: string }) => void;
  leave: () => void;
  resetParticipantVolume: (userId: string) => void;
  setAudioPreference: <Key extends keyof VoiceAudioPreferences>(
    key: Key,
    value: VoiceAudioPreferences[Key],
  ) => void;
  toggleDeafen: () => void;
  toggleMute: () => void;
  setDeafened: (isDeafened: boolean) => void;
  setMuted: (isMuted: boolean) => void;
  setParticipantVolume: (userId: string, volume: number) => void;
  setScreenShareError: (error: string | null) => void;
  setScreenShareQuality: (quality: ScreenShareQualityId) => void;
  setScreenShareState: (input: {
    activeSharerId?: string | null;
    channelId?: string | null;
    conversationId?: string | null;
    isSharing: boolean;
    mode: "dm" | "voice" | null;
  }) => void;
}

export const useVoiceStore = create<VoiceStoreState>()(
  persist(
    (set) => ({
      activeChannelId: null,
      audioPreferences: DEFAULT_VOICE_AUDIO_PREFERENCES,
      clearScreenShareState: () =>
        set({
          isScreenSharing: false,
          screenShareActiveSharerId: null,
          screenShareChannelId: null,
          screenShareConversationId: null,
          screenShareError: null,
          screenShareMode: null,
        }),
      clearParticipantVolumes: () =>
        set((state) => {
          if (Object.keys(state.participantVolumes).length === 0) {
            return state;
          }

          return {
            participantVolumes: {},
          };
        }),
      isDeafened: false,
      hasConfiguredKrispPreference: false,
      isMuted: false,
      isScreenSharing: false,
      participantVolumes: {},
      screenShareActiveSharerId: null,
      screenShareChannelId: null,
      screenShareConversationId: null,
      screenShareError: null,
      screenShareMode: null,
      screenShareQuality: DEFAULT_SCREEN_SHARE_QUALITY_ID,
      serverId: null,
      sessionId: null,
      join: ({ channelId, serverId, sessionId }) =>
        set({
          activeChannelId: channelId,
          isDeafened: false,
          isMuted: false,
          serverId,
          sessionId,
        }),
      leave: () =>
        set({
          activeChannelId: null,
          isDeafened: false,
          isMuted: false,
          serverId: null,
          sessionId: null,
          isScreenSharing: false,
          screenShareActiveSharerId: null,
          screenShareChannelId: null,
          screenShareConversationId: null,
          screenShareError: null,
          screenShareMode: null,
        }),
      resetParticipantVolume: (userId) =>
        set((state) => {
          if (!(userId in state.participantVolumes)) {
            return state;
          }

          const nextParticipantVolumes = { ...state.participantVolumes };
          delete nextParticipantVolumes[userId];

          return {
            participantVolumes: nextParticipantVolumes,
          };
        }),
      setAudioPreference: (key, value) =>
        set((state) => {
          if (state.audioPreferences[key] === value) {
            return state;
          }

          return {
            audioPreferences: {
              ...state.audioPreferences,
              [key]: value,
            },
            ...(key === "krispNoiseCancellation"
              ? { hasConfiguredKrispPreference: true }
              : {}),
          };
        }),
      toggleDeafen: () =>
        set((state) => ({
          isDeafened: !state.isDeafened,
        })),
      toggleMute: () =>
        set((state) => ({
          isMuted: !state.isMuted,
        })),
      setDeafened: (isDeafened) =>
        set({
          isDeafened,
        }),
      setMuted: (isMuted) =>
        set({
          isMuted,
        }),
      setParticipantVolume: (userId, volume) =>
        set((state) => {
          const nextVolume = clampParticipantVolume(volume);
          if ((state.participantVolumes[userId] ?? DEFAULT_PARTICIPANT_VOLUME) === nextVolume) {
            return state;
          }

          return {
            participantVolumes: {
              ...state.participantVolumes,
              [userId]: nextVolume,
            },
          };
        }),
      setScreenShareError: (error) =>
        set({
          screenShareError: error,
        }),
      setScreenShareQuality: (quality) =>
        set((state) => {
          if (state.screenShareQuality === quality) {
            return state;
          }

          return {
            screenShareQuality: quality,
          };
        }),
      setScreenShareState: ({
        activeSharerId = null,
        channelId = null,
        conversationId = null,
        isSharing,
        mode,
      }) =>
        set({
          isScreenSharing: isSharing,
          screenShareActiveSharerId: activeSharerId,
          screenShareChannelId: channelId,
          screenShareConversationId: conversationId,
          screenShareError: null,
          screenShareMode: mode,
        }),
    }),
    {
      merge: (persistedState, currentState) => {
        if (!isRecord(persistedState)) {
          return currentState;
        }

        return {
          ...currentState,
          audioPreferences:
            persistedState.hasConfiguredKrispPreference === true
              ? sanitizeAudioPreferences(persistedState.audioPreferences)
              : {
                  ...sanitizeAudioPreferences(persistedState.audioPreferences),
                  krispNoiseCancellation: true,
                },
          hasConfiguredKrispPreference: persistedState.hasConfiguredKrispPreference === true,
          participantVolumes: sanitizeParticipantVolumes(persistedState.participantVolumes),
          screenShareQuality: sanitizeScreenShareQuality(persistedState.screenShareQuality),
        };
      },
      name: VOICE_PREFERENCES_STORAGE_KEY,
      partialize: (state): PersistedVoiceStoreState => ({
        audioPreferences: state.audioPreferences,
        hasConfiguredKrispPreference: state.hasConfiguredKrispPreference,
        participantVolumes: state.participantVolumes,
        screenShareQuality: state.screenShareQuality,
      }),
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
