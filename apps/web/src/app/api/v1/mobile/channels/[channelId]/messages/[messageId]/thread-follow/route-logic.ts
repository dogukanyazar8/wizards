import { ChannelType, prisma } from "@wizards/db";
import { ThreadFollowStateSchema } from "@wizards/types";

import { ApiError, jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";
import { isThreadFollowed, setExplicitFollow } from "@/lib/workspace/thread-follow-service";

export type MobileThreadFollowRouteContext = {
  params: Promise<{ channelId: string; messageId: string }>;
};

export type MobileThreadFollowRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  authorizeParent(input: { channelId: string; messageId: string; userId: string }): Promise<void>;
  enforceRateLimit(userId: string): Promise<unknown>;
  read(input: { messageId: string; userId: string }): Promise<boolean>;
  write(input: {
    channelId: string;
    following: boolean;
    messageId: string;
    userId: string;
  }): Promise<{ following: boolean }>;
};

const defaultDependencies: MobileThreadFollowRouteDependencies = {
  authenticate: requireMobileApiUserId,
  authorizeParent: async ({ channelId, messageId, userId }) => {
    await requireChannelPermissionForUser(userId, channelId, PermissionBits.VIEW_CHANNEL, {
      requiredType: ChannelType.TEXT,
    });
    const parent = await prisma.message.findFirst({
      where: {
        channelId,
        deletedAt: null,
        id: messageId,
        placeholderRemovedAt: null,
        threadParentId: null,
      },
      select: { id: true },
    });
    if (!parent) {
      throw new ApiError("Thread parent message not found", 404, "THREAD_PARENT_NOT_FOUND");
    }
  },
  enforceRateLimit: (userId) => enforceApiRateLimit(userId, "mentions:thread-follow"),
  read: ({ messageId, userId }) => isThreadFollowed({ parentMessageId: messageId, userId }),
  write: ({ channelId, following, messageId, userId }) =>
    setExplicitFollow({ channelId, following, parentMessageId: messageId, userId }),
};

export async function mobileThreadFollowRoute(
  request: Request,
  context: MobileThreadFollowRouteContext,
  method: "GET" | "PUT" | "DELETE",
  dependencies: MobileThreadFollowRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId);
    const { channelId, messageId } = await context.params;
    await dependencies.authorizeParent({ channelId, messageId, userId });

    const result =
      method === "GET"
        ? { following: await dependencies.read({ messageId, userId }) }
        : await dependencies.write({
            channelId,
            following: method === "PUT",
            messageId,
            userId,
          });

    return Response.json(ThreadFollowStateSchema.parse(result), {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
