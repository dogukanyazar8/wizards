import { z } from "zod";
import { prisma } from "@wizards/db";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { ApiError, jsonError } from "@/lib/api";

const UpdateNotificationSettingsSchema = z.object({
  level: z.enum(["all", "mentions", "muted"]),
});

type RouteContext = {
  params: Promise<{ channelId: string }>;
};

async function assertChannelAccess(userId: string, channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      serverId: true,
      type: true,
    },
  });

  if (!channel?.serverId || channel.type !== "TEXT") {
    throw new ApiError("Channel not found", 404, "CHANNEL_NOT_FOUND");
  }

  const [membership, ban] = await Promise.all([
    prisma.serverMember.findUnique({
      where: {
        userId_serverId: {
          serverId: channel.serverId,
          userId,
        },
      },
      select: { id: true },
    }),
    prisma.serverBan.findUnique({
      where: {
        serverId_userId: {
          serverId: channel.serverId,
          userId,
        },
      },
      select: { id: true },
    }),
  ]);

  if (ban) {
    throw new ApiError("You are banned from this server", 403, "SERVER_BANNED");
  }

  if (!membership) {
    throw new ApiError("You are not a member of this server", 403, "FORBIDDEN");
  }
}

function mapSettingsToLevel(settings: {
  messageNotifications: "ALL" | "MENTIONS" | "NOTHING" | "DEFAULT";
  muted: boolean;
  mutedUntil: Date | null;
} | null) {
  if (settings?.muted || (settings?.mutedUntil && settings.mutedUntil > new Date())) {
    return "muted" as const;
  }

  if (settings?.messageNotifications === "MENTIONS") {
    return "mentions" as const;
  }

  if (settings?.messageNotifications === "NOTHING") {
    return "muted" as const;
  }

  return "all" as const;
}

export async function GET(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    const { channelId } = await context.params;
    await assertChannelAccess(userId, channelId);

    const settings = await prisma.userChannelSettings.findUnique({
      where: {
        userId_channelId: {
          channelId,
          userId,
        },
      },
      select: {
        messageNotifications: true,
        muted: true,
        mutedUntil: true,
      },
    });

    return Response.json({ level: mapSettingsToLevel(settings) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "settings:update");
    const { channelId } = await context.params;
    const input = UpdateNotificationSettingsSchema.parse(await request.json());
    await assertChannelAccess(userId, channelId);

    const settings =
      input.level === "all"
        ? { messageNotifications: "ALL" as const, muted: false, mutedUntil: null }
        : input.level === "mentions"
          ? { messageNotifications: "MENTIONS" as const, muted: false, mutedUntil: null }
          : { messageNotifications: "NOTHING" as const, muted: true, mutedUntil: null };

    const updated = await prisma.userChannelSettings.upsert({
      where: {
        userId_channelId: {
          channelId,
          userId,
        },
      },
      create: {
        channelId,
        userId,
        ...settings,
      },
      update: settings,
      select: {
        messageNotifications: true,
        muted: true,
        mutedUntil: true,
      },
    });

    return Response.json({ level: mapSettingsToLevel(updated) });
  } catch (error) {
    return jsonError(error);
  }
}
