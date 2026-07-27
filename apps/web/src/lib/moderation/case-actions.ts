import type { ModerationCaseStatus, ModerationEventKind, Prisma } from "@wizards/db";
import { prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { setAdminUserBanState } from "@/lib/admin/management";
import { writeAdminAuditLog } from "@/lib/admin/access";

export type ModerationCaseActionKind = "ban" | "dismiss" | "warn";

type HeaderInput = Headers | Record<string, string | string[] | undefined> | null;

type ModerationCaseRow = {
  id: string;
  publicNumber: number;
  status: ModerationCaseStatus;
  subjectHandle: string;
  subjectId: string | null;
};

export type ModerationCaseActionDependencies = {
  banUser(args: {
    adminUserId: string;
    headers?: HeaderInput;
    reason: string;
    targetUserId: string;
  }): Promise<unknown>;
  /** Conditional update: returns how many rows were still unassigned. */
  claimCase(args: { adminUserId: string; caseId: string; now: Date }): Promise<number>;
  createEvent(args: {
    actorId: string;
    body?: string | null;
    caseId: string;
    kind: ModerationEventKind;
    metadata?: Record<string, unknown>;
  }): Promise<unknown>;
  createNotification(args: {
    body: string;
    dedupeKey: string;
    title: string;
    userId: string;
  }): Promise<unknown>;
  findCase(caseId: string): Promise<ModerationCaseRow | null>;
  listReporterIds(caseId: string): Promise<string[]>;
  resolveCase(args: {
    caseId: string;
    now: Date;
    resolution: string;
    status: ModerationCaseStatus;
  }): Promise<unknown>;
  writeAuditLog(args: {
    action: string;
    adminUserId: string;
    headers?: HeaderInput;
    metadata?: Record<string, unknown> | null;
    reason?: string | null;
    targetId?: string | null;
    targetType?: string | null;
  }): Promise<void>;
};

const RESOLVED_STATUSES = new Set<ModerationCaseStatus>(["ACTIONED", "DISMISSED", "CLOSED"]);

const ACTION_STATUS: Record<ModerationCaseActionKind, ModerationCaseStatus> = {
  ban: "ACTIONED",
  dismiss: "DISMISSED",
  warn: "ACTIONED",
};

/**
 * Reporters learn that their report was handled, never what was decided: the
 * outcome belongs to the subject and the audit trail, not to whoever filed it.
 */
const REPORTER_NOTIFICATION = {
  body: "Bildirdiğin hesapla ilgili inceleme tamamlandı. Teşekkürler.",
  title: "Bildirimin incelendi",
};

export function buildReporterDedupeKey(caseId: string, userId: string) {
  return `modcase:${caseId}:reporter:${userId}`;
}

export function normalizeCaseResolution(resolution: string) {
  const trimmed = resolution.trim();

  if (!trimmed) {
    throw new ApiError("A resolution note is required.", 400, "RESOLUTION_REQUIRED");
  }

  return trimmed.slice(0, 1000);
}

const defaultDependencies: ModerationCaseActionDependencies = {
  banUser: (args) =>
    setAdminUserBanState({
      adminUserId: args.adminUserId,
      banned: true,
      headers: args.headers ?? null,
      reason: args.reason,
      targetUserId: args.targetUserId,
    }),
  claimCase: async (args) => {
    const result = await prisma.moderationCase.updateMany({
      data: {
        assigneeId: args.adminUserId,
        firstSeenAt: args.now,
        status: "IN_REVIEW",
      },
      where: { assigneeId: null, id: args.caseId },
    });

    return result.count;
  },
  createEvent: (args) =>
    prisma.moderationCaseEvent.create({
      data: {
        actorId: args.actorId,
        body: args.body ?? null,
        caseId: args.caseId,
        kind: args.kind,
        ...(args.metadata ? { metadata: args.metadata as Prisma.InputJsonValue } : {}),
      },
    }),
  createNotification: (args) =>
    prisma.notification.create({
      data: {
        body: args.body,
        dedupeKey: args.dedupeKey,
        title: args.title,
        type: "MODERATION",
        userId: args.userId,
      },
    }),
  findCase: (caseId) =>
    prisma.moderationCase.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        publicNumber: true,
        status: true,
        subjectHandle: true,
        subjectId: true,
      },
    }),
  listReporterIds: async (caseId) => {
    const reports = await prisma.userReport.findMany({
      distinct: ["reporterId"],
      where: { caseId },
      select: { reporterId: true },
    });

    return reports.map((report) => report.reporterId);
  },
  resolveCase: (args) =>
    prisma.moderationCase.update({
      data: {
        resolution: args.resolution,
        resolvedAt: args.now,
        status: args.status,
      },
      where: { id: args.caseId },
    }),
  writeAuditLog: (args) => writeAdminAuditLog(args),
};

