import { z } from "zod";

export type AccountBanner = {
  bannerUrl: string | null;
  bannerColor: string | null;
  bannerOffsetX: number | null;
  bannerOffsetY: number | null;
};

export type AccountBannerResult =
  { success: true; banner: AccountBanner } | { success: false; error: string };

const expectedUrl = z.string().min(1).max(2048);

export const UpdateAccountBannerSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("remove"), expectedUrl }).strict(),
  z
    .object({
      operation: z.literal("position"),
      expectedUrl,
      offsetX: z.number().min(0).max(1),
      offsetY: z.number().min(0).max(1),
    })
    .strict(),
  z
    .object({
      operation: z.literal("color"),
      color: z
        .string()
        .trim()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .nullable(),
    })
    .strict(),
]);

export type UpdateAccountBannerInput = z.infer<typeof UpdateAccountBannerSchema>;
