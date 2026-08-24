import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mobileThreadFollowRoute, type MobileThreadFollowRouteDependencies } from "./route-logic";

function dependencies(calls: string[]): MobileThreadFollowRouteDependencies {
  return {
    authenticate: async () => {
      calls.push("auth");
      return "user-1";
    },
    authorizeParent: async ({ channelId, messageId, userId }) => {
      calls.push(`parent:${userId}:${channelId}:${messageId}`);
    },
    enforceRateLimit: async (userId) => {
      calls.push(`rate:${userId}`);
    },
    read: async ({ messageId, userId }) => {
      calls.push(`read:${userId}:${messageId}`);
      return true;
    },
    write: async ({ channelId, following, messageId, userId }) => {
      calls.push(`write:${userId}:${channelId}:${messageId}:${following}`);
      return { following };
    },
  };
}

const context = {
  params: Promise.resolve({ channelId: "channel-1", messageId: "message-1" }),
};

describe("mobileThreadFollowRoute", () => {
  it("GET mobil kimliği, limit ve görünür kökü doğruladıktan sonra gerçek durumu okur", async () => {
    const calls: string[] = [];
    const response = await mobileThreadFollowRoute(
      new Request("https://whispr.test/thread-follow"),
      context,
      "GET",
      dependencies(calls),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { following: true });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1",
      "parent:user-1:channel-1:message-1",
      "read:user-1:message-1",
    ]);
  });

  for (const [method, following] of [
    ["PUT", true],
    ["DELETE", false],
  ] as const) {
    it(`${method} açık takip durumunu ${following} yazar`, async () => {
      const calls: string[] = [];
      const response = await mobileThreadFollowRoute(
        new Request("https://whispr.test/thread-follow", { method }),
        context,
        method,
        dependencies(calls),
      );

      assert.deepEqual(await response.json(), { following });
      assert.equal(calls.at(-1), `write:user-1:channel-1:message-1:${following}`);
    });
  }
});
