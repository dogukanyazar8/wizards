import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MentionStateKey } from "@wizards/types";

import { ApiError } from "@/lib/api";
import { API_RATE_LIMITS } from "@/lib/api-rate-limit";
import { UNAUTHENTICATED, readJson, recordRateLimit } from "@/lib/home/home-test-doubles";

import {
  mentionContextRoute,
  readMentionKey,
  type MentionContextRouteDependencies,
} from "./route-logic";

const CONTEXT = {
  messages: [
    {
      authorName: "Selin Aksoy",
      avatarUrl: null,
      id: "m-1",
      initials: "SA",
      isMention: true,
      text: "bak",
      time: "2026-08-21T09:41:00.000Z",
    },
  ],
};

function dependencies(
  overrides: Partial<MentionContextRouteDependencies> = {},
): MentionContextRouteDependencies {
  return {
    authenticate: () => Promise.resolve("u1"),
    enforceRateLimit: () => Promise.resolve(),
    getMentionContext: () => Promise.resolve(CONTEXT),
    ...overrides,
  };
}

const REQUEST = new Request("https://whispr.test/api/v1/mentions/channel:mn-1/context");

describe("GET /api/v1/mentions/[mentionId]/context", () => {
  it("oturumsuz isteği reddeder", async () => {
    assert.equal(
      (
        await mentionContextRoute(
          REQUEST,
          "channel:mn-1",
          dependencies({ authenticate: UNAUTHENTICATED }),
        )
      ).status,
      401,
    );
  });

  it("kendi hız bütçesinden düşer", async () => {
    assert.deepEqual(API_RATE_LIMITS["mentions:context"], { limit: 120, windowSeconds: 60 });

    const recorded: string[] = [];
    await mentionContextRoute(
      REQUEST,
      "channel:mn-1",
      dependencies({ enforceRateLimit: recordRateLimit(recorded) }),
    );

    assert.deepEqual(recorded, ["mentions:context"]);
  });

  it("bileşik kimliği şemayla çözer, elle bölmez", () => {
    assert.deepEqual(readMentionKey("everyone:9f3-a:b"), {
      refId: "9f3-a:b",
      source: "everyone",
    } satisfies MentionStateKey);
    assert.deepEqual(readMentionKey("channel%3Amn-1"), { refId: "mn-1", source: "channel" });
  });

  it("tanınmayan kaynak 400 — uydurma bir kaynağa düşmez", async () => {
    for (const raw of ["", "mn-1", "sunucu:mn-1", ":mn-1", "channel:"]) {
      assert.throws(
        () => readMentionKey(raw),
        (error: unknown) => error instanceof ApiError && error.status === 400,
        raw,
      );
    }
  });

  it("geçersiz kimlik isteği 400 ile biter, 500 ile değil", async () => {
    assert.equal((await mentionContextRoute(REQUEST, "sunucu:mn-1", dependencies())).status, 400);
  });

  it("bahsetmenin ±2 mesajını döndürür", async () => {
    const payload = await readJson(
      await mentionContextRoute(REQUEST, "channel:mn-1", dependencies()),
    );

    assert.deepEqual(payload, CONTEXT);
  });

  it("erişilemeyen bahsetme 404 — yasak değil, yok", async () => {
    const response = await mentionContextRoute(
      REQUEST,
      "channel:mn-404",
      dependencies({
        getMentionContext: () => Promise.reject(new ApiError("Mention not found", 404)),
      }),
    );

    assert.equal(response.status, 404);
  });
});
