import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DMConversationDTO, DMMessagePayload, DMParticipantDTO } from "@wizards/types";

import {
  buildGroupReadReceipt,
  getConversationSearchTerms,
  getGroupAvatarParticipants,
  getGroupConversationTitle,
  getGroupMemberCount,
  getGroupPreviewAuthorPrefix,
} from "./group-presentation";

function participant(overrides: Partial<DMParticipantDTO> & { userId: string }): DMParticipantDTO {
  return {
    avatarUrl: null,
    customStatus: null,
    displayName: null,
    muted: false,
    presence: { customStatus: null, status: "OFFLINE" },
    status: "OFFLINE",
    unreadCount: 0,
    username: overrides.userId,
    ...overrides,
  };
}

function message(overrides: Partial<DMMessagePayload> & { userId: string }): DMMessagePayload {
  return {
    attachments: [],
    author: {
      avatarUrl: null,
      customStatus: null,
      displayName: null,
      id: overrides.userId,
      status: "OFFLINE",
      username: overrides.userId,
    },
    content: "redacted",
    conversationId: "dm-group-1",
    createdAt: "2026-08-07T10:00:00.000Z",
    deletedAt: null,
    deletedById: null,
    editedAt: null,
    id: "message-1",
    reactions: [],
    replyTo: null,
    replyToId: null,
    systemTargetUserIds: [],
    systemType: null,
    systemValue: null,
    threadParentId: null,
    ...overrides,
  };
}

function conversation(overrides: Partial<DMConversationDTO> = {}): DMConversationDTO {
  return {
    iconUrl: null,
    id: "dm-group-1",
    lastMessage: null,
    lastMessageAt: "2026-08-07T10:00:00.000Z",
    name: null,
    ownerId: "user-1",
    participants: [
      participant({ displayName: "Ada", userId: "user-1" }),
      participant({ displayName: "Selin", userId: "user-2" }),
      participant({ displayName: "Kaan", userId: "user-3" }),
    ],
    type: "GROUP_DM",
    ...overrides,
  };
}

describe("group conversation presentation", () => {
  it("uses the group's own name when it has one", () => {
    assert.equal(
      getGroupConversationTitle(conversation({ name: "Takım" }), "user-1", "fallback", "tr"),
      "Takım",
    );
  });

  it("falls back to the other members' names, viewer excluded", () => {
    assert.equal(
      getGroupConversationTitle(conversation(), "user-1", "fallback", "tr"),
      "Selin ve Kaan",
    );
  });

  /**
   * §4.4: this is the same string 2c's hint promises, so the separator has to
   * follow the reader's locale rather than being a hard-coded comma.
   */
  it("localises the last separator", () => {
    assert.equal(
      getGroupConversationTitle(conversation(), "user-1", "fallback", "en"),
      "Selin and Kaan",
    );
  });

  it("uses the fallback when the viewer is the only member", () => {
    assert.equal(
      getGroupConversationTitle(
        conversation({ participants: [participant({ displayName: "Ada", userId: "user-1" })] }),
        "user-1",
        "fallback",
        "tr",
      ),
      "fallback",
    );
  });

  it("counts every member, viewer included", () => {
    assert.equal(getGroupMemberCount(conversation()), 3);
  });

  it("stacks the other members' avatars up to the cap", () => {
    const stacked = getGroupAvatarParticipants(conversation(), "user-1", 2);

    assert.deepEqual(
      stacked.map((entry) => entry.userId),
      ["user-2", "user-3"],
    );
  });

  it("prefixes a group preview with the author, and with the self label for the viewer", () => {
    const fromOther = conversation({ lastMessage: message({ userId: "user-2" }) });
    const fromSelf = conversation({ lastMessage: message({ userId: "user-1" }) });

    assert.equal(getGroupPreviewAuthorPrefix(fromOther, "user-1", "Sen"), "Selin: ");
    assert.equal(getGroupPreviewAuthorPrefix(fromSelf, "user-1", "Sen"), "Sen: ");
  });

  it("leaves a 1:1 preview and a system row unprefixed", () => {
    const direct = conversation({
      lastMessage: message({ userId: "user-2" }),
      type: "DM",
    });
    const systemRow = conversation({
      lastMessage: message({ systemType: "GROUP_CREATED", userId: "user-2" }),
    });

    assert.equal(getGroupPreviewAuthorPrefix(direct, "user-1", "Sen"), "");
    assert.equal(getGroupPreviewAuthorPrefix(systemRow, "user-1", "Sen"), "");
  });

  it("searches the group name and its members' names", () => {
    const terms = getConversationSearchTerms(conversation({ name: "Takım" }), "user-1");

    assert.equal(terms.includes("Takım"), true);
    assert.equal(terms.includes("Selin"), true);
    assert.equal(terms.includes("@user-3"), true);
    // The viewer is not searchable inside a group: every group would match.
    assert.equal(terms.includes("Ada"), false);
  });

  it("keeps the viewer out of a 1:1's search terms too", () => {
    const direct = conversation({
      participants: [
        participant({ displayName: "Ada", userId: "user-1" }),
        participant({ displayName: "Selin", userId: "user-2" }),
      ],
      type: "DM",
    });

    const terms = getConversationSearchTerms(direct, "user-1");

    // Searching your own name must not list every conversation you are in.
    assert.equal(terms.includes("Ada"), false);
    assert.equal(terms.includes("Selin"), true);
  });
});

