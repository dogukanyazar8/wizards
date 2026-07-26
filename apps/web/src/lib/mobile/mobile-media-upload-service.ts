import { MobileMediaUploadPurpose, prisma } from "@wizards/db";
import {
  MobileMediaClaimResponseSchema,
  MobileMediaUploadCompletionResponseSchema,
  type MobileMediaClaimResponse,
  type MobileMediaUploadCompletionResponse,
  // Aliased so it does not collide with the Prisma enum of the same name.
  type MobileMediaUploadPurpose as MobileMediaUploadPublicPurpose,
} from "@wizards/types";
import { UTApi } from "uploadthing/server";

import { broadcastUserProfileUpdate, mapVisiblePresenceStatus } from "@/lib/account/service";
import { ApiError } from "@/lib/api";
import { logWarning } from "@/lib/logger";
import type { UserProfileUpdatedPayload } from "@/lib/socket/events";
import { getSocketServer } from "@/lib/socket/runtime";
import { ensureServerPermission, getAccessContextWithClient } from "@/lib/workspace/access-context";
import { PermissionBits } from "@/lib/workspace/permissions";
import type { VerifiedMobileImage } from "./mobile-media-verifier";

const CLAIM_TTL_MS = 15 * 60 * 1000;
const CLEANUP_BATCH_LIMIT = 25;
const CLEANUP_LEASE_MS = 5 * 60 * 1000;
const OPPORTUNISTIC_CLEANUP_TIMEOUT_MS = 1_000;

export type MobileMediaRecordDependencies = {
  client: Pick<typeof prisma, "mobileMediaUpload">;
  logWarning?: (scope: string, error: unknown) => void;
  now: () => Date;
  opportunisticCleanup?: () => Promise<void>;
};

const defaultRecordDependencies: MobileMediaRecordDependencies = {
  client: prisma,
  logWarning,
  now: () => new Date(),
  opportunisticCleanup: () => runOpportunisticMobileMediaCleanup(),
};

export type MobileMediaClaimDependencies = {
  broadcastProfile: (profile: UserProfileUpdatedPayload) => Promise<void>;
  broadcastServer: (serverId: string) => Promise<void>;
  client: Pick<typeof prisma, "$transaction">;
  logWarning?: (scope: string, error: unknown) => void;
  now: () => Date;
  opportunisticCleanup?: () => Promise<void>;
};

const defaultClaimDependencies: MobileMediaClaimDependencies = {
  broadcastProfile: broadcastUserProfileUpdate,
  async broadcastServer(serverId) {
    getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", { serverId });
  },
  client: prisma,
  logWarning,
  now: () => new Date(),
  opportunisticCleanup: () => runOpportunisticMobileMediaCleanup(),
};

export type MobileMediaCleanupDependencies = {
  client: Pick<typeof prisma, "mobileMediaUpload">;
  deleteStorageObject: (storageKey: string) => Promise<void>;
  logWarning: (scope: string, error: unknown) => void;
};

const defaultCleanupDependencies: MobileMediaCleanupDependencies = {
  client: prisma,
  async deleteStorageObject(storageKey) {
    const result = await new UTApi().deleteFiles(storageKey);
    if (!result.success) {
      throw new Error("UploadThing cleanup failed");
    }
  },
  logWarning,
};

export type MobileMediaOpportunisticCleanupDependencies = {
  cleanup: (options: { limit: number }) => Promise<{ deleted: number; failed: number }>;
  logWarning: (scope: string, error: unknown) => void;
  timeoutMs?: number;
};

/**
 * Avatar, banner and feedback screenshots all belong to the uploader; only the
 * server icon carries a target.
 */
const OWNER_SCOPED_PURPOSES = new Set<MobileMediaUploadPurpose>([
  MobileMediaUploadPurpose.FEEDBACK_ATTACHMENT,
  MobileMediaUploadPurpose.PROFILE_AVATAR,
  MobileMediaUploadPurpose.PROFILE_BANNER,
]);

/**
 * 4a screenshots never reach `claimMobileMediaUpload`: that route's whole job is
 * to swap a profile or server image, and a feedback screenshot replaces nothing.
 * The submission claims them itself, in its own transaction.
 */
