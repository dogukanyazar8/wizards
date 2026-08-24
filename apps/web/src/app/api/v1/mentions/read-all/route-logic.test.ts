import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MentionCounts } from "@wizards/types";

import { ApiError } from "@/lib/api";
import { API_RATE_LIMITS } from "@/lib/api-rate-limit";
import { UNAUTHENTICATED, readJson, recordRateLimit } from "@/lib/home/home-test-doubles";
import type { MentionRealtimePublisher } from "@/lib/mentions/realtime";

import { mentionReadAllRoute, type MentionReadAllRouteDependencies } from "./route-logic";

const COUNTS: MentionCounts = {
  all: 4,
  bySource: { s1: 4 },
  everyone: 0,
  me: 4,
  readLater: 0,
  roleNames: [],
  role: 0,
  thread: 0,
  unread: 0,
};

function recordingPublisher(): MentionRealtimePublisher & { events: unknown[] } {
  const events: unknown[] = [];

  return {
    events,
    publishMentionCreated: () => events.push("mention:new"),
    publishMentionReadAll: (userId, counts) =>
      events.push({ counts, type: "mention:read-all", userId }),
    publishMentionState: () => events.push("mention:state"),
  };
}

function dependencies(
  overrides: Partial<MentionReadAllRouteDependencies> = {},
): MentionReadAllRouteDependencies {
  return {
    authenticate: () => Promise.resolve("u1"),
    countMentions: () => Promise.resolve(COUNTS),
    enforceRateLimit: () => Promise.resolve(),
    markAllRead: () => Promise.resolve({ affected: 4, undoToken: "tok-1" }),
    publisher: recordingPublisher(),
    undoReadAll: () => Promise.resolve({ restored: 4 }),
    ...overrides,
  };
}

function request(search: string, body: unknown = {}): Request {
  return new Request(`https://whispr.test/api/v1/mentions/read-all${search}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/v1/mentions/read-all", () => {
  it("oturumsuz isteği reddeder", async () => {
    assert.equal(
      (await mentionReadAllRoute(request(""), dependencies({ authenticate: UNAUTHENTICATED })))
        .status,
      401,
    );
  });

  it("dar bir hız bütçesi taşır", async () => {
    assert.deepEqual(API_RATE_LIMITS["mentions:read-all"], { limit: 20, windowSeconds: 60 });

    const recorded: string[] = [];
    await mentionReadAllRoute(
      request(""),
      dependencies({ enforceRateLimit: recordRateLimit(recorded) }),
    );

    assert.deepEqual(recorded, ["mentions:read-all"]);
  });

  it("etkilenen sayıyı ve 10 dakikalık geri alma jetonunu döndürür", async () => {
    const payload = await readJson(await mentionReadAllRoute(request(""), dependencies()));

    assert.deepEqual(payload, { affected: 4, undoToken: "tok-1" });
  });

  it("yalnız bahsetme yolunu çağırır — genel markAllNotificationsRead değil (K11)", async () => {
    const called: string[] = [];
    await mentionReadAllRoute(
      request(""),
      dependencies({
        markAllRead: () => {
          called.push("markAllMentionsRead");
          return Promise.resolve({ affected: 0, undoToken: "" });
        },
        undoReadAll: () => {
          called.push("undo");
          return Promise.resolve({ restored: 0 });
        },
      }),
    );

    assert.deepEqual(called, ["markAllMentionsRead"]);
  });

  it("undo=1 geri alma yolunu sürer ve jetonu taşır", async () => {
    const seen: string[] = [];
    const payload = await readJson(
      await mentionReadAllRoute(
        request("?undo=1", { undoToken: "tok-1" }),
        dependencies({
          markAllRead: () => Promise.reject(new Error("read-all must not run on undo")),
          undoReadAll: (_userId, token) => {
            seen.push(token);
            return Promise.resolve({ restored: 4 });
          },
        }),
      ),
    );

    assert.deepEqual(seen, ["tok-1"]);
    assert.deepEqual(payload, { restored: 4 });
  });

  it("süresi dolmuş jeton 410 ile reddedilir", async () => {
    const response = await mentionReadAllRoute(
      request("?undo=1", { undoToken: "eski" }),
      dependencies({
        undoReadAll: () =>
          Promise.reject(new ApiError("Undo window has expired", 410, "MENTION_UNDO_EXPIRED")),
      }),
    );

    assert.equal(response.status, 410);
    assert.equal((await readJson(response)).code, "MENTION_UNDO_EXPIRED");
  });

  it("iki yolda da mention:read-all yayınlar", async () => {
    const publisher = recordingPublisher();
    await mentionReadAllRoute(request(""), dependencies({ publisher }));
    await mentionReadAllRoute(
      request("?undo=1", { undoToken: "tok-1" }),
      dependencies({ publisher }),
    );

    assert.deepEqual(publisher.events, [
      { counts: COUNTS, type: "mention:read-all", userId: "u1" },
      { counts: COUNTS, type: "mention:read-all", userId: "u1" },
    ]);
  });

  it("bilinmeyen gövde alanı reddedilir", async () => {
    assert.equal(
      (await mentionReadAllRoute(request("", { everything: true }), dependencies())).status,
      400,
    );
  });
});
