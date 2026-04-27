import type { DMMessagePayload } from "@wizards/types";
import { z } from "zod";

export type DMConversationTypeDto = "DM" | "GROUP_DM";
export type DMErrorCode = "NOT_FRIENDS" | "BLOCKED" | "NOT_FOUND";

export interface DMParticipantDTO {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  unreadCount: number;
}

export interface DMConversationDTO {
  id: string;
  type: DMConversationTypeDto;
  name: string | null;
  lastMessageAt: string;
  participants: DMParticipantDTO[];
  lastMessage: DMMessagePayload | null;
}

export interface DMMessagesResponse {
  messages: DMMessagePayload[];
  nextCursor: string | null;
}

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

export type CreateDMBody = z.infer<typeof CreateDMBodySchema>;
export type DMMessagesQuery = z.infer<typeof DMMessagesQuerySchema>;
