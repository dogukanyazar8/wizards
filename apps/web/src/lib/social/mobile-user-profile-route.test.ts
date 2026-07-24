import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MobileUserProfile } from "@wizards/types";

/**
 * Lives beside the service rather than beside the route: the web test runner
 * hands file paths to node --test, which globs them, and the `[userId]` segment
 * is read as a character class — a test parked in that folder is silently
 * skipped.
 */
import { parseJsonBody } from "@/lib/api";
import type { ApiRateLimitAction } from "@/lib/api-rate-limit";
import type { createMobileUserReport } from "@/lib/social/mobile-user-profile-service";
import type { MobileUserProfileInput } from "@/lib/social/mobile-user-profile-service";
import {
  mobileUserProfileRoute,
  mobileUserReportRoute,
  type MobileUserRouteDependencies,
} from "@/app/api/v1/mobile/users/[userId]/route-logic";

function createProfile(overrides: Partial<MobileUserProfile> = {}): MobileUserProfile {
  return {
    badges: ["earlyMember"],
    bannerColor: null,
    bannerOffsetX: null,
    bannerOffsetY: null,
    bannerUrl: null,
    bio: null,
    blocked: false,
    blockedBy: false,
    mutualFriends: { count: 0, preview: [] },
    mutualServers: { count: 0, preview: [] },
    note: null,
    presence: { customStatus: null, customStatusEmoji: null, status: "ONLINE" },
    pronouns: null,
    registeredAt: "2025-04-02T09:00:00.000Z",
    relationship: "friend",
    self: false,
    serverContext: null,
    user: { avatarUrl: null, displayName: "Ada", id: "user-2", username: "ada" },
    ...overrides,
  };
}

// Annotated, and using the real body parser: an unannotated literal with a
// hand-rolled `parseBody` no longer matches the generic dependency type, and
// once it stops matching every inline override in this file loses its
// contextual parameter types.
const baseDependencies: MobileUserRouteDependencies = {
  authenticate: async () => "user-1",
  createReport: async () => ({ reportId: "report-1" }),
  enforceRateLimit: async () => undefined,
  getProfile: async () => createProfile(),
  parseBody: parseJsonBody,
  saveNote: async () => ({ note: null }),
};

describe("mobile user profile route", () => {
  it("passes the server context through and rate-limits the read", async () => {
    const calls: unknown[] = [];
    const response = await mobileUserProfileRoute(
      new Request("https://whispr.test/api/v1/mobile/users/user-2/profile?serverId=server-1"),
      { params: Promise.resolve({ userId: "user-2" }) },
      {
        ...baseDependencies,
        enforceRateLimit: async (_userId: string, action: ApiRateLimitAction) => {
          calls.push(action);
        },
        getProfile: async (input: MobileUserProfileInput) => {
          calls.push(input);
          return createProfile({
            serverContext: {
              joinedAt: "2026-01-04T10:00:00.000Z",
              roles: [{ color: 5_198_053, id: "role-1", name: "Geliştirici" }],
              serverId: "server-1",
              serverName: "UAT ENV",
            },
          });
        },
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      "mobile:users:profile",
      { requesterId: "user-1", serverId: "server-1", userId: "user-2" },
    ]);
    const body = (await response.json()) as { profile: MobileUserProfile };
    assert.equal(body.profile.serverContext?.serverName, "UAT ENV");
  });

  it("omits the server context when the card was opened outside a server", async () => {
    const calls: unknown[] = [];
    const response = await mobileUserProfileRoute(
      new Request("https://whispr.test/api/v1/mobile/users/user-2/profile"),
      { params: Promise.resolve({ userId: "user-2" }) },
      {
        ...baseDependencies,
        getProfile: async (input) => {
          calls.push(input);
          return createProfile();
        },
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [{ requesterId: "user-1", userId: "user-2" }]);
  });

  it("keeps a blocked payload down to identity", async () => {
    const response = await mobileUserProfileRoute(
      new Request("https://whispr.test/api/v1/mobile/users/user-2/profile"),
      { params: Promise.resolve({ userId: "user-2" }) },
      {
        ...baseDependencies,
        getProfile: async () =>
          createProfile({
            badges: [],
            blocked: true,
            presence: { customStatus: null, customStatusEmoji: null, status: "OFFLINE" },
            relationship: "blocked",
          }),
      },
    );

    const body = (await response.json()) as { profile: MobileUserProfile };
    assert.equal(body.profile.blocked, true);
    assert.deepEqual(body.profile.badges, []);
    assert.equal(body.profile.bio, null);
    assert.equal(body.profile.presence.status, "OFFLINE");
  });

  it("rejects an unauthenticated read before it touches the service", async () => {
    let loaded = false;
    const response = await mobileUserProfileRoute(
      new Request("https://whispr.test/api/v1/mobile/users/user-2/profile"),
      { params: Promise.resolve({ userId: "user-2" }) },
      {
        ...baseDependencies,
        authenticate: async () => {
          throw new Error("unauthorized");
        },
        getProfile: async () => {
          loaded = true;
          return createProfile();
        },
      },
    );

    assert.equal(loaded, false);
    assert.equal(response.status >= 400, true);
  });
});

describe("mobile user report route", () => {
  it("stores the reason against the reporter under a strict rate limit", async () => {
    const calls: unknown[] = [];
    const response = await mobileUserReportRoute(
      new Request("https://whispr.test/api/v1/mobile/users/user-2/report", {
        body: JSON.stringify({ reason: "harassment" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      { params: Promise.resolve({ userId: "user-2" }) },
      {
        ...baseDependencies,
        createReport: async (input: Parameters<typeof createMobileUserReport>[0]) => {
          calls.push(input);
          return { reportId: "report-1" };
        },
        enforceRateLimit: async (_userId: string, action: ApiRateLimitAction) => {
          calls.push(action);
        },
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      "mobile:users:report",
      {
        details: null,
        reason: "HARASSMENT",
        reporterId: "user-1",
        subjectId: "user-2",
      },
    ]);
    assert.deepEqual(await response.json(), { reportId: "report-1" });
  });

  it("refuses a reason outside the contract", async () => {
    let stored = false;
    const response = await mobileUserReportRoute(
      new Request("https://whispr.test/api/v1/mobile/users/user-2/report", {
        body: JSON.stringify({ reason: "because" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      { params: Promise.resolve({ userId: "user-2" }) },
      {
        ...baseDependencies,
        createReport: async () => {
          stored = true;
          return { reportId: "report-1" };
        },
      },
    );

    assert.equal(stored, false);
    assert.equal(response.status >= 400, true);
  });
});
