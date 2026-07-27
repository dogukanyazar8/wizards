import type { Prisma, PrismaClient } from "@wizards/db";
import { prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";

const MOBILE_QUEUE_LIMIT = 20;
const PREVIEW_LENGTH = 200;

export type MobileCaseStore = Pick<
  PrismaClient,
  "moderationCase" | "moderationCaseEvent" | "moderationEvidence"
>;

/**
 * The mobile queue is deliberately unfiltered: a phone is for triage, so it
 * shows the loudest open cases and nothing to configure.
 */
export async function listMobileAdminCases(client: MobileCaseStore = prisma) {
  const cases = await client.moderationCase.findMany({
    orderBy: [{ priority: "desc" }, { openedAt: "asc" }],
    take: MOBILE_QUEUE_LIMIT,
    where: { status: { in: ["OPEN", "IN_REVIEW", "APPEALED"] } },
    select: {
      assignee: { select: { username: true } },
      id: true,
      openedAt: true,
      priority: true,
      publicNumber: true,
      reportCount: true,
      status: true,
      subjectHandle: true,
    },
  });

  return cases.map((moderationCase) => ({
    assigneeHandle: moderationCase.assignee?.username ?? null,
    caseId: moderationCase.id,
    openedAt: moderationCase.openedAt.toISOString(),
    priority: moderationCase.priority,
    publicNumber: moderationCase.publicNumber,
    reportCount: moderationCase.reportCount,
    status: moderationCase.status,
    subjectHandle: moderationCase.subjectHandle,
  }));
}

export async function getMobileAdminCase(caseId: string, client: MobileCaseStore = prisma) {
  const moderationCase = await client.moderationCase.findUnique({
    where: { id: caseId },
    select: {
      assignee: { select: { username: true } },
      evidence: {
        orderBy: { capturedAt: "asc" },
        take: 5,
        select: { id: true, snapshot: true },
      },
      id: true,
      openedAt: true,
      priority: true,
      publicNumber: true,
      reportCount: true,
      reports: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { createdAt: true, details: true, id: true, reason: true },
      },
      status: true,
      subjectHandle: true,
    },
  });

  if (!moderationCase) {
    throw new ApiError("Case not found.", 404, "NOT_FOUND");
  }

  return {
    assigneeHandle: moderationCase.assignee?.username ?? null,
    caseId: moderationCase.id,
    evidence: moderationCase.evidence.map((entry) => {
      const snapshot = entry.snapshot as { content?: string; scope?: string } | null;

      return {
        evidenceId: entry.id,
        preview: (snapshot?.content ?? "").slice(0, PREVIEW_LENGTH),
        scope: snapshot?.scope ?? null,
      };
    }),
    openedAt: moderationCase.openedAt.toISOString(),
    priority: moderationCase.priority,
    publicNumber: moderationCase.publicNumber,
    reportCount: moderationCase.reportCount,
    reports: moderationCase.reports.map((report) => ({
      createdAt: report.createdAt.toISOString(),
      details: report.details,
      reason: report.reason,
      reportId: report.id,
    })),
    status: moderationCase.status,
    subjectHandle: moderationCase.subjectHandle,
  };
}

/**
 * Escalation is the mobile answer to "this needs a real decision": it raises
 * the priority and leaves a note for whoever opens the desktop console.
 */
export async function escalateMobileAdminCase(
  args: { adminUserId: string; caseId: string; note?: string | undefined },
  client: MobileCaseStore = prisma,
) {
  const moderationCase = await client.moderationCase.findUnique({
    where: { id: args.caseId },
    select: { id: true, priority: true },
  });

  if (!moderationCase) {
    throw new ApiError("Case not found.", 404, "NOT_FOUND");
  }

  await client.moderationCase.update({
    data: { priority: "URGENT" },
    where: { id: args.caseId },
  });
  await client.moderationCaseEvent.create({
    data: {
      actorId: args.adminUserId,
      body: args.note?.trim().slice(0, 1000) ?? "Masaüstünde karar bekliyor.",
      caseId: args.caseId,
      kind: "NOTE",
      metadata: {
        escalatedFrom: moderationCase.priority,
        surface: "mobile",
      } as Prisma.InputJsonValue,
    },
  });

  return { caseId: args.caseId, priority: "URGENT" as const };
}
