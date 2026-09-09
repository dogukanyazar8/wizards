import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { GROUP_DM_MAX_PARTICIPANTS } from "@wizards/types";

import {
  addGroupMembers,
  toGroupEligibilityMap,
  clearGroupHistory,
  createGroupConversation,
  deleteGroupConversation,
  dismissPinnedStrip,
  leaveGroupConversation,
  removeGroupMember,
  resolveNextGroupOwner,
  setConversationPin,
  setNotifyLevel,
  setPinnedMessage,
  updateGroupConversation,
  updateGroupSettings,
  updateMemberRole,
} from "./group-service";
import * as groupService from "./group-service";

type Deps = Parameters<typeof createGroupConversation>[2];

describe("membership write guarantees", () => {
  it("serializes and re-checks capacity before adding members", async () => {
    const source = await readFile(new URL("./group-service.ts", import.meta.url), "utf8");
    const writeAddedMembers = source.slice(
      source.indexOf("writeAddedMembers: async (input)"),
      source.indexOf("writeCreatedGroup: async (input)"),
    );
    const lockIndex = writeAddedMembers.indexOf("serializeGroupMembershipWrite");
    const countIndex = writeAddedMembers.indexOf("tx.dMParticipant.findMany");

    assert.notEqual(lockIndex, -1);
    assert.ok(lockIndex < countIndex);
    assert.match(writeAddedMembers, /GROUP_DM_MAX_PARTICIPANTS/);
    assert.match(writeAddedMembers, /members = input\.members\.filter/);
    assert.match(writeAddedMembers, /assignNameColors\(/);
    assert.match(writeAddedMembers, /if \(members\.length > 0\)/);
  });

  it("serializes concurrent owner and admin departures before deciding succession", async () => {
    type LockedParticipant = { joinedAt: Date; role: "ADMIN" | "MEMBER" | "OWNER"; userId: string };
    type FakeTransaction = {
      dMConversation: {
        delete(args: unknown): Promise<unknown>;
        findUniqueOrThrow(args: unknown): Promise<unknown>;
        update(args: unknown): Promise<unknown>;
      };
      dMMessage: { create(args: unknown): Promise<unknown> };
      dMParticipant: {
        delete(args: unknown): Promise<unknown>;
        update(args: unknown): Promise<unknown>;
      };
      releaseLock?: () => void;
    };
    type RemovalWriter = (
      input: {
        actorId: string;
        conversationId: string;
        systemType: "MEMBER_LEFT";
        targetUserId: string;
      },
      dependencies: {
        now(): Date;
        serialize(tx: FakeTransaction, conversationId: string): Promise<void>;
        transaction<T>(run: (tx: FakeTransaction) => Promise<T>): Promise<T>;
      },
    ) => Promise<{ broadcastViewerId: string | null }>;
    const writeRemoval = (groupService as unknown as { writeRemovedGroupMember?: RemovalWriter })
      .writeRemovedGroupMember;

    assert.equal(typeof writeRemoval, "function");

    let ownerId = "user-1";
    let participants: LockedParticipant[] = [
      { joinedAt: new Date("2026-08-12T09:00:00.000Z"), role: "OWNER", userId: "user-1" },
      { joinedAt: new Date("2026-08-12T09:01:00.000Z"), role: "ADMIN", userId: "user-2" },
      { joinedAt: new Date("2026-08-12T09:02:00.000Z"), role: "MEMBER", userId: "user-3" },
    ];
    let lockTail = Promise.resolve();
    const dependencies = {
      now: () => new Date("2026-08-12T10:00:00.000Z"),
      async serialize(tx: FakeTransaction) {
        const previous = lockTail;
        let release = () => {};
        lockTail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        tx.releaseLock = release;
      },
      async transaction<T>(run: (tx: FakeTransaction) => Promise<T>) {
        const tx: FakeTransaction = {
          dMConversation: {
            async delete() {
              participants = [];
              return {};
            },
            async findUniqueOrThrow() {
              return {
                ownerId,
                participants: participants.map((entry) => ({ ...entry })),
                type: "GROUP_DM",
              };
            },
            async update(args: unknown) {
              const data = (args as { data: { ownerId?: string } }).data;
              if (data.ownerId) ownerId = data.ownerId;
              return {};
            },
          },
          dMMessage: {
            async create() {
              return {};
            },
          },
          dMParticipant: {
            async delete(args: unknown) {
              const userId = (args as { where: { conversationId_userId: { userId: string } } })
                .where.conversationId_userId.userId;
              participants = participants.filter((entry) => entry.userId !== userId);
              return {};
            },
            async update(args: unknown) {
              const input = args as {
                data: { role: "OWNER" };
                where: { conversationId_userId: { userId: string } };
              };
              participants = participants.map((entry) =>
                entry.userId === input.where.conversationId_userId.userId
                  ? { ...entry, role: input.data.role }
                  : entry,
              );
              return {};
            },
          },
        };

        try {
          return await run(tx);
        } finally {
          tx.releaseLock?.();
        }
      },
    };

    const results = await Promise.allSettled([
      writeRemoval?.(
        {
          actorId: "user-1",
          conversationId: "group-1",
          systemType: "MEMBER_LEFT",
          targetUserId: "user-1",
        },
        dependencies,
      ),
      writeRemoval?.(
        {
          actorId: "user-2",
          conversationId: "group-1",
          systemType: "MEMBER_LEFT",
          targetUserId: "user-2",
        },
        dependencies,
      ),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.ok(participants.length > 0);
    assert.ok(
      participants.some(
        (participant) => participant.role === "OWNER" || participant.role === "ADMIN",
      ),
    );
  });
});

/**
 * Eligibility now arrives as one map for the whole picker, so a test that wants
 * one bad target says so by name and everybody else stays a friend.
 */
function eligibility(
  overrides: Record<string, { blocked?: boolean; closed?: boolean; isFriend?: boolean }> = {},
) {
  return async (_actorId: string, targetIds: readonly string[]) =>
    new Map(
      targetIds.map((targetId) => [
        targetId,
        {
          blocked: overrides[targetId]?.blocked ?? false,
          closed: overrides[targetId]?.closed ?? false,
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
    loadPinnableMessage: async ({ messageId }) => ({ authorName: "Ada", id: messageId }),
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
      participantUserIds: input.participants.map((participant) => participant.userId),
    }),
    writeGroupMetadata: async () => {
      throw new Error("writeGroupMetadata should not be called in this test");
    },
    writeGroupSettings: async () => {
      throw new Error("writeGroupSettings should not be called in this test");
    },
    writeMemberRole: async () => {
      throw new Error("writeMemberRole should not be called in this test");
    },
    writePinnedMessage: async () => {
      throw new Error("writePinnedMessage should not be called in this test");
    },
    writeRemovedMember: async () => {
      throw new Error("writeRemovedMember should not be called in this test");
    },
    ...overrides,
  } as NonNullable<Deps>;
}

function participantDependencies(count = 1) {
  const writes: Array<{ conversationId: string; data: Record<string, unknown>; userId: string }> =
    [];

  return {
    dependencies: {
      updateParticipant: async (input: {
        conversationId: string;
        data: Record<string, unknown>;
        userId: string;
      }) => {
        writes.push(input);
        return count;
      },
    },
    writes,
  };
}

describe("createGroupConversation", () => {
  it("writes the creator plus the selected friends, creator first", async () => {
    let written: { participantUserIds: string[] } | null = null;
    const dependencies = buildDependencies({
      writeCreatedGroup: async (input) => {
        written = { participantUserIds: input.participants.map((entry) => entry.userId) };
        return {
          iconUrl: input.iconUrl,
          id: "group-1",
          name: input.name,
          ownerId: input.actorId,
          participantUserIds: input.participants.map((entry) => entry.userId),
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
        written = { participantUserIds: input.participants.map((entry) => entry.userId) };
        return {
          iconUrl: input.iconUrl,
          id: "group-1",
          name: input.name,
          ownerId: input.actorId,
          participantUserIds: input.participants.map((entry) => entry.userId),
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

  it("refuses a group larger than the participant ceiling", async () => {
    // The creator is implicit, so `GROUP_DM_MAX_PARTICIPANTS` ids in the body is
    // already one too many.
    const userIds = Array.from(
      { length: GROUP_DM_MAX_PARTICIPANTS },
      (_, index) => `user-${index + 2}`,
    );
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

  it("refuses a friend who has closed themselves to group invites", async () => {
    const dependencies = buildDependencies({
      loadGroupEligibility: eligibility({ "user-3": { closed: true } }),
    });

    await assert.rejects(
      () => createGroupConversation("user-1", { userIds: ["user-2", "user-3"] }, dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "GROUP_INVITES_CLOSED");
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
        participantUserIds: input.participants.map((entry) => entry.userId),
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
          participantUserIds: input.participants.map((entry) => entry.userId),
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

type TestParticipant = {
  historyFromAt?: Date | null;
  joinedAt: Date;
  nameColor?: string;
  role?: "OWNER" | "ADMIN" | "MEMBER";
  userId: string;
};

function member(userId: string, day: number, overrides: Partial<TestParticipant> = {}) {
  return {
    historyFromAt: null,
    joinedAt: new Date(`2026-08-0${day}T00:00:00.000Z`),
    nameColor: "#C2185B",
    role: "MEMBER" as const,
    userId,
    ...overrides,
  };
}

function buildGroup(
  overrides: Partial<{
    disappearingAfter: "OFF" | "H24" | "D7" | "D90";
    historyVisibility: "NONE" | "LAST_24H" | "LAST_30D" | "ALL";
    ownerId: string | null;
    participants: TestParticipant[];
    permAddMembers: "ALL" | "ADMINS";
    permEditInfo: "ALL" | "ADMINS";
    permPinMessage: "ALL" | "ADMINS";
    permSendMessage: "ALL" | "ADMINS";
    pinnedMessageId: string | null;
    type: string;
  }> = {},
) {
  return {
    disappearingAfter: "OFF" as const,
    historyVisibility: "LAST_30D" as const,
    iconUrl: null,
    id: "group-1",
    name: "Takım",
    ownerId: "user-1",
    participantUserIds: ["user-1", "user-2", "user-3"],
    participants: [
      member("user-1", 1, { nameColor: "#C2185B", role: "OWNER" }),
      member("user-2", 2, { nameColor: "#C77A2B" }),
      member("user-3", 3, { nameColor: "#1B8A55" }),
    ],
    permAddMembers: "ALL" as const,
    permEditInfo: "ADMINS" as const,
    permPinMessage: "ADMINS" as const,
    permSendMessage: "ALL" as const,
    pinnedMessageId: null,
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
        written = {
          addedUserIds: input.members.map((entry) => entry.userId),
          actorId: input.actorId,
        };
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
        written = { addedUserIds: input.members.map((entry) => entry.userId) };
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

  /**
   * K4. Ownership stopped being the rule here: `permAddMembers` is, and a fresh
   * group leaves it on "Tüm üyeler" (2c §7). A plain member adding a friend is
   * the designed behaviour, not a hole.
   */
  it("lets a plain member add somebody while the group allows it", async () => {
    let written: { addedUserIds: string[] } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeAddedMembers: async (input) => {
        written = { addedUserIds: input.members.map((entry) => entry.userId) };
        return buildGroup();
      },
    });

    await addGroupMembers("user-2", "group-1", ["user-4"], dependencies);

    assert.deepEqual(written, { addedUserIds: ["user-4"] });
  });

  it("refuses a plain member once the group restricts adding to admins", async () => {
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup({ permAddMembers: "ADMINS" }),
    });

    await assert.rejects(
      () => addGroupMembers("user-2", "group-1", ["user-4"], dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("checks the permission before it checks eligibility", async () => {
    // Otherwise an unauthorised member learns from the error message whether the
    // person they tried to add has blocked them.
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup({ permAddMembers: "ADMINS" }),
      loadGroupEligibility: eligibility({ "user-4": { isFriend: false } }),
    });

    await assert.rejects(
      () => addGroupMembers("user-2", "group-1", ["user-4"], dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("stamps every new member with a colour and the group's history floor", async () => {
    let written: Array<{ historyFromAt: Date | null; nameColor: string; role: string }> = [];
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup({ historyVisibility: "NONE" }),
      writeAddedMembers: async (input) => {
        written = input.members.map((entry) => ({
          historyFromAt: entry.historyFromAt,
          nameColor: entry.nameColor,
          role: entry.role,
        }));
        return buildGroup();
      },
    });

    const before = Date.now();
    await addGroupMembers("user-1", "group-1", ["user-4", "user-5"], dependencies);

    assert.equal(written.length, 2);
    for (const entry of written) {
      assert.equal(entry.role, "MEMBER");
      // NONE means "from now on", so the floor is the join moment itself.
      assert.ok(entry.historyFromAt !== null);
      assert.ok((entry.historyFromAt?.getTime() ?? 0) >= before);
    }
    // The three sitting members hold #C2185B, #C77A2B and #1B8A55, so the two
    // new ones must take the two colours nobody is using — and must not both
    // take the same one.
    assert.deepEqual(
      written.map((entry) => entry.nameColor),
      ["#8A46C7", "#4F46E5"],
    );
  });

  it("leaves the history floor open when the group shares everything", async () => {
    let written: Array<{ historyFromAt: Date | null }> = [];
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup({ historyVisibility: "ALL" }),
      writeAddedMembers: async (input) => {
        written = input.members.map((entry) => ({ historyFromAt: entry.historyFromAt }));
        return buildGroup();
      },
    });

    await addGroupMembers("user-1", "group-1", ["user-4"], dependencies);

    assert.deepEqual(written, [{ historyFromAt: null }]);
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

  it("refuses an addition that would exceed the participant ceiling", async () => {
    const participants = Array.from({ length: GROUP_DM_MAX_PARTICIPANTS }, (_, index) =>
      member(`user-${index + 1}`, 1, index === 0 ? { role: "OWNER" } : {}),
    );
    const dependencies = buildDependencies({
      loadConversation: async () =>
        buildGroup({ participants, ownerId: "user-1", type: "GROUP_DM" }),
    });

    // A "newcomer-" id, not "user-99": the roster now runs to the ceiling, so a
    // numbered user id would already be a member and nothing would be added.
    await assert.rejects(
      () => addGroupMembers("user-1", "group-1", ["newcomer-1"], dependencies),
      (error: { code?: string }) => {
        assert.equal(error.code, "GROUP_FULL");
        return true;
      },
    );
  });

  it("allows one genuinely new member into a group one short of the ceiling, even when already-members are mixed into the request", async () => {
    const participants = Array.from({ length: GROUP_DM_MAX_PARTICIPANTS - 1 }, (_, index) =>
      member(`user-${index + 1}`, 1, index === 0 ? { role: "OWNER" } : {}),
    );
    let written: { addedUserIds: string[] } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () =>
        buildGroup({ participants, ownerId: "user-1", type: "GROUP_DM" }),
      writeAddedMembers: async (input) => {
        written = { addedUserIds: input.members.map((entry) => entry.userId) };
        return buildGroup({ participants, ownerId: "user-1", type: "GROUP_DM" });
      },
    });

    // The request mixes two already-members ("user-2", "user-3") in with the one
    // genuinely new id. The eligible list (pre-filter) is 3 long, but only 1 id
    // survives the already-member filter, so ceiling-1 + 1 must still be legal.
    await addGroupMembers("user-1", "group-1", ["user-2", "user-3", "newcomer-1"], dependencies);

    assert.deepEqual(written, { addedUserIds: ["newcomer-1"] });
  });

  it("does not throw GROUP_FULL when re-adding an already-member to a group at the ceiling", async () => {
    const participants = Array.from({ length: GROUP_DM_MAX_PARTICIPANTS }, (_, index) =>
      member(`user-${index + 1}`, 1, index === 0 ? { role: "OWNER" } : {}),
    );
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
        return { broadcastViewerId: "user-1" };
      },
    });

    await removeGroupMember("user-1", "group-1", "user-3", dependencies);

    assert.deepEqual(written, {
      actorId: "user-1",
      systemType: "MEMBER_REMOVED",
      targetUserId: "user-3",
    });
  });

  it("refuses a plain member removing somebody else", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () => removeGroupMember("user-2", "group-1", "user-3", dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "NOT_GROUP_ADMIN");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("lets an admin remove a plain member", async () => {
    let written: { targetUserId: string } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () =>
        buildGroup({
          participants: [
            member("user-1", 1, { role: "OWNER" }),
            member("user-2", 2, { role: "ADMIN" }),
            member("user-3", 3),
          ],
        }),
      writeRemovedMember: async (input) => {
        written = { targetUserId: input.targetUserId };
        return { broadcastViewerId: "user-2" };
      },
    });

    await removeGroupMember("user-2", "group-1", "user-3", dependencies);

    assert.deepEqual(written, { targetUserId: "user-3" });
  });

  it("refuses one admin removing another — only the owner outranks an admin", async () => {
    const dependencies = buildDependencies({
      loadConversation: async () =>
        buildGroup({
          participants: [
            member("user-1", 1, { role: "OWNER" }),
            member("user-2", 2, { role: "ADMIN" }),
            member("user-3", 3, { role: "ADMIN" }),
          ],
        }),
    });

    await assert.rejects(
      () => removeGroupMember("user-2", "group-1", "user-3", dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("lets the owner remove an admin", async () => {
    let written: { targetUserId: string } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () =>
        buildGroup({
          participants: [
            member("user-1", 1, { role: "OWNER" }),
            member("user-2", 2, { role: "ADMIN" }),
            member("user-3", 3),
          ],
        }),
      writeRemovedMember: async (input) => {
        written = { targetUserId: input.targetUserId };
        return { broadcastViewerId: "user-1" };
      },
    });

    await removeGroupMember("user-1", "group-1", "user-2", dependencies);

    assert.deepEqual(written, { targetUserId: "user-2" });
  });

  it("refuses to remove the owner, even by an admin", async () => {
    const dependencies = buildDependencies({
      loadConversation: async () =>
        buildGroup({
          participants: [
            member("user-1", 1, { role: "OWNER" }),
            member("user-2", 2, { role: "ADMIN" }),
            member("user-3", 3),
          ],
        }),
    });

    await assert.rejects(
      () => removeGroupMember("user-2", "group-1", "user-1", dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
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
        return { broadcastViewerId: "user-1" };
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

  it("delegates the last-member deletion decision to the locked writer", async () => {
    let removeWrites = 0;
    const dependencies = buildDependencies({
      loadConversation: async () =>
        buildGroup({
          // The sole remaining participant is not the owner, so the old
          // owner-only guard could not reach this path.
          ownerId: "user-1",
          participants: [member("user-2", 2)],
        }),
      writeRemovedMember: async () => {
        removeWrites += 1;
        return { broadcastViewerId: null };
      },
    });

    const result = await leaveGroupConversation("user-2", "group-1", dependencies);

    assert.equal(removeWrites, 1);
    assert.deepEqual(result, { broadcastViewerId: null });
  });

  /**
   * V8 / 2f §5. The owner is the group's only administrator in the default
   * fixture, so leaving without naming a successor would leave nobody who can
   * edit the group, remove anyone or appoint a replacement.
   */
  it("refuses the last admin's departure until a successor is named", async () => {
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeRemovedMember: async () => {
        throw Object.assign(new Error("transfer required"), {
          code: "OWNER_TRANSFER_REQUIRED",
          status: 409,
        });
      },
    });

    await assert.rejects(
      () => leaveGroupConversation("user-1", "group-1", dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "OWNER_TRANSFER_REQUIRED");
        assert.equal(error.status, 409);
        return true;
      },
    );
  });

  it("hands the group to the named successor", async () => {
    let written: { transferOwnershipTo: string | null | undefined } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeRemovedMember: async (input) => {
        written = { transferOwnershipTo: input.transferOwnershipTo };
        return { broadcastViewerId: "user-3" };
      },
    });

    await leaveGroupConversation("user-1", "group-1", dependencies, {
      transferOwnershipTo: "user-3",
    });

    assert.deepEqual(written, { transferOwnershipTo: "user-3" });
  });

  it("refuses a successor who is not in the group", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () =>
        leaveGroupConversation("user-1", "group-1", dependencies, {
          transferOwnershipTo: "user-9",
        }),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "NOT_FOUND");
        assert.equal(error.status, 404);
        return true;
      },
    );
  });

  it("refuses a successor who is the departing member", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () =>
        leaveGroupConversation("user-1", "group-1", dependencies, {
          transferOwnershipTo: "user-1",
        }),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "INVALID_OWNER_TRANSFER");
        assert.equal(error.status, 400);
        return true;
      },
    );
  });

  /**
   * With another admin standing there is nothing to ask: the group keeps an
   * administrator either way, so ownership moves silently and the prompt would
   * only be a click in the way.
   */
  it("passes ownership to a remaining admin without asking", async () => {
    let written: { transferOwnershipTo: string | null | undefined } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () =>
        buildGroup({
          participants: [
            member("user-1", 1, { role: "OWNER" }),
            member("user-2", 2),
            member("user-3", 3, { role: "ADMIN" }),
          ],
        }),
      writeRemovedMember: async (input) => {
        written = { transferOwnershipTo: input.transferOwnershipTo };
        return { broadcastViewerId: "user-3" };
      },
    });

    await leaveGroupConversation("user-1", "group-1", dependencies);

    assert.deepEqual(written, { transferOwnershipTo: undefined });
  });

  it("lets a plain admin leave while the owner is still there", async () => {
    let written: { transferOwnershipTo: string | null | undefined } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () =>
        buildGroup({
          participants: [
            member("user-1", 1, { role: "OWNER" }),
            member("user-2", 2, { role: "ADMIN" }),
            member("user-3", 3),
          ],
        }),
      writeRemovedMember: async (input) => {
        written = { transferOwnershipTo: input.transferOwnershipTo };
        return { broadcastViewerId: "user-1" };
      },
    });

    await leaveGroupConversation("user-2", "group-1", dependencies);

    assert.deepEqual(written, { transferOwnershipTo: undefined });
  });

  it("leaves ownership alone when a non-owner leaves", async () => {
    let written: { transferOwnershipTo: string | null | undefined } | null = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeRemovedMember: async (input) => {
        written = { transferOwnershipTo: input.transferOwnershipTo };
        return { broadcastViewerId: "user-1" };
      },
    });

    await leaveGroupConversation("user-2", "group-1", dependencies);

    assert.deepEqual(written, { transferOwnershipTo: undefined });
  });

  it("deletes the conversation when the last member leaves", async () => {
    let removeWrites = 0;
    const dependencies = buildDependencies({
      loadConversation: async () =>
        buildGroup({
          participants: [member("user-1", 1, { role: "OWNER" })],
        }),
      writeRemovedMember: async () => {
        removeWrites += 1;
        return { broadcastViewerId: null };
      },
    });

    await leaveGroupConversation("user-1", "group-1", dependencies);

    assert.equal(removeWrites, 1);
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

  /**
   * K4. The rule moved from ownership to `permEditInfo`, which a fresh group
   * leaves on "Yöneticiler" (2f §3) — so the default answer for a plain member
   * is unchanged, only the code that says so.
   */
  it("refuses a member while editInfo is restricted to admins", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () => updateGroupConversation("user-2", "group-1", { name: "Yeni" }, dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("lets a member rename the group once editInfo is open to everyone", async () => {
    let writes = 0;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup({ permEditInfo: "ALL" }),
      writeGroupMetadata: async () => {
        writes += 1;
        return buildGroup();
      },
    });

    await updateGroupConversation("user-2", "group-1", { name: "Yeni" }, dependencies);

    assert.equal(writes, 1);
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

    assert.deepEqual(map.get("user-4"), { blocked: false, closed: false, isFriend: false });
  });

  // Row order is whatever the database hands back, so the block has to survive
  // both orders. Only the BLOCKED-first case catches an ACCEPTED row that clears
  // an existing block.
  it("keeps the block when the ACCEPTED row arrives after the BLOCKED one", () => {
    const map = toGroupEligibilityMap("user-1", targets, [
      { receiverId: "user-1", senderId: "user-2", status: "BLOCKED" },
      { receiverId: "user-2", senderId: "user-1", status: "ACCEPTED" },
    ]);

    assert.deepEqual(map.get("user-2"), { blocked: true, closed: false, isFriend: true });
  });

  it("keeps the block when the ACCEPTED row arrives before the BLOCKED one", () => {
    const map = toGroupEligibilityMap("user-1", targets, [
      { receiverId: "user-2", senderId: "user-1", status: "ACCEPTED" },
      { receiverId: "user-1", senderId: "user-2", status: "BLOCKED" },
    ]);

    assert.deepEqual(map.get("user-2"), { blocked: true, closed: false, isFriend: true });
  });

  it("ignores rows about somebody who was never a target", () => {
    const map = toGroupEligibilityMap("user-1", targets, [
      { receiverId: "user-9", senderId: "user-1", status: "BLOCKED" },
    ]);

    assert.equal(map.has("user-9"), false);
    assert.equal(map.size, targets.length);
  });
});

describe("updateGroupSettings", () => {
  it("lets an admin change the four permissions and the history window", async () => {
    let written: unknown = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeGroupSettings: async (input) => {
        written = input.patch;
        return buildGroup();
      },
    });

    await updateGroupSettings(
      "user-1",
      "group-1",
      { historyVisibility: "NONE", permSendMessage: "ADMINS" },
      dependencies,
    );

    assert.deepEqual(written, { historyVisibility: "NONE", permSendMessage: "ADMINS" });
  });

  it("refuses a member while editInfo is restricted to admins", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () => updateGroupSettings("user-2", "group-1", { permSendMessage: "ADMINS" }, dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("lets a member through once the group opens editInfo to everyone", async () => {
    let writes = 0;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup({ permEditInfo: "ALL" }),
      writeGroupSettings: async () => {
        writes += 1;
        return buildGroup();
      },
    });

    await updateGroupSettings("user-2", "group-1", { description: "Yeni" }, dependencies);

    assert.equal(writes, 1);
  });

  it("refuses a 1:1 conversation", async () => {
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup({ ownerId: null, type: "DM" }),
    });

    await assert.rejects(
      () => updateGroupSettings("user-1", "dm-1", { permEditInfo: "ALL" }, dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "NOT_A_GROUP");
        assert.equal(error.status, 400);
        return true;
      },
    );
  });

  it("announces a disappearing-window change", async () => {
    // K3 / C2. The one setting loud enough to leave a system row, because it
    // changes what happens to everybody's future messages.
    const written: Array<{ announceDisappearing?: string | undefined }> = [];
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup({ disappearingAfter: "OFF" }),
      writeGroupSettings: async (input) => {
        written.push(input);
        return buildGroup();
      },
    });

    await updateGroupSettings("user-1", "group-1", { disappearingAfter: "D7" }, dependencies);

    assert.equal(written[0]?.announceDisappearing, "D7");
  });

  it("stays silent when the window is re-saved unchanged", async () => {
    // Opening the settings screen and pressing save must not post a row saying
    // nothing happened.
    const written: Array<{ announceDisappearing?: string | undefined }> = [];
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup({ disappearingAfter: "D7" }),
      writeGroupSettings: async (input) => {
        written.push(input);
        return buildGroup();
      },
    });

    await updateGroupSettings("user-1", "group-1", { disappearingAfter: "D7" }, dependencies);

    assert.equal(written[0]?.announceDisappearing, undefined);
  });

  it("stays silent for every other setting", async () => {
    const written: Array<{ announceDisappearing?: string | undefined }> = [];
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeGroupSettings: async (input) => {
        written.push(input);
        return buildGroup();
      },
    });

    await updateGroupSettings("user-1", "group-1", { permSendMessage: "ADMINS" }, dependencies);

    assert.equal(written[0]?.announceDisappearing, undefined);
  });

  it("refuses a member who tries to change the window while editInfo is locked", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () => updateGroupSettings("user-2", "group-1", { disappearingAfter: "H24" }, dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.status, 403);
        return true;
      },
    );
  });
});

