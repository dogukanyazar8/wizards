import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MEMBER_MODERATION_PERMISSIONS,
  buildMemberFilterWhere,
  buildMemberSearchWhere,
  classifyServerRoles,
  memberFilterNeedsPresence,
  memberFilterNeedsRoles,
} from "./member-filters";
import { PermissionBits } from "./permissions";

const context = {
  adminRoleIds: ["role-admin"],
  moderatorRoleIds: ["role-mod"],
  onlineUserIds: ["user-online"],
  ownerId: "user-owner",
};

describe("workspace member filters", () => {
  it("splits roles into admin and moderator without letting one role be both", () => {
    const classification = classifyServerRoles([
      { id: "role-everyone", permissions: PermissionBits.VIEW_CHANNEL },
      { id: "role-admin", permissions: PermissionBits.MANAGE_ROLES },
      { id: "role-mod", permissions: PermissionBits.KICK_MEMBERS },
      // Yönetim yetkisi moderasyon yetkisini yutar: satır iki çipte birden görünemez.
      { id: "role-both", permissions: PermissionBits.ADMINISTRATOR | PermissionBits.BAN_MEMBERS },
    ]);

    assert.deepEqual(classification.adminRoleIds, ["role-admin", "role-both"]);
    assert.deepEqual(classification.moderatorRoleIds, ["role-mod"]);
  });

  it("treats voice control as voice control, not moderation", () => {
    const classification = classifyServerRoles([
      { id: "role-voice", permissions: PermissionBits.MUTE_MEMBERS | PermissionBits.MOVE_MEMBERS },
    ]);

    assert.deepEqual(classification.moderatorRoleIds, []);
    assert.deepEqual(
      [...MEMBER_MODERATION_PERMISSIONS],
      [
        PermissionBits.MANAGE_MESSAGES,
        PermissionBits.KICK_MEMBERS,
        PermissionBits.BAN_MEMBERS,
        PermissionBits.TIMEOUT_MEMBERS,
      ],
    );
  });

  it("searches the nickname, the account name and the username", () => {
    assert.deepEqual(buildMemberSearchWhere("  ada  "), {
      OR: [
        { nickname: { contains: "ada", mode: "insensitive" } },
        { user: { displayName: { contains: "ada", mode: "insensitive" } } },
        { user: { username: { contains: "ada", mode: "insensitive" } } },
      ],
    });
  });

  it("treats an empty or blank query as no query at all", () => {
    assert.deepEqual(buildMemberSearchWhere(undefined), {});
    assert.deepEqual(buildMemberSearchWhere("   "), {});
  });

  it("builds one where clause per chip", () => {
    assert.deepEqual(buildMemberFilterWhere("all", context), {});
    assert.deepEqual(buildMemberFilterWhere("owner", context), { userId: "user-owner" });
    assert.deepEqual(buildMemberFilterWhere("admin", context), {
      roles: { some: { roleId: { in: ["role-admin"] } } },
      userId: { not: "user-owner" },
    });
    assert.deepEqual(buildMemberFilterWhere("moderator", context), {
      roles: {
        none: { roleId: { in: ["role-admin"] } },
        some: { roleId: { in: ["role-mod"] } },
      },
      userId: { not: "user-owner" },
    });
    assert.deepEqual(buildMemberFilterWhere("member", context), {
      roles: { none: { roleId: { in: ["role-admin", "role-mod"] } } },
      userId: { not: "user-owner" },
    });
    assert.deepEqual(buildMemberFilterWhere("online", context), {
      userId: { in: ["user-online"] },
    });
    assert.deepEqual(buildMemberFilterWhere("offline", context), {
      userId: { notIn: ["user-online"] },
    });
  });

  it("keeps the owner out of the admin and moderator chips", () => {
    // Sahip her zaman kendi çipinde: rol maskesi yönetici bile olsa `admin` çipine düşmez.
    const admin = buildMemberFilterWhere("admin", context) as { userId: { not: string } };
    const moderator = buildMemberFilterWhere("moderator", context) as { userId: { not: string } };
    const member = buildMemberFilterWhere("member", context) as { userId: { not: string } };

    assert.equal(admin.userId.not, "user-owner");
    assert.equal(moderator.userId.not, "user-owner");
    assert.equal(member.userId.not, "user-owner");
  });

  it("degrades an empty server without inverting a chip", () => {
    const empty = { adminRoleIds: [], moderatorRoleIds: [], onlineUserIds: [], ownerId: "owner" };

    // Yönetici rolü yoksa `admin` hiç kimseyi geçirmeli...
    assert.deepEqual(buildMemberFilterWhere("admin", empty), {
      roles: { some: { roleId: { in: [] } } },
      userId: { not: "owner" },
    });
    // ...ama `member` herkesi geçirmeli, kimseyi değil.
    assert.deepEqual(buildMemberFilterWhere("member", empty), {
      roles: { none: { roleId: { in: [] } } },
      userId: { not: "owner" },
    });
    assert.deepEqual(buildMemberFilterWhere("online", empty), { userId: { in: [] } });
    assert.deepEqual(buildMemberFilterWhere("offline", empty), { userId: { notIn: [] } });
  });

  it("reads presence and roles only for the chips that need them", () => {
    assert.deepEqual(
      (["all", "member", "moderator", "admin", "owner", "online", "offline"] as const).map(
        memberFilterNeedsPresence,
      ),
      [false, false, false, false, false, true, true],
    );
    assert.deepEqual(
      (["all", "member", "moderator", "admin", "owner", "online", "offline"] as const).map(
        memberFilterNeedsRoles,
      ),
      [false, true, true, true, false, false, false],
    );
  });
});
