import type {
  DMConversationDTO,
  DMParticipantDTO,
  DMMessagePayload,
  ServerIconTone,
} from "@wizards/types";
import {
  DMConversationDTOSchema,
  DMMessagePayloadSchema,
  ServerIconToneSchema,
  SetMutedRequestSchema,
} from "@wizards/types";
import { z } from "zod";

export interface DMMessagesResponse {
  messages: DMMessagePayload[];
  nextCursor: string | null;
}

export interface DMThreadMessagesResponse extends DMMessagesResponse {
  parent: DMMessagePayload;
}

export interface DMConversationsPageResponse {
  conversations: DMConversationDTO[];
  nextCursor: string | null;
}

export type DMMutualServerSummary = {
  iconColor: ServerIconTone | null;
  iconUrl: string | null;
  id: string;
  memberCount: number;
  name: string;
  shortName: string | null;
};

export interface DMMutualServersResponse {
  servers: DMMutualServerSummary[];
}

export const DMMessagesResponseSchema = z.object({
  messages: z.array(DMMessagePayloadSchema),
  nextCursor: z.string().nullable(),
});

export const DMThreadMessagesResponseSchema = DMMessagesResponseSchema.extend({
  parent: DMMessagePayloadSchema,
});

export const DMConversationsResponseSchema = z.array(DMConversationDTOSchema);

export const DMConversationsPageResponseSchema = z.object({
  conversations: z.array(DMConversationDTOSchema),
  nextCursor: z.string().nullable(),
});

export const DMMutualServerSummarySchema = z.object({
  iconColor: ServerIconToneSchema.nullable(),
  iconUrl: z.string().nullable(),
  id: z.string(),
  memberCount: z.number().int().nonnegative(),
  name: z.string(),
  shortName: z.string().nullable(),
});

export const DMMutualServersResponseSchema = z.object({
  servers: z.array(DMMutualServerSummarySchema),
});

export const CreateDMBodySchema = z.object({
  userId: z.string().min(1),
});

export const DMConversationParamsSchema = z.object({
  conversationId: z.string().min(1),
});

/**
 * Mesajlar §17's `Sessize al` submenu (karar K8). The shared contract lives in
 * `@wizards/types` so the mobile route parses the same shape; this alias keeps
 * the existing import site working rather than opening a second definition that
 * could drift from it.
 *
 * `duration` is optional and absent means `forever`, which is exactly what the
 * pre-submenu body `{ muted }` already meant.
 */
export const SetDMMutedBodySchema = SetMutedRequestSchema;

export const DMMessagesQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const DMConversationsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type { DMConversationDTO, DMParticipantDTO };
