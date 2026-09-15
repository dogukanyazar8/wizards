import type { AnalyticsMediaKind, ReleaseChannel } from "@wizards/db";

import {
  BADGE_ACTIVE_DAY_MIN_SECONDS,
  advanceBadgeProgress,
  type AdvanceBadgeProgressArgs,
  type BadgeStore,
} from "@/lib/badges/badge-service";
import { logError } from "@/lib/logger";

/**
 * Thin wrappers the product services call after their own work has committed.
 *
 * Two rules hold for every function here:
 *
 * 1. They never throw. A badge is a decoration; a message send, a server join
 *    or a bug-report transition must not fail because a counter did not move.
 *    Failures are swallowed and reported through `logError`.
 * 2. They never run inside a `$transaction`. A badge write joining someone
 *    else's transaction would hold that transaction open on a table nobody in
 *    the request cares about, and a rollback would silently undo a grant.
 *
 * One accepted loss: `streak` counts a day active when a *single* session on
 * that day reached `BADGE_ACTIVE_DAY_MIN_SECONDS`. Somebody who spends 30
 * seconds twice does not get the day. The alternative — summing the day's
 * sessions — means scanning `UserDailyMetric` on an event path, which 00 §3
 * forbids outright; the counter table exists so that scan never happens.
 */

export type BadgeTriggerDependencies = {
  advanceProgress: typeof advanceBadgeProgress;
  logFailure: typeof logError;
  store?: BadgeStore;
};

export const defaultBadgeTriggerDependencies: BadgeTriggerDependencies = {
  advanceProgress: advanceBadgeProgress,
  logFailure: logError,
};

/** The single place a trigger touches the engine, and the only `catch` here. */
async function advance(
  scope: string,
  dependencies: BadgeTriggerDependencies,
  args: Omit<AdvanceBadgeProgressArgs, "store">,
): Promise<void> {
  try {
    await dependencies.advanceProgress({
      ...args,
      ...(dependencies.store === undefined ? {} : { store: dependencies.store }),
    });
  } catch (error) {
    dependencies.logFailure(`[badges] ${scope} failed`, error);
  }
}

export async function onAppSessionEnded(
  args: { userId: string; day: Date; appSeconds: number },
  dependencies: BadgeTriggerDependencies = defaultBadgeTriggerDependencies,
): Promise<void> {
  if (args.appSeconds < BADGE_ACTIVE_DAY_MIN_SECONDS) {
    return;
  }

  await advance("onAppSessionEnded", dependencies, {
    amount: 1,
    badge: "streak",
    day: args.day,
    mode: "increment",
    userId: args.userId,
  });
}

export async function onAppSessionStarted(
  args: {
    userId: string;
    releaseChannel: ReleaseChannel | null;
    clientType?: string;
  },
  dependencies: BadgeTriggerDependencies = defaultBadgeTriggerDependencies,
): Promise<void> {
  // The badge asks for a beta preference *and* a session on it; this call is
  // made from session creation, so the session half is already true.
  if (args.releaseChannel !== "UAT") {
    return;
  }

  await advance("onAppSessionStarted", dependencies, {
    amount: 1,
    badge: "betaTester",
    mode: "set",
    userId: args.userId,
  });
}

export async function onMessageCreated(
  args: { userId: string; day: Date },
  dependencies: BadgeTriggerDependencies = defaultBadgeTriggerDependencies,
): Promise<void> {
  await advance("onMessageCreated", dependencies, {
    amount: 1,
    badge: "regular",
    day: args.day,
    mode: "increment",
    userId: args.userId,
  });
}

export async function onMediaSessionEnded(
  args: { userId: string; kind: AnalyticsMediaKind; durationSeconds: number },
  dependencies: BadgeTriggerDependencies = defaultBadgeTriggerDependencies,
): Promise<void> {
  // `CAMERA` feeds no badge: having a webcam on is not an achievement.
  const badge =
    args.kind === "VOICE" ? "voice" : args.kind === "SCREEN_SHARE" ? "broadcaster" : null;

  if (badge === null || args.durationSeconds <= 0) {
    return;
  }

  await advance("onMediaSessionEnded", dependencies, {
    amount: Math.trunc(args.durationSeconds),
    badge,
    mode: "increment",
    userId: args.userId,
  });
}

export async function onInviteRedeemed(
  args: { inviterId: string; joinedUserId: string },
  dependencies: BadgeTriggerDependencies = defaultBadgeTriggerDependencies,
): Promise<void> {
  // Inviting yourself is not an invite (00 §4 "Kabul edilmiş davet").
  if (args.inviterId === args.joinedUserId) {
    return;
  }

  await advance("onInviteRedeemed", dependencies, {
    amount: 1,
    badge: "inviter",
    mode: "increment",
    userId: args.inviterId,
  });
}

export async function onFeedbackShipped(
  args: { userIds: readonly string[] },
  dependencies: BadgeTriggerDependencies = defaultBadgeTriggerDependencies,
): Promise<void> {
  // A roadmap row usually carries several reports; every author earns it.
  const userIds = [...new Set(args.userIds)];

  for (const userId of userIds) {
    await advance("onFeedbackShipped", dependencies, {
      amount: 1,
      badge: "ideaShipped",
      mode: "increment",
      userId,
    });
  }
}

export async function onBugReportResolved(
  args: { userId: string },
  dependencies: BadgeTriggerDependencies = defaultBadgeTriggerDependencies,
): Promise<void> {
  await advance("onBugReportResolved", dependencies, {
    amount: 1,
    badge: "bugHunter",
    mode: "increment",
    userId: args.userId,
  });
}
