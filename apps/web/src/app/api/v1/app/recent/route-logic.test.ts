import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { API_RATE_LIMITS } from "@/lib/api-rate-limit";
import {
  UNAUTHENTICATED,
  createFakeDatabase,
  fakeChannelResolver,
  fakePresenceReader,
  readJson,
  recordRateLimit,
} from "@/lib/home/home-test-doubles";
import { toRelativeAppHref } from "@/lib/home/href";
import { listHomeRecent } from "@/lib/home/recent-service";
import { AppRecentResponseSchema } from "@/lib/home/types";

import { appRecentRoute, type AppRecentRouteDependencies } from "./route-logic";

function channelRow(overrides: Record<string, unknown> = {}) {
  return {
    authorAvatarUrl: null,
    authorDisplayName: "Ayşe",
    authorId: "u2",
    authorUsername: "ayse",
    channelId: "c1",
    channelName: "genel",
    content: "  merhaba   dünya ",
    createdAt: new Date("2026-08-19T08:00:00.000Z"),
    serverId: "s1",
    serverName: "Whispr",
    ...overrides,
  };
}

function recentDatabase(
  overrides: {
    channelRows?: readonly unknown[];
    conversations?: readonly unknown[];
    dmRows?: readonly unknown[];
  } = {},
) {
  return createFakeDatabase({
    models: {
      dMConversation: {
        findMany: () =>
          overrides.conversations ?? [
            {
              id: "conv-1",
              messages: [
                {
                  author: {
                    avatarUrl: null,
                    displayName: "Mehmet",
                    id: "u3",
                    username: "mehmet",
                  },
                  content: "görüşürüz",
                  createdAt: new Date("2026-08-19T08:30:00.000Z"),
                },
              ],
              name: null,
              participants: [
                { user: { avatarUrl: null, displayName: "Mehmet", id: "u3", username: "mehmet" } },
                { user: { avatarUrl: null, displayName: "Ben", id: "u1", username: "ben" } },
              ],
              type: "DM",
            },
          ],
      },
      serverMember: { findMany: () => [{ serverId: "s1" }] },
    },
    queryRaw: [
      overrides.channelRows ?? [channelRow()],
      overrides.dmRows ?? [
        {
          conversationId: "conv-1",
          lastMessageAt: new Date("2026-08-19T08:30:00.000Z"),
          mentionCount: 0,
          unreadCount: 3,
        },
      ],
      [{ channelId: "c1", mentionCount: 1, unreadCount: 5 }],
    ],
  });
}

function routeDependencies(
  overrides: Partial<AppRecentRouteDependencies> = {},
): AppRecentRouteDependencies {
  return {
    authenticate: () => Promise.resolve("u1"),
    enforceRateLimit: () => Promise.resolve(),
    listRecent: () => Promise.resolve({ items: [] }),
    ...overrides,
  };
}

