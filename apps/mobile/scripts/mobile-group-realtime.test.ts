import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DMConversationDTO, DMParticipantDTO } from "@wizards/types";

import {
  patchMobileGroupConversationRow,
  patchMobileGroupDetails,
  patchMobileGroupMemberList,
  patchMobileGroupMemberRole,
  removeMobileExpiredMessages,
  type MobileDMConversationsInfiniteData,
} from "../src/query/mobile-group-cache";
import {
  createMobileRealtimeEventEnvelope,
  getMobileRealtimeRefreshSources,
  isMobileRealtimeGroupPatchEvent,
  validateMobileRealtimeContract,
} from "../src/realtime/mobile-realtime-contract";

function participant(userId: string, role: DMParticipantDTO["role"]): DMParticipantDTO {
  return {
    avatarUrl: null,
    customStatus: null,
    displayName: null,
    muted: false,
    presence: { customStatus: null, status: "OFFLINE" },
    role,
    status: "OFFLINE",
    unreadCount: 0,
    userId,
    username: userId,
  };
}

function conversation(): DMConversationDTO {
  return {
    iconUrl: null,
    id: "dm-group-1",
    lastMessage: null,
    lastMessageAt: "2026-08-11T10:00:00.000Z",
    name: "Whispr Mobil Ekibi",
    ownerId: "user-1",
    participants: [
      participant("user-1", "OWNER"),
      participant("user-2", "MEMBER"),
      participant("user-3", "MEMBER"),
    ],
    type: "GROUP_DM",
  };
}

function inbox(conversationId = "dm-group-1"): MobileDMConversationsInfiniteData {
  return {
    pageParams: [null],
    pages: [
      {
        conversations: [
          {
            avatarPair: [],
            iconUrl: null,
            id: conversationId,
            lastMessage: null,
            lastMessageAt: "2026-08-11T10:00:00.000Z",
            mentionCount: 0,
            muted: false,
            name: null,
            notifyLevel: "ALL",
            overflowCount: 0,
            participantCount: 3,
            participants: [],
            pinnedAt: null,
            type: "GROUP_DM",
            unreadCount: 2,
          },
        ],
        nextCursor: null,
        totalUnreadCount: 2,
      },
    ],
  };
}

describe("patchMobileGroupConversationRow", () => {
  it("writes the notification tier and its mirror onto the row", () => {
    const patched = patchMobileGroupConversationRow(inbox(), "dm-group-1", {
      muted: true,
      notifyLevel: "NONE",
    });

    const row = patched?.pages[0]?.conversations[0];
    assert.equal(row?.notifyLevel, "NONE");
    assert.equal(row?.muted, true);
    // Untouched fields survive: this is a patch, not a rebuild.
    assert.equal(row?.unreadCount, 2);
  });

  it("returns the same object when the conversation is not cached", () => {
    const data = inbox();
    assert.equal(patchMobileGroupConversationRow(data, "dm-other", { pinnedAt: null }), data);
  });

  it("does nothing without a cache — an event must not seed a half-built row", () => {
    assert.equal(
      patchMobileGroupConversationRow(undefined, "dm-group-1", { muted: true }),
      undefined,
    );
  });
});

describe("patchMobileGroupDetails", () => {
  it("replaces only the keys the settings event carries", () => {
    const patched = patchMobileGroupDetails(conversation(), {
      disappearingAfter: "H24",
      permissions: {
        addMembers: "ADMINS",
        editInfo: "ADMINS",
        pinMessage: "ADMINS",
        sendMessage: "ALL",
      },
    });

    assert.equal(patched?.disappearingAfter, "H24");
    assert.equal(patched?.permissions?.addMembers, "ADMINS");
    assert.equal(patched?.name, "Whispr Mobil Ekibi");
  });

  it("leaves an uncached conversation alone", () => {
    assert.equal(patchMobileGroupDetails(undefined, { description: "x" }), undefined);
  });
});

