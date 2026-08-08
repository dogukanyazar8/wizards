import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addGroupMembers,
  toGroupEligibilityMap,
  createGroupConversation,
  leaveGroupConversation,
  removeGroupMember,
  resolveNextGroupOwner,
  updateGroupConversation,
} from "./group-service";

type Deps = Parameters<typeof createGroupConversation>[2];

/**
 * Eligibility now arrives as one map for the whole picker, so a test that wants
 * one bad target says so by name and everybody else stays a friend.
 */
function eligibility(overrides: Record<string, { blocked?: boolean; isFriend?: boolean }> = {}) {
  return async (_actorId: string, targetIds: readonly string[]) =>
    new Map(
      targetIds.map((targetId) => [
        targetId,
        {
          blocked: overrides[targetId]?.blocked ?? false,
          isFriend: overrides[targetId]?.isFriend ?? true,
        },
      ]),
    );
}

function buildDependencies(overrides: Partial<NonNullable<Deps>> = {}): NonNullable<Deps> {
  return {
    deleteConversation: async () => {
      throw new Error("deleteConversation should not be called in this test");
    },
    loadGroupEligibility: eligibility(),
    getDeletedMessageLabel: async () => "Silinen mesaj",
    loadConversation: async () => {
      throw new Error("loadConversation should not be called in this test");
    },
    mapConversation: async (conversation) => ({
      iconUrl: conversation.iconUrl,
      id: conversation.id,
      lastMessage: null,
      lastMessageAt: "2026-08-07T09:00:00.000Z",
      name: conversation.name,
      ownerId: conversation.ownerId,
      participants: [],
      type: "GROUP_DM",
    }),
    writeAddedMembers: async () => {
      throw new Error("writeAddedMembers should not be called in this test");
    },
    writeCreatedGroup: async (input) => ({
      iconUrl: input.iconUrl,
      id: "group-1",
      name: input.name,
      ownerId: input.actorId,
      participantUserIds: input.participantUserIds,
    }),
    writeGroupMetadata: async () => {
      throw new Error("writeGroupMetadata should not be called in this test");
    },
    writeRemovedMember: async () => {
      throw new Error("writeRemovedMember should not be called in this test");
    },
    ...overrides,
  } as NonNullable<Deps>;
}

