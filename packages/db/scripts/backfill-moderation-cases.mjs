// One-time D1 migration companion. Run only after the moderation_cases migration:
//   MODERATION_BACKFILL_CONFIRM=backfill-moderation-cases node --import tsx scripts/backfill-moderation-cases.mjs
// It never touches reports already linked to a case, so re-running it is safe.
import { createPrismaClient } from "../src/client-factory.js";

const confirmation = "backfill-moderation-cases";

function derivePriority(reports) {
  const distinctReporters = new Set(reports.map((report) => report.reporterId)).size;
  const containsImpersonation = reports.some((report) => report.reason === "IMPERSONATION");

  return reports.length >= 5 || distinctReporters >= 3 || containsImpersonation ? "HIGH" : "NORMAL";
}

function groupBySubject(reports) {
  const groups = new Map();

  for (const report of reports) {
    const group = groups.get(report.subjectId) ?? [];
    group.push(report);
    groups.set(report.subjectId, group);
  }

  return groups;
}

async function main() {
  if (process.env.MODERATION_BACKFILL_CONFIRM !== confirmation) {
    throw new Error(
      `Set MODERATION_BACKFILL_CONFIRM=${confirmation} before writing moderation cases.`,
    );
  }

  const prisma = createPrismaClient();
  try {
    const unassignedReports = await prisma.userReport.findMany({
      where: { caseId: null },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        id: true,
        reason: true,
        reporterId: true,
        subject: { select: { username: true } },
        subjectId: true,
      },
    });
    const groups = groupBySubject(unassignedReports);
    let createdCount = 0;

    for (const [subjectId, reports] of groups) {
      const created = await prisma.$transaction(async (transaction) => {
        const createdCase = await transaction.moderationCase.create({
          data: {
            firstSeenAt: null,
            openedAt: reports[0].createdAt,
            priority: derivePriority(reports),
            reportCount: reports.length,
            status: "OPEN",
            subjectHandle: reports[0].subject.username,
            subjectId,
          },
        });

        await transaction.userReport.updateMany({
          data: { caseId: createdCase.id },
          where: { caseId: null, id: { in: reports.map((report) => report.id) } },
        });
        await transaction.moderationCaseEvent.create({
          data: {
            caseId: createdCase.id,
            kind: "REPORT_ADDED",
            metadata: { backfilled: true },
          },
        });

        return createdCase.id;
      });

      createdCount += 1;
      console.info(`Created ${created} from ${reports.length} report(s).`);
    }

    console.info(`Moderation backfill complete: ${createdCount} case(s) created.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
