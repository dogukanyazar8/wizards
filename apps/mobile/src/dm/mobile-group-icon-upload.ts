import { generateReactHelpers } from "@uploadthing/react/native";
import type { FileRoute } from "uploadthing/types";

import { getMobileRuntimeConfig } from "../config/environment";
import { pickMobileImage } from "../media/mobile-image-picker";

type MobileGroupIconRouter = {
  groupIconUploader: FileRoute<{
    errorShape: unknown;
    input: { conversationId: string | null };
    output: { url: string };
  }>;
};

/**
 * The web uploader is reused rather than a mobile-only claim route: it already
 * resolves a bearer identity and already answers with the finished URL, so there
 * is no pending record for the phone to claim afterwards. `conversationId` is
 * null while creating — the group does not exist yet, and the URL stays inert
 * until POST /dm/groups accepts it.
 */
export async function uploadMobileGroupIcon(input: {
  accessToken: string;
  conversationId?: string | null;
  file: File;
  signal?: AbortSignal;
}): Promise<string | null> {
  const helpers = generateReactHelpers<MobileGroupIconRouter>({
    url: new URL("/api/uploadthing", getMobileRuntimeConfig().apiUrl),
  });

  const rows = await helpers.uploadFiles("groupIconUploader", {
    files: [input.file],
    headers: { Authorization: `Bearer ${input.accessToken}` },
    input: { conversationId: input.conversationId ?? null },
    ...(input.signal ? { signal: input.signal } : {}),
  });

  const url = rows[0]?.serverData?.url;
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

/**
 * Picker + upload in one call, shaped for the create screen's `onPickPhoto`:
 * null means "no photo", whether the user backed out of the sheet or the upload
 * refused the file. The screen keeps its previous icon either way.
 */
export async function pickAndUploadMobileGroupIcon(input: {
  conversationId?: string | null;
  getAccessToken(): Promise<string | null>;
}): Promise<string | null> {
  const picked = await pickMobileImage();
  if (!picked) {
    return null;
  }

  const accessToken = await input.getAccessToken();
  if (!accessToken) {
    return null;
  }

  return await uploadMobileGroupIcon({
    accessToken,
    conversationId: input.conversationId ?? null,
    file: picked.file,
  });
}
