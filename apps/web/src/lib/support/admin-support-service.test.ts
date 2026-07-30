import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/whispr_test";

const service = import("./admin-support-service");

const row = {
  appVersion: "0.8.15",
  category: "VOICE" as const,
  createdAt: new Date("2026-07-30T09:00:00.000Z"),
  id: "report-1",
  includesDeviceInfo: true,
  includesLogs: true,
  includesScreenshot: true,
  platform: "android",
  purgeAfter: new Date("2026-10-28T09:00:00.000Z"),
  status: "OPEN" as const,
  ticket: "WSP-00001",
  user: { displayName: "Ada", id: "user-1", username: "ada" },
};

describe("admin support service", () => {
  it("never includes logExcerpt or deviceInfo in list results", async () => {
    const { listAdminBugReports } = await service;
    const result = await listAdminBugReports({
      findReports: async () => [
        {
          ...row,
          deviceInfo: { model: "secret-model" },
          logExcerpt: "secret-log",
        },
      ],
    });

    assert.equal("logExcerpt" in result.reports[0]!, false);
    assert.equal("deviceInfo" in result.reports[0]!, false);
    assert.equal(result.reports[0]?.ticket, "WSP-00001");
  });

  it("rejects skipping triage when resolving an open report", async () => {
    const { updateAdminBugReportStatus } = await service;
    let updated = false;

    await assert.rejects(
      () =>
        updateAdminBugReportStatus("report-1", "RESOLVED", {
          findStatus: async () => ({ status: "OPEN" }),
          updateStatus: async () => {
            updated = true;
            throw new Error("must not update");
          },
        }),
      (error: unknown) =>
        error instanceof Error &&
        "status" in error &&
        error.status === 409 &&
        "code" in error &&
        error.code === "BUG_REPORT_STATUS_TRANSITION_INVALID",
    );

    assert.equal(updated, false);
  });
});
