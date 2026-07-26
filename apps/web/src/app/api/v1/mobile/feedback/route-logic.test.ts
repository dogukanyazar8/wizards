import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";

const routes = import("./route-logic");

const feedback = {
  attachments: [],
  createdAt: "2026-07-26T10:00:00.000Z",
  id: "feedback-1",
  message: "Sunucu seçiciye arama eklenirse harika olur.",
  publicNumber: 1284,
  rating: "GOOD" as const,
  roadmapItemId: null,
  status: "REVIEWING" as const,
  statusChangedAt: null,
  topic: "SUGGESTION" as const,
};

const roadmapItem = {
  description: null,
  id: "item-1",
  isOwnSuggestion: false,
  status: "PLANNED" as const,
  title: "Sesli mesajlar",
  updatedAt: "2026-07-24T09:00:00.000Z",
  voteCount: 96,
  votedByViewer: false,
};

const listItem = {
  createdAt: "2026-07-26T10:00:00.000Z",
  id: "feedback-1",
  preview: "Sunucu seçiciye arama eklenirse harika olur.",
  publicNumber: 1284,
  rating: "GOOD" as const,
  status: "REVIEWING" as const,
  statusChangedAt: null,
  topic: "SUGGESTION" as const,
};

const submission = {
  attachmentClaimIds: ["upload-1"],
  diagnostics: null,
  message: "Sunucu seçiciye arama eklenirse harika olur.",
  rating: "GOOD",
  topic: "SUGGESTION",
};

function request(method: "GET" | "POST" | "PUT", body?: unknown) {
  return new Request("https://whispr.test/api/v1/mobile/feedback", {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json" },
    method,
  });
}

function context(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    getDetail: async () => ({ feedback, roadmap: [roadmapItem] }),
    listOwnFeedback: async () => ({ items: [listItem] }),
    listRoadmap: async () => ({ items: [roadmapItem] }),
    parseBody: parseJsonBody,
    setVote: async () => ({ item: { ...roadmapItem, voteCount: 97, votedByViewer: true } }),
    submit: async () => ({ feedback, roadmap: [roadmapItem] }),
    ...overrides,
  } as Awaited<typeof routes>["mobileFeedbackSubmitRoute"] extends never
    ? never
    : Parameters<Awaited<typeof routes>["mobileFeedbackSubmitRoute"]>[1];
}

describe("mobile feedback routes", () => {
  it("stores a submission and answers with the tracking number and roadmap", async () => {
    const { mobileFeedbackSubmitRoute } = await routes;
    const calls: unknown[] = [];
    const response = await mobileFeedbackSubmitRoute(
      request("POST", submission),
      dependencies({
        submit: async (userId: string, input: unknown) => {
          calls.push([userId, input]);
          return { feedback, roadmap: [roadmapItem] };
        },
      }),
    );

    assert.equal(response.status, 201);
    assert.equal(response.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate");
    assert.deepEqual(await response.json(), { feedback, roadmap: [roadmapItem] });
    assert.deepEqual(calls, [["user-1", submission]]);
  });

  it("rate limits the submission before it writes anything", async () => {
    const { mobileFeedbackSubmitRoute } = await routes;
    let submitted = false;
    const response = await mobileFeedbackSubmitRoute(
      request("POST", submission),
      dependencies({
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests", 429, "RATE_LIMITED");
        },
        submit: async () => {
          submitted = true;
          return { feedback, roadmap: [roadmapItem] };
        },
      }),
    );

    assert.equal(response.status, 429);
    assert.equal(submitted, false);
  });

  it("rejects a payload the form could never produce", async () => {
    const { mobileFeedbackSubmitRoute } = await routes;
    const response = await mobileFeedbackSubmitRoute(
      request("POST", { ...submission, message: "" }),
      dependencies(),
    );

    assert.equal(response.status, 400);
  });

  it("scopes the tracking view to the signed-in author", async () => {
    const { mobileFeedbackDetailRoute } = await routes;
    const seen: string[][] = [];
    const response = await mobileFeedbackDetailRoute(
      request("GET"),
      context({ feedbackId: "feedback-1" }),
      dependencies({
        getDetail: async (userId: string, feedbackId: string) => {
          seen.push([userId, feedbackId]);
          return { feedback, roadmap: [roadmapItem] };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(seen, [["user-1", "feedback-1"]]);
  });

  it("passes an unknown feedback id through as a 404", async () => {
    const { mobileFeedbackDetailRoute } = await routes;
    const response = await mobileFeedbackDetailRoute(
      request("GET"),
      context({ feedbackId: "nope" }),
      dependencies({
        getDetail: async () => {
          throw new ApiError("Feedback not found", 404, "FEEDBACK_NOT_FOUND");
        },
      }),
    );

    assert.equal(response.status, 404);
  });

  it("lists the roadmap for the viewer", async () => {
    const { mobileRoadmapListRoute } = await routes;
    const response = await mobileRoadmapListRoute(request("GET"), dependencies());

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [roadmapItem] });
  });

  it("lists only the viewer's own reports for the Bildirdiklerim tab", async () => {
    const { mobileFeedbackListRoute } = await routes;
    const seen: string[] = [];
    const response = await mobileFeedbackListRoute(
      request("GET"),
      dependencies({
        listOwnFeedback: async (userId: string) => {
          seen.push(userId);
          return { items: [listItem] };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate");
    assert.deepEqual(await response.json(), { items: [listItem] });
    assert.deepEqual(seen, ["user-1"]);
  });

  it("rate limits the report list under its own action", async () => {
    const { mobileFeedbackListRoute } = await routes;
    const actions: string[] = [];
    const response = await mobileFeedbackListRoute(
      request("GET"),
      dependencies({
        enforceRateLimit: async (_userId: string, action: string) => {
          actions.push(action);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(actions, ["mobile:feedback:list"]);
  });

  it("votes by desired end state so a retried tap cannot double-count", async () => {
    const { mobileRoadmapVoteRoute } = await routes;
    const seen: unknown[] = [];
    const response = await mobileRoadmapVoteRoute(
      request("PUT", { voted: true }),
      context({ roadmapItemId: "item-1" }),
      dependencies({
        setVote: async (userId: string, itemId: string, voted: boolean) => {
          seen.push([userId, itemId, voted]);
          return { item: { ...roadmapItem, voteCount: 97, votedByViewer: true } };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(seen, [["user-1", "item-1", true]]);
  });

  it("refuses a delta-shaped vote body", async () => {
    const { mobileRoadmapVoteRoute } = await routes;
    const response = await mobileRoadmapVoteRoute(
      request("PUT", { delta: 1 }),
      context({ roadmapItemId: "item-1" }),
      dependencies(),
    );

    assert.equal(response.status, 400);
  });

  it("requires a session on every route", async () => {
    const { mobileFeedbackListRoute, mobileFeedbackSubmitRoute, mobileRoadmapListRoute } =
      await routes;
    const unauthenticated = dependencies({
      authenticate: async () => {
        throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
      },
    });

    assert.equal(
      (await mobileFeedbackSubmitRoute(request("POST", submission), unauthenticated)).status,
      401,
    );
    assert.equal((await mobileRoadmapListRoute(request("GET"), unauthenticated)).status, 401);
    assert.equal((await mobileFeedbackListRoute(request("GET"), unauthenticated)).status, 401);
  });
});
