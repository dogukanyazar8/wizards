import { ConversationNotifyRequestSchema, ConversationPinRequestSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import {
  emitConversationNotifyChanged,
  emitConversationPinChanged,
  type GroupRealtimeServer,
} from "@/lib/dm/group-realtime";
import { setConversationPin, setNotifyLevel } from "@/lib/dm/group-service";
import { getSocketServer } from "@/lib/socket/runtime";

/**
 * Faz 1 §B8. The two conversation-scoped writes that belong to one participant
 * rather than to the group: the notification tier (2f §2) and the pinned
 * conversation (V3 / 2a §2). Both are valid on a 1:1 DM, which is why they live
 * under `/dm/[conversationId]` and not under `/dm/groups`.
 *
 * Neither needs a permission: membership is the `where` clause of the write, so
 * a non-participant updates nothing and gets a 403 out of the row count.
 */
export type DMParticipantRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  emitNotifyChanged: typeof emitConversationNotifyChanged;
  emitPinChanged: typeof emitConversationPinChanged;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  getIo(): GroupRealtimeServer | null;
  setNotifyLevel: typeof setNotifyLevel;
  setPin: typeof setConversationPin;
};

const defaults: DMParticipantRouteDependencies = {
  authenticate: () => requireApiUserId(),
  emitNotifyChanged: emitConversationNotifyChanged,
  emitPinChanged: emitConversationPinChanged,
  enforceRateLimit: enforceApiRateLimit,
  getIo: () => getSocketServer(),
  setNotifyLevel,
  setPin: setConversationPin,
};

/**
 * 2f §2. Replaces `PATCH /mute` as the authority; that endpoint stays as a thin
 * wrapper so older clients keep working (§B8).
 */
export async function conversationNotifyRoute(
  request: Request,
  conversationId: string,
  dependencies: DMParticipantRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:mute");
    const { notifyLevel } = await parseJsonBody(request, ConversationNotifyRequestSchema);
    const result = await dependencies.setNotifyLevel(userId, conversationId, notifyLevel);
    const io = dependencies.getIo();

    if (io) {
      // The other devices of the same person, not the other members: nobody else
      // can see this setting.
      dependencies.emitNotifyChanged(io, {
        conversationId,
        notifyLevel: result.notifyLevel,
        userId,
      });
    }

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function conversationPinRoute(
  request: Request,
  conversationId: string,
  dependencies: DMParticipantRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:mute");
    const { pinned } = await parseJsonBody(request, ConversationPinRequestSchema);
    const result = await dependencies.setPin(userId, conversationId, pinned);
    const io = dependencies.getIo();

    if (io) {
      dependencies.emitPinChanged(io, { conversationId, pinnedAt: result.pinnedAt, userId });
    }

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
