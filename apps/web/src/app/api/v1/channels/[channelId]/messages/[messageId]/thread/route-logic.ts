import { ChannelType } from "@wizards/db";
import { ChannelThreadStatePatchSchema, ChannelThreadStateSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";
import { setChannelThreadClosed } from "@/lib/workspace/thread-lifecycle-service";

export type ChannelThreadRouteContext = {
  params: Promise<{ channelId: string; messageId: string }>;
};

export type ChannelThreadRouteDependencies = {
  authenticate: () => Promise<string>;
  authorize: (userId: string, channelId: string) => Promise<bigint>;
  enforceRateLimit: (userId: string) => Promise<unknown>;
  setThreadClosed: typeof setChannelThreadClosed;
};

const defaultDependencies: ChannelThreadRouteDependencies = {
  authenticate: requireApiUserId,
  authorize: async (userId, channelId) => {
    const result = await requireChannelPermissionForUser(
      userId,
      channelId,
      PermissionBits.VIEW_CHANNEL,
      { requiredType: ChannelType.TEXT },
    );
    return result.permissions;
  },
  enforceRateLimit: (userId) => enforceApiRateLimit(userId, "mentions:thread-follow"),
  setThreadClosed: setChannelThreadClosed,
};

export async function patchChannelThreadStateRoute(
  request: Request,
  context: ChannelThreadRouteContext,
  dependencies: ChannelThreadRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId);
    const body = await parseJsonBody(request, ChannelThreadStatePatchSchema);
    const { channelId, messageId } = await context.params;
    const permissions = await dependencies.authorize(userId, channelId);
    const state = await dependencies.setThreadClosed({
      channelId,
      closed: !body.open,
      parentMessageId: messageId,
      permissions,
      userId,
    });

    return Response.json(ChannelThreadStateSchema.parse(state), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
