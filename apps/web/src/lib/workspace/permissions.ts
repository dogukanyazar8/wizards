import type { WorkspaceAccessLevel } from "@wizards/types";
import { ApiError } from "@/lib/api";

export const PermissionBits = {
  ADMINISTRATOR: 1n << 0n,
  MANAGE_SERVER: 1n << 1n,
  MANAGE_CHANNELS: 1n << 2n,
  MANAGE_ROLES: 1n << 3n,
  MANAGE_MESSAGES: 1n << 4n,
  CLEAR_CHANNEL_HISTORY: 1n << 5n,
  ATTACH_FILES: 1n << 6n,
  USE_GIFS: 1n << 7n,
  ADD_REACTIONS: 1n << 8n,
  VIEW_CHANNEL: 1n << 9n,
  SEND_MESSAGES: 1n << 10n,
  CONNECT_VOICE: 1n << 11n,
  SPEAK: 1n << 12n,
  STREAM: 1n << 13n,
  USE_VIDEO: 1n << 14n,
  MUTE_MEMBERS: 1n << 15n,
  DEAFEN_MEMBERS: 1n << 16n,
  MOVE_MEMBERS: 1n << 17n,
  MANAGE_INVITES: 1n << 18n,
  KICK_MEMBERS: 1n << 19n,
  BAN_MEMBERS: 1n << 20n,
  TIMEOUT_MEMBERS: 1n << 21n,
  VIEW_AUDIT_LOG: 1n << 22n,
} as const;

export type PermissionKey = keyof typeof PermissionBits;
export type PermissionValue = (typeof PermissionBits)[PermissionKey];

export type RolePermissionRecord = {
  id?: string;
  isDefault?: boolean | null;
  name?: string;
  permissions: bigint;
};

export type ChannelPermissionOverrideRecord = {
  allow: bigint;
  deny: bigint;
  targetId: string;
  targetType: "ROLE" | "USER";
};

export type PermissionResolutionContext = {
  memberId?: string | null;
  ownerId: string;
  roles: RolePermissionRecord[];
  userId: string;
};

export type ChannelPermissionResolutionContext = PermissionResolutionContext & {
  overrides?: ChannelPermissionOverrideRecord[];
};

const ALL_PERMISSION_VALUES = Object.values(PermissionBits);

export const PERMISSION_KEYS = Object.keys(PermissionBits) as PermissionKey[];

export const ALL_PERMISSIONS = ALL_PERMISSION_VALUES.reduce(
  (mask, permission) => mask | permission,
  0n,
);

export const SERVER_ADMIN_PERMISSIONS =
  PermissionBits.ADMINISTRATOR |
  PermissionBits.MANAGE_SERVER |
  PermissionBits.MANAGE_CHANNELS |
  PermissionBits.MANAGE_ROLES;

export const ADMIN_ACCESS_PERMISSIONS = [
  PermissionBits.ADMINISTRATOR,
  PermissionBits.MANAGE_SERVER,
  PermissionBits.MANAGE_CHANNELS,
  PermissionBits.MANAGE_ROLES,
] as const;

export const MEMBER_BASE_PERMISSIONS =
  PermissionBits.VIEW_CHANNEL |
  PermissionBits.SEND_MESSAGES |
  PermissionBits.ADD_REACTIONS |
  PermissionBits.ATTACH_FILES |
  PermissionBits.USE_GIFS |
  PermissionBits.CONNECT_VOICE |
  PermissionBits.SPEAK |
  PermissionBits.STREAM |
  PermissionBits.USE_VIDEO;

export const MODERATOR_PERMISSIONS =
  MEMBER_BASE_PERMISSIONS |
  PermissionBits.MANAGE_MESSAGES |
  PermissionBits.CLEAR_CHANNEL_HISTORY |
  PermissionBits.MANAGE_INVITES |
  PermissionBits.KICK_MEMBERS |
  PermissionBits.BAN_MEMBERS |
  PermissionBits.TIMEOUT_MEMBERS |
  PermissionBits.VIEW_AUDIT_LOG |
  PermissionBits.MUTE_MEMBERS |
  PermissionBits.DEAFEN_MEMBERS |
  PermissionBits.MOVE_MEMBERS;

export const RolePermissionPresets = {
  ADMIN: SERVER_ADMIN_PERMISSIONS,
  MEMBER: MEMBER_BASE_PERMISSIONS,
  MODERATOR: MODERATOR_PERMISSIONS,
} as const;

export function permissionKeysToMask(keys: readonly PermissionKey[]) {
  return keys.reduce((mask, key) => mask | PermissionBits[key], 0n);
}

export function permissionMaskToKeys(mask: bigint) {
  return PERMISSION_KEYS.filter((key) => (mask & PermissionBits[key]) === PermissionBits[key]);
}

function toPermissionValue(permission: PermissionKey | PermissionValue) {
  return typeof permission === "string" ? PermissionBits[permission] : permission;
}

function applyOverride(permissions: bigint, override: Pick<ChannelPermissionOverrideRecord, "allow" | "deny">) {
  return (permissions & ~override.deny) | override.allow;
}

export function combinePermissions(roles: RolePermissionRecord[]) {
  return roles.reduce((permissions, role) => permissions | role.permissions, 0n);
}

