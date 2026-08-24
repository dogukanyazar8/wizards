import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MentionCounts } from "@wizards/types";

import { API_RATE_LIMITS } from "@/lib/api-rate-limit";
import { UNAUTHENTICATED, readJson, recordRateLimit } from "@/lib/home/home-test-doubles";

import { mentionCountsRoute, type MentionCountsRouteDependencies } from "./route-logic";

const COUNTS: MentionCounts = {
  all: 7,
  bySource: { dm: 2, s1: 5 },
  everyone: 1,
  me: 3,
  readLater: 1,
  roleNames: [],
  role: 2,
  thread: 1,
  unread: 4,
};

function dependencies(
  overrides: Partial<MentionCountsRouteDependencies> = {},
): MentionCountsRouteDependencies {
  return {
    authenticate: () => Promise.resolve("u1"),
    countMentions: () => Promise.resolve(COUNTS),
    enforceRateLimit: () => Promise.resolve(),
    ...overrides,
  };
}

function request(search = ""): Request {
  return new Request(`https://whispr.test/api/v1/mentions/counts${search}`);
}

describe("GET /api/v1/mentions/counts", () => {
  it("oturumsuz isteği reddeder", async () => {
    assert.equal(
      (await mentionCountsRoute(request(), dependencies({ authenticate: UNAUTHENTICATED }))).status,
      401,
    );
  });

  it("kendi hız bütçesi var — sayaçlar her socket olayından sonra okunuyor", async () => {
    assert.deepEqual(API_RATE_LIMITS["mentions:counts"], { limit: 240, windowSeconds: 60 });

    const recorded: string[] = [];
    await mentionCountsRoute(
      request(),
      dependencies({ enforceRateLimit: recordRateLimit(recorded) }),
    );

    assert.deepEqual(recorded, ["mentions:counts"]);
  });

  it("varsayılan pencere ekranın penceresi: 30 gün", async () => {
    const seen: string[] = [];
    await mentionCountsRoute(
      request(),
      dependencies({
        countMentions: (_userId, window) => {
          seen.push(window);
          return Promise.resolve(COUNTS);
        },
      }),
    );

    assert.deepEqual(seen, ["30d"]);
  });

  it("window=all eskileri de sayar", async () => {
    const seen: string[] = [];
    await mentionCountsRoute(
      request("?window=all"),
      dependencies({
        countMentions: (_userId, window) => {
          seen.push(window);
          return Promise.resolve(COUNTS);
        },
      }),
    );

    assert.deepEqual(seen, ["all"]);
  });

  it("bütün kovaları döndürür — ray, sekmeler ve rozet tek nesneden okur", async () => {
    const payload = await readJson(await mentionCountsRoute(request(), dependencies()));

    assert.deepEqual(payload, COUNTS);
  });

  it("tanınmayan pencereyi reddeder", async () => {
    assert.equal((await mentionCountsRoute(request("?window=90d"), dependencies())).status, 400);
  });
});
