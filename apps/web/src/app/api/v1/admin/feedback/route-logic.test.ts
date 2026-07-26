import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";
import type { AdminAccessUser } from "@/lib/admin/access";

const routes = import("./route-logic");

const admin: AdminAccessUser = {
  email: "ops@whispr.test",
  id: "admin-1",
  role: "ADMIN",
  username: "ops",
};

const listItem = {
  attachmentCount: 1,
  createdAt: "2026-07-26T10:00:00.000Z",
  id: "feedback-1",
  preview: "Sunucu seçiciye arama",
  publicNumber: 1284,
  rating: "GOOD" as const,
  roadmapItemId: null,
  status: "REVIEWING" as const,
  topic: "SUGGESTION" as const,
  user: { avatarUrl: null, displayName: "Ayşegül", id: "user-2", username: "aysegul_dev" },
};

const detail = {
  attachments: [],
  createdAt: "2026-07-26T10:00:00.000Z",
  diagnostics: null,
  id: "feedback-1",
  message: "Sunucu seçiciye arama eklenirse harika olur.",
  publicNumber: 1284,
  rating: "GOOD" as const,
  roadmapItemId: null,
  status: "PLANNED" as const,
  statusChangedAt: "2026-07-26T11:00:00.000Z",
  topic: "SUGGESTION" as const,
  updatedAt: "2026-07-26T11:00:00.000Z",
  user: {
    avatarUrl: null,
    displayName: "Ayşegül",
    feedbackCount: 3,
    id: "user-2",
    registeredAt: "2025-01-02T00:00:00.000Z",
    username: "aysegul_dev",
  },
};

const roadmapItem = {
  createdAt: "2026-07-20T10:00:00.000Z",
  description: null,
  featured: false,
  feedbackCount: 2,
  id: "item-1",
  position: 0,
  status: "PLANNED" as const,
  title: "Sesli mesajlar",
  voteCount: 96,
};

function request(method: "GET" | "PATCH" | "POST", url: string, body?: unknown) {
  return new Request(url, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json", "user-agent": "vitest" },
    method,
  });
}

function context(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

type Dependencies = Parameters<Awaited<typeof routes>["adminFeedbackListRoute"]>[1];

function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    authenticateRead: async () => admin,
    authenticateWrite: async () => admin,
    createRoadmapItem: async () => ({ item: roadmapItem }),
    enforceRateLimit: async () => undefined,
    getDetail: async () => ({ feedback: detail }),
    list: async () => ({ items: [listItem], nextCursor: null, total: 1 }),
    listRoadmap: async () => ({ items: [roadmapItem] }),
    parseBody: parseJsonBody,
    updateFeedback: async () => ({ feedback: detail }),
    updateRoadmapItem: async () => ({ item: roadmapItem }),
    writeAuditLog: async () => undefined,
    ...overrides,
  } as Dependencies;
}

