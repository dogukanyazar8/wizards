import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { API_RATE_LIMITS } from "@/lib/api-rate-limit";
import {
  UNAUTHENTICATED,
  createFakeDatabase,
  fakeChannelResolver,
  readJson,
  recordRateLimit,
  sqlText,
} from "@/lib/home/home-test-doubles";
import { getHomeSummary } from "@/lib/home/summary-service";
import { AppSummaryResponseSchema } from "@/lib/home/types";

import { appSummaryRoute, type AppSummaryRouteDependencies } from "./route-logic";

const NOW = new Date("2026-08-19T09:00:00.000Z");

function summaryDatabase(
  overrides: {
    counters?: Record<string, number>;
    memberships?: readonly { serverId: string }[];
    mentionCounts?: Record<string, unknown>;
    user?: Record<string, unknown>;
  } = {},
) {
  return createFakeDatabase({
    models: {
      serverMember: {
        findMany: () => overrides.memberships ?? [{ serverId: "s1" }],
      },
      user: {
        findUnique: () => ({
          displayName: "Doğukan",
          id: "u1",
          status: "ONLINE",
          statusExpiresAt: null,
          statusFocusMinutes: null,
          statusRestoreTo: null,
          username: "dogukan",
          ...overrides.user,
        }),
        updateMany: () => ({ count: 1 }),
      },
    },
    queryRaw: [
      [{ dmUnread: 7, ...overrides.counters }],
      [{ friendRequests: 1, mentions: 2, replies: 1, serverInvites: 0 }],
      // Bahsedilmeler K4: `unreadMentions` artık bahsetme listesinin kendi sorgusundan
      // geliyor, `ChannelReadState.mentionCount` toplamından değil.
      [
        {
          all: 5,
          bySource: { s1: 5 },
          everyone: 0,
          me: 3,
          readLater: 0,
          role: 0,
          thread: 0,
          unread: 3,
          ...overrides.mentionCounts,
        },
      ],
    ],
  });
}

function routeDependencies(
  overrides: Partial<AppSummaryRouteDependencies> = {},
): AppSummaryRouteDependencies {
  return {
    authenticate: () => Promise.resolve("u1"),
    enforceRateLimit: () => Promise.resolve(),
    getSummary: () =>
      Promise.resolve({
        dateLabel: NOW.toISOString(),
        dmUnread: 0,
        focus: null,
        greetingName: "Doğukan",
        pendingReplies: 0,
        presence: "ONLINE" as const,
        unreadMentions: 0,
      }),
    now: () => NOW,
    ...overrides,
  };
}

