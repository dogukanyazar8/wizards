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

const article = {
  bodyMarkdown: "# Mikrofon",
  category: "MEDIA" as const,
  createdAt: "2026-07-30T09:00:00.000Z",
  id: "article-1",
  position: 0,
  publishedAt: null,
  readMinutes: 3,
  slug: "mikrofon-calismiyor",
  title: "Mikrofon çalışmıyor",
  updatedAt: "2026-07-30T09:00:00.000Z",
  url: "https://whispr.app/help/mikrofon-calismiyor",
  viewCount: 0,
};

function request(method: "DELETE" | "GET" | "PATCH", body?: unknown) {
  return new Request("https://whispr.test/api/v1/admin/help/articles/article-1", {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json", "user-agent": "node-test" },
    method,
  });
}

const context = { params: Promise.resolve({ articleId: "article-1" }) };
type Dependencies = Parameters<Awaited<typeof routes>["adminHelpArticleDetailRoute"]>[2];

function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    authenticateWrite: async () => admin,
    delete: async () => ({ deleted: true }),
    enforceRateLimit: async () => undefined,
    get: async () => ({ article }),
    parseBody: parseJsonBody,
    update: async () => ({ article }),
    writeAuditLog: async () => undefined,
    ...overrides,
  } as Dependencies;
}

describe("admin help article detail route", () => {
  it("answers 403 before reading for a refused role", async () => {
    const { adminHelpArticleDetailRoute } = await routes;
    let read = false;
    const response = await adminHelpArticleDetailRoute(
      request("GET"),
      context,
      dependencies({
        authenticateWrite: async () => {
          throw new ApiError("Admin access required", 403, "ADMIN_ACCESS_REQUIRED");
        },
        get: async () => {
          read = true;
          return { article };
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.equal(read, false);
  });

  it("rejects an empty patch without updating or auditing", async () => {
    const { adminHelpArticleUpdateRoute } = await routes;
    let updated = false;
    let audited = false;
    const response = await adminHelpArticleUpdateRoute(
      request("PATCH", {}),
      context,
      dependencies({
        update: async () => {
          updated = true;
          return { article };
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

  it("audits updates and deletions", async () => {
    const { adminHelpArticleDeleteRoute, adminHelpArticleUpdateRoute } = await routes;
    const audit: unknown[] = [];
    const deps = dependencies({
      writeAuditLog: async (entry) => {
        audit.push(entry);
      },
    });

    const patchResponse = await adminHelpArticleUpdateRoute(
      request("PATCH", { published: true }),
      context,
      deps,
    );
    const deleteResponse = await adminHelpArticleDeleteRoute(request("DELETE"), context, deps);

    assert.equal(patchResponse.status, 200);
    assert.equal(deleteResponse.status, 200);
    assert.deepEqual(
      audit.map((entry) => (entry as { action: string }).action),
      ["admin.help.article.update", "admin.help.article.delete"],
    );
  });
});