const FEEDBACK_CLAIM_PURPOSE = MobileMediaUploadPurpose.FEEDBACK_ATTACHMENT;

function toDatabasePurpose(purpose: MobileMediaUploadPublicPurpose) {
  switch (purpose) {
    case "feedback-attachment":
      return MobileMediaUploadPurpose.FEEDBACK_ATTACHMENT;
    case "profile-avatar":
      return MobileMediaUploadPurpose.PROFILE_AVATAR;
    case "profile-banner":
      return MobileMediaUploadPurpose.PROFILE_BANNER;
    default:
      return MobileMediaUploadPurpose.SERVER_ICON;
  }
}

function toPublicPurpose(purpose: MobileMediaUploadPurpose): MobileMediaUploadPublicPurpose {
  switch (purpose) {
    case MobileMediaUploadPurpose.FEEDBACK_ATTACHMENT:
      return "feedback-attachment";
    case MobileMediaUploadPurpose.PROFILE_AVATAR:
      return "profile-avatar";
    case MobileMediaUploadPurpose.PROFILE_BANNER:
      return "profile-banner";
    default:
      return "server-icon";
  }
}

function immutableUploadMatches(
  upload: {
    contentType: string;
    height: number;
    ownerId: string;
    purpose: MobileMediaUploadPurpose;
    sizeBytes: number;
    storageKey: string;
    targetServerId: string | null;
    url: string;
    width: number;
  },
  input: {
    image: VerifiedMobileImage;
    ownerId: string;
    purpose: MobileMediaUploadPublicPurpose;
    targetServerId: string | null;
  },
) {
  return (
    upload.ownerId === input.ownerId &&
    upload.purpose === toDatabasePurpose(input.purpose) &&
    upload.targetServerId === input.targetServerId &&
    upload.storageKey === input.image.storageKey &&
    upload.url === input.image.url &&
    upload.contentType === input.image.contentType &&
    upload.sizeBytes === input.image.sizeBytes &&
    upload.width === input.image.width &&
    upload.height === input.image.height
  );
}

export async function recordVerifiedMobileMediaUpload(
  input: {
    image: VerifiedMobileImage;
    ownerId: string;
    purpose: MobileMediaUploadPublicPurpose;
    targetServerId: string | null;
  },
  dependencies: MobileMediaRecordDependencies = defaultRecordDependencies,
): Promise<MobileMediaUploadCompletionResponse> {
  const now = dependencies.now();

  // A server-icon row without a target (or an avatar row with one) passes the upload but
  // fails every later claim with a generic 409, which on the device looks exactly like a
  // stale cache. Reject it at write time instead.
  if (
    (input.purpose === "server-icon" && !input.targetServerId) ||
    (input.purpose !== "server-icon" && input.targetServerId !== null)
  ) {
    throw new ApiError("Upload target is invalid", 400, "UPLOAD_TARGET_INVALID");
  }

  const expiresAt = new Date(now.getTime() + CLAIM_TTL_MS);
  const purpose = toDatabasePurpose(input.purpose);
  const upload = await dependencies.client.mobileMediaUpload.upsert({
    create: {
      cleanupAfter: expiresAt,
      contentType: input.image.contentType,
      expiresAt,
      height: input.image.height,
      ownerId: input.ownerId,
      purpose,
      sizeBytes: input.image.sizeBytes,
      storageKey: input.image.storageKey,
      targetServerId: input.targetServerId,
      url: input.image.url,
      width: input.image.width,
    },
    update: {},
    where: { storageKey: input.image.storageKey },
  });

  if (!immutableUploadMatches(upload, input)) {
    throw new ApiError(
      "Upload record conflicts with the verified callback",
      409,
      "UPLOAD_RECORD_CONFLICT",
    );
  }

  const response = MobileMediaUploadCompletionResponseSchema.parse({
    claimId: upload.id,
    expiresAt: upload.expiresAt.toISOString(),
    purpose: toPublicPurpose(upload.purpose),
    targetServerId: upload.targetServerId,
  });
  await runInjectedOpportunisticCleanup(dependencies);
  return response;
}

function uploadClaimUnavailable(): never {
  throw new ApiError("Upload claim is invalid or expired", 409, "UPLOAD_CLAIM_UNAVAILABLE");
}

