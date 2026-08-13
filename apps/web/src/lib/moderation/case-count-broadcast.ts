import { prisma } from "@wizards/db";
import { ADMIN_CAPABILITIES } from "@/lib/admin/capability-roles";
import { logError } from "@/lib/logger";
import { countOpenModerationCases } from "@/lib/moderation/case-queries";
import { emitToUserRooms } from "@/lib/socket/emitters";
import { getSocketServer } from "@/lib/socket/runtime";
import type { AppSocketServer } from "@/lib/socket/runtime";

export interface ModerationCaseCountBroadcastDependencies {
  canReadQueue(userId: string): Promise<boolean>;
  countOpenCases(): Promise<number>;
  emit(io: AppSocketServer, userIds: string[], count: number): void;
  listQueueReaderUserIds(): Promise<string[]>;
  resolveSocketServer(): AppSocketServer | null;
}

const defaultDependencies: ModerationCaseCountBroadcastDependencies = {
  canReadQueue: async (userId) =>
    Boolean(
      await prisma.adminMembership.findFirst({
        select: { userId: true },
        where: {
          role: { in: [...ADMIN_CAPABILITIES["case.read"]] },
          userId,
        },
      }),
    ),
  countOpenCases: () => countOpenModerationCases(),
  emit: (io, userIds, count) => {
    emitToUserRooms(io, userIds, "admin:open-case-count", { count });
  },
  listQueueReaderUserIds: async () => {
    const memberships = await prisma.adminMembership.findMany({
      select: { userId: true },
      where: { role: { in: [...ADMIN_CAPABILITIES["case.read"]] } },
    });

    return memberships.map((membership) => membership.userId);
  },
  resolveSocketServer: () => getSocketServer(),
};

/**
 * The one place the open-case number is published. The desktop tray subscribes
 * to it and displays what arrives — it never counts anything itself, so a build
 * with a stale idea of what "open" means cannot invent a badge.
 */
export async function broadcastOpenModerationCaseCount(
  dependencies: ModerationCaseCountBroadcastDependencies = defaultDependencies,
): Promise<{ count: number; recipients: number }> {
  const io = dependencies.resolveSocketServer();
  if (!io) {
    return { count: 0, recipients: 0 };
  }

  const [count, userIds] = await Promise.all([
    dependencies.countOpenCases(),
    dependencies.listQueueReaderUserIds(),
  ]);

  if (userIds.length === 0) {
    return { count, recipients: 0 };
  }

  dependencies.emit(io, userIds, count);

  return { count, recipients: userIds.length };
}

export interface OpenCaseCountSocket {
  emit(event: "admin:open-case-count", data: { count: number }): unknown;
}

/**
 * The connect-time half: a desktop that just launched has no badge until
 * something changes, so the count is pushed once to the socket that just
 * arrived — and only if that account may read the queue.
 */
export async function sendOpenModerationCaseCountToUser(
  userId: string,
  socket: OpenCaseCountSocket,
  dependencies: ModerationCaseCountBroadcastDependencies = defaultDependencies,
): Promise<{ sent: boolean }> {
  if (!(await dependencies.canReadQueue(userId))) {
    return { sent: false };
  }

  socket.emit("admin:open-case-count", { count: await dependencies.countOpenCases() });

  return { sent: true };
}

/** Fire-and-forget: a badge refresh must never fail the decision behind it. */
export function broadcastOpenModerationCaseCountInBackground(
  dependencies: ModerationCaseCountBroadcastDependencies = defaultDependencies,
): void {
  void broadcastOpenModerationCaseCount(dependencies).catch((error) => {
    logError("[moderation] Open case count broadcast failed", error);
  });
}
