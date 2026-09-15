import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Redis from "ioredis";

import {
  parsePresenceRecord,
  readPresenceMap,
  readPresenceState,
  type PresenceFallback,
} from "./presence";

it("expires cached status text without changing online presence", () => {
  assert.deepEqual(
    parsePresenceRecord(
      { status: "ONLINE", customStatus: "Release", customStatusExpiresAt: "2000-01-01T00:00:00Z" },
      { status: "OFFLINE", customStatus: null },
    ),
    { status: "ONLINE", customStatus: null },
  );
});

type StoredPresence = {
  /** How many sockets the presence set reports for this user. */
  readonly socketCount: number;
  /** `none` models a key whose TTL already expired. */
  readonly stored: Record<string, string> | string | null;
};

/**
 * Minimal ioredis stand-in: the reader issues one pipeline of
 * zremrangebyscore/zcard/type per user, then a second pipeline of hgetall/get
 * for the users whose key still exists.
 */
function createPresenceRedis(
  byUserId: Record<string, StoredPresence>,
  options: { readonly failExec?: boolean } = {},
): Redis {
  const order: string[] = [];
  let phase: "sockets" | "values" = "sockets";

  const pipeline = {
    zremrangebyscore(key: string) {
      order.push(key);
      return pipeline;
    },
    zcard(key: string) {
      order.push(key);
      return pipeline;
    },
    type(key: string) {
      order.push(key);
      return pipeline;
    },
    hgetall(key: string) {
      order.push(key);
      return pipeline;
    },
    get(key: string) {
      order.push(key);
      return pipeline;
    },
    async exec() {
      if (options.failExec) {
        throw new Error("redis unavailable");
      }

      const keys = [...order];
      order.length = 0;

      if (phase === "sockets") {
        phase = "values";
        const results: Array<[null, unknown]> = [];
        // Three commands per user — zremrangebyscore, zcard, type — and the
        // reader indexes the replies by that stride, so all three must answer.
        for (let index = 0; index < keys.length; index += 3) {
          const userId = String(keys[index]).split(":").at(-1) ?? "";
          const entry = byUserId[userId];
          results.push([null, 0]);
          results.push([null, entry?.socketCount ?? 0]);
          results.push([
            null,
            entry?.stored === null || entry?.stored === undefined
              ? "none"
              : typeof entry.stored === "string"
                ? "string"
                : "hash",
          ]);
        }
        return results;
      }

      return keys.map((key): [null, unknown] => {
        const userId = key.split(":").at(-1) ?? "";
        return [null, byUserId[userId]?.stored ?? null];
      });
    },
  };

  return { pipeline: () => pipeline } as unknown as Redis;
}

function offlineFallback(userId: string): PresenceFallback {
  return { customStatus: null, status: "OFFLINE", userId };
}

describe("presence state", () => {
  it("marks a connected user who publishes OFFLINE as hidden", async () => {
    // Görünmez writes OFFLINE to the presence hash and keeps the socket open, so
    // "connected while publishing OFFLINE" is exactly the invisible user. Their
    // last-seen must not keep advancing behind an offline dot.
    const redis = createPresenceRedis({
      hidden: { socketCount: 1, stored: { customStatus: "", status: "OFFLINE" } },
    });

    const state = await readPresenceState(redis, [offlineFallback("hidden")]);

    assert.equal(state.presenceByUserId.get("hidden")?.status, "OFFLINE");
    assert.equal(state.hiddenUserIds.has("hidden"), true);
  });

  it("leaves a genuinely disconnected user out of the hidden set", async () => {
    const redis = createPresenceRedis({
      away: { socketCount: 0, stored: { customStatus: "", status: "ONLINE" } },
    });

    const state = await readPresenceState(redis, [offlineFallback("away")]);

    assert.equal(state.presenceByUserId.get("away")?.status, "OFFLINE");
    assert.equal(state.hiddenUserIds.has("away"), false);
  });

  it("leaves visible users out of the hidden set", async () => {
    const redis = createPresenceRedis({
      busy: { socketCount: 2, stored: { customStatus: "deep work", status: "DND" } },
      here: { socketCount: 1, stored: { customStatus: "", status: "ONLINE" } },
    });

    const state = await readPresenceState(redis, [
      offlineFallback("here"),
      offlineFallback("busy"),
    ]);

    assert.equal(state.presenceByUserId.get("here")?.status, "ONLINE");
    assert.equal(state.presenceByUserId.get("busy")?.status, "DND");
    assert.equal(state.hiddenUserIds.size, 0);
  });

  it("hides a connected user whose presence key expired, since they still read as offline", async () => {
    const redis = createPresenceRedis({ stale: { socketCount: 1, stored: null } });

    const state = await readPresenceState(redis, [offlineFallback("stale")]);

    assert.equal(state.presenceByUserId.get("stale")?.status, "OFFLINE");
    assert.equal(state.hiddenUserIds.has("stale"), true);
  });

  it("fails open so a Redis outage cannot blank every last-seen line at once", async () => {
    const redis = createPresenceRedis(
      { hidden: { socketCount: 1, stored: { customStatus: "", status: "OFFLINE" } } },
      { failExec: true },
    );

    const state = await readPresenceState(redis, [offlineFallback("hidden")]);

    assert.equal(state.presenceByUserId.get("hidden")?.status, "OFFLINE");
    assert.equal(state.hiddenUserIds.size, 0);
  });

  it("keeps readPresenceMap on its existing contract", async () => {
    const redis = createPresenceRedis({
      here: { socketCount: 1, stored: { customStatus: "on a call", status: "ONLINE" } },
    });

    const presenceByUserId = await readPresenceMap(redis, [offlineFallback("here")]);

    assert.deepEqual(presenceByUserId.get("here"), {
      customStatus: "on a call",
      status: "ONLINE",
    });
  });
});
