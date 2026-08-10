import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  mobileChannelMessagesGetRoute,
  type MobileChannelMessagesGetRouteDependencies,
} from "./get-route-logic";

const context = { params: Promise.resolve({ channelId: "channel-1" }) };

const channel = {
  categoryId: null,
  categoryName: null,
  id: "channel-1",
  lastMessage: null,
  locked: false,
  mentionCount: 0,
  name: "genel",
  position: 0,
  readOnly: false,
  topic: null,
  type: "TEXT" as const,
  unreadCount: 0,
};

function createDependencies(
  overrides: Partial<MobileChannelMessagesGetRouteDependencies> = {},
): MobileChannelMessagesGetRouteDependencies {
  return {
    authenticate: async () => "user-1",
    authorizeChannel: async () => undefined,
    listMessages: async () => ({ hasMore: false, messages: [] }),
    listMessagesAround: async () => ({ hasMore: false, hasNewer: false, messages: [] }),
    loadChannelSummary: async () => channel,
    readUserId: () => "user-1",
    ...overrides,
  };
}

function request(url = "https://whispr.test/channels/channel-1/messages") {
  return new Request(url);
}

describe("mobile channel messages GET route logic", () => {
  /**
   * A search hit opens the channel at the message, not at its newest page. The
   * two reads are different queries, so `around` has to win outright rather
   * than be merged with a cursor.
   */
  it("reads a window around the requested message and reports that newer ones exist", async () => {
    const calls: string[] = [];
    const response = await mobileChannelMessagesGetRoute(
      request("https://whispr.test/channels/channel-1/messages?around=message-9&cursor=ignored"),
      context,
      createDependencies({
        listMessages: async () => {
          calls.push("plain");
          return { hasMore: false, messages: [] };
        },
        listMessagesAround: async ({ messageId }) => {
          calls.push(`around:${messageId}`);
          return { hasMore: true, hasNewer: true, messages: [], nextCursor: "message-1" };
        },
      }),
    );

    const body = await response.json();
    assert.deepEqual(calls, ["around:message-9"]);
    assert.equal(body.hasNewer, true);
    assert.equal(body.hasMore, true);
    assert.equal(body.nextCursor, "message-1");
  });

  it("keeps the plain read for a page with no anchor and never claims newer messages", async () => {
    const response = await mobileChannelMessagesGetRoute(
      request("https://whispr.test/channels/channel-1/messages?cursor=message-5"),
      context,
      createDependencies({
        listMessagesAround: async () => {
          throw new Error("must not run without an anchor");
        },
      }),
    );

    assert.equal((await response.json()).hasNewer, false);
  });

  // The permission read used to queue behind the session/user/rate-limit round
  // trip even though both only need the id inside the verified token.
  it("starts the permission read while authentication is still in flight", async () => {
    const events: string[] = [];
    let releaseAuth: () => void = () => undefined;
    const authPending = new Promise<void>((resolve) => {
      releaseAuth = resolve;
    });

    const response = await mobileChannelMessagesGetRoute(
      request(),
      context,
      createDependencies({
        authenticate: async () => {
          events.push("auth:start");
          await authPending;
          return "user-1";
        },
        authorizeChannel: async () => {
          events.push("permission:start");
          releaseAuth();
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(events, ["auth:start", "permission:start"]);
  });

  it("reports an unauthorized request as 401 even when the permission read also fails", async () => {
    const response = await mobileChannelMessagesGetRoute(
      request(),
      context,
      createDependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
        authorizeChannel: async () => {
          throw new ApiError("Forbidden", 403, "FORBIDDEN");
        },
      }),
    );

    assert.equal(response.status, 401);
  });

  it("reads neither the summary nor the messages when the permission read fails", async () => {
    const calls: string[] = [];
    const response = await mobileChannelMessagesGetRoute(
      request(),
      context,
      createDependencies({
        authorizeChannel: async () => {
          throw new ApiError("Forbidden", 403, "FORBIDDEN");
        },
        listMessages: async () => {
          calls.push("list-messages");
          return { hasMore: false, messages: [] };
        },
        loadChannelSummary: async () => {
          calls.push("load-summary");
          return channel;
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.deepEqual(calls, []);
  });

  it("answers with the channel summary, the page and a Server-Timing breakdown", async () => {
    let listInput: unknown = null;
    const response = await mobileChannelMessagesGetRoute(
      request("https://whispr.test/channels/channel-1/messages?limit=100&cursor=cursor-1"),
      context,
      createDependencies({
        listMessages: async (input) => {
          listInput = input;
          return { hasMore: true, messages: [], nextCursor: "cursor-2" };
        },
      }),
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      channel: { name: string };
      hasMore: boolean;
      nextCursor: string | null;
    };
    assert.equal(payload.channel.name, "genel");
    assert.equal(payload.hasMore, true);
    assert.equal(payload.nextCursor, "cursor-2");
    // The client parses this header to split server time from transport time.
    assert.match(response.headers.get("server-timing") ?? "", /total;dur=/);
    assert.deepEqual(listInput, {
      channelId: "channel-1",
      cursor: "cursor-1",
      limit: 30,
      viewerId: "user-1",
    });
  });

  it("rejects a token it cannot read before touching the database", async () => {
    const calls: string[] = [];
    const response = await mobileChannelMessagesGetRoute(
      request(),
      context,
      createDependencies({
        authorizeChannel: async () => {
          calls.push("permission");
        },
        readUserId: () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(calls, []);
  });
});
