import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";
import type { AdminAccessUser } from "@/lib/admin/access";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/whispr_test";

const routes = import("./route-logic");

const admin: AdminAccessUser = {
  email: "support@whispr.test",
  id: "support-1",
  role: "SUPPORT",
  username: "support",
};

const detail = {
  appBuild: "42",
  appVersion: "0.8.15",
  body: "Mikrofon bağlanmıyor",
  category: "VOICE" as const,
  createdAt: "2026-07-30T09:00:00.000Z",
  deviceInfo: { modelName: "Pixel" },
  id: "report-1",
  includesDeviceInfo: true,
  includesLogs: true,
  includesScreenshot: true,
  logExcerpt: "Audio device unavailable",
  platform: "android",
  purgeAfter: "2026-10-28T09:00:00.000Z",
  releaseChannel: "uat",
  screenshotUrl: "https://cdn.whispr.test/report-1.png",
  status: "TRIAGED" as const,
  ticket: "WSP-00001",
  user: { displayName: "Ada", id: "user-1", username: "ada" },
};

function request(method: "GET" | "PATCH", body?: unknown) {
  return new Request("https://whispr.test/api/v1/admin/support/reports/report-1", {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json", "user-agent": "node-test" },
    method,
  });
}

const context = { params: Promise.resolve({ reportId: "report-1" }) };
type Dependencies = Parameters<Awaited<typeof routes>["adminSupportReportDetailRoute"]>[2];

function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    authenticateRead: async () => admin,
    enforceRateLimit: async () => undefined,
    get: async () => ({ report: detail }),
    parseBody: parseJsonBody,
    updateStatus: async (_reportId, status) => ({ report: { ...detail, status } }),
    writeAuditLog: async () => undefined,
    ...overrides,
  } as Dependencies;
}

describe("admin support report detail route", () => {
  it("answers 403 before reading for a refused role", async () => {
    const { adminSupportReportDetailRoute } = await routes;
    let read = false;
    const response = await adminSupportReportDetailRoute(
      request("GET"),
      context,
      dependencies({
        authenticateRead: async () => {
          throw new ApiError("Admin access required", 403, "ADMIN_ACCESS_REQUIRED");
        },
        get: async () => {
          read = true;
          return { report: detail };
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.equal(read, false);
  });

  it("returns diagnostics only from the detail handler", async () => {
    const { adminSupportReportDetailRoute } = await routes;
    const response = await adminSupportReportDetailRoute(request("GET"), context, dependencies());
    const payload = await response.json();

    assert.equal(payload.report.logExcerpt, "Audio device unavailable");
    assert.deepEqual(payload.report.deviceInfo, { modelName: "Pixel" });
  });

  it("rejects an invalid status without updating or auditing", async () => {
    const { adminSupportReportStatusRoute } = await routes;
    let updated = false;
    let audited = false;
    const response = await adminSupportReportStatusRoute(
      request("PATCH", { status: "UNKNOWN" }),
      context,
      dependencies({
        updateStatus: async () => {
          updated = true;
          return { report: detail };
        },
        writeAuditLog: async () => {
          audited = true;
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(updated, false);
    assert.equal(audited, false);
  });

  it("changes status and writes an audit entry", async () => {
    const { adminSupportReportStatusRoute } = await routes;
    const audit: unknown[] = [];
    const response = await adminSupportReportStatusRoute(
      request("PATCH", { status: "RESOLVED" }),
      context,
      dependencies({
        writeAuditLog: async (entry) => {
          audit.push(entry);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.equal((audit[0] as { action: string }).action, "admin.support.report.status");
    assert.deepEqual((audit[0] as { metadata: unknown }).metadata, { status: "RESOLVED" });
  });
});
