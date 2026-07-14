import {
  MobileManagedWorkspaceServerDetailResponseSchema,
  MobileMutationSuccessResponseSchema,
  MobileServerDeleteRequestSchema,
  MobileServerIdParamsSchema,
  MobileServerUpdateRequestSchema,
  type MobileWorkspaceChannelSummary,
  type MobileWorkspaceServerDetail,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { resolveMobileServerCapabilities } from "@/lib/workspace/mobile-capabilities";
import {
  deleteWorkspaceServer,
  getMobileWorkspaceServerDetailWithAccess,
  type MobileWorkspaceServerDetailProjection,
  updateWorkspaceServer,
} from "@/lib/workspace/server-service";

const MOBILE_SERVER_CATEGORY_LIMIT = 20;
const MOBILE_SERVER_CATEGORY_CHANNEL_LIMIT = 40;
const MOBILE_SERVER_CHANNEL_LIMIT = 80;
const MOBILE_SERVER_MEMBER_LIMIT = 80;

type MobileServerRateLimitAction =
  | "mobile:server:delete"
  | "mobile:server:detail"
  | "mobile:server:update";

type WorkspaceChannel = MobileWorkspaceServerDetailProjection["ungroupedChannels"][number] & {
  lastMessage?: MobileWorkspaceChannelSummary["lastMessage"];
};

export type MobileServerDetailRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerDetailRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  deleteServer: typeof deleteWorkspaceServer;
  enforceRateLimit(userId: string, action: MobileServerRateLimitAction): Promise<void>;
  getServerDetailWithAccess: typeof getMobileWorkspaceServerDetailWithAccess;
  parseBody: typeof parseJsonBody;
  resolveCapabilities: typeof resolveMobileServerCapabilities;
  updateServer: typeof updateWorkspaceServer;
};

const defaultDependencies: MobileServerDetailRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  deleteServer: deleteWorkspaceServer,
  enforceRateLimit: enforceApiRateLimit,
  getServerDetailWithAccess: getMobileWorkspaceServerDetailWithAccess,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  resolveCapabilities: resolveMobileServerCapabilities,
  updateServer: updateWorkspaceServer,
};

export async function mobileServerDetailRoute(
  request: Request,
  context: MobileServerDetailRouteContext,
  dependencies: MobileServerDetailRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:detail");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const result = await dependencies.getServerDetailWithAccess(userId, serverId);

    return Response.json(
      MobileManagedWorkspaceServerDetailResponseSchema.parse({
        detail: {
          ...toMobileWorkspaceServerDetail(result.detail, result.hasMoreChannels),
          capabilities: dependencies.resolveCapabilities(result.access),
        },
      }),
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileServerUpdateRoute(
  request: Request,
  context: MobileServerDetailRouteContext,
  dependencies: MobileServerDetailRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:update");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, MobileServerUpdateRequestSchema);
    await dependencies.updateServer(userId, serverId, input);
    const result = await dependencies.getServerDetailWithAccess(userId, serverId);

    return Response.json(
      MobileManagedWorkspaceServerDetailResponseSchema.parse({
        detail: {
          ...toMobileWorkspaceServerDetail(result.detail, result.hasMoreChannels),
          capabilities: dependencies.resolveCapabilities(result.access),
        },
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileServerDeleteRoute(
  request: Request,
  context: MobileServerDetailRouteContext,
  dependencies: MobileServerDetailRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:delete");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, MobileServerDeleteRequestSchema);
    await dependencies.deleteServer(userId, serverId, input);

    return Response.json(MobileMutationSuccessResponseSchema.parse({ success: true }));
  } catch (error) {
    return jsonError(error);
  }
}

function toMobileWorkspaceServerDetail(
  detail: MobileWorkspaceServerDetailProjection,
  serviceHasMoreChannels = false,
): MobileWorkspaceServerDetail {
  let hasMoreChannels =
    serviceHasMoreChannels || detail.categories.length > MOBILE_SERVER_CATEGORY_LIMIT;
  let remainingChannelSlots = MOBILE_SERVER_CHANNEL_LIMIT;
  const categories = detail.categories
    .slice(0, MOBILE_SERVER_CATEGORY_LIMIT)
    .map((category) => {
      const categoryLimit = Math.min(
        MOBILE_SERVER_CATEGORY_CHANNEL_LIMIT,
        Math.max(remainingChannelSlots, 0),
      );
      const channels = category.channels
        .slice(0, categoryLimit)
        .map((channel) => toMobileWorkspaceChannel(channel, category.name));
      if (channels.length < category.channels.length) {
        hasMoreChannels = true;
      }
      remainingChannelSlots -= channels.length;

      return {
        channels,
        id: category.id,
        name: category.name,
        position: category.position,
      };
    })
    .filter((category) => category.channels.length > 0);

  const ungroupedChannels =
    remainingChannelSlots > 0
      ? detail.ungroupedChannels
          .slice(0, remainingChannelSlots)
          .map((channel) => toMobileWorkspaceChannel(channel, null))
      : [];
  if (ungroupedChannels.length < detail.ungroupedChannels.length) {
    hasMoreChannels = true;
  }
  const returnedChannelCount =
    ungroupedChannels.length +
    categories.reduce((total, category) => total + category.channels.length, 0);
  const returnedTextChannels = [
    ...categories.flatMap((category) => category.channels),
    ...ungroupedChannels,
  ].filter((channel) => channel.type === "TEXT");
  const defaultChannelId =
    detail.server.defaultChannelId &&
    returnedTextChannels.some((channel) => channel.id === detail.server.defaultChannelId)
      ? detail.server.defaultChannelId
      : (returnedTextChannels[0]?.id ?? null);

  return {
    categories,
    hasMoreChannels,
    members: detail.members.slice(0, MOBILE_SERVER_MEMBER_LIMIT).map((member) => ({
      ...member,
      avatarUrl: normalizeMobileImageUrl(member.avatarUrl),
    })),
    server: {
      defaultChannelId,
      description: detail.server.description,
      iconUrl: normalizeMobileImageUrl(detail.server.iconUrl),
      id: detail.server.id,
      memberCount: detail.server.memberCount,
      mentionCount: detail.server.mentionCount,
      name: detail.server.name,
      shortName: detail.server.shortName,
      unreadCount: detail.server.unreadCount,
      visibleChannelCount: returnedChannelCount,
    },
    ungroupedChannels,
  };
}

function toMobileWorkspaceChannel(
  channel: WorkspaceChannel,
  categoryName: string | null,
): MobileWorkspaceChannelSummary {
  return {
    categoryId: channel.categoryId,
    categoryName,
    id: channel.id,
    locked: channel.locked,
    lastMessage: channel.lastMessage ?? null,
    mentionCount: channel.mentionCount,
    name: channel.name,
    position: channel.position,
    readOnly: channel.readOnly,
    topic: channel.topic,
    type: channel.type,
    unreadCount: channel.unreadCount,
  };
}

function normalizeMobileImageUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
