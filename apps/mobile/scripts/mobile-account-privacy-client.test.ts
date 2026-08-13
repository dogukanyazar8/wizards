import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import {
  deleteMobileAccount,
  fetchMobileAccountDeletionPreflight,
  reauthenticateMobileAccountDeletion,
} from "../src/account/mobile-account-privacy-client";

describe("mobile account privacy client", () => {
  it("uses shared preflight and purpose-bound destructive contracts", async () => {
    const calls: Array<{ body?: unknown; headers?: HeadersInit; method?: string; path: string }> =
      [];
    const client: MobileApiClient = {
      requestJson: async <T>(path: string, options = {}) => {
        calls.push({ path, ...options });
        if (path.endsWith("/deletion"))
          return {
            canDelete: true,
            confirmationPhrase: "DELETE MY ACCOUNT",
            emailVerified: true,
            ownedServers: [],
            reauthMethod: "PASSWORD",
          } as T;
        if (path.endsWith("/reauth")) return { reauthToken: "reauth-token" } as T;
        return { deletedAt: "2026-08-13T12:00:00.000Z", success: true } as T;
      },
    };

    assert.equal((await fetchMobileAccountDeletionPreflight(client)).canDelete, true);
    assert.equal(await reauthenticateMobileAccountDeletion(client, "secret"), "reauth-token");
    await deleteMobileAccount(client, "reauth-token");
    assert.deepEqual(calls[1]?.body, { password: "secret", purpose: "account-delete" });
    assert.equal(new Headers(calls[2]?.headers).get("x-whispr-reauth-token"), "reauth-token");
  });
});
