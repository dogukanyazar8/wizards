import { prisma } from "@wizards/db";

import type { NotificationSocketActor } from "@/lib/socket/events";

/**
 * The feed row wants a face and a place: who sent it, which channel, which
 * server. Those live on other tables, so a client handed only the notification
 * row had to make a round trip before it could draw anything. Emitters resolve
 * them once here — two primary-key reads, run in parallel, and only when a
 * notification is actually being created — and ship them inside the socket
 * event, which is what lets the mobile feed render straight from it.
 */
export async function loadNotificationActor(
  userId: string,
): Promise<NotificationSocketActor | null> {
  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true, displayName: true, id: true, username: true },
  });

  return actor ?? null;
}

export async function loadNotificationServerName(
  serverId: string,
): Promise<{ id: string; name: string } | null> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { id: true, name: true },
  });

  return server ?? null;
}
