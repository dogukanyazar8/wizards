import { prisma } from "@wizards/db";

/**
 * "n sa önce görüldü" on the mobile invite sheet.
 *
 * There is no `User.lastSeenAt` column — the repo already treats the newest
 * `AppSession.lastSeenAt` as a user's last-seen time (the admin dashboard and
 * user management both read it that way), so this reuses that source instead
 * of adding a denormalised column.
 */
export async function resolveLastSeenAtByUserId(
  userIds: readonly string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const sessions = await prisma.appSession.groupBy({
    by: ["userId"],
    where: { userId: { in: [...userIds] } },
    _max: { lastSeenAt: true },
  });

  const lastSeenByUserId = new Map<string, string>();
  for (const session of sessions) {
    const lastSeenAt = session._max.lastSeenAt;
    if (lastSeenAt) {
      lastSeenByUserId.set(session.userId, lastSeenAt.toISOString());
    }
  }

  return lastSeenByUserId;
}
