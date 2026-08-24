import { type PrismaClient } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { broadcastPresenceUpdateToFriends, cacheUserPresence } from "@/lib/friends/service";
import {
  planPresenceUpdate,
  resolveExpiredFocus,
  toVisiblePresence,
  type ExpiredFocusResolution,
  type FocusRow,
  type UserStatusValue,
} from "@/lib/home/focus";
import type { PresenceUpdateBody, PresenceUpdateResponse } from "@/lib/home/types";
import { logError } from "@/lib/logger";

/**
 * Ana Sayfa 1a — Faz 3 §3.9 and §1.1(2). The only write endpoint of this phase,
 * plus the sweep that closes focus windows for people who are not looking.
 *
 * Expiry is handled twice on purpose:
 * - **Lazy**, when the owner reads their own summary — instant and exact for the
 *   one person who cares most.
 * - **Swept**, on the outbox worker's tick — so a friend's screen stops showing
 *   "Rahatsız etmeyin" even when the owner never opens the app again.
 */

const FOCUS_ROW_SELECT = {
  id: true,
  status: true,
  statusExpiresAt: true,
  statusFocusMinutes: true,
  statusRestoreTo: true,
} as const;

/** One tick clears at most this many windows; the next tick takes the rest. */
export const HOME_FOCUS_SWEEP_BATCH_SIZE = 200;

export type PresenceBroadcast = (input: {
  status: UserStatusValue;
  userId: string;
}) => Promise<void>;

/**
 * Redis cache first, then the fan-out. Both are best-effort: a presence write
 * that succeeded in Postgres must not 500 because Redis blinked.
 */
export const broadcastHomePresence: PresenceBroadcast = async ({ status, userId }) => {
  const visible = toVisiblePresence(status);

  try {
    const presence = await cacheUserPresence(userId, visible);
    if (presence) {
      await broadcastPresenceUpdateToFriends(presence);
    }
  } catch (error) {
    logError(`[home] presence broadcast failed for ${userId}`, error);
  }
};

export type HomePresenceUpdateDependencies = {
  readonly broadcast: PresenceBroadcast;
  readonly database: PrismaClient;
  readonly now: Date;
};

export async function updateHomePresence(
  userId: string,
  body: PresenceUpdateBody,
  dependencies: HomePresenceUpdateDependencies,
): Promise<PresenceUpdateResponse> {
  const { broadcast, database, now } = dependencies;
  const user = await database.user.findUnique({
    select: FOCUS_ROW_SELECT,
    where: { id: userId },
  });

  if (!user) {
    throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  const plan = planPresenceUpdate({ body, now, row: user });

  // Nothing to write means nothing to announce: repeating the same body must
  // not restart the window or wake every friend's socket.
  if (plan.changed) {
    await database.user.update({
      data: {
        status: plan.data.status,
        statusExpiresAt: plan.data.statusExpiresAt,
        statusFocusMinutes: plan.data.statusFocusMinutes,
        statusRestoreTo: plan.data.statusRestoreTo,
      },
      where: { id: userId },
    });
    await broadcast({ status: plan.data.status, userId });
  }

  return plan.result;
}

/**
 * §1.1(1). The read path found a window that had already closed: write the
 * restore through so the next reader — and every friend — agrees with it.
 * Conditional on `statusExpiresAt` still being set, so two concurrent readers
 * cannot restore twice.
 */
export async function applyExpiredFocus(
  input: ExpiredFocusResolution,
  dependencies: { broadcast: PresenceBroadcast; database: PrismaClient; now: Date },
): Promise<void> {
  const { broadcast, database } = dependencies;
  const updated = await database.user.updateMany({
    data: {
      status: input.status,
      statusExpiresAt: null,
      statusFocusMinutes: null,
      statusRestoreTo: null,
    },
    where: {
      id: input.userId,
      status: input.expected.status,
      statusExpiresAt: input.expected.statusExpiresAt,
      statusFocusMinutes: input.expected.statusFocusMinutes,
      statusRestoreTo: input.expected.statusRestoreTo,
    },
  });

  if (updated.count > 0) {
    await broadcast({ status: input.status, userId: input.userId });
  }
}

export type HomeFocusSweepDependencies = {
  readonly broadcast: PresenceBroadcast;
  readonly database: PrismaClient;
  readonly now: Date;
};

export type HomeFocusSweepResult = {
  readonly restored: number;
};

/**
 * Reads the closed windows, restores each row to what it was before focus, and
 * announces the change. Served by `User(statusExpiresAt)`, which is null for
 * almost every account.
 */
export async function sweepExpiredFocus(
  dependencies: HomeFocusSweepDependencies,
): Promise<HomeFocusSweepResult> {
  const { broadcast, database, now } = dependencies;
  const rows: FocusRow[] = await database.user.findMany({
    orderBy: { statusExpiresAt: "asc" },
    select: FOCUS_ROW_SELECT,
    take: HOME_FOCUS_SWEEP_BATCH_SIZE,
    where: { statusExpiresAt: { lte: now } },
  });

  const resolutions = resolveExpiredFocus(rows, now);
  let restored = 0;

  for (const resolution of resolutions) {
    const updated = await database.user.updateMany({
      data: {
        status: resolution.status,
        statusExpiresAt: null,
        statusFocusMinutes: null,
        statusRestoreTo: null,
      },
      where: {
        id: resolution.userId,
        status: resolution.expected.status,
        statusExpiresAt: resolution.expected.statusExpiresAt,
        statusFocusMinutes: resolution.expected.statusFocusMinutes,
        statusRestoreTo: resolution.expected.statusRestoreTo,
      },
    });
    if (updated.count > 0) {
      restored += 1;
      await broadcast({ status: resolution.status, userId: resolution.userId });
    }
  }

  return { restored };
}
