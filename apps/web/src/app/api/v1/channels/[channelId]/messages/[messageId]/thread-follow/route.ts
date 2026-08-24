import { ChannelType, prisma } from "@wizards/db";

import { ApiError, jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";
import { isThreadFollowed, setExplicitFollow } from "@/lib/workspace/thread-follow-service";
import { ThreadFollowStateSchema } from "@wizards/types";

type RouteContext = {
  params: Promise<{ channelId: string; messageId: string }>;
};

/**
 * Bahsedilmeler Ş2 / karar K3 — thread panelindeki `Takip` düğmesinin ucu.
 *
 * `PUT` takibi açar, `DELETE` kapatır. Kapatma satırı **silmez**: silinseydi kullanıcının
 * thread'e bir sonraki yanıtı örtük kuralla takibi geri açardı.
 */
async function resolveThreadParent(userId: string, channelId: string, messageId: string) {
  await requireChannelPermissionForUser(userId, channelId, PermissionBits.VIEW_CHANNEL, {
    requiredType: ChannelType.TEXT,
  });

  const parent = await prisma.message.findFirst({
    where: {
      id: messageId,
      channelId,
      deletedAt: null,
      placeholderRemovedAt: null,
      // Takip thread'in **kökünü** izler; bir yanıtı takip etmek diye bir şey yok.
      threadParentId: null,
    },
    select: { id: true },
  });

  if (!parent) {
    throw new ApiError("Thread parent message not found", 404, "THREAD_PARENT_NOT_FOUND");
  }

  return parent;
}

export async function PUT(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "mentions:thread-follow");

    const { channelId, messageId } = await context.params;
    await resolveThreadParent(userId, channelId, messageId);
    const result = await setExplicitFollow({
      channelId,
      following: true,
      parentMessageId: messageId,
      userId,
    });

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "mentions:thread-follow");

    const { channelId, messageId } = await context.params;
    await resolveThreadParent(userId, channelId, messageId);
    const following = await isThreadFollowed({ parentMessageId: messageId, userId });

    return Response.json(ThreadFollowStateSchema.parse({ following }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "mentions:thread-follow");

    const { channelId, messageId } = await context.params;
    await resolveThreadParent(userId, channelId, messageId);
    const result = await setExplicitFollow({
      channelId,
      following: false,
      parentMessageId: messageId,
      userId,
    });

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
