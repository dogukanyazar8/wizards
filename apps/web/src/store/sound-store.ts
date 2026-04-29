"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const SOUND_EFFECTS_STORAGE_KEY = "wizards-sounds";
export const MIN_SOUND_VOLUME = 0;
export const MAX_SOUND_VOLUME = 100;

export const SOUND_EFFECT_PATHS = {
  notification: "/sounds/notification.mp3",
  voiceJoin: "/sounds/voice-join.mp3",
  voiceLeave: "/sounds/voice-leave.mp3",
} as const;

export type SoundEffectKey = keyof typeof SOUND_EFFECT_PATHS;

export interface SoundPreferences {
  notificationVolume: number;
  voiceJoinEnabled: boolean;
  voiceJoinVolume: number;
  voiceLeaveEnabled: boolean;
  voiceLeaveVolume: number;
}

export const DEFAULT_SOUND_PREFERENCES: SoundPreferences = {
  notificationVolume: 74,
  voiceJoinEnabled: true,
  voiceJoinVolume: 72,
  voiceLeaveEnabled: true,
  voiceLeaveVolume: 72,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function clampSoundVolume(value: number) {
  return Math.min(MAX_SOUND_VOLUME, Math.max(MIN_SOUND_VOLUME, Math.round(value)));
}

function sanitizeSoundPreferences(value: unknown): SoundPreferences {
  if (!isRecord(value)) {
    return DEFAULT_SOUND_PREFERENCES;
  }

  return {
    notificationVolume:
      typeof value.notificationVolume === "number"
        ? clampSoundVolume(value.notificationVolume)
        : DEFAULT_SOUND_PREFERENCES.notificationVolume,
    voiceJoinEnabled:
      typeof value.voiceJoinEnabled === "boolean"
        ? value.voiceJoinEnabled
        : DEFAULT_SOUND_PREFERENCES.voiceJoinEnabled,
    voiceJoinVolume:
      typeof value.voiceJoinVolume === "number"
        ? clampSoundVolume(value.voiceJoinVolume)
        : DEFAULT_SOUND_PREFERENCES.voiceJoinVolume,
    voiceLeaveEnabled:
      typeof value.voiceLeaveEnabled === "boolean"
        ? value.voiceLeaveEnabled
        : DEFAULT_SOUND_PREFERENCES.voiceLeaveEnabled,
    voiceLeaveVolume:
      typeof value.voiceLeaveVolume === "number"
        ? clampSoundVolume(value.voiceLeaveVolume)
        : DEFAULT_SOUND_PREFERENCES.voiceLeaveVolume,
  };
}

interface SoundStoreState extends SoundPreferences {
  resetSoundPreferences: () => void;
  setNotificationVolume: (volume: number) => void;
  setVoiceJoinEnabled: (enabled: boolean) => void;
  setVoiceJoinVolume: (volume: number) => void;
  setVoiceLeaveEnabled: (enabled: boolean) => void;
  setVoiceLeaveVolume: (volume: number) => void;
}

export const useSoundStore = create<SoundStoreState>()(
  persist(
    (set) => ({
      ...DEFAULT_SOUND_PREFERENCES,
      resetSoundPreferences: () => set(DEFAULT_SOUND_PREFERENCES),
      setNotificationVolume: (volume) =>
        set({
          notificationVolume: clampSoundVolume(volume),
        }),
      setVoiceJoinEnabled: (enabled) =>
        set({
          voiceJoinEnabled: enabled,
        }),
      setVoiceJoinVolume: (volume) =>
        set({
          voiceJoinVolume: clampSoundVolume(volume),
        }),
      setVoiceLeaveEnabled: (enabled) =>
        set({
          voiceLeaveEnabled: enabled,
        }),
      setVoiceLeaveVolume: (volume) =>
        set({
          voiceLeaveVolume: clampSoundVolume(volume),
        }),
    }),
    {
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizeSoundPreferences(persistedState),
      }),
      name: SOUND_EFFECTS_STORAGE_KEY,
      partialize: (state): SoundPreferences => ({
        notificationVolume: state.notificationVolume,
        voiceJoinEnabled: state.voiceJoinEnabled,
        voiceJoinVolume: state.voiceJoinVolume,
        voiceLeaveEnabled: state.voiceLeaveEnabled,
        voiceLeaveVolume: state.voiceLeaveVolume,
      }),
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
