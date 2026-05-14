import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALL_PERMISSIONS,
  MEMBER_BASE_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  PermissionBits,
  RolePermissionPresets,
  SERVER_ADMIN_PERMISSIONS,
  canUseLockedChannelPermission,
  deriveWorkspaceAccessLevel,
  hasAllPermissions,
  hasExplicitChannelAllow,
  hasPermission,
  permissionKeysToMask,
  permissionMaskToKeys,
  requireChannelPermission,
  requireServerPermission,
  resolveChannelPermissions,
  resolveServerPermissions,
} from "./permissions";

describe("workspace permissions", () => {
  it("keeps the legacy admin seed mask stable for existing servers", () => {
    assert.equal(SERVER_ADMIN_PERMISSIONS, 15n);
    assert.equal(RolePermissionPresets.ADMIN, SERVER_ADMIN_PERMISSIONS);
  });

  it("grants administrator roles every permission without setting every bit", () => {
    assert.equal(hasPermission(SERVER_ADMIN_PERMISSIONS, PermissionBits.MANAGE_MESSAGES), true);
    assert.equal(hasPermission(SERVER_ADMIN_PERMISSIONS, PermissionBits.CONNECT_VOICE), true);
    assert.equal(hasPermission(SERVER_ADMIN_PERMISSIONS, PermissionBits.MENTION_EVERYONE), true);
    assert.equal(
      resolveServerPermissions({
        ownerId: "owner",
        roles: [{ id: "admin", name: "Admin", permissions: SERVER_ADMIN_PERMISSIONS }],
        userId: "admin-user",
      }),
      ALL_PERMISSIONS,
    );
  });

  it("keeps moderator permissions out of server administration", () => {
    assert.equal(hasPermission(MODERATOR_PERMISSIONS, PermissionBits.MANAGE_MESSAGES), true);
    assert.equal(hasPermission(MODERATOR_PERMISSIONS, PermissionBits.KICK_MEMBERS), true);
    assert.equal(hasPermission(MODERATOR_PERMISSIONS, PermissionBits.MENTION_EVERYONE), true);
    assert.equal(hasPermission(MODERATOR_PERMISSIONS, PermissionBits.MANAGE_SERVER), false);
    assert.equal(hasPermission(MODERATOR_PERMISSIONS, PermissionBits.MANAGE_ROLES), false);
    assert.equal(
      deriveWorkspaceAccessLevel({
        ownerId: "owner",
        roles: [{ id: "moderator", name: "Moderator", permissions: MODERATOR_PERMISSIONS }],
        userId: "moderator-user",
      }),
      "MEMBER",
    );
  });

  it("derives owner access from ownership instead of assigned roles", () => {
    assert.equal(
      deriveWorkspaceAccessLevel({
        ownerId: "owner",
        roles: [],
        userId: "owner",
      }),
      "OWNER",
    );
    assert.equal(
      resolveServerPermissions({
        ownerId: "owner",
        roles: [],
        userId: "owner",
      }),
      ALL_PERMISSIONS,
    );
  });

  it("defines the member baseline without management permissions", () => {
    assert.equal(
      hasAllPermissions(MEMBER_BASE_PERMISSIONS, [
        PermissionBits.VIEW_CHANNEL,
        PermissionBits.SEND_MESSAGES,
        PermissionBits.CONNECT_VOICE,
        PermissionBits.SPEAK,
      ]),
      true,
    );
    assert.equal(hasPermission(MEMBER_BASE_PERMISSIONS, PermissionBits.MANAGE_MESSAGES), false);
    assert.equal(hasPermission(MEMBER_BASE_PERMISSIONS, PermissionBits.MANAGE_CHANNELS), false);
    assert.equal(hasPermission(MEMBER_BASE_PERMISSIONS, PermissionBits.MENTION_EVERYONE), false);
  });

  it("round-trips permission keys for role and channel permission UI", () => {
    const keys = ["VIEW_CHANNEL", "CONNECT_VOICE", "SPEAK", "STREAM"] as const;
    const mask = permissionKeysToMask(keys);

    assert.equal(mask, 14_848n);
    assert.deepEqual(permissionMaskToKeys(mask), [...keys]);
  });

  it("keeps legacy members usable even when @everyone has not been backfilled yet", () => {
    const permissions = resolveServerPermissions({
      ownerId: "owner",
      roles: [],
      userId: "legacy-member",
    });

    assert.equal(hasPermission(permissions, PermissionBits.VIEW_CHANNEL), true);
    assert.equal(hasPermission(permissions, PermissionBits.SEND_MESSAGES), true);
    assert.equal(hasPermission(permissions, PermissionBits.CONNECT_VOICE), true);
    assert.equal(hasPermission(permissions, PermissionBits.MANAGE_SERVER), false);
  });

  it("applies channel overrides in default role, role, then member order", () => {
    const roles = [
      {
        id: "everyone",
        isDefault: true,
        name: "@everyone",
        permissions: MEMBER_BASE_PERMISSIONS,
      },
      {
        id: "speaker",
        name: "Speaker",
        permissions: 0n,
      },
    ];

    const permissions = resolveChannelPermissions({
      memberId: "member",
      ownerId: "owner",
      roles,
      userId: "user",
      overrides: [
        {
          allow: 0n,
          deny: PermissionBits.CONNECT_VOICE,
          targetId: "everyone",
          targetType: "ROLE",
        },
        {
          allow: PermissionBits.CONNECT_VOICE,
          deny: 0n,
          targetId: "speaker",
          targetType: "ROLE",
        },
        {
          allow: 0n,
          deny: PermissionBits.SPEAK,
          targetId: "member",
          targetType: "USER",
        },
      ],
    });

    assert.equal(hasPermission(permissions, PermissionBits.VIEW_CHANNEL), true);
    assert.equal(hasPermission(permissions, PermissionBits.CONNECT_VOICE), true);
    assert.equal(hasPermission(permissions, PermissionBits.SPEAK), false);
  });

  it("throws consistent API errors from require helpers", () => {
    assert.throws(
      () =>
        requireServerPermission(
          {
            ownerId: "owner",
            roles: [],
            userId: "member",
          },
          PermissionBits.MANAGE_SERVER,
        ),
      /permission/,
    );

    assert.throws(
      () =>
        requireChannelPermission(
          {
            ownerId: "owner",
            roles: [{ id: "everyone", isDefault: true, permissions: MEMBER_BASE_PERMISSIONS }],
            userId: "member",
            overrides: [
              {
                allow: 0n,
                deny: PermissionBits.CONNECT_VOICE,
                targetId: "everyone",
                targetType: "ROLE",
              },
            ],
          },
          PermissionBits.CONNECT_VOICE,
        ),
      /permission/,
    );
  });

  it("requires explicit role or member allow before a locked channel can be used", () => {
    const baseContext = {
      memberId: "member",
      ownerId: "owner",
      roles: [
        {
          id: "everyone",
          isDefault: true,
          name: "@everyone",
          permissions: MEMBER_BASE_PERMISSIONS,
        },
        {
          id: "voice-access",
          name: "Voice Access",
          permissions: 0n,
        },
      ],
      userId: "user",
    };

    const deniedContext = {
      ...baseContext,
      overrides: [
        {
          allow: 0n,
          deny: PermissionBits.CONNECT_VOICE,
          targetId: "everyone",
          targetType: "ROLE" as const,
        },
      ],
    };

    assert.equal(canUseLockedChannelPermission(deniedContext, PermissionBits.CONNECT_VOICE), false);

    const allowedContext = {
      ...deniedContext,
      overrides: [
        ...deniedContext.overrides,
        {
          allow: PermissionBits.CONNECT_VOICE,
          deny: 0n,
          targetId: "voice-access",
          targetType: "ROLE" as const,
        },
      ],
    };

    assert.equal(hasExplicitChannelAllow(allowedContext, PermissionBits.CONNECT_VOICE), true);
    assert.equal(canUseLockedChannelPermission(allowedContext, PermissionBits.CONNECT_VOICE), true);
  });
});
