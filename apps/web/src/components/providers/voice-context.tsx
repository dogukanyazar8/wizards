"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { type ConnectionState, type Room } from "livekit-client";
import type { ScreenShareQualityId } from "@/lib/voice/screen-share";
import type { NoiseFilterTier } from "@/lib/voice/noise-filter";
import type { VoiceScreenShareViewModel } from "@/lib/voice/participant-mapping";
import type { VoiceParticipantViewModel } from "@/lib/voice/participant-view-model";
import type { VoiceAudioPreferences } from "@/store/voice-store";

export type VoiceProviderProps = {
  children: ReactNode;
  currentUser: {
    id: string;
    avatarUrl?: string | null;
    displayName: string;
    username: string;
  };
};

export type { VoiceParticipantViewModel, VoiceScreenShareViewModel };
export type { NoiseFilterTier };

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

export type VoiceContextValue = {
  activeChannelId: string | null;
  activeNoiseFilterTier: NoiseFilterTier;
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
  startPushToTalk: () => Promise<void>;
  stopPushToTalk: () => Promise<void>;
  setAudioPreference: <Key extends keyof VoiceAudioPreferences>(
    key: Key,
    value: VoiceAudioPreferences[Key],
  ) => void;
  setActiveScreenShareId: (id: string) => void;
  setParticipantVolume: (userId: string, volume: number) => void;
  setScreenShareQuality: (qualityId: ScreenShareQualityId) => Promise<void>;
  retryKrispNoiseCancellation: () => Promise<boolean>;
  preloadVoiceProcessing: () => Promise<boolean>;
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

export type VoiceParticipantsContextValue = Pick<
  VoiceContextValue,
  "participants" | "screenShares"
>;

export type VoiceStateContextValue = Omit<
  VoiceContextValue,
  keyof VoiceParticipantsContextValue
>;

export const VoiceStateContext = createContext<VoiceStateContextValue | null>(null);
export const VoiceParticipantsContext =
  createContext<VoiceParticipantsContextValue | null>(null);

export function useVoiceState() {
  const value = useContext(VoiceStateContext);

  if (!value) {
    throw new Error("useVoiceState must be used within VoiceProvider");
  }

  return value;
}

export function useVoiceParticipants() {
  const value = useContext(VoiceParticipantsContext);

  if (!value) {
    throw new Error("useVoiceParticipants must be used within VoiceProvider");
  }

  return value;
}

export function useVoiceConnection() {
  const voiceState = useVoiceState();
  const voiceParticipants = useVoiceParticipants();

  return useMemo(
    () => ({
      ...voiceState,
      ...voiceParticipants,
    }),
    [voiceParticipants, voiceState],
  );
}
