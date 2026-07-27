import { prisma, type ModerationCasePriority, type UserReportReason } from "@wizards/db";

const activeCaseStatuses = ["OPEN", "IN_REVIEW", "APPEALED"] as const;

type CaseRecord = {
  id: string;
  priority: ModerationCasePriority;
  reportCount: number;
};

type CaseReport = {
  reporterId: string;
};

export type ModerationCaseStore = {
  $transaction<T>(operation: (transaction: ModerationCaseStore) => Promise<T>): Promise<T>;
  moderationCase: {
    create(args: {
      data: {
        priority: ModerationCasePriority;
        reportCount: number;
        subjectHandle: string;
        subjectId: string;
      };
    }): Promise<CaseRecord>;
    findFirst(args: {
      where: {
        status: { in: readonly (typeof activeCaseStatuses)[number][] };
        subjectId: string;
      };
    }): Promise<CaseRecord | null>;
    update(args: {
      data: { priority: ModerationCasePriority; reportCount: number };
      where: { id: string };
    }): Promise<CaseRecord>;
  };
  moderationCaseEvent: {
    create(args: {
      data: {
        caseId: string;
        kind: "REPORT_ADDED";
        metadata: { reason: UserReportReason; reportId: string };
      };
    }): Promise<unknown>;
  };
  user: {
    findUnique(args: { select: { username: true }; where: { id: string } }): Promise<{
      username: string;
    } | null>;
  };
  userReport: {
    findMany(args: {
      select: { reporterId: true };
      where: { caseId: string };
    }): Promise<CaseReport[]>;
    findUnique(args: {
      select: { reporterId: true };
      where: { id: string };
    }): Promise<CaseReport | null>;
    update(args: { data: { caseId: string }; where: { id: string } }): Promise<unknown>;
  };
};

export type ModerationReportInput = {
  id: string;
  reason: UserReportReason;
  subjectId: string;
};

export function deriveCasePriority(input: {
  distinctReporters: number;
  overridden: boolean;
  reason: UserReportReason;
  reportCount: number;
}): ModerationCasePriority {
  if (input.overridden) {
    return "NORMAL";
  }

  if (input.reportCount >= 5 || input.distinctReporters >= 3 || input.reason === "IMPERSONATION") {
    return "HIGH";
  }

  return "NORMAL";
}

export async function attachReportToCaseInTransaction(
  transaction: ModerationCaseStore,
  report: ModerationReportInput,
): Promise<{ caseId: string; created: boolean }> {
  const [subject, submittedReport] = await Promise.all([
    transaction.user.findUnique({
      select: { username: true },
      where: { id: report.subjectId },
    }),
    transaction.userReport.findUnique({
      select: { reporterId: true },
      where: { id: report.id },
    }),
  ]);

  if (!subject || !submittedReport) {
    throw new Error("A moderation case can only be attached to an existing report subject.");
  }

  const existingCase = await transaction.moderationCase.findFirst({
    where: {
      status: { in: activeCaseStatuses },
      subjectId: report.subjectId,
    },
  });

  if (!existingCase) {
    const priority = deriveCasePriority({
      distinctReporters: 1,
      overridden: false,
      reason: report.reason,
      reportCount: 1,
    });
    const createdCase = await transaction.moderationCase.create({
      data: {
        priority,
        reportCount: 1,
        subjectHandle: subject.username,
        subjectId: report.subjectId,
      },
    });

    await transaction.userReport.update({
      data: { caseId: createdCase.id },
      where: { id: report.id },
    });
    await transaction.moderationCaseEvent.create({
      data: {
        caseId: createdCase.id,
        kind: "REPORT_ADDED",
        metadata: { reason: report.reason, reportId: report.id },
      },
    });

    return { caseId: createdCase.id, created: true };
  }

  const existingReports = await transaction.userReport.findMany({
    select: { reporterId: true },
    where: { caseId: existingCase.id },
  });
  const reportCount = existingCase.reportCount + 1;
  const distinctReporters = new Set([
    submittedReport.reporterId,
    ...existingReports.map((existingReport) => existingReport.reporterId),
  ]).size;
  const priority = deriveCasePriority({
    distinctReporters,
    overridden: false,
    reason: report.reason,
    reportCount,
  });

  await transaction.moderationCase.update({
    data: { priority, reportCount },
    where: { id: existingCase.id },
  });
  await transaction.userReport.update({
    data: { caseId: existingCase.id },
    where: { id: report.id },
  });
  await transaction.moderationCaseEvent.create({
    data: {
      caseId: existingCase.id,
      kind: "REPORT_ADDED",
      metadata: { reason: report.reason, reportId: report.id },
    },
  });

  return { caseId: existingCase.id, created: false };
}

export function createModerationCaseService(dependencies: { client: ModerationCaseStore }) {
  return {
    attachReportToCase(report: ModerationReportInput) {
      return dependencies.client.$transaction((transaction) =>
        attachReportToCaseInTransaction(transaction, report),
      );
    },
  };
}

export async function attachReportToCase(
  report: ModerationReportInput,
): Promise<{ caseId: string; created: boolean }> {
  return prisma.$transaction((transaction) =>
    attachReportToCaseInTransaction(transaction as unknown as ModerationCaseStore, report),
  );
}
