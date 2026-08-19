import { logError } from "@/lib/logger";
import { publishPermissionCacheRevision } from "@/lib/workspace/permission-cache";

export type CommittedAuthorizationRevision = {
  memberVersion?: string;
  serverId: string;
  serverVersion: string;
  userId?: string;
};

/**
 * Fast-path publication only. Security already comes from the committed DB
 * revision; failure leaves the transactionally-created outbox job pending.
 */
export async function publishCommittedAuthorizationRevision(
  revision: CommittedAuthorizationRevision,
) {
  try {
    if (!(await publishPermissionCacheRevision(revision))) {
      logError("[permission-cache] Revision publication deferred to outbox", {
        serverId: revision.serverId,
        userId: revision.userId ?? null,
      });
      return "deferred" as const;
    }
    return "published" as const;
  } catch (error) {
    logError("[permission-cache] Revision publication failed; outbox retry remains pending", error);
    return "deferred" as const;
  }
}
