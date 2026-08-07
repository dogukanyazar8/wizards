import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertSchemaBehaviorCoverage } from "./schema-test-helpers";

const socket = import("./socket");

describe("DMConversationDTOSchema group fields", () => {
  it("carries iconUrl and ownerId so a group's photo and admin reach clients", async () => {
    const { DMConversationDTOSchema } = await socket;
    const parsed = DMConversationDTOSchema.parse({
      iconUrl: "https://utfs.io/f/group-icon.png",
      id: "dm-1",
      lastMessage: null,
      lastMessageAt: "2026-08-07T09:00:00.000Z",
      name: "Takım",
      ownerId: "user-1",
      participants: [],
      type: "GROUP_DM",
    });

    assert.equal(parsed.iconUrl, "https://utfs.io/f/group-icon.png");
    assert.equal(parsed.ownerId, "user-1");
  });

  it("accepts a 1:1 DM with both group fields null", async () => {
    const { DMConversationDTOSchema } = await socket;
    const parsed = DMConversationDTOSchema.parse({
      iconUrl: null,
      id: "dm-2",
      lastMessage: null,
      lastMessageAt: "2026-08-07T09:00:00.000Z",
      name: "Ada",
      ownerId: null,
      participants: [],
      type: "DM",
    });

    assert.equal(parsed.iconUrl, null);
    assert.equal(parsed.ownerId, null);
  });
});

const groupDm = import("./group-dm");

describe("group DM request schemas", () => {
  it("rejects a create request below the 3-member floor", async () => {
    const { GroupDMCreateRequestSchema } = await groupDm;
    assert.throws(() => GroupDMCreateRequestSchema.parse({ userIds: ["user-2"] }));
  });

  it("rejects a create request above the 32-member ceiling", async () => {
    const { GroupDMCreateRequestSchema } = await groupDm;
    const userIds = Array.from({ length: 32 }, (_, index) => `user-${index + 2}`);
    assert.throws(() => GroupDMCreateRequestSchema.parse({ userIds }));
  });

  it("accepts the smallest legal group and defaults name and icon to absent", async () => {
    const { GroupDMCreateRequestSchema } = await groupDm;
    const parsed = GroupDMCreateRequestSchema.parse({ userIds: ["user-2", "user-3"] });
    assert.deepEqual(parsed, { userIds: ["user-2", "user-3"] });
  });

  it("normalizes a blank group name to null on update", async () => {
    const { GroupDMUpdateRequestSchema } = await groupDm;
    assert.deepEqual(GroupDMUpdateRequestSchema.parse({ name: "   " }), { name: null });
  });

  it("caps the group name at 100 characters", async () => {
    const { GroupDMUpdateRequestSchema } = await groupDm;
    assert.throws(() => GroupDMUpdateRequestSchema.parse({ name: "x".repeat(101) }));
  });

  it("requires https for a group icon", async () => {
    const { GroupDMUpdateRequestSchema } = await groupDm;
    assert.throws(() => GroupDMUpdateRequestSchema.parse({ iconUrl: "http://utfs.io/f/a.png" }));
  });

  it("names all six system message types", async () => {
    const { DMSystemMessageTypeSchema } = await groupDm;
    assert.deepEqual(DMSystemMessageTypeSchema.options, [
      "GROUP_CREATED",
      "MEMBER_ADDED",
      "MEMBER_REMOVED",
      "MEMBER_LEFT",
      "NAME_CHANGED",
      "ICON_CHANGED",
    ]);
  });

  it("accepts a create request at the 31-member ceiling", async () => {
    const { GroupDMCreateRequestSchema } = await groupDm;
    const userIds = Array.from({ length: 31 }, (_, index) => `user-${index + 2}`);
    const parsed = GroupDMCreateRequestSchema.parse({ userIds });
    assert.equal(parsed.userIds.length, 31);
  });
});

