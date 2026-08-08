import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DMConversationDTO, DMMessagePayload, DMParticipantDTO } from "@wizards/types";

import {
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
      getGroupConversationTitle(conversation({ name: "Takım" }), "user-1", "fallback"),
      "Takım",
    );
  });

  it("falls back to the other members' names, viewer excluded", () => {
    assert.equal(getGroupConversationTitle(conversation(), "user-1", "fallback"), "Selin, Kaan");
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
