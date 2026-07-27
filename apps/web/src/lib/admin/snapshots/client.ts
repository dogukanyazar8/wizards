import type { PrismaClient } from "@wizards/db";

/**
 * The delegates the admin snapshot loaders are allowed to touch. Narrowing the
 * client here is what makes the query-isolation test meaningful: a loader can
 * only reach a table it declares, and a test double only has to implement the
 * delegates of the loader under test.
 */
export type AdminSnapshotClient = Pick<
  PrismaClient,
  | "adminAuditLog"
  | "appSession"
  | "attachment"
  | "channel"
  | "dMMessage"
  | "mediaUsageSession"
  | "message"
  | "notificationCampaign"
  | "server"
  | "user"
  | "userDailyMetric"
>;

/**
 * Every loader resolves its own window from the same instant so the merged
 * snapshot keeps a single `generatedAt` instead of one timestamp per query.
 */
export type AdminSnapshotInput = {
  days: number | string | null | undefined;
  now: Date;
};
