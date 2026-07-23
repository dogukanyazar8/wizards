import {
  MobileDMAttachmentsQuerySchema,
  MobileDMAttachmentsResponseSchema,
  type MobileDMAttachmentsQuery,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

/**
 * 11f shared-media gallery paging. The DM details request keeps its own fixed
 * 30-item preview; this is the endpoint behind its "see all".
 */
export async function fetchMobileDMAttachments(
  client: MobileApiClient,
  conversationId: string,
  input: Partial<MobileDMAttachmentsQuery> = {},
) {
  const query = MobileDMAttachmentsQuerySchema.parse(input);
  const params = new URLSearchParams({ limit: String(query.limit), tab: query.tab });
  if (query.cursor) {
    params.set("cursor", query.cursor);
  }

  return MobileDMAttachmentsResponseSchema.parse(
    await client.requestJson(
      `/api/v1/mobile/dm/${encodeURIComponent(conversationId)}/attachments?${params.toString()}`,
    ),
  );
}
