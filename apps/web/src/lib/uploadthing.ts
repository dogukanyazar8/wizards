"use client";

import { generateReactHelpers } from "@uploadthing/react";
import type { WizardsUploadRouter } from "@/app/api/uploadthing/core";

function createUploadThingHelpers() {
  return generateReactHelpers<WizardsUploadRouter>();
}

const helpers: ReturnType<typeof createUploadThingHelpers> = createUploadThingHelpers();

export const uploadFiles: typeof helpers.uploadFiles = helpers.uploadFiles;
export const useUploadThing: typeof helpers.useUploadThing = helpers.useUploadThing;
