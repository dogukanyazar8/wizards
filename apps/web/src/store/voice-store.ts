"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const DEFAULT_PARTICIPANT_VOLUME = 100;
export const MAX_PARTICIPANT_VOLUME = 100;
export const MIN_PARTICIPANT_VOLUME = 0;
export const VOICE_PREFERENCES_STORAGE_KEY = "wizards-voice";

export interface VoiceAudioPreferences {
  autoGainControl: boolean;
  echoCancellation: boolean;
  krispNoiseCancellation: boolean;
  noiseSuppression: boolean;
}

export const DEFAULT_VOICE_AUDIO_PREFERENCES: VoiceAudioPreferences = {
  autoGainControl: true,
  echoCancellation: true,
  krispNoiseCancellation: true,
  noiseSuppression: true,
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
    krispNoiseCancellation:
      typeof value.krispNoiseCancellation === "boolean"
        ? value.krispNoiseCancellation
        : DEFAULT_VOICE_AUDIO_PREFERENCES.krispNoiseCancellation,
    noiseSuppression:
      typeof value.noiseSuppression === "boolean"
        ? value.noiseSuppression
        : DEFAULT_VOICE_AUDIO_PREFERENCES.noiseSuppression,
  };
}

type PersistedVoiceStoreState = {
  audioPreferences: VoiceAudioPreferences;
  hasConfiguredKrispPreference: boolean;
  participantVolumes: Record<string, number>;
};

interface VoiceStoreState extends PersistedVoiceStoreState {
  activeChannelId: string | null;
  clearParticipantVolumes: () => void;
  isDeafened: boolean;
  isMuted: boolean;
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
}

export const useVoiceStore = create<VoiceStoreState>()(
  persist(
    (set) => ({
      activeChannelId: null,
      audioPreferences: DEFAULT_VOICE_AUDIO_PREFERENCES,
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
      participantVolumes: {},
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
        };
      },
      name: VOICE_PREFERENCES_STORAGE_KEY,
      partialize: (state): PersistedVoiceStoreState => ({
        audioPreferences: state.audioPreferences,
        hasConfiguredKrispPreference: state.hasConfiguredKrispPreference,
        participantVolumes: state.participantVolumes,
      }),
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
