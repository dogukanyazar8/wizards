import {
  MobileMessageAttachmentUploadError,
  type MobileMessageAttachmentDraft,
  type MobileMessageAttachmentUploadErrorCode,
  type MobilePickedMessageAttachment,
} from "./mobile-message-attachment-contract";
import {
  createMobileUploadWatchdog,
  type MobileUploadWatchdog,
  type MobileUploadWatchdogOptions,
} from "./mobile-upload-watchdog";
import { deleteMobileTemporaryFile } from "./mobile-temporary-file";

/** `upload-failed` covers transport/unknown errors that carry no contract code. */
export type MobileMessageAttachmentUploadFailureCode =
  MobileMessageAttachmentUploadErrorCode | "upload-failed";

export type MobileMessageAttachmentUploadOutcome =
  | { readonly status: "cancelled" }
  | { readonly draft: MobileMessageAttachmentDraft; readonly status: "ready" }
  | { readonly code: MobileMessageAttachmentUploadFailureCode; readonly status: "error" };

export async function executeMobileMessageAttachmentUpload(input: {
  readonly dependencies: {
    createWatchdog?(options: MobileUploadWatchdogOptions): MobileUploadWatchdog;
    getAccessToken(): Promise<string | null>;
    pickAttachment(): Promise<MobilePickedMessageAttachment | null>;
    removeLocalFile?(uri: string): void | Promise<void>;
    uploadAttachment(input: {
      readonly accessToken: string;
      readonly onProgress?: (progress: { loaded: number; total: number }) => void;
      readonly picked: MobilePickedMessageAttachment;
      readonly signal?: AbortSignal;
    }): Promise<MobileMessageAttachmentDraft>;
  };
  readonly removePickedFileOnReady?: boolean;
  readonly signal?: AbortSignal;
}): Promise<MobileMessageAttachmentUploadOutcome> {
  let watchdog: MobileUploadWatchdog | null = null;
  let watchdogExpired = false;
  let uploadController: AbortController | null = null;
  let removeAbortForwarder: (() => void) | null = null;

  try {
    if (input.signal?.aborted) {
      return { status: "cancelled" };
    }

    const picked = await input.dependencies.pickAttachment();
    if (!picked || input.signal?.aborted) {
      return { status: "cancelled" };
    }

    const accessToken = await input.dependencies.getAccessToken();
    if (!accessToken) {
      return { code: "missing-access-token", status: "error" };
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

    const draft = await input.dependencies.uploadAttachment({
      accessToken,
      onProgress: (progress) => watchdog?.progress(progress),
      picked,
      signal: uploadController.signal,
    });

    if (watchdogExpired) {
      return { code: "upload-failed", status: "error" };
    }
    if (input.signal?.aborted) {
      return { status: "cancelled" };
    }
    if (input.removePickedFileOnReady) {
      await deleteMobileTemporaryFile(picked.localUri, input.dependencies.removeLocalFile);
    }
    return { draft, status: "ready" };
  } catch (error) {
    if (watchdogExpired) {
      return { code: "upload-failed", status: "error" };
    }
    if (input.signal?.aborted || isAbortError(error)) {
      return { status: "cancelled" };
    }

    return {
      code: error instanceof MobileMessageAttachmentUploadError ? error.code : "upload-failed",
      status: "error",
    };
  } finally {
    watchdog?.stop();
    removeAbortForwarder?.();
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
