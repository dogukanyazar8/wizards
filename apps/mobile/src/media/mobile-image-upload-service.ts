import type {
  MobileMediaClaimRequest,
  MobileMediaClaimResponse,
  MobileMediaUploadCompletionResponse,
} from "@wizards/types";

import {
  parseMobileImageUploadTarget,
  type MobileImageUploadTarget,
  type MobilePickedImage,
} from "./mobile-image-upload-contract";
import {
  createMobileUploadWatchdog,
  type MobileUploadWatchdog,
  type MobileUploadWatchdogOptions,
} from "./mobile-upload-watchdog";
import { deleteMobileTemporaryFile } from "./mobile-temporary-file";

export const MOBILE_UPLOAD_MESSAGES = {
  busy: "An image upload is already in progress.",
  failed: "The image upload could not be completed.",
  signedOut: "Sign in to upload an image.",
} as const;

export type MobileImageUploadOutcome =
  | { status: "cancelled" }
  | { message: string; status: "error" }
  | { response: MobileMediaClaimResponse; status: "claimed" };

export interface MobileImageUploadDependencies {
  claimUpload(input: MobileMediaClaimRequest): Promise<MobileMediaClaimResponse>;
  createWatchdog?(options: MobileUploadWatchdogOptions): MobileUploadWatchdog;
  getAccessToken(): Promise<string | null>;
  pickImage(): Promise<MobilePickedImage | null>;
  removeTemporaryFile?(uri: string): void | Promise<void>;
  uploadFile(input: {
    accessToken: string;
    file: File;
    onProgress?: (progress: { loaded: number; total: number }) => void;
    signal?: AbortSignal;
    target: MobileImageUploadTarget;
  }): Promise<MobileMediaUploadCompletionResponse>;
}

export async function executeMobileImageUpload(input: {
  dependencies: MobileImageUploadDependencies;
  onLocalPreview(localUri: string): void;
  signal?: AbortSignal;
  target: MobileImageUploadTarget;
}): Promise<MobileImageUploadOutcome> {
  let accessToken: string | null = null;
  let picked: MobilePickedImage | null = null;
  let watchdog: MobileUploadWatchdog | null = null;
  let watchdogExpired = false;
  let uploadController: AbortController | null = null;
  let removeAbortForwarder: (() => void) | null = null;

  try {
    if (input.signal?.aborted) {
      return { status: "cancelled" };
    }

    const target = parseMobileImageUploadTarget(input.target);
    picked = await input.dependencies.pickImage();

    if (!picked || input.signal?.aborted) {
      return { status: "cancelled" };
    }

    input.onLocalPreview(picked.localUri);

    if (input.signal?.aborted) {
      return { status: "cancelled" };
    }

    accessToken = await input.dependencies.getAccessToken();

    if (!accessToken) {
      return { message: MOBILE_UPLOAD_MESSAGES.signedOut, status: "error" };
    }

    if (input.signal?.aborted) {
      return { status: "cancelled" };
    }

    uploadController = new AbortController();
    const forwardAbort = () => uploadController?.abort();
    input.signal?.addEventListener("abort", forwardAbort, { once: true });
    removeAbortForwarder = () => input.signal?.removeEventListener("abort", forwardAbort);
    watchdog = (input.dependencies.createWatchdog ?? createMobileUploadWatchdog)({
      onExpire: () => {
        watchdogExpired = true;
        uploadController?.abort();
      },
    });

    const completion = await input.dependencies.uploadFile({
      accessToken,
      file: picked.file,
      onProgress: (progress) => watchdog?.progress(progress),
      target,
      signal: uploadController.signal,
    });

    if (watchdogExpired) {
      return { message: MOBILE_UPLOAD_MESSAGES.failed, status: "error" };
    }
    if (input.signal?.aborted) {
      return { status: "cancelled" };
    }

    if (!doesCompletionMatchTarget(completion, target)) {
      return { message: MOBILE_UPLOAD_MESSAGES.failed, status: "error" };
    }

    const response = await input.dependencies.claimUpload({ claimId: completion.claimId });

    if (input.signal?.aborted) {
      return { status: "cancelled" };
    }

    if (!doesClaimMatchCompletion(response, completion, target)) {
      return { message: MOBILE_UPLOAD_MESSAGES.failed, status: "error" };
    }

    return { response, status: "claimed" };
  } catch (error) {
    if (watchdogExpired) {
      return { message: MOBILE_UPLOAD_MESSAGES.failed, status: "error" };
    }
    if (input.signal?.aborted || isAbortError(error)) {
      return { status: "cancelled" };
    }

    return { message: describeMobileUploadFailure(error), status: "error" };
  } finally {
    watchdog?.stop();
    removeAbortForwarder?.();
    if (picked?.temporaryFileUri) {
      await deleteMobileTemporaryFile(
        picked.temporaryFileUri,
        input.dependencies.removeTemporaryFile,
      );
    }
    accessToken = null;
  }
}

function doesCompletionMatchTarget(
  completion: MobileMediaUploadCompletionResponse,
  target: MobileImageUploadTarget,
) {
  if (completion.purpose !== target.purpose) {
    return false;
  }

  return target.purpose === "server-icon"
    ? completion.targetServerId === target.targetServerId
    : completion.targetServerId === null;
}

function doesClaimMatchCompletion(
  response: MobileMediaClaimResponse,
  completion: MobileMediaUploadCompletionResponse,
  target: MobileImageUploadTarget,
) {
  if (response.claimId !== completion.claimId || response.purpose !== target.purpose) {
    return false;
  }

  return target.purpose === "server-icon"
    ? response.purpose === "server-icon" && response.server.id === target.targetServerId
    : response.purpose === target.purpose;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * A bare "upload failed" string hides which hop broke (auth, uploadthing, claim), so a
 * failed server icon looks identical to a stale cache on the device. Append the API
 * status and code when the failure carries them; both are safe, non-personal values.
 */
function describeMobileUploadFailure(error: unknown): string {
  const candidate = error as { code?: unknown; status?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code : null;
  const status =
    typeof candidate?.status === "number" && candidate.status > 0 ? String(candidate.status) : null;
  const detail = [status, code].filter((value): value is string => value !== null).join(" ");

  return detail ? `${MOBILE_UPLOAD_MESSAGES.failed} (${detail})` : MOBILE_UPLOAD_MESSAGES.failed;
}