describe("GET /api/v1/app/summary", () => {
  it("answers the header contract", async () => {
    const { database } = summaryDatabase();

    const payload = await getHomeSummary("u1", {
      applyExpiredFocus: () => Promise.resolve(),
      database,
      listVisibleChannels: fakeChannelResolver({ s1: ["c1", "c2"] }),
      now: NOW,
    });

    assert.deepEqual(AppSummaryResponseSchema.parse(payload), {
      dateLabel: "2026-08-19T09:00:00.000Z",
      dmUnread: 7,
      focus: null,
      greetingName: "Doğukan",
      // mentions + replies + friendRequests + serverInvites, the same total the
      // "Yanıt bekliyor" card shows.
      pendingReplies: 4,
      presence: "ONLINE",
      unreadMentions: 3,
    });
  });

  it("rejects a request without a session", async () => {
    const response = await appSummaryRoute(routeDependencies({ authenticate: UNAUTHENTICATED }));

    assert.equal(response.status, 401);
    assert.deepEqual(await readJson(response), { error: "Unauthorized" });
  });

  it("counts mentions only in channels the viewer can still read", async () => {
    const { calls, database } = summaryDatabase();

    await getHomeSummary("u1", {
      applyExpiredFocus: () => Promise.resolve(),
      database,
      // The viewer lost access to every channel of the only server they are in.
      listVisibleChannels: fakeChannelResolver({ s1: [] }),
      now: NOW,
    });

    // Bahsedilmeler K4: the badge now reads the mention query, so this is where the
    // authorization filter has to bite. An empty visible set leaves the channel branches
    // unbuilt — not built and then filtered.
    const mentions = calls.filter((call) => call.operation === "$queryRaw").at(-1);
    const sql = sqlText(mentions?.args);
    assert.ok(!sql.includes("c1"), "no channel id may survive the authorization filter");
    assert.ok(
      !sql.includes('FROM "MessageMention" mm'),
      "an empty visible set must not reach the channel branch at all",
    );
    assert.ok(sql.includes('FROM "DMMessageMention" dmm'), "direct-message mentions still count");
  });

  it("publishes a viewer who chose Görünmez as offline", async () => {
    const { database } = summaryDatabase({ user: { status: "INVISIBLE" } });

    const payload = await getHomeSummary("u1", {
      applyExpiredFocus: () => Promise.resolve(),
      database,
      listVisibleChannels: fakeChannelResolver({ s1: ["c1"] }),
      now: NOW,
    });

    assert.equal(payload.presence, "OFFLINE");
    // The header carries no last-seen field at all, so the mode cannot leak
    // through an activity-derived value either.
    assert.ok(!Object.keys(payload).some((key) => key.toLowerCase().includes("lastseen")));
  });

  it("is registered in the rate limit table and charged before any work", async () => {
    assert.deepEqual(API_RATE_LIMITS["app:summary"], { limit: 120, windowSeconds: 60 });

    const recorded: string[] = [];
    let served = false;
    await appSummaryRoute(
      routeDependencies({
        enforceRateLimit: recordRateLimit(recorded),
        getSummary: () => {
          served = true;
          return Promise.reject(new Error("unreachable"));
        },
      }),
    );

    assert.deepEqual(recorded, ["app:summary"]);
    assert.equal(served, true);
  });

  it("costs five queries and does not grow with the number of channels", async () => {
    const small = summaryDatabase();
    await getHomeSummary("u1", {
      applyExpiredFocus: () => Promise.resolve(),
      database: small.database,
      listVisibleChannels: fakeChannelResolver({ s1: ["c1"] }),
      now: NOW,
    });

    const large = summaryDatabase({
      memberships: Array.from({ length: 40 }, (_unused, index) => ({ serverId: `s${index}` })),
    });
    await getHomeSummary("u1", {
      applyExpiredFocus: () => Promise.resolve(),
      database: large.database,
      listVisibleChannels: fakeChannelResolver(
        Object.fromEntries(
          Array.from({ length: 40 }, (_unused, index) => [
            `s${index}`,
            Array.from({ length: 25 }, (_inner, channel) => `s${index}-c${channel}`),
          ]),
        ),
      ),
      now: NOW,
    });

    // Beşincisi Bahsedilmeler K4 ile geldi: rozetin sayısı artık bahsetme sorgusundan
    // okunuyor. Kanal erişimi bir kez çözülüp hazır geçtiği için sayı kanal adediyle
    // büyümüyor.
    assert.equal(small.queryCount(), 5);
    assert.equal(large.queryCount(), 5);
  });

  it("resolves a focus window that closed while nobody was looking", async () => {
    const { database } = summaryDatabase({
      user: {
        status: "DND",
        statusExpiresAt: new Date("2026-08-19T08:30:00.000Z"),
        statusFocusMinutes: 25,
        statusRestoreTo: "IDLE",
      },
    });
    const restored: unknown[] = [];

    const payload = await getHomeSummary("u1", {
      applyExpiredFocus: (input) => {
        restored.push(input);
        return Promise.resolve();
      },
      database,
      listVisibleChannels: fakeChannelResolver({ s1: ["c1"] }),
      now: NOW,
    });

    assert.deepEqual(restored, [
      {
        expected: {
          status: "DND",
          statusExpiresAt: new Date("2026-08-19T08:30:00.000Z"),
          statusFocusMinutes: 25,
          statusRestoreTo: "IDLE",
        },
        status: "IDLE",
        userId: "u1",
      },
    ]);
    assert.equal(payload.focus, null);
    assert.equal(payload.presence, "IDLE");
  });

  it("returns the payload with a private, uncacheable header", async () => {
    const response = await appSummaryRoute(routeDependencies());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  });
});
