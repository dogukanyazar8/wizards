import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emitGroupConversationCreated,
  emitGroupMembersChanged,
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
        args: [{ conversation }],
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
        args: [{ conversation, conversationId: "group-1" }],
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
        args: [{ conversation, conversationId: "group-1" }],
        event: "dm:conversation:members_changed",
        rooms: ["dm:group-1"],
      },
    ]);
  });

  it("tells the removed member and forces their sockets out of the room", () => {
    const { emitted, io, left } = buildIo();

    evictRemovedGroupMember(io, { conversationId: "group-1", userId: "user-3" });

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
  });
});