async function requireCase(caseId: string, dependencies: ModerationCaseActionDependencies) {
  const moderationCase = await dependencies.findCase(caseId);

  if (!moderationCase) {
    throw new ApiError("Case not found.", 404, "NOT_FOUND");
  }

  return moderationCase;
}

/**
 * Claiming is a conditional update rather than a read-then-write: two moderators
 * opening the same case at once must not both believe they own it.
 */
export async function claimModerationCase(
  args: { adminUserId: string; caseId: string; headers?: HeaderInput; now?: Date },
  dependencies: ModerationCaseActionDependencies = defaultDependencies,
) {
  const now = args.now ?? new Date();
  const moderationCase = await requireCase(args.caseId, dependencies);
  const claimedRows = await dependencies.claimCase({
    adminUserId: args.adminUserId,
    caseId: args.caseId,
    now,
  });

  if (claimedRows === 0) {
    throw new ApiError("This case is already claimed.", 409, "CASE_ALREADY_CLAIMED");
  }

  await dependencies.createEvent({
    actorId: args.adminUserId,
    caseId: args.caseId,
    kind: "ASSIGNED",
  });
  await dependencies.writeAuditLog({
    action: "moderation.case.claim",
    adminUserId: args.adminUserId,
    ...(args.headers === undefined ? {} : { headers: args.headers }),
    metadata: { publicNumber: moderationCase.publicNumber },
    targetId: args.caseId,
    targetType: "ModerationCase",
  });

  return { caseId: args.caseId, claimed: true };
}

/** Notes are the case file's working memory: audited, but not a state change. */
export async function addModerationCaseNote(
  args: { adminUserId: string; body: string; caseId: string; headers?: HeaderInput },
  dependencies: ModerationCaseActionDependencies = defaultDependencies,
) {
  const body = args.body.trim();

  if (!body) {
    throw new ApiError("A note cannot be empty.", 400, "NOTE_REQUIRED");
  }

  const moderationCase = await requireCase(args.caseId, dependencies);

  await dependencies.createEvent({
    actorId: args.adminUserId,
    body: body.slice(0, 1000),
    caseId: args.caseId,
    kind: "NOTE",
  });
  await dependencies.writeAuditLog({
    action: "moderation.case.note",
    adminUserId: args.adminUserId,
    ...(args.headers === undefined ? {} : { headers: args.headers }),
    metadata: { publicNumber: moderationCase.publicNumber },
    targetId: args.caseId,
    targetType: "ModerationCase",
  });

  return { caseId: args.caseId };
}

export async function applyModerationCaseAction(
  args: {
    action: ModerationCaseActionKind;
    adminUserId: string;
    caseId: string;
    headers?: HeaderInput;
    now?: Date;
    resolution: string;
  },
  dependencies: ModerationCaseActionDependencies = defaultDependencies,
) {
  const now = args.now ?? new Date();
  const resolution = normalizeCaseResolution(args.resolution);
  const moderationCase = await requireCase(args.caseId, dependencies);

  if (RESOLVED_STATUSES.has(moderationCase.status)) {
    throw new ApiError("This case is already resolved.", 409, "CASE_ALREADY_RESOLVED");
  }

  if (args.action === "ban") {
    if (!moderationCase.subjectId) {
      throw new ApiError("The subject account no longer exists.", 400, "SUBJECT_MISSING");
    }

    await dependencies.banUser({
      adminUserId: args.adminUserId,
      ...(args.headers === undefined ? {} : { headers: args.headers }),
      reason: resolution,
      targetUserId: moderationCase.subjectId,
    });
  }

  if (args.action === "warn" && moderationCase.subjectId) {
    await dependencies.createNotification({
      body: "Topluluk kurallarını gözden geçir: hesabına bir moderasyon uyarısı işlendi.",
      dedupeKey: `modcase:${args.caseId}:subject:warn`,
      title: "Moderasyon uyarısı",
      userId: moderationCase.subjectId,
    });
  }

  const status = ACTION_STATUS[args.action];

  await dependencies.resolveCase({ caseId: args.caseId, now, resolution, status });
  await dependencies.createEvent({
    actorId: args.adminUserId,
    body: resolution,
    caseId: args.caseId,
    kind: "ACTION_TAKEN",
    metadata: { action: args.action },
  });
  await dependencies.writeAuditLog({
    action: "moderation.case.action",
    adminUserId: args.adminUserId,
    ...(args.headers === undefined ? {} : { headers: args.headers }),
    metadata: { action: args.action, publicNumber: moderationCase.publicNumber },
    reason: resolution,
    targetId: args.caseId,
    targetType: "ModerationCase",
  });

  const reporterIds = await dependencies.listReporterIds(args.caseId);

  for (const reporterId of reporterIds) {
    await dependencies.createNotification({
      body: REPORTER_NOTIFICATION.body,
      dedupeKey: buildReporterDedupeKey(args.caseId, reporterId),
      title: REPORTER_NOTIFICATION.title,
      userId: reporterId,
    });
  }

  return { caseId: args.caseId, status };
}