describe("GET /api/v1/app/recent", () => {
  it("merges both sources newest-first and links to in-app paths only", async () => {
    const { database } = recentDatabase();

    const payload = await listHomeRecent("u1", 6, {
      database,
      readPresence: fakePresenceReader({ u2: "IDLE", u3: "OFFLINE" }),
      listVisibleChannels: fakeChannelResolver({ s1: ["c1"] }),
    });
    const parsed = AppRecentResponseSchema.parse(payload);

    assert.deepEqual(
      parsed.items.map((item) => [item.kind, item.id, item.unreadCount, item.mentioned]),
      [
        ["dm", "conv-1", 3, false],
        ["channel", "c1", 5, true],
      ],
    );
    assert.equal(parsed.items[1]?.lastMessage?.text, "merhaba dünya");
    assert.equal(parsed.items[1]?.name, "genel");
    // DM satırının noktası karşı tarafın **redakte edilmiş** presence'ıdır; kanal satırında
    // tek bir kişi yok, o yüzden nokta da yok.
    assert.equal(parsed.items[0]?.presence, "OFFLINE");
    assert.equal(parsed.items[1]?.presence, null);
    assert.equal(parsed.items[0]?.name, "Mehmet");
    for (const item of parsed.items) {
      assert.equal(toRelativeAppHref(item.href), item.href);
    }
  });

  it("rejects a request without a session", async () => {
    const response = await appRecentRoute(
      new Request("https://whispr.test/api/v1/app/recent"),
      routeDependencies({ authenticate: UNAUTHENTICATED }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await readJson(response), { error: "Unauthorized" });
  });

  it("cannot read a channel the viewer has no permission for", async () => {
    // With no visible channels the channel query is skipped entirely, so the
    // raw answers start at the DM page.
    const { calls, database } = createFakeDatabase({
      models: {
        dMConversation: {
          findMany: () => [
            { id: "conv-1", messages: [], name: null, participants: [], type: "DM" },
          ],
        },
        serverMember: { findMany: () => [{ serverId: "s1" }] },
      },
      queryRaw: [
        [
          {
            conversationId: "conv-1",
            lastMessageAt: new Date("2026-08-19T08:30:00.000Z"),
            mentionCount: 0,
            unreadCount: 0,
          },
        ],
      ],
    });

    const payload = await listHomeRecent("u1", 6, {
      database,
      // The permission service answers "nothing visible in s1".
      readPresence: fakePresenceReader({ u2: "IDLE", u3: "OFFLINE" }),
      listVisibleChannels: fakeChannelResolver({ s1: [] }),
    });

    assert.deepEqual(
      payload.items.map((item) => item.kind),
      ["dm"],
    );
    // With no visible channels the channel query is never issued at all, so the
    // rows cannot be filtered out "later".
    const rawCalls = calls.filter((call) => call.operation === "$queryRaw");
    assert.equal(rawCalls.length, 1);
    assert.ok(!JSON.stringify(rawCalls[0]?.args ?? {}).includes("DISTINCT ON"));
  });

  it("keeps a hidden conversation hidden until something new arrives", async () => {
    const { calls, database } = recentDatabase();

    await listHomeRecent("u1", 6, {
      database,
      readPresence: fakePresenceReader({ u2: "IDLE", u3: "OFFLINE" }),
      listVisibleChannels: fakeChannelResolver({ s1: ["c1"] }),
    });

    const dmQuery = calls.filter((call) => call.operation === "$queryRaw")[1];
    const sql = JSON.stringify(dmQuery?.args ?? {});
    assert.ok(sql.includes("hiddenAt"));
    assert.ok(sql.includes("lastMessageAt"));
  });

  it("applies DM history and expiry before selecting recent rows and previews", async () => {
    const { calls, database } = recentDatabase();

    await listHomeRecent("u1", 6, {
      database,
      readPresence: fakePresenceReader({ u3: "OFFLINE" }),
      listVisibleChannels: fakeChannelResolver({ s1: ["c1"] }),
    });

    const dmSql = JSON.stringify(calls.filter((call) => call.operation === "$queryRaw")[1]?.args);
    assert.match(dmSql, /historyFromAt/);
    assert.match(dmSql, /expiresAt/);
    assert.match(dmSql, /deletedAt/);

    const conversationRead = calls.find((call) => call.operation === "dMConversation.findMany");
    const messageWhere = (
      conversationRead?.args as { select?: { messages?: { where?: Record<string, unknown> } } }
    )?.select?.messages?.where;
    assert.ok(messageWhere);
    assert.equal(messageWhere.deletedAt, null);
    assert.ok(JSON.stringify(messageWhere).includes("expiresAt"));
  });

  it("is registered in the rate limit table and charged before any work", async () => {
    assert.deepEqual(API_RATE_LIMITS["app:recent"], { limit: 120, windowSeconds: 60 });

    const recorded: string[] = [];
    await appRecentRoute(
      new Request("https://whispr.test/api/v1/app/recent"),
      routeDependencies({ enforceRateLimit: recordRateLimit(recorded) }),
    );

    assert.deepEqual(recorded, ["app:recent"]);
  });

  it("costs five queries whatever the limit is", async () => {
    const small = recentDatabase();
    await listHomeRecent("u1", 4, {
      database: small.database,
      readPresence: fakePresenceReader({ u2: "IDLE", u3: "OFFLINE" }),
      listVisibleChannels: fakeChannelResolver({ s1: ["c1"] }),
    });

    const large = recentDatabase();
    await listHomeRecent("u1", 10, {
      database: large.database,
      readPresence: fakePresenceReader({ u2: "IDLE", u3: "OFFLINE" }),
      listVisibleChannels: fakeChannelResolver({ s1: ["c1", "c2", "c3", "c4"] }),
    });

    assert.equal(small.queryCount(), 5);
    assert.equal(large.queryCount(), 5);
  });

  it("refuses a limit outside the card's range", async () => {
    const response = await appRecentRoute(
      new Request("https://whispr.test/api/v1/app/recent?limit=99"),
      routeDependencies(),
    );

    assert.equal(response.status, 400);
    const body = await readJson(response);
    assert.equal(typeof body.error, "string");
    assert.ok(!JSON.stringify(body).includes("ZodError"));
  });
});
