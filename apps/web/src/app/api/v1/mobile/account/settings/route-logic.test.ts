import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { ApiError, parseJsonBody } from "@/lib/api";
import { MobileAccountSettingsUpdateSchema } from "@wizards/types";
import {
  mobileAccountSettingsGetRoute,
  mobileAccountSettingsUpdateRoute,
  type MobileAccountSettingsRecord,
} from "./route-logic";

const settingsRecord: MobileAccountSettingsRecord = {
  appearance: { messageCompact: false, messageFollowSystemFont: false, messageFontSize: "medium" },
  account: {
    bannerColor: null,
    bannerOffsetX: null,
    bannerOffsetY: null,
    bannerUrl: null,
    bio: null,
    customStatus: "focus",
    customStatusEmoji: null,
    customStatusExpiresAt: null,
    email: "dogukan@whispr.app",
    emailVerified: true,
    nextUsernameChangeAt: null,
    pronouns: null,
    twoFactorEnabled: true,
  },
  privacy: { dmPermission: "FRIENDS", friendRequests: "EVERYONE" },
};

describe("mobile account settings route", () => {
  it("returns the authenticated user's account and privacy contract", async () => {
    const calls: string[] = [];
    const response = await mobileAccountSettingsGetRoute(
      new Request("https://whispr.test/settings", { method: "GET" }),
      {
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        enforceRateLimit: async (userId, action) => {
          calls.push(`${action}:${userId}`);
        },
        loadSettings: async (userId) => {
          calls.push(`load:${userId}`);
          return settingsRecord;
        },
        parseBody: (request) => parseJsonBody(request, MobileAccountSettingsUpdateSchema),
        updateSettings: async () => {
          throw new Error("must not run");
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
    assert.deepEqual(calls, ["auth", "mobile:account:settings:user-1", "load:user-1"]);
    const payload = await response.json();
    assert.equal(payload.account.email, "dogukan@whispr.app");
    assert.equal(payload.account.twoFactorEnabled, true);
    assert.equal(payload.privacy.dmPermission, "FRIENDS");
  });

  it("sets no-store on GET authentication errors", async () => {
    const response = await mobileAccountSettingsGetRoute(
      new Request("https://whispr.test/settings", { method: "GET" }),
      {
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
        enforceRateLimit: async () => {
          throw new Error("must not run");
        },
        loadSettings: async () => {
          throw new Error("must not run");
        },
        parseBody: (request) => parseJsonBody(request, MobileAccountSettingsUpdateSchema),
        updateSettings: async () => {
          throw new Error("must not run");
        },
      },
    );

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
    assert.deepEqual(await response.json(), { code: "UNAUTHORIZED", error: "Unauthorized" });
  });

  it("persists privacy updates and echoes the merged contract", async () => {
    const calls: string[] = [];
    const response = await mobileAccountSettingsUpdateRoute(
      new Request("https://whispr.test/settings", {
        body: JSON.stringify({ dmPermission: "NOBODY" }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      {
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        enforceRateLimit: async (userId, action) => {
          calls.push(`${action}:${userId}`);
        },
        loadSettings: async (userId) => {
          calls.push(`load:${userId}`);
          return settingsRecord;
        },
        parseBody: async (request) => {
          calls.push("parse");
          return parseJsonBody(request, MobileAccountSettingsUpdateSchema);
        },
        updateSettings: async (userId, input) => {
          calls.push(`update:${userId}:${input.dmPermission}`);
          return {
            appearance: settingsRecord.appearance,
            privacy: { dmPermission: "NOBODY", friendRequests: "EVERYONE" },
          };
        },
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      "auth",
      "mobile:account:settings:user-1",
      "parse",
      "update:user-1:NOBODY",
      "load:user-1",
    ]);
    assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
    const payload = await response.json();
    assert.equal(payload.privacy.dmPermission, "NOBODY");
  });

  it("rejects unknown or empty privacy payloads", async () => {
    const dependencies = {
      authenticate: async () => "user-1",
      enforceRateLimit: async () => undefined,
      loadSettings: async () => settingsRecord,
      parseBody: (request: Request) => parseJsonBody(request, MobileAccountSettingsUpdateSchema),
      updateSettings: async (): Promise<
        Pick<MobileAccountSettingsRecord, "appearance" | "privacy">
      > => {
        throw new Error("must not run");
      },
    };

    const emptyResponse = await mobileAccountSettingsUpdateRoute(
      new Request("https://whispr.test/settings", {
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      dependencies,
    );
    assert.equal(emptyResponse.status, 400);
    assert.equal(emptyResponse.headers.get("cache-control"), "no-store, no-cache, must-revalidate");

    const unknownResponse = await mobileAccountSettingsUpdateRoute(
      new Request("https://whispr.test/settings", {
        body: JSON.stringify({ email: "leak@example.com" }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      dependencies,
    );
    assert.equal(unknownResponse.status, 400);
    assert.equal(
      unknownResponse.headers.get("cache-control"),
      "no-store, no-cache, must-revalidate",
    );
  });

  it("does not leak internal persistence errors", async () => {
    const errorLog = mock.method(console, "error", () => undefined);
    const response = await mobileAccountSettingsUpdateRoute(
      new Request("https://whispr.test/settings", {
        body: JSON.stringify({ friendRequests: "MUTUAL_FRIENDS" }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      {
        authenticate: async () => "user-1",
        enforceRateLimit: async () => undefined,
        loadSettings: async () => settingsRecord,
        parseBody: (request) => parseJsonBody(request, MobileAccountSettingsUpdateSchema),
        updateSettings: async () => {
          throw new Error("database host and private row details");
        },
      },
    );

    assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
    assert.deepEqual(await response.json(), { error: "Internal server error" });
    assert.equal(errorLog.mock.callCount(), 1);
  });

  it("persists the message-body appearance on its own, without a privacy field", async () => {
    const writes: unknown[] = [];
    const response = await mobileAccountSettingsUpdateRoute(
      new Request("https://whispr.test/settings", {
        body: JSON.stringify({ messageCompact: true, messageFontSize: "large" }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      {
        authenticate: async () => "user-1",
        enforceRateLimit: async () => undefined,
        loadSettings: async () => settingsRecord,
        parseBody: (request) => parseJsonBody(request, MobileAccountSettingsUpdateSchema),
        updateSettings: async (_userId, input) => {
          writes.push(input);
          return {
            appearance: {
              messageCompact: true,
              messageFollowSystemFont: false,
              messageFontSize: "large",
            },
            privacy: settingsRecord.privacy,
          };
        },
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(writes, [{ messageCompact: true, messageFontSize: "large" }]);
    const payload = await response.json();
    assert.deepEqual(payload.appearance, {
      messageCompact: true,
      messageFollowSystemFont: false,
      messageFontSize: "large",
    });
    // A privacy-free appearance write must not disturb the privacy contract.
    assert.equal(payload.privacy.dmPermission, "FRIENDS");
  });

  it("rejects an unknown message font size", async () => {
    const response = await mobileAccountSettingsUpdateRoute(
      new Request("https://whispr.test/settings", {
        body: JSON.stringify({ messageFontSize: "gigantic" }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      {
        authenticate: async () => "user-1",
        enforceRateLimit: async () => undefined,
        loadSettings: async () => settingsRecord,
        parseBody: (request) => parseJsonBody(request, MobileAccountSettingsUpdateSchema),
        updateSettings: async () => {
          throw new Error("must not run");
        },
      },
    );

    assert.equal(response.status, 400);
  });
});
