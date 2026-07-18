import {
  MobilePermissionKeySchema,
  type MobilePermissionKey,
  type MobileServerRole,
} from "@wizards/types";

const MOBILE_PERMISSION_KEY_SET = new Set<string>(MobilePermissionKeySchema.options);

// Maps a service WorkspaceRole (permissions expressed as string keys) into the
// strict mobile role payload, dropping any web-only permission keys the mobile
// enum does not model so the response schema parse always succeeds.
export function toMobileServerRole(role: {
  color: number;
  id: string;
  isDefault: boolean;
  managed: boolean;
  mentionable: boolean;
  name: string;
  permissions: readonly string[];
  position: number;
}): MobileServerRole {
  return {
    color: role.color,
    id: role.id,
    isDefault: role.isDefault,
    managed: role.managed,
    mentionable: role.mentionable,
    name: role.name,
    permissionKeys: role.permissions.filter((key): key is MobilePermissionKey =>
      MOBILE_PERMISSION_KEY_SET.has(key),
    ),
    position: role.position,
  };
}