describe("createGroupConversation", () => {
  it("writes the creator plus the selected friends, creator first", async () => {
    let written: { participantUserIds: string[] } | null = null;
    const dependencies = buildDependencies({
      writeCreatedGroup: async (input) => {
        written = { participantUserIds: input.participantUserIds };
        return {
          iconUrl: input.iconUrl,
          id: "group-1",
          name: input.name,
          ownerId: input.actorId,
          participantUserIds: input.participantUserIds,
        };
      },
    });

    await createGroupConversation("user-1", { userIds: ["user-2", "user-3"] }, dependencies);

    assert.deepEqual(written, { participantUserIds: ["user-1", "user-2", "user-3"] });
  });

  it("drops the actor's own id and duplicates before counting", async () => {
    let written: { participantUserIds: string[] } | null = null;
    const dependencies = buildDependencies({
      writeCreatedGroup: async (input) => {
        written = { participantUserIds: input.participantUserIds };
        return {
          iconUrl: input.iconUrl,
          id: "group-1",
          name: input.name,
          ownerId: input.actorId,
          participantUserIds: input.participantUserIds,
        };
      },
    });

    await createGroupConversation(
      "user-1",
      { userIds: ["user-2", "user-2", "user-1", "user-3"] },
      dependencies,
    );

    assert.deepEqual(written, { participantUserIds: ["user-1", "user-2", "user-3"] });
  });

  it("refuses a group that would end up smaller than three people", async () => {
    await assert.rejects(
      () => createGroupConversation("user-1", { userIds: ["user-2"] }, buildDependencies()),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "GROUP_TOO_SMALL");
        assert.equal(error.status, 400);
        return true;
      },
    );
  });

  it("refuses a group larger than 32 people", async () => {
    const userIds = Array.from({ length: 32 }, (_, index) => `user-${index + 2}`);
    await assert.rejects(
      () => createGroupConversation("user-1", { userIds }, buildDependencies()),
      (error: { code?: string }) => {
        assert.equal(error.code, "GROUP_FULL");
        return true;
      },
    );
  });

  it("refuses a member who is not a friend of the actor", async () => {
    const dependencies = buildDependencies({
      loadGroupEligibility: eligibility({ "user-3": { isFriend: false } }),
    });

    await assert.rejects(
      () => createGroupConversation("user-1", { userIds: ["user-2", "user-3"] }, dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "NOT_FRIENDS");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("refuses a member the actor has blocked or been blocked by", async () => {
    const dependencies = buildDependencies({
      loadGroupEligibility: eligibility({ "user-2": { blocked: true, isFriend: false } }),
    });

    await assert.rejects(
      () => createGroupConversation("user-1", { userIds: ["user-2", "user-3"] }, dependencies),
      (error: { code?: string }) => {
        assert.equal(error.code, "BLOCKED");
        return true;
      },
    );
  });

  /**
   * The writer loads the response projection inside its own transaction and
   * returns it as `included`; the default `mapConversation` renders that instead
   * of re-reading the row it just wrote. That only works if the service hands
   * the writer's row through untouched — rebuilding it here would silently drop
   * the payload and put the extra query back.
   */
  it("passes the writer's row to the mapper untouched, payload included", async () => {
    const included = { id: "group-1", marker: "in-transaction" };
    let mapped: unknown = null;
    const dependencies = buildDependencies({
      mapConversation: async (conversation) => {
        mapped = (conversation as { included?: unknown }).included;
        return {
          iconUrl: null,
          id: conversation.id,
          lastMessage: null,
          lastMessageAt: "2026-08-07T09:00:00.000Z",
          name: null,
          ownerId: null,
          participants: [],
          type: "GROUP_DM",
        };
      },
      writeCreatedGroup: async (input) => ({
        iconUrl: input.iconUrl,
        id: "group-1",
        included: included as never,
        name: input.name,
        ownerId: input.actorId,
        participantUserIds: input.participantUserIds,
      }),
    });

    await createGroupConversation("user-1", { userIds: ["user-2", "user-3"] }, dependencies);

    assert.deepEqual(mapped, included);
  });

  it("stores a blank name as null so the title falls back to member names", async () => {
    let written: { name: string | null } | null = null;
    const dependencies = buildDependencies({
      writeCreatedGroup: async (input) => {
        written = { name: input.name };
        return {
          iconUrl: input.iconUrl,
          id: "group-1",
          name: input.name,
          ownerId: input.actorId,
          participantUserIds: input.participantUserIds,
        };
      },
    });

    await createGroupConversation(
      "user-1",
      { name: "   ", userIds: ["user-2", "user-3"] },
      dependencies,
    );

    assert.deepEqual(written, { name: null });
  });
});

function buildGroup(
  overrides: Partial<{
    ownerId: string | null;
    participants: Array<{ joinedAt: Date; userId: string }>;
    type: string;
  }> = {},
) {
  return {
    iconUrl: null,
    id: "group-1",
    name: "Takım",
    ownerId: "user-1",
    participantUserIds: ["user-1", "user-2", "user-3"],
    participants: [
      { joinedAt: new Date("2026-08-01T00:00:00.000Z"), userId: "user-1" },
      { joinedAt: new Date("2026-08-02T00:00:00.000Z"), userId: "user-2" },
      { joinedAt: new Date("2026-08-03T00:00:00.000Z"), userId: "user-3" },
    ],
    type: "GROUP_DM",
    ...overrides,
  };
}

describe("addGroupMembers", () => {
  it("adds the new friends and records who was added", async () => {
    let written: { addedUserIds: string[]; actorId: string } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeAddedMembers: async (input) => {
        written = { addedUserIds: input.addedUserIds, actorId: input.actorId };
        return buildGroup();
      },
    });

    await addGroupMembers("user-1", "group-1", ["user-4", "user-5"], dependencies);

    assert.deepEqual(written, { addedUserIds: ["user-4", "user-5"], actorId: "user-1" });
  });

  it("silently drops users who are already members", async () => {
    let written: { addedUserIds: string[] } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeAddedMembers: async (input) => {
        written = { addedUserIds: input.addedUserIds };
        return buildGroup();
      },
    });

    await addGroupMembers("user-1", "group-1", ["user-2", "user-4"], dependencies);

    assert.deepEqual(written, { addedUserIds: ["user-4"] });
  });

  it("does not write anything when every requested user is already a member", async () => {
    let writeCount = 0;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeAddedMembers: async () => {
        writeCount += 1;
        return buildGroup();
      },
    });

    await addGroupMembers("user-1", "group-1", ["user-2", "user-3"], dependencies);

    assert.equal(writeCount, 0);
  });

  it("refuses a member who is not the owner", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () => addGroupMembers("user-2", "group-1", ["user-4"], dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "NOT_GROUP_OWNER");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("refuses a non-owner with NOT_GROUP_OWNER even when the requested member is ineligible", async () => {
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      loadGroupEligibility: eligibility({ "user-4": { isFriend: false } }),
    });

    await assert.rejects(
      () => addGroupMembers("user-2", "group-1", ["user-4"], dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "NOT_GROUP_OWNER");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("refuses a 1:1 DM", async () => {
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup({ ownerId: null, type: "DM" }),
    });

    await assert.rejects(
      () => addGroupMembers("user-1", "dm-1", ["user-4"], dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "NOT_A_GROUP");
        assert.equal(error.status, 400);
        return true;
      },
    );
  });

  it("refuses an addition that would exceed 32 members", async () => {
    const participants = Array.from({ length: 32 }, (_, index) => ({
      joinedAt: new Date("2026-08-01T00:00:00.000Z"),
      userId: `user-${index + 1}`,
    }));
    const dependencies = buildDependencies({
      loadConversation: async () =>
        buildGroup({ participants, ownerId: "user-1", type: "GROUP_DM" }),
    });

    await assert.rejects(
      () => addGroupMembers("user-1", "group-1", ["user-99"], dependencies),
      (error: { code?: string }) => {
        assert.equal(error.code, "GROUP_FULL");
        return true;
      },
    );
  });

  it("allows adding one genuinely new member to a 31-person group even when already-members are mixed into the request (31 + 1 is legal)", async () => {
    const participants = Array.from({ length: 31 }, (_, index) => ({
      joinedAt: new Date("2026-08-01T00:00:00.000Z"),
      userId: `user-${index + 1}`,
    }));
    let written: { addedUserIds: string[] } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () =>
        buildGroup({ participants, ownerId: "user-1", type: "GROUP_DM" }),
      writeAddedMembers: async (input) => {
        written = { addedUserIds: input.addedUserIds };
        return buildGroup({ participants, ownerId: "user-1", type: "GROUP_DM" });
      },
    });

    // The request mixes two already-members ("user-2", "user-3") in with the one
    // genuinely new id. The eligible list (pre-filter) is 3 long, but only 1 id
    // survives the already-member filter, so 31 + 1 = 32 must still be legal.
    await addGroupMembers("user-1", "group-1", ["user-2", "user-3", "user-99"], dependencies);

    assert.deepEqual(written, { addedUserIds: ["user-99"] });
  });

  it("does not throw GROUP_FULL when re-adding an already-member takes a 32-member group to the ceiling", async () => {
    const participants = Array.from({ length: 32 }, (_, index) => ({
      joinedAt: new Date("2026-08-01T00:00:00.000Z"),
      userId: `user-${index + 1}`,
    }));
    let writeCount = 0;
    const dependencies = buildDependencies({
      loadConversation: async () =>
        buildGroup({ participants, ownerId: "user-1", type: "GROUP_DM" }),
      writeAddedMembers: async () => {
        writeCount += 1;
        return buildGroup({ participants, ownerId: "user-1", type: "GROUP_DM" });
      },
    });

    await addGroupMembers("user-1", "group-1", ["user-2"], dependencies);

    assert.equal(writeCount, 0);
  });
});

