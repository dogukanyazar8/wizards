import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGroupAvatarPair,
  canMemberDo,
  ConversationNotifyRequestSchema,
  ConversationPinRequestSchema,
  GROUP_AVATAR_COLORS,
  GROUP_DM_DESCRIPTION_MAX_LENGTH,
  GROUP_DM_NAME_MAX_LENGTH,
  GROUP_MEMBER_NAME_COLORS,
  GroupAvatarColorSchema,
  GroupDMSettingsUpdateRequestSchema,
  GroupMemberRoleUpdateRequestSchema,
  GroupPinDismissRequestSchema,
  GroupPinMessageRequestSchema,
  GroupDisappearingWindowSchema,
  getGroupCapabilities,
  getGroupMemberActions,
  isGroupNameWithinLimit,
  pickNextMemberNameColor,
  resolveDisappearingExpiry,
  resolveHistoryFloor,
  toGroupAvatarInitials,
} from "./group-dm-settings";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("pickNextMemberNameColor", () => {
  it("starts at the head of the palette for an empty conversation", () => {
    assert.equal(pickNextMemberNameColor([]), GROUP_MEMBER_NAME_COLORS[0]);
  });

  it("walks the palette while every colour is still unused", () => {
    const used: string[] = [];

    for (const expected of GROUP_MEMBER_NAME_COLORS) {
      const next = pickNextMemberNameColor(used);
      assert.equal(next, expected);
      used.push(next);
    }
  });

  it("wraps to the least used colour once the palette is exhausted", () => {
    // Everybody has a colour and #C2185B was handed out twice, so the next
    // member must not make it three.
    const used = [...GROUP_MEMBER_NAME_COLORS, GROUP_MEMBER_NAME_COLORS[0]];

    assert.equal(pickNextMemberNameColor(used), GROUP_MEMBER_NAME_COLORS[1]);
  });

  it("breaks a tie on palette order, not on input order", () => {
    const used = [
      GROUP_MEMBER_NAME_COLORS[4],
      GROUP_MEMBER_NAME_COLORS[3],
      GROUP_MEMBER_NAME_COLORS[2],
      GROUP_MEMBER_NAME_COLORS[1],
      GROUP_MEMBER_NAME_COLORS[0],
      // Two colours are now on one use each; the earlier palette entry wins.
      GROUP_MEMBER_NAME_COLORS[2],
      GROUP_MEMBER_NAME_COLORS[3],
      GROUP_MEMBER_NAME_COLORS[4],
    ];

    assert.equal(pickNextMemberNameColor(used), GROUP_MEMBER_NAME_COLORS[0]);
  });

  it("ignores colours that are not in the palette", () => {
    // A row written before the palette existed must not steal a slot from a
    // real colour, or the first two members would share one.
    assert.equal(pickNextMemberNameColor(["#123456", "#123456"]), GROUP_MEMBER_NAME_COLORS[0]);
  });
});

describe("canMemberDo", () => {
  it("lets everyone through an ALL permission", () => {
    for (const role of ["OWNER", "ADMIN", "MEMBER"] as const) {
      assert.equal(canMemberDo(role, "ALL"), true);
    }
  });

  it("stops a plain member at an ADMINS permission", () => {
    assert.equal(canMemberDo("MEMBER", "ADMINS"), false);
  });

  it("lets the owner and admins through an ADMINS permission", () => {
    assert.equal(canMemberDo("OWNER", "ADMINS"), true);
    assert.equal(canMemberDo("ADMIN", "ADMINS"), true);
  });
});

describe("resolveHistoryFloor", () => {
  const joinedAt = new Date("2026-08-11T12:00:00.000Z");

  it("pins NONE to the join moment", () => {
    assert.deepEqual(resolveHistoryFloor("NONE", joinedAt), joinedAt);
  });

  it("opens a 24 hour window", () => {
    assert.deepEqual(resolveHistoryFloor("LAST_24H", joinedAt), new Date(joinedAt.getTime() - DAY));
  });

  it("opens a 30 day window", () => {
    assert.deepEqual(
      resolveHistoryFloor("LAST_30D", joinedAt),
      new Date(joinedAt.getTime() - 30 * DAY),
    );
  });

  it("returns null for ALL so the caller writes no filter at all", () => {
    assert.equal(resolveHistoryFloor("ALL", joinedAt), null);
  });

  it("never mutates the join date it was handed", () => {
    const original = new Date(joinedAt.getTime());
    resolveHistoryFloor("LAST_30D", original);
    assert.deepEqual(original, joinedAt);
  });
});

