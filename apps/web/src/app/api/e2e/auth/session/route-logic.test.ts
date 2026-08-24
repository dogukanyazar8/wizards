import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAuthSessionIdentity } from "@/lib/auth/session-revocation";
import { buildE2ESessionToken } from "./route-logic";

const USER = {
  avatarUrl: null,
  displayName: "Alice E2E",
  email: "alice@whispr.test",
  emailVerified: true,
  id: "11111111-2222-3333-4444-555555555555",
  isBanned: false,
  locale: "tr",
  theme: null,
  username: "alice_e2e",
} as const;

const ISSUED_AT = 1_760_000_000;
const MAX_AGE = 604_800;

describe("e2e session token", () => {
  it("carries a durable session identity so the jwt callback cannot revoke it", () => {
    const token = buildE2ESessionToken({
      authSessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      issuedAtSeconds: ISSUED_AT,
      jti: "ffffffff-0000-1111-2222-333333333333",
      maxAgeSeconds: MAX_AGE,
      user: USER,
    });

    // `parseAuthSessionIdentity` null dönerse `validateAuthSessionToken` token'ı `revoked`
    // sayar ve her sayfa isteği /login'e döner (Faz 1 raporu §6.7).
    assert.deepEqual(parseAuthSessionIdentity(token), {
      authSessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      sessionStartedAtSeconds: ISSUED_AT,
      userId: USER.id,
    });
  });

  it("keeps the identity, expiry and hydration fields the app reads", () => {
    const token = buildE2ESessionToken({
      authSessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      issuedAtSeconds: ISSUED_AT,
      jti: "ffffffff-0000-1111-2222-333333333333",
      maxAgeSeconds: MAX_AGE,
      user: USER,
    });

    assert.equal(token.sub, USER.id);
    assert.equal(token.id, USER.id);
    assert.equal(token.email, USER.email);
    assert.equal(token.username, USER.username);
    assert.equal(token.iat, ISSUED_AT);
    assert.equal(token.exp, ISSUED_AT + MAX_AGE);
    assert.equal(token.authStatusHydrated, true);
    assert.equal(token.profileHydrated, true);
    assert.equal(token.deletedAt, null);
    assert.equal(token.revoked, undefined);
  });

  it("leaves the revocation check unstamped so the first request re-reads the store", () => {
    const token = buildE2ESessionToken({
      authSessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      issuedAtSeconds: ISSUED_AT,
      jti: "ffffffff-0000-1111-2222-333333333333",
      maxAgeSeconds: MAX_AGE,
      user: USER,
    });

    // A stamp here would grant the fresh session a full
    // `SESSION_REVOCATION_CHECK_INTERVAL_SECONDS` of immunity to revocation.
    assert.equal(token.revocationCheckedAt, undefined);
    assert.equal(token.authSessionTouchedAt, ISSUED_AT);
  });

  it("refuses to build a token without a durable session id", () => {
    assert.throws(
      () =>
        buildE2ESessionToken({
          authSessionId: "   ",
          issuedAtSeconds: ISSUED_AT,
          jti: "ffffffff-0000-1111-2222-333333333333",
          maxAgeSeconds: MAX_AGE,
          user: USER,
        }),
      /authSessionId/u,
    );
  });
});