describe("updateMemberRole", () => {
  it("lets the owner promote a member to admin", async () => {
    let written: unknown = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeMemberRole: async (input) => {
        written = input;
        return buildGroup();
      },
    });

    await updateMemberRole("user-1", "group-1", "user-2", { role: "ADMIN" }, dependencies);

    assert.deepEqual(written, {
      conversationId: "group-1",
      nextOwnerId: null,
      previousOwnerId: null,
      role: "ADMIN",
      targetUserId: "user-2",
    });
  });

  /**
   * The handover is one write set: the target becomes OWNER, the old owner drops
   * to ADMIN and `ownerId` follows. Split across requests, a crash in the middle
   * leaves the group with two owners or none.
   */
  it("moves ownership and demotes the previous owner in the same write", async () => {
    let written: unknown = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writeMemberRole: async (input) => {
        written = input;
        return buildGroup();
      },
    });

    await updateMemberRole(
      "user-1",
      "group-1",
      "user-2",
      { transferOwnership: true },
      dependencies,
    );

    assert.deepEqual(written, {
      conversationId: "group-1",
      nextOwnerId: "user-2",
      previousOwnerId: "user-1",
      role: "OWNER",
      targetUserId: "user-2",
    });
  });

  it("refuses an admin — appointing admins is the owner's alone", async () => {
    const dependencies = buildDependencies({
      loadConversation: async () =>
        buildGroup({
          participants: [
            member("user-1", 1, { role: "OWNER" }),
            member("user-2", 2, { role: "ADMIN" }),
            member("user-3", 3),
          ],
        }),
    });

    await assert.rejects(
      () => updateMemberRole("user-2", "group-1", "user-3", { role: "ADMIN" }, dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "NOT_GROUP_OWNER");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("refuses a role change aimed at the caller", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () => updateMemberRole("user-1", "group-1", "user-1", { role: "MEMBER" }, dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "INVALID_ROLE_CHANGE");
        assert.equal(error.status, 400);
        return true;
      },
    );
  });

  it("refuses a target who is not in the group", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () => updateMemberRole("user-1", "group-1", "user-9", { role: "ADMIN" }, dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "NOT_FOUND");
        assert.equal(error.status, 404);
        return true;
      },
    );
  });
});

