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
  buildNumber: null,
  changeCount: 0,
  changes: [],
  channel: "STABLE" as const,
  codename: null,
  createdAt: "2026-07-30T09:00:00.000Z",
  highlight: null,
  id: "release-1",
  mandatory: false,
  publishedAt: null,
  releasedAt: "2026-07-30T09:00:00.000Z",
  sizeBytes: null,
  summary: null,
  updatedAt: "2026-07-30T09:00:00.000Z",
  version: "0.8.15",
};

const validInput = {
  channel: "STABLE",
  mandatory: false,
  releasedAt: "2026-07-30T09:00:00.000Z",
  version: "0.8.15",
};

function request(method: "GET" | "POST", body?: unknown) {
  return new Request("https://whispr.test/api/v1/admin/releases", {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json", "user-agent": "node-test" },
    method,
  });
}

type Dependencies = Parameters<Awaited<typeof routes>["adminReleaseListRoute"]>[1];

function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    authenticateRead: async () => admin,
    authenticateWrite: async () => admin,
    create: async () => ({ release }),
    enforceRateLimit: async () => undefined,
    list: async () => ({ releases: [release] }),
    parseBody: parseJsonBody,
    writeAuditLog: async () => undefined,
    ...overrides,
  } as Dependencies;
}

describe("admin releases collection route", () => {
  it("answers 403 before listing for a refused role", async () => {
    const { adminReleaseListRoute } = await routes;
    let listed = false;
    const response = await adminReleaseListRoute(
      request("GET"),
      dependencies({
        authenticateRead: async () => {
          throw new ApiError("Admin access required", 403, "ADMIN_ACCESS_REQUIRED");
        },
        list: async () => {
          listed = true;
          return { releases: [] };
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.equal(listed, false);
  });

  it("rejects an invalid release body without creating or auditing", async () => {
    const { adminReleaseCreateRoute } = await routes;
    let created = false;
    let audited = false;
    const response = await adminReleaseCreateRoute(
      request("POST", { ...validInput, version: "not-semver" }),
      dependencies({
        create: async () => {
          created = true;
          return { release };
        },
        writeAuditLog: async () => {
          audited = true;
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(created, false);
    assert.equal(audited, false);
  });

  it("creates a draft and writes an audit entry", async () => {
    const { adminReleaseCreateRoute } = await routes;
    const audit: unknown[] = [];
    const response = await adminReleaseCreateRoute(
      request("POST", validInput),
      dependencies({
        writeAuditLog: async (entry) => {
          audit.push(entry);
        },
      }),
    );

    assert.equal(response.status, 201);
    assert.equal((await response.json()).release.publishedAt, null);
    assert.equal(audit.length, 1);
    assert.deepEqual(audit[0], {
      action: "admin.release.create",
      adminUserId: "admin-1",
      headers: request("POST", validInput).headers,
      metadata: { channel: "STABLE", version: "0.8.15" },
      targetId: "release-1",
      targetType: "Release",
    });
  });
});
