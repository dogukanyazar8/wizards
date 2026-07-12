import {
  MobileGiphyAttachmentRequestSchema,
  MobileGiphyAttachmentResponseSchema,
  MobileGiphySearchQuerySchema,
  MobileGiphySearchResponseSchema,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export type MobileGiphySearchInput = {
  limit?: number;
  offset?: number;
  query?: string;
};

export async function searchMobileGiphy(client: MobileApiClient, input: MobileGiphySearchInput) {
  const query = MobileGiphySearchQuerySchema.parse({
    limit: input.limit,
    offset: input.offset,
    q: input.query,
  });
  const params = new URLSearchParams({
    q: query.q,
    limit: String(query.limit),
    offset: String(query.offset),
  });
  return MobileGiphySearchResponseSchema.parse(
    await client.requestJson(`/api/v1/mobile/giphy/search?${params.toString()}`),
  );
}

export async function createMobileGiphyAttachment(client: MobileApiClient, gifId: string) {
  const body = MobileGiphyAttachmentRequestSchema.parse({ gifId });
  return MobileGiphyAttachmentResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/giphy/attachment", {
      body,
      method: "POST",
    }),
  );
}
