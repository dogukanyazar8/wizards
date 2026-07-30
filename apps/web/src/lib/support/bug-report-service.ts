import { prisma, type BugReportCategory, type Prisma } from "@wizards/db";
import {
  MOBILE_BUG_REPORT_LOG_MAX_LINES,
  MobileBugReportResponseSchema,
  formatBugReportTicket,
  type MobileBugReportCategory,
  type MobileBugReportRequest,
  type MobileBugReportResponse,
} from "@wizards/types";

import { ApiError } from "@/lib/api";

/**
 * 2f "Sorun bildir".
 *
 * The screen makes two promises in writing and both are kept here rather than
 * in the UI: only the attachments the user left checked are stored, and the row
 * carries the date it deletes itself on.
 */

/** §4.10: "90 gün sonra silinir". */
export const BUG_REPORT_RETENTION_DAYS = 90;
/** A `WSP-#####` collision is a five-digit birthday problem, not an outage. */
export const BUG_REPORT_TICKET_ATTEMPTS = 8;
const BUG_REPORT_TICKET_RANGE = 100_000;

const BUG_REPORT_CATEGORY_FROM_WIRE: Record<MobileBugReportCategory, BugReportCategory> = {
  voice: "VOICE",
  chat: "CHAT",
  notification: "NOTIFICATION",
  performance: "PERFORMANCE",
  other: "OTHER",
};

export function toBugReportCategoryColumn(category: MobileBugReportCategory): BugReportCategory {
  return BUG_REPORT_CATEGORY_FROM_WIRE[category];
}

/**
 * Keeps the *last* 500 lines. A crash is at the end of a log, so trimming from
 * the front is what preserves the part that explains the report.
 */
export function trimBugReportLog(logExcerpt: string): string {
  const lines = logExcerpt.split("\n");

  return lines.length <= MOBILE_BUG_REPORT_LOG_MAX_LINES
    ? logExcerpt
    : lines.slice(-MOBILE_BUG_REPORT_LOG_MAX_LINES).join("\n");
}

export function resolveBugReportPurgeDate(createdAt: Date): Date {
  const purgeAfter = new Date(createdAt.getTime());
  purgeAfter.setUTCDate(purgeAfter.getUTCDate() + BUG_REPORT_RETENTION_DAYS);

  return purgeAfter;
}

export type SubmitMobileBugReportInput = MobileBugReportRequest & {
  screenshotUrl?: string | null;
  userId?: string | null;
};

export type MobileBugReportServiceDependencies = {
  createBugReport: (data: Prisma.BugReportUncheckedCreateInput) => Promise<{ createdAt: Date }>;
  deleteExpiredBugReports: (before: Date) => Promise<{ count: number }>;
  isUniqueTicketViolation: (error: unknown) => boolean;
  now: () => Date;
  randomTicketSequence: () => number;
};

/**
 * `P2002` on the ticket index. Matched structurally rather than with
 * `instanceof PrismaClientKnownRequestError` so the retry can be exercised
 * without a database.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

const defaultDependencies: MobileBugReportServiceDependencies = {
  createBugReport: (data) => prisma.bugReport.create({ data, select: { createdAt: true } }),
  deleteExpiredBugReports: (before) =>
    prisma.bugReport.deleteMany({ where: { purgeAfter: { lt: before } } }),
  isUniqueTicketViolation: isUniqueConstraintError,
  now: () => new Date(),
  randomTicketSequence: () => Math.floor(Math.random() * BUG_REPORT_TICKET_RANGE),
};

export async function submitMobileBugReport(
  input: SubmitMobileBugReportInput,
  dependencies: MobileBugReportServiceDependencies = defaultDependencies,
): Promise<MobileBugReportResponse> {
  const createdAt = dependencies.now();
  const purgeAfter = resolveBugReportPurgeDate(createdAt);

  const attachments = {
    // Each toggle gates its own column. Unchecking "cihaz bilgisi" has to mean
    // the row has no device details, not that the screen hid them.
    ...(input.includesDeviceInfo && input.deviceInfo
      ? { deviceInfo: input.deviceInfo as Prisma.InputJsonValue }
      : {}),
    logExcerpt: input.includesLogs && input.logExcerpt ? trimBugReportLog(input.logExcerpt) : null,
    screenshotUrl: input.includesScreenshot
      ? (input.screenshotUrl ?? input.screenshotUploadKey ?? null)
      : null,
  };

  for (let attempt = 0; attempt < BUG_REPORT_TICKET_ATTEMPTS; attempt += 1) {
    const ticket = formatBugReportTicket(dependencies.randomTicketSequence());

    try {
      const row = await dependencies.createBugReport({
        appBuild: input.appBuild ?? null,
        appVersion: input.appVersion ?? null,
        body: input.body,
        category: toBugReportCategoryColumn(input.category),
        createdAt,
        includesDeviceInfo: input.includesDeviceInfo,
        includesLogs: input.includesLogs,
        includesScreenshot: input.includesScreenshot,
        platform: input.platform ?? null,
        purgeAfter,
        releaseChannel: input.releaseChannel ?? null,
        ticket,
        userId: input.userId ?? null,
        ...attachments,
      });

      return MobileBugReportResponseSchema.parse({
        createdAt: row.createdAt.toISOString(),
        ticket,
      });
    } catch (error) {
      if (!dependencies.isUniqueTicketViolation(error)) {
        throw error;
      }
      // Ticket taken; draw another one.
    }
  }

  throw new ApiError(
    "Could not allocate a report number. Please try again shortly.",
    503,
    "BUG_REPORT_TICKET_UNAVAILABLE",
  );
}

/**
 * The other half of the 90-day promise. There is no shared maintenance runner in
 * this app yet, so this stays a callable function: whatever schedules it later
 * calls this rather than reimplementing the window.
 */
export async function purgeExpiredBugReports(
  dependencies: MobileBugReportServiceDependencies = defaultDependencies,
): Promise<{ deleted: number }> {
  const { count } = await dependencies.deleteExpiredBugReports(dependencies.now());

  return { deleted: count };
}
