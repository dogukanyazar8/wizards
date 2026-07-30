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

function request(body: unknown) {
  return new Request("https://whispr.test/api/v1/admin/releases/release-1/changes", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "user-agent": "node-test" },
    method: "PUT",
  });
}

const context = { params: Promise.resolve({ releaseId: "release-1" }) };
type Dependencies = Parameters<Awaited<typeof routes>["adminReleaseChangesReplaceRoute"]>[2];

function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    authenticateWrite: async () => admin,
    enforceRateLimit: async () => undefined,
    parseBody: parseJsonBody,
    replace: async (_releaseId, changes) => ({
      changes: changes.map((change, position) => ({
        ...change,
        detail: change.detail ?? null,
        position,
        releaseId: "release-1",
      })),
    }),
    writeAuditLog: async () => undefined,
    ...overrides,
  } as Dependencies;
}

describe("admin release changes route", () => {
  it("answers 403 before replacing changes for a refused role", async () => {
    const { adminReleaseChangesReplaceRoute } = await routes;
    let replaced = false;
    const response = await adminReleaseChangesReplaceRoute(
      request({ changes: [] }),
      context,
      dependencies({
        authenticateWrite: async () => {
          throw new ApiError("Admin access required", 403, "ADMIN_ACCESS_REQUIRED");
        },
        replace: async () => {
          replaced = true;
          return { changes: [] };
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.equal(replaced, false);
  });

  it("rejects an invalid change without replacing or auditing", async () => {
    const { adminReleaseChangesReplaceRoute } = await routes;
    let replaced = false;
    let audited = false;
    const response = await adminReleaseChangesReplaceRoute(
      request({ changes: [{ title: "", type: "NEW" }] }),
      context,
      dependencies({
        replace: async () => {
          replaced = true;
          return { changes: [] };
        },
        writeAuditLog: async () => {
          audited = true;
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(replaced, false);
    assert.equal(audited, false);
  });

  it("passes list order to the atomic service and audits the replacement", async () => {
    const { adminReleaseChangesReplaceRoute } = await routes;
    const seen: unknown[] = [];
    const audit: unknown[] = [];
    const response = await adminReleaseChangesReplaceRoute(
      request({
        changes: [
          { detail: "A", title: "İlk", type: "NEW" },
          { detail: null, title: "İkinci", type: "FIXED" },
        ],
      }),
      context,
      dependencies({
        replace: async (releaseId, changes) => {
          seen.push({ changes, releaseId });
          return { changes: [] };
        },
        writeAuditLog: async (entry) => {
          audit.push(entry);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(seen, [
      {
        changes: [
          { detail: "A", title: "İlk", type: "NEW" },
          { detail: null, title: "İkinci", type: "FIXED" },
        ],
        releaseId: "release-1",
      },
    ]);
    assert.equal((audit[0] as { action: string }).action, "admin.release.changes.replace");
    assert.deepEqual((audit[0] as { metadata: unknown }).metadata, { count: 2 });
  });
});
