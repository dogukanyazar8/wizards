import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  deleteAuthSessionRoute,
  getAuthSessionsRoute,
  revokeOtherAuthSessionsRoute,
} from "./route-logic";

const context = { sessionId: "current", userId: "user-1" };
const mobileRecord = {
  appVersion: "0.8.15",
  browser: null,
  clientType: "MOBILE" as const,
  countryCode: "TR",
  createdAt: new Date("2026-08-13T08:00:00Z"),
  deviceType: "MOBILE" as const,
  expiresAt: new Date("2026-09-12T08:00:00Z"),
  id: "mobile-1",
  lastSeenAt: new Date("2026-08-13T09:00:00Z"),
  os: "Android",
  revokedAt: new Date("2026-08-13T09:05:00Z"),
  userId: "user-1",
};

describe("auth session route logic", () => {
  it("returns the shared active-session response for the authenticated context", async () => {
    const response = { sessions: [] };
    assert.equal(
      await getAuthSessionsRoute(context, {
        list: async (userId, sessionId) => {
          assert.equal(userId, "user-1");
          assert.equal(sessionId, "current");
          return response;
        },
      }),
      response,
    );
  });

  it("does not reveal a missing or foreign target", async () => {
    await assert.rejects(
      () =>
        deleteAuthSessionRoute(context, "foreign", {
          revoke: async () => null,
          revokeMobile: async () => undefined,
        }),
      (error) => error instanceof ApiError && error.status === 404,
    );
  });

  it("revokes the DB record before best-effort mobile-family cleanup", async () => {
    const order: string[] = [];
    const response = await deleteAuthSessionRoute(context, "mobile-1", {
      revoke: async () => {
        order.push("db");
        return mobileRecord;
      },
      revokeMobile: async ({ sessionId }) => {
        order.push(`redis:${sessionId}`);
        throw new Error("redis unavailable");
      },
    });

    assert.deepEqual(order, ["db", "redis:mobile-1"]);
    assert.deepEqual(response, {
      currentSessionRevoked: false,
      revokedSessionId: "mobile-1",
    });
  });

  it("marks self-revocation explicitly", async () => {
    const response = await deleteAuthSessionRoute(context, "current", {
      revoke: async () => ({ ...mobileRecord, id: "current" }),
      revokeMobile: async () => undefined,
    });
    assert.equal(response.currentSessionRevoked, true);
  });

  it("keeps the current session and cleans every revoked mobile family", async () => {
    const cleaned: string[] = [];
    const response = await revokeOtherAuthSessionsRoute(context, {
      revokeMobile: async ({ sessionId }) => {
        cleaned.push(sessionId ?? "");
      },
      revokeOthers: async (userId, currentSessionId) => {
        assert.equal(userId, "user-1");
        assert.equal(currentSessionId, "current");
        return [mobileRecord, { ...mobileRecord, clientType: "WEB", id: "web-1" }];
      },
    });

    assert.deepEqual(cleaned, ["mobile-1"]);
    assert.deepEqual(response, { revokedCount: 2 });
  });
});
