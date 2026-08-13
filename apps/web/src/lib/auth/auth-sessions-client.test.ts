import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  fetchAuthSessions,
  revokeAuthSessionClient,
  revokeOtherAuthSessionsClient,
} from "./auth-sessions-client";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("auth sessions web client", () => {
  it("parses the no-store active session response", async () => {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "/api/v1/users/me/sessions");
      assert.equal(init?.cache, "no-store");
      return Response.json({ sessions: [] });
    };
    assert.deepEqual(await fetchAuthSessions(), { sessions: [] });
  });

  it("encodes the target id and issues DELETE", async () => {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "/api/v1/users/me/sessions/a%2Fb");
      assert.equal(init?.method, "DELETE");
      return Response.json({ currentSessionRevoked: false, revokedSessionId: "a/b" });
    };
    assert.equal((await revokeAuthSessionClient("a/b")).revokedSessionId, "a/b");
  });

  it("uses the dedicated bulk endpoint and rejects failed responses", async () => {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "/api/v1/users/me/sessions/revoke-others");
      assert.equal(init?.method, "POST");
      return Response.json({ error: "no" }, { status: 500 });
    };
    await assert.rejects(() => revokeOtherAuthSessionsClient(), /Failed to revoke sessions/);
  });
});
