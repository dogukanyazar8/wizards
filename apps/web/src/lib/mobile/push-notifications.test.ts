import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMobilePushTokenFingerprint,
  getMobilePushTokenKey,
  MOBILE_PUSH_TOKEN_TTL_SECONDS,
  registerMobilePushToken,
  revokeMobilePushToken,
} from "./push-notifications";

class MemoryPushRedis {
  readonly deletedKeys: string[] = [];
  readonly writes: Array<{
    key: string;
    mode: "EX";
    ttlSeconds: number;
    value: string;
  }> = [];

  async del(key: string) {
    this.deletedKeys.push(key);
    return this.writes.some((write) => write.key === key) ? 1 : 0;
  }

  async set(key: string, value: string, mode: "EX", ttlSeconds: number) {
    this.writes.push({ key, mode, ttlSeconds, value });
    return "OK" as const;
  }
}

describe("mobile push notification token storage", () => {
  it("stores the raw provider token only in Redis while returning a fingerprint", async () => {
    const redis = new MemoryPushRedis();
    const token = "ExpoPushToken[aaaaaaaaaaaaaaaaaaaa]";
    const response = await registerMobilePushToken({
      now: new Date("2026-07-01T10:00:00.000Z"),
      platform: "android",
      provider: "expo",
      redis,
      sessionId: "session-1",
      token,
      userId: "user-1",
    });

    assert.equal(redis.writes.length, 1);
    assert.equal(redis.writes[0]?.key, getMobilePushTokenKey("session-1"));
    assert.equal(redis.writes[0]?.mode, "EX");
    assert.equal(redis.writes[0]?.ttlSeconds, MOBILE_PUSH_TOKEN_TTL_SECONDS);
    assert.match(redis.writes[0]?.value ?? "", /ExpoPushToken/);
    assert.equal(response.registered, true);
    assert.equal(response.provider, "expo");
    assert.equal(response.registeredAt, "2026-07-01T10:00:00.000Z");
    assert.equal(response.tokenFingerprint, getMobilePushTokenFingerprint(token));
    assert.equal(JSON.stringify(response).includes(token), false);
  });

  it("revokes the token bound to the mobile access session", async () => {
    const redis = new MemoryPushRedis();

    await registerMobilePushToken({
      platform: "ios",
      provider: "expo",
      redis,
      sessionId: "session-2",
      token: "ExponentPushToken[bbbbbbbbbbbbbbbbbbbb]",
      userId: "user-1",
    });
    const response = await revokeMobilePushToken({
      now: new Date("2026-07-01T10:05:00.000Z"),
      redis,
      sessionId: "session-2",
    });

    assert.deepEqual(redis.deletedKeys, [getMobilePushTokenKey("session-2")]);
    assert.deepEqual(response, {
      revoked: true,
      revokedAt: "2026-07-01T10:05:00.000Z",
    });
  });
});
