import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import type { AdminAccessUser } from "@/lib/admin/access";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/whispr_test";

const routes = import("./route-logic");

const admin: AdminAccessUser = {
  email: "support@whispr.test",
  id: "support-1",
  role: "SUPPORT",
  username: "support",
};

const report = {
  appVersion: "0.8.15",
  category: "VOICE" as const,
  createdAt: "2026-07-30T09:00:00.000Z",
  id: "report-1",
  includesDeviceInfo: true,
  includesLogs: true,
  includesScreenshot: true,
  platform: "android",
  purgeAfter: "2026-10-28T09:00:00.000Z",
  status: "OPEN" as const,
  ticket: "WSP-00001",
  user: { displayName: "Ada", id: "user-1", username: "ada" },
};

const request = new Request("https://whispr.test/api/v1/admin/support/reports");
type Dependencies = Parameters<Awaited<typeof routes>["adminSupportReportListRoute"]>[1];

function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    authenticateRead: async () => admin,
    enforceRateLimit: async () => undefined,
    list: async () => ({ reports: [report] }),
    ...overrides,
  } as Dependencies;
}

describe("admin support report collection route", () => {
  it("answers 403 before listing for a refused role", async () => {
    const { adminSupportReportListRoute } = await routes;
    let listed = false;
    const response = await adminSupportReportListRoute(
      request,
      dependencies({
        authenticateRead: async () => {
          throw new ApiError("Admin access required", 403, "ADMIN_ACCESS_REQUIRED");
        },
        list: async () => {
          listed = true;
          return { reports: [] };
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.equal(listed, false);
  });

  it("returns the queue with no-store caching", async () => {
    const { adminSupportReportListRoute } = await routes;
    const response = await adminSupportReportListRoute(request, dependencies());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate");
    assert.equal((await response.json()).reports[0].ticket, "WSP-00001");
  });
});