describe("isGroupNameWithinLimit", () => {
  it("accepts a name at the limit", () => {
    assert.equal(isGroupNameWithinLimit("x".repeat(GROUP_DM_NAME_MAX_LENGTH)), true);
  });

  it("rejects one character over the limit", () => {
    assert.equal(isGroupNameWithinLimit("x".repeat(GROUP_DM_NAME_MAX_LENGTH + 1)), false);
  });

  it("measures the trimmed name, the same as the write schema", () => {
    assert.equal(isGroupNameWithinLimit(`  ${"x".repeat(GROUP_DM_NAME_MAX_LENGTH)}  `), true);
  });

  it("accepts a blank name — blank means the title is derived from members", () => {
    assert.equal(isGroupNameWithinLimit("   "), true);
  });

  it("holds V1's ceiling at 32", () => {
    assert.equal(GROUP_DM_NAME_MAX_LENGTH, 32);
  });
});

describe("toGroupAvatarInitials", () => {
  it("takes the first letter of the first two words of the display name", () => {
    assert.equal(toGroupAvatarInitials({ displayName: "Ada Lovelace", username: "ada" }), "AL");
  });

  it("falls back to the username when there is no display name", () => {
    assert.equal(toGroupAvatarInitials({ displayName: null, username: "ada" }), "A");
  });

  it("upper-cases with Turkish rules so 'i' does not become 'I'", () => {
    assert.equal(toGroupAvatarInitials({ displayName: "irem kaya", username: "irem" }), "İK");
  });

  it("survives a name that is only whitespace", () => {
    assert.equal(toGroupAvatarInitials({ displayName: "   ", username: "  " }), "?");
  });
});

describe("buildGroupAvatarPair", () => {
  const participants = [
    {
      avatarUrl: null,
      displayName: "Ada",
      joinedAt: "2026-01-01T00:00:00.000Z",
      nameColor: "#C2185B",
      userId: "u1",
      username: "ada",
    },
    {
      avatarUrl: "https://cdn/b.png",
      displayName: null,
      joinedAt: "2026-01-02T00:00:00.000Z",
      nameColor: "#C77A2B",
      userId: "u2",
      username: "bora",
    },
    {
      avatarUrl: null,
      displayName: "Cem",
      joinedAt: "2026-01-03T00:00:00.000Z",
      nameColor: "#1B8A55",
      userId: "u3",
      username: "cem",
    },
    {
      avatarUrl: null,
      displayName: "Derya",
      joinedAt: "2026-01-04T00:00:00.000Z",
      nameColor: "#8A46C7",
      userId: "u4",
      username: "derya",
    },
  ];

  it("takes the first two other members in join order", () => {
    const result = buildGroupAvatarPair(participants, "u1");

    assert.deepEqual(
      result.tiles.map((tile) => tile.userId),
      ["u2", "u3"],
    );
    assert.equal(result.tiles[0]?.avatarUrl, "https://cdn/b.png");
    assert.equal(result.tiles[0]?.initials, "B");
    assert.equal(result.tiles[0]?.accent, "#C77A2B");
  });

  it("counts the members the two tiles do not show", () => {
    // 4 participants, viewer excluded, 2 shown -> Derya is the overflow.
    assert.equal(buildGroupAvatarPair(participants, "u1").overflowCount, 1);
  });

  it("reports no overflow when everyone fits", () => {
    assert.equal(buildGroupAvatarPair(participants.slice(0, 3), "u1").overflowCount, 0);
  });

  it("never puts the viewer in their own tiles", () => {
    const result = buildGroupAvatarPair(participants, "u2");

    assert.equal(
      result.tiles.some((tile) => tile.userId === "u2"),
      false,
    );
  });

  it("returns an empty pair when the viewer is the only member left", () => {
    const result = buildGroupAvatarPair(participants.slice(0, 1), "u1");

    assert.deepEqual(result.tiles, []);
    assert.equal(result.overflowCount, 0);
  });

  it("does not reorder the caller's array", () => {
    const input = [...participants].reverse();
    const snapshot = input.map((participant) => participant.userId);

    buildGroupAvatarPair(input, "u1");

    assert.deepEqual(
      input.map((participant) => participant.userId),
      snapshot,
    );
  });
});

