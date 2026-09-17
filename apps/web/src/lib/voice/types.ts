import { z } from "zod";
import { ScreenShareStreamInfoSchema, type ScreenShareStreamInfo } from "@wizards/types";

export const MAX_VOICE_PARTICIPANTS = 10;
export const VOICE_HEARTBEAT_INTERVAL_MS = 30_000;
export const VOICE_HEARTBEAT_TIMEOUT_MS = 60_000;

/**
 * The one heartbeat cutoff. It lives beside the constant it derives from so a
 * caller that only needs the threshold — the home screen's "Şu an canlı" card,
 * the friends list's voice room — does not pull the whole voice service in
 * (`00-ortak-baglam` §6.6: read the threshold from here, never restate it).
 */
export function getStaleVoiceHeartbeatCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - VOICE_HEARTBEAT_TIMEOUT_MS);
}

export interface VoiceStateParticipantDTO {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isDeafened: boolean;
  isScreenSharing?: boolean;
  screenShareViewerCount?: number | undefined;
  stream?: ScreenShareStreamInfo | null | undefined;
}

export interface VoiceChannelStateDTO {
  channelId: string;
  participants: VoiceStateParticipantDTO[];
}

export interface VoiceStatesResponse {
  states: VoiceChannelStateDTO[];
}

export interface VoiceStateMutationResponse {
  channelId: string;
  participants: VoiceStateParticipantDTO[];
  serverId: string;
  sessionId: string;
}

export const VoiceStateParticipantSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  isDeafened: z.boolean().default(false),
  isScreenSharing: z.boolean().optional().default(false),
  stream: ScreenShareStreamInfoSchema.nullable().optional(),
  screenShareViewerCount: z.number().int().min(0).optional(),
});

export const VoiceChannelStateSchema = z.object({
  channelId: z.string(),
  participants: z.array(VoiceStateParticipantSchema),
});

export const VoiceStatesResponseSchema = z.object({
  states: z.array(VoiceChannelStateSchema),
});

export const VoiceStateMutationResponseSchema = z.object({
  channelId: z.string(),
  participants: z.array(VoiceStateParticipantSchema),
  serverId: z.string(),
  sessionId: z.string(),
});

export const UpsertVoiceStateBodySchema = z.object({
  channelId: z.string().min(1),
  serverId: z.string().min(1),
  sessionId: z.string().uuid(),
});

export const HeartbeatVoiceStateBodySchema = z.object({
  sessionId: z.string().uuid(),
  selfDeaf: z.boolean().optional(),
  selfScreenShare: z.boolean().optional(),
  selfStream: z.boolean().optional(),
  selfVideo: z.boolean().optional(),
});

export const DeleteVoiceStateBodySchema = z.object({
  sessionId: z.string().uuid().optional(),
});

export const VoiceStatesQuerySchema = z.object({
  serverId: z.string().min(1),
});

export type DeleteVoiceStateBody = z.infer<typeof DeleteVoiceStateBodySchema>;
export type HeartbeatVoiceStateBody = z.infer<typeof HeartbeatVoiceStateBodySchema>;
export type UpsertVoiceStateBody = z.infer<typeof UpsertVoiceStateBodySchema>;
export type VoiceStatesQuery = z.infer<typeof VoiceStatesQuerySchema>;
