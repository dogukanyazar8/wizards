import {
  MobileDMDetailsQuerySchema,
  MobileDMDetailsResponseSchema,
  type MobileDMDetailsQuery,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export async function fetchMobileDMDetails(
  client: MobileApiClient,
  conversationId: string,
  input: Partial<MobileDMDetailsQuery> = {},
) {
  const query = MobileDMDetailsQuerySchema.parse(input);
  const params = new URLSearchParams({ limit: String(query.limit) });
  if (query.cursor) {
    params.set("cursor", query.cursor);
  }
  return MobileDMDetailsResponseSchema.parse(
    await client.requestJson(
      `/api/v1/mobile/dm/${encodeURIComponent(conversationId)}/details?${params.toString()}`,
    ),
  );
}
