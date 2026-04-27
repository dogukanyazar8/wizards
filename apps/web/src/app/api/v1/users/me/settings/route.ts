import { z } from "zod";
import { prisma } from "@wizards/db";
import { requireApiUserId } from "@/lib/auth/api";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import {
  clampServerRailWidth,
  clampChannelSidebarWidth,
  MIN_NOTIFICATION_LIMIT,
  MAX_NOTIFICATION_LIMIT,
} from "@/lib/appearance";

const PatchSettingsSchema = z.object({
  serverRailWidth: z.number().int().optional(),
  channelSidebarWidth: z.number().int().optional(),
  notificationLimit: z.number().int().min(MIN_NOTIFICATION_LIMIT).max(MAX_NOTIFICATION_LIMIT).optional(),
  notificationAutoClose: z.boolean().optional(),
});

export type UserLayoutSettings = {
  serverRailWidth: number;
  channelSidebarWidth: number;
  notificationLimit: number;
  notificationAutoClose: boolean;
};

export async function GET() {
  try {
    const userId = await requireApiUserId();
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: {
        serverRailWidth: true,
        channelSidebarWidth: true,
        notificationLimit: true,
        notificationAutoClose: true,
      },
    });

    if (!settings) {
      throw new ApiError("Settings not found", 404);
    }

    return Response.json(settings);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireApiUserId();
    const body = await parseJsonBody(request, PatchSettingsSchema);

    const data: Partial<{
      serverRailWidth: number;
      channelSidebarWidth: number;
      notificationLimit: number;
      notificationAutoClose: boolean;
    }> = {};

    if (body.serverRailWidth !== undefined) {
      data.serverRailWidth = clampServerRailWidth(body.serverRailWidth);
    }
    if (body.channelSidebarWidth !== undefined) {
      data.channelSidebarWidth = clampChannelSidebarWidth(body.channelSidebarWidth);
    }
    if (body.notificationLimit !== undefined) {
      data.notificationLimit = body.notificationLimit;
    }
    if (body.notificationAutoClose !== undefined) {
      data.notificationAutoClose = body.notificationAutoClose;
    }

    const updated = await prisma.userSettings.update({
      where: { userId },
      data,
      select: {
        serverRailWidth: true,
        channelSidebarWidth: true,
        notificationLimit: true,
        notificationAutoClose: true,
      },
    });

    return Response.json(updated);
  } catch (error) {
    return jsonError(error);
  }
}