/**
 * Every claim rejection shares one opaque 409, so a failed server icon is impossible to
 * tell apart from a stale device cache. The public error stays unchanged; the reason is
 * logged so the failing check is visible in server logs.
 */
function describeUnclaimableUpload(
  upload: {
    claimedAt: Date | null;
    cleanupAfter: Date | null;
    expiresAt: Date;
    ownerId: string;
    purpose: MobileMediaUploadPurpose;
    storageDeletedAt: Date | null;
    targetServerId: string | null;
  } | null,
  userId: string,
  now: Date,
): string | null {
  if (!upload) {
    return "claim-not-found";
  }
  if (upload.ownerId !== userId) {
    return "claim-owner-mismatch";
  }
  if (upload.claimedAt !== null) {
    return "claim-already-claimed";
  }
  if (upload.cleanupAfter === null) {
    return "claim-cleanup-cleared";
  }
  if (upload.cleanupAfter.getTime() !== upload.expiresAt.getTime()) {
    return "claim-cleanup-mismatch";
  }
  if (upload.storageDeletedAt !== null) {
    return "claim-storage-deleted";
  }
  if (upload.expiresAt <= now) {
    return "claim-expired";
  }
  if (!hasValidPurposeTarget(upload)) {
    return "claim-purpose-target-invalid";
  }
  // A feedback screenshot has no image to replace. Left unguarded it would fall
  // through the owner-scoped branch and overwrite the user's banner.
  if (upload.purpose === FEEDBACK_CLAIM_PURPOSE) {
    return "claim-purpose-not-claimable-here";
  }

  return null;
}

function hasValidPurposeTarget(upload: {
  purpose: MobileMediaUploadPurpose;
  targetServerId: string | null;
}) {
  return OWNER_SCOPED_PURPOSES.has(upload.purpose)
    ? upload.targetServerId === null
    : upload.targetServerId !== null;
}

