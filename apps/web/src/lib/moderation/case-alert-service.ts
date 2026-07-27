import type { Prisma } from "@wizards/db";
import { prisma } from "@wizards/db";
import { ADMIN_CAPABILITIES } from "@/lib/admin/capabilities";
import { logError } from "@/lib/logger";
import {
  sendMobilePushForNotifications,
  type MobilePushNotificationRow,
} from "@/lib/mobile/push-sender";

const ALERT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const ALERT_SWEEP_LIMIT = 25;
/** A case that is still someone's problem; a resolved one is never loud. */
const ALERTABLE_STATUSES = ["OPEN", "IN_REVIEW", "APPEALED"] as const;

const ALERT_NOTIFICATION = {
  body: (publicNumber: number, subjectHandle: string) =>
    `MOD-${publicNumber} · @${subjectHandle} bekliyor. Telefondan üstlen, reddet veya masaüstüne yükselt.`,
  title: "Moderasyon vakası bekliyor",
} as const;

export interface ModerationAlertCase {
  readonly id: string;
  readonly openedAt: Date;
  readonly priority: "HIGH" | "LOW" | "NORMAL" | "URGENT";
  readonly publicNumber: number;
  readonly status: "ACTIONED" | "APPEALED" | "CLOSED" | "DISMISSED" | "IN_REVIEW" | "OPEN";
  readonly subjectHandle: string;
}

export interface ModerationAlertNotificationInput {
  readonly actionUrl: string;
  readonly body: string;
  readonly dedupeKey: string;
  readonly title: string;
  readonly userId: string;
}

export interface ModerationCaseAlertDependencies {
  createNotifications(
    rows: readonly ModerationAlertNotificationInput[],
  ): Promise<MobilePushNotificationRow[]>;
  listAlertAdminUserIds(): Promise<string[]>;
  listAlertableCases(args: { readonly staleBefore: Date }): Promise<ModerationAlertCase[]>;
  sendPush(rows: readonly MobilePushNotificationRow[]): Promise<unknown>;
}

/**
 * `Notification.dedupeKey` carries a table-wide unique index, so a key built
 * from the case and the day alone would let the first admin's row win and drop
 * everyone else's — the alert would land on one phone and look "deduplicated".
 * The recipient is part of the key for the same reason every other multi-target
 * key in this repo carries it.
 */
export function buildModerationAlertDedupeKey(caseId: string, userId: string, now: Date): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");

  return `modcase:${caseId}:alert:${userId}:${day}`;
}

/**
 * Two ways a case earns a phone notification: it is urgent right now, or it has
 * been sitting open for a full day without anyone claiming it.
 */
export function isModerationCaseAlertable(moderationCase: ModerationAlertCase, now: Date): boolean {
  if (!(ALERTABLE_STATUSES as readonly string[]).includes(moderationCase.status)) {
    return false;
  }

  if (moderationCase.priority === "URGENT") {
    return true;
  }

  return (
    moderationCase.status === "OPEN" &&
    now.getTime() - moderationCase.openedAt.getTime() >= ALERT_STALE_AFTER_MS
  );
}

function buildAlertNotifications(
  moderationCase: ModerationAlertCase,
  adminUserIds: readonly string[],
  now: Date,
): ModerationAlertNotificationInput[] {
  return adminUserIds.map((userId) => ({
    // The same path the web console and the mobile deep link both resolve.
    actionUrl: `/admin/moderation/${moderationCase.id}`,
    body: ALERT_NOTIFICATION.body(moderationCase.publicNumber, moderationCase.subjectHandle),
    dedupeKey: buildModerationAlertDedupeKey(moderationCase.id, userId, now),
    title: ALERT_NOTIFICATION.title,
    userId,
  }));
}

async function deliverAlerts(
  rows: readonly ModerationAlertNotificationInput[],
  dependencies: ModerationCaseAlertDependencies,
): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  const created = await dependencies.createNotifications(rows);
  if (created.length === 0) {
    return 0;
  }

  await dependencies.sendPush(created);

  return created.length;
}

