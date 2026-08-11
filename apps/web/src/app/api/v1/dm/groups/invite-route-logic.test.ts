import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DMConversationDTO, GroupInviteDTO, GroupInvitePreviewDTO } from "@wizards/types";

import { ApiError } from "@/lib/api";

import {
  groupInviteJoinRoute,
  groupInvitePreviewRoute,
  groupInviteReadRoute,
  groupInviteRotateRoute,
  groupInviteToggleRoute,
  type GroupInviteRouteDependencies,
} from "./invite-route-logic";

const INVITE: GroupInviteDTO = {
  code: "ABCDEFGH2345",
  displayUrl: "whispr.example.com/g/ABCDEFGH2345",
  enabled: true,
  expiresAt: null,
  maxUses: null,
  rotatedAt: null,
  url: "https://whispr.example.com/g/ABCDEFGH2345",
  uses: 0,
};

const PREVIEW: GroupInvitePreviewDTO = {
  alreadyMember: false,
  avatarColor: "#4F46E5",
  code: "ABCDEFGH2345",
  iconUrl: null,
  joinable: true,
  memberCount: 3,
  name: "Mobil Ekibi",
  reason: null,
};

const CONVERSATION = {
  iconUrl: null,
  id: "conversation-1",
  lastMessage: null,
  lastMessageAt: "2026-08-11T12:00:00.000Z",
  name: "Mobil Ekibi",
  ownerId: "owner-1",
  participants: [{ userId: "owner-1" }, { userId: "member-1" }],
  type: "GROUP_DM",
} as unknown as DMConversationDTO;

type Calls = {
  emittedInvite: Array<{ enabled: boolean }>;
  emittedJoins: Array<{ userId: string }>;
  rateLimits: string[];
};

function dependencies(overrides: Partial<GroupInviteRouteDependencies> = {}): {
  calls: Calls;
  deps: GroupInviteRouteDependencies;
} {
  const calls: Calls = { emittedInvite: [], emittedJoins: [], rateLimits: [] };

  const deps: GroupInviteRouteDependencies = {
    authenticate: async () => "owner-1",
    emitInviteChanged: (_io, input) => {
      calls.emittedInvite.push({ enabled: input.enabled });
    },
    emitMemberJoined: (_io, input) => {
      calls.emittedJoins.push({ userId: input.userId });
    },
    enforceRateLimit: async (_userId, action) => {
      calls.rateLimits.push(action);
    },
    getIo: () => ({}) as never,
    joinViaInvite: async () => ({ alreadyMember: false, conversation: CONVERSATION }),
    listParticipantIds: async () => ["owner-1", "member-1"],
    preview: async () => PREVIEW,
    readInvite: async () => INVITE,
    rotateInvite: async () => INVITE,
    setInviteEnabled: async () => INVITE,
    ...overrides,
  };

  return { calls, deps };
}

function jsonRequest(body: unknown) {
  return new Request("https://whispr.example.com/api/v1/dm/groups/conversation-1/invite", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
}

describe("groupInviteToggleRoute", () => {
  it("returns the invite and announces the switch", async () => {
    const { calls, deps } = dependencies();

    const response = await groupInviteToggleRoute(
      jsonRequest({ enabled: true }),
      "conversation-1",
      deps,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { invite: INVITE });
    assert.deepEqual(calls.emittedInvite, [{ enabled: true }]);
    assert.deepEqual(calls.rateLimits, ["dm:group:update"]);
  });

  it("announces the switch going off", async () => {
    const { calls, deps } = dependencies({
      setInviteEnabled: async () => ({
        ...INVITE,
        code: null,
        displayUrl: null,
        enabled: false,
        url: null,
      }),
    });

    await groupInviteToggleRoute(jsonRequest({ enabled: false }), "conversation-1", deps);

    assert.deepEqual(calls.emittedInvite, [{ enabled: false }]);
  });

  it("rejects a body that tries to supply its own code", async () => {
    const { deps } = dependencies();

    const response = await groupInviteToggleRoute(
      jsonRequest({ code: "MINE", enabled: true }),
      "conversation-1",
      deps,
    );

    assert.equal(response.status, 400);
  });

  it("passes the service's 403 through", async () => {
    const { calls, deps } = dependencies({
      setInviteEnabled: async () => {
        throw new ApiError("You do not have permission to do this", 403, "FORBIDDEN");
      },
    });

    const response = await groupInviteToggleRoute(
      jsonRequest({ enabled: true }),
      "conversation-1",
      deps,
    );

    assert.equal(response.status, 403);
    assert.deepEqual(calls.emittedInvite, []);
  });
});

describe("groupInviteReadRoute", () => {
  it("answers with the current invite and announces nothing", async () => {
    const { calls, deps } = dependencies();

    const response = await groupInviteReadRoute(new Request("https://x/"), "conversation-1", deps);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { invite: INVITE });
    assert.deepEqual(calls.emittedInvite, []);
  });
});

