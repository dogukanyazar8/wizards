import { z } from "zod";

import { DMConversationDTOSchema } from "./socket";

/** Creator included. Instagram's ceiling; keeps avatar stacks and fan-out sane. */
export const GROUP_DM_MAX_PARTICIPANTS = 32;
/** Creator + 2. Creator + 1 is already a 1:1 DM. */
export const GROUP_DM_MIN_PARTICIPANTS = 3;
export const GROUP_DM_NAME_MAX_LENGTH = 100;

const GroupMemberIdSchema = z.string().trim().min(1).max(128);

/**
 * Blank means "no name" — the title then falls back to the participants' names,
 * which is the behaviour `resolveConversationName` already implements.
 */
const GroupNameSchema = z
  .string()
  .max(GROUP_DM_NAME_MAX_LENGTH)
  .transform((value) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const GroupIconUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "HTTPS URL required");

export const DMSystemMessageTypeSchema = z.enum([
  "GROUP_CREATED",
  "MEMBER_ADDED",
  "MEMBER_REMOVED",
  "MEMBER_LEFT",
  "NAME_CHANGED",
  "ICON_CHANGED",
]);

export const GroupDMCreateRequestSchema = z
  .object({
    iconUrl: GroupIconUrlSchema.optional(),
    name: GroupNameSchema.optional(),
    // The creator is implicit, so the client sends one fewer than the floor
    // and one fewer than the ceiling.
    userIds: z
      .array(GroupMemberIdSchema)
      .min(GROUP_DM_MIN_PARTICIPANTS - 1)
      .max(GROUP_DM_MAX_PARTICIPANTS - 1),
  })
  .strict();

export const GroupDMUpdateRequestSchema = z
  .object({
    iconUrl: GroupIconUrlSchema.nullable().optional(),
    name: GroupNameSchema.nullable().optional(),
  })
  .strict();

export const GroupDMAddMembersRequestSchema = z
  .object({
    userIds: z
      .array(GroupMemberIdSchema)
      .min(1)
      .max(GROUP_DM_MAX_PARTICIPANTS - 1),
  })
  .strict();

export const GroupDMConversationResponseSchema = z
  .object({ conversation: DMConversationDTOSchema })
  .strict();

export type DMSystemMessageTypeValue = z.infer<typeof DMSystemMessageTypeSchema>;
export type GroupDMAddMembersRequest = z.infer<typeof GroupDMAddMembersRequestSchema>;
export type GroupDMCreateRequest = z.infer<typeof GroupDMCreateRequestSchema>;
export type GroupDMUpdateRequest = z.infer<typeof GroupDMUpdateRequestSchema>;