describe("group DM add-members request schema", () => {
  it("rejects an empty add-members request", async () => {
    const { GroupDMAddMembersRequestSchema } = await groupDm;
    assert.throws(() => GroupDMAddMembersRequestSchema.parse({ userIds: [] }));
  });

  it("accepts a single added member", async () => {
    const { GroupDMAddMembersRequestSchema } = await groupDm;
    const parsed = GroupDMAddMembersRequestSchema.parse({ userIds: ["user-2"] });
    assert.deepEqual(parsed, { userIds: ["user-2"] });
  });

  it("accepts an add-members request at the 31-member ceiling", async () => {
    const { GroupDMAddMembersRequestSchema } = await groupDm;
    const userIds = Array.from({ length: 31 }, (_, index) => `user-${index + 2}`);
    const parsed = GroupDMAddMembersRequestSchema.parse({ userIds });
    assert.equal(parsed.userIds.length, 31);
  });

  it("rejects an add-members request above the 31-member ceiling", async () => {
    const { GroupDMAddMembersRequestSchema } = await groupDm;
    const userIds = Array.from({ length: 32 }, (_, index) => `user-${index + 2}`);
    assert.throws(() => GroupDMAddMembersRequestSchema.parse({ userIds }));
  });
});

describe("group DM conversation response schema", () => {
  it("accepts a group conversation response carrying icon and owner", async () => {
    const { GroupDMConversationResponseSchema } = await groupDm;
    const parsed = GroupDMConversationResponseSchema.parse({
      conversation: {
        iconUrl: "https://utfs.io/f/group-icon.png",
        id: "dm-1",
        lastMessage: null,
        lastMessageAt: "2026-08-07T09:00:00.000Z",
        name: "Takım",
        ownerId: "user-1",
        participants: [],
        type: "GROUP_DM",
      },
    });
    assert.equal(parsed.conversation.iconUrl, "https://utfs.io/f/group-icon.png");
    assert.equal(parsed.conversation.ownerId, "user-1");
  });

  it("rejects a conversation response missing ownerId", async () => {
    const { GroupDMConversationResponseSchema } = await groupDm;
    assert.throws(() =>
      GroupDMConversationResponseSchema.parse({
        conversation: {
          iconUrl: "https://utfs.io/f/group-icon.png",
          id: "dm-1",
          lastMessage: null,
          lastMessageAt: "2026-08-07T09:00:00.000Z",
          name: "Takım",
          participants: [],
          type: "GROUP_DM",
        },
      }),
    );
  });
});

describe("group DM schema export coverage", () => {
  it("keeps every exported schema covered by an acceptance and rejection fixture", async () => {
    const groupDmModule = await groupDm;
    const {
      DMSystemMessageTypeSchema,
      GroupDMAddMembersRequestSchema,
      GroupDMConversationResponseSchema,
      GroupDMCreateRequestSchema,
      GroupDMUpdateRequestSchema,
    } = groupDmModule;
    const validConversation = {
      iconUrl: "https://utfs.io/f/group-icon.png",
      id: "dm-1",
      lastMessage: null,
      lastMessageAt: "2026-08-07T09:00:00.000Z",
      name: "Takım",
      ownerId: "user-1",
      participants: [],
      type: "GROUP_DM",
    };
    const { ownerId: _omittedOwnerId, ...conversationWithoutOwner } = validConversation;

    assertSchemaBehaviorCoverage(groupDmModule, {
      DMSystemMessageTypeSchema: {
        schema: DMSystemMessageTypeSchema,
        valid: "GROUP_CREATED",
        invalid: "UNKNOWN_TYPE",
      },
      GroupDMAddMembersRequestSchema: {
        schema: GroupDMAddMembersRequestSchema,
        valid: { userIds: ["user-2"] },
        invalid: { userIds: [] },
      },
      GroupDMConversationResponseSchema: {
        schema: GroupDMConversationResponseSchema,
        valid: { conversation: validConversation },
        invalid: { conversation: conversationWithoutOwner },
      },
      GroupDMCreateRequestSchema: {
        schema: GroupDMCreateRequestSchema,
        valid: { userIds: ["user-2", "user-3"] },
        invalid: { userIds: ["user-2"] },
      },
      GroupDMUpdateRequestSchema: {
        schema: GroupDMUpdateRequestSchema,
        valid: { name: "Takım" },
        invalid: { name: "x".repeat(101) },
      },
    });
  });
});