export function hasAdministratorPermission(permissions: bigint) {
  return (permissions & PermissionBits.ADMINISTRATOR) !== 0n;
}

export function hasPermission(
  permissions: bigint,
  permission: PermissionKey | PermissionValue,
) {
  const permissionValue = toPermissionValue(permission);
  return (
    hasAdministratorPermission(permissions) ||
    (permissions & permissionValue) === permissionValue
  );
}

export function hasAnyPermission(
  permissions: bigint,
  requiredPermissions: Array<PermissionKey | PermissionValue>,
) {
  return requiredPermissions.some((permission) => hasPermission(permissions, permission));
}

export function hasAllPermissions(
  permissions: bigint,
  requiredPermissions: Array<PermissionKey | PermissionValue>,
) {
  return requiredPermissions.every((permission) => hasPermission(permissions, permission));
}

export function deriveWorkspaceAccessLevel({
  ownerId,
  roles,
  userId,
}: PermissionResolutionContext): WorkspaceAccessLevel {
  if (ownerId === userId) {
    return "OWNER";
  }

  if (roles.some((role) => hasAnyPermission(role.permissions, [...ADMIN_ACCESS_PERMISSIONS]))) {
    return "ADMIN";
  }

  return "MEMBER";
}

export function resolveServerPermissions(context: PermissionResolutionContext) {
  if (context.ownerId === context.userId) {
    return ALL_PERMISSIONS;
  }

  // Existing production servers may have an empty @everyone role. Keep product
  // behavior stable by treating normal server membership as the base grant.
  const rolePermissions = combinePermissions(context.roles) | MEMBER_BASE_PERMISSIONS;
  return hasAdministratorPermission(rolePermissions) ? ALL_PERMISSIONS : rolePermissions;
}

export function resolveChannelPermissions(context: ChannelPermissionResolutionContext) {
  let permissions = resolveServerPermissions(context);

  if (hasAdministratorPermission(permissions)) {
    return permissions;
  }

  const overrides = context.overrides ?? [];
  const roleIds = new Set(context.roles.map((role) => role.id).filter(Boolean));
  const defaultRoleIds = new Set(
    context.roles
      .filter((role) => role.isDefault)
      .map((role) => role.id)
      .filter(Boolean),
  );

  for (const override of overrides) {
    if (override.targetType === "ROLE" && defaultRoleIds.has(override.targetId)) {
      permissions = applyOverride(permissions, override);
    }
  }

  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const override of overrides) {
    if (
      override.targetType === "ROLE" &&
      roleIds.has(override.targetId) &&
      !defaultRoleIds.has(override.targetId)
    ) {
      roleAllow |= override.allow;
      roleDeny |= override.deny;
    }
  }
  permissions = applyOverride(permissions, { allow: roleAllow, deny: roleDeny });

  for (const override of overrides) {
    const targetsUser = override.targetId === context.userId || override.targetId === context.memberId;
    if (override.targetType === "USER" && targetsUser) {
      permissions = applyOverride(permissions, override);
    }
  }

  return permissions;
}

export function requireServerPermission(
  context: PermissionResolutionContext,
  permission: PermissionKey | PermissionValue,
) {
  const permissions = resolveServerPermissions(context);

  if (!hasPermission(permissions, permission)) {
    throw new ApiError("You do not have permission to perform this action.", 403, "FORBIDDEN");
  }

  return permissions;
}

export function requireChannelPermission(
  context: ChannelPermissionResolutionContext,
  permission: PermissionKey | PermissionValue,
) {
  const permissions = resolveChannelPermissions(context);

  if (!hasPermission(permissions, permission)) {
    throw new ApiError("You do not have permission to access this channel.", 403, "FORBIDDEN");
  }

  return permissions;
}

export function getExplicitChannelAllowPermissions(context: ChannelPermissionResolutionContext) {
  const overrides = context.overrides ?? [];
  const nonDefaultRoleIds = new Set(
    context.roles
      .filter((role) => !role.isDefault)
      .map((role) => role.id)
      .filter(Boolean),
  );
  let allow = 0n;

  for (const override of overrides) {
    const targetsAssignedRole =
      override.targetType === "ROLE" && nonDefaultRoleIds.has(override.targetId);
    const targetsMember =
      override.targetType === "USER" &&
      (override.targetId === context.userId || override.targetId === context.memberId);

    if (targetsAssignedRole || targetsMember) {
      allow |= override.allow;
    }
  }

  return allow;
}

export function hasExplicitChannelAllow(
  context: ChannelPermissionResolutionContext,
  permission: PermissionKey | PermissionValue,
) {
  return hasPermission(getExplicitChannelAllowPermissions(context), permission);
}

export function canUseLockedChannelPermission(
  context: ChannelPermissionResolutionContext,
  permission: PermissionKey | PermissionValue,
) {
  const permissions = resolveChannelPermissions(context);

  if (!hasPermission(permissions, permission)) {
    return false;
  }

  if (hasAnyPermission(permissions, [...ADMIN_ACCESS_PERMISSIONS])) {
    return true;
  }

  return hasExplicitChannelAllow(context, permission);
}
