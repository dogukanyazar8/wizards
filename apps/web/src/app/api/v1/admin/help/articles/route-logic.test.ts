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

const validInput = {
  bodyMarkdown: "# Mikrofon",
  category: "MEDIA",
  position: 0,
  published: false,
  readMinutes: 3,
  slug: "mikrofon-calismiyor",
  title: "Mikrofon çalışmıyor",
  url: "https://whispr.app/help/mikrofon-calismiyor",
};

function request(method: "GET" | "POST", body?: unknown) {
  return new Request("https://whispr.test/api/v1/admin/help/articles", {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json", "user-agent": "node-test" },
    method,
  });
}

type Dependencies = Parameters<Awaited<typeof routes>["adminHelpArticleListRoute"]>[1];

function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    authenticateWrite: async () => admin,
    create: async () => ({ article }),
    enforceRateLimit: async () => undefined,
    list: async () => ({ articles: [article] }),
    parseBody: parseJsonBody,
    writeAuditLog: async () => undefined,
    ...overrides,
  } as Dependencies;
}

describe("admin help article collection route", () => {
  it("answers 403 before listing for a refused role", async () => {
    const { adminHelpArticleListRoute } = await routes;
    let listed = false;
    const response = await adminHelpArticleListRoute(
      request("GET"),
      dependencies({
        authenticateWrite: async () => {
          throw new ApiError("Admin access required", 403, "ADMIN_ACCESS_REQUIRED");
        },
        list: async () => {
          listed = true;
          return { articles: [] };
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.equal(listed, false);
  });

  it("rejects an invalid slug without creating or auditing", async () => {
    const { adminHelpArticleCreateRoute } = await routes;
    let created = false;
    let audited = false;
    const response = await adminHelpArticleCreateRoute(
      request("POST", { ...validInput, slug: "../escape" }),
      dependencies({
        create: async () => {
          created = true;
          return { article };
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

  it("creates an article and writes an audit entry", async () => {
    const { adminHelpArticleCreateRoute } = await routes;
    const audit: unknown[] = [];
    const response = await adminHelpArticleCreateRoute(
      request("POST", validInput),
      dependencies({
        writeAuditLog: async (entry) => {
          audit.push(entry);
        },
      }),
    );

    assert.equal(response.status, 201);
    assert.equal((audit[0] as { action: string }).action, "admin.help.article.create");
    assert.deepEqual((audit[0] as { metadata: unknown }).metadata, {
      category: "MEDIA",
      published: false,
      slug: "mikrofon-calismiyor",
    });
  });
});
