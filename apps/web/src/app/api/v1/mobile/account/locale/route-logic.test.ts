import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { ApiError, parseJsonBody } from "@/lib/api";
import { MobileLocaleUpdateRequestSchema } from "@wizards/types";
import {
  mobileAccountLocaleUpdateRoute,
  type MobileLocaleRouteDependencies,
} from "./route-logic";

function localeRequest(body: unknown = { locale: "en" }) {
  return new Request("https://whispr.test/locale", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
}

function createDependencies(
  overrides: Partial<MobileLocaleRouteDependencies> = {},
): MobileLocaleRouteDependencies {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    parseBody: (request) => parseJsonBody(request, MobileLocaleUpdateRequestSchema),
    persistLocale: async (_userId, locale) => locale,
    ...overrides,
  };
}

describe("mobile account locale route", () => {
  it("persists the selected locale on the account and echoes it back", async () => {
    const calls: string[] = [];
    const response = await mobileAccountLocaleUpdateRoute(
      localeRequest(),
      createDependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        enforceRateLimit: async (userId, action) => {
          calls.push(`${action}:${userId}`);
        },
        persistLocale: async (userId, locale) => {
          calls.push(`persist:${userId}:${locale}`);
          return locale;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { locale: "en" });
    assert.deepEqual(calls, ["auth", "mobile:account:locale:user-1", "persist:user-1:en"]);
  });

  it("rejects unsupported and unknown-field payloads", async () => {
    for (const body of [{ locale: "de" }, { locale: "tr", theme: "dark" }, {}]) {
      const response = await mobileAccountLocaleUpdateRoute(
        localeRequest(body),
        createDependencies({
          persistLocale: async () => {
            throw new Error("must not run");
          },
        }),
      );
      assert.equal(response.status, 400);
    }
  });

  it("propagates authentication failures", async () => {
    const response = await mobileAccountLocaleUpdateRoute(
      localeRequest(),
      createDependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { code: "UNAUTHORIZED", error: "Unauthorized" });
  });

  it("does not leak internal persistence errors", async () => {
    const errorLog = mock.method(console, "error", () => undefined);
    const response = await mobileAccountLocaleUpdateRoute(
      localeRequest(),
      createDependencies({
        persistLocale: async () => {
          throw new Error("database host and private row details");
        },
      }),
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Internal server error" });
    assert.equal(errorLog.mock.callCount(), 1);
  });
});
