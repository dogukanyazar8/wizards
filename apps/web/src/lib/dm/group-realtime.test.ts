import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emitConversationPinsChanged,
  emitConversationNotifyChanged,
  emitConversationPinChanged,
  emitGroupConversationCreated,
  emitGroupInviteChanged,
  emitGroupMemberJoined,
  emitGroupMembersChanged,
  emitGroupPinChanged,
  emitGroupRoleChanged,
  emitGroupSettingsChanged,
  emitPollUpdated,
  evictRemovedGroupMember,
} from "./group-realtime";

type Emitted = { args: unknown[]; event: string; rooms: string[] };

function buildIo() {
  const emitted: Emitted[] = [];
  const left: Array<{ room: string; source: string }> = [];

  const io = {
    in(room: string) {
      return {
        socketsLeave(target: string) {
          left.push({ room: target, source: room });
        },
      };
    },
    to(rooms: string | string[]) {
      const roomList = Array.isArray(rooms) ? rooms : [rooms];
      return {
        emit(event: string, ...args: unknown[]) {
          emitted.push({ args, event, rooms: roomList });
        },
      };
    },
  };

  return { emitted, io, left };
}

const conversation = {
  iconUrl: null,
  id: "group-1",
  lastMessage: null,
  lastMessageAt: "2026-08-07T09:00:00.000Z",
  name: "Takım",
  ownerId: "user-1",
  participants: [
    {
      avatarUrl: null,
      customStatus: null,
      displayName: "A",
      muted: false,
      presence: { customStatus: null, status: "ONLINE" as const },
      status: "ONLINE" as const,
      unreadCount: 0,
      userId: "user-1",
      username: "a",
    },
    {
      avatarUrl: null,
      customStatus: null,
      displayName: "B",
      muted: false,
      presence: { customStatus: null, status: "ONLINE" as const },
      status: "ONLINE" as const,
      unreadCount: 0,
      userId: "user-2",
      username: "b",
    },
  ],
  type: "GROUP_DM" as const,
};

describe("group realtime", () => {
  it("announces a new group to every participant's personal room", () => {
    const { emitted, io } = buildIo();

    emitGroupConversationCreated(io, conversation);

    assert.deepEqual(emitted, [
      {
        args: [{ conversationId: "group-1" }],
        event: "dm:conversation:created",
        rooms: ["user:user-1", "user:user-2"],
      },
    ]);
  });

  it("announces a membership change to the conversation room and to the new members", () => {
    const { emitted, io } = buildIo();

    emitGroupMembersChanged(io, { addedUserIds: ["user-2"], conversation });

    assert.deepEqual(emitted, [
      {
        args: [{ conversationId: "group-1" }],
        event: "dm:conversation:members_changed",
        rooms: ["dm:group-1", "user:user-2"],
      },
    ]);
  });

  it("announces a membership change to the conversation room alone when nobody was added", () => {
    const { emitted, io } = buildIo();

    emitGroupMembersChanged(io, { conversation });

    assert.deepEqual(emitted, [
      {
        args: [{ conversationId: "group-1" }],
        event: "dm:conversation:members_changed",
        rooms: ["dm:group-1"],
      },
    ]);
  });

  it("evicts a removed member from Socket.IO, LiveKit, and the call roster", async () => {
    const { emitted, io, left } = buildIo();
    const callCleanup: string[] = [];

    await (
      evictRemovedGroupMember as unknown as (
        io: ReturnType<typeof buildIo>["io"],
        input: { conversationId: string; userId: string },
        dependencies: {
          leaveCall(conversationId: string, userId: string): Promise<unknown>;
          removeParticipant(roomName: string, userId: string): Promise<void>;
        },
      ) => Promise<void>
    )(
      io,
      { conversationId: "group-1", userId: "user-3" },
      {
        async leaveCall(conversationId, userId) {
          callCleanup.push(`roster:${conversationId}:${userId}`);
          return null;
        },
        async removeParticipant(roomName, userId) {
          callCleanup.push(`livekit:${roomName}:${userId}`);
        },
      },
    );

    assert.deepEqual(emitted, [
      {
        args: [{ conversationId: "group-1" }],
        event: "dm:conversation:removed",
        rooms: ["user:user-3"],
      },
    ]);
    // Without this the removed member keeps receiving every later message: the
    // join handler only gates entry, it never evicts a socket already inside.
    assert.deepEqual(left, [{ room: "dm:group-1", source: "user:user-3" }]);
    assert.deepEqual(callCleanup, ["livekit:dm:group-1:user-3", "roster:group-1:user-3"]);
  });
});

