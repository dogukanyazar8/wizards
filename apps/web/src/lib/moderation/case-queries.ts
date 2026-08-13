import type { ModerationCasePriority, ModerationCaseStatus, UserReportReason } from "@wizards/db";
import { prisma } from "@wizards/db";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES: ModerationCaseStatus[] = ["OPEN", "IN_REVIEW", "APPEALED"];
const RESOLVED_STATUSES: ModerationCaseStatus[] = ["ACTIONED", "DISMISSED", "CLOSED"];
const QUEUE_PAGE_SIZE = 25;
const CASE_FILE_RELATION_PAGE_SIZE = 50;

/** A case older than this without a first look is called out in the queue. */
export const CASE_STALE_AFTER_MS = DAY_MS;

export type ModerationQueueScope = "active" | "all" | "appealed" | "resolved";

export type ModerationQueueFilters = {
  assigneeId?: string;
  priority?: ModerationCasePriority;
  reason?: UserReportReason;
  scope?: ModerationQueueScope;
};

export type ModerationCaseStore = Pick<
  typeof prisma,
  | "dMMessage"
  | "message"
  | "moderationCase"
  | "moderationCaseEvent"
  | "moderationEvidence"
  | "user"
  | "userReport"
>;

function toStatusFilter(scope: ModerationQueueScope | undefined) {
  if (scope === "appealed") {
    // Appeals are a filter on the same queue, not a second inbox.
    return ["APPEALED"] as ModerationCaseStatus[];
  }

  if (scope === "resolved") {
    return RESOLVED_STATUSES;
  }

  if (scope === "all") {
    return undefined;
  }

  return ACTIVE_STATUSES;
}

export function isStaleModerationCase(
  moderationCase: { firstSeenAt: string | null; openedAt: string },
  now: Date,
) {
  return (
    moderationCase.firstSeenAt === null &&
    now.getTime() - new Date(moderationCase.openedAt).getTime() > CASE_STALE_AFTER_MS
  );
}

/**
 * Queue order follows the moderator's job, not the database's: the loudest cases
 * first, and within a priority the one that has been waiting longest.
 */
export async function listModerationCases(
  filters: ModerationQueueFilters & { page?: number } = {},
  client: ModerationCaseStore = prisma,
) {
  const statuses = toStatusFilter(filters.scope);
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const where = {
    ...(statuses ? { status: { in: statuses } } : {}),
    ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.reason ? { reports: { some: { reason: filters.reason } } } : {}),
  };

  const [cases, total] = await Promise.all([
    client.moderationCase.findMany({
      orderBy: [{ priority: "desc" }, { openedAt: "asc" }],
      skip: (page - 1) * QUEUE_PAGE_SIZE,
      take: QUEUE_PAGE_SIZE,
      where,
      select: {
        assignee: { select: { displayName: true, id: true, username: true } },
        firstSeenAt: true,
        id: true,
        openedAt: true,
        priority: true,
        publicNumber: true,
        reportCount: true,
        reports: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, reason: true },
        },
        status: true,
        subjectHandle: true,
        subjectId: true,
      },
    }),
    client.moderationCase.count({ where }),
  ]);

  return {
    cases: cases.map((moderationCase) => ({
      assignee: moderationCase.assignee
        ? {
            displayName: moderationCase.assignee.displayName ?? moderationCase.assignee.username,
            id: moderationCase.assignee.id,
            username: moderationCase.assignee.username,
          }
        : null,
      firstSeenAt: moderationCase.firstSeenAt?.toISOString() ?? null,
      id: moderationCase.id,
      lastReason: moderationCase.reports[0]?.reason ?? null,
      lastReportedAt: moderationCase.reports[0]?.createdAt.toISOString() ?? null,
      openedAt: moderationCase.openedAt.toISOString(),
      priority: moderationCase.priority,
      publicNumber: moderationCase.publicNumber,
      reportCount: moderationCase.reportCount,
      status: moderationCase.status,
      subjectHandle: moderationCase.subjectHandle,
      subjectDeleted: moderationCase.subjectId === null,
    })),
    pagination: {
      page,
      pageSize: QUEUE_PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / QUEUE_PAGE_SIZE)),
    },
  };
}