export async function claimMobileMediaUpload(
  userId: string,
  input: { claimId: string },
  dependencies: MobileMediaClaimDependencies = defaultClaimDependencies,
): Promise<MobileMediaClaimResponse> {
  const now = dependencies.now();
  const claimUnavailable = (reason: string): never => {
    try {
      dependencies.logWarning?.("[mobile-media-claim] upload claim rejected", {
        claimId: input.claimId,
        reason,
      });
    } catch {
      // Diagnostics must never replace the bounded claim failure.
    }

    return uploadClaimUnavailable();
  };
  const committed = await dependencies.client.$transaction(async (tx) => {
    const upload = await tx.mobileMediaUpload.findUnique({
      where: { id: input.claimId },
      select: {
        claimedAt: true,
        cleanupAfter: true,
        expiresAt: true,
        id: true,
        ownerId: true,
        purpose: true,
        storageDeletedAt: true,
        targetServerId: true,
        url: true,
      },
    });

    const unclaimableReason = describeUnclaimableUpload(upload, userId, now);
    if (!upload || unclaimableReason) {
      return claimUnavailable(unclaimableReason ?? "claim-not-found");
    }

    let previousUrl: string | null;
    if (OWNER_SCOPED_PURPOSES.has(upload.purpose)) {
      const currentProfile = await tx.user.findUnique({
        where: { id: userId },
        select: { avatarUrl: true, bannerUrl: true },
      });
      if (!currentProfile) {
        throw new ApiError("Account not found", 404, "USER_NOT_FOUND");
      }
      previousUrl =
        upload.purpose === MobileMediaUploadPurpose.PROFILE_AVATAR
          ? currentProfile.avatarUrl
          : currentProfile.bannerUrl;
    } else {
      const targetServerId = upload.targetServerId;
      if (!targetServerId) {
        return claimUnavailable("claim-server-target-missing");
      }
      const access = await getAccessContextWithClient(tx, userId, targetServerId);
      ensureServerPermission(access, PermissionBits.MANAGE_SERVER);
      const currentServer = await tx.server.findUnique({
        where: { id: targetServerId },
        select: { iconUrl: true },
      });
      if (!currentServer) {
        return claimUnavailable("claim-server-not-found");
      }
      previousUrl = currentServer.iconUrl;
    }

    const superseded =
      previousUrl && previousUrl !== upload.url
        ? await tx.mobileMediaUpload.findFirst({
            where: {
              claimedAt: { not: null },
              cleanupAfter: null,
              id: { not: upload.id },
              ...(OWNER_SCOPED_PURPOSES.has(upload.purpose) ? { ownerId: userId } : {}),
              purpose: upload.purpose,
              storageDeletedAt: null,
              targetServerId: upload.targetServerId,
              url: previousUrl,
            },
            select: { id: true },
          })
        : null;

    const claimed = await tx.mobileMediaUpload.updateMany({
      data: { claimedAt: now, cleanupAfter: null },
      where: {
        claimedAt: null,
        cleanupAfter: upload.cleanupAfter,
        expiresAt: { gt: now },
        id: input.claimId,
        ownerId: userId,
        storageDeletedAt: null,
      },
    });
    if (claimed.count !== 1) {
      return claimUnavailable("claim-row-race-lost");
    }

    if (upload.purpose === MobileMediaUploadPurpose.PROFILE_AVATAR) {
      const targetUpdated = await tx.user.updateMany({
        where: { avatarUrl: previousUrl, id: userId },
        data: { avatarUrl: upload.url },
      });
      if (targetUpdated.count !== 1) {
        return claimUnavailable("claim-avatar-write-race-lost");
      }

      const profile = await tx.user.findUnique({
        where: { id: userId },
        select: {
          avatarUrl: true,
          customStatus: true,
          displayName: true,
          id: true,
          status: true,
          twoFactorEnabled: true,
          username: true,
        },
      });
      if (!profile) {
        return claimUnavailable("claim-profile-not-found");
      }

      if (superseded) {
        await tx.mobileMediaUpload.updateMany({
          data: { cleanupAfter: now },
          where: { cleanupAfter: null, id: superseded.id, storageDeletedAt: null },
        });
      }

      const visibleStatus = mapVisiblePresenceStatus(profile.status);
      return {
        broadcast: {
          avatarUrl: profile.avatarUrl,
          customStatus: profile.customStatus,
          displayName: profile.displayName,
          status: visibleStatus,
          userId: profile.id,
          username: profile.username,
        } satisfies UserProfileUpdatedPayload,
        kind: "profile" as const,
        response: MobileMediaClaimResponseSchema.parse({
          claimId: upload.id,
          claimedAt: now.toISOString(),
          profile: {
            avatarUrl: profile.avatarUrl,
            customStatus: profile.customStatus,
            displayName: profile.displayName,
            id: profile.id,
            status: visibleStatus,
            twoFactorEnabled: profile.twoFactorEnabled,
            username: profile.username,
          },
          purpose: "profile-avatar",
        }),
      };
    }

    if (upload.purpose === MobileMediaUploadPurpose.PROFILE_BANNER) {
      // A fresh image starts centred: the previous banner's focal point would frame
      // a different picture, so the reposition offsets are cleared with the swap.
      const bannerUpdated = await tx.user.updateMany({
        where: { bannerUrl: previousUrl, id: userId },
        data: { bannerOffsetX: null, bannerOffsetY: null, bannerUrl: upload.url },
      });
      if (bannerUpdated.count !== 1) {
        return claimUnavailable("claim-banner-write-race-lost");
      }

      const profile = await tx.user.findUnique({
        where: { id: userId },
        select: { bannerUrl: true, id: true },
      });
      if (!profile?.bannerUrl) {
        return claimUnavailable("claim-profile-not-found");
      }

      if (superseded) {
        await tx.mobileMediaUpload.updateMany({
          data: { cleanupAfter: now },
          where: { cleanupAfter: null, id: superseded.id, storageDeletedAt: null },
        });
      }

      return {
        kind: "banner" as const,
        response: MobileMediaClaimResponseSchema.parse({
          banner: { bannerUrl: profile.bannerUrl, id: profile.id },
          claimId: upload.id,
          claimedAt: now.toISOString(),
          purpose: "profile-banner",
        }),
      };
    }

    const targetServerId = upload.targetServerId;
    if (!targetServerId) {
      return claimUnavailable("claim-server-target-missing");
    }
    const targetUpdated = await tx.server.updateMany({
      where: { iconUrl: previousUrl, id: targetServerId },
      data: { iconUrl: upload.url },
    });
    if (targetUpdated.count !== 1) {
      return claimUnavailable("claim-server-icon-write-race-lost");
    }

    const server = await tx.server.findUnique({
      where: { id: targetServerId },
      select: { iconUrl: true, id: true },
    });
    if (!server) {
      return claimUnavailable("claim-server-vanished");
    }

    if (superseded) {
      await tx.mobileMediaUpload.updateMany({
        data: { cleanupAfter: now },
        where: { cleanupAfter: null, id: superseded.id, storageDeletedAt: null },
      });
    }

    return {
      kind: "server" as const,
      response: MobileMediaClaimResponseSchema.parse({
        claimId: upload.id,
        claimedAt: now.toISOString(),
        purpose: "server-icon",
        server,
      }),
      serverId: targetServerId,
    };
  });

  await runInjectedOpportunisticCleanup(dependencies);
  if (committed.kind === "profile") {
    await dependencies.broadcastProfile(committed.broadcast);
  } else if (committed.kind === "server") {
    await dependencies.broadcastServer(committed.serverId);
  }

  return committed.response;
}