describe("admin feedback console routes", () => {
  it("reads the filters off the query string and defaults each one to ALL", async () => {
    const { adminFeedbackListRoute } = await routes;
    const seen: unknown[] = [];
    const response = await adminFeedbackListRoute(
      request(
        "GET",
        "https://whispr.test/api/v1/admin/feedback?status=PLANNED&topic=BUG&rating=bogus&query=WSP-1284&cursor=feedback-9",
      ),
      dependencies({
        list: async (filters) => {
          seen.push(filters);
          return { items: [listItem], nextCursor: null, total: 1 };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(seen, [
      {
        cursor: "feedback-9",
        query: "WSP-1284",
        // An unparseable rating falls back to "all" instead of 400-ing a browse.
        rating: "ALL",
        status: "PLANNED",
        topic: "BUG",
      },
    ]);
  });

  it("keeps the console out of caches", async () => {
    const { adminFeedbackListRoute } = await routes;
    const response = await adminFeedbackListRoute(
      request("GET", "https://whispr.test/api/v1/admin/feedback"),
      dependencies(),
    );

    assert.equal(response.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate");
  });

  it("refuses a non-admin before touching the data", async () => {
    const { adminFeedbackListRoute } = await routes;
    let listed = false;
    const response = await adminFeedbackListRoute(
      request("GET", "https://whispr.test/api/v1/admin/feedback"),
      dependencies({
        authenticateRead: async () => {
          throw new ApiError("Admin access required", 403, "ADMIN_ACCESS_REQUIRED");
        },
        list: async () => {
          listed = true;
          return { items: [], nextCursor: null, total: 0 };
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.equal(listed, false);
  });

  // Hiding the control is not enough: a read-only role must fail at the route.
  it("gates every write behind the write roles, not the read roles", async () => {
    const { adminFeedbackUpdateRoute, adminRoadmapCreateRoute, adminRoadmapUpdateRoute } =
      await routes;
    const readOnly = dependencies({
      authenticateWrite: async () => {
        throw new ApiError("Admin access required", 403, "ADMIN_ACCESS_REQUIRED");
      },
    });

    assert.equal(
      (
        await adminFeedbackUpdateRoute(
          request("PATCH", "https://whispr.test/api/v1/admin/feedback/feedback-1", {
            status: "PLANNED",
          }),
          context({ feedbackId: "feedback-1" }),
          readOnly,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await adminRoadmapCreateRoute(
          request("POST", "https://whispr.test/api/v1/admin/feedback/roadmap", { title: "x" }),
          readOnly,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await adminRoadmapUpdateRoute(
          request("PATCH", "https://whispr.test/api/v1/admin/feedback/roadmap/item-1", {
            status: "SHIPPED",
          }),
          context({ roadmapItemId: "item-1" }),
          readOnly,
        )
      ).status,
      403,
    );
  });

  it("writes an audit entry for a status change", async () => {
    const { adminFeedbackUpdateRoute } = await routes;
    const audit: unknown[] = [];
    const response = await adminFeedbackUpdateRoute(
      request("PATCH", "https://whispr.test/api/v1/admin/feedback/feedback-1", {
        roadmapItemId: "item-1",
        status: "PLANNED",
      }),
      context({ feedbackId: "feedback-1" }),
      dependencies({
        writeAuditLog: async (entry) => {
          audit.push(entry);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(audit.length, 1);
    const entry = audit[0] as { action: string; metadata: unknown; targetId: string };
    assert.equal(entry.action, "admin.feedback.update");
    assert.equal(entry.targetId, "feedback-1");
    assert.deepEqual(entry.metadata, { roadmapItemId: "item-1", status: "PLANNED" });
  });

  it("rejects an update that changes nothing", async () => {
    const { adminFeedbackUpdateRoute } = await routes;
    let updated = false;
    const response = await adminFeedbackUpdateRoute(
      request("PATCH", "https://whispr.test/api/v1/admin/feedback/feedback-1", {}),
      context({ feedbackId: "feedback-1" }),
      dependencies({
        updateFeedback: async () => {
          updated = true;
          return { feedback: detail };
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(updated, false);
  });

  it("creates a roadmap item and audits it", async () => {
    const { adminRoadmapCreateRoute } = await routes;
    const audit: unknown[] = [];
    const response = await adminRoadmapCreateRoute(
      request("POST", "https://whispr.test/api/v1/admin/feedback/roadmap", {
        title: "Sesli mesajlar",
      }),
      dependencies({
        writeAuditLog: async (entry) => {
          audit.push(entry);
        },
      }),
    );

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { item: roadmapItem });
    assert.equal((audit[0] as { action: string }).action, "admin.roadmap.create");
  });

  it("lists the roadmap for the console", async () => {
    const { adminRoadmapListRoute } = await routes;
    const response = await adminRoadmapListRoute(
      request("GET", "https://whispr.test/api/v1/admin/feedback/roadmap"),
      dependencies(),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [roadmapItem] });
  });

  it("surfaces a missing feedback id as a 404", async () => {
    const { adminFeedbackDetailRoute } = await routes;
    const response = await adminFeedbackDetailRoute(
      request("GET", "https://whispr.test/api/v1/admin/feedback/nope"),
      context({ feedbackId: "nope" }),
      dependencies({
        getDetail: async () => {
          throw new ApiError("Feedback not found", 404, "FEEDBACK_NOT_FOUND");
        },
      }),
    );

    assert.equal(response.status, 404);
  });
});
