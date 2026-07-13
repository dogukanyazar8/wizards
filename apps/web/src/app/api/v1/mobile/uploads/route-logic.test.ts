import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";

const route = import("./route-logic");

const claimedProfile = {
  claimId: "claim-1",
  claimedAt: "2026-07-13T10:00:00.000Z",
  profile: {
    avatarUrl: "https://cdn.whispr.test/avatar.webp",
    customStatus: null,
    displayName: "Alice",
    id: "user-1",
    status: "ONLINE" as const,
    twoFactorEnabled: true,
    username: "alice",
  },
  purpose: "profile-avatar" as const,
};

function request(body: unknown) {
  return new Request("https://whispr.test/api/v1/mobile/uploads", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    claimUpload: async () => claimedProfile,
    enforceRateLimit: async () => undefined,
    parseBody: parseJsonBody,
    ...overrides,
  };
}

describe("mobile media claim route logic", () => {
  it("authenticates and rate limits before strictly parsing and claiming by id", async () => {
    const { mobileMediaClaimRoute } = await route;
    const calls: string[] = [];
    const parseBody: typeof parseJsonBody = async (inputRequest, schema) => {
      calls.push("body");
      return parseJsonBody(inputRequest, schema);
    };

    const response = await mobileMediaClaimRoute(
      request({ claimId: " claim-1 " }),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        claimUpload: async (userId: string, input: { claimId: string }) => {
          calls.push(`claim:${userId}:${input.claimId}`);
          return claimedProfile;
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        parseBody,
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), claimedProfile);
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:media:claim",
      "body",
      "claim:user-1:claim-1",
    ]);
  });

  it("does not parse attacker-controlled input when authentication fails", async () => {
    const { mobileMediaClaimRoute } = await route;
    const calls: string[] = [];

    const response = await mobileMediaClaimRoute(
      request({ claimId: "claim-1", url: "https://attacker.test/file" }),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
        claimUpload: async () => {
          calls.push("claim");
          return claimedProfile;
        },
        enforceRateLimit: async () => {
          calls.push("rate");
        },
        parseBody: async () => {
          calls.push("body");
          return { claimId: "claim-1" };
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { code: "UNAUTHORIZED", error: "Unauthorized" });
    assert.deepEqual(calls, ["auth"]);
  });

  it("does not parse or claim when rate limiting fails", async () => {
    const { mobileMediaClaimRoute } = await route;
    const calls: string[] = [];

    const response = await mobileMediaClaimRoute(
      request({ claimId: "claim-1" }),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        claimUpload: async () => {
          calls.push("claim");
          return claimedProfile;
        },
        enforceRateLimit: async () => {
          calls.push("rate");
          throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
        },
        parseBody: async () => {
          calls.push("body");
          return { claimId: "claim-1" };
        },
      }),
    );

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      code: "RATE_LIMITED",
      error: "Too many requests. Please try again shortly.",
    });
    assert.deepEqual(calls, ["auth", "rate"]);
  });

  it("accepts only a bounded claim id and never accepts URL, key, target, or ownership fields", async () => {
    const { mobileMediaClaimRoute } = await route;

    for (const body of [
      {},
      { claimId: "" },
      { claimId: "c".repeat(129) },
      { claimId: "claim-1", key: "storage-key" },
      { claimId: "claim-1", ownerId: "user-2" },
      { claimId: "claim-1", targetServerId: "server-1" },
      { claimId: "claim-1", url: "https://attacker.test/file" },
    ]) {
      let claimCalled = false;
      const response = await mobileMediaClaimRoute(
        request(body),
        dependencies({
          claimUpload: async () => {
            claimCalled = true;
            return claimedProfile;
          },
        }),
      );

      assert.equal(response.status, 400);
      assert.equal(claimCalled, false);
    }
  });

  it("preserves the bounded single-use replay conflict", async () => {
    const { mobileMediaClaimRoute } = await route;

    const response = await mobileMediaClaimRoute(
      request({ claimId: "claim-1" }),
      dependencies({
        claimUpload: async () => {
          throw new ApiError("Upload claim is invalid or expired", 409, "UPLOAD_CLAIM_UNAVAILABLE");
        },
      }),
    );

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      code: "UPLOAD_CLAIM_UNAVAILABLE",
      error: "Upload claim is invalid or expired",
    });
  });

  it("validates the service response and does not expose storage metadata", async () => {
    const { mobileMediaClaimRoute } = await route;

    const response = await mobileMediaClaimRoute(
      request({ claimId: "claim-1" }),
      dependencies({
        claimUpload: async () => ({
          ...claimedProfile,
          storageKey: "private-storage-key",
        }),
      }),
    );

    assert.equal(response.status, 400);
    const payload = (await response.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload), ["error"]);
    assert.equal(JSON.stringify(payload).includes("private-storage-key"), false);
  });
});
