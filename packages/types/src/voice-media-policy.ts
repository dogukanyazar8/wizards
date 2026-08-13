import { z } from "zod";

export const CHANNEL_BITRATE_OPTIONS = [32_000, 64_000, 96_000, 128_000] as const;
export const CHANNEL_VIDEO_QUALITY_MODES = ["AUTO", "FULL"] as const;

export const VoiceMediaPolicySchema = z
  .object({
    audioBitrate: z
      .number()
      .int()
      .refine((value) => CHANNEL_BITRATE_OPTIONS.includes(value as never)),
    videoQualityMode: z.enum(CHANNEL_VIDEO_QUALITY_MODES),
  })
  .strict();

export type VoiceMediaPolicy = z.infer<typeof VoiceMediaPolicySchema>;
