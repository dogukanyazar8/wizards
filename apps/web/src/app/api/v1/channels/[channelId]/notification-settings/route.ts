import { z } from "zod";
import { ChannelType, prisma } from "@wizards/db";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";

const UpdateNotificationSettingsSchema = z.object({
  level: z.enum(["all", "mentions", "muted"]),
});

type RouteContext = {
  params: Promise<{ channelId: string }>;
};

async function assertChannelAccess(userId: string, channelId: string) {
  await requireChannelPermissionForUser(userId, channelId, PermissionBits.VIEW_CHANNEL, {
    requiredType: ChannelType.TEXT,
  });
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
