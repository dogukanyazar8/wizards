import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@/lib/api";

import {
  mobileAccountPreferencesGetRoute,
  mobileAccountPreferencesPatchRoute,
  type MobileAccountPreferencesDependencies,
} from "./route-logic";

const stored = {
  dateFormat: "LOCALE" as const,
  interfaceDensity: "COMFORTABLE" as const,
  presenceVisibility: "EVERYONE" as const,
  profileVisibility: "EVERYONE" as const,
  timeFormat: "LOCALE" as const,
  timeZone: null,
};

function request(method = "GET", body?: unknown) {
  return new Request("http://localhost/api/v1/mobile/account/preferences", {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json" },
    method,
  });
}

function dependencies(
  overrides: Partial<MobileAccountPreferencesDependencies> = {},
): MobileAccountPreferencesDependencies {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    loadPreferences: async () => stored,
    updatePreferences: async (_userId, patch) => ({ ...stored, ...patch }),
    ...overrides,
  };
}

describe("mobile account preferences route", () => {
  it("returns a full no-store account preference payload", async () => {
    const response = await mobileAccountPreferencesGetRoute(request(), dependencies());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate");
    assert.deepEqual(await response.json(), {
      ...stored,
      timeZone: "AUTO",
    });
  });

  it("writes a strict partial update and returns the full canonical payload", async () => {
    let captured: Record<string, unknown> | undefined;
    const response = await mobileAccountPreferencesPatchRoute(
      request("PATCH", { dateFormat: "DMY", timeZone: " Europe/Istanbul " }),
      dependencies({
        updatePreferences: async (_userId, patch) => {
          captured = patch;
          return { ...stored, ...patch };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(captured, { dateFormat: "DMY", timeZone: "Europe/Istanbul" });
    assert.deepEqual(await response.json(), {
      ...stored,
      dateFormat: "DMY",
      timeZone: "Europe/Istanbul",
    });
  });

  it("rebroadcasts presence after a mobile visibility write", async () => {
    const broadcasts: string[] = [];
    const response = await mobileAccountPreferencesPatchRoute(
      request("PATCH", { presenceVisibility: "NOBODY" }),
      dependencies({
        onPresenceVisibilityChanged: async (userId: string) => {
          broadcasts.push(userId);
        },
      } as Partial<MobileAccountPreferencesDependencies> & {
        onPresenceVisibilityChanged(userId: string): Promise<void>;
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(broadcasts, ["user-1"]);
  });

  it("rejects empty, unknown and invalid timezone updates without writing", async () => {
    let writes = 0;
    const deps = dependencies({
      updatePreferences: async () => {
        writes += 1;
        return stored;
      },
    });

    const empty = await mobileAccountPreferencesPatchRoute(request("PATCH", {}), deps);
    const unknown = await mobileAccountPreferencesPatchRoute(
      request("PATCH", { unknown: true }),
      deps,
    );
    const invalid = await mobileAccountPreferencesPatchRoute(
      request("PATCH", { timeZone: "Mars/Olympus_Mons" }),
      deps,
    );

    assert.equal(empty.status, 400);
    assert.equal(unknown.status, 400);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate");
    assert.equal(writes, 0);
  });

  it("authenticates and rate limits before persistence", async () => {
    let writes = 0;
    const unauthorized = await mobileAccountPreferencesGetRoute(
      request(),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );
    const rateLimited = await mobileAccountPreferencesPatchRoute(
      request("PATCH", { timeFormat: "H24" }),
      dependencies({
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests", 429, "RATE_LIMITED");
        },
        updatePreferences: async () => {
          writes += 1;
          return stored;
        },
      }),
    );

    assert.equal(unauthorized.status, 401);
    assert.equal(rateLimited.status, 429);
    assert.equal(writes, 0);
  });
});
