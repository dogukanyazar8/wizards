import { ChannelType, PermissionTargetType } from "@wizards/db";
import type { Prisma } from "@wizards/db";
import type {
  WorkspaceChannelPermissionPreset,
  WorkspaceChannelPermissionSettings,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { PermissionBits } from "@/lib/workspace/permissions";
import type { RoleRecord } from "@/lib/workspace/workspace-types";

function getChannelInteractionPermissions(type: ChannelType) {
  if (type === ChannelType.VOICE) {
    return (
      PermissionBits.CONNECT_VOICE |
      PermissionBits.SPEAK |
      PermissionBits.STREAM |
      PermissionBits.USE_VIDEO
    );
  }

  return (
    PermissionBits.SEND_MESSAGES |
    PermissionBits.ATTACH_FILES |
    PermissionBits.USE_GIFS |
    PermissionBits.ADD_REACTIONS
  );
}

export function getChannelPresetPermissions(
  type: ChannelType,
  preset: WorkspaceChannelPermissionPreset,
) {
  const interactionPermissions = getChannelInteractionPermissions(type);
  const visiblePermissions = PermissionBits.VIEW_CHANNEL;
  const controlledPermissions = visiblePermissions | interactionPermissions;

  if (preset === "PUBLIC") {
    return {
      controlledPermissions,
      everyoneAllow: 0n,
      everyoneDeny: 0n,
      roleAllow: 0n,
    };
  }

  if (preset === "LOCKED_VISIBLE") {
    return {
      controlledPermissions,
      everyoneAllow: visiblePermissions,
      everyoneDeny: interactionPermissions,
      roleAllow: 0n,
    };
  }

  const roleAllow = controlledPermissions;
  return {
    controlledPermissions,
    everyoneAllow: 0n,
    everyoneDeny: controlledPermissions,
    roleAllow: preset === "ROLE_GATED" ? roleAllow : 0n,
  };
}

export function mergeControlledPermissionOverride(args: {
  allow: bigint;
  controlledPermissions: bigint;
  deny: bigint;
  nextAllow: bigint;
  nextDeny: bigint;
}) {
  return {
    allow: (args.allow & ~args.controlledPermissions) | args.nextAllow,
    deny: (args.deny & ~args.controlledPermissions) | args.nextDeny,
  };
}

export function inferChannelPermissionSettings(args: {
  defaultRoleId: string | null;
  locked: boolean;
  overrides: Array<{
    allow: bigint;
    deny: bigint;
    targetId: string;
    targetType: "ROLE" | "USER";
  }>;
  type: ChannelType;
}): WorkspaceChannelPermissionSettings {
  const interactionPermissions = getChannelInteractionPermissions(args.type);
  const controlledPermissions = PermissionBits.VIEW_CHANNEL | interactionPermissions;
  const defaultOverride = args.defaultRoleId
    ? args.overrides.find(
        (override) => override.targetType === "ROLE" && override.targetId === args.defaultRoleId,
      )
    : null;
  const allowedRoleIds = args.overrides
    .filter(
      (override) =>
        override.targetType === "ROLE" &&
        override.targetId !== args.defaultRoleId &&
        (override.allow & controlledPermissions) !== 0n,
    )
    .map((override) => override.targetId);

  if (defaultOverride && (defaultOverride.deny & PermissionBits.VIEW_CHANNEL) !== 0n) {
    return {
      allowedRoleIds,
      preset: allowedRoleIds.length > 0 ? "ROLE_GATED" : "PRIVATE",
    };
  }

  if (defaultOverride && (defaultOverride.deny & interactionPermissions) !== 0n) {
    return {
      allowedRoleIds,
      preset: "LOCKED_VISIBLE",
    };
  }

  if (args.locked && allowedRoleIds.length > 0) {
    return {
      allowedRoleIds,
      preset: "ROLE_GATED",
    };
  }

  if (args.locked) {
    return {
      allowedRoleIds,
      preset: "LOCKED_VISIBLE",
    };
  }

  return {
    allowedRoleIds,
    preset: "PUBLIC",
  };
}

type ChannelPermissionRoleRecord = Pick<RoleRecord, "id" | "isDefault" | "managed" | "permissions">;

export type ChannelPermissionOverrideRecord = {
  allow: bigint;
  deny: bigint;
  targetId: string;
  targetType: "ROLE" | "USER";
};

export function prepareChannelPermissionMutation(args: {
  input: WorkspaceChannelPermissionSettings;
  roles: ChannelPermissionRoleRecord[];
  type: ChannelType;
}) {
  const defaultRole = args.roles.find((role) => role.isDefault) ?? null;
  if (!defaultRole) {
    throw new ApiError("Default role is missing for this server.", 500, "DEFAULT_ROLE_MISSING");
  }

  const allowedRoleIds = Array.from(new Set(args.input.allowedRoleIds));
  const allowedRoles = args.roles.filter((role) => allowedRoleIds.includes(role.id));

  if (allowedRoles.length !== allowedRoleIds.length) {
    throw new ApiError("One or more roles could not be found.", 404, "ROLE_NOT_FOUND");
  }

  if (allowedRoles.some((role) => role.isDefault || role.managed)) {
    throw new ApiError("Protected roles cannot be used for channel gates.", 403, "PROTECTED_ROLE");
  }

  if (args.input.preset === "ROLE_GATED" && allowedRoleIds.length === 0) {
    throw new ApiError("Choose at least one role for role-gated access.", 400, "ROLE_REQUIRED");
  }

  return {
    allowedRoleIds,
    defaultRole,
    nextLocked: args.input.preset !== "PUBLIC",
    presetPermissions: getChannelPresetPermissions(args.type, args.input.preset),
  };
}

export async function applyChannelPermissionMutation(
  tx: Prisma.TransactionClient,
  args: {
    allowedRoleIds: string[];
    channelId: string;
    defaultRoleId: string;
    existingRoleOverrides: ChannelPermissionOverrideRecord[];
    presetPermissions: ReturnType<typeof getChannelPresetPermissions>;
  },
) {
  const targetRoleIds = new Set([
    args.defaultRoleId,
    ...args.allowedRoleIds,
    ...args.existingRoleOverrides.map((override) => override.targetId),
  ]);

  for (const targetId of targetRoleIds) {
    const existing = args.existingRoleOverrides.find((override) => override.targetId === targetId);
    const isDefaultTarget = targetId === args.defaultRoleId;
    const isAllowedTarget = args.allowedRoleIds.includes(targetId);
    const next = mergeControlledPermissionOverride({
      allow: existing?.allow ?? 0n,
      controlledPermissions: args.presetPermissions.controlledPermissions,
      deny: existing?.deny ?? 0n,
      nextAllow: isDefaultTarget
        ? args.presetPermissions.everyoneAllow
        : isAllowedTarget
          ? args.presetPermissions.roleAllow
          : 0n,
      nextDeny: isDefaultTarget ? args.presetPermissions.everyoneDeny : 0n,
    });

    const where = {
      channelId_targetId_targetType: {
        channelId: args.channelId,
        targetId,
        targetType: PermissionTargetType.ROLE,
      },
    };

    if (next.allow === 0n && next.deny === 0n) {
      if (existing) {
        await tx.channelPermissionOverride.delete({ where });
      }
      continue;
    }

    await tx.channelPermissionOverride.upsert({
      create: {
        allow: next.allow,
        channelId: args.channelId,
        deny: next.deny,
        targetId,
        targetType: PermissionTargetType.ROLE,
      },
      update: {
        allow: next.allow,
        deny: next.deny,
      },
      where,
    });
  }
}