export type MobileFeedbackAttachmentClaim = {
  contentType: string;
  height: number;
  sizeBytes: number;
  uploadId: string;
  url: string;
  width: number;
};

export type MobileFeedbackAttachmentClaimClient = {
  mobileMediaUpload: Pick<typeof prisma.mobileMediaUpload, "findUnique" | "updateMany">;
};

/**
 * Claims 4a screenshots inside the caller's own transaction, so a submission
 * either stores its message *and* its images or neither. It reuses the same
 * invariants the profile claim enforces — owner, unclaimed, unexpired, cleanup
 * lease intact — because those are what keep an upload id from being replayed;
 * it just has no image to swap at the end.
 */
export async function claimMobileFeedbackAttachmentUploads(
  client: MobileFeedbackAttachmentClaimClient,
  input: { claimIds: readonly string[]; now: Date; userId: string },
): Promise<MobileFeedbackAttachmentClaim[]> {
  const claims: MobileFeedbackAttachmentClaim[] = [];
  const seen = new Set<string>();

  for (const claimId of input.claimIds) {
    // The same id twice would otherwise claim once and silently drop the rest.
    if (seen.has(claimId)) {
      uploadClaimUnavailable();
    }
    seen.add(claimId);

    const upload = await client.mobileMediaUpload.findUnique({
      where: { id: claimId },
      select: {
        claimedAt: true,
        cleanupAfter: true,
        contentType: true,
        expiresAt: true,
        height: true,
        id: true,
        ownerId: true,
        purpose: true,
        sizeBytes: true,
        storageDeletedAt: true,
        targetServerId: true,
        url: true,
        width: true,
      },
    });

    if (
      !upload ||
      upload.purpose !== FEEDBACK_CLAIM_PURPOSE ||
      upload.ownerId !== input.userId ||
      upload.claimedAt !== null ||
      upload.cleanupAfter === null ||
      upload.cleanupAfter.getTime() !== upload.expiresAt.getTime() ||
      upload.storageDeletedAt !== null ||
      upload.expiresAt <= input.now ||
      upload.targetServerId !== null
    ) {
      uploadClaimUnavailable();
    }

    const claimed = await client.mobileMediaUpload.updateMany({
      data: { claimedAt: input.now, cleanupAfter: null },
      where: {
        claimedAt: null,
        cleanupAfter: upload.cleanupAfter,
        expiresAt: { gt: input.now },
        id: upload.id,
        ownerId: input.userId,
        storageDeletedAt: null,
      },
    });
    if (claimed.count !== 1) {
      uploadClaimUnavailable();
    }

    claims.push({
      contentType: upload.contentType,
      height: upload.height,
      sizeBytes: upload.sizeBytes,
      uploadId: upload.id,
      url: upload.url,
      width: upload.width,
    });
  }

  return claims;
}

function boundedCleanupLimit(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) {
    return CLEANUP_BATCH_LIMIT;
  }
  return Math.min(CLEANUP_BATCH_LIMIT, Math.max(1, Math.trunc(limit)));
}