describe("setPinnedMessage", () => {
  it("pins a message the admin is allowed to pin", async () => {
    let written: unknown = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      writePinnedMessage: async (input) => {
        written = input;
        return buildGroup();
      },
    });

    await setPinnedMessage("user-1", "group-1", "message-1", dependencies);

    assert.deepEqual(written, {
      actorId: "user-1",
      conversationId: "group-1",
      messageId: "message-1",
    });
  });

  it("refuses a member while pinning is restricted to admins", async () => {
    const dependencies = buildDependencies({ loadConversation: async () => buildGroup() });

    await assert.rejects(
      () => setPinnedMessage("user-2", "group-1", "message-1", dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("refuses a message that belongs to another conversation", async () => {
    // The foreign key alone would accept it, and the pinned strip would then
    // quote content the members are not allowed to read.
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      loadPinnableMessage: async () => null,
    });

    await assert.rejects(
      () => setPinnedMessage("user-1", "group-1", "message-elsewhere", dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "NOT_FOUND");
        assert.equal(error.status, 404);
        return true;
      },
    );
  });

  it("unpins without looking a message up", async () => {
    let lookups = 0;
    let written: unknown = null;
    const dependencies = buildDependencies({
      loadConversation: async () => buildGroup(),
      loadPinnableMessage: async () => {
        lookups += 1;
        return null;
      },
      writePinnedMessage: async (input) => {
        written = input;
        return buildGroup();
      },
    });

    await setPinnedMessage("user-1", "group-1", null, dependencies);

    assert.equal(lookups, 0);
    assert.deepEqual(written, { actorId: "user-1", conversationId: "group-1", messageId: null });
  });
});