describe("GroupDMSettingsUpdateRequestSchema", () => {
  it("accepts a single permission change", () => {
    const parsed = GroupDMSettingsUpdateRequestSchema.parse({ permSendMessage: "ADMINS" });

    assert.equal(parsed.permSendMessage, "ADMINS");
    assert.equal(parsed.permAddMembers, undefined);
  });

  it("rejects an empty patch — an empty PATCH is a client bug, not a no-op", () => {
    assert.throws(() => GroupDMSettingsUpdateRequestSchema.parse({}));
  });

  it("rejects an unknown key", () => {
    assert.throws(() => GroupDMSettingsUpdateRequestSchema.parse({ ownerId: "u1" }));
  });

  it("turns a blank description into null so the column clears", () => {
    assert.equal(
      GroupDMSettingsUpdateRequestSchema.parse({ description: "   " }).description,
      null,
    );
  });

  it("rejects a description over the limit", () => {
    assert.throws(() =>
      GroupDMSettingsUpdateRequestSchema.parse({
        description: "x".repeat(GROUP_DM_DESCRIPTION_MAX_LENGTH + 1),
      }),
    );
  });

  it("rejects an avatar colour outside the five-colour palette", () => {
    assert.throws(() => GroupDMSettingsUpdateRequestSchema.parse({ avatarColor: "#000000" }));
    assert.equal(
      GroupDMSettingsUpdateRequestSchema.parse({ avatarColor: GROUP_AVATAR_COLORS[4] }).avatarColor,
      GROUP_AVATAR_COLORS[4],
    );
  });

  it("accepts an explicit null avatar colour — 'back to the derived colour'", () => {
    assert.equal(GroupDMSettingsUpdateRequestSchema.parse({ avatarColor: null }).avatarColor, null);
  });

  it("rejects a history window that is not one of the four", () => {
    assert.throws(() => GroupDMSettingsUpdateRequestSchema.parse({ historyVisibility: "LAST_7D" }));
  });
});

describe("GroupMemberRoleUpdateRequestSchema", () => {
  it("accepts a promotion", () => {
    assert.deepEqual(GroupMemberRoleUpdateRequestSchema.parse({ role: "ADMIN" }), {
      role: "ADMIN",
    });
  });

  it("accepts a demotion", () => {
    assert.deepEqual(GroupMemberRoleUpdateRequestSchema.parse({ role: "MEMBER" }), {
      role: "MEMBER",
    });
  });

  it("accepts an ownership transfer with no role", () => {
    assert.deepEqual(GroupMemberRoleUpdateRequestSchema.parse({ transferOwnership: true }), {
      transferOwnership: true,
    });
  });

  it("rejects a transfer that also names a role — the two are different writes", () => {
    assert.throws(() =>
      GroupMemberRoleUpdateRequestSchema.parse({ role: "ADMIN", transferOwnership: true }),
    );
  });

  it("rejects OWNER as a settable role — ownership moves through the transfer flag", () => {
    assert.throws(() => GroupMemberRoleUpdateRequestSchema.parse({ role: "OWNER" }));
  });

  it("rejects an empty body", () => {
    assert.throws(() => GroupMemberRoleUpdateRequestSchema.parse({}));
  });
});

describe("conversation-scoped request schemas", () => {
  it("parses a notify level", () => {
    assert.deepEqual(ConversationNotifyRequestSchema.parse({ notifyLevel: "MENTIONS" }), {
      notifyLevel: "MENTIONS",
    });
    assert.throws(() => ConversationNotifyRequestSchema.parse({ notifyLevel: "SOMETIMES" }));
  });

  it("parses a conversation pin toggle", () => {
    assert.deepEqual(ConversationPinRequestSchema.parse({ pinned: true }), { pinned: true });
    assert.throws(() => ConversationPinRequestSchema.parse({ pinned: "yes" }));
  });

  it("parses a message pin", () => {
    assert.deepEqual(GroupPinMessageRequestSchema.parse({ messageId: "m1" }), { messageId: "m1" });
    assert.throws(() => GroupPinMessageRequestSchema.parse({ messageId: "" }));
  });

  it("parses a pinned-strip dismissal, which names the message it dismisses", () => {
    // Without the id a stale dismissal would swallow a pin that landed after it.
    assert.deepEqual(GroupPinDismissRequestSchema.parse({ messageId: "m1" }), { messageId: "m1" });
    assert.throws(() => GroupPinDismissRequestSchema.parse({}));
  });
});

describe("palette constants", () => {
  it("keeps the five member name colours in design order", () => {
    assert.deepEqual(
      [...GROUP_MEMBER_NAME_COLORS],
      ["#C2185B", "#C77A2B", "#1B8A55", "#8A46C7", "#4F46E5"],
    );
  });

  it("keeps the five group avatar colours in design order", () => {
    assert.deepEqual(
      [...GROUP_AVATAR_COLORS],
      ["#4F46E5", "#1B8A55", "#C77A2B", "#C2185B", "#1E2235"],
    );
  });

  it("accepts every avatar colour through the schema", () => {
    for (const color of GROUP_AVATAR_COLORS) {
      assert.equal(GroupAvatarColorSchema.parse(color), color);
    }
  });
});