describe("buildGroupReadReceipt", () => {
  const createdAt = new Date("2026-08-11T09:00:00.000Z");

  function reader(userId: string, lastReadAt: string | null) {
    return { lastReadAt: lastReadAt === null ? null : new Date(lastReadAt), userId };
  }

  it("counts the members whose read mark is at or past the message", () => {
    const receipt = buildGroupReadReceipt({
      authorId: "user-1",
      createdAt,
      participants: [
        reader("user-1", "2026-08-11T09:05:00.000Z"),
        reader("user-2", "2026-08-11T09:01:00.000Z"),
        reader("user-3", "2026-08-11T08:59:00.000Z"),
        reader("user-4", null),
      ],
    });

    assert.deepEqual(receipt.readerIds, ["user-2"]);
    assert.equal(receipt.count, 1);
  });

  it("never counts the author, however recently they read", () => {
    // The author's own `lastReadAt` always moves past their own message, so
    // counting it would make every bubble read "1 kişi okudu" instantly.
    const receipt = buildGroupReadReceipt({
      authorId: "user-1",
      createdAt,
      participants: [reader("user-1", "2026-08-11T09:05:00.000Z"), reader("user-2", null)],
    });

    assert.deepEqual(receipt.readerIds, []);
    assert.equal(receipt.count, 0);
  });

  it("treats a mark exactly on the message as read", () => {
    const receipt = buildGroupReadReceipt({
      authorId: "user-1",
      createdAt,
      participants: [reader("user-1", null), reader("user-2", "2026-08-11T09:00:00.000Z")],
    });

    assert.equal(receipt.count, 1);
  });

  it("reports 'everyone' only when every other member has read it", () => {
    const participants = [
      reader("user-1", null),
      reader("user-2", "2026-08-11T09:01:00.000Z"),
      reader("user-3", "2026-08-11T09:02:00.000Z"),
    ];

    assert.equal(
      buildGroupReadReceipt({ authorId: "user-1", createdAt, participants }).everyone,
      true,
    );
    assert.equal(
      buildGroupReadReceipt({
        authorId: "user-1",
        createdAt,
        participants: [...participants, reader("user-4", null)],
      }).everyone,
      false,
    );
  });

  it("is not 'everyone' when nobody else is left in the group", () => {
    // One participant means the author is alone; "Herkes okudu" under a message
    // nobody could read is a lie.
    const receipt = buildGroupReadReceipt({
      authorId: "user-1",
      createdAt,
      participants: [reader("user-1", "2026-08-11T09:05:00.000Z")],
    });

    assert.equal(receipt.everyone, false);
    assert.equal(receipt.count, 0);
  });

  it("still measures against the other members when the author has left", () => {
    const receipt = buildGroupReadReceipt({
      authorId: "gone-1",
      createdAt,
      participants: [
        reader("user-2", "2026-08-11T09:01:00.000Z"),
        reader("user-3", "2026-08-11T09:02:00.000Z"),
      ],
    });

    assert.equal(receipt.count, 2);
    assert.equal(receipt.everyone, true);
  });

  it("keeps reader ids in the order the participants arrived", () => {
    const receipt = buildGroupReadReceipt({
      authorId: "user-1",
      createdAt,
      participants: [
        reader("user-1", null),
        reader("user-3", "2026-08-11T09:02:00.000Z"),
        reader("user-2", "2026-08-11T09:01:00.000Z"),
      ],
    });

    // The avatar stack is drawn in this order, and `joinedAt` is what the
    // conversation projection already sorts by.
    assert.deepEqual(receipt.readerIds, ["user-3", "user-2"]);
  });
});
