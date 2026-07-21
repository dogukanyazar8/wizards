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
  getAccessToken(): Promise<string | null>;
  pickImage(): Promise<MobilePickedImage | null>;
  uploadFile(input: {
    accessToken: string;
    file: File;
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

  try {
    if (input.signal?.aborted) {
      return { status: "cancelled" };
    }

    const target = parseMobileImageUploadTarget(input.target);
    const picked = await input.dependencies.pickImage();

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

    const completion = await input.dependencies.uploadFile({
      accessToken,
      file: picked.file,
      target,
      ...(input.signal ? { signal: input.signal } : {}),
    });

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
    if (input.signal?.aborted || isAbortError(error)) {
      return { status: "cancelled" };
    }

    return { message: describeMobileUploadFailure(error), status: "error" };
  } finally {
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

  return target.purpose === "profile-avatar"
    ? completion.targetServerId === null
    : completion.targetServerId === target.targetServerId;
}

function doesClaimMatchCompletion(
  response: MobileMediaClaimResponse,
  completion: MobileMediaUploadCompletionResponse,
  target: MobileImageUploadTarget,
) {
  if (response.claimId !== completion.claimId || response.purpose !== target.purpose) {
    return false;
  }

  return target.purpose === "profile-avatar"
    ? response.purpose === "profile-avatar"
    : response.purpose === "server-icon" && response.server.id === target.targetServerId;
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
