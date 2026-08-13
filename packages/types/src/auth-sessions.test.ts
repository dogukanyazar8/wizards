import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AuthSessionRevokeOthersResponseSchema,
  AuthSessionRevokeResponseSchema,
  AuthSessionSchema,
  AuthSessionsResponseSchema,
} from "./auth-sessions";

const session = {
  appVersion: "0.8.15",
  browser: "Chrome 140",
  clientType: "DESKTOP",
  countryCode: "TR",
  createdAt: "2026-08-13T08:00:00.000Z",
  current: true,
  deviceType: "DESKTOP",
  expiresAt: "2026-09-12T08:00:00.000Z",
  id: "session_01",
  lastSeenAt: "2026-08-13T09:00:00.000Z",
  os: "Windows 11",
} as const;

describe("auth session contracts", () => {
  it("accepts the safe cross-platform session projection", () => {
    assert.deepEqual(AuthSessionSchema.parse(session), session);
    assert.deepEqual(AuthSessionsResponseSchema.parse({ sessions: [session] }), {
      sessions: [session],
    });
  });

  it("rejects unknown platform values, malformed dates, and privacy-leaking fields", () => {
    assert.equal(AuthSessionSchema.safeParse({ ...session, clientType: "CLI" }).success, false);
    assert.equal(AuthSessionSchema.safeParse({ ...session, lastSeenAt: "today" }).success, false);
    assert.equal(
      AuthSessionSchema.safeParse({ ...session, ipAddress: "203.0.113.1" }).success,
      false,
    );
    assert.equal(AuthSessionSchema.safeParse({ ...session, userAgent: "secret" }).success, false);
  });

  it("bounds identifiers, country codes, and the active list", () => {
    assert.equal(AuthSessionSchema.safeParse({ ...session, id: "" }).success, false);
    assert.equal(AuthSessionSchema.safeParse({ ...session, countryCode: "TUR" }).success, false);
    assert.equal(
      AuthSessionsResponseSchema.safeParse({ sessions: Array.from({ length: 101 }, () => session) })
        .success,
      false,
    );
  });

  it("keeps destructive operation responses strict and explicit", () => {
    assert.deepEqual(
      AuthSessionRevokeResponseSchema.parse({ currentSessionRevoked: true, revokedSessionId: "x" }),
      { currentSessionRevoked: true, revokedSessionId: "x" },
    );
    assert.deepEqual(AuthSessionRevokeOthersResponseSchema.parse({ revokedCount: 3 }), {
      revokedCount: 3,
    });
    assert.equal(
      AuthSessionRevokeOthersResponseSchema.safeParse({ revokedCount: -1 }).success,
      false,
    );
  });
});
