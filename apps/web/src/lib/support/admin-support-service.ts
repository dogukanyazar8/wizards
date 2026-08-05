import { prisma, type BugReportStatus, type Prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { onBugReportResolved } from "@/lib/badges/badge-triggers";

const adminBugReportListSelect = {
  appVersion: true,
  category: true,
  createdAt: true,
  id: true,
  includesDeviceInfo: true,
  includesLogs: true,
  includesScreenshot: true,
  platform: true,
  purgeAfter: true,
  status: true,
  ticket: true,
  user: { select: { displayName: true, id: true, username: true } },
} satisfies Prisma.BugReportSelect;

const adminBugReportDetailSelect = {
  ...adminBugReportListSelect,
  appBuild: true,
  body: true,
  deviceInfo: true,
  logExcerpt: true,
  releaseChannel: true,
  screenshotUrl: true,
} satisfies Prisma.BugReportSelect;

type AdminBugReportListRow = Prisma.BugReportGetPayload<{
  select: typeof adminBugReportListSelect;
}>;
type AdminBugReportDetailRow = Prisma.BugReportGetPayload<{
  select: typeof adminBugReportDetailSelect;
}>;

function toAdminBugReportListItem(row: AdminBugReportListRow) {
  return {
    appVersion: row.appVersion,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    includesDeviceInfo: row.includesDeviceInfo,
    includesLogs: row.includesLogs,
    includesScreenshot: row.includesScreenshot,
    platform: row.platform,
    purgeAfter: row.purgeAfter.toISOString(),
    status: row.status,
    ticket: row.ticket,
    user: row.user,
  };
}

function toAdminBugReportDetail(row: AdminBugReportDetailRow) {
  return {
    ...toAdminBugReportListItem(row),
    appBuild: row.appBuild,
    body: row.body,
    deviceInfo: row.deviceInfo,
    logExcerpt: row.logExcerpt,
    releaseChannel: row.releaseChannel,
    screenshotUrl: row.screenshotUrl,
  };
}

export type ListAdminBugReportsDependencies = {
  findReports(): Promise<AdminBugReportListRow[]>;
};

const listDependencies: ListAdminBugReportsDependencies = {
  findReports: () =>
    prisma.bugReport.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: adminBugReportListSelect,
      take: 200,
    }),
};

export async function listAdminBugReports(
  dependencies: ListAdminBugReportsDependencies = listDependencies,
) {
  const rows = await dependencies.findReports();

  return { reports: rows.map(toAdminBugReportListItem) };
}

export async function getAdminBugReport(reportId: string) {
  const row = await prisma.bugReport.findUnique({
    select: adminBugReportDetailSelect,
    where: { id: reportId },
  });

  if (!row) {
    throw new ApiError("Bug report not found", 404, "BUG_REPORT_NOT_FOUND");
  }

  return { report: toAdminBugReportDetail(row) };
}

const BUG_REPORT_STATUS_TRANSITIONS: Record<BugReportStatus, readonly BugReportStatus[]> = {
  DISCARDED: [],
  OPEN: ["TRIAGED"],
  RESOLVED: [],
  TRIAGED: ["RESOLVED", "DISCARDED"],
};

export type UpdateAdminBugReportStatusDependencies = {
  findStatus(reportId: string): Promise<{ status: BugReportStatus } | null>;
  updateStatus(
    reportId: string,
    status: BugReportStatus,
  ): Promise<{ report: ReturnType<typeof toAdminBugReportDetail> }>;
};

const updateDependencies: UpdateAdminBugReportStatusDependencies = {
  findStatus: (reportId) =>
    prisma.bugReport.findUnique({ select: { status: true }, where: { id: reportId } }),
  updateStatus: async (reportId, status) => {
    const row = await prisma.bugReport.update({
      data: { status },
      select: adminBugReportDetailSelect,
      where: { id: reportId },
    });

    return { report: toAdminBugReportDetail(row) };
  },
};

export async function updateAdminBugReportStatus(
  reportId: string,
  status: BugReportStatus,
  dependencies: UpdateAdminBugReportStatusDependencies = updateDependencies,
) {
  const existing = await dependencies.findStatus(reportId);

  if (!existing) {
    throw new ApiError("Bug report not found", 404, "BUG_REPORT_NOT_FOUND");
  }

  if (!BUG_REPORT_STATUS_TRANSITIONS[existing.status].includes(status)) {
    throw new ApiError(
      `Bug report cannot move from ${existing.status} to ${status}`,
      409,
      "BUG_REPORT_STATUS_TRANSITION_INVALID",
    );
  }

  const result = await dependencies.updateStatus(reportId, status);

  // Only a fixed report earns the badge; TRIAGED and DISCARDED do not. An
  // anonymous report has no reporter to credit.
  if (status === "RESOLVED" && result.report.user) {
    await onBugReportResolved({ userId: result.report.user.id });
  }

  return result;
}
