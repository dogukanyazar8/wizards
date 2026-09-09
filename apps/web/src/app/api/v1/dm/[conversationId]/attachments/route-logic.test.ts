import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@/lib/api";
import { dmSharedItemsRoute } from "./route-logic";

const emptyPage = { items: [], kind: "media" as const, nextCursor: null, total: 0 };

function createRoute(overrides: Partial<Parameters<typeof dmSharedItemsRoute>[2]> = {}) {
  const calls: unknown[] = [];
  const dependencies = {
    authenticate: async () => "user-1",
    enforceRateLimit: async (_userId: string, action: string) => {
      calls.push(action);
    },
    listSharedItems: async (input: unknown) => {
      calls.push(input);
      return emptyPage;
    },
    ...overrides,
  } as Parameters<typeof dmSharedItemsRoute>[2];

  return { calls, dependencies };
}

function call(search = "", overrides: Partial<Parameters<typeof dmSharedItemsRoute>[2]> = {}) {
  const { calls, dependencies } = createRoute(overrides);

  return {
    calls,
    response: dmSharedItemsRoute(
      new Request(`https://whispr.test/api/v1/dm/dm-1/attachments${search}`),
      { params: Promise.resolve({ conversationId: "dm-1" }) },
      dependencies,
    ),
  };
}

describe("web DM shared-items route", () => {
  it("authenticates, rate limits, and defaults to the media kind", async () => {
    const { calls, response } = call();

    assert.equal((await response).status, 200);
    assert.deepEqual(calls, [
      "dm:attachments",
      { conversationId: "dm-1", kind: "media", limit: 30, viewerId: "user-1" },
    ]);
  });

  // The `+12` overlay is computed from `total`, so the route must hand the
  // service's number through untouched rather than deriving one from `items`.
  it("passes the kind, cursor, and page size through and returns the real total", async () => {
    const seen: unknown[] = [];
    const { response } = call("?kind=link&cursor=message-4&limit=10", {
      listSharedItems: async (input: unknown) => {
        seen.push(input);

        return {
          items: [
            {
              createdAt: "2026-07-14T09:00:00.000Z",
              host: "whispr.app",
              messageId: "message-9",
              title: "Sürüm 2.4 notları",
              url: "https://whispr.app/changelog",
            },
          ],
          kind: "link" as const,
          nextCursor: "message-9",
          total: 18,
        };
      },
    });
    const awaited = await response;

    assert.equal(awaited.status, 200);
    assert.deepEqual(await awaited.json(), {
      items: [
        {
          createdAt: "2026-07-14T09:00:00.000Z",
          host: "whispr.app",
          messageId: "message-9",
          title: "Sürüm 2.4 notları",
          url: "https://whispr.app/changelog",
        },
      ],
      kind: "link",
      nextCursor: "message-9",
      total: 18,
    });
    assert.deepEqual(seen, [
      {
        conversationId: "dm-1",
        cursor: "message-4",
        kind: "link",
        limit: 10,
        viewerId: "user-1",
      },
    ]);
  });

  // `SharedMediaPageSchema.items` is a union of three arrays and zod returns the
  // first branch that parses. A file row must not be silently reshaped by the
  // media branch that is tried before it.
  it("ships a file page through the response union without losing its fields", async () => {
    const file = {
      attachmentId: "a-pdf",
      createdAt: "2026-07-14T09:00:00.000Z",
      extension: "PDF",
      messageId: "message-1",
      name: "surum-2.4-notlari.pdf",
      sizeBytes: 1_258_291,
      url: "https://cdn.whispr.test/surum.pdf",
    };
    const { response } = call("?kind=file", {
      listSharedItems: async () => ({
        items: [file],
        kind: "file" as const,
        nextCursor: null,
        total: 2,
      }),
    });

    assert.deepEqual(await (await response).json(), {
      items: [file],
      kind: "file",
      nextCursor: null,
      total: 2,
    });
  });

  it("rejects an unknown kind, an out-of-range page, and an unknown parameter", async () => {
    for (const search of ["?kind=voice", "?limit=51", "?limit=0", "?tab=media"]) {
      const { calls, response } = call(search);

      assert.equal((await response).status, 400, search);
      assert.deepEqual(calls, ["dm:attachments"], search);
    }
  });

  it("surfaces the participant check as a 403 without leaking the conversation", async () => {
    const { response } = call("", {
      listSharedItems: async () => {
        throw new ApiError("You are not a participant in this conversation", 403);
      },
    });

    assert.equal((await response).status, 403);
  });

  it("returns 404 for a cursor that is not a message of this conversation", async () => {
    const { response } = call("?cursor=nope", {
      listSharedItems: async () => {
        throw new ApiError("Message not found", 404, "NOT_FOUND");
      },
    });

    assert.equal((await response).status, 404);
  });

  it("refuses to answer before the rate limiter does", async () => {
    const { calls, response } = call("", {
      enforceRateLimit: async () => {
        throw new ApiError("Too many requests", 429, "RATE_LIMITED");
      },
    });

    assert.equal((await response).status, 429);
    assert.deepEqual(calls, []);
  });
});