describe("resolveNextGroupOwner", () => {
  it("hands the group to the earliest remaining member", () => {
    const next = resolveNextGroupOwner(
      [
        { joinedAt: new Date("2026-08-01T00:00:00.000Z"), userId: "user-1" },
        { joinedAt: new Date("2026-08-03T00:00:00.000Z"), userId: "user-3" },
        { joinedAt: new Date("2026-08-02T00:00:00.000Z"), userId: "user-2" },
      ],
      "user-1",
    );

    assert.equal(next, "user-2");
  });

  // The two fixtures above happen to order the same way by joinedAt and by
  // userId, so neither of them can tell a joinedAt sort from a userId sort. Here
  // the earliest joiner is the alphabetically last id, so only a real joinedAt
  // comparison picks it.
  it("prefers the earliest joiner even when their userId sorts last", () => {
    const next = resolveNextGroupOwner(
      [
        { joinedAt: new Date("2026-08-01T00:00:00.000Z"), userId: "user-1" },
        { joinedAt: new Date("2026-08-02T00:00:00.000Z"), userId: "user-9" },
        { joinedAt: new Date("2026-08-03T00:00:00.000Z"), userId: "user-4" },
      ],
      "user-1",
    );

    assert.equal(next, "user-9");
  });

  it("breaks a joinedAt tie on userId so the result is deterministic", () => {
    const joinedAt = new Date("2026-08-02T00:00:00.000Z");
    const next = resolveNextGroupOwner(
      [
        { joinedAt, userId: "user-9" },
        { joinedAt, userId: "user-4" },
        { joinedAt: new Date("2026-08-01T00:00:00.000Z"), userId: "user-1" },
      ],
      "user-1",
    );

    assert.equal(next, "user-4");
  });

  it("returns null when nobody is left", () => {
    assert.equal(
      resolveNextGroupOwner(
        [{ joinedAt: new Date("2026-08-01T00:00:00.000Z"), userId: "user-1" }],
        "user-1",
      ),
      null,
    );
  });
});

