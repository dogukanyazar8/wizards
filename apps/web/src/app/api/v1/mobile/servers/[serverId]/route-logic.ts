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
import { authorizeMobileApiRequest } from "@/lib/auth/api";
import { createServerTimingForRequest } from "@/lib/server-timing";
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
  "mobile:server:delete" | "mobile:server:detail" | "mobile:server:update";

type WorkspaceChannel = MobileWorkspaceServerDetailProjection["ungroupedChannels"][number] & {
  lastMessage?: MobileWorkspaceChannelSummary["lastMessage"];
};

export type MobileServerDetailRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerDetailRouteDependencies = {
  /**
   * Authentication and rate limiting are one dependency because they resolve
   * concurrently — see `authorizeMobileApiRequest`. Server detail is the read
   * the workspace screen blocks on, so the saved round trip is user-visible.
   */
  authorize(request: Request, action: MobileServerRateLimitAction): Promise<string>;
  deleteServer: typeof deleteWorkspaceServer;
  getServerDetailWithAccess: typeof getMobileWorkspaceServerDetailWithAccess;
  parseBody: typeof parseJsonBody;
  resolveCapabilities: typeof resolveMobileServerCapabilities;
  updateServer: typeof updateWorkspaceServer;
};

const defaultDependencies: MobileServerDetailRouteDependencies = {
  authorize: (request, action) => authorizeMobileApiRequest(request, action),
  deleteServer: deleteWorkspaceServer,
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
  const timing = createServerTimingForRequest(request);

  try {
    const stopAuthTiming = timing.start("auth");
    const userId = await dependencies.authorize(request, "mobile:server:detail");
    stopAuthTiming();
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const result = await timing.measure("db", () =>
      dependencies.getServerDetailWithAccess(userId, serverId),
    );

    return Response.json(
      MobileManagedWorkspaceServerDetailResponseSchema.parse({
        detail: {
          ...toMobileWorkspaceServerDetail(result.detail, result.hasMoreChannels),
          capabilities: dependencies.resolveCapabilities(result.access),
        },
      }),
      {
        headers: timing.headers({ "Cache-Control": "no-store, no-cache, must-revalidate" }),
      },
    );
  } catch (error) {
    return jsonError(error, timing.requestId);
  }
}

export async function mobileServerUpdateRoute(
  request: Request,
  context: MobileServerDetailRouteContext,
  dependencies: MobileServerDetailRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authorize(request, "mobile:server:update");
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
    const userId = await dependencies.authorize(request, "mobile:server:delete");
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
  const sourceCategories = detail.categories.slice(0, MOBILE_SERVER_CATEGORY_LIMIT);
  const categories = sourceCategories
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
    // Same rule as the service: only a category the mobile budget emptied is
    // dropped. One that has no channels at all is a real, addressable category
    // and the client needs it to render (and to file new channels under).
    .filter(
      (category, index) =>
        category.channels.length > 0 || sourceCategories[index]?.channels.length === 0,
    );

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
      allowFileUploads: detail.server.allowFileUploads,
      allowGifs: detail.server.allowGifs,
      defaultChannelId,
      description: detail.server.description,
      // K10: iki alan da opsiyonel; yeni yanıtı eski istemci de ayrıştırır.
      iconColor: detail.server.iconColor,
      iconUrl: normalizeMobileImageUrl(detail.server.iconUrl),
      id: detail.server.id,
      memberCount: detail.server.memberCount,
      mentionCount: detail.server.mentionCount,
      name: detail.server.name,
      onlineMemberCount: detail.server.onlineMemberCount ?? 0,
      ownerUserId: detail.server.ownerUserId ?? null,
      shortName: detail.server.shortName,
      slowModeDelay: detail.server.slowModeDelay,
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
