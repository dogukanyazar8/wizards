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
 * Backing out of the picker and an upload that refused the file are two
 * different answers, and only one of them is worth a message: the caller has to
 * be able to tell them apart before it decides what to say.
 */
export type MobileGroupIconUploadResult =
  | { readonly status: "cancelled" }
  | { readonly status: "error" }
  | { readonly status: "uploaded"; readonly url: string };

/**
 * Picker + upload in one call, shaped for the create screen's `onPickPhoto`.
 * The screen keeps its previous icon on anything but `uploaded`.
 *
 * `onUploadStart` fires once a file is actually in hand — the caller's progress
 * message belongs to the upload, not to the time the reader spends choosing.
 */
export async function pickAndUploadMobileGroupIcon(input: {
  conversationId?: string | null;
  getAccessToken(): Promise<string | null>;
  onUploadStart?: () => void;
}): Promise<MobileGroupIconUploadResult> {
  const picked = await pickMobileImage();
  if (!picked) {
    return { status: "cancelled" };
  }

  input.onUploadStart?.();

  const accessToken = await input.getAccessToken();
  if (!accessToken) {
    return { status: "error" };
  }

  try {
    const url = await uploadMobileGroupIcon({
      accessToken,
      conversationId: input.conversationId ?? null,
      file: picked.file,
    });

    // A rejected file answers `null`; from here on that is a failure the reader
    // is told about rather than a silently unchanged avatar.
    return url ? { status: "uploaded", url } : { status: "error" };
  } catch {
    return { status: "error" };
  }
}