describe("patchMobileGroupMemberRole", () => {
  it("promotes the named member", () => {
    const patched = patchMobileGroupMemberRole(conversation(), {
      ownerId: "user-1",
      role: "ADMIN",
      userId: "user-2",
    });

    assert.equal(patched?.participants.find((entry) => entry.userId === "user-2")?.role, "ADMIN");
  });

  it("demotes the previous owner in the same write when the group changes hands", () => {
    const patched = patchMobileGroupMemberRole(conversation(), {
      ownerId: "user-2",
      role: "OWNER",
      userId: "user-2",
    });

    assert.equal(patched?.ownerId, "user-2");
    assert.equal(patched?.participants.find((entry) => entry.userId === "user-2")?.role, "OWNER");
    assert.equal(patched?.participants.find((entry) => entry.userId === "user-1")?.role, "ADMIN");
  });

  it("applies the same rule to a roster cached on its own key", () => {
    const patched = patchMobileGroupMemberList(
      {
        members: [
          { role: "OWNER" as const, userId: "user-1" },
          { role: "MEMBER" as const, userId: "user-2" },
        ],
      },
      { ownerId: "user-2", role: "OWNER", userId: "user-2" },
    );

    assert.deepEqual(patched?.members, [
      { role: "ADMIN", userId: "user-1" },
      { role: "OWNER", userId: "user-2" },
    ]);
  });
});

describe("removeMobileExpiredMessages", () => {
  const stream = {
    pageParams: [null],
    pages: [{ messages: [{ id: "m1" }, { id: "m2" }] }, { messages: [{ id: "m3" }] }],
  };

  it("drops every expired id across pages", () => {
    const patched = removeMobileExpiredMessages(stream, ["m1", "m3"]);

    assert.deepEqual(patched?.pages[0]?.messages, [{ id: "m2" }]);
    assert.deepEqual(patched?.pages[1]?.messages, []);
  });

  it("returns the same object when none of the ids are cached", () => {
    assert.equal(removeMobileExpiredMessages(stream, ["m9"]), stream);
  });

  it("returns the same object for an empty id list", () => {
    assert.equal(removeMobileExpiredMessages(stream, []), stream);
  });
});

describe("group realtime contract", () => {
  const groupEvents = [
    "dm:group:settings",
    "dm:group:role",
    "dm:group:pin",
    "dm:group:invite",
    "dm:conversation:notify",
    "dm:conversation:pin",
    "dm:message:expired",
    "dm:call:state",
  ] as const;

  it("keeps the whole contract valid with the eight new events", () => {
    assert.deepEqual(validateMobileRealtimeContract(), []);
  });

  it("maps every group event to zero refresh sources — they patch, never refetch", () => {
    for (const eventName of groupEvents) {
      assert.equal(isMobileRealtimeGroupPatchEvent(eventName), true, eventName);
      assert.deepEqual(getMobileRealtimeRefreshSources(eventName), [], eventName);
    }
  });

  it("carries the conversation id and the validated payload", () => {
    const envelope = createMobileRealtimeEventEnvelope(
      "dm:conversation:notify",
      { conversationId: "dm-group-1", notifyLevel: "MENTIONS" },
      1,
    );

    assert.equal(envelope.conversationId, "dm-group-1");
    assert.deepEqual(envelope.payload, {
      conversationId: "dm-group-1",
      notifyLevel: "MENTIONS",
    });
  });

  it("drops a payload that does not match the event's schema", () => {
    const envelope = createMobileRealtimeEventEnvelope(
      "dm:group:role",
      { conversationId: "dm-group-1", role: "SUPERUSER", userId: "user-2" },
      1,
    );

    assert.equal(envelope.payload, null);
  });

  it("parses the call roster whole rather than rebuilding it from signals", () => {
    const envelope = createMobileRealtimeEventEnvelope(
      "dm:call:state",
      {
        active: true,
        conversationId: "dm-group-1",
        participants: [{ joinedAt: "2026-08-11T10:00:00.000Z", userId: "user-2" }],
        startedAt: "2026-08-11T10:00:00.000Z",
        video: false,
      },
      1,
    );

    assert.equal(envelope.conversationId, "dm-group-1");
    assert.equal((envelope.payload as { participants: unknown[] } | null)?.participants.length, 1);
  });
});
