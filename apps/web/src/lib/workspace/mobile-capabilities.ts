import { MobileServerMemberSchema, type MobileServerCapabilities } from "@wizards/types";

import { PermissionBits, hasPermission, resolveServerPermissions } from "./permissions";
import { isElevatedPermissions, isOwnerAccess } from "./role-helpers";
import type { AccessContext } from "./workspace-types";

type MobileAuthorizationRole = {
  id: string;
  isDefault: boolean;
  managed: boolean;
  permissions: bigint;
};

export function resolveMobileServerCapabilities(access: AccessContext): MobileServerCapabilities {
  const permissions = resolveServerPermissions(access);
  const canManageServer = hasPermission(permissions, PermissionBits.MANAGE_SERVER);

  return {
    canClearHistory: hasPermission(permissions, PermissionBits.CLEAR_CHANNEL_HISTORY),
    canDeleteServer: isOwnerAccess(access),
    canKickMembers: hasPermission(permissions, PermissionBits.KICK_MEMBERS),
    canManageChannels: hasPermission(permissions, PermissionBits.MANAGE_CHANNELS),
    canManageInvites: hasPermission(permissions, PermissionBits.MANAGE_INVITES),
    canManageMessages: hasPermission(permissions, PermissionBits.MANAGE_MESSAGES),
    canManageRoles: hasPermission(permissions, PermissionBits.MANAGE_ROLES),
    canManageServer,
    canUploadServerIcon: canManageServer,
  };
}

export function resolveMobileServerMemberActions(
  access: AccessContext,
  target: {
    id: string;
    roles: readonly Omit<MobileAuthorizationRole, "id">[];
    userId: string;
  },
) {
  const permissions = resolveServerPermissions(access);
  const targetIsOwner = target.userId === access.ownerId;
  const targetHasProtectedRole = target.roles.some(
    (role) => role.isDefault || role.managed || isElevatedPermissions(role.permissions),
  );

  return {
    canKick:
      hasPermission(permissions, PermissionBits.KICK_MEMBERS) &&
      target.userId !== access.userId &&
      !targetIsOwner,
    canManageRoles:
      hasPermission(permissions, PermissionBits.MANAGE_ROLES) &&
      !targetIsOwner &&
      (isOwnerAccess(access) || !targetHasProtectedRole),
  };
}

export function mapMobileServerMemberRoleIds(
  authorizationRoles: readonly MobileAuthorizationRole[],
): string[] {
  const roleIds = Array.from(
    new Set(authorizationRoles.filter((role) => !role.isDefault).map((role) => role.id)),
  );

  return MobileServerMemberSchema.shape.roleIds.parse(roleIds);
}