describe("resolveDisappearingExpiry", () => {
  const sentAt = new Date("2026-08-11T12:00:00.000Z");

  it("stamps nothing while the window is off", () => {
    // K3: `null` means the row is never swept. A far-future date would be a
    // deletion nobody asked for, just a slow one.
    assert.equal(resolveDisappearingExpiry("OFF", sentAt), null);
  });

  it("stamps 24 hours out", () => {
    assert.deepEqual(
      resolveDisappearingExpiry("H24", sentAt),
      new Date("2026-08-12T12:00:00.000Z"),
    );
  });

  it("stamps 7 days out", () => {
    assert.deepEqual(resolveDisappearingExpiry("D7", sentAt), new Date("2026-08-18T12:00:00.000Z"));
  });

  it("stamps 90 days out", () => {
    assert.deepEqual(
      resolveDisappearingExpiry("D90", sentAt),
      new Date("2026-11-09T12:00:00.000Z"),
    );
  });

  it("measures from the message instant, not from now", () => {
    // V6: changing the window never re-stamps history, so the only clock that
    // may decide a message's deadline is the one it was written with.
    const older = new Date("2026-01-01T00:00:00.000Z");
    assert.deepEqual(resolveDisappearingExpiry("H24", older), new Date("2026-01-02T00:00:00.000Z"));
  });
});

describe("GroupDisappearingWindowSchema", () => {
  it("accepts the four options 2f offers", () => {
    for (const window of ["OFF", "H24", "D7", "D90"] as const) {
      assert.equal(GroupDisappearingWindowSchema.parse(window), window);
    }
  });

  it("rejects anything else", () => {
    assert.equal(GroupDisappearingWindowSchema.safeParse("D30").success, false);
  });
});

describe("GroupDMSettingsUpdateRequestSchema disappearing window", () => {
  it("accepts the window on its own", () => {
    assert.deepEqual(GroupDMSettingsUpdateRequestSchema.parse({ disappearingAfter: "D7" }), {
      disappearingAfter: "D7",
    });
  });
});

/**
 * Faz 5 §H. The two rules both clients read. They are tested here rather than
 * only in the mobile model because this module is now their only home.
 */
describe("getGroupCapabilities", () => {
  const permissions = {
    addMembers: "ALL",
    editInfo: "ADMINS",
    pinMessage: "ADMINS",
    sendMessage: "ALL",
  } as const;

  it("answers one question per control for a member", () => {
    assert.deepEqual(getGroupCapabilities("MEMBER", permissions), {
      canAddMembers: true,
      canEditInfo: false,
      canManageRoles: false,
      canPin: false,
      canSend: true,
      canTransferOwnership: false,
    });
  });

  it("gives the owner the two role controls and every ADMINS gate", () => {
    assert.deepEqual(getGroupCapabilities("OWNER", permissions), {
      canAddMembers: true,
      canEditInfo: true,
      canManageRoles: true,
      canPin: true,
      canSend: true,
      canTransferOwnership: true,
    });
  });

  it("treats an admin as an admin, not as a member", () => {
    assert.equal(getGroupCapabilities("ADMIN", permissions).canEditInfo, true);
    assert.equal(getGroupCapabilities("ADMIN", permissions).canManageRoles, false);
  });

  it("opens everything but the role controls for a 1:1", () => {
    assert.deepEqual(getGroupCapabilities(undefined, undefined), {
      canAddMembers: true,
      canEditInfo: true,
      canManageRoles: false,
      canPin: true,
      canSend: true,
      canTransferOwnership: false,
    });
  });

  it("falls back to MEMBER when the role is missing but the permissions are not", () => {
    assert.equal(getGroupCapabilities(undefined, permissions).canEditInfo, false);
  });
});

describe("getGroupMemberActions", () => {
  it("offers nothing on your own row", () => {
    assert.deepEqual(getGroupMemberActions("OWNER", "MEMBER", true), []);
  });

  it("lets the owner promote and remove a member", () => {
    assert.deepEqual(getGroupMemberActions("OWNER", "MEMBER", false), [
      "message",
      "profile",
      "promote",
      "remove",
    ]);
  });

  it("offers demote instead of promote for an admin", () => {
    assert.deepEqual(getGroupMemberActions("OWNER", "ADMIN", false), [
      "message",
      "profile",
      "demote",
      "remove",
    ]);
  });

  it("never makes the owner a moderation target", () => {
    assert.deepEqual(getGroupMemberActions("OWNER", "OWNER", false), ["message", "profile"]);
  });

  it("lets an admin remove a member but not another admin", () => {
    assert.deepEqual(getGroupMemberActions("ADMIN", "MEMBER", false), [
      "message",
      "profile",
      "remove",
    ]);
    assert.deepEqual(getGroupMemberActions("ADMIN", "ADMIN", false), ["message", "profile"]);
  });

  it("gives a member the two read-only actions and nothing else", () => {
    assert.deepEqual(getGroupMemberActions("MEMBER", "MEMBER", false), ["message", "profile"]);
  });
});
