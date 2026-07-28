import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MobileApiClient } from "../src/api/mobile-api-client";

const social = import("../src/social/mobile-social-client");

const user = { avatarUrl: null, displayName: "Ada", id: "user-2", username: "ada" };
const overview = {
  blocked: [],
  friends: [
    {
      ...user,
      customStatus: null,
      device: null,
      lastSeenAt: null,
      presence: { customStatus: null, status: "ONLINE" },
      status: "ONLINE",
      voiceRoom: null,
    },
  ],
  pending: { incoming: [], outgoing: [] },
};

function client(handler: (path: string, options?: unknown) => unknown): MobileApiClient {
  return {
    requestJson: async <TResponse>(path: string, options?: unknown) =>
      handler(path, options) as TResponse,
  };
}

describe("mobile social client", () => {
  it("loads schema-validated friends without trusting malformed payloads", async () => {
    const { fetchMobileFriends } = await social;
    assert.deepEqual(await fetchMobileFriends(client(() => overview)), overview);
    await assert.rejects(() => fetchMobileFriends(client(() => ({ ...overview, secret: true }))));
  });

  it("encodes friend mutations and keeps request bodies narrow", async () => {
    const { blockMobileFriend, createMobileFriendRequest, removeMobileFriend } = await social;
    const calls: Array<[string, unknown]> = [];
    const api = client((path, options) => {
      calls.push([path, options]);
      if (path.includes("blocks")) return { blocked: user };
      if (path.includes("requests"))
        return {
          request: {
            createdAt: new Date().toISOString(),
            id: "r-1",
            receiver: user,
            receiverId: user.id,
            sender: { ...user, id: "user-1", username: "dogukan" },
            senderId: "user-1",
            status: "PENDING",
            updatedAt: new Date().toISOString(),
          },
        };
      return { success: true };
    });
    await createMobileFriendRequest(api, " ada ");
    await blockMobileFriend(api, "user/2");
    await removeMobileFriend(api, "user/2");
    assert.equal(calls[0]?.[0], "/api/v1/mobile/friends/requests");
    assert.deepEqual((calls[0] as [string, { body: unknown }])[1].body, { username: "ada" });
    assert.equal(calls[1]?.[0], "/api/v1/mobile/friends/blocks/user%2F2");
  });

  it("updates only whitelisted presence and profile fields", async () => {
    const { updateMobilePresence, updateMobileProfile } = await social;
    const calls: Array<[string, unknown]> = [];
    const api = client((path, options) => {
      calls.push([path, options]);
      return path.endsWith("presence")
        ? { status: "DND" }
        : { user: { ...user, customStatus: null, status: "DND", twoFactorEnabled: false } };
    });
    await updateMobilePresence(api, "DND");
    await updateMobileProfile(api, { displayName: " Ada " });
    assert.deepEqual((calls[1] as [string, { body: unknown }])[1].body, { displayName: "Ada" });
  });

  it("opens a friend DM through the bounded mobile endpoint", async () => {
    const { openMobileFriendDM } = await social;
    const calls: unknown[] = [];
    const conversation = {
      id: "dm-1",
      lastMessage: null,
      lastMessageAt: new Date().toISOString(),
      name: null,
      participants: [
        {
          avatarUrl: null,
          customStatus: null,
          displayName: "Ada",
          muted: false,
          presence: { customStatus: null, status: "ONLINE" },
          status: "ONLINE",
          unreadCount: 0,
          userId: "user-2",
          username: "ada",
        },
      ],
      type: "DM",
    };
    const result = await openMobileFriendDM(
      client((path, options) => {
        calls.push([path, options]);
        return { conversation };
      }),
      "user-2",
    );
    assert.equal(result.conversation.id, "dm-1");
    assert.equal((calls[0] as [string])[0], "/api/v1/mobile/dm");
  });

  it("asks the suggestions endpoint for a bounded page and validates what comes back", async () => {
    const { fetchMobileFriendSuggestions, MOBILE_FRIEND_SUGGESTION_LIMIT } = await social;
    const calls: string[] = [];
    const suggestion = {
      ...user,
      mutualFriendCount: 4,
      mutualServerCount: 0,
      mutualServerName: null,
    };
    const api = client((path) => {
      calls.push(path);
      return { suggestions: [suggestion] };
    });

    assert.deepEqual(await fetchMobileFriendSuggestions(api), { suggestions: [suggestion] });
    assert.deepEqual(await fetchMobileFriendSuggestions(api, 3), { suggestions: [suggestion] });
    assert.deepEqual(calls, [
      `/api/v1/mobile/friends/suggestions?limit=${MOBILE_FRIEND_SUGGESTION_LIMIT}`,
      "/api/v1/mobile/friends/suggestions?limit=3",
    ]);

    // An unrecognised field is a contract break, not something to pass through.
    await assert.rejects(() =>
      fetchMobileFriendSuggestions(
        client(() => ({ suggestions: [{ ...suggestion, mutualFriendUsername: "selin_qa" }] })),
      ),
    );
  });
});
