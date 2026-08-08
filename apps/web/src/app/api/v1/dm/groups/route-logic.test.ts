import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  groupAddMembersRoute,
  groupCreateRoute,
  groupRemoveMemberRoute,
  groupUpdateRoute,
} from "./route-logic";

const conversation = {
  iconUrl: null,
  id: "group-1",
  lastMessage: null,
  lastMessageAt: "2026-08-07T09:00:00.000Z",
  name: "Takım",
  ownerId: "user-1",
  participants: [],
  type: "GROUP_DM" as const,
};

function buildDependencies(overrides = {}) {
  return {
    addMembers: async () => conversation,
    authenticate: async () => "user-1",
    createGroup: async () => conversation,
    emitCreated: () => {},
    emitMembersChanged: () => {},
    enforceRateLimit: async () => {},
    evictRemoved: () => {},
    getIo: () => ({}) as never,
    loadConversationForBroadcast: async () => conversation,
    removeMember: async () => ({ broadcastViewerId: "user-1" }),
    updateGroup: async () => conversation,
    ...overrides,
  };
}

describe("group create route", () => {
  it("creates the group, announces it and returns 201", async () => {
    const calls: unknown[] = [];
    const response = await groupCreateRoute(
      new Request("https://whispr.test/api/v1/dm/groups", {
        body: JSON.stringify({ name: "Takım", userIds: ["user-2", "user-3"] }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      buildDependencies({
        createGroup: async (actorId: string, input: unknown) => {
          calls.push({ actorId, input });
          return conversation;
        },
        emitCreated: (_io: unknown, announced: unknown) => {
          calls.push({ announced });
        },
        enforceRateLimit: async (_id: string, action: string) => {
          calls.push(action);
        },
      }),
    );

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { conversation });
    assert.deepEqual(calls, [
      "dm:group:create",
      { actorId: "user-1", input: { name: "Takım", userIds: ["user-2", "user-3"] } },
      { announced: conversation },
    ]);
  });

  it("rejects a body with only one member", async () => {
    const response = await groupCreateRoute(
      new Request("https://whispr.test/api/v1/dm/groups", {
        body: JSON.stringify({ userIds: ["user-2"] }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      buildDependencies(),
    );

    assert.equal(response.status, 400);
  });
});

describe("group update route", () => {
  it("renames the group and announces the change", async () => {
    const calls: unknown[] = [];
    const response = await groupUpdateRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1", {
        body: JSON.stringify({ name: "Yeni ad" }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      "group-1",
      buildDependencies({
        emitMembersChanged: (_io: unknown, input: unknown) => {
          calls.push(input);
        },
        updateGroup: async (actorId: string, conversationId: string, patch: unknown) => {
          calls.push({ actorId, conversationId, patch });
          return conversation;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      { actorId: "user-1", conversationId: "group-1", patch: { name: "Yeni ad" } },
      { conversation },
    ]);
  });
});

describe("group add members route", () => {
  it("adds the members and announces them to their own rooms", async () => {
    const calls: unknown[] = [];
    const response = await groupAddMembersRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/members", {
        body: JSON.stringify({ userIds: ["user-4"] }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      "group-1",
      buildDependencies({
        addMembers: async (actorId: string, conversationId: string, userIds: string[]) => {
          calls.push({ actorId, conversationId, userIds });
          return conversation;
        },
        emitMembersChanged: (_io: unknown, input: unknown) => {
          calls.push(input);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      { actorId: "user-1", conversationId: "group-1", userIds: ["user-4"] },
      { addedUserIds: ["user-4"], conversation },
    ]);
  });
});

describe("group remove member route", () => {
  it("removes the member, evicts their sockets and returns 204", async () => {
    const calls: unknown[] = [];
    const response = await groupRemoveMemberRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/members/user-3", {
        method: "DELETE",
      }),
      "group-1",
      "user-3",
      buildDependencies({
        emitMembersChanged: () => {
          calls.push("members_changed");
        },
        evictRemoved: (_io: unknown, input: unknown) => {
          calls.push(input);
        },
        removeMember: async (actorId: string, conversationId: string, targetUserId: string) => {
          calls.push({ actorId, conversationId, targetUserId });
          return { broadcastViewerId: "user-1" };
        },
      }),
    );

    assert.equal(response.status, 204);
    assert.deepEqual(calls, [
      { actorId: "user-1", conversationId: "group-1", targetUserId: "user-3" },
      { conversationId: "group-1", userId: "user-3" },
      "members_changed",
    ]);
  });

  it("skips the members_changed broadcast when the group is gone", async () => {
    const calls: string[] = [];
    const response = await groupRemoveMemberRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/members/user-1", {
        method: "DELETE",
      }),
      "group-1",
      "user-1",
      buildDependencies({
        emitMembersChanged: () => {
          calls.push("members_changed");
        },
        loadConversationForBroadcast: async () => null,
        removeMember: async () => ({ broadcastViewerId: null }),
      }),
    );

    assert.equal(response.status, 204);
    assert.deepEqual(calls, []);
  });

  /**
   * A leave used to read the conversation back as the actor — who had just
   * stopped being a participant — so the read came back empty and the remaining
   * members were never told anybody had gone.
   */
  it("tells the remaining members when somebody leaves, reading as a member who stayed", async () => {
    const calls: unknown[] = [];
    const response = await groupRemoveMemberRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/members/user-2", {
        method: "DELETE",
      }),
      "group-1",
      "user-2",
      buildDependencies({
        authenticate: async () => "user-2",
        emitMembersChanged: () => {
          calls.push("members_changed");
        },
        loadConversationForBroadcast: async (_conversationId: string, viewerId: string) => {
          calls.push({ readAs: viewerId });
          // The real loader requires participation, so the leaver would get null.
          return viewerId === "user-2" ? null : conversation;
        },
        removeMember: async () => ({ broadcastViewerId: "user-3" }),
      }),
    );

    assert.equal(response.status, 204);
    assert.deepEqual(calls, [{ readAs: "user-3" }, "members_changed"]);
  });
});
