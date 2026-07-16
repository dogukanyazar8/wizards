import {
  MobileMessageAttachmentUploadError,
  type MobileMessageAttachmentDraft,
  type MobilePickedMessageAttachment,
} from "./mobile-message-attachment-contract";

export type MobileMessageAttachmentUploadOutcome =
  | { readonly status: "cancelled" }
  | { readonly draft: MobileMessageAttachmentDraft; readonly status: "ready" }
  | { readonly status: "error" };

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
    if (!accessToken || input.signal?.aborted) {
      return { status: "error" };
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

    return { status: "error" };
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
