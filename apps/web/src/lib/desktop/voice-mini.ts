"use client";

import {
  VoiceOverlayPreferencesSchema,
  VoiceMiniSnapshotSchema,
  type VoiceMiniConnectionQuality,
  type VoiceMiniSnapshotPrivacyMode,
  type VoiceOverlayAnchor,
  type VoiceOverlayPreferences,
  type VoiceOverlaySize,
  type VoiceMiniSnapshot,
} from "@wizards/types";
import { ConnectionState } from "livekit-client";
import type { VoiceParticipantViewModel } from "@/lib/voice/participant-view-model";

const MAX_VOICE_MINI_PARTICIPANTS = 12;
const MAX_DISPLAY_NAME_LENGTH = 80;

export const DEFAULT_DESKTOP_GAME_OVERLAY_ANCHOR: VoiceOverlayAnchor = "top-left";
export const DEFAULT_DESKTOP_GAME_OVERLAY_SIZE: VoiceOverlaySize = "normal";
export const DEFAULT_DESKTOP_GAME_OVERLAY_SPEAKING_ONLY = false;
export const DEFAULT_DESKTOP_GAME_OVERLAY_PREFERENCES: VoiceOverlayPreferences = {
  anchor: DEFAULT_DESKTOP_GAME_OVERLAY_ANCHOR,
  size: DEFAULT_DESKTOP_GAME_OVERLAY_SIZE,
  speakingOnly: DEFAULT_DESKTOP_GAME_OVERLAY_SPEAKING_ONLY,
};

export interface VoiceMiniSnapshotInput {
  isScreenSharing?: boolean;
  screenShareViewerCount?: number;
  activeChannelId: string | null;
  connectionState: ConnectionState;
  isDeafened: boolean;
  isMuted: boolean;
  overlayPreferences?: Partial<VoiceOverlayPreferences>;
  participants: VoiceParticipantViewModel[];
  privacyMode?: VoiceMiniSnapshotPrivacyMode;
  socketConnected: boolean;
}

function clampAudioLevel(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function sanitizeDisplayName(participant: VoiceParticipantViewModel) {
  const displayName = (participant.displayName ?? participant.username ?? "Whispr").trim();
  const normalized = displayName.replace(/\s+/g, " ");

  return normalized.length > MAX_DISPLAY_NAME_LENGTH
    ? `${normalized.slice(0, MAX_DISPLAY_NAME_LENGTH - 3)}...`
    : normalized || "Whispr";
}

function sanitizeAvatarUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const baseUrl = typeof window === "undefined" ? "https://whispr.local" : window.location.origin;
    const url = new URL(value, baseUrl);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function sanitizeDesktopGameOverlayAnchor(value: unknown): VoiceOverlayAnchor {
  return value === "bottom-left" ||
    value === "bottom-right" ||
    value === "top-left" ||
    value === "top-right"
    ? value
    : DEFAULT_DESKTOP_GAME_OVERLAY_ANCHOR;
}

export function sanitizeDesktopGameOverlaySize(value: unknown): VoiceOverlaySize {
  return value === "compact" || value === "large" || value === "normal"
    ? value
    : DEFAULT_DESKTOP_GAME_OVERLAY_SIZE;
}

export function sanitizeDesktopGameOverlayPreferences(value: unknown): VoiceOverlayPreferences {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_DESKTOP_GAME_OVERLAY_PREFERENCES;
  }

  const record = value as Record<string, unknown>;
  return VoiceOverlayPreferencesSchema.parse({
    anchor: sanitizeDesktopGameOverlayAnchor(record.anchor),
    size: sanitizeDesktopGameOverlaySize(record.size),
    speakingOnly:
      typeof record.speakingOnly === "boolean"
        ? record.speakingOnly
        : DEFAULT_DESKTOP_GAME_OVERLAY_SPEAKING_ONLY,
  });
}

export function resolveVoiceMiniConnectionQuality({
  activeChannelId,
  connectionState,
  socketConnected,
}: Pick<
  VoiceMiniSnapshotInput,
  "activeChannelId" | "connectionState" | "socketConnected"
>): VoiceMiniConnectionQuality {
  if (!activeChannelId) {
    return "unknown";
  }

  if (connectionState === ConnectionState.Disconnected || !socketConnected) {
    return "lost";
  }

  if (connectionState === ConnectionState.Connected) {
    return "good";
  }

  return "unknown";
}

export function buildVoiceMiniSnapshot(input: VoiceMiniSnapshotInput): VoiceMiniSnapshot {
  const privacyMode = input.privacyMode ?? "standard";
  const participants = input.participants
    .slice(0, MAX_VOICE_MINI_PARTICIPANTS)
    .map((participant, index) => {
      const isStreamerMode = privacyMode === "streamer";

      return {
        audioLevel: clampAudioLevel(participant.audioLevel),
        avatarUrl: isStreamerMode ? null : sanitizeAvatarUrl(participant.avatarUrl),
        displayName: isStreamerMode ? "Voice participant" : sanitizeDisplayName(participant),
        isDeafened: participant.isLocal ? input.isDeafened : participant.isDeafened,
        isLocal: participant.isLocal,
        isMuted: participant.isLocal ? input.isMuted : participant.isMuted,
        isSpeaking: Boolean(participant.isSpeaking),
        userId: isStreamerMode ? `participant-${index + 1}` : participant.userId.slice(0, 128),
      };
    });

  return VoiceMiniSnapshotSchema.parse({
    active: Boolean(input.activeChannelId),
    isScreenSharing: input.isScreenSharing ?? false,
    screenShareViewerCount: input.isScreenSharing
      ? Math.max(0, Math.floor(input.screenShareViewerCount ?? 0))
      : 0,
    connection: {
      quality: resolveVoiceMiniConnectionQuality(input),
      rttMs: null,
    },
    overlay: sanitizeDesktopGameOverlayPreferences(input.overlayPreferences ?? null),
    participants,
    privacyMode,
    updatedAt: new Date().toISOString(),
    version: 1,
  });
}