export async function getModerationQueueStats(
  now: Date = new Date(),
  client: ModerationCaseStore = prisma,
) {
  const weekStart = new Date(now.getTime() - 7 * DAY_MS);

  const [openCount, inReviewCount, resolvedThisWeek, responded] = await Promise.all([
    client.moderationCase.count({ where: { status: "OPEN" } }),
    client.moderationCase.count({ where: { status: "IN_REVIEW" } }),
    client.moderationCase.count({
      where: { resolvedAt: { gte: weekStart }, status: { in: RESOLVED_STATUSES } },
    }),
    client.moderationCase.findMany({
      take: 200,
      where: { firstSeenAt: { gte: weekStart } },
      select: { firstSeenAt: true, openedAt: true },
    }),
  ]);

  const responseMs = responded.reduce(
    (total, moderationCase) =>
      total +
      Math.max(0, (moderationCase.firstSeenAt?.getTime() ?? 0) - moderationCase.openedAt.getTime()),
    0,
  );

  return {
    averageFirstResponseMs: responded.length ? Math.round(responseMs / responded.length) : null,
    inReviewCount,
    openCount,
    resolvedThisWeek,
  };
}

/** Nav badge only ever shows work that nobody has picked up yet. */
export async function countOpenModerationCases(client: ModerationCaseStore = prisma) {
  return client.moderationCase.count({ where: { status: "OPEN" } });
}

export type ModerationCaseFilePages = {
  evidencePage?: number;
  eventPage?: number;
  reportPage?: number;
};

function normalizeRelationPage(page: number | undefined) {
  if (page === undefined || !Number.isFinite(page)) {
    return 1;
  }

  return Math.max(1, Math.trunc(page));
}

