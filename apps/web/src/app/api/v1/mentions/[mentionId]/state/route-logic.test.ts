import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Mention, MentionCounts } from "@wizards/types";

import { API_RATE_LIMITS } from "@/lib/api-rate-limit";
import { UNAUTHENTICATED, readJson, recordRateLimit } from "@/lib/home/home-test-doubles";
import type { MentionRealtimePublisher } from "@/lib/mentions/realtime";

import { mentionStateRoute, type MentionStateRouteDependencies } from "./route-logic";

const COUNTS: MentionCounts = {
  all: 3,
  bySource: { s1: 3 },
  everyone: 0,
  me: 3,
  readLater: 0,
  roleNames: [],
  role: 0,
  thread: 0,
  unread: 2,
};

const MENTION: Mention = {
  author: {
    avatarUrl: null,
    handle: "selin",
    id: "u2",
    initials: "SA",
    name: "Selin Aksoy",
  },
  body: "şuna bir bakar mısın",
  createdAt: "2026-08-21T09:41:00.000Z",
  href: "/channels/s1/c1?message=m-1",
  id: "channel:mn-1",
  kind: "me",
  messageId: "m-1",
  permalink: "https://whispr.test/channels/s1/c1?message=m-1",
  readLater: false,
  source: {
    channelId: "c1",
    channelName: "genel",
    serverId: "s1",
    serverInitial: "W",
    serverName: "Whispr",
    type: "channel",
  },
  stateKey: { refId: "mn-1", source: "channel" },
  tag: "@Doğukan Yazar",
  unread: false,
};

function recordingPublisher(): MentionRealtimePublisher & { events: unknown[] } {
  const events: unknown[] = [];

  return {
    events,
    publishMentionCreated: (userId, mention, counts) =>
      events.push({ counts, mention, type: "mention:new", userId }),
    publishMentionReadAll: (userId, counts) =>
      events.push({ counts, type: "mention:read-all", userId }),
    publishMentionState: (userId, state, counts) =>
      events.push({ counts, state, type: "mention:state", userId }),
  };
}

function dependencies(
  overrides: Partial<MentionStateRouteDependencies> = {},
): MentionStateRouteDependencies {
  return {
    authenticate: () => Promise.resolve("u1"),
    countMentions: () => Promise.resolve(COUNTS),
    enforceRateLimit: () => Promise.resolve(),
    publisher: recordingPublisher(),
    updateMentionState: () => Promise.resolve(MENTION),
    ...overrides,
  };
}

function request(body: unknown): Request {
  return new Request("https://whispr.test/api/v1/mentions/channel:mn-1/state", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

describe("PATCH /api/v1/mentions/[mentionId]/state", () => {
  it("oturumsuz isteği reddeder", async () => {
    assert.equal(
      (
        await mentionStateRoute(
          request({ read: true }),
          "channel:mn-1",
          dependencies({ authenticate: UNAUTHENTICATED }),
        )
      ).status,
      401,
    );
  });

  it("kendi hız bütçesinden düşer", async () => {
    assert.deepEqual(API_RATE_LIMITS["mentions:state"], { limit: 240, windowSeconds: 60 });

    const recorded: string[] = [];
    await mentionStateRoute(
      request({ read: true }),
      "channel:mn-1",
      dependencies({ enforceRateLimit: recordRateLimit(recorded) }),
    );

    assert.deepEqual(recorded, ["mentions:state"]);
  });

  it("üç alanı da servise geçirir", async () => {
    const seen: unknown[] = [];
    await mentionStateRoute(
      request({ dismissed: false, read: true, readLater: true }),
      "channel:mn-1",
      dependencies({
        updateMentionState: (_userId, key, patch) => {
          seen.push({ key, patch });
          return Promise.resolve(MENTION);
        },
      }),
    );

    assert.deepEqual(seen, [
      {
        key: { refId: "mn-1", source: "channel" },
        patch: { dismissed: false, read: true, readLater: true },
      },
    ]);
  });

  it("boş yama reddedilir — yazacak bir şeyi olmayan istek satır oluşturmasın", async () => {
    assert.equal(
      (await mentionStateRoute(request({}), "channel:mn-1", dependencies())).status,
      400,
    );
  });

  it("bilinmeyen alan reddedilir", async () => {
    assert.equal(
      (await mentionStateRoute(request({ archived: true }), "channel:mn-1", dependencies())).status,
      400,
    );
  });

  it("güncel kartı döndürür — istemcinin listeyi yeniden çekmesi gerekmez", async () => {
    const payload = await readJson(
      await mentionStateRoute(request({ read: true }), "channel:mn-1", dependencies()),
    );

    assert.equal(payload.id, "channel:mn-1");
    assert.equal(payload.unread, false);
  });

  it("aynı hesabın diğer yüzeylerine mention:state yayınlar", async () => {
    const publisher = recordingPublisher();
    await mentionStateRoute(request({ read: true }), "channel:mn-1", dependencies({ publisher }));

    assert.deepEqual(publisher.events, [
      {
        counts: COUNTS,
        state: {
          dismissed: false,
          mentionId: "channel:mn-1",
          readLater: false,
          unread: false,
        },
        type: "mention:state",
        userId: "u1",
      },
    ]);
  });

  it("geçersiz bileşik kimlik 400", async () => {
    assert.equal(
      (await mentionStateRoute(request({ read: true }), "sunucu:mn-1", dependencies())).status,
      400,
    );
  });
});
