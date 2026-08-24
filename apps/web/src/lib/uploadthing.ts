"use client";

import { generateReactHelpers } from "@uploadthing/react";
import type { ClientUploadedFileData } from "uploadthing/types";
import type { WizardsUploadRouter } from "@/app/api/uploadthing/core";

function createUploadThingHelpers() {
  return generateReactHelpers<WizardsUploadRouter>();
}

const helpers: ReturnType<typeof createUploadThingHelpers> = createUploadThingHelpers();

export const uploadFiles: typeof helpers.uploadFiles = helpers.uploadFiles;

type E2EUploadOptions = {
  onClientUploadComplete?: (result: unknown[]) => void;
  onUploadBegin?: (fileName: string) => void;
  onUploadError?: (error: Error) => void;
  onUploadProgress?: (progress: number) => void;
};

type E2EUploadResponse = ClientUploadedFileData<unknown>;

function isE2EUploadMockEnabled() {
  return process.env.NEXT_PUBLIC_E2E_TEST_MODE === "true" && process.env.NODE_ENV !== "production";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read E2E upload file."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to read E2E upload file."));
        return;
      }

      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function uploadE2EFile(endpoint: string, file: File): Promise<E2EUploadResponse> {
  const dataUrl = await readFileAsDataUrl(file);
  const response = await fetch("/api/e2e/uploads", {
    body: JSON.stringify({
      contentType: file.type,
      dataUrl,
      endpoint,
      filename: file.name,
      size: file.size,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as {
    serverData?: unknown;
    url?: string;
  } | null;

  if (!response.ok || !payload?.serverData || !payload.url) {
    throw new Error("E2E upload failed.");
  }

  return {
    appUrl: payload.url,
    customId: null,
    fileHash: `e2e-${file.size}-${file.lastModified}`,
    key: `e2e/${encodeURIComponent(file.name)}`,
    lastModified: file.lastModified,
    name: file.name,
    serverData: payload.serverData,
    size: file.size,
    type: file.type,
    ufsUrl: payload.url,
    url: payload.url,
  };
}

const useE2EUploadThing = ((endpoint: string, options?: E2EUploadOptions) => ({
  isUploading: false,
  permittedFileInfo: undefined,
  routeConfig: undefined,
  startUpload: async (files: File[]) => {
    try {
      options?.onUploadBegin?.(files[0]?.name ?? "");
      options?.onUploadProgress?.(25);
      const result = await Promise.all(files.map((file) => uploadE2EFile(endpoint, file)));
      options?.onUploadProgress?.(100);
      options?.onClientUploadComplete?.(result);
      return result;
    } catch (error) {
      const uploadError = error instanceof Error ? error : new Error("E2E upload failed.");
      options?.onUploadError?.(uploadError);
      throw uploadError;
    }
  },
})) as unknown as typeof helpers.useUploadThing;

export const useUploadThing: typeof helpers.useUploadThing = isE2EUploadMockEnabled()
  ? useE2EUploadThing
  : helpers.useUploadThing;
