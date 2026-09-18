import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import type { AdminAccessUser } from "@/lib/admin/access";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/whispr_test";

const routes = import("./route-logic");

const admin: AdminAccessUser = {
  email: "admin@whispr.test",
  id: "admin-1",
  role: "ADMIN",
  username: "admin",
};

const request = new Request("https://whispr.test/api/v1/admin/releases/release-1/publish", {
  method: "POST",
});
const context = { params: Promise.resolve({ releaseId: "release-1" }) };
const publishedRelease = {
  product: "MOBILE" as const,
  active: true,
  withdrawnAt: null,
  sourceSha: null,
  sourceRunId: null,
  sourceRunUrl: null,
  managed: false,
  packages: [],
  buildNumber: null,
  changeCount: 0,
  changes: [],
  channel: "STABLE" as const,
  codename: null,
  createdAt: "2026-07-30T09:00:00.000Z",
  highlight: null,
  id: "release-1",
  mandatory: false,
  publishedAt: "2026-07-30T10:00:00.000Z",
  releasedAt: "2026-07-30T09:00:00.000Z",
  sizeBytes: null,
  summary: null,
  updatedAt: "2026-07-30T10:00:00.000Z",
  version: "0.8.15",
};
type Dependencies = Parameters<Awaited<typeof routes>["adminReleasePublishRoute"]>[2];

function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    authenticateWrite: async () => admin,
    enforceRateLimit: async () => undefined,
    publish: async () => ({ release: publishedRelease }),
    writeAuditLog: async () => undefined,
    ...overrides,
  } as Dependencies;
}

describe("admin release publish route", () => {
  it("answers 403 before publishing for a refused role", async () => {
    const { adminReleasePublishRoute } = await routes;
    let published = false;
    const response = await adminReleasePublishRoute(
      request,
      context,
      dependencies({
        authenticateWrite: async () => {
          throw new ApiError("Admin access required", 403, "ADMIN_ACCESS_REQUIRED");
        },
        publish: async () => {
          published = true;
          return { release: { ...publishedRelease, publishedAt: null } };
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.equal(published, false);
  });

  it("publishes through the dedicated action and audits it", async () => {
    const { adminReleasePublishRoute } = await routes;
    const audit: unknown[] = [];
    const response = await adminReleasePublishRoute(
      request,
      context,
      dependencies({
        writeAuditLog: async (entry) => {
          audit.push(entry);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.equal((await response.json()).release.publishedAt, "2026-07-30T10:00:00.000Z");
    assert.equal((audit[0] as { action: string }).action, "admin.release.publish");
    assert.equal((audit[0] as { targetId: string }).targetId, "release-1");
  });
});
