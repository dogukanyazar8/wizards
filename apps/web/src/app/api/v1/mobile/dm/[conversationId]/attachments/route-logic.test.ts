import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@/lib/api";
import { mobileDMAttachmentsRoute } from "./route-logic";

const emptyPage = { items: [], nextCursor: null, tab: "media" as const };

function createRoute(overrides: Partial<Parameters<typeof mobileDMAttachmentsRoute>[2]> = {}) {
  const calls: unknown[] = [];
  const dependencies = {
    authenticate: async () => "user-1",
    enforceRateLimit: async (_userId: string, action: string) => {
      calls.push(action);
    },
    listAttachments: async (input: unknown) => {
      calls.push(input);
      return emptyPage;
    },
    ...overrides,
  } as Parameters<typeof mobileDMAttachmentsRoute>[2];

  return { calls, dependencies };
}

describe("mobile DM shared-media route", () => {
  it("authenticates, rate limits, and defaults to the media tab", async () => {
    const { calls, dependencies } = createRoute();

    const response = await mobileDMAttachmentsRoute(
      new Request("https://whispr.test/attachments"),
      { params: Promise.resolve({ conversationId: "dm-1" }) },
      dependencies,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      "mobile:dm:attachments",
      { conversationId: "dm-1", limit: 30, tab: "media", userId: "user-1" },
    ]);
  });

  it("passes the cursor, page size, and requested tab through", async () => {
    const { calls, dependencies } = createRoute({
      listAttachments: async (input) => {
        calls.push(input);
        return { items: [], nextCursor: "message-9", tab: "links" as const };
      },
    });

    const response = await mobileDMAttachmentsRoute(
      new Request("https://whispr.test/attachments?tab=links&cursor=message-4&limit=10"),
      { params: Promise.resolve({ conversationId: "dm-1" }) },
      dependencies,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [], nextCursor: "message-9", tab: "links" });
    assert.deepEqual(calls[1], {
      conversationId: "dm-1",
      cursor: "message-4",
      limit: 10,
      tab: "links",
      userId: "user-1",
    });
  });

  it("rejects an unknown tab and an out-of-range page before touching the database", async () => {
    for (const search of ["?tab=voice", "?limit=51", "?limit=0"]) {
      const { calls, dependencies } = createRoute();
      const response = await mobileDMAttachmentsRoute(
        new Request(`https://whispr.test/attachments${search}`),
        { params: Promise.resolve({ conversationId: "dm-1" }) },
        dependencies,
      );

      assert.equal(response.status, 400, search);
      assert.deepEqual(calls, ["mobile:dm:attachments"], search);
    }
  });

  it("surfaces the participant check as a 403 without leaking the conversation", async () => {
    const { dependencies } = createRoute({
      listAttachments: async () => {
        throw new ApiError("You are not a participant in this conversation", 403);
      },
    });

    const response = await mobileDMAttachmentsRoute(
      new Request("https://whispr.test/attachments"),
      { params: Promise.resolve({ conversationId: "dm-1" }) },
      dependencies,
    );

    assert.equal(response.status, 403);
  });

  it("refuses to answer before the rate limiter does", async () => {
    const { calls, dependencies } = createRoute({
      enforceRateLimit: async () => {
        throw new ApiError("Too many requests", 429, "RATE_LIMITED");
      },
    });

    const response = await mobileDMAttachmentsRoute(
      new Request("https://whispr.test/attachments"),
      { params: Promise.resolve({ conversationId: "dm-1" }) },
      dependencies,
    );

    assert.equal(response.status, 429);
    assert.deepEqual(calls, []);
  });
});
