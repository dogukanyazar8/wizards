import { z } from "zod";

export const MAX_VOICE_PARTICIPANTS = 10;
export const VOICE_HEARTBEAT_INTERVAL_MS = 30_000;
export const VOICE_HEARTBEAT_TIMEOUT_MS = 60_000;

export interface VoiceStateParticipantDTO {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
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
});

export const VoiceStatesQuerySchema = z.object({
  serverId: z.string().min(1),
});

export type HeartbeatVoiceStateBody = z.infer<typeof HeartbeatVoiceStateBodySchema>;
export type UpsertVoiceStateBody = z.infer<typeof UpsertVoiceStateBodySchema>;
export type VoiceStatesQuery = z.infer<typeof VoiceStatesQuerySchema>;
