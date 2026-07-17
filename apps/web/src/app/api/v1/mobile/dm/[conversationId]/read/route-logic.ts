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
  readonly lastReadAt: Date | null;
  readonly userId: string;
};

export type MobileDMMarkReadRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  emitReadUpdate(event: MobileDMReadUpdatedEvent): void;
  enforceRateLimit(userId: string, action: "mobile:dm:mark-read"): Promise<void>;
  getParticipantReadStates(conversationId: string): Promise<readonly ReadStateRow[]>;
  markRead(userId: string, conversationId: string): Promise<unknown>;
};

const defaultDependencies: MobileDMMarkReadRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  emitReadUpdate(event) {
    getSocketServer()?.to(`dm:${event.conversationId}`).emit("dm:conversation:read", event);
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
      dependencies.emitReadUpdate({ conversationId, ...currentUserReadState });
    }

    return Response.json(response, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
