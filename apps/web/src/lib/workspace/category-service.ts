import { prisma } from "@wizards/db";
import type {
  CreateCategoryInput,
  ReorderCategoriesInput,
  UpdateCategoryInput,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { getSocketServer } from "@/lib/socket/runtime";
import { ensureServerPermission, getAccessContext } from "@/lib/workspace/access-context";
import { PermissionBits } from "@/lib/workspace/permissions";
import { normalizeWorkspaceLabel } from "@/lib/workspace/workspace-label";

export async function createWorkspaceCategory(
  userId: string,
  serverId: string,
  input: CreateCategoryInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  const lastCategory = await prisma.channelCategory.findFirst({
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

  const category = await prisma.channelCategory.create({
    data: {
      name: normalizeWorkspaceLabel(input.name),
      position: (lastCategory?.position ?? -1) + 1,
      serverId,
    },
    select: {
      id: true,
    },
  });

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return category;
}

export async function updateWorkspaceCategory(
  userId: string,
  serverId: string,
  categoryId: string,
  input: UpdateCategoryInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  const category = await prisma.channelCategory.findFirst({
    where: {
      id: categoryId,
      serverId,
    },
    select: {
      id: true,
    },
  });

  if (!category) {
    throw new ApiError("Category not found", 404, "NOT_FOUND");
  }

  await prisma.channelCategory.update({
    where: {
      id: categoryId,
    },
    data: {
      name: normalizeWorkspaceLabel(input.name),
    },
  });

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return { success: true as const };
}

export async function deleteWorkspaceCategory(
  userId: string,
  serverId: string,
  categoryId: string,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  const category = await prisma.channelCategory.findFirst({
    where: {
      id: categoryId,
      serverId,
    },
    select: {
      id: true,
    },
  });

  if (!category) {
    throw new ApiError("Category not found", 404, "NOT_FOUND");
  }

  await prisma.$transaction([
    prisma.channel.updateMany({
      where: {
        categoryId,
        serverId,
      },
      data: {
        categoryId: null,
      },
    }),
    prisma.channelCategory.delete({
      where: {
        id: categoryId,
      },
    }),
  ]);

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return { success: true as const };
}

export async function reorderWorkspaceCategories(
  userId: string,
  serverId: string,
  items: ReorderCategoriesInput["items"],
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  const existingCategories = await prisma.channelCategory.findMany({
    where: {
      id: {
        in: items.map((item) => item.id),
      },
      serverId,
    },
    select: {
      id: true,
    },
  });

  if (existingCategories.length !== items.length) {
    throw new ApiError("One or more categories could not be found", 404);
  }

  await prisma.$transaction(
    items.map((item) =>
      prisma.channelCategory.update({
        where: {
          id: item.id,
        },
        data: {
          position: item.position,
        },
      }),
    ),
  );

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return { success: true as const };
}
