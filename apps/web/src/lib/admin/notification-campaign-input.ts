import { z } from "zod";
import type { CampaignSegment, CreateCampaignInput } from "@/lib/admin/notification-campaigns";

function optionalTrimmedString(maxLength: number) {
  return z.preprocess((value) => {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }, z.string().max(maxLength).nullable());
}

export const CampaignSegmentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ALL_USERS"),
  }),
  z.object({
    type: z.literal("ONLINE_USERS"),
  }),
  z.object({
    days: z.coerce.number().int().min(1).max(90),
    type: z.literal("RECENTLY_ACTIVE"),
  }),
  z.object({
    clientType: z.enum(["WEB", "DESKTOP", "MOBILE"]),
    type: z.literal("CLIENT_TYPE"),
  }),
  z.object({
    countryCode: z
      .string()
      .trim()
      .min(2)
      .max(2)
      .transform((value) => value.toUpperCase()),
    type: z.literal("COUNTRY"),
  }),
  z.object({
    type: z.literal("USER_IDS"),
    userIds: z.array(z.string().trim().min(1)).min(1).max(10_000),
  }),
]);

export const NotificationCampaignPreviewRequestSchema = z.object({
  segment: CampaignSegmentSchema,
});

export const NotificationCampaignCreateRequestSchema = z
  .object({
    actionUrl: optionalTrimmedString(2048),
    body: z.string().trim().min(1).max(800),
    imageUrl: optionalTrimmedString(2048),
    /** Booked for later; the outbox drain owns the actual send. */
    scheduledAt: z.coerce.date().optional(),
    segment: CampaignSegmentSchema,
    sendNow: z.boolean().default(false),
    title: z.string().trim().min(1).max(140),
    type: z.enum(["SYSTEM", "MODERATION"]).default("SYSTEM"),
  })
  .refine((value) => !(value.sendNow && value.scheduledAt), {
    message: "A campaign is either sent now or scheduled, never both.",
    path: ["scheduledAt"],
  });

export function toCreateCampaignInput(
  input: z.infer<typeof NotificationCampaignCreateRequestSchema>,
): CreateCampaignInput {
  return {
    actionUrl: input.actionUrl,
    body: input.body,
    imageUrl: input.imageUrl,
    segment: input.segment as CampaignSegment,
    title: input.title,
    type: input.type,
  };
}
