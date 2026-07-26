import { generateReactHelpers } from "@uploadthing/react/native";
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

function createUploadThingHelpers() {
  return generateReactHelpers<MobileMediaUploadRouter>({
    url: new URL("/api/uploadthing", getMobileRuntimeConfig().apiUrl),
  });
}

export async function uploadMobileImageToUploadThing(input: {
  accessToken: string;
  file: File;
  /**
   * Byte-level progress, straight from the transport. Without it there is no way
   * to tell a slow upload from a dead one: the request only answers after the
   * server-side completion callback, so silence is the normal tail of a healthy
   * upload as well as the symptom of a broken one.
   */
  onProgress?: (progress: { loaded: number; total: number }) => void;
  signal?: AbortSignal;
  target: MobileImageUploadTarget;
}): Promise<MobileMediaUploadCompletionResponse> {
  // React Native can replace its URL polyfill after module initialization. Create
  // the helper lazily so UploadThing's URL identity checks use the active runtime.
  const helpers = createUploadThingHelpers();
  const onProgress = input.onProgress;
  const rows = await helpers.uploadFiles("mobileMediaUploader", {
    files: [input.file],
    headers: { Authorization: `Bearer ${input.accessToken}` },
    input: MobileMediaUploadIntentSchema.parse(input.target),
    ...(onProgress
      ? {
          onUploadProgress: ({ loaded }: { loaded: number }) =>
            onProgress({ loaded, total: input.file.size }),
        }
      : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });

  return parseMobileUploadCompletion(rows);
}
