import {
  MobileChannelCreateRequestSchema,
  MobileChannelCreateResponseSchema,
  MobileServerIdParamsSchema,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { createWorkspaceChannel } from "@/lib/workspace/channel-service";

type MobileServerChannelCreateRateLimitAction = "mobile:server:channels:create";

export type MobileServerChannelsRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerChannelsRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  createChannel: typeof createWorkspaceChannel;
  enforceRateLimit(userId: string, action: MobileServerChannelCreateRateLimitAction): Promise<void>;
  parseBody: typeof parseJsonBody;
};

const defaultDependencies: MobileServerChannelsRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  createChannel: createWorkspaceChannel,
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
};

export async function mobileServerChannelCreateRoute(
  request: Request,
  context: MobileServerChannelsRouteContext,
  dependencies: MobileServerChannelsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:channels:create");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, MobileChannelCreateRequestSchema);
    const channel = await dependencies.createChannel(userId, serverId, input);

    return Response.json(
      MobileChannelCreateResponseSchema.parse({
        channel: { id: channel.id },
      }),
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
