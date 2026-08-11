import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  groupAddMembersRoute,
  groupCreateRoute,
  groupMemberRoleRoute,
  groupPinDismissRoute,
  groupPinRoute,
  groupRemoveMemberRoute,
  groupSettingsRoute,
  groupUnpinRoute,
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
    dismissPin: async () => {},
    emitCreated: () => {},
    emitMembersChanged: () => {},
    emitPinChanged: () => {},
    emitRoleChanged: () => {},
    emitSettingsChanged: () => {},
    enforceRateLimit: async () => {},
    evictRemoved: () => {},
    getIo: () => ({}) as never,
    loadConversationForBroadcast: async () => conversation,
    removeMember: async () => ({ broadcastViewerId: "user-1" }),
    setPin: async () => conversation,
    updateGroup: async () => conversation,
    updateMemberRole: async () => conversation,
    updateSettings: async () => conversation,
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

function jsonRequest(body: unknown, method = "PATCH") {
  return new Request("https://whispr.test/api/v1/dm/groups/group-1/settings", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method,
  });
}

describe("group settings route", () => {
  it("forwards the patch and announces the new settings", async () => {
    const calls: unknown[] = [];
    const response = await groupSettingsRoute(
      jsonRequest({ historyVisibility: "NONE", permSendMessage: "ADMINS" }),
      "group-1",
      buildDependencies({
        emitSettingsChanged: (_io: unknown, announced: unknown) => {
          calls.push({ announced });
        },
        updateSettings: async (actorId: string, conversationId: string, patch: unknown) => {
          calls.push({ actorId, conversationId, patch });
          return conversation;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { conversation });
    assert.deepEqual(calls, [
      {
        actorId: "user-1",
        conversationId: "group-1",
        patch: { historyVisibility: "NONE", permSendMessage: "ADMINS" },
      },
      { announced: conversation },
    ]);
  });

  it("rejects an empty patch", async () => {
    const response = await groupSettingsRoute(jsonRequest({}), "group-1", buildDependencies());

    assert.equal(response.status, 400);
  });

  it("rejects a key that is not a setting", async () => {
    const response = await groupSettingsRoute(
      jsonRequest({ ownerId: "user-2" }),
      "group-1",
      buildDependencies(),
    );

    assert.equal(response.status, 400);
  });

  it("passes the service's 403 straight through", async () => {
    const response = await groupSettingsRoute(
      jsonRequest({ permEditInfo: "ALL" }),
      "group-1",
      buildDependencies({
        updateSettings: async () => {
          const { ApiError } = await import("@/lib/api");
          throw new ApiError("You do not have permission to do this", 403, "FORBIDDEN");
        },
      }),
    );

    assert.equal(response.status, 403);
  });
});

describe("group member role route", () => {
  it("promotes a member and announces the new role", async () => {
    const calls: unknown[] = [];
    const response = await groupMemberRoleRoute(
      jsonRequest({ role: "ADMIN" }),
      "group-1",
      "user-2",
      buildDependencies({
        emitRoleChanged: (_io: unknown, payload: unknown) => {
          calls.push({ emitted: payload });
        },
        updateMemberRole: async (
          actorId: string,
          conversationId: string,
          targetUserId: string,
          input: unknown,
        ) => {
          calls.push({ actorId, conversationId, input, targetUserId });
          return conversation;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      {
        actorId: "user-1",
        conversationId: "group-1",
        input: { role: "ADMIN" },
        targetUserId: "user-2",
      },
      { emitted: { conversation, role: "ADMIN", userId: "user-2" } },
    ]);
  });

  it("announces OWNER on a handover", async () => {
    const emitted: unknown[] = [];
    await groupMemberRoleRoute(
      jsonRequest({ transferOwnership: true }),
      "group-1",
      "user-2",
      buildDependencies({
        emitRoleChanged: (_io: unknown, payload: unknown) => {
          emitted.push(payload);
        },
      }),
    );

    assert.deepEqual(emitted, [{ conversation, role: "OWNER", userId: "user-2" }]);
  });

  it("rejects a body that both promotes and hands over", async () => {
    const response = await groupMemberRoleRoute(
      jsonRequest({ role: "ADMIN", transferOwnership: true }),
      "group-1",
      "user-2",
      buildDependencies(),
    );

    assert.equal(response.status, 400);
  });
});

describe("group pin routes", () => {
  it("pins a message and broadcasts the strip", async () => {
    const calls: unknown[] = [];
    const pinned = {
      ...conversation,
      pinnedMessage: {
        authorName: "Ada",
        dismissed: false,
        excerpt: "Toplantı 14:00",
        id: "message-1",
      },
    };
    const response = await groupPinRoute(
      jsonRequest({ messageId: "message-1" }, "PUT"),
      "group-1",
      buildDependencies({
        emitPinChanged: (_io: unknown, payload: unknown) => {
          calls.push({ emitted: payload });
        },
        setPin: async (actorId: string, conversationId: string, messageId: unknown) => {
          calls.push({ actorId, conversationId, messageId });
          return pinned;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      { actorId: "user-1", conversationId: "group-1", messageId: "message-1" },
      { emitted: { conversation: pinned, pinnedMessage: pinned.pinnedMessage } },
    ]);
  });

  it("rejects a pin with no message id", async () => {
    const response = await groupPinRoute(jsonRequest({}, "PUT"), "group-1", buildDependencies());

    assert.equal(response.status, 400);
  });

  it("unpins by handing the service a null message id", async () => {
    const calls: unknown[] = [];
    const response = await groupUnpinRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/pin", { method: "DELETE" }),
      "group-1",
      buildDependencies({
        setPin: async (_actorId: string, _conversationId: string, messageId: unknown) => {
          calls.push(messageId);
          return conversation;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [null]);
  });

  it("dismisses the strip without broadcasting anything", async () => {
    const calls: unknown[] = [];
    const response = await groupPinDismissRoute(
      jsonRequest({ messageId: "message-1" }, "POST"),
      "group-1",
      buildDependencies({
        dismissPin: async (userId: string, conversationId: string, messageId: string) => {
          calls.push({ conversationId, messageId, userId });
        },
        emitPinChanged: () => {
          calls.push("broadcast");
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    // A dismissal is one viewer's state; broadcasting it would close the strip
    // for the whole group.
    assert.deepEqual(calls, [
      { conversationId: "group-1", messageId: "message-1", userId: "user-1" },
    ]);
  });
});

describe("group leave transfer", () => {
  it("passes an explicit successor from the DELETE body to the service", async () => {
    const calls: unknown[] = [];
    await groupRemoveMemberRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/members/user-1", {
        body: JSON.stringify({ transferOwnershipTo: "user-2" }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      }),
      "group-1",
      "user-1",
      buildDependencies({
        removeMember: async (
          _actorId: string,
          _conversationId: string,
          _targetUserId: string,
          _dependencies: unknown,
          options: unknown,
        ) => {
          calls.push(options);
          return { broadcastViewerId: "user-2" };
        },
      }),
    );

    assert.deepEqual(calls, [{ transferOwnershipTo: "user-2" }]);
  });

  it("treats a bodyless DELETE as no transfer", async () => {
    const calls: unknown[] = [];
    const response = await groupRemoveMemberRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/members/user-3", {
        method: "DELETE",
      }),
      "group-1",
      "user-3",
      buildDependencies({
        removeMember: async (
          _actorId: string,
          _conversationId: string,
          _targetUserId: string,
          _dependencies: unknown,
          options: unknown,
        ) => {
          calls.push(options);
          return { broadcastViewerId: "user-1" };
        },
      }),
    );

    assert.equal(response.status, 204);
    assert.deepEqual(calls, [{}]);
  });

  it("surfaces the service's 409 when a successor is required", async () => {
    const response = await groupRemoveMemberRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/members/user-1", {
        method: "DELETE",
      }),
      "group-1",
      "user-1",
      buildDependencies({
        removeMember: async () => {
          const { ApiError } = await import("@/lib/api");
          throw new ApiError("Pick somebody", 409, "OWNER_TRANSFER_REQUIRED");
        },
      }),
    );

    assert.equal(response.status, 409);
  });
});

describe("group create route, Faz 1 fields", () => {
  it("forwards colour, description, history window and the add-members permission", async () => {
    const calls: unknown[] = [];
    await groupCreateRoute(
      new Request("https://whispr.test/api/v1/dm/groups", {
        body: JSON.stringify({
          avatarColor: "#1B8A55",
          description: "Mobil ekibi",
          historyVisibility: "NONE",
          permAddMembers: "ADMINS",
          userIds: ["user-2", "user-3"],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      buildDependencies({
        createGroup: async (_actorId: string, input: unknown) => {
          calls.push(input);
          return conversation;
        },
      }),
    );

    assert.deepEqual(calls, [
      {
        avatarColor: "#1B8A55",
        description: "Mobil ekibi",
        historyVisibility: "NONE",
        permAddMembers: "ADMINS",
        userIds: ["user-2", "user-3"],
      },
    ]);
  });

  it("rejects a colour outside the five-swatch palette", async () => {
    const response = await groupCreateRoute(
      new Request("https://whispr.test/api/v1/dm/groups", {
        body: JSON.stringify({ avatarColor: "#000000", userIds: ["user-2", "user-3"] }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      buildDependencies(),
    );

    assert.equal(response.status, 400);
  });
});
