import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";
import type { AdminAccessUser } from "@/lib/admin/access";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/whispr_test";

const routes = import("./route-logic");

const admin: AdminAccessUser = {
  email: "admin@whispr.test",
  id: "admin-1",
  role: "ADMIN",
  username: "admin",
};

const release = {
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
  updatedAt: "2026-07-30T09:00:00.000Z",
  version: "0.8.15",
};

function request(method: "DELETE" | "GET" | "PATCH", body?: unknown) {
  return new Request("https://whispr.test/api/v1/admin/releases/release-1", {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json", "user-agent": "node-test" },
    method,
  });
}

const context = { params: Promise.resolve({ releaseId: "release-1" }) };
type Dependencies = Parameters<Awaited<typeof routes>["adminReleaseDetailRoute"]>[2];

function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    authenticateRead: async () => admin,
    authenticateWrite: async () => admin,
    delete: async () => ({ deleted: true }),
    enforceRateLimit: async () => undefined,
    get: async () => ({ release }),
    parseBody: parseJsonBody,
    update: async () => ({ release }),
    writeAuditLog: async () => undefined,
    ...overrides,
  } as Dependencies;
}

describe("admin release detail route", () => {
  it("answers 403 before reading for a refused role", async () => {
    const { adminReleaseDetailRoute } = await routes;
    let read = false;
    const response = await adminReleaseDetailRoute(
      request("GET"),
      context,
      dependencies({
        authenticateRead: async () => {
          throw new ApiError("Admin access required", 403, "ADMIN_ACCESS_REQUIRED");
        },
        get: async () => {
          read = true;
          return { release };
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.equal(read, false);
  });

  it("rejects an empty patch without updating or auditing", async () => {
    const { adminReleaseUpdateRoute } = await routes;
    let updated = false;
    let audited = false;
    const response = await adminReleaseUpdateRoute(
      request("PATCH", {}),
      context,
      dependencies({
        update: async () => {
          updated = true;
          return { release };
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

  it("preserves the service 409 when a published version is changed", async () => {
    const { adminReleaseUpdateRoute } = await routes;
    let audited = false;
    const response = await adminReleaseUpdateRoute(
      request("PATCH", { version: "0.9.0" }),
      context,
      dependencies({
        update: async () => {
          throw new ApiError(
            "Published release version cannot be changed",
            409,
            "PUBLISHED_RELEASE_VERSION_IMMUTABLE",
          );
        },
        writeAuditLog: async () => {
          audited = true;
        },
      }),
    );

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      code: "PUBLISHED_RELEASE_VERSION_IMMUTABLE",
      error: "Published release version cannot be changed",
    });
    assert.equal(audited, false);
  });

  it("audits a successful patch", async () => {
    const { adminReleaseUpdateRoute } = await routes;
    const audit: unknown[] = [];
    const response = await adminReleaseUpdateRoute(
      request("PATCH", { summary: "Yeni özet" }),
      context,
      dependencies({
        writeAuditLog: async (entry) => {
          audit.push(entry);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.equal((audit[0] as { action: string }).action, "admin.release.update");
    assert.deepEqual((audit[0] as { metadata: unknown }).metadata, { fields: ["summary"] });
  });

  it("audits deletion", async () => {
    const { adminReleaseDeleteRoute } = await routes;
    const audit: unknown[] = [];
    const response = await adminReleaseDeleteRoute(
      request("DELETE"),
      context,
      dependencies({
        writeAuditLog: async (entry) => {
          audit.push(entry);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.equal((audit[0] as { action: string }).action, "admin.release.delete");
    assert.equal((audit[0] as { targetId: string }).targetId, "release-1");
  });
});
