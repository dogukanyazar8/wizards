import { z } from "zod";

import {
  GROUP_DM_DESCRIPTION_MAX_LENGTH,
  GROUP_DM_NAME_MAX_LENGTH,
  GroupAvatarColorSchema,
  GroupHistoryVisibilitySchema,
  GroupPermissionLevelSchema,
} from "./group-dm-settings";
import { DMConversationDTOSchema } from "./socket";

/** Creator included. Instagram's ceiling; keeps avatar stacks and fan-out sane. */
export const GROUP_DM_MAX_PARTICIPANTS = 32;
/** Creator + 2. Creator + 1 is already a 1:1 DM. */
export const GROUP_DM_MIN_PARTICIPANTS = 3;

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

export { DMSystemMessageTypeSchema } from "./dm-system-message";
export type { DMSystemMessageTypeValue } from "./dm-system-message";

const GroupDescriptionSchema = z
  .string()
  .max(GROUP_DM_DESCRIPTION_MAX_LENGTH)
  .transform((value) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

/**
 * 2c fills the identity step and the "KATILIM" card in one pass, so creation
 * accepts what that screen collects: colour, description, the history window and
 * the one permission the card exposes. The other three permissions keep their
 * defaults and move to 2f.
 */
export const GroupDMCreateRequestSchema = z
  .object({
    avatarColor: GroupAvatarColorSchema.optional(),
    description: GroupDescriptionSchema.optional(),
    historyVisibility: GroupHistoryVisibilitySchema.optional(),
    iconUrl: GroupIconUrlSchema.optional(),
    name: GroupNameSchema.optional(),
    permAddMembers: GroupPermissionLevelSchema.optional(),
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

export type GroupDMAddMembersRequest = z.infer<typeof GroupDMAddMembersRequestSchema>;
export type GroupDMCreateRequest = z.infer<typeof GroupDMCreateRequestSchema>;
export type GroupDMUpdateRequest = z.infer<typeof GroupDMUpdateRequestSchema>;
