import { MobileDMMarkReadResponseSchema, type MobileDMReadUpdatedEvent } from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { getDirectMessageParticipantReadStates, markDirectMessageRead } from "@/lib/dm/service";
import { DMConversationParamsSchema } from "@/lib/dm/types";
import { getSocketServer } from "@/lib/socket/runtime";

export type MobileDMMarkReadRouteContext = {
  params: Promise<{ conversationId: string }>;
};

type ReadStateRow = {
  readonly lastDeliveredAt?: Date | null;
  readonly lastReadAt: Date | null;
  readonly userId: string;
};

export type MobileDMMarkReadRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  emitReadUpdate(event: MobileDMReadUpdatedEvent, participantUserIds: readonly string[]): void;
  enforceRateLimit(userId: string, action: "mobile:dm:mark-read"): Promise<void>;
  getParticipantReadStates(conversationId: string): Promise<readonly ReadStateRow[]>;
  markRead(userId: string, conversationId: string): Promise<unknown>;
};

const defaultDependencies: MobileDMMarkReadRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  /**
   * §2 "1a".6.4: the sender is normally on the conversation list, which never
   * joins `dm:<id>` — that room only exists while a chat is open. Without the
   * personal-room leg the third tick would only appear after a refetch.
   */
  emitReadUpdate(event, participantUserIds) {
    const io = getSocketServer();
    if (!io) {
      return;
    }

    let emitter = io.to(`dm:${event.conversationId}`);
    for (const participantUserId of participantUserIds) {
      emitter = emitter.to(`user:${participantUserId}`);
    }
    emitter.emit("dm:conversation:read", event);
  },
  enforceRateLimit: enforceApiRateLimit,
  getParticipantReadStates: getDirectMessageParticipantReadStates,
  markRead: markDirectMessageRead,
};

export async function mobileDMMarkReadRoute(
  request: Request,
  context: MobileDMMarkReadRouteContext,
  dependencies: MobileDMMarkReadRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:dm:mark-read");
    const { conversationId } = DMConversationParamsSchema.parse(await context.params);

    await dependencies.markRead(userId, conversationId);
    const rows = await dependencies.getParticipantReadStates(conversationId);
    const participantReadStates = rows.map((row) => ({
      lastDeliveredAt: row.lastDeliveredAt?.toISOString() ?? null,
      lastReadAt: row.lastReadAt?.toISOString() ?? null,
      userId: row.userId,
    }));
    const response = MobileDMMarkReadResponseSchema.parse({
      conversationId,
      participantReadStates,
    });
    const currentUserReadState = response.participantReadStates.find(
      (state) => state.userId === userId,
    );
    if (currentUserReadState) {
      dependencies.emitReadUpdate(
        { conversationId, ...currentUserReadState },
        response.participantReadStates.map((state) => state.userId),
      );
    }

    return Response.json(response, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
