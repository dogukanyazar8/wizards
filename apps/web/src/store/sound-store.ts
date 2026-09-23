"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { requireBrowserLocalStorage } from "@/lib/browser-local-storage";

export const SOUND_EFFECTS_STORAGE_KEY = "wizards-sounds";
export const MIN_SOUND_VOLUME = 0;
export const MAX_SOUND_VOLUME = 100;

export const SOUND_PROFILE_PATHS = {
  default: "/sounds/notification-whispr.mp3",
  soft: "/sounds/notification.mp3",
  pulse: "/sounds/notification.mp3",
  voiceJoin: "/sounds/voice-join-whispr.mp3",
  voiceLeave: "/sounds/voice-leave-whispr.mp3",
  legacyNotification: "/sounds/notification.mp3",
  legacyVoiceJoin: "/sounds/voice-join.mp3",
  legacyVoiceLeave: "/sounds/voice-leave.mp3",
} as const;

export type SoundProfileKey = keyof typeof SOUND_PROFILE_PATHS;

export const DEFAULT_SOUND_EFFECT_PROFILES = {
  notification: "default",
  voiceJoin: "voiceJoin",
  voiceLeave: "voiceLeave",
} as const satisfies Record<string, SoundProfileKey>;

export const SOUND_EFFECT_PATHS = {
  notification: SOUND_PROFILE_PATHS[DEFAULT_SOUND_EFFECT_PROFILES.notification],
  voiceJoin: SOUND_PROFILE_PATHS[DEFAULT_SOUND_EFFECT_PROFILES.voiceJoin],
  voiceLeave: SOUND_PROFILE_PATHS[DEFAULT_SOUND_EFFECT_PROFILES.voiceLeave],
} as const;

export type SoundEffectKey = keyof typeof SOUND_EFFECT_PATHS;

export interface SoundPreferences {
  notificationVolume: number;
  voiceJoinEnabled: boolean;
  voiceJoinSoundFile: SoundProfileKey;
  voiceJoinVolume: number;
  voiceLeaveEnabled: boolean;
  voiceLeaveSoundFile: SoundProfileKey;
  voiceLeaveVolume: number;
}

export const DEFAULT_SOUND_PREFERENCES: SoundPreferences = {
  notificationVolume: 74,
  voiceJoinEnabled: true,
  voiceJoinSoundFile: DEFAULT_SOUND_EFFECT_PROFILES.voiceJoin,
  voiceJoinVolume: 72,
  voiceLeaveEnabled: true,
  voiceLeaveSoundFile: DEFAULT_SOUND_EFFECT_PROFILES.voiceLeave,
  voiceLeaveVolume: 72,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function clampSoundVolume(value: number) {
  return Math.min(MAX_SOUND_VOLUME, Math.max(MIN_SOUND_VOLUME, Math.round(value)));
}

export function isSoundProfileKey(value: unknown): value is SoundProfileKey {
  return typeof value === "string" && value in SOUND_PROFILE_PATHS;
}

export function resolveSoundEffectPath(
  effect: SoundEffectKey,
  profile: unknown = DEFAULT_SOUND_EFFECT_PROFILES[effect],
) {
  return SOUND_PROFILE_PATHS[
    isSoundProfileKey(profile) ? profile : DEFAULT_SOUND_EFFECT_PROFILES[effect]
  ];
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
    voiceJoinSoundFile: isSoundProfileKey(value.voiceJoinSoundFile)
      ? value.voiceJoinSoundFile
      : DEFAULT_SOUND_PREFERENCES.voiceJoinSoundFile,
    voiceJoinVolume:
      typeof value.voiceJoinVolume === "number"
        ? clampSoundVolume(value.voiceJoinVolume)
        : DEFAULT_SOUND_PREFERENCES.voiceJoinVolume,
    voiceLeaveEnabled:
      typeof value.voiceLeaveEnabled === "boolean"
        ? value.voiceLeaveEnabled
        : DEFAULT_SOUND_PREFERENCES.voiceLeaveEnabled,
    voiceLeaveSoundFile: isSoundProfileKey(value.voiceLeaveSoundFile)
      ? value.voiceLeaveSoundFile
      : DEFAULT_SOUND_PREFERENCES.voiceLeaveSoundFile,
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
  setVoiceJoinSoundFile: (profile: SoundProfileKey) => void;
  setVoiceJoinVolume: (volume: number) => void;
  setVoiceLeaveEnabled: (enabled: boolean) => void;
  setVoiceLeaveSoundFile: (profile: SoundProfileKey) => void;
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
      setVoiceJoinSoundFile: (profile) =>
        set({
          voiceJoinSoundFile: profile,
        }),
      setVoiceJoinVolume: (volume) =>
        set({
          voiceJoinVolume: clampSoundVolume(volume),
        }),
      setVoiceLeaveEnabled: (enabled) =>
        set({
          voiceLeaveEnabled: enabled,
        }),
      setVoiceLeaveSoundFile: (profile) =>
        set({
          voiceLeaveSoundFile: profile,
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
        voiceJoinSoundFile: state.voiceJoinSoundFile,
        voiceJoinVolume: state.voiceJoinVolume,
        voiceLeaveEnabled: state.voiceLeaveEnabled,
        voiceLeaveSoundFile: state.voiceLeaveSoundFile,
        voiceLeaveVolume: state.voiceLeaveVolume,
      }),
      storage: createJSONStorage(() => requireBrowserLocalStorage()),
      version: 1,
    },
  ),
);
