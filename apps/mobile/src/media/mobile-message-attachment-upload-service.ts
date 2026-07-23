import {
  MobileMessageAttachmentUploadError,
  type MobileMessageAttachmentDraft,
  type MobileMessageAttachmentUploadErrorCode,
  type MobilePickedMessageAttachment,
} from "./mobile-message-attachment-contract";

/** `upload-failed` covers transport/unknown errors that carry no contract code. */
export type MobileMessageAttachmentUploadFailureCode =
  | MobileMessageAttachmentUploadErrorCode
  | "upload-failed";

export type MobileMessageAttachmentUploadOutcome =
  | { readonly status: "cancelled" }
  | { readonly draft: MobileMessageAttachmentDraft; readonly status: "ready" }
  | { readonly code: MobileMessageAttachmentUploadFailureCode; readonly status: "error" };

export async function executeMobileMessageAttachmentUpload(input: {
  readonly dependencies: {
    getAccessToken(): Promise<string | null>;
    pickAttachment(): Promise<MobilePickedMessageAttachment | null>;
    uploadAttachment(input: {
      readonly accessToken: string;
      readonly picked: MobilePickedMessageAttachment;
      readonly signal?: AbortSignal;
    }): Promise<MobileMessageAttachmentDraft>;
  };
  readonly signal?: AbortSignal;
}): Promise<MobileMessageAttachmentUploadOutcome> {
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

    const draft = await input.dependencies.uploadAttachment({
      accessToken,
      picked,
      ...(input.signal ? { signal: input.signal } : {}),
    });

    return input.signal?.aborted ? { status: "cancelled" } : { draft, status: "ready" };
  } catch (error) {
    if (input.signal?.aborted || isAbortError(error)) {
      return { status: "cancelled" };
    }

    return {
      code:
        error instanceof MobileMessageAttachmentUploadError ? error.code : "upload-failed",
      status: "error",
    };
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
