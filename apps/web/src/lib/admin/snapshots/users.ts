import type { UserStatus } from "@wizards/db";
import { prisma } from "@wizards/db";
import type { AdminSnapshotClient, AdminSnapshotInput } from "@/lib/admin/snapshots/client";
import { getDisplayName, mapCountBreakdown } from "@/lib/admin/snapshots/shared";

/** Newest accounts plus the status breakdown behind the Kullanıcılar module. */
export async function loadAdminUsersSnapshot(
  _input: AdminSnapshotInput,
  client: AdminSnapshotClient = prisma,
) {
  const [latestUsers, statusGroups] = await Promise.all([
    client.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        avatarUrl: true,
        createdAt: true,
        displayName: true,
        email: true,
        emailVerified: true,
        id: true,
        isBanned: true,
        status: true,
        username: true,
      },
    }),
    client.user.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  return {
    latest: latestUsers.map((user) => ({
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
      displayName: getDisplayName(user),
      email: user.email,
      emailVerified: user.emailVerified,
      id: user.id,
      isBanned: user.isBanned,
      status: user.status,
      username: user.username,
    })),
    statusBreakdown: mapCountBreakdown<UserStatus>(statusGroups, "status"),
  };
}

export type AdminUsersSnapshot = Awaited<ReturnType<typeof loadAdminUsersSnapshot>>;
