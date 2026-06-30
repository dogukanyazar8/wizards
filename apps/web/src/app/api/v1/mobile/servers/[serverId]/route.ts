import {
  MobileWorkspaceServerDetailResponseSchema,
  type MobileWorkspaceChannelSummary,
  type MobileWorkspaceServerDetail,
  type WorkspaceServerDetail,
} from "@wizards/types";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { getWorkspaceServerDetail } from "@/lib/workspace/server-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MOBILE_SERVER_CATEGORY_LIMIT = 20;
const MOBILE_SERVER_CHANNEL_LIMIT = 80;

type RouteContext = {
  params: Promise<{
    serverId: string;
  }>;
};

type WorkspaceChannel = WorkspaceServerDetail["ungroupedChannels"][number];

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireMobileApiUserId(request);
    await enforceApiRateLimit(userId, "mobile:server:detail");

    const { serverId } = await context.params;
    const detail = await getWorkspaceServerDetail(userId, serverId);

    return Response.json(
      MobileWorkspaceServerDetailResponseSchema.parse({
        detail: toMobileWorkspaceServerDetail(detail),
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

function toMobileWorkspaceServerDetail(
  detail: WorkspaceServerDetail,
): MobileWorkspaceServerDetail {
  const visibleChannelCount =
    detail.ungroupedChannels.length +
    detail.categories.reduce((total, category) => total + category.channels.length, 0);

  let remainingChannelSlots = MOBILE_SERVER_CHANNEL_LIMIT;
  const categories = detail.categories
    .slice(0, MOBILE_SERVER_CATEGORY_LIMIT)
    .map((category) => {
      const channels = category.channels
        .slice(0, Math.max(remainingChannelSlots, 0))
        .map((channel) => toMobileWorkspaceChannel(channel, category.name));
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
  const returnedChannelCount =
    ungroupedChannels.length +
    categories.reduce((total, category) => total + category.channels.length, 0);
  const returnedChannelIds = new Set([
    ...ungroupedChannels.map((channel) => channel.id),
    ...categories.flatMap((category) => category.channels.map((channel) => channel.id)),
  ]);
  const defaultChannelId =
    detail.server.defaultChannelId && returnedChannelIds.has(detail.server.defaultChannelId)
      ? detail.server.defaultChannelId
      : (ungroupedChannels.find((channel) => channel.type === "TEXT") ??
          categories
            .flatMap((category) => category.channels)
            .find((channel) => channel.type === "TEXT"))?.id ??
        null;

  return {
    categories,
    hasMoreChannels: returnedChannelCount < visibleChannelCount,
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
      visibleChannelCount,
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
