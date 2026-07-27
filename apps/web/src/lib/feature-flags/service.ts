import { createHash } from "node:crypto";
import type { AnalyticsClientType, PrismaClient } from "@wizards/db";
import { prisma } from "@wizards/db";

export type FeatureFlagRecord = {
  clientTypes: AnalyticsClientType[];
  enabled: boolean;
  key: string;
  rolloutPercent: number;
};

export type FeatureFlagStore = Pick<PrismaClient, "featureFlag">;

/**
 * Stable per person and per flag: the same pair always lands in the same
 * bucket, so a rollout never flickers a feature on and off between requests.
 */
export function getFlagRolloutBucket(key: string, userId: string) {
  const digest = createHash("sha256").update(`${key}:${userId}`).digest();

  return digest.readUInt32BE(0) % 100;
}

export function isFeatureFlagOnForUser(
  flag: FeatureFlagRecord,
  args: { clientType: AnalyticsClientType; userId: string | null },
) {
  if (!flag.enabled) {
    return false;
  }

  if (flag.clientTypes.length > 0 && !flag.clientTypes.includes(args.clientType)) {
    return false;
  }

  const rollout = Math.min(100, Math.max(0, flag.rolloutPercent));

  if (rollout >= 100) {
    return true;
  }

  if (rollout <= 0 || args.userId === null) {
    return false;
  }

  return getFlagRolloutBucket(flag.key, args.userId) < rollout;
}

export function evaluateFlags(
  flags: FeatureFlagRecord[],
  args: { clientType: AnalyticsClientType; userId: string | null },
) {
  return Object.fromEntries(flags.map((flag) => [flag.key, isFeatureFlagOnForUser(flag, args)]));
}

export async function evaluateFlagsForUser(
  args: { clientType: AnalyticsClientType; userId: string | null },
  client: FeatureFlagStore = prisma,
) {
  const flags = await client.featureFlag.findMany({
    orderBy: { key: "asc" },
    select: { clientTypes: true, enabled: true, key: true, rolloutPercent: true },
  });

  return evaluateFlags(flags, args);
}

export async function listFeatureFlags(client: FeatureFlagStore = prisma) {
  const flags = await client.featureFlag.findMany({
    orderBy: { key: "asc" },
    select: {
      clientTypes: true,
      description: true,
      enabled: true,
      key: true,
      rolloutPercent: true,
      updatedAt: true,
      updatedBy: { select: { displayName: true, id: true, username: true } },
    },
  });

  return flags.map((flag) => ({
    clientTypes: flag.clientTypes,
    description: flag.description,
    enabled: flag.enabled,
    key: flag.key,
    rolloutPercent: flag.rolloutPercent,
    updatedAt: flag.updatedAt.toISOString(),
    updatedBy: flag.updatedBy
      ? {
          displayName: flag.updatedBy.displayName ?? flag.updatedBy.username,
          id: flag.updatedBy.id,
          username: flag.updatedBy.username,
        }
      : null,
  }));
}

export type AdminFeatureFlag = Awaited<ReturnType<typeof listFeatureFlags>>[number];
