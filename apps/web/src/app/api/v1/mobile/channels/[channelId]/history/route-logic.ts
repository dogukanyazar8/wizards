import {
  MobileChannelHistoryClearResponseSchema,
  MobileChannelIdParamsSchema,
} from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { getSocketServer } from "@/lib/socket/runtime";
import { clearWorkspaceChannelHistory } from "@/lib/workspace/channel-service";
import { emitServerUnreadUpdatesForServer } from "@/lib/workspace/unread-service";

type MobileChannelHistoryRateLimitAction = "mobile:channel:history:clear";

type MobileChannelHistorySocket = {
  to(room: string): {
    emit(event: "message:history_cleared", payload: { channelId: string }): void;
  };
};

export type MobileChannelHistoryRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileChannelHistoryRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  clearHistory: typeof clearWorkspaceChannelHistory;
  emitUnreadUpdates: typeof emitServerUnreadUpdatesForServer;
  enforceRateLimit(userId: string, action: MobileChannelHistoryRateLimitAction): Promise<void>;
  getSocketServer(): MobileChannelHistorySocket | null;
};

const defaultDependencies: MobileChannelHistoryRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  clearHistory: clearWorkspaceChannelHistory,
  emitUnreadUpdates: emitServerUnreadUpdatesForServer,
  enforceRateLimit: enforceApiRateLimit,
  getSocketServer: () => getSocketServer(),
};

export async function mobileChannelHistoryDeleteRoute(
  request: Request,
  context: MobileChannelHistoryRouteContext,
  dependencies: MobileChannelHistoryRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:channel:history:clear");
    const { channelId } = MobileChannelIdParamsSchema.parse(await context.params);
    const result = await dependencies.clearHistory(userId, channelId);
    const response = MobileChannelHistoryClearResponseSchema.parse({
      deletedCount: result.deletedCount,
    });

    await dependencies.emitUnreadUpdates(result.serverId);
    dependencies.getSocketServer()?.to(channelId).emit("message:history_cleared", {
      channelId,
    });

    return Response.json(response);
  } catch (error) {
    return jsonError(error);
  }
}
