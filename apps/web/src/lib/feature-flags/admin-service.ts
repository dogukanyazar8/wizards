import type { AnalyticsClientType } from "@wizards/db";
import { prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { writeAdminAuditLog } from "@/lib/admin/access";
import { getSocketServer } from "@/lib/socket/runtime";
import { listFeatureFlags, type FeatureFlagStore } from "@/lib/feature-flags/service";

export type FeatureFlagUpdate = {
  clientTypes?: AnalyticsClientType[];
  description?: string | null;
  enabled?: boolean;
  rolloutPercent?: number;
};

export type FeatureFlagAdminDependencies = {
  broadcastChange(key: string): void;
  findFlag(key: string): Promise<{
    clientTypes: AnalyticsClientType[];
    description: string | null;
    enabled: boolean;
    rolloutPercent: number;
  } | null>;
  updateFlag(
    key: string,
    update: FeatureFlagUpdate & { updatedById: string },
  ): Promise<{
    clientTypes: AnalyticsClientType[];
    description: string | null;
    enabled: boolean;
    key: string;
    rolloutPercent: number;
  }>;
  writeAuditLog: typeof writeAdminAuditLog;
};

const defaultDependencies: FeatureFlagAdminDependencies = {
  broadcastChange: (key) => {
    getSocketServer()?.emit("feature-flags:changed", { key });
  },
  findFlag: (key) =>
    prisma.featureFlag.findUnique({
      where: { key },
      select: { clientTypes: true, description: true, enabled: true, rolloutPercent: true },
    }),
  updateFlag: (key, update) =>
    prisma.featureFlag.update({
      data: {
        ...(update.clientTypes === undefined ? {} : { clientTypes: update.clientTypes }),
        ...(update.description === undefined ? {} : { description: update.description }),
        ...(update.enabled === undefined ? {} : { enabled: update.enabled }),
        ...(update.rolloutPercent === undefined ? {} : { rolloutPercent: update.rolloutPercent }),
        updatedById: update.updatedById,
      },
      where: { key },
      select: {
        clientTypes: true,
        description: true,
        enabled: true,
        key: true,
        rolloutPercent: true,
      },
    }),
  writeAuditLog: writeAdminAuditLog,
};

/**
 * Every change is audited with both sides of it: a kill switch is only useful
 * if the trail says what it was before someone flipped it.
 */
export async function updateFeatureFlag(
  args: {
    adminUserId: string;
    headers?: Headers | Record<string, string | string[] | undefined> | null;
    key: string;
    update: FeatureFlagUpdate;
  },
  dependencies: FeatureFlagAdminDependencies = defaultDependencies,
) {
  if (
    args.update.rolloutPercent !== undefined &&
    (args.update.rolloutPercent < 0 || args.update.rolloutPercent > 100)
  ) {
    throw new ApiError("Rollout must be between 0 and 100.", 400, "INVALID_ROLLOUT");
  }

  const before = await dependencies.findFlag(args.key);

  if (!before) {
    throw new ApiError("Feature flag not found.", 404, "NOT_FOUND");
  }

  const flag = await dependencies.updateFlag(args.key, {
    ...args.update,
    updatedById: args.adminUserId,
  });

  await dependencies.writeAuditLog({
    action: "flag.update",
    adminUserId: args.adminUserId,
    ...(args.headers === undefined ? {} : { headers: args.headers }),
    metadata: {
      after: {
        clientTypes: flag.clientTypes,
        enabled: flag.enabled,
        rolloutPercent: flag.rolloutPercent,
      },
      before: {
        clientTypes: before.clientTypes,
        enabled: before.enabled,
        rolloutPercent: before.rolloutPercent,
      },
    },
    targetId: args.key,
    targetType: "FeatureFlag",
  });

  dependencies.broadcastChange(args.key);

  return flag;
}

export async function listAdminFeatureFlags(client?: FeatureFlagStore) {
  return client ? listFeatureFlags(client) : listFeatureFlags();
}
