import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import {
  syncMobileAccountLocale,
  updateMobileAccountLocale,
} from "../src/locale/mobile-locale-client";

function client(handler: (path: string, options?: unknown) => unknown): MobileApiClient {
  return {
    requestJson: async <TResponse>(path: string, options?: unknown) =>
      handler(path, options) as TResponse,
  };
}

describe("mobile locale client", () => {
  it("patches the account locale through the validated contract", async () => {
    const calls: Array<[string, unknown]> = [];
    const api = client((path, options) => {
      calls.push([path, options]);
      return { locale: "en" };
    });

    assert.deepEqual(await updateMobileAccountLocale(api, "en"), { locale: "en" });
    assert.deepEqual(calls, [
      ["/api/v1/mobile/account/locale", { body: { locale: "en" }, method: "PATCH" }],
    ]);
  });

  it("rejects unsupported locales and unexpected response fields", async () => {
    const api = client(() => ({ locale: "en", theme: "dark" }));

    await assert.rejects(() => updateMobileAccountLocale(api, "de" as "en"));
    await assert.rejects(() => updateMobileAccountLocale(api, "en"));
  });

  it("skips the account sync while signed out", () => {
    let calls = 0;
    syncMobileAccountLocale(
      client(() => {
        calls += 1;
        return { locale: "tr" };
      }),
      "tr",
      false,
    );

    assert.equal(calls, 0);
  });

  it("swallows sync failures so the local preference stands", async () => {
    syncMobileAccountLocale(
      client(() => {
        throw new Error("offline");
      }),
      "tr",
      true,
    );

    await new Promise((resolve) => setImmediate(resolve));
  });
});
