import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import {
  issueTrustedDevice,
  verifyTrustedDevice,
  getTrustedDeviceCookieConfig,
  TRUSTED_DEVICE_TTL_SECONDS,
  type TrustedDeviceRecord,
  type TrustedDeviceUser,
} from "./trusted-device";

const user: TrustedDeviceUser = {
  id: "user-1",
  email: "user@example.test",
  emailVerified: true,
  isBanned: false,
  deletedAt: null,
  passwordHash: "hash",
  sessionsRevokedAfter: null,
  twoFactorEnabled: true,
  twoFactorSecret: null,
  twoFactorSecretCiphertext: "encrypted-secret",
};
const now = new Date("2026-09-17T12:00:00Z");
const agent = "test-browser";
function harness() {
  const records = new Map<string, TrustedDeviceRecord>();
  return {
    records,
    options: {
      now: () => now,
      store: {
        create: async (record: TrustedDeviceRecord) => {
          records.set(record.tokenHash, record);
        },
        find: async (hash: string) => records.get(hash) ?? null,
      },
    },
  };
}

test("trust stores only a token hash, stays reusable and expires at exactly 30 days", async () => {
  const { records, options } = harness();
  const token = await issueTrustedDevice(user, agent, options);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const record = records.get(createHash("sha256").update(token).digest("hex"));
  assert.ok(record);
  assert.ok(record.purpose.length <= 64);
  assert.equal(JSON.stringify(record).includes(token), false);
  assert.equal(record.expiresAt.getTime() - now.getTime(), 30 * 86400_000);
  for (let i = 0; i < 2; i++)
    assert.equal(await verifyTrustedDevice(token, user, agent, options), true);
  assert.equal(
    await verifyTrustedDevice(token, user, agent, { ...options, now: () => record.expiresAt }),
    false,
  );
});

test("trust rejects other accounts, credentials, browsers, revoked records and inactive users", async () => {
  const { records, options } = harness();
  const token = await issueTrustedDevice(user, agent, options);
  for (const change of [
    { id: "user-2" },
    { email: "other@example.test" },
    { passwordHash: "new-hash" },
    { twoFactorSecretCiphertext: "new-secret" },
    { sessionsRevokedAfter: now },
    { twoFactorEnabled: false },
    { emailVerified: false },
    { isBanned: true },
    { deletedAt: now },
  ])
    assert.equal(await verifyTrustedDevice(token, { ...user, ...change }, agent, options), false);
  assert.equal(await verifyTrustedDevice(token, user, "other-browser", options), false);
  assert.equal(await verifyTrustedDevice(token, user, null, options), false);
  assert.equal(await verifyTrustedDevice(token + "x", user, agent, options), false);
  const stored = [...records.values()][0]!;
  stored.usedAt = now;
  assert.equal(await verifyTrustedDevice(token, user, agent, options), false);
  records.clear();
  assert.equal(await verifyTrustedDevice(token, user, agent, options), false);
});

test("unverified or missing-browser enrollment creates no trusted record", async () => {
  const { options, records } = harness();
  await assert.rejects(issueTrustedDevice(user, null, options));
  await assert.rejects(issueTrustedDevice({ ...user, twoFactorEnabled: false }, agent, options));
  assert.equal(records.size, 0);
});

test("missing/malformed cookies do not query storage; storage outages require 2FA", async () => {
  const { options } = harness();
  let reads = 0;
  options.store.find = async () => {
    reads++;
    throw new Error("offline");
  };
  for (const token of [undefined, "", "bad", "x".repeat(4096)]) {
    assert.equal(await verifyTrustedDevice(token, user, agent, options), false);
  }
  assert.equal(reads, 0);
  assert.equal(await verifyTrustedDevice("a".repeat(43), user, agent, options), false);
  assert.equal(reads, 1);
});

test("production cookie is host-only, HttpOnly, Secure and fixed to 30 days", () => {
  const cookie = getTrustedDeviceCookieConfig({ NODE_ENV: "production" });
  assert.equal(cookie.name, "__Host-whispr.trusted-device");
  assert.deepEqual(cookie.options, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TRUSTED_DEVICE_TTL_SECONDS,
  });
});
