import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isUserSessionRevoked,
  revokeUserSessions,
  shouldCheckSessionRevocation,
} from "./session-revocation";

class MemoryRevocationRedis {
  public readonly values = new Map<string, string>();
  public readonly ttlSeconds = new Map<string, number>();
  public failGet = false;
  public failSet = false;

  async get(key: string) {
    if (this.failGet) {
      throw new Error("redis get unavailable");
    }

    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, mode: "EX", ttlSeconds: number) {
    if (this.failSet) {
      throw new Error("redis set unavailable");
    }

    this.values.set(key, value);
    this.ttlSeconds.set(key, ttlSeconds);
    return mode;
  }
}

describe("session revocation", () => {
  it("marks all sessions issued before the revocation timestamp as revoked", async () => {
    const redis = new MemoryRevocationRedis();
    const result = await revokeUserSessions("user-1", {
      now: new Date("2026-05-14T12:00:00.000Z"),
      redis,
    });

    const revokedAt = Math.floor(new Date("2026-05-14T12:00:00.000Z").getTime() / 1000);
    assert.equal(result.ok, true);
    assert.equal(result.revokedAfterSeconds, revokedAt);

    assert.equal(
      await isUserSessionRevoked("user-1", revokedAt, { redis }),
      true,
    );
    assert.equal(
      await isUserSessionRevoked("user-1", revokedAt + 1, { redis }),
      false,
    );
  });

  it("returns a failed result when Redis cannot persist the revocation marker", async () => {
    const redis = new MemoryRevocationRedis();
    redis.failSet = true;

    const result = await revokeUserSessions("user-1", {
      now: new Date("2026-05-14T12:00:00.000Z"),
      redis,
    });

    assert.equal(result.ok, false);
    assert.equal(result.revokedAfter.toISOString(), "2026-05-14T12:00:00.000Z");
  });

  it("falls back to a durable revocation timestamp when Redis is unavailable", async () => {
    const redis = new MemoryRevocationRedis();
    redis.failGet = true;
    const revokedAt = Math.floor(new Date("2026-05-14T12:00:00.000Z").getTime() / 1000);

    assert.equal(
      await isUserSessionRevoked("user-1", revokedAt, {
        loadDurableRevokedAfter: async () => new Date("2026-05-14T12:00:00.000Z"),
        redis,
      }),
      true,
    );
  });

  it("hydrates Redis from a durable revocation miss to repair failed writes", async () => {
    const redis = new MemoryRevocationRedis();
    const revokedAt = Math.floor(new Date("2026-05-14T12:00:00.000Z").getTime() / 1000);

    assert.equal(
      await isUserSessionRevoked("user-1", revokedAt, {
        loadDurableRevokedAfter: async () => new Date("2026-05-14T12:00:00.000Z"),
        redis,
      }),
      true,
    );
    assert.equal(redis.values.get("auth:session-revoked-after:user-1"), String(revokedAt));
  });

  it("caches empty durable revocation checks briefly", async () => {
    const redis = new MemoryRevocationRedis();

    assert.equal(
      await isUserSessionRevoked("user-1", 100, {
        loadDurableRevokedAfter: async () => null,
        redis,
      }),
      false,
    );
    assert.equal(redis.values.get("auth:session-revoked-after:user-1"), "0");
    assert.equal(redis.ttlSeconds.get("auth:session-revoked-after:user-1"), 60);
  });

  it("bounds Redis revocation checks with a short token-local interval", () => {
    assert.equal(shouldCheckSessionRevocation(undefined, 100), true);
    assert.equal(shouldCheckSessionRevocation(41, 100), false);
    assert.equal(shouldCheckSessionRevocation(40, 100), true);
  });
});