const defaultDependencies: ModerationCaseAlertDependencies = {
  createNotifications: (rows) =>
    prisma.notification.createManyAndReturn({
      data: rows.map((row) => ({
        actionUrl: row.actionUrl,
        body: row.body,
        dedupeKey: row.dedupeKey,
        title: row.title,
        type: "MODERATION" as const,
        userId: row.userId,
      })),
      // A same-day repeat is a duplicate, not an error.
      skipDuplicates: true,
      select: {
        actionUrl: true,
        body: true,
        id: true,
        title: true,
        type: true,
        userId: true,
      },
    }),
  listAlertAdminUserIds: async () => {
    const memberships = await prisma.adminMembership.findMany({
      select: { userId: true },
      where: { role: { in: [...ADMIN_CAPABILITIES["case.action"]] } },
    });

    return memberships.map((membership) => membership.userId);
  },
  listAlertableCases: async ({ staleBefore }) => {
    const where = {
      OR: [
        { priority: "URGENT" as const, status: { in: [...ALERTABLE_STATUSES] } },
        { openedAt: { lte: staleBefore }, status: "OPEN" as const },
      ],
    } satisfies Prisma.ModerationCaseWhereInput;

    return prisma.moderationCase.findMany({
      orderBy: [{ priority: "desc" }, { openedAt: "asc" }],
      select: {
        id: true,
        openedAt: true,
        priority: true,
        publicNumber: true,
        status: true,
        subjectHandle: true,
      },
      take: ALERT_SWEEP_LIMIT,
      where,
    });
  },
  sendPush: (rows) => sendMobilePushForNotifications([...rows]),
};

/**
 * Fires the alert for a single case — the escalate endpoint's follow-up, so the
 * admin who is not looking at the console hears about it on their phone.
 */
export async function alertModerationCase(
  args: { readonly moderationCase: ModerationAlertCase; readonly now?: Date },
  dependencies: ModerationCaseAlertDependencies = defaultDependencies,
): Promise<{ notified: number }> {
  const now = args.now ?? new Date();

  if (!isModerationCaseAlertable(args.moderationCase, now)) {
    return { notified: 0 };
  }

  const adminUserIds = await dependencies.listAlertAdminUserIds();
  if (adminUserIds.length === 0) {
    return { notified: 0 };
  }

  return {
    notified: await deliverAlerts(
      buildAlertNotifications(args.moderationCase, adminUserIds, now),
      dependencies,
    ),
  };
}

/**
 * The periodic half: the outbox worker's hourly maintenance calls this, which is
 * what turns "open for more than a day" into a notification without standing up
 * a second scheduler.
 */
export async function sweepModerationCaseAlerts(
  args: { readonly now?: Date } = {},
  dependencies: ModerationCaseAlertDependencies = defaultDependencies,
): Promise<{ alertedCases: number; notified: number }> {
  const now = args.now ?? new Date();
  const cases = await dependencies.listAlertableCases({
    staleBefore: new Date(now.getTime() - ALERT_STALE_AFTER_MS),
  });
  const alertable = cases.filter((moderationCase) =>
    isModerationCaseAlertable(moderationCase, now),
  );

  if (alertable.length === 0) {
    return { alertedCases: 0, notified: 0 };
  }

  // One recipient lookup for the whole sweep: the admin roster does not change
  // between two cases in the same pass.
  const adminUserIds = await dependencies.listAlertAdminUserIds();
  if (adminUserIds.length === 0) {
    return { alertedCases: 0, notified: 0 };
  }

  let notified = 0;
  let alertedCases = 0;

  for (const moderationCase of alertable) {
    const delivered = await deliverAlerts(
      buildAlertNotifications(moderationCase, adminUserIds, now),
      dependencies,
    );

    notified += delivered;
    alertedCases += 1;
  }

  return { alertedCases, notified };
}

/** Fire-and-forget wrapper: an alert must never fail the action that caused it. */
export function alertModerationCaseInBackground(
  args: { readonly moderationCase: ModerationAlertCase; readonly now?: Date },
  dependencies: ModerationCaseAlertDependencies = defaultDependencies,
): void {
  void alertModerationCase(args, dependencies).catch((error) => {
    logError("[moderation] Case alert failed", error);
  });
}
