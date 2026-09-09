import {
  MobileMediaUploadIntentSchema,
  type MobileMediaUploadCompletionResponse,
  type MobileMediaUploadIntent,
  type MobileMediaUploadPurpose,
} from "@wizards/types";
import { UTApi, UploadThingError } from "uploadthing/server";

import { ApiError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId, requireMobileApiUserId } from "@/lib/auth/api";
import { logWarning } from "@/lib/logger";
import {
  recordVerifiedMobileMediaUpload,
  runOpportunisticMobileMediaCleanup,
} from "@/lib/mobile/mobile-media-upload-service";
import {
  isTransientMobileImageVerificationFailure,
  verifyMobileUploadedImage,
} from "@/lib/mobile/mobile-media-verifier";
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
  authenticateSession: typeof requireApiUserId;
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
  authenticateSession: requireApiUserId,
  enforceRateLimit: enforceApiRateLimit,
  ensureServerPermission,
  getAccessContext,
  logWarning,
  runOpportunisticCleanup: runOpportunisticMobileMediaCleanup,
};

/** Hangi kimlik yolunun kabul edildiği; izin kararı buna bakar. */
type MobileMediaUploadOwner = {
  ownerId: string;
  source: "bearer" | "session";
};

/**
 * SPEC-INDIRME §A "Sorun bildir" web ve masaüstünde de çalışıyor, orada taşıyıcı
 * jeton yok. Yalnız ekran görüntüsü amacı oturum çerezine düşebilir; diğer
 * amaçlar mobil kalır.
 *
 * Buradaki `purpose` okuması istemciden gelen **ham** değerdir ve yalnızca
 * hangi kimlik yolunun deneneceğini seçer. Yetki kararı, şema doğrulandıktan
 * sonra `source` üzerinden ikinci kez verilir: uydurma bir amaç, oturumla
 * yapılamayacak bir yüklemeyi açamaz.
 */
function mayFallBackToSession(intent: MobileMediaUploadIntent): boolean {
  return (intent as { purpose?: unknown } | null)?.purpose === "feedback-attachment";
}

async function resolveMobileMediaUploadOwner(
  input: { intent: MobileMediaUploadIntent; request: Request },
  dependencies: MobileMediaUploadAuthorizationDependencies,
): Promise<MobileMediaUploadOwner> {
  try {
    return { ownerId: await dependencies.authenticate(input.request), source: "bearer" };
  } catch (error) {
    if (!mayFallBackToSession(input.intent)) {
      throw error;
    }

    return { ownerId: await dependencies.authenticateSession(), source: "session" };
  }
}

export type MobileMediaUploadCompletionDependencies = {
  deleteFiles: (
    keys: string[],
  ) => Promise<{ readonly deletedCount: number; readonly success: boolean }>;
  isTransientVerificationFailure: (error: unknown) => boolean;
  logWarning: typeof logWarning;
  recordVerifiedUpload: typeof recordVerifiedMobileMediaUpload;
  verifyUploadedImage: typeof verifyMobileUploadedImage;
};

const defaultCompletionDependencies: MobileMediaUploadCompletionDependencies = {
  async deleteFiles(keys) {
    return await new UTApi().deleteFiles(keys);
  },
  isTransientVerificationFailure: isTransientMobileImageVerificationFailure,
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
  let owner: MobileMediaUploadOwner;
  try {
    owner = await resolveMobileMediaUploadOwner(input, dependencies);
  } catch (error) {
    throw authorizationUploadThingError(error);
  }

  const { ownerId } = owner;

  try {
    await dependencies.enforceRateLimit(ownerId, MOBILE_MEDIA_UPLOAD_RATE_LIMIT_ACTION);
    // Deliberately not awaited. Cleanup is housekeeping for objects nobody is
    // waiting on, and it used to spend up to a second of every presign — time
    // the phone spends staring at a picked image that has not started uploading.
    void runBestEffortAuthenticatedCleanup(dependencies);

    // Re-validate the client-supplied intent here. A server-icon intent that reaches this
    // point without a target id would make the Prisma membership lookup drop its filter
    // (undefined = no filter) and authorize against an arbitrary server, then record an
    // upload that can never be claimed.
    const intent = MobileMediaUploadIntentSchema.parse(input.intent);

    // The session path exists for one purpose only. Checking it against the
    // *parsed* intent is what stops a forged `purpose` from turning a browser
    // session into a mobile-only upload.
    if (owner.source === "session" && intent.purpose !== "feedback-attachment") {
      throw new ApiError("Upload not allowed", 403, "UPLOAD_PURPOSE_NOT_ALLOWED");
    }

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
  } catch (error) {
    // A source this server merely could not read right now is left in place.
    // The upload callback is retried, and deleting the object here made every
    // later attempt fail on an object that no longer exists — one slow read
    // became a permanent failure, and on the device an upload that hit 100% and
    // then never answered.
    if (!dependencies.isTransientVerificationFailure(error)) {
      await deleteUploadBestEffort(
        input.file.key,
        "[mobile-media-upload] rejected object deletion failed",
        dependencies,
      );
    }

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
