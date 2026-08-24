import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

import {
  mobileGroupAddMembersRoute,
  mobileGroupCallStateRoute,
  mobileGroupCreateRoute,
  mobileGroupMemberRoleRoute,
  mobileGroupPinDismissRoute,
  mobileGroupPinRoute,
  mobileGroupReadRoute,
  mobileGroupRemoveMemberRoute,
  mobileGroupSettingsRoute,
  mobileGroupUnpinRoute,
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
    getIo: () => null,
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

describe("mobile group routes", () => {
  it("uses the mobile rate limit bucket and returns a schema-parsed body", async () => {
    const actions: string[] = [];
    const response = await mobileGroupCreateRoute(
      new Request("https://whispr.test/api/v1/mobile/dm/groups", {
        body: JSON.stringify({ name: "Takım", userIds: ["user-2", "user-3"] }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      buildDependencies({
        enforceRateLimit: async (_id: string, action: string) => {
          actions.push(action);
        },
      }),
    );

    assert.equal(response.status, 201);
    assert.deepEqual(actions, ["mobile:dm:group:create"]);
    assert.deepEqual(await response.json(), { conversation });
  });

  it("uses the mobile members bucket when adding people", async () => {
    const actions: string[] = [];
    const response = await mobileGroupAddMembersRoute(
      new Request("https://whispr.test/api/v1/mobile/dm/groups/group-1/members", {
        body: JSON.stringify({ userIds: ["user-4"] }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      "group-1",
      buildDependencies({
        enforceRateLimit: async (_id: string, action: string) => {
          actions.push(action);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(actions, ["mobile:dm:group:members"]);
  });

  it("returns 204 with no body when a member is removed", async () => {
    const response = await mobileGroupRemoveMemberRoute(
      new Request("https://whispr.test/api/v1/mobile/dm/groups/group-1/members/user-3", {
        method: "DELETE",
      }),
      "group-1",
      "user-3",
      buildDependencies(),
    );

    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
  });
});

describe("mobile group management mirrors", () => {
  function patch(body: unknown, method = "PATCH") {
    return new Request("https://whispr.test/api/v1/mobile/dm/groups/group-1/settings", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method,
    });
  }

  it("bills settings, role and pin writes to the mobile update bucket", async () => {
    const actions: string[] = [];
    const track = {
      enforceRateLimit: async (_id: string, action: string) => {
        actions.push(action);
      },
    };

    await mobileGroupSettingsRoute(
      patch({ permEditInfo: "ALL" }),
      "group-1",
      buildDependencies(track),
    );
    await mobileGroupMemberRoleRoute(
      patch({ role: "ADMIN" }),
      "group-1",
      "user-2",
      buildDependencies(track),
    );
    await mobileGroupPinRoute(
      patch({ messageId: "message-1" }, "PUT"),
      "group-1",
      buildDependencies(track),
    );
    await mobileGroupUnpinRoute(
      new Request("https://whispr.test/api/v1/mobile/dm/groups/group-1/pin", { method: "DELETE" }),
      "group-1",
      buildDependencies(track),
    );
    await mobileGroupPinDismissRoute(
      patch({ messageId: "message-1" }, "POST"),
      "group-1",
      buildDependencies(track),
    );

    assert.deepEqual(actions, [
      "mobile:dm:group:update",
      "mobile:dm:group:update",
      "mobile:dm:group:update",
      "mobile:dm:group:update",
      "mobile:dm:group:update",
    ]);
  });

  it("re-parses the conversation body against the shared schema before it leaves", async () => {
    // The phone is a separate release train: a server-side shape drift has to
    // fail here — loudly, as a thrown ZodError the framework turns into a 500 —
    // rather than on a device that cannot be hot-fixed.
    await assert.rejects(
      mobileGroupSettingsRoute(
        patch({ permEditInfo: "ALL" }),
        "group-1",
        buildDependencies({
          updateSettings: async () => ({ ...conversation, type: "CHANNEL" }) as never,
        }),
      ),
      (error: unknown) => {
        assert.match(String(error), /conversation/);
        return true;
      },
    );
  });

  it("reads the group through the mobile read bucket and re-parses the body", async () => {
    const actions: string[] = [];
    const response = await mobileGroupReadRoute(
      new Request("https://whispr.test/api/v1/mobile/dm/groups/group-1"),
      "group-1",
      buildDependencies({
        enforceRateLimit: async (_id: string, action: string) => {
          actions.push(action);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(actions, ["mobile:dm:group:read"]);
    assert.deepEqual(await response.json(), { conversation });
  });

  it("reads the call roster through the same read bucket", async () => {
    const actions: string[] = [];
    const response = await mobileGroupCallStateRoute(
      new Request("https://whispr.test/api/v1/mobile/dm/groups/group-1/call"),
      "group-1",
      buildDependencies({
        enforceRateLimit: async (_id: string, action: string) => {
          actions.push(action);
        },
        readCallState: async () => ({
          participants: [{ joinedAt: "2026-08-11T10:00:00.000Z", userId: "user-2" }],
          startedAt: "2026-08-11T10:00:00.000Z",
          video: false,
        }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(actions, ["mobile:dm:group:read"]);
    assert.deepEqual(await response.json(), {
      callState: {
        active: true,
        conversationId: "group-1",
        participants: [{ joinedAt: "2026-08-11T10:00:00.000Z", userId: "user-2" }],
        startedAt: "2026-08-11T10:00:00.000Z",
        video: false,
      },
    });
  });

  it("passes a 403 from the membership gate straight through", async () => {
    const response = await mobileGroupCallStateRoute(
      new Request("https://whispr.test/api/v1/mobile/dm/groups/group-1/call"),
      "group-1",
      buildDependencies({
        requireParticipant: async () => {
          throw new ApiError("Not a participant", 403);
        },
      }),
    );

    assert.equal(response.status, 403);
  });

  it("answers a dismissal without a conversation body", async () => {
    const response = await mobileGroupPinDismissRoute(
      patch({ messageId: "message-1" }, "POST"),
      "group-1",
      buildDependencies(),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
  });
});