describe("groupInviteRotateRoute", () => {
  it("rotates and announces that the invite is on", async () => {
    const { calls, deps } = dependencies();

    const response = await groupInviteRotateRoute(
      new Request("https://x/", { method: "POST" }),
      "conversation-1",
      deps,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls.emittedInvite, [{ enabled: true }]);
  });
});

describe("groupInvitePreviewRoute", () => {
  it("answers with a preview that names no members", async () => {
    const { calls, deps } = dependencies();

    const response = await groupInvitePreviewRoute(new Request("https://x/"), "ABCDEFGH2345", deps);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { preview: PREVIEW });
    // A guessing run has to pay for every attempt.
    assert.deepEqual(calls.rateLimits, ["group-invite:preview"]);
  });

  it("rejects a malformed code before it reaches the service", async () => {
    let serviceCalls = 0;
    const { deps } = dependencies({
      preview: async () => {
        serviceCalls += 1;
        return PREVIEW;
      },
    });

    const response = await groupInvitePreviewRoute(new Request("https://x/"), "nope", deps);

    assert.equal(response.status, 404);
    assert.equal(serviceCalls, 0);
  });

  it("passes the service's 404 through", async () => {
    const { deps } = dependencies({
      preview: async () => {
        throw new ApiError("Invite not found", 404, "INVITE_NOT_FOUND");
      },
    });

    const response = await groupInvitePreviewRoute(new Request("https://x/"), "ZZZZZZZZZZZZ", deps);

    assert.equal(response.status, 404);
  });
});

describe("groupInviteJoinRoute", () => {
  it("joins, announces the arrival and answers with the conversation", async () => {
    const { calls, deps } = dependencies();

    const response = await groupInviteJoinRoute(
      new Request("https://x/", { method: "POST" }),
      "ABCDEFGH2345",
      deps,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      alreadyMember: false,
      conversation: CONVERSATION,
    });
    assert.deepEqual(calls.emittedJoins, [{ userId: "owner-1" }]);
    assert.deepEqual(calls.rateLimits, ["group-invite:join"]);
  });

  it("announces nothing when the caller was already inside", async () => {
    // Nobody's roster changed, so a broadcast would only make every open client
    // re-render for no reason.
    const { calls, deps } = dependencies({
      joinViaInvite: async () => ({ alreadyMember: true, conversation: CONVERSATION }),
    });

    const response = await groupInviteJoinRoute(
      new Request("https://x/", { method: "POST" }),
      "ABCDEFGH2345",
      deps,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls.emittedJoins, []);
  });

  it("rejects a malformed code before it reaches the service", async () => {
    let serviceCalls = 0;
    const { deps } = dependencies({
      joinViaInvite: async () => {
        serviceCalls += 1;
        return { alreadyMember: false, conversation: CONVERSATION };
      },
    });

    const response = await groupInviteJoinRoute(
      new Request("https://x/", { method: "POST" }),
      "short",
      deps,
    );

    assert.equal(response.status, 404);
    assert.equal(serviceCalls, 0);
  });

  it("passes a 410 through untouched so the page can say why", async () => {
    const { calls, deps } = dependencies({
      joinViaInvite: async () => {
        throw new ApiError("This invite has expired", 410, "INVITE_EXPIRED");
      },
    });

    const response = await groupInviteJoinRoute(
      new Request("https://x/", { method: "POST" }),
      "ABCDEFGH2345",
      deps,
    );

    assert.equal(response.status, 410);
    assert.deepEqual(calls.emittedJoins, []);
  });

  it("still answers when there is no socket server to announce through", async () => {
    const { deps } = dependencies({ getIo: () => null });

    const response = await groupInviteJoinRoute(
      new Request("https://x/", { method: "POST" }),
      "ABCDEFGH2345",
      deps,
    );

    assert.equal(response.status, 200);
  });
});
