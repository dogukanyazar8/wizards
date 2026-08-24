import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { CancelledError } from "@tanstack/react-query";

import {
  applyDiscoverMembershipSuccess,
  joinDiscoverServer,
  leaveDiscoverServer,
  parseInviteCode,
  redeemDiscoverInvite,
  resolveDiscoverJoinErrorMessageKey,
} from "./join-client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("parseInviteCode", () => {
  it("accepts raw, Whispr-prefixed, canonical URL, and any-origin invite URL", () => {
    assert.equal(parseInviteCode("abc12345"), "abc12345");
    assert.equal(parseInviteCode("  whispr.app/abc12345  "), "abc12345");
    assert.equal(parseInviteCode("https://whispr.app/invite/abc12345"), "abc12345");
    assert.equal(parseInviteCode("https://community.example/invite/abc12345"), "abc12345");
  });

  it("rejects empty, whitespace, query, wrong path, and 60-character input", () => {
    for (const value of [
      "",
      "abc 123",
      "https://whispr.app/invite/abc12345?ref=mail",
      "https://community.example/server/abc12345",
      "a".repeat(60),
    ]) {
      assert.equal(parseInviteCode(value), null, value);
    }
  });
});

describe("discover join requests", () => {
  it("wraps the three existing endpoints and returns server identity", async (context) => {
    const requests: Array<{ body: string | null; method: string; url: string }> = [];
    context.after(() => mock.restoreAll());
    mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        body: typeof init?.body === "string" ? init.body : null,
        method: init?.method ?? "GET",
        url: String(input),
      });
      if (init?.method === "DELETE") {
        return jsonResponse({ success: true });
      }
      return jsonResponse({ name: "Whispr Topluluğu", serverId: "server-1", success: true });
    });

    assert.deepEqual(await joinDiscoverServer("server/1"), {
      name: "Whispr Topluluğu",
      serverId: "server-1",
    });
    await leaveDiscoverServer("server/1");
    assert.deepEqual(await redeemDiscoverInvite("abc12345"), {
      name: "Whispr Topluluğu",
      serverId: "server-1",
    });
    assert.deepEqual(requests, [
      { body: null, method: "POST", url: "/api/v1/servers/server%2F1/join" },
      { body: null, method: "DELETE", url: "/api/v1/servers/server%2F1/members/me" },
      {
        body: JSON.stringify({ inviteCode: "abc12345" }),
        method: "POST",
        url: "/api/v1/servers/join",
      },
    ]);
  });

  it("maps banned/full/unavailable/generic using the existing discovery mapping", async (context) => {
    context.after(() => mock.restoreAll());
    for (const [code, expected] of [
      ["SERVER_BANNED", "discover.joinError.banned"],
      ["SERVER_FULL", "discover.joinError.full"],
      ["SERVER_NOT_FOUND", "discover.joinError.unavailable"],
      ["UNKNOWN", "discover.joinError.generic"],
    ] as const) {
      mock.restoreAll();
      mock.method(globalThis, "fetch", async () => jsonResponse({ code, error: "refused" }, 403));
      await assert.rejects(joinDiscoverServer("server-1"), (error: unknown) => {
        assert.equal(resolveDiscoverJoinErrorMessageKey(error), expected);
        return true;
      });
    }
  });
});

describe("discover membership invalidation", () => {
  it("updates profile and invalidates workspace plus all server-grid variants in one helper", async () => {
    const operations: unknown[] = [];
    const queryClient = {
      invalidateQueries: async (filters: unknown, options?: unknown) => {
        operations.push(["invalidate", filters, options]);
      },
      setQueryData: (key: unknown, updater: (old: unknown) => unknown) => {
        operations.push(["set", key, updater({ joined: false, name: "Sunucu" })]);
      },
    };

    await applyDiscoverMembershipSuccess(queryClient, "server-1", true);

    assert.deepEqual(operations, [
      ["set", ["discover", "profile", "server-1"], { joined: true, name: "Sunucu" }],
      ["invalidate", { queryKey: ["workspace", "servers"] }, { cancelRefetch: false }],
      ["invalidate", { queryKey: ["discover", "servers"] }, { cancelRefetch: false }],
    ]);
  });

  it("ignores a superseded TanStack refresh after membership already succeeded", async () => {
    const foreignCancellation = Object.assign(new Error("CancelledError"), {
      revert: undefined,
      silent: undefined,
    });
    const queryClient = {
      invalidateQueries: () => {
        throw foreignCancellation;
      },
      setQueryData: () => undefined,
    };

    await assert.doesNotReject(applyDiscoverMembershipSuccess(queryClient, "server-1", true));
  });

  it("also recognizes the local TanStack cancellation class", async () => {
    const queryClient = {
      invalidateQueries: async () => {
        throw new CancelledError();
      },
      setQueryData: () => undefined,
    };

    await assert.doesNotReject(applyDiscoverMembershipSuccess(queryClient, "server-1", true));
  });

  it("keeps non-cancellation refresh failures observable", async () => {
    const queryClient = {
      invalidateQueries: async () => {
        throw new Error("cache transport failed");
      },
      setQueryData: () => undefined,
    };

    await assert.rejects(
      applyDiscoverMembershipSuccess(queryClient, "server-1", true),
      /cache transport failed/u,
    );
  });
});