function redactedCleanupFailure(error: unknown, uploadId?: string) {
  return {
    errorName: error instanceof Error ? error.name : "UnknownError",
    ...(uploadId ? { uploadId } : {}),
  };
}

async function runInjectedOpportunisticCleanup(dependencies: {
  logWarning?: (scope: string, error: unknown) => void;
  opportunisticCleanup?: () => Promise<void>;
}) {
  try {
    await (dependencies.opportunisticCleanup ?? runOpportunisticMobileMediaCleanup)();
  } catch (error) {
    try {
      (dependencies.logWarning ?? logWarning)(
        "[mobile-media-cleanup] request cleanup failed",
        redactedCleanupFailure(error),
      );
    } catch {
      // Cleanup must never replace an otherwise valid upload or claim response.
    }
  }
}

export async function cleanupMobileMediaUploads(
  options: { limit?: number; now?: Date } = {},
  dependencies: MobileMediaCleanupDependencies = defaultCleanupDependencies,
): Promise<{ deleted: number; failed: number }> {
  const now = options.now ?? new Date();
  const candidates = await dependencies.client.mobileMediaUpload.findMany({
    where: {
      cleanupAfter: { lte: now },
      storageDeletedAt: null,
    },
    orderBy: [{ cleanupAfter: "asc" }, { id: "asc" }],
    take: boundedCleanupLimit(options.limit),
    select: { id: true, storageKey: true },
  });

  let deleted = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const leaseUntil = new Date(now.getTime() + CLEANUP_LEASE_MS);
    const acquired = await dependencies.client.mobileMediaUpload.updateMany({
      where: {
        cleanupAfter: { lte: now },
        id: candidate.id,
        storageDeletedAt: null,
      },
      data: {
        cleanupAfter: leaseUntil,
        cleanupAttempts: { increment: 1 },
        cleanupLastAttemptAt: now,
      },
    });
    if (acquired.count !== 1) {
      continue;
    }

    try {
      await dependencies.deleteStorageObject(candidate.storageKey);
    } catch (error) {
      failed += 1;
      await dependencies.client.mobileMediaUpload.updateMany({
        where: {
          cleanupAfter: leaseUntil,
          id: candidate.id,
          storageDeletedAt: null,
        },
        data: { cleanupAfter: now },
      });
      dependencies.logWarning(
        "[mobile-media-cleanup] storage deletion failed",
        redactedCleanupFailure(error, candidate.id),
      );
      continue;
    }

    const updated = await dependencies.client.mobileMediaUpload.updateMany({
      where: {
        cleanupAfter: leaseUntil,
        id: candidate.id,
        storageDeletedAt: null,
      },
      data: {
        cleanupAfter: null,
        storageDeletedAt: now,
      },
    });
    deleted += updated.count;
  }

  return { deleted, failed };
}

const defaultOpportunisticCleanupDependencies: MobileMediaOpportunisticCleanupDependencies = {
  cleanup: (options) => cleanupMobileMediaUploads(options),
  logWarning,
};

export async function runOpportunisticMobileMediaCleanup(
  dependencies: MobileMediaOpportunisticCleanupDependencies = defaultOpportunisticCleanupDependencies,
): Promise<void> {
  const timeoutMs = Math.max(
    1,
    Math.trunc(dependencies.timeoutMs ?? OPPORTUNISTIC_CLEANUP_TIMEOUT_MS),
  );
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutOutcome = new Promise<{ status: "timeout" }>((resolve) => {
    timeout = setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
    timeout.unref?.();
  });
  const cleanupOutcome = dependencies.cleanup({ limit: 1 }).then(
    () => ({ status: "completed" as const }),
    (error) => ({ error, status: "failed" as const }),
  );

  const outcome = await Promise.race([cleanupOutcome, timeoutOutcome]);
  if (timeout) {
    clearTimeout(timeout);
  }

  if (outcome.status === "completed") {
    return;
  }

  try {
    dependencies.logWarning(
      "[mobile-media-cleanup] opportunistic cleanup failed",
      outcome.status === "failed"
        ? redactedCleanupFailure(outcome.error)
        : { errorName: "CleanupTimeout" },
    );
  } catch {
    // Cleanup and logging are both best effort at request boundaries.
  }
}
