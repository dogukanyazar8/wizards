import { z } from "zod";

export const CreateLiveKitTokenBodySchema = z
  .object({
    channelId: z.string().min(1).optional(),
    conversationId: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    const hasChannelId = typeof value.channelId === "string";
    const hasConversationId = typeof value.conversationId === "string";

    if (hasChannelId === hasConversationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of channelId or conversationId.",
        path: ["channelId"],
      });
    }
  });

export interface LiveKitTokenResponse {
  token: string;
  url: string;
}

export const LiveKitTokenResponseSchema = z.object({
  token: z.string().min(1),
  url: z.string().min(1),
});

export type CreateLiveKitTokenBody = z.infer<typeof CreateLiveKitTokenBodySchema>;
