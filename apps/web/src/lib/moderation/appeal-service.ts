import type { Prisma, PrismaClient } from "@wizards/db";
import { prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";

export const APPEAL_MAX_LENGTH = 1000;

export type AppealStore = Pick<PrismaClient, "moderationCase" | "moderationCaseEvent">;

/**
 * An appeal is not a new queue: it moves the banned person's own case back to
 * `APPEALED`, where the same filter chips surface it.
 */
export async function openModerationAppeal(
  args: { body: string; now?: Date; userId: string },
  client: AppealStore = prisma,
) {
  const body = args.body.trim();

  if (!body) {
    throw new ApiError("An appeal needs a message.", 400, "APPEAL_BODY_REQUIRED");
  }

  const moderationCase = await client.moderationCase.findFirst({
    orderBy: { resolvedAt: "desc" },
    where: { status: "ACTIONED", subjectId: args.userId },
    select: { id: true, publicNumber: true },
  });

  if (!moderationCase) {
    throw new ApiError("There is no decision to appeal.", 404, "NO_ACTIONED_CASE");
  }

  const existing = await client.moderationCaseEvent.findFirst({
    where: { caseId: moderationCase.id, kind: "APPEAL_OPENED" },
    select: { id: true },
  });

  if (existing) {
    throw new ApiError("This decision was already appealed.", 409, "APPEAL_EXISTS");
  }

  await client.moderationCase.update({
    data: { status: "APPEALED" },
    where: { id: moderationCase.id },
  });
  await client.moderationCaseEvent.create({
    data: {
      actorId: args.userId,
      body: body.slice(0, APPEAL_MAX_LENGTH),
      caseId: moderationCase.id,
      kind: "APPEAL_OPENED",
    },
  });

  return { caseId: moderationCase.id, publicNumber: moderationCase.publicNumber };
}

export type AppealResolution = "granted" | "rejected";

/**
 * Resolving an appeal returns the case to a decided state: granting reopens it
 * as dismissed, rejecting restores the original action.
 */
export async function resolveModerationAppeal(
  args: {
    adminUserId: string;
    caseId: string;
    note: string;
    now?: Date;
    resolution: AppealResolution;
  },
  client: AppealStore = prisma,
) {
  const now = args.now ?? new Date();
  const note = args.note.trim();

  if (!note) {
    throw new ApiError("An appeal decision needs a note.", 400, "NOTE_REQUIRED");
  }

  const moderationCase = await client.moderationCase.findUnique({
    where: { id: args.caseId },
    select: { id: true, status: true },
  });

  if (!moderationCase) {
    throw new ApiError("Case not found.", 404, "NOT_FOUND");
  }

  if (moderationCase.status !== "APPEALED") {
    throw new ApiError("This case has no open appeal.", 409, "NO_OPEN_APPEAL");
  }

  const status = args.resolution === "granted" ? "DISMISSED" : "ACTIONED";

  await client.moderationCase.update({
    data: { resolution: note.slice(0, 1000), resolvedAt: now, status },
    where: { id: args.caseId },
  });
  await client.moderationCaseEvent.create({
    data: {
      actorId: args.adminUserId,
      body: note.slice(0, 1000),
      caseId: args.caseId,
      kind: "APPEAL_RESOLVED",
      metadata: { resolution: args.resolution } as Prisma.InputJsonValue,
    },
  });

  return { caseId: args.caseId, status };
}
