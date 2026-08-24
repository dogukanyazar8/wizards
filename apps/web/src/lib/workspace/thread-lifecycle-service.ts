import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { hasPermission, PermissionBits } from "@/lib/workspace/permissions";

type ThreadLifecycleDatabase = {
  message: {
    findFirst(args: unknown): Promise<{
      id: string;
      threadClosedAt: Date | null;
      userId: string;
    } | null>;
    update(args: unknown): Promise<{
      id: string;
      threadClosedAt: Date | null;
      threadClosedById: string | null;
    }>;
  };
};

export type ChannelThreadState = {
  closedAt: string | null;
  closedById: string | null;
  open: boolean;
};

/**
 * Closes or reopens a channel thread rooted at a real, visible parent message.
 * Channel visibility is established by the route before this call. This layer owns the
 * author-or-moderator rule so another caller cannot accidentally bypass it.
 */
export async function setChannelThreadClosed(args: {
  channelId: string;
  closed: boolean;
  database?: ThreadLifecycleDatabase;
  now?: () => Date;
  parentMessageId: string;
  permissions: bigint;
  userId: string;
}): Promise<ChannelThreadState> {
  const database = args.database ?? (prisma as unknown as ThreadLifecycleDatabase);
  const parent = await database.message.findFirst({
    where: {
      channelId: args.channelId,
      deletedAt: null,
      id: args.parentMessageId,
      placeholderRemovedAt: null,
      threadParentId: null,
    },
    select: { id: true, threadClosedAt: true, userId: true },
  });

  if (!parent) {
    throw new ApiError("Thread parent message not found", 404, "THREAD_PARENT_NOT_FOUND");
  }

  if (
    parent.userId !== args.userId &&
    !hasPermission(args.permissions, PermissionBits.MANAGE_MESSAGES)
  ) {
    throw new ApiError("You cannot manage this thread", 403, "THREAD_MANAGE_FORBIDDEN");
  }

  const threadClosedAt = args.closed ? (args.now?.() ?? new Date()) : null;
  const threadClosedById = args.closed ? args.userId : null;
  const updated = await database.message.update({
    data: { threadClosedAt, threadClosedById },
    where: { id: parent.id },
    select: { id: true, threadClosedAt: true, threadClosedById: true },
  });

  return {
    closedAt: updated.threadClosedAt?.toISOString() ?? null,
    closedById: updated.threadClosedById,
    open: updated.threadClosedAt === null,
  };
}