describe("removeGroupMember", () => {
  it("lets the owner remove another member and records the target", async () => {
    let written: { actorId: string; systemType: string; targetUserId: string } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeRemovedMember: async (input) => {
        written = {
          actorId: input.actorId,
          systemType: input.systemType,
          targetUserId: input.targetUserId,
        };
      },
    });

    await removeGroupMember("user-1", "group-1", "user-3", dependencies);

    assert.deepEqual(written, {
      actorId: "user-1",
      systemType: "MEMBER_REMOVED",
      targetUserId: "user-3",
    });
  });

  it("refuses a non-owner removing somebody else", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () => removeGroupMember("user-2", "group-1", "user-3", dependencies),
      (error: { code?: string }) => {
        assert.equal(error.code, "NOT_GROUP_OWNER");
        return true;
      },
    );
  });

  it("treats a member removing themselves as leaving", async () => {
    let written: { systemType: string; targetUserId: string } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeRemovedMember: async (input) => {
        written = { systemType: input.systemType, targetUserId: input.targetUserId };
      },
    });

    await removeGroupMember("user-2", "group-1", "user-2", dependencies);

    assert.deepEqual(written, { systemType: "MEMBER_LEFT", targetUserId: "user-2" });
  });

  it("refuses a target who is not in the group", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () => removeGroupMember("user-1", "group-1", "user-9", dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "NOT_FOUND");
        assert.equal(error.status, 404);
        return true;
      },
    );
  });
});

