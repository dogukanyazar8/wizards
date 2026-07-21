import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMobilePushTokenFingerprint,
  hashMobilePushSessionId,
  registerMobilePushToken,
  revokeMobilePushToken,
  type MobilePushTokenStore,
} from "./push-notifications";

type StoredRow = {
  platform: string;
  provider: string;
  sessionKey: string;
  token: string;
  tokenFingerprint: string;
  userId: string;
};

class MemoryPushTokenStore implements MobilePushTokenStore {
  readonly rows = new Map<string, StoredRow>();

  mobilePushToken = {
    deleteMany: async ({
      where,
    }: {
      where: { NOT?: { sessionKey: string }; sessionKey?: string; token?: string };
    }) => {
      let count = 0;
      for (const [key, row] of this.rows) {
        const sessionMatch = where.sessionKey === undefined || row.sessionKey === where.sessionKey;
        const tokenMatch = where.token === undefined || row.token === where.token;
        const notMatch = where.NOT === undefined || row.sessionKey !== where.NOT.sessionKey;
        if (sessionMatch && tokenMatch && notMatch) {
          this.rows.delete(key);
          count += 1;
        }
      }
      return { count };
    },
    upsert: async ({
      create,
    }: {
      create: StoredRow;
      update: unknown;
      where: { sessionKey: string };
    }) => {
      this.rows.set(create.sessionKey, create);
      return create;
    },
  };
}

describe("mobile push token storage (prisma)", () => {
  it("upserts by hashed session key and returns a fingerprint without leaking the token", async () => {
    const store = new MemoryPushTokenStore();
    const token = "ExpoPushToken[aaaaaaaaaaaaaaaaaaaa]";
    const response = await registerMobilePushToken({
      db: store,
      now: new Date("2026-07-20T10:00:00.000Z"),
      platform: "android",
      provider: "expo",
      sessionId: "session-1",
      token,
      userId: "user-1",
    });

    const row = store.rows.get(hashMobilePushSessionId("session-1"));
    assert.ok(row);
    assert.equal(row.token, token);
    assert.equal(row.userId, "user-1");
    assert.equal(row.platform, "android");
    assert.equal(row.tokenFingerprint, getMobilePushTokenFingerprint(token));
    assert.equal(response.registered, true);
    assert.equal(response.provider, "expo");
    assert.equal(response.registeredAt, "2026-07-20T10:00:00.000Z");
    assert.equal(response.tokenFingerprint, getMobilePushTokenFingerprint(token));
    assert.equal(JSON.stringify(response).includes(token), false);
  });

  it("steals a token from an older session on re-login", async () => {
    const store = new MemoryPushTokenStore();
    const token = "ExpoPushToken[cccccccccccccccccccc]";
    await registerMobilePushToken({
      db: store,
      platform: "android",
      provider: "expo",
      sessionId: "old-session",
      token,
      userId: "user-1",
    });
    await registerMobilePushToken({
      db: store,
      platform: "android",
      provider: "expo",
      sessionId: "new-session",
      token,
      userId: "user-1",
    });

    assert.equal(store.rows.size, 1);
    assert.ok(store.rows.get(hashMobilePushSessionId("new-session")));
  });

  it("revokes by session and reports whether a row existed", async () => {
    const store = new MemoryPushTokenStore();
    await registerMobilePushToken({
      db: store,
      platform: "ios",
      provider: "expo",
      sessionId: "session-2",
      token: "ExponentPushToken[bbbbbbbbbbbbbbbbbbbb]",
      userId: "user-1",
    });

    const revoked = await revokeMobilePushToken({
      db: store,
      now: new Date("2026-07-20T10:05:00.000Z"),
      sessionId: "session-2",
    });
    assert.deepEqual(revoked, { revoked: true, revokedAt: "2026-07-20T10:05:00.000Z" });

    const revokedAgain = await revokeMobilePushToken({
      db: store,
      now: new Date("2026-07-20T10:06:00.000Z"),
      sessionId: "session-2",
    });
    assert.equal(revokedAgain.revoked, false);
  });
});
