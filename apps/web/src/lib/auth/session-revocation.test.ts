import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRevokedJwtUserState,
  completeSessionRevocationCheck,
  ensureSessionStartedAt,
  isUserSessionRevoked,
  revokeUserSessions,
  shouldCheckSessionRevocation,
  validateAuthSessionToken,
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
  it("authorizes an active durable web session", async () => {
    const result = await validateAuthSessionToken(
      {
        authSessionId: "session-1",
        id: "user-1",
        sessionStartedAt: 100,
      },
      {
        checkAuthSession: async () => true,
        checkGlobalRevocation: async () => false,
      },
    );

    assert.deepEqual(result, {
      identity: {
        authSessionId: "session-1",
        sessionStartedAtSeconds: 100,
        userId: "user-1",
      },
      status: "active",
    });
  });

  it("rejects a revoked durable AuthSession", async () => {
    const result = await validateAuthSessionToken(
      { authSessionId: "session-1", id: "user-1", sessionStartedAt: 100 },
      {
        checkAuthSession: async () => false,
        checkGlobalRevocation: async () => false,
      },
    );

    assert.equal(result.status, "revoked");
  });

  it("rejects a session issued at or before sessionsRevokedAfter", async () => {
    const result = await validateAuthSessionToken(
      { authSessionId: "session-1", id: "user-1", sessionStartedAt: 100 },
      {
        checkAuthSession: async () => true,
        checkGlobalRevocation: async () => true,
      },
    );

    assert.equal(result.status, "revoked");
  });

  it("rejects token.revoked before consulting Redis or Postgres", async () => {
    let controlChecks = 0;

    const result = await validateAuthSessionToken(
      {
        authSessionId: "session-1",
        id: "user-1",
        revoked: true,
        sessionStartedAt: 100,
      },
      {
        checkAuthSession: async () => {
          controlChecks += 1;
          return true;
        },
        checkGlobalRevocation: async () => {
          controlChecks += 1;
          return false;
        },
      },
    );

    assert.equal(result.status, "revoked");
    assert.equal(controlChecks, 0);
  });

  it("rejects a signed token without a durable session identity", async () => {
    const result = await validateAuthSessionToken(
      { id: "user-1", sessionStartedAt: 100 },
      {
        checkAuthSession: async () => true,
        checkGlobalRevocation: async () => false,
      },
    );

    assert.equal(result.status, "revoked");
  });

  it("fails closed when a revocation control is unavailable", async () => {
    const databaseFailure = await validateAuthSessionToken(
      { authSessionId: "session-1", id: "user-1", sessionStartedAt: 100 },
      {
        checkAuthSession: async () => {
          throw new Error("database unavailable");
        },
        checkGlobalRevocation: async () => false,
      },
    );
    const redisAndDatabaseFailure = await validateAuthSessionToken(
      { authSessionId: "session-1", id: "user-1", sessionStartedAt: 100 },
      {
        checkAuthSession: async () => true,
        checkGlobalRevocation: async () => undefined,
      },
    );

    assert.equal(databaseFailure.status, "unavailable");
    assert.equal(redisAndDatabaseFailure.status, "unavailable");
  });

  it("marks all sessions issued before the revocation timestamp as revoked", async () => {
    const redis = new MemoryRevocationRedis();
    const result = await revokeUserSessions("user-1", {
      now: new Date("2026-05-14T12:00:00.000Z"),
      redis,
    });

    const revokedAt = Math.floor(new Date("2026-05-14T12:00:00.000Z").getTime() / 1000);
    assert.equal(result.ok, true);
    assert.equal(result.revokedAfterSeconds, revokedAt);

    assert.equal(await isUserSessionRevoked("user-1", revokedAt, { redis }), true);
    assert.equal(await isUserSessionRevoked("user-1", revokedAt + 1, { redis }), false);
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

  it("disconnects all user sockets even when Redis marker persistence fails", async () => {
    const redis = new MemoryRevocationRedis();
    const disconnectedUsers: string[] = [];
    redis.failSet = true;

    const result = await revokeUserSessions("user-1", {
      disconnectSockets: (userId: string) => {
        disconnectedUsers.push(userId);
      },
      now: new Date("2026-05-14T12:00:00.000Z"),
      redis,
    } as never);

    assert.equal(result.ok, false);
    assert.deepEqual(disconnectedUsers, ["user-1"]);
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

  it("does not trust a stale negative cache after a revocation write failure", async () => {
    const redis = new MemoryRevocationRedis();
    const key = "auth:session-revoked-after:user-1";
    const revokedAt = new Date("2026-05-14T12:00:00.000Z");
    redis.values.set(key, "0");
    redis.failSet = true;

    assert.equal((await revokeUserSessions("user-1", { now: revokedAt, redis })).ok, false);
    assert.equal(
      await isUserSessionRevoked("user-1", Math.floor(revokedAt.getTime() / 1_000), {
        loadDurableRevokedAfter: async () => revokedAt,
        redis,
      }),
      true,
    );
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

  it("keeps the original session start when Auth.js refreshes iat", async () => {
    const redis = new MemoryRevocationRedis();
    const token: { iat: number; sessionStartedAt?: number } = { iat: 100 };

    assert.equal(ensureSessionStartedAt(token, 101), 100);
    token.iat = 159;
    assert.equal(ensureSessionStartedAt(token, 160), 100);
    redis.values.set("auth:session-revoked-after:user-1", "150");

    assert.equal(await isUserSessionRevoked("user-1", token.sessionStartedAt, { redis }), true);
  });

  it("does not advance the check timestamp when Redis and Postgres are unavailable", async () => {
    const redis = new MemoryRevocationRedis();
    const token = { revocationCheckedAt: 40 };
    redis.failGet = true;

    const result = await isUserSessionRevoked("user-1", 10, {
      loadDurableRevokedAfter: async () => {
        throw new Error("database unavailable");
      },
      redis,
    });

    assert.equal(result, undefined);
    assert.equal(completeSessionRevocationCheck(token, result, 100), false);
    assert.equal(token.revocationCheckedAt, 40);
  });

  it("records completed active checks and preserves banned identity for appeals", () => {
    const checkedToken = { revocationCheckedAt: 40 };
    assert.equal(completeSessionRevocationCheck(checkedToken, false, 100), false);
    assert.equal(checkedToken.revocationCheckedAt, 100);

    const bannedToken = {
      authStatusHydrated: false,
      deletedAt: null,
      id: "user-1",
      isBanned: false,
      revoked: false,
      sub: "user-1",
    };
    assert.equal(
      applyRevokedJwtUserState(bannedToken, { deletedAt: null, isBanned: true }),
      "banned",
    );
    assert.equal(bannedToken.id, "user-1");
    assert.equal(bannedToken.sub, "user-1");
    assert.equal(bannedToken.isBanned, true);
    assert.equal(bannedToken.revoked, false);
  });

  it("clears identity for revoked active accounts", () => {
    const token = {
      authStatusHydrated: true,
      deletedAt: null,
      id: "user-1",
      isBanned: false,
      revoked: false,
      sub: "user-1",
    };

    assert.equal(applyRevokedJwtUserState(token, { deletedAt: null, isBanned: false }), "revoked");
    assert.equal(token.id, "");
    assert.equal(token.sub, "");
    assert.equal(token.revoked, true);
  });
});