describe("leaveGroupConversation", () => {
  it("refuses somebody who is not in the group", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () => leaveGroupConversation("user-9", "group-1", dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "NOT_FOUND");
        assert.equal(error.status, 404);
        return true;
      },
    );
  });

  it("deletes the conversation when a non-owner is the last member standing", async () => {
    let deleted: string | null = null;
    const dependencies = buildDependencies({
      deleteConversation: async (conversationId) => {
        deleted = conversationId;
      },
      loadConversation: async () =>
        buildGroup({
          // The sole remaining participant is not the owner, so the old
          // owner-only guard could not reach this path.
          ownerId: "user-1",
          participants: [{ joinedAt: new Date("2026-08-02T00:00:00.000Z"), userId: "user-2" }],
        }),
    });

    await leaveGroupConversation("user-2", "group-1", dependencies);

    assert.equal(deleted, "group-1");
  });

  it("passes ownership to the earliest remaining member when the owner leaves", async () => {
    let written: { nextOwnerId: string | null } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeRemovedMember: async (input) => {
        written = { nextOwnerId: input.nextOwnerId };
      },
    });

    await leaveGroupConversation("user-1", "group-1", dependencies);

    assert.deepEqual(written, { nextOwnerId: "user-2" });
  });

  it("leaves ownership alone when a non-owner leaves", async () => {
    let written: { nextOwnerId: string | null } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeRemovedMember: async (input) => {
        written = { nextOwnerId: input.nextOwnerId };
      },
    });

    await leaveGroupConversation("user-2", "group-1", dependencies);

    assert.deepEqual(written, { nextOwnerId: null });
  });

  it("deletes the conversation when the last member leaves", async () => {
    let deleted: string | null = null;
    let removeWrites = 0;
    const dependencies = buildDependencies({
      deleteConversation: async (conversationId) => {
        deleted = conversationId;
      },
      loadConversation: async () =>
        buildGroup({
          participants: [{ joinedAt: new Date("2026-08-01T00:00:00.000Z"), userId: "user-1" }],
        }),
      writeRemovedMember: async () => {
        removeWrites += 1;
      },
    });

    await leaveGroupConversation("user-1", "group-1", dependencies);

    assert.equal(deleted, "group-1");
    assert.equal(removeWrites, 0);
  });
});

describe("updateGroupConversation", () => {
  it("writes a NAME_CHANGED system row carrying the new name", async () => {
    let written: { systemType: string; systemValue: string | null } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeGroupMetadata: async (input) => {
        written = { systemType: input.systemType, systemValue: input.systemValue };
        return buildGroup({});
      },
    });

    await updateGroupConversation("user-1", "group-1", { name: "Yeni ad" }, dependencies);

    assert.deepEqual(written, { systemType: "NAME_CHANGED", systemValue: "Yeni ad" });
  });

  it("writes an ICON_CHANGED system row with no value", async () => {
    let written: { systemType: string; systemValue: string | null } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeGroupMetadata: async (input) => {
        written = { systemType: input.systemType, systemValue: input.systemValue };
        return buildGroup({});
      },
    });

    await updateGroupConversation(
      "user-1",
      "group-1",
      { iconUrl: "https://utfs.io/f/new.png" },
      dependencies,
    );

    assert.deepEqual(written, { systemType: "ICON_CHANGED", systemValue: null });
  });

  /**
   * Faz 7 §20.1(a). A request can carry both fields, and both have to reach the
   * writer — but only one system row is written and the name is what it
   * announces, because the name is the change other members read in the inbox
   * row. This pins the whole rule: two writes, one announcement, name wins.
   */
  it("persists the name and the icon together while announcing only the name", async () => {
    let writeCount = 0;
    let written: {
      iconUrl?: string | null | undefined;
      name?: string | null | undefined;
      systemType: string;
      systemValue: string | null;
    } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeGroupMetadata: async (input) => {
        writeCount += 1;
        written = {
          iconUrl: input.iconUrl,
          name: input.name,
          systemType: input.systemType,
          systemValue: input.systemValue,
        };
        return buildGroup({});
      },
    });

    await updateGroupConversation(
      "user-1",
      "group-1",
      { iconUrl: "https://utfs.io/f/new.png", name: "Yeni ad" },
      dependencies,
    );

    assert.equal(writeCount, 1);
    assert.deepEqual(written, {
      iconUrl: "https://utfs.io/f/new.png",
      name: "Yeni ad",
      systemType: "NAME_CHANGED",
      systemValue: "Yeni ad",
    });
  });

  /**
   * Clearing the name and setting a photo in one request: the name still wins
   * the announcement, and `systemValue` is null because there is no new name to
   * quote. The icon must not be dropped by the name branch.
   */
  it("keeps the icon when the same request clears the name", async () => {
    let written: {
      iconUrl?: string | null | undefined;
      name?: string | null | undefined;
      systemType: string;
      systemValue: string | null;
    } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeGroupMetadata: async (input) => {
        written = {
          iconUrl: input.iconUrl,
          name: input.name,
          systemType: input.systemType,
          systemValue: input.systemValue,
        };
        return buildGroup({});
      },
    });

    await updateGroupConversation(
      "user-1",
      "group-1",
      { iconUrl: "https://utfs.io/f/new.png", name: null },
      dependencies,
    );

    assert.deepEqual(written, {
      iconUrl: "https://utfs.io/f/new.png",
      name: null,
      systemType: "NAME_CHANGED",
      systemValue: null,
    });
  });

  it("refuses a non-owner", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () => updateGroupConversation("user-2", "group-1", { name: "Yeni" }, dependencies),
      (error: { code?: string }) => {
        assert.equal(error.code, "NOT_GROUP_OWNER");
        return true;
      },
    );
  });

  it("does nothing when the patch is empty", async () => {
    let writeCount = 0;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeGroupMetadata: async () => {
        writeCount += 1;
        return buildGroup({});
      },
    });

    await updateGroupConversation("user-1", "group-1", {}, dependencies);

    assert.equal(writeCount, 0);
  });

  // patch.name === null (clearing the title) must be treated the same as any
  // other name change. A truthiness check on patch.name would read `null` as
  // "no change" and silently drop the clear — this test pins that it does not.
  it("treats clearing the name to null as a real change, not a falsy no-op", async () => {
    let written: {
      name?: string | null | undefined;
      systemType: string;
      systemValue: string | null;
    } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeGroupMetadata: async (input) => {
        written = {
          name: input.name,
          systemType: input.systemType,
          systemValue: input.systemValue,
        };
        return buildGroup({});
      },
    });

    await updateGroupConversation("user-1", "group-1", { name: null }, dependencies);

    assert.deepEqual(written, { name: null, systemType: "NAME_CHANGED", systemValue: null });
  });
});

