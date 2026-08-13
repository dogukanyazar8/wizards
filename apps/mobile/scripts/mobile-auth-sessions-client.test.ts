import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import {
  fetchMobileAuthSessions,
  revokeMobileAuthSession,
  revokeOtherMobileAuthSessions,
} from "../src/account/mobile-auth-sessions-client";

function client(handler: (path: string, options?: unknown) => unknown): MobileApiClient {
  return {
    requestJson: async <TResponse>(path: string, options?: unknown) =>
      handler(path, options) as TResponse,
  };
}

describe("mobile auth sessions client", () => {
  it("loads and revokes through the mobile account session endpoints", async () => {
    const calls: Array<[string, unknown]> = [];
    const api = client((path, options) => {
      calls.push([path, options]);
      if (path.endsWith("revoke-others")) return { revokedCount: 2 };
      if (options) return { currentSessionRevoked: false, revokedSessionId: "a/b" };
      return { sessions: [] };
    });

    assert.deepEqual(await fetchMobileAuthSessions(api), { sessions: [] });
    assert.equal((await revokeMobileAuthSession(api, "a/b")).revokedSessionId, "a/b");
    assert.deepEqual(await revokeOtherMobileAuthSessions(api), { revokedCount: 2 });
    assert.deepEqual(calls, [
      ["/api/v1/mobile/account/sessions", undefined],
      ["/api/v1/mobile/account/sessions/a%2Fb", { method: "DELETE" }],
      ["/api/v1/mobile/account/sessions/revoke-others", { method: "POST" }],
    ]);
  });

  it("rejects a privacy-leaking session payload", async () => {
    await assert.rejects(() =>
      fetchMobileAuthSessions(
        client(() => ({
          sessions: [
            {
              appVersion: null,
              browser: null,
              clientType: "MOBILE",
              countryCode: null,
              createdAt: "2026-08-13T08:00:00.000Z",
              current: true,
              deviceType: "MOBILE",
              expiresAt: "2026-09-12T08:00:00.000Z",
              id: "x",
              ipAddress: "203.0.113.1",
              lastSeenAt: "2026-08-13T09:00:00.000Z",
              os: "Android",
            },
          ],
        })),
      ),
    );
  });
});
