import { prisma } from "@wizards/db";
import { UploadThingError } from "uploadthing/server";
import { z } from "zod";

/**
 * `null` is the create-time case: the group does not exist yet, so there is no
 * conversation to own. Editing an existing group always sends its id.
 */
export const GroupIconUploadInputSchema = z
  .object({
    conversationId: z.string().trim().min(1).max(128).nullable().default(null),
  })
  .strict();

export type GroupIconUploadInput = z.infer<typeof GroupIconUploadInputSchema>;

export type GroupIconUploadDependencies = {
  loadConversation(
    conversationId: string,
  ): Promise<{ ownerId: string | null; type: string } | null>;
};

const defaults: GroupIconUploadDependencies = {
  loadConversation: (conversationId) =>
    prisma.dMConversation.findUnique({
      select: { ownerId: true, type: true },
      where: { id: conversationId },
    }),
};

export async function assertGroupIconUploadAllowed(
  input: { conversationId: string | null; userId: string },
  dependencies: GroupIconUploadDependencies = defaults,
): Promise<void> {
  // Nothing to authorize before the group exists. The URL this upload returns is
  // inert until it is handed to POST /dm/groups, which validates it there.
  if (input.conversationId === null) {
    return;
  }

  const conversation = await dependencies.loadConversation(input.conversationId);

  // A missing conversation, a 1:1 DM and a group owned by somebody else all fail
  // the same way on purpose: the uploader must not confirm what a given id is.
  if (conversation?.type !== "GROUP_DM" || conversation.ownerId !== input.userId) {
    throw new UploadThingError("You cannot change this group's photo.");
  }
}