export async function getModerationCaseFile(
  caseId: string,
  pages: ModerationCaseFilePages = {},
  client: ModerationCaseStore = prisma,
) {
  const evidencePage = normalizeRelationPage(pages.evidencePage);
  const eventPage = normalizeRelationPage(pages.eventPage);
  const reportPage = normalizeRelationPage(pages.reportPage);
  const moderationCase = await client.moderationCase.findUnique({
    where: { id: caseId },
    select: {
      assignee: { select: { displayName: true, id: true, username: true } },
      evidence: {
        orderBy: { capturedAt: "desc" },
        skip: (evidencePage - 1) * CASE_FILE_RELATION_PAGE_SIZE,
        // One sentinel row tells the caller whether an older page exists without
        // loading the unbounded case relation or issuing three count queries.
        take: CASE_FILE_RELATION_PAGE_SIZE + 1,
        select: {
          capturedAt: true,
          dmMessageId: true,
          id: true,
          messageId: true,
          snapshot: true,
        },
      },
      events: {
        orderBy: { createdAt: "desc" },
        skip: (eventPage - 1) * CASE_FILE_RELATION_PAGE_SIZE,
        take: CASE_FILE_RELATION_PAGE_SIZE + 1,
        select: {
          actor: { select: { displayName: true, id: true, username: true } },
          body: true,
          createdAt: true,
          id: true,
          kind: true,
          metadata: true,
        },
      },
      firstSeenAt: true,
      id: true,
      openedAt: true,
      priority: true,
      publicNumber: true,
      reportCount: true,
      reports: {
        orderBy: { createdAt: "desc" },
        skip: (reportPage - 1) * CASE_FILE_RELATION_PAGE_SIZE,
        take: CASE_FILE_RELATION_PAGE_SIZE + 1,
        select: {
          createdAt: true,
          details: true,
          id: true,
          reason: true,
          reporter: { select: { displayName: true, id: true, username: true } },
        },
      },
      resolution: true,
      resolvedAt: true,
      status: true,
      subject: {
        select: {
          createdAt: true,
          emailVerified: true,
          id: true,
          isBanned: true,
          _count: { select: { serverMembers: true } },
        },
      },
      subjectHandle: true,
      subjectId: true,
    },
  });

  if (!moderationCase) {
    return null;
  }

  const evidenceHasOlderRecords = moderationCase.evidence.length > CASE_FILE_RELATION_PAGE_SIZE;
  const eventHasOlderRecords = moderationCase.events.length > CASE_FILE_RELATION_PAGE_SIZE;
  const reportHasOlderRecords = moderationCase.reports.length > CASE_FILE_RELATION_PAGE_SIZE;
  const evidencePageRows = moderationCase.evidence.slice(0, CASE_FILE_RELATION_PAGE_SIZE);
  const eventPageRows = moderationCase.events.slice(0, CASE_FILE_RELATION_PAGE_SIZE);
  const reportPageRows = moderationCase.reports.slice(0, CASE_FILE_RELATION_PAGE_SIZE);

  const priorCaseCount = moderationCase.subjectId
    ? await client.moderationCase.count({
        where: { id: { not: moderationCase.id }, subjectId: moderationCase.subjectId },
      })
    : 0;

  const evidenceMessageIds = evidencePageRows.flatMap((entry) =>
    entry.messageId ? [entry.messageId] : [],
  );
  const evidenceDmIds = evidencePageRows.flatMap((entry) =>
    entry.dmMessageId ? [entry.dmMessageId] : [],
  );
  const [liveMessages, liveDmMessages] = await Promise.all([
    evidenceMessageIds.length === 0
      ? Promise.resolve([])
      : client.message.findMany({
          where: { deletedAt: null, id: { in: evidenceMessageIds } },
          select: { id: true },
        }),
    evidenceDmIds.length === 0
      ? Promise.resolve([])
      : client.dMMessage.findMany({
          where: { deletedAt: null, id: { in: evidenceDmIds } },
          select: { id: true },
        }),
  ]);
  const liveIds = new Set([
    ...liveMessages.map((message) => message.id),
    ...liveDmMessages.map((message) => message.id),
  ]);

  return {
    assignee: moderationCase.assignee
      ? {
          displayName: moderationCase.assignee.displayName ?? moderationCase.assignee.username,
          id: moderationCase.assignee.id,
          username: moderationCase.assignee.username,
        }
      : null,
    firstSeenAt: moderationCase.firstSeenAt?.toISOString() ?? null,
    id: moderationCase.id,
    openedAt: moderationCase.openedAt.toISOString(),
    priority: moderationCase.priority,
    publicNumber: moderationCase.publicNumber,
    reportCount: moderationCase.reportCount,
    resolution: moderationCase.resolution,
    resolvedAt: moderationCase.resolvedAt?.toISOString() ?? null,
    status: moderationCase.status,
    subject: moderationCase.subject
      ? {
          createdAt: moderationCase.subject.createdAt.toISOString(),
          emailVerified: moderationCase.subject.emailVerified,
          id: moderationCase.subject.id,
          isBanned: moderationCase.subject.isBanned,
          priorCaseCount,
          serverCount: moderationCase.subject._count.serverMembers,
        }
      : null,
    /** The snapshot outlives its source: a deleted message still shows here. */
    evidence: evidencePageRows.map((entry) => ({
      capturedAt: entry.capturedAt.toISOString(),
      dmMessageId: entry.dmMessageId,
      id: entry.id,
      messageId: entry.messageId,
      snapshot: entry.snapshot as {
        attachments?: string[];
        authorHandle?: string;
        content?: string;
        scope?: string;
        sentAt?: string;
        source?: string;
      } | null,
      sourceDeleted: !liveIds.has(entry.messageId ?? entry.dmMessageId ?? ""),
    })),
    subjectDeleted: moderationCase.subjectId === null,
    subjectHandle: moderationCase.subjectHandle,
    pagination: {
      evidence: { hasOlderRecords: evidenceHasOlderRecords, page: evidencePage },
      events: { hasOlderRecords: eventHasOlderRecords, page: eventPage },
      reports: { hasOlderRecords: reportHasOlderRecords, page: reportPage },
    },
    timeline: [
      ...reportPageRows.map((report) => ({
        actor: {
          displayName: report.reporter.displayName ?? report.reporter.username,
          id: report.reporter.id,
          username: report.reporter.username,
        },
        body: report.details,
        createdAt: report.createdAt.toISOString(),
        id: `report:${report.id}`,
        kind: "REPORT_ADDED" as const,
        reason: report.reason as string | null,
      })),
      ...eventPageRows
        .filter((event) => event.kind !== "REPORT_ADDED")
        .map((event) => ({
          actor: event.actor
            ? {
                displayName: event.actor.displayName ?? event.actor.username,
                id: event.actor.id,
                username: event.actor.username,
              }
            : null,
          body: event.body,
          createdAt: event.createdAt.toISOString(),
          id: `event:${event.id}`,
          kind: event.kind,
          reason: null,
        })),
    ].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
  };
}
