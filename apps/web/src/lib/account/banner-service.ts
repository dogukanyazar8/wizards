import { MobileMediaUploadPurpose, prisma } from "@wizards/db";
import { MobileMediaClaimRequestSchema } from "@wizards/types";
import { ZodError } from "zod";

import {
  UpdateAccountBannerSchema,
  type AccountBanner,
  type AccountBannerResult,
} from "@/lib/account/banner";
import { ApiError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { logError } from "@/lib/logger";
import { claimMobileMediaUpload } from "@/lib/mobile/mobile-media-upload-service";

const bannerSelect = {
  bannerUrl: true,
  bannerColor: true,
  bannerOffsetX: true,
  bannerOffsetY: true,
} as const;

export type AccountBannerDependencies = {
  authenticate: () => Promise<string>;
  enforceRateLimit: (
    userId: string,
    action: "settings:bootstrap" | "settings:update" | "mobile:media:claim",
  ) => Promise<void>;
  client: Pick<typeof prisma, "user" | "$transaction">;
  claimUpload: typeof claimMobileMediaUpload;
  now: () => Date;
  logError: typeof logError;
};

const defaultDependencies: AccountBannerDependencies = {
  authenticate: requireApiUserId,
  enforceRateLimit: enforceApiRateLimit,
  client: prisma,
  claimUpload: claimMobileMediaUpload,
  now: () => new Date(),
  logError,
};

function failure(
  error: unknown,
  fallback: "load" | "save" | "upload",
  dependencies: AccountBannerDependencies,
): AccountBannerResult {
  let reason: string = fallback;
  if (error instanceof ZodError) {
    reason = "invalid";
  } else if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) reason = "unauthorized";
    else if (error.status === 409) reason = "conflict";
    else if (error.status === 400) reason = "invalid";
    else if (error.status === 429 || error.status === 503) reason = "unavailable";
  } else {
    dependencies.logError(`[account-banner] ${fallback} failed`, error);
  }
  return { success: false, error: `settings.account.banner.errors.${reason}` };
}

async function readBanner(
  userId: string,
  client: Pick<typeof prisma, "user">,
): Promise<AccountBanner> {
  const banner = await client.user.findUnique({ where: { id: userId }, select: bannerSelect });
  if (!banner) throw new ApiError("Account not found", 404, "USER_NOT_FOUND");
  return banner;
}

export async function getAccountBanner(
  dependencies: AccountBannerDependencies = defaultDependencies,
): Promise<AccountBannerResult> {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "settings:bootstrap");
    return { success: true, banner: await readBanner(userId, dependencies.client) };
  } catch (error) {
    return failure(error, "load", dependencies);
  }
}

export async function claimAccountBanner(
  claimId: string,
  dependencies: AccountBannerDependencies = defaultDependencies,
): Promise<AccountBannerResult> {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "mobile:media:claim");
    const input = MobileMediaClaimRequestSchema.parse({ claimId });
    await dependencies.claimUpload(userId, { ...input, expectedPurpose: "profile-banner" });
    return { success: true, banner: await readBanner(userId, dependencies.client) };
  } catch (error) {
    return failure(error, "upload", dependencies);
  }
}

export async function updateAccountBanner(
  input: unknown,
  dependencies: AccountBannerDependencies = defaultDependencies,
): Promise<AccountBannerResult> {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "settings:update");
    const update = UpdateAccountBannerSchema.parse(input);
    const banner = await dependencies.client.$transaction(async (tx) => {
      // Only banner columns are written. The expected URL protects a newer image
      // claimed on another device from a stale remove/reposition operation.
      const result = await tx.user.updateMany({
        where: {
          id: userId,
          ...(update.operation === "color" ? {} : { bannerUrl: update.expectedUrl }),
        },
        data:
          update.operation === "color"
            ? { bannerColor: update.color }
            : update.operation === "position"
              ? { bannerOffsetX: update.offsetX, bannerOffsetY: update.offsetY }
              : { bannerUrl: null, bannerOffsetX: null, bannerOffsetY: null },
      });
      if (result.count !== 1) {
        throw new ApiError("Banner changed", 409, "ACCOUNT_BANNER_CONFLICT");
      }
      if (update.operation === "remove") {
        await tx.mobileMediaUpload.updateMany({
          where: {
            ownerId: userId,
            purpose: MobileMediaUploadPurpose.PROFILE_BANNER,
            url: update.expectedUrl,
            targetServerId: null,
            claimedAt: { not: null },
            cleanupAfter: null,
            storageDeletedAt: null,
          },
          data: { cleanupAfter: dependencies.now() },
        });
      }
      return readBanner(userId, tx);
    });
    return { success: true, banner };
  } catch (error) {
    return failure(error, "save", dependencies);
  }
}
