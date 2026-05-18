import type {
  WorkspaceAccessLevel,
  WorkspacePermissionKey,
  WorkspaceRole,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import {
  MEMBER_BASE_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  PermissionBits,
  SERVER_ADMIN_PERMISSIONS,
  deriveWorkspaceAccessLevel,
  permissionKeysToMask,
  permissionMaskToKeys,
  type PermissionKey,
} from "@/lib/workspace/permissions";
import type { AccessContext, RoleRecord } from "@/lib/workspace/workspace-types";

const ELEVATED_ROLE_PERMISSIONS =
  PermissionBits.ADMINISTRATOR | PermissionBits.MANAGE_ROLES | PermissionBits.MANAGE_SERVER;

export function isOwnerAccess(access: Pick<AccessContext, "ownerId" | "userId">) {
  return access.ownerId === access.userId;
}

export function isElevatedPermissions(permissions: bigint) {
  return (permissions & ELEVATED_ROLE_PERMISSIONS) !== 0n;
}

export function isProtectedRole(role: Pick<RoleRecord, "isDefault" | "managed" | "permissions">) {
  return Boolean(role.isDefault || role.managed || isElevatedPermissions(role.permissions));
}

export function toPermissionKeys(permissions: bigint): WorkspacePermissionKey[] {
  return permissionMaskToKeys(permissions) as WorkspacePermissionKey[];
}

export function toPermissionMask(keys: readonly WorkspacePermissionKey[]) {
  return permissionKeysToMask(keys as readonly PermissionKey[]);
}

export function toWorkspaceRole(role: {
  color: number;
  id: string;
  isDefault: boolean;
  managed: boolean;
  mentionable: boolean;
  name: string;
  permissions: bigint;
  position: number;
}): WorkspaceRole {
  return {
    color: role.color,
    id: role.id,
    isDefault: role.isDefault,
    managed: role.managed,
    mentionable: role.mentionable,
    name: role.name,
    permissions: toPermissionKeys(role.permissions),
    position: role.position,
  };
}

export function ensureCanWriteRolePermissions(access: AccessContext, permissions: bigint) {
  if (!isOwnerAccess(access) && isElevatedPermissions(permissions)) {
    throw new ApiError(
      "Only the server owner can grant elevated role permissions.",
      403,
      "OWNER_REQUIRED",
    );
  }
}

export function getRolePresetPermissions(name: string) {
  const normalized = name.trim().toLowerCase();

  if (normalized === "moderator") {
    return MODERATOR_PERMISSIONS;
  }

  if (normalized === "admin" || normalized === "administrator") {
    return SERVER_ADMIN_PERMISSIONS;
  }

  return MEMBER_BASE_PERMISSIONS;
}

export function mergeRoleRecords(...roleGroups: RoleRecord[][]) {
  const roles = new Map<string, RoleRecord>();

  for (const role of roleGroups.flat()) {
    roles.set(role.id, role);
  }

  return [...roles.values()];
}

export function deriveAccessLevel(
  ownerId: string,
  userId: string,
  roles: RoleRecord[],
): WorkspaceAccessLevel {
  return deriveWorkspaceAccessLevel({ ownerId, roles, userId });
}
