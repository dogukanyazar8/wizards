import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapMobileServerMemberRoleIds,
  resolveMobileServerCapabilities,
  resolveMobileServerMemberActions,
} from "./mobile-capabilities";
import { MEMBER_BASE_PERMISSIONS, MODERATOR_PERMISSIONS, PermissionBits } from "./permissions";
import type { AccessContext } from "./workspace-types";

function access(
  args: {
    ownerId?: string;
    permissions?: bigint;
    userId?: string;
  } = {},
): AccessContext {
  const userId = args.userId ?? "actor";

  return {
    accessLevel: "MEMBER",
    memberId: `member-${userId}`,
    ownerId: args.ownerId ?? "owner",
    roles: [
      {
        color: 0,
        id: "role-actor",
        isDefault: false,
        managed: false,
        name: "Ordinary role",
        permissions: args.permissions ?? 0n,
      },
    ],
    serverId: "server-1",
    serverName: "Guild",
    userId,
  };
}

const falseCapabilities = {
  canClearHistory: false,
  canDeleteServer: false,
  canKickMembers: false,
  canManageChannels: false,
  canManageInvites: false,
  canManageMessages: false,
  canManageRoles: false,
  canManageServer: false,
  canUploadServerIcon: false,
};

describe("mobile workspace capability projections", () => {
  it("grants every capability to the owner", () => {
    assert.deepEqual(
      resolveMobileServerCapabilities(access({ ownerId: "owner", userId: "owner" })),
      {
        canClearHistory: true,
        canDeleteServer: true,
        canKickMembers: true,
        canManageChannels: true,
        canManageInvites: true,
        canManageMessages: true,
        canManageRoles: true,
        canManageServer: true,
        canUploadServerIcon: true,
      },
    );
  });

  it("maps administrator permission through resolved server permissions without granting delete", () => {
    assert.deepEqual(
      resolveMobileServerCapabilities(access({ permissions: PermissionBits.ADMINISTRATOR })),
      {
        canClearHistory: true,
        canDeleteServer: false,
        canKickMembers: true,
        canManageChannels: true,
        canManageInvites: true,
        canManageMessages: true,
        canManageRoles: true,
        canManageServer: true,
        canUploadServerIcon: true,
      },
    );
  });

  it("maps the moderator mask to moderation capabilities only", () => {
    assert.deepEqual(
      resolveMobileServerCapabilities(access({ permissions: MODERATOR_PERMISSIONS })),
      {
        canClearHistory: true,
        canDeleteServer: false,
        canKickMembers: true,
        canManageChannels: false,
        canManageInvites: true,
        canManageMessages: true,
        canManageRoles: false,
        canManageServer: false,
        canUploadServerIcon: false,
      },
    );
  });

  it("does not infer capabilities from access level or role name", () => {
    const actor = access({ permissions: MEMBER_BASE_PERMISSIONS });
    actor.accessLevel = "OWNER";
    actor.roles[0]!.name = "Administrator";

    assert.deepEqual(resolveMobileServerCapabilities(actor), falseCapabilities);
  });

  for (const [permission, capabilityNames] of [
    [PermissionBits.CLEAR_CHANNEL_HISTORY, ["canClearHistory"]],
    [PermissionBits.KICK_MEMBERS, ["canKickMembers"]],
    [PermissionBits.MANAGE_CHANNELS, ["canManageChannels"]],
    [PermissionBits.MANAGE_INVITES, ["canManageInvites"]],
    [PermissionBits.MANAGE_MESSAGES, ["canManageMessages"]],
    [PermissionBits.MANAGE_ROLES, ["canManageRoles"]],
    [PermissionBits.MANAGE_SERVER, ["canManageServer", "canUploadServerIcon"]],
  ] as const) {
    it(`maps permission bit ${permission.toString()} only to ${capabilityNames.join(", ")}`, () => {
      const expected = { ...falseCapabilities };
      for (const capabilityName of capabilityNames) {
        expected[capabilityName] = true;
      }

      assert.deepEqual(
        resolveMobileServerCapabilities(access({ permissions: permission })),
        expected,
      );
    });
  }
});

describe("mobile member action projections", () => {
  const ordinaryTarget = {
    id: "member-target",
    roles: [
      {
        isDefault: false,
        managed: false,
        permissions: 0n,
      },
    ],
    userId: "target",
  };

  it("allows exact kick and role actions against an ordinary target", () => {
    const actor = access({
      permissions: PermissionBits.KICK_MEMBERS | PermissionBits.MANAGE_ROLES,
    });

    assert.deepEqual(resolveMobileServerMemberActions(actor, ordinaryTarget), {
      canKick: true,
      canManageRoles: true,
    });
  });

  it("suppresses self-kick and every action against the owner", () => {
    const actor = access({
      permissions: PermissionBits.KICK_MEMBERS | PermissionBits.MANAGE_ROLES,
    });

    assert.deepEqual(
      resolveMobileServerMemberActions(actor, { ...ordinaryTarget, userId: actor.userId }),
      { canKick: false, canManageRoles: true },
    );
    assert.deepEqual(
      resolveMobileServerMemberActions(actor, { ...ordinaryTarget, userId: actor.ownerId }),
      { canKick: false, canManageRoles: false },
    );
  });

  for (const protectedRole of [
    { isDefault: true, managed: false, permissions: 0n },
    { isDefault: false, managed: true, permissions: 0n },
    { isDefault: false, managed: false, permissions: PermissionBits.MANAGE_ROLES },
  ]) {
    it("suppresses role updates for a protected target when the actor is not the owner", () => {
      const actor = access({ permissions: PermissionBits.MANAGE_ROLES });

      assert.equal(
        resolveMobileServerMemberActions(actor, {
          ...ordinaryTarget,
          roles: [protectedRole],
        }).canManageRoles,
        false,
      );
    });
  }

  it("allows the owner to manage a protected non-owner target", () => {
    const owner = access({ ownerId: "owner", userId: "owner" });

    assert.deepEqual(
      resolveMobileServerMemberActions(owner, {
        ...ordinaryTarget,
        roles: [
          {
            isDefault: false,
            managed: true,
            permissions: PermissionBits.ADMINISTRATOR,
          },
        ],
      }),
      { canKick: true, canManageRoles: true },
    );
  });
});

describe("mobile member role id projection", () => {
  it("deduplicates raw authorization roles, excludes exactly default roles, and retains managed ids", () => {
    assert.deepEqual(
      mapMobileServerMemberRoleIds([
        { id: "role-default", isDefault: true, managed: false, permissions: 0n },
        { id: "role-managed", isDefault: false, managed: true, permissions: 0n },
        { id: "role-ordinary", isDefault: false, managed: false, permissions: 0n },
        { id: "role-managed", isDefault: false, managed: true, permissions: 0n },
        {
          id: "role-default-managed",
          isDefault: true,
          managed: true,
          permissions: PermissionBits.ADMINISTRATOR,
        },
      ]),
      ["role-managed", "role-ordinary"],
    );
  });

  it("fails instead of truncating more than 25 current non-default role ids", () => {
    const authorizationRoles = Array.from({ length: 26 }, (_, index) => ({
      id: `role-${index}`,
      isDefault: false,
      managed: index % 2 === 0,
      permissions: 0n,
    }));

    assert.throws(() => mapMobileServerMemberRoleIds(authorizationRoles));
  });
});
