import { prisma } from "@wizards/db";
import type { Prisma } from "@wizards/db";
import type { CreateWorkspaceRoleInput, UpdateWorkspaceRoleInput } from "@wizards/types";

import { ApiError } from "@/lib/api";
import { getSocketServer } from "@/lib/socket/runtime";
import { ensureServerPermission, getAccessContext } from "@/lib/workspace/access-context";
import { invalidateServerPermissionCache } from "@/lib/workspace/permission-cache";
import { PermissionBits } from "@/lib/workspace/permissions";
import {
  ensureCanWriteRolePermissions,
  getRolePresetPermissions,
  isElevatedPermissions,
  isOwnerAccess,
  isProtectedRole,
  toPermissionMask,
  toWorkspaceRole,
} from "@/lib/workspace/role-helpers";
import { DEFAULT_ROLE_COLOR } from "@/lib/workspace/workspace-constants";
import { normalizeWorkspaceLabel } from "@/lib/workspace/workspace-label";

const MOBILE_ASSIGNABLE_ROLE_LIMIT = 100;

export async function listWorkspaceRoles(userId: string, serverId: string) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_ROLES);

  const roles = await prisma.role.findMany({
    orderBy: [
      {
        position: "desc",
      },
      {
        createdAt: "asc",
      },
    ],
    select: {
      color: true,
      id: true,
      isDefault: true,
      managed: true,
      mentionable: true,
      name: true,
      permissions: true,
      position: true,
    },
    where: {
      serverId,
    },
  });

  return roles.map(toWorkspaceRole);
}

export async function listAssignableWorkspaceRoles(userId: string, serverId: string) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_ROLES);

  const roles = await prisma.role.findMany({
    orderBy: [
      {
        position: "desc",
      },
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
    select: {
      color: true,
      id: true,
      isDefault: true,
      managed: true,
      name: true,
      permissions: true,
      position: true,
    },
    where: {
      serverId,
    },
    take: MOBILE_ASSIGNABLE_ROLE_LIMIT + 1,
  });

  if (roles.length > MOBILE_ASSIGNABLE_ROLE_LIMIT) {
    throw new ApiError(
      "Mobile role list exceeds the supported limit",
      409,
      "MOBILE_RESPONSE_LIMIT_EXCEEDED",
    );
  }

  return roles
    .filter(
      (role) =>
        !role.isDefault &&
        !role.managed &&
        (isOwnerAccess(access) || !isElevatedPermissions(role.permissions)),
    )
    .map(({ color, id, name, position }) => ({ color, id, name, position }));
}

export async function createWorkspaceRole(
  userId: string,
  serverId: string,
  input: CreateWorkspaceRoleInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_ROLES);

  const normalizedName = normalizeWorkspaceLabel(input.name);
  if (!normalizedName) {
    throw new ApiError("Role name must include at least one letter or number", 400);
  }

  const permissions =
    input.permissions.length > 0
      ? toPermissionMask(input.permissions)
      : getRolePresetPermissions(normalizedName);
  ensureCanWriteRolePermissions(access, permissions);

  const lastRole = await prisma.role.findFirst({
    orderBy: {
      position: "desc",
    },
    select: {
      position: true,
    },
    where: {
      serverId,
    },
  });

  const role = await prisma.role.create({
    data: {
      color: input.color ?? DEFAULT_ROLE_COLOR,
      isDefault: false,
      managed: false,
      mentionable: input.mentionable ?? false,
      name: normalizedName,
      permissions,
      position: (lastRole?.position ?? 0) + 1,
      serverId,
    },
    select: {
      color: true,
      id: true,
      isDefault: true,
      managed: true,
      mentionable: true,
      name: true,
      permissions: true,
      position: true,
    },
  });

  await invalidateServerPermissionCache(serverId);

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return toWorkspaceRole(role);
}

export async function updateWorkspaceRole(
  userId: string,
  serverId: string,
  roleId: string,
  input: UpdateWorkspaceRoleInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_ROLES);

  const role = await prisma.role.findFirst({
    select: {
      color: true,
      id: true,
      isDefault: true,
      managed: true,
      mentionable: true,
      name: true,
      permissions: true,
      position: true,
    },
    where: {
      id: roleId,
      serverId,
    },
  });

  if (!role) {
    throw new ApiError("Role not found", 404);
  }

  if (isProtectedRole(role)) {
    throw new ApiError("Protected roles cannot be edited from this panel.", 403, "PROTECTED_ROLE");
  }

  const data: Prisma.RoleUpdateInput = {};

  if (input.name !== undefined) {
    const normalizedName = normalizeWorkspaceLabel(input.name);
    if (!normalizedName) {
      throw new ApiError("Role name must include at least one letter or number", 400);
    }
    data.name = normalizedName;
  }

  if (input.color !== undefined) {
    data.color = input.color;
  }

  if (input.mentionable !== undefined) {
    data.mentionable = input.mentionable;
  }

  if (input.permissions !== undefined) {
    const permissions = toPermissionMask(input.permissions);
    ensureCanWriteRolePermissions(access, permissions);
    data.permissions = permissions;
  }

  const updatedRole = await prisma.role.update({
    data,
    select: {
      color: true,
      id: true,
      isDefault: true,
      managed: true,
      mentionable: true,
      name: true,
      permissions: true,
      position: true,
    },
    where: {
      id: roleId,
    },
  });

  await invalidateServerPermissionCache(serverId);

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return toWorkspaceRole(updatedRole);
}

export async function deleteWorkspaceRole(userId: string, serverId: string, roleId: string) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_ROLES);

  const role = await prisma.role.findFirst({
    select: {
      id: true,
      isDefault: true,
      managed: true,
      permissions: true,
    },
    where: {
      id: roleId,
      serverId,
    },
  });

  if (!role) {
    throw new ApiError("Role not found", 404);
  }

  if (isProtectedRole(role)) {
    throw new ApiError("Protected roles cannot be deleted.", 403, "PROTECTED_ROLE");
  }

  await prisma.role.delete({
    where: {
      id: roleId,
    },
  });

  await invalidateServerPermissionCache(serverId);

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return { success: true as const };
}
