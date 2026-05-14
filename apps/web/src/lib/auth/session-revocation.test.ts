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

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, mode: "EX", ttlSeconds: number) {
    this.values.set(key, value);
    this.ttlSeconds.set(key, ttlSeconds);
    return mode;
  }
}

describe("session revocation", () => {
  it("marks all sessions issued before the revocation timestamp as revoked", async () => {
    const redis = new MemoryRevocationRedis();
    await revokeUserSessions("user-1", {
      now: new Date("2026-05-14T12:00:00.000Z"),
      redis,
    });

    const revokedAt = Math.floor(new Date("2026-05-14T12:00:00.000Z").getTime() / 1000);

    assert.equal(
      await isUserSessionRevoked("user-1", revokedAt, { redis }),
      true,
    );
    assert.equal(
      await isUserSessionRevoked("user-1", revokedAt + 1, { redis }),
      false,
    );
  });

  it("bounds Redis revocation checks with a short token-local interval", () => {
    assert.equal(shouldCheckSessionRevocation(undefined, 100), true);
    assert.equal(shouldCheckSessionRevocation(41, 100), false);
    assert.equal(shouldCheckSessionRevocation(40, 100), true);
  });
});