describe("Faz 1 group state events", () => {
  const groupSettings = {
    ...conversation,
    avatarColor: "#4F46E5",
    description: "Mobil ekibi",
    historyVisibility: "LAST_30D" as const,
    permissions: {
      addMembers: "ALL" as const,
      editInfo: "ADMINS" as const,
      pinMessage: "ADMINS" as const,
      sendMessage: "ALL" as const,
    },
  };

  it("sends settings to every member's personal room", () => {
    const { emitted, io } = buildIo();

    emitGroupSettingsChanged(io, groupSettings);

    assert.equal(emitted.length, 1);
    assert.equal(emitted[0]?.event, "dm:group:settings");
    // The `dm:<id>` room only holds people with the chat open; the settings
    // screen and the inbox row both live outside it.
    assert.deepEqual(emitted[0]?.rooms, ["user:user-1", "user:user-2"]);
    assert.deepEqual(emitted[0]?.args[0], {
      avatarColor: "#4F46E5",
      conversationId: "group-1",
      description: "Mobil ekibi",
      // K3. Travels with the rest of the settings so the countdown on new
      // bubbles does not wait for a refetch.
      disappearingAfter: "OFF",
      historyVisibility: "LAST_30D",
      permissions: groupSettings.permissions,
    });
  });

  it("tells everybody about a role change, not just the promoted member", () => {
    const { emitted, io } = buildIo();

    emitGroupRoleChanged(io, { conversation, role: "ADMIN", userId: "user-2" });

    assert.deepEqual(emitted[0]?.rooms, ["user:user-1", "user:user-2"]);
    assert.deepEqual(emitted[0]?.args[0], {
      conversationId: "group-1",
      ownerId: "user-1",
      role: "ADMIN",
      userId: "user-2",
    });
  });

  it("forces `dismissed` to false on a broadcast pin", () => {
    // One payload reaches every member, so carrying one viewer's dismissal would
    // hide a brand new pin from everybody else.
    const { emitted, io } = buildIo();

    emitGroupPinChanged(io, {
      conversation,
      pinnedMessage: {
        authorName: "Ada",
        dismissed: true,
        excerpt: "Toplantı 14:00",
        id: "message-1",
      },
    });

    assert.equal(emitted[0]?.event, "dm:group:pin");
    assert.deepEqual(emitted[0]?.args[0], {
      conversationId: "group-1",
      pinnedMessage: {
        authorName: "Ada",
        dismissed: false,
        excerpt: "Toplantı 14:00",
        id: "message-1",
      },
    });
  });

  it("carries a null pinned message as an unpin", () => {
    const { emitted, io } = buildIo();

    emitGroupPinChanged(io, { conversation, pinnedMessage: null });

    assert.deepEqual(emitted[0]?.args[0], { conversationId: "group-1", pinnedMessage: null });
  });

  it("keeps the notification tier to the one person it belongs to", () => {
    const { emitted, io } = buildIo();

    emitConversationNotifyChanged(io, {
      conversationId: "group-1",
      notifyLevel: "MENTIONS",
      userId: "user-2",
    });

    assert.deepEqual(emitted[0]?.rooms, ["user:user-2"]);
    assert.deepEqual(emitted[0]?.args[0], {
      conversationId: "group-1",
      notifyLevel: "MENTIONS",
    });
  });

  it("keeps the conversation pin to the one person it belongs to", () => {
    const { emitted, io } = buildIo();

    emitConversationPinChanged(io, {
      conversationId: "dm-1",
      pinnedAt: "2026-08-11T09:00:00.000Z",
      userId: "user-2",
    });

    assert.deepEqual(emitted[0]?.rooms, ["user:user-2"]);
    assert.deepEqual(emitted[0]?.args[0], {
      conversationId: "dm-1",
      pinnedAt: "2026-08-11T09:00:00.000Z",
    });
  });

  it("broadcast pin invalidation carries no count or message identity", () => {
    const { emitted, io } = buildIo();

    emitConversationPinsChanged(io, { conversationId: "group-1" });

    assert.deepEqual(emitted, [
      {
        args: [{ conversationId: "group-1" }],
        event: "dm:conversation:pins",
        rooms: ["dm:group-1"],
      },
    ]);
  });

  it("broadcast poll invalidation carries only conversation and poll identity", () => {
    const { emitted, io } = buildIo();

    emitPollUpdated(io, { conversationId: "group-1", pollId: "poll-1" });

    assert.deepEqual(emitted, [
      {
        args: [{ conversationId: "group-1", pollId: "poll-1" }],
        event: "poll:updated",
        rooms: ["dm:group-1"],
      },
    ]);
  });
});

/** Faz 2 §B. The two events the invite link adds. */
describe("Faz 2 group invite events", () => {
  it("gives the joiner a conversation and the room a roster refresh", () => {
    const { emitted, io } = buildIo();

    emitGroupMemberJoined(io, { conversation, userId: "user-3" });

    assert.equal(emitted.length, 2);
    // The joiner has never run `dm:join`, so the conversation room would miss
    // them — and a "members changed" for a conversation they do not hold yet
    // would be nothing their inbox could act on.
    assert.deepEqual(emitted[0]?.rooms, ["user:user-3"]);
    assert.equal(emitted[0]?.event, "dm:conversation:created");
    assert.deepEqual(emitted[0]?.args, [{ conversationId: "group-1" }]);
    assert.deepEqual(emitted[1]?.rooms, ["dm:group-1"]);
    assert.equal(emitted[1]?.event, "dm:conversation:members_changed");
    assert.deepEqual(emitted[1]?.args, [{ conversationId: "group-1" }]);
  });

  it("announces the invite switch to every member without the code", () => {
    const { emitted, io } = buildIo();

    emitGroupInviteChanged(io, {
      conversationId: "group-1",
      enabled: true,
      participantUserIds: ["user-1", "user-2"],
    });

    assert.deepEqual(emitted[0]?.rooms, ["user:user-1", "user:user-2"]);
    // E2 in a different guise: a client that is not looking at the settings
    // sheet has no reason to hold a live invite code in memory.
    assert.deepEqual(emitted[0]?.args[0], { conversationId: "group-1", enabled: true });
  });
});
