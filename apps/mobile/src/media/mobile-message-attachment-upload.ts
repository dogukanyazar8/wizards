import { generateReactHelpers } from "@uploadthing/react/native";
import type { FileRoute } from "uploadthing/types";

import { getMobileRuntimeConfig } from "../config/environment";
import {
  parseMobileMessageAttachmentUploadCompletion,
  type MobileMessageAttachmentDraft,
  type MobilePickedMessageAttachment,
} from "./mobile-message-attachment-contract";

type MobileMessageAttachmentUploadRouter = {
  messageAttachmentUploader: FileRoute<{
    errorShape: unknown;
    input: undefined;
    output: MobileMessageAttachmentDraft["attachment"];
  }>;
};

function createUploadThingHelpers() {
  return generateReactHelpers<MobileMessageAttachmentUploadRouter>({
    url: new URL("/api/uploadthing", getMobileRuntimeConfig().apiUrl),
  });
}

export async function uploadMobileMessageAttachmentToUploadThing(input: {
  readonly accessToken: string;
  readonly onProgress?: (progress: { loaded: number; total: number }) => void;
  readonly picked: MobilePickedMessageAttachment;
  readonly signal?: AbortSignal;
}): Promise<MobileMessageAttachmentDraft> {
  const helpers = createUploadThingHelpers();
  const rows = await helpers.uploadFiles("messageAttachmentUploader", {
    files: [input.picked.file],
    headers: { Authorization: `Bearer ${input.accessToken}` },
    ...(input.onProgress
      ? {
          onUploadProgress: ({ loaded }: { loaded: number }) =>
            input.onProgress?.({ loaded, total: input.picked.file.size }),
        }
      : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });

  return parseMobileMessageAttachmentUploadCompletion(rows, input.picked);
}
