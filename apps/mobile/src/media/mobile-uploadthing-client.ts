import { generateReactNativeHelpers } from "@uploadthing/expo";
import {
  MobileMediaUploadIntentSchema,
  type MobileMediaUploadCompletionResponse,
} from "@wizards/types";
import type { FileRoute } from "uploadthing/types";

import { getMobileRuntimeConfig } from "../config/environment";
import {
  parseMobileUploadCompletion,
  type MobileImageUploadTarget,
} from "./mobile-image-upload-contract";

type MobileMediaUploadRouter = {
  mobileMediaUploader: FileRoute<{
    errorShape: unknown;
    input: MobileImageUploadTarget;
    output: MobileMediaUploadCompletionResponse;
  }>;
};

const helpers = generateReactNativeHelpers<MobileMediaUploadRouter>({
  url: new URL("/api/uploadthing", getMobileRuntimeConfig().apiUrl),
});

export async function uploadMobileImageToUploadThing(input: {
  accessToken: string;
  file: File;
  signal?: AbortSignal;
  target: MobileImageUploadTarget;
}): Promise<MobileMediaUploadCompletionResponse> {
  const rows = await helpers.uploadFiles("mobileMediaUploader", {
    files: [input.file],
    headers: { Authorization: `Bearer ${input.accessToken}` },
    input: MobileMediaUploadIntentSchema.parse(input.target),
    ...(input.signal ? { signal: input.signal } : {}),
  });

  return parseMobileUploadCompletion(rows);
}