describe("setNotifyLevel", () => {
  /**
   * §4.2's invariant. `muted` is a derived mirror, so the two columns move in one
   * statement — code that writes them separately is rejected in review.
   */
  it("writes notifyLevel and its muted mirror in a single update", async () => {
    const { dependencies, writes } = participantDependencies();

    await setNotifyLevel("user-1", "group-1", "NONE", dependencies);

    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0], {
      conversationId: "group-1",
      data: { muted: true, mutedUntil: null, notifyLevel: "NONE" },
      userId: "user-1",
    });
  });

  it("clears muted for every tier that still notifies", async () => {
    for (const level of ["ALL", "MENTIONS"] as const) {
      const { dependencies, writes } = participantDependencies();

      await setNotifyLevel("user-1", "group-1", level, dependencies);

      assert.deepEqual(writes[0]?.data, { muted: false, mutedUntil: null, notifyLevel: level });
    }
  });

  /**
   * Mesajlar §17. Picking a level is a standing decision; a timed mute is a temporary
   * one. Leaving `mutedUntil` behind made a deliberate `Kapalı` expire back into `ALL`
   * when the old timer ran out, because `isMuteActive` reads the expiry and not the
   * radio — the setting looked applied and then silently undid itself hours later.
   */
  it("drops a leftover mute expiry so the level does not time out", async () => {
    for (const level of ["ALL", "MENTIONS", "NONE"] as const) {
      const { dependencies, writes } = participantDependencies();

      await setNotifyLevel("user-1", "group-1", level, dependencies);

      assert.equal(writes.length, 1, "expiry must ride the same statement, not a second write");
      assert.equal(
        (writes[0]?.data as { mutedUntil?: Date | null }).mutedUntil,
        null,
        `${level} left a mute expiry behind`,
      );
    }
  });

  it("answers 403 when the caller is not a participant", async () => {
    const { dependencies } = participantDependencies(0);

    await assert.rejects(
      () => setNotifyLevel("stranger", "group-1", "NONE", dependencies),
      (error: { code?: string; status?: number }) => {
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        return true;
      },
    );
  });
});