describe("toGroupEligibilityMap", () => {
  const targets = ["user-2", "user-3", "user-4"];

  it("reads the target off whichever end of the row is not the actor", () => {
    const map = toGroupEligibilityMap("user-1", targets, [
      { receiverId: "user-2", senderId: "user-1", status: "ACCEPTED" },
      { receiverId: "user-1", senderId: "user-3", status: "ACCEPTED" },
    ]);

    assert.equal(map.get("user-2")?.isFriend, true);
    assert.equal(map.get("user-3")?.isFriend, true);
  });

  it("leaves a target no row mentions as a non-friend so the check fails closed", () => {
    const map = toGroupEligibilityMap("user-1", targets, []);

    assert.deepEqual(map.get("user-4"), { blocked: false, isFriend: false });
  });

  // Row order is whatever the database hands back, so the block has to survive
  // both orders. Only the BLOCKED-first case catches an ACCEPTED row that clears
  // an existing block.
  it("keeps the block when the ACCEPTED row arrives after the BLOCKED one", () => {
    const map = toGroupEligibilityMap("user-1", targets, [
      { receiverId: "user-1", senderId: "user-2", status: "BLOCKED" },
      { receiverId: "user-2", senderId: "user-1", status: "ACCEPTED" },
    ]);

    assert.deepEqual(map.get("user-2"), { blocked: true, isFriend: true });
  });

  it("keeps the block when the ACCEPTED row arrives before the BLOCKED one", () => {
    const map = toGroupEligibilityMap("user-1", targets, [
      { receiverId: "user-2", senderId: "user-1", status: "ACCEPTED" },
      { receiverId: "user-1", senderId: "user-2", status: "BLOCKED" },
    ]);

    assert.deepEqual(map.get("user-2"), { blocked: true, isFriend: true });
  });

  it("ignores rows about somebody who was never a target", () => {
    const map = toGroupEligibilityMap("user-1", targets, [
      { receiverId: "user-9", senderId: "user-1", status: "BLOCKED" },
    ]);

    assert.equal(map.has("user-9"), false);
    assert.equal(map.size, targets.length);
  });
});
