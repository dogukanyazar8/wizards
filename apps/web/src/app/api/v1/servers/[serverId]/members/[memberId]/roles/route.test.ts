import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { patchServerMemberRolesRoute } from "./route-logic";

function jsonRequest(body: unknown) {
  return new Request("https://whispr.test/api/v1/servers/server-1/members/member-1/roles", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
}

function context(serverId = "server-1", memberId = "member-1") {
  return {
    params: Promise.resolve({ memberId, serverId }),
  };
}

function routeDependencies(
  overrides: Partial<Parameters<typeof patchServerMemberRolesRoute>[2]> = {},
) {
  return {
    enforceApiRateLimit: async () => undefined,
    jsonError,
    parseJsonBody,
    requireApiUserId: async () => "moderator-1",
    updateWorkspaceMemberRoles: async () => undefined,
    ...overrides,
  };
}

describe("server member roles API route", () => {
  it("requires auth, rate limits role updates, validates JSON, and updates the member", async () => {
    const calls: string[] = [];

    const response = await patchServerMemberRolesRoute(
      jsonRequest({ roleIds: ["role-1"] }),
      context(),
      routeDependencies({
        enforceApiRateLimit: async (userId, action) => {
          calls.push(`rate:${userId}:${action}`);
        },
        requireApiUserId: async () => {
          calls.push("auth");
          return "moderator-1";
        },
        updateWorkspaceMemberRoles: async (userId, serverId, memberId, input) => {
          calls.push(`update:${userId}:${serverId}:${memberId}:${input.roleIds.join(",")}`);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(calls, [
      "auth",
      "rate:moderator-1:member:roles:update",
      "update:moderator-1:server-1:member-1:role-1",
    ]);
  });

  it("returns the shared 401 envelope before parsing unauthenticated bodies", async () => {
    const response = await patchServerMemberRolesRoute(
      jsonRequest({ roleIds: "not-an-array" }),
      context(),
      routeDependencies({
        requireApiUserId: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      code: "UNAUTHORIZED",
      error: "Unauthorized",
    });
  });

  it("returns the shared 403 envelope for forbidden membership role updates", async () => {
    const response = await patchServerMemberRolesRoute(
      jsonRequest({ roleIds: ["role-1"] }),
      context(),
      routeDependencies({
        updateWorkspaceMemberRoles: async () => {
          throw new ApiError("Missing permission", 403, "FORBIDDEN");
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      code: "FORBIDDEN",
      error: "Missing permission",
    });
  });

  it("returns the shared 400 envelope for invalid role payloads", async () => {
    const response = await patchServerMemberRolesRoute(
      jsonRequest({ roleIds: "not-an-array" }),
      context(),
      routeDependencies(),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "Expected array, received string",
    });
  });

  it("returns the shared 429 envelope when role updates are rate limited", async () => {
    const response = await patchServerMemberRolesRoute(
      jsonRequest({ roleIds: ["role-1"] }),
      context(),
      routeDependencies({
        enforceApiRateLimit: async () => {
          throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
        },
      }),
    );

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      code: "RATE_LIMITED",
      error: "Too many requests. Please try again shortly.",
    });
  });
});
