import {
  MobileMediaUploadIntentSchema,
  type MobileMediaUploadCompletionResponse,
  type MobileMediaUploadIntent,
  type MobileMediaUploadPurpose,
} from "@wizards/types";
import { UTApi, UploadThingError } from "uploadthing/server";

import { ApiError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { logWarning } from "@/lib/logger";
import {
  recordVerifiedMobileMediaUpload,
  runOpportunisticMobileMediaCleanup,
} from "@/lib/mobile/mobile-media-upload-service";
import { verifyMobileUploadedImage } from "@/lib/mobile/mobile-media-verifier";
import { ensureServerPermission, getAccessContext } from "@/lib/workspace/access-context";
import { PermissionBits } from "@/lib/workspace/permissions";

const MOBILE_MEDIA_UPLOAD_RATE_LIMIT_ACTION = "mobile:media:upload" as const;

export type MobileUploadMetadata = {
  ownerId: string;
  purpose: MobileMediaUploadPurpose;
  targetServerId: string | null;
};

export type UploadThingMobileFile = {
  key: string;
  size: number;
  type: string;
  ufsUrl: string;
};

export type MobileMediaUploadAuthorizationDependencies = {
  authenticate: typeof requireMobileApiUserId;
  enforceRateLimit: (
    userId: string,
    action: typeof MOBILE_MEDIA_UPLOAD_RATE_LIMIT_ACTION,
  ) => Promise<void>;
  ensureServerPermission: typeof ensureServerPermission;
  getAccessContext: typeof getAccessContext;
  logWarning: typeof logWarning;
  runOpportunisticCleanup: typeof runOpportunisticMobileMediaCleanup;
};

const defaultAuthorizationDependencies: MobileMediaUploadAuthorizationDependencies = {
  authenticate: requireMobileApiUserId,
  enforceRateLimit: enforceApiRateLimit,
  ensureServerPermission,
  getAccessContext,
  logWarning,
  runOpportunisticCleanup: runOpportunisticMobileMediaCleanup,
};

export type MobileMediaUploadCompletionDependencies = {
  deleteFiles: (
    keys: string[],
  ) => Promise<{ readonly deletedCount: number; readonly success: boolean }>;
  logWarning: typeof logWarning;
  recordVerifiedUpload: typeof recordVerifiedMobileMediaUpload;
  verifyUploadedImage: typeof verifyMobileUploadedImage;
};

const defaultCompletionDependencies: MobileMediaUploadCompletionDependencies = {
  async deleteFiles(keys) {
    return await new UTApi().deleteFiles(keys);
  },
  logWarning,
  recordVerifiedUpload: recordVerifiedMobileMediaUpload,
  verifyUploadedImage: verifyMobileUploadedImage,
};

function redactedFailure(error: unknown) {
  return { errorName: error instanceof Error ? "Error" : "UnknownError" };
}

function logBestEffortWarning(
  dependencies: { logWarning: typeof logWarning },
  scope: string,
  error: unknown,
) {
  try {
    dependencies.logWarning(scope, redactedFailure(error));
  } catch {
    // Best-effort work and its logger must not replace the bounded upload result.
  }
}

async function runBestEffortAuthenticatedCleanup(
  dependencies: MobileMediaUploadAuthorizationDependencies,
) {
  try {
    await dependencies.runOpportunisticCleanup();
  } catch (error) {
    logBestEffortWarning(dependencies, "[mobile-media-upload] opportunistic cleanup failed", error);
  }
}

function authorizationUploadThingError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return new UploadThingError("Unauthorized");
    }
    if (error.status === 403 || error.status === 404) {
      return new UploadThingError("Upload not allowed");
    }
    if (error.status === 429) {
      return new UploadThingError("Too many uploads. Please try again shortly.");
    }
  }

  return new UploadThingError(
    "Upload checks are temporarily unavailable. Please try again shortly.",
  );
}

export async function authorizeMobileMediaUpload(
  input: { intent: MobileMediaUploadIntent; request: Request },
  dependencies: MobileMediaUploadAuthorizationDependencies = defaultAuthorizationDependencies,
): Promise<MobileUploadMetadata> {
  let ownerId: string;
  try {
    ownerId = await dependencies.authenticate(input.request);
  } catch (error) {
    throw authorizationUploadThingError(error);
  }

  try {
    await dependencies.enforceRateLimit(ownerId, MOBILE_MEDIA_UPLOAD_RATE_LIMIT_ACTION);
    await runBestEffortAuthenticatedCleanup(dependencies);

    // Re-validate the client-supplied intent here. A server-icon intent that reaches this
    // point without a target id would make the Prisma membership lookup drop its filter
    // (undefined = no filter) and authorize against an arbitrary server, then record an
    // upload that can never be claimed.
    const intent = MobileMediaUploadIntentSchema.parse(input.intent);

    // Avatar, banner and feedback screenshots are owner-scoped, so none of them
    // needs a server permission check.
    if (
      intent.purpose === "feedback-attachment" ||
      intent.purpose === "profile-avatar" ||
      intent.purpose === "profile-banner"
    ) {
      return {
        ownerId,
        purpose: intent.purpose,
        targetServerId: null,
      };
    }

    const access = await dependencies.getAccessContext(ownerId, intent.targetServerId);
    dependencies.ensureServerPermission(access, PermissionBits.MANAGE_SERVER);
    return {
      ownerId,
      purpose: "server-icon",
      targetServerId: intent.targetServerId,
    };
  } catch (error) {
    throw authorizationUploadThingError(error);
  }
}

async function deleteProviderUpload(
  key: string,
  dependencies: MobileMediaUploadCompletionDependencies,
) {
  const result = await dependencies.deleteFiles([key]);
  if (!result.success) {
    throw new Error("Upload provider deletion failed");
  }
}

async function deleteUploadBestEffort(
  key: string,
  scope: string,
  dependencies: MobileMediaUploadCompletionDependencies,
) {
  try {
    await deleteProviderUpload(key, dependencies);
  } catch (error) {
    logBestEffortWarning(dependencies, scope, error);
  }
}

export async function completeMobileMediaUpload(
  input: { file: UploadThingMobileFile; metadata: MobileUploadMetadata },
  dependencies: MobileMediaUploadCompletionDependencies = defaultCompletionDependencies,
): Promise<MobileMediaUploadCompletionResponse> {
  let image: Awaited<ReturnType<typeof verifyMobileUploadedImage>>;
  try {
    image = await dependencies.verifyUploadedImage({
      key: input.file.key,
      size: input.file.size,
      type: input.file.type,
      url: input.file.ufsUrl,
    });
  } catch {
    await deleteUploadBestEffort(
      input.file.key,
      "[mobile-media-upload] rejected object deletion failed",
      dependencies,
    );
    throw new UploadThingError("Uploaded image could not be verified");
  }

  try {
    return await dependencies.recordVerifiedUpload({
      image,
      ownerId: input.metadata.ownerId,
      purpose: input.metadata.purpose,
      targetServerId: input.metadata.targetServerId,
    });
  } catch {
    await deleteUploadBestEffort(
      input.file.key,
      "[mobile-media-upload] unclaimed verified object deletion failed",
      dependencies,
    );
    throw new UploadThingError("Upload could not be completed");
  }
}
