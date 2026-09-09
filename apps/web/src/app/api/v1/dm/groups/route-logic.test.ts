import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { API_RATE_LIMITS } from "@/lib/api-rate-limit";

import {
  groupAddMembersRoute,
  groupCallStateRoute,
  groupClearHistoryRoute,
  groupCreateRoute,
  groupDeleteRoute,
  groupMemberRoleRoute,
  groupMembersReadRoute,
  groupPinDismissRoute,
  groupPinRoute,
  groupProfileDefaults,
  groupProfileRoute,
  groupReadRoute,
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
    enableInvite: async () => {},
    emitCreated: () => {},
    emitMembersChanged: () => {},
    emitPinChanged: () => {},
    emitRoleChanged: () => {},
    emitSettingsChanged: () => {},
    enforceRateLimit: async () => {},
    evictRemoved: () => {},
    getIo: () => ({}) as never,
    loadConversation: async () => conversation,
    loadConversationForBroadcast: async () => conversation,
    readCallState: async () => null,
    requireParticipant: async () => ({}),
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

  /**
   * K2 / 2c §7. The tick is not part of the conversation row, so it is spent
   * here: the invite is minted for the group the same request just created, and
   * the client never has to follow up with a second call it might not survive.
   */
  it("mints the invite link when the creator ticked it, before answering", async () => {
    const calls: unknown[] = [];
    const response = await groupCreateRoute(
      new Request("https://whispr.test/api/v1/dm/groups", {
        body: JSON.stringify({
          inviteEnabled: true,
          name: "Takım",
          userIds: ["user-2", "user-3"],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      buildDependencies({
        createGroup: async (_actorId: string, input: { inviteEnabled?: boolean }) => {
          // The flag never reaches the conversation writer: it is about the
          // invite row, and the service has no business with it.
          assert.equal("inviteEnabled" in input, false);
          calls.push("create");
          return conversation;
        },
        enableInvite: async (actorId: string, conversationId: string) => {
          calls.push({ actorId, conversationId });
        },
      }),
    );

    assert.equal(response.status, 201);
    assert.deepEqual(calls, ["create", { actorId: "user-1", conversationId: "group-1" }]);
  });

  it("leaves the invite alone when the creator did not tick it", async () => {
    const calls: string[] = [];
    await groupCreateRoute(
      new Request("https://whispr.test/api/v1/dm/groups", {
        body: JSON.stringify({
          inviteEnabled: false,
          name: "Takım",
          userIds: ["user-2", "user-3"],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      buildDependencies({
        enableInvite: async () => {
          calls.push("enabled");
        },
      }),
    );

    assert.deepEqual(calls, []);
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
          avatarColor: "success",
          description: "Mobil ekibi",
          historyVisibility: "NONE",
          name: "Takım",
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
        avatarColor: "success",
        description: "Mobil ekibi",
        historyVisibility: "NONE",
        name: "Takım",
        permAddMembers: "ADMINS",
        userIds: ["user-2", "user-3"],
      },
    ]);
  });

  it("rejects a colour outside the six-swatch palette", async () => {
    const response = await groupCreateRoute(
      new Request("https://whispr.test/api/v1/dm/groups", {
        body: JSON.stringify({
          avatarColor: "#000000",
          name: "Takım",
          userIds: ["user-2", "user-3"],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      buildDependencies(),
    );

    assert.equal(response.status, 400);
  });
});

/**
 * Faz 5 §C1/§D1 + §B5. The two reads 2e, 2f and the call banner open on. They
 * are the phase's only new endpoints, and both are membership-gated: everything
 * they hand over is already visible to somebody inside the group.
 */
describe("group read route", () => {
  it("answers with the conversation the two screens are built from", async () => {
    const actions: string[] = [];
    const response = await groupReadRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1"),
      "group-1",
      buildDependencies({
        enforceRateLimit: async (_id: string, action: string) => {
          actions.push(action);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { conversation });
    assert.deepEqual(actions, ["dm:group:read"]);
  });

  it("passes the viewer through, because the body is viewer-scoped", async () => {
    // `role`, `notifyLevel`, `pinnedAt` and the pinned strip's `dismissed` are
    // all the reader's own state: a read that dropped the viewer would answer
    // with somebody else's screen.
    const calls: unknown[] = [];
    await groupReadRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1"),
      "group-1",
      buildDependencies({
        authenticate: async () => "user-9",
        loadConversation: async (conversationId: string, userId: string) => {
          calls.push({ conversationId, userId });
          return conversation;
        },
      }),
    );

    assert.deepEqual(calls, [{ conversationId: "group-1", userId: "user-9" }]);
  });

  it("surfaces the service's 403 rather than an empty conversation", async () => {
    const response = await groupReadRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1"),
      "group-1",
      buildDependencies({
        loadConversation: async () => {
          throw new ApiError("Not a participant", 403);
        },
      }),
    );

    assert.equal(response.status, 403);
  });
});

describe("group call state route", () => {
  it("hands over the stored roster whole", async () => {
    const response = await groupCallStateRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/call"),
      "group-1",
      buildDependencies({
        readCallState: async () => ({
          participants: [
            { joinedAt: "2026-08-11T10:00:00.000Z", userId: "user-1" },
            { joinedAt: "2026-08-11T10:01:00.000Z", userId: "user-2" },
          ],
          startedAt: "2026-08-11T10:00:00.000Z",
          video: true,
        }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      callState: {
        active: true,
        conversationId: "group-1",
        participants: [
          { joinedAt: "2026-08-11T10:00:00.000Z", userId: "user-1" },
          { joinedAt: "2026-08-11T10:01:00.000Z", userId: "user-2" },
        ],
        startedAt: "2026-08-11T10:00:00.000Z",
        video: true,
      },
    });
  });

  it("answers the tombstone when nothing is running", async () => {
    const response = await groupCallStateRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/call"),
      "group-1",
      buildDependencies(),
    );

    assert.deepEqual(await response.json(), {
      callState: {
        active: false,
        conversationId: "group-1",
        participants: [],
        startedAt: null,
        video: false,
      },
    });
  });

  it("checks membership before it reads Redis", async () => {
    const calls: string[] = [];
    const response = await groupCallStateRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/call"),
      "group-1",
      buildDependencies({
        readCallState: async () => {
          calls.push("read");
          return null;
        },
        requireParticipant: async () => {
          calls.push("gate");
          throw new ApiError("Not a participant", 403);
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.deepEqual(calls, ["gate"]);
  });
});

// ---------------------------------------------------------------------------
// §15 profil paneli — grup kolu
// ---------------------------------------------------------------------------

const profilePanel = {
  addPolicy: "ALL" as const,
  avatarColor: "primary" as const,
  conversationId: "group-1",
  createdAt: "2026-03-02T09:00:00.000Z",
  description: null,
  historyVisibility: "LAST_30D" as const,
  initials: "S2",
  invite: null,
  memberCount: 3,
  muted: false,
  mutedUntil: null,
  name: "Sürüm 2.4 Ekibi",
  notifyLevel: "ALL" as const,
  onlineCount: 2,
  ownerName: "Doğukan Yazar",
  pinnedMessages: [],
  viewerRole: "OWNER" as const,
};

const memberPage = {
  items: [
    {
      initials: "DY",
      isSelf: true,
      lastSeenAt: null,
      name: "Doğukan Yazar",
      presence: "online" as const,
      role: "OWNER" as const,
      statusText: null,
      tint: "primary" as const,
      userId: "user-1",
    },
  ],
  nextCursor: null,
  total: 3,
};

function buildSocket() {
  const emits: Array<{ event: string; payload: unknown; rooms: string | string[] }> = [];
  const left: Array<{ from: string; room: string }> = [];

  return {
    emits,
    io: {
      in: (room: string) => ({
        socketsLeave: (target: string) => {
          left.push({ from: room, room: target });
        },
      }),
      to: (rooms: string | string[]) => ({
        emit: (event: string, payload: unknown) => {
          emits.push({ event, payload, rooms });
        },
      }),
    },
    left,
  };
}

function buildProfileDependencies(overrides = {}) {
  return {
    ...groupProfileDefaults,
    authenticate: async () => "user-1",
    clearHistory: async () => ({
      clearedAt: "2026-08-27T12:00:00.000Z",
      memberCount: 3,
      participantUserIds: ["user-1", "user-2", "user-3"],
    }),
    deleteGroup: async () => ({ participantUserIds: ["user-1", "user-2", "user-3"] }),
    enforceRateLimit: async () => {},
    getIo: () => null,
    listMembers: async () => memberPage,
    loadProfile: async () => profilePanel,
    ...overrides,
  };
}

describe("group profile route", () => {
  it("answers with the panel and spends the group read budget", async () => {
    const actions: string[] = [];
    const response = await groupProfileRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/profile"),
      "group-1",
      buildProfileDependencies({
        enforceRateLimit: async (_userId: string, action: string) => {
          actions.push(action);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { profile: profilePanel });
    assert.deepEqual(actions, ["dm:group:read"]);
  });

  it("reads as the authenticated caller, never as an id from the request", async () => {
    const seen: Array<{ conversationId: string; viewerId: string }> = [];
    await groupProfileRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/profile?userId=user-9"),
      "group-1",
      buildProfileDependencies({
        loadProfile: async (viewerId: string, conversationId: string) => {
          seen.push({ conversationId, viewerId });
          return profilePanel;
        },
      }),
    );

    assert.deepEqual(seen, [{ conversationId: "group-1", viewerId: "user-1" }]);
  });

  it("passes the service 403 through untouched", async () => {
    const response = await groupProfileRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/profile"),
      "group-1",
      buildProfileDependencies({
        loadProfile: async () => {
          throw new ApiError("You are not a participant in this conversation", 403, "FORBIDDEN");
        },
      }),
    );

    assert.equal(response.status, 403);
  });

  it("rejects an empty conversation id before touching the service", async () => {
    let called = false;
    const response = await groupProfileRoute(
      new Request("https://whispr.test/api/v1/dm/groups//profile"),
      "   ",
      buildProfileDependencies({
        loadProfile: async () => {
          called = true;
          return profilePanel;
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(called, false);
  });
});

describe("group members read route", () => {
  it("forwards the cursor and the limit from the query string", async () => {
    const seen: unknown[] = [];
    const response = await groupMembersReadRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/members?cursor=abc&limit=10"),
      "group-1",
      buildProfileDependencies({
        listMembers: async (_viewerId: string, _conversationId: string, options: unknown) => {
          seen.push(options);
          return memberPage;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), memberPage);
    assert.deepEqual(seen, [{ cursor: "abc", limit: 10 }]);
  });

  it("defaults both to null when the query string is empty", async () => {
    const seen: unknown[] = [];
    await groupMembersReadRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/members"),
      "group-1",
      buildProfileDependencies({
        listMembers: async (_viewerId: string, _conversationId: string, options: unknown) => {
          seen.push(options);
          return memberPage;
        },
      }),
    );

    assert.deepEqual(seen, [{ cursor: null, limit: null }]);
  });

  it("refuses a limit that is not a number", async () => {
    const response = await groupMembersReadRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/members?limit=all"),
      "group-1",
      buildProfileDependencies(),
    );

    assert.equal(response.status, 400);
  });
});

describe("group clear history route", () => {
  it("spends its own tighter bucket rather than the update one", async () => {
    const actions: string[] = [];
    const response = await groupClearHistoryRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/history", { method: "DELETE" }),
      "group-1",
      buildProfileDependencies({
        enforceRateLimit: async (_userId: string, action: string) => {
          actions.push(action);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { clearedAt: "2026-08-27T12:00:00.000Z" });
    assert.deepEqual(actions, [groupProfileDefaults.rateLimits.clearHistory]);
  });

  it("tells the conversation room and every member own room", async () => {
    const socket = buildSocket();
    await groupClearHistoryRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/history", { method: "DELETE" }),
      "group-1",
      buildProfileDependencies({ getIo: () => socket.io }),
    );

    assert.equal(socket.emits.length, 1);
    assert.equal(socket.emits[0]?.event, "dm:conversation:history_cleared");
    assert.deepEqual(socket.emits[0]?.rooms, [
      "dm:group-1",
      "user:user-1",
      "user:user-2",
      "user:user-3",
    ]);
    assert.deepEqual(socket.emits[0]?.payload, {
      clearedAt: "2026-08-27T12:00:00.000Z",
      conversationId: "group-1",
    });
  });

  it("answers with the service status when the caller is only a member", async () => {
    const response = await groupClearHistoryRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1/history", { method: "DELETE" }),
      "group-1",
      buildProfileDependencies({
        clearHistory: async () => {
          throw new ApiError("Only group admins can do this", 403, "NOT_GROUP_ADMIN");
        },
      }),
    );

    assert.equal(response.status, 403);
  });
});

describe("group delete route", () => {
  it("spends the delete bucket and answers 204", async () => {
    const actions: string[] = [];
    const response = await groupDeleteRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1", { method: "DELETE" }),
      "group-1",
      buildProfileDependencies({
        enforceRateLimit: async (_userId: string, action: string) => {
          actions.push(action);
        },
      }),
    );

    assert.equal(response.status, 204);
    assert.deepEqual(actions, [groupProfileDefaults.rateLimits.delete]);
  });

  it("removes the conversation from every member and empties the room", async () => {
    const socket = buildSocket();
    await groupDeleteRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1", { method: "DELETE" }),
      "group-1",
      buildProfileDependencies({ getIo: () => socket.io }),
    );

    assert.deepEqual(socket.emits, [
      {
        event: "dm:conversation:removed",
        payload: { conversationId: "group-1" },
        rooms: ["user:user-1", "user:user-2", "user:user-3"],
      },
    ]);
    assert.deepEqual(socket.left, [{ from: "dm:group-1", room: "dm:group-1" }]);
  });

  it("passes an admin 403 through instead of deleting", async () => {
    const socket = buildSocket();
    const response = await groupDeleteRoute(
      new Request("https://whispr.test/api/v1/dm/groups/group-1", { method: "DELETE" }),
      "group-1",
      buildProfileDependencies({
        deleteGroup: async () => {
          throw new ApiError("Only the group owner can do this", 403, "NOT_GROUP_OWNER");
        },
        getIo: () => socket.io,
      }),
    );

    assert.equal(response.status, 403);
    assert.deepEqual(socket.emits, []);
  });
});

describe("group profile rate limit buckets", () => {
  /**
   * Each destructive row spends its own budget. Pointing either one back at the
   * shared group-write bucket would let a loop on "Grubu sil" hide inside ordinary
   * settings traffic, so the mapping is asserted rather than assumed.
   */
  it("keeps a separate bucket for each destructive row", () => {
    assert.deepEqual(groupProfileDefaults.rateLimits, {
      clearHistory: "dm:group:clear-history",
      delete: "dm:group:delete",
      read: "dm:group:read",
    });
  });

  it("registers those buckets tighter than the shared group-write budget", () => {
    const write = API_RATE_LIMITS["dm:group:update"];
    const clear = API_RATE_LIMITS["dm:group:clear-history"];
    const remove = API_RATE_LIMITS["dm:group:delete"];

    for (const bucket of [clear, remove]) {
      assert.ok(bucket, "destructive bucket is not registered");
      // Fewer calls over a longer window: strictly tighter on both axes.
      assert.ok(bucket.limit < write.limit);
      assert.ok(bucket.windowSeconds > write.windowSeconds);
    }

    // Deleting is the one that cannot be undone, so it is the stricter of the two.
    assert.ok(remove.limit < clear.limit);
  });
});
