import {
  MobileChannelUpdateRequestSchema,
  MobileMutationSuccessResponseSchema,
  MobileServerChannelParamsSchema,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { deleteWorkspaceChannel, updateWorkspaceChannel } from "@/lib/workspace/channel-service";

type MobileServerChannelRateLimitAction =
  | "mobile:server:channels:delete"
  | "mobile:server:channels:update";

export type MobileServerChannelRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerChannelRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  deleteChannel: typeof deleteWorkspaceChannel;
  enforceRateLimit(userId: string, action: MobileServerChannelRateLimitAction): Promise<void>;
  parseBody: typeof parseJsonBody;
  updateChannel: typeof updateWorkspaceChannel;
};

const defaultDependencies: MobileServerChannelRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  deleteChannel: deleteWorkspaceChannel,
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  updateChannel: updateWorkspaceChannel,
};

export async function mobileServerChannelUpdateRoute(
  request: Request,
  context: MobileServerChannelRouteContext,
  dependencies: MobileServerChannelRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:channels:update");
    const { channelId, serverId } = MobileServerChannelParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, MobileChannelUpdateRequestSchema);
    await dependencies.updateChannel(userId, channelId, input, {
      expectedServerId: serverId,
    });

    return Response.json(MobileMutationSuccessResponseSchema.parse({ success: true }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileServerChannelDeleteRoute(
  request: Request,
  context: MobileServerChannelRouteContext,
  dependencies: MobileServerChannelRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:channels:delete");
    const { channelId, serverId } = MobileServerChannelParamsSchema.parse(await context.params);
    await dependencies.deleteChannel(userId, channelId, {
      expectedServerId: serverId,
    });

    return Response.json(MobileMutationSuccessResponseSchema.parse({ success: true }));
  } catch (error) {
    return jsonError(error);
  }
}
