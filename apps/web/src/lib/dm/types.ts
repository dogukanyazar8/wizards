import type {
  DMConversationDTO,
  DMParticipantDTO,
  DMMessagePayload,
} from "@wizards/types";
import {
  DMConversationDTOSchema,
  DMMessagePayloadSchema,
} from "@wizards/types";
import { z } from "zod";

export type DMErrorCode = "NOT_FRIENDS" | "BLOCKED" | "NOT_FOUND";

export interface DMMessagesResponse {
  messages: DMMessagePayload[];
  nextCursor: string | null;
}

export interface DMConversationsPageResponse {
  conversations: DMConversationDTO[];
  nextCursor: string | null;
}

export const DMMessagesResponseSchema = z.object({
  messages: z.array(DMMessagePayloadSchema),
  nextCursor: z.string().nullable(),
});

export const DMConversationsResponseSchema = z.array(DMConversationDTOSchema);

export const DMConversationsPageResponseSchema = z.object({
  conversations: z.array(DMConversationDTOSchema),
  nextCursor: z.string().nullable(),
});

export const CreateDMBodySchema = z.object({
  userId: z.string().min(1),
});

export const DMConversationParamsSchema = z.object({
  conversationId: z.string().min(1),
});

export const DMMessagesQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const DMConversationsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateDMBody = z.infer<typeof CreateDMBodySchema>;
export type DMConversationsQuery = z.infer<typeof DMConversationsQuerySchema>;
export type DMMessagesQuery = z.infer<typeof DMMessagesQuerySchema>;
export type { DMConversationDTO, DMParticipantDTO };
