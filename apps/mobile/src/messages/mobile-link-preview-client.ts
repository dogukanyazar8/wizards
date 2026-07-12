import { MobileLinkPreviewRequestSchema, MobileLinkPreviewResponseSchema } from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

const URL_CANDIDATE_PATTERN = /https?:\/\/[^\s<>"']+/giu;
const TRAILING_PUNCTUATION_PATTERN = /[),.!?;:]+$/u;

export function extractFirstHttpsUrl(content: string): string | null {
  for (const match of content.matchAll(URL_CANDIDATE_PATTERN)) {
    const candidate = match[0].replace(TRAILING_PUNCTUATION_PATTERN, "");
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:") {
        return url.toString();
      }
    } catch {
      // Continue scanning; message content is untrusted input.
    }
  }
  return null;
}

export async function fetchMobileLinkPreview(client: MobileApiClient, url: string) {
  const body = MobileLinkPreviewRequestSchema.parse({ url });
  return MobileLinkPreviewResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/link-preview", {
      body,
      method: "POST",
    }),
  );
}
