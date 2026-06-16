import { z } from "zod";

export const VoiceMiniConnectionQualitySchema = z.enum([
  "excellent",
  "good",
  "poor",
  "lost",
  "unknown",
]);

export type VoiceMiniConnectionQuality = z.infer<typeof VoiceMiniConnectionQualitySchema>;

export const VoiceMiniParticipantSchema = z.object({
  audioLevel: z.number().min(0).max(1),
  avatarUrl: z.string().url().max(2048).nullable(),
  displayName: z.string().min(1).max(80),
  isDeafened: z.boolean(),
  isLocal: z.boolean(),
  isMuted: z.boolean(),
  isSpeaking: z.boolean(),
  userId: z.string().min(1).max(128),
});

export type VoiceMiniParticipant = z.infer<typeof VoiceMiniParticipantSchema>;

export const VoiceOverlayAnchorSchema = z.enum([
  "bottom-left",
  "bottom-right",
  "top-left",
  "top-right",
]);

export type VoiceOverlayAnchor = z.infer<typeof VoiceOverlayAnchorSchema>;

export const VoiceOverlaySizeSchema = z.enum(["compact", "normal", "large"]);

export type VoiceOverlaySize = z.infer<typeof VoiceOverlaySizeSchema>;

export const VoiceOverlayPreferencesSchema = z.object({
  anchor: VoiceOverlayAnchorSchema,
  size: VoiceOverlaySizeSchema,
  speakingOnly: z.boolean(),
});

export type VoiceOverlayPreferences = z.infer<typeof VoiceOverlayPreferencesSchema>;

export const VoiceMiniSnapshotSchema = z.object({
  active: z.boolean(),
  connection: z.object({
    quality: VoiceMiniConnectionQualitySchema,
    rttMs: z.number().min(0).max(60_000).nullable(),
  }),
  overlay: VoiceOverlayPreferencesSchema.optional(),
  participants: z.array(VoiceMiniParticipantSchema).max(12),
  updatedAt: z.string().datetime(),
});

export type VoiceMiniSnapshot = z.infer<typeof VoiceMiniSnapshotSchema>;

export function parseVoiceMiniSnapshot(value: unknown): VoiceMiniSnapshot | null {
  const result = VoiceMiniSnapshotSchema.safeParse(value);
  return result.success ? result.data : null;
}
