import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ServerUserSettings } from "@wizards/types";

import { ApiError } from "@/lib/api";

const routes = import("./route-logic");

function request() {
  return new Request("https://whispr.test/api/v1/mobile/servers/server-1/settings", {
    method: "PATCH",
  });
}

function context(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

const SETTINGS: ServerUserSettings = {
  muted: false,
  mutedUntil: null,
  notificationLevel: "all",
  starred: true,
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    parseBody: async (_request: Request, schema: { parse: (value: unknown) => unknown }) =>
      schema.parse({ starred: true }),
    updateSettings: async () => SETTINGS,
    ...overrides,
  };
}

describe("mobile server user settings route logic", () => {
  it("writes the viewer's preferences and answers with the current state", async () => {
    const { mobileServerUserSettingsUpdateRoute } = await routes;
    const calls: string[] = [];

    const response = await mobileServerUserSettingsUpdateRoute(
      request(),
      context({ serverId: "server-1" }),
      dependencies({
        enforceRateLimit: async (_userId: string, action: string) => {
          calls.push(`rate:${action}`);
        },
        updateSettings: async (userId: string, serverId: string) => {
          calls.push(`update:${userId}:${serverId}`);
          return SETTINGS;
        },
      }) as never,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, ["rate:mobile:server:user-settings:update", "update:user-1:server-1"]);
    const payload = (await response.json()) as { settings: ServerUserSettings };
    assert.deepEqual(payload.settings, SETTINGS);
  });

  it("accepts each switch on its own", async () => {
    const { mobileServerUserSettingsUpdateRoute } = await routes;

    for (const body of [
      { starred: true },
      { muted: true },
      { mutedUntil: null },
      { notificationLevel: "mentions" },
    ]) {
      const response = await mobileServerUserSettingsUpdateRoute(
        request(),
        context({ serverId: "server-1" }),
        dependencies({
          parseBody: async (_request: Request, schema: { parse: (value: unknown) => unknown }) =>
            schema.parse(body),
        }) as never,
      );

      assert.equal(response.status, 200);
    }
  });

  it("rejects an empty body and an unknown switch", async () => {
    const { mobileServerUserSettingsUpdateRoute } = await routes;

    for (const body of [{}, { pinned: true }]) {
      const response = await mobileServerUserSettingsUpdateRoute(
        request(),
        context({ serverId: "server-1" }),
        dependencies({
          parseBody: async (_request: Request, schema: { parse: (value: unknown) => unknown }) =>
            schema.parse(body),
        }) as never,
      );

      assert.equal(response.status, 400);
    }
  });

  it("passes a non-member's 404 through unchanged", async () => {
    const { mobileServerUserSettingsUpdateRoute } = await routes;

    const response = await mobileServerUserSettingsUpdateRoute(
      request(),
      context({ serverId: "server-1" }),
      dependencies({
        updateSettings: async () => {
          throw new ApiError("Server not found", 404);
        },
      }) as never,
    );

    assert.equal(response.status, 404);
  });
});