describe("setConversationPin", () => {
  it("stamps the pin with the given moment", async () => {
    const { dependencies, writes } = participantDependencies();
    const now = new Date("2026-08-11T09:00:00.000Z");

    const result = await setConversationPin("user-1", "dm-1", true, dependencies, now);

    assert.deepEqual(writes[0]?.data, { pinnedAt: now });
    assert.equal(result.pinnedAt, "2026-08-11T09:00:00.000Z");
  });

  it("clears the pin", async () => {
    const { dependencies, writes } = participantDependencies();

    const result = await setConversationPin("user-1", "dm-1", false, dependencies);

    assert.deepEqual(writes[0]?.data, { pinnedAt: null });
    assert.equal(result.pinnedAt, null);
  });

  it("answers 403 when the caller is not a participant", async () => {
    const { dependencies } = participantDependencies(0);

    await assert.rejects(
      () => setConversationPin("stranger", "dm-1", true, dependencies),
      (error: { status?: number }) => {
        assert.equal(error.status, 403);
        return true;
      },
    );
  });
});

describe("dismissPinnedStrip", () => {
  it("records which pin was dismissed rather than a boolean", async () => {
    const { dependencies, writes } = participantDependencies();

    await dismissPinnedStrip("user-1", "group-1", "message-1", dependencies);

    assert.deepEqual(writes[0]?.data, { pinnedStripDismissedId: "message-1" });
  });

  it("answers 403 when the caller is not a participant", async () => {
    const { dependencies } = participantDependencies(0);

    await assert.rejects(
      () => dismissPinnedStrip("stranger", "group-1", "message-1", dependencies),
      (error: { status?: number }) => {
        assert.equal(error.status, 403);
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// §15.5.3's two destructive rows
// ---------------------------------------------------------------------------

type AdminDeps = Parameters<typeof clearGroupHistory>[2];

const ADMIN_ACTION_NOW = new Date("2026-08-27T12:00:00.000Z");

function buildAdminDependencies(
  overrides: Partial<NonNullable<AdminDeps>> = {},
): NonNullable<AdminDeps> {
  return {
    loadConversation: async () => buildGroup(),
    now: () => ADMIN_ACTION_NOW,
    writeClearedHistory: async () => {
      throw new Error("writeClearedHistory should not be called in this test");
    },
    writeDeletedGroup: async () => {
      throw new Error("writeDeletedGroup should not be called in this test");
    },
    ...overrides,
  } as NonNullable<AdminDeps>;
}

async function rejectsWithStatus(run: () => Promise<unknown>, status: number) {
  await assert.rejects(run, (error: { status?: number }) => {
    assert.equal(error.status, status);
    return true;
  });
}

describe("clearGroupHistory", () => {
  it("refuses a plain member", async () => {
    await rejectsWithStatus(
      () => clearGroupHistory("user-3", "group-1", buildAdminDependencies()),
      403,
    );
  });

  it("lets an admin raise every member's history floor to now", async () => {
    let written: { historyFromAt: Date; memberCount: number } | null = null;
    const result = await clearGroupHistory(
      "user-2",
      "group-1",
      buildAdminDependencies({
        loadConversation: async () =>
          buildGroup({
            participants: [
              member("user-1", 1, { role: "OWNER" }),
              member("user-2", 2, { role: "ADMIN" }),
              member("user-3", 3),
            ],
          }),
        writeClearedHistory: async (input) => {
          written = { historyFromAt: input.historyFromAt, memberCount: input.memberCount };
          return 3;
        },
      }),
    );

    assert.deepEqual(written, { historyFromAt: ADMIN_ACTION_NOW, memberCount: 3 });
    assert.equal(result.clearedAt, ADMIN_ACTION_NOW.toISOString());
    assert.equal(result.memberCount, 3);
    assert.deepEqual([...result.participantUserIds], ["user-1", "user-2", "user-3"]);
  });

  it("lets the owner do it too", async () => {
    let called = false;
    await clearGroupHistory(
      "user-1",
      "group-1",
      buildAdminDependencies({
        writeClearedHistory: async () => {
          called = true;
          return 3;
        },
      }),
    );

    assert.equal(called, true);
  });

  it("refuses a 1:1 DM with 400 rather than clearing it", async () => {
    await rejectsWithStatus(
      () =>
        clearGroupHistory(
          "user-1",
          "dm-1",
          buildAdminDependencies({ loadConversation: async () => buildGroup({ type: "DM" }) }),
        ),
      400,
    );
  });

  it("passes the caller's headers through so the audit row carries a fingerprint", async () => {
    let seen: string | null = null;
    await clearGroupHistory(
      "user-1",
      "group-1",
      buildAdminDependencies({
        writeClearedHistory: async (input) => {
          seen = input.headers?.get("x-forwarded-for") ?? null;
          return 3;
        },
      }),
      { headers: new Headers({ "x-forwarded-for": "203.0.113.7" }) },
    );

    assert.equal(seen, "203.0.113.7");
  });

  it("moves the floor and writes the audit in one transaction, deleting nothing", async () => {
    const source = await readFile(new URL("./group-service.ts", import.meta.url), "utf8");
    const block = source.slice(
      source.indexOf("writeClearedHistory: async (input) =>"),
      source.indexOf("writeDeletedGroup: async (input) =>"),
    );

    assert.notEqual(block.length, 0);
    assert.match(block, /prisma\.\$transaction/);
    assert.match(block, /tx\.dMParticipant\.updateMany/);
    assert.match(block, /historyFromAt: input\.historyFromAt/);
    assert.match(block, /writeAdminAuditLog\(/);
    assert.match(block, /DM_GROUP_HISTORY_CLEARED/);
    // The whole point of the column: the messages survive, so replies, threads,
    // reactions, attachments and the disappearing worker keep their parents.
    assert.doesNotMatch(block, /delete/i);
  });
});

describe("deleteGroupConversation", () => {
  it("refuses an admin who is not the owner", async () => {
    await rejectsWithStatus(
      () =>
        deleteGroupConversation(
          "user-2",
          "group-1",
          buildAdminDependencies({
            loadConversation: async () =>
              buildGroup({
                participants: [
                  member("user-1", 1, { role: "OWNER" }),
                  member("user-2", 2, { role: "ADMIN" }),
                  member("user-3", 3),
                ],
              }),
          }),
        ),
      403,
    );
  });

  it("refuses a plain member", async () => {
    await rejectsWithStatus(
      () => deleteGroupConversation("user-3", "group-1", buildAdminDependencies()),
      403,
    );
  });

  it("lets the owner delete it and answers with everybody who has to be told", async () => {
    let written: { actorId: string; conversationId: string; memberCount: number } | null = null;
    const result = await deleteGroupConversation(
      "user-1",
      "group-1",
      buildAdminDependencies({
        writeDeletedGroup: async (input) => {
          written = {
            actorId: input.actorId,
            conversationId: input.conversationId,
            memberCount: input.memberCount,
          };
        },
      }),
    );

    assert.deepEqual(written, { actorId: "user-1", conversationId: "group-1", memberCount: 3 });
    assert.deepEqual([...result.participantUserIds], ["user-1", "user-2", "user-3"]);
  });

  it("refuses a 1:1 DM with 400", async () => {
    await rejectsWithStatus(
      () =>
        deleteGroupConversation(
          "user-1",
          "dm-1",
          buildAdminDependencies({ loadConversation: async () => buildGroup({ type: "DM" }) }),
        ),
      400,
    );
  });

  it("leans on the cascade and writes the audit in the same transaction", async () => {
    const source = await readFile(new URL("./group-service.ts", import.meta.url), "utf8");
    const block = source.slice(
      source.indexOf("writeDeletedGroup: async (input) =>"),
      source.indexOf("export type ClearGroupHistoryResult"),
    );

    assert.notEqual(block.length, 0);
    assert.match(block, /prisma\.\$transaction/);
    assert.match(block, /tx\.dMConversation\.delete/);
    assert.match(block, /writeAdminAuditLog\(/);
    assert.match(block, /DM_GROUP_DELETED/);
    // No hand-written teardown loop: the participants, messages, pins and the
    // invite row are `onDelete: Cascade` already.
    assert.doesNotMatch(block, /dMParticipant|dMPinnedMessage|groupInvite/);
  });
});
