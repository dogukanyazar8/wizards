import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { API_RATE_LIMITS } from "@/lib/api-rate-limit";
import { listHomeAwaiting } from "@/lib/home/awaiting-service";
import {
  UNAUTHENTICATED,
  createFakeDatabase,
  fakeChannelResolver,
  fakePresenceReader,
  readJson,
  recordRateLimit,
} from "@/lib/home/home-test-doubles";
import { toRelativeAppHref } from "@/lib/home/href";
import { AppAwaitingResponseSchema } from "@/lib/home/types";

import { appAwaitingRoute, type AppAwaitingRouteDependencies } from "./route-logic";

const NOW = new Date("2026-08-19T09:00:00.000Z");

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    authorAvatarUrl: null,
    authorDisplayName: "Ayşe",
    authorId: "u2",
    authorUsername: "ayse",
    channelId: "c1",
    channelName: "genel",
    content: "@ben bakar mısın",
    id: "mn-1",
    messageId: "m-1",
    occurredAt: new Date("2026-08-19T08:50:00.000Z"),
    serverId: "s1",
    serverName: "Whispr",
    ...overrides,
  };
}

function awaitingDatabase(
  overrides: {
    invites?: readonly unknown[];
    mentions?: readonly unknown[];
    replies?: readonly unknown[];
    requests?: readonly unknown[];
  } = {},
) {
  return createFakeDatabase({
    models: {
      friendRequest: {
        findMany: () =>
          overrides.requests ?? [
            {
              createdAt: new Date("2026-08-19T07:00:00.000Z"),
              id: "fr-1",
              sender: { avatarUrl: null, displayName: null, id: "u4", username: "kerem" },
            },
          ],
      },
      notification: {
        findMany: () =>
          overrides.invites ?? [
            {
              actionUrl: "/invite/abcd1234",
              body: "Kerem seni Whispr sunucusuna davet etti",
              createdAt: new Date("2026-08-19T06:00:00.000Z"),
              id: "nt-1",
              title: "Sunucu daveti",
            },
          ],
      },
      serverMember: { findMany: () => [{ serverId: "s1" }] },
    },
    queryRaw: [
      [{ friendRequests: 1, mentions: 1, replies: 1, serverInvites: 1 }],
      overrides.mentions ?? [messageRow()],
      overrides.replies ?? [
        messageRow({
          id: "m-2",
          messageId: "m-2",
          occurredAt: new Date("2026-08-19T08:40:00.000Z"),
        }),
      ],
    ],
  });
}

function serviceDependencies(database: ReturnType<typeof awaitingDatabase>["database"]) {
  return {
    database,
    listVisibleChannels: fakeChannelResolver({ s1: ["c1"] }),
    now: NOW,
    readPresence: fakePresenceReader({ u2: "ONLINE" }),
  };
}

function routeDependencies(
  overrides: Partial<AppAwaitingRouteDependencies> = {},
): AppAwaitingRouteDependencies {
  return {
    authenticate: () => Promise.resolve("u1"),
    enforceRateLimit: () => Promise.resolve(),
    listAwaiting: () => Promise.resolve({ items: [], newCount: 0, total: 0 }),
    ...overrides,
  };
}

describe("GET /api/v1/app/awaiting", () => {
  it("returns all four sources in one shape, newest first", async () => {
    const { database } = awaitingDatabase();

    const payload = AppAwaitingResponseSchema.parse(
      await listHomeAwaiting("u1", { limit: 6 }, serviceDependencies(database)),
    );

    assert.deepEqual(
      payload.items.map((item) => [item.source, item.action]),
      [
        ["mention", "reply"],
        ["reply", "reply"],
        ["friend_request", "accept"],
        ["server_invite", "accept"],
      ],
    );
    assert.equal(payload.total, 4);
    assert.equal(payload.newCount, 4);
    assert.equal(payload.items[0]?.user.presence, "ONLINE");
    assert.equal(payload.items[0]?.context, "Whispr · #genel");
  });

  it("rejects a request without a session", async () => {
    const response = await appAwaitingRoute(
      new Request("https://whispr.test/api/v1/app/awaiting"),
      routeDependencies({ authenticate: UNAUTHENTICATED }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await readJson(response), { error: "Unauthorized" });
  });

  it("scopes both message sources to channels the viewer can read", async () => {
    const { calls, database } = awaitingDatabase();

    await listHomeAwaiting(
      "u1",
      { limit: 6 },
      {
        ...serviceDependencies(database),
        listVisibleChannels: fakeChannelResolver({ s1: [] }),
      },
    );

    const raw = calls.filter((call) => call.operation === "$queryRaw");
    for (const call of raw.slice(0, 3)) {
      const sql = JSON.stringify(call.args ?? {});
      assert.ok(sql.includes("FALSE"), "an empty visible set must close the query, not open it");
    }
  });

  it("only ever links to in-app paths, including one stored by a client", async () => {
    const { database } = awaitingDatabase({
      invites: [
        {
          actionUrl: "https://evil.example/steal",
          body: "davet",
          createdAt: new Date("2026-08-19T06:00:00.000Z"),
          id: "nt-2",
          title: "Sunucu daveti",
        },
      ],
    });

    const payload = await listHomeAwaiting("u1", { limit: 6 }, serviceDependencies(database));
    const invite = payload.items.find((item) => item.source === "server_invite");

    assert.equal(invite?.href, "/inbox");
    for (const item of payload.items) {
      assert.equal(toRelativeAppHref(item.href), item.href);
    }
  });

  it("never reads Notification.metadata into the payload", async () => {
    const { calls, database } = awaitingDatabase();

    await listHomeAwaiting("u1", { limit: 6 }, serviceDependencies(database));

    const notificationCall = calls.find((call) => call.operation === "notification.findMany");
    const select = JSON.stringify(notificationCall?.args ?? {});
    assert.ok(!select.includes("metadata"), "client-written metadata must not be selected at all");
    assert.ok(select.includes('"read":false'));
  });

  it("is registered in the rate limit table and charged before any work", async () => {
    assert.deepEqual(API_RATE_LIMITS["app:awaiting"], { limit: 120, windowSeconds: 60 });

    const recorded: string[] = [];
    await appAwaitingRoute(
      new Request("https://whispr.test/api/v1/app/awaiting"),
      routeDependencies({ enforceRateLimit: recordRateLimit(recorded) }),
    );

    assert.deepEqual(recorded, ["app:awaiting"]);
  });

  it("filters by source on the server, and skips the branches nobody asked for", async () => {
    const { calls, database } = awaitingDatabase();

    const payload = await listHomeAwaiting(
      "u1",
      { limit: 50, source: "friend_request" },
      serviceDependencies(database),
    );

    assert.deepEqual(
      payload.items.map((item) => item.source),
      ["friend_request"],
    );
    // The unasked-for sources are not read and then dropped — they are not read.
    assert.ok(!calls.some((call) => call.operation === "notification.findMany"));
    // The header's total stays the **whole** inbox: a filtered view still says
    // how much is waiting, not how much of it matches the chip.
    assert.equal(payload.total, 4);
  });

  it("accepts the inbox's high limit and refuses anything above it", async () => {
    const ok = await appAwaitingRoute(
      new Request("https://whispr.test/api/v1/app/awaiting?limit=100"),
      routeDependencies(),
    );
    assert.equal(ok.status, 200);

    const tooMany = await appAwaitingRoute(
      new Request("https://whispr.test/api/v1/app/awaiting?limit=101"),
      routeDependencies(),
    );
    assert.equal(tooMany.status, 400);
  });

  it("refuses a source the screen never offers", async () => {
    const response = await appAwaitingRoute(
      new Request("https://whispr.test/api/v1/app/awaiting?source=everything"),
      routeDependencies(),
    );

    assert.equal(response.status, 400);
  });

  it("costs six queries whatever the limit is", async () => {
    const small = awaitingDatabase();
    await listHomeAwaiting("u1", { limit: 1 }, serviceDependencies(small.database));

    const large = awaitingDatabase();
    await listHomeAwaiting("u1", { limit: 20 }, serviceDependencies(large.database));

    assert.equal(small.queryCount(), 6);
    assert.equal(large.queryCount(), 6);
  });
});
