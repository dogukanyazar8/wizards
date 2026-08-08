import {
  ServerDiscoveryPageSchema,
  ServerDiscoveryQuerySchema,
  type ServerDiscoveryPage,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

/** Matches the web discovery grid's default page size (S3 Section A). */
export const MOBILE_SERVER_DISCOVERY_LIMIT = 20;

export function buildMobileServerDiscoveryPath(input: {
  cursor?: string | null;
  query?: string | null;
}): string {
  const parsed = ServerDiscoveryQuerySchema.parse({
    ...(input.cursor ? { cursor: input.cursor } : {}),
    limit: MOBILE_SERVER_DISCOVERY_LIMIT,
    ...(input.query ? { query: input.query } : {}),
  });
  const params = new URLSearchParams({
    limit: String(parsed.limit ?? MOBILE_SERVER_DISCOVERY_LIMIT),
  });
  if (parsed.cursor) {
    params.set("cursor", parsed.cursor);
  }
  if (parsed.query) {
    params.set("query", parsed.query);
  }

  return `/api/v1/mobile/servers/discover?${params.toString()}`;
}

/**
 * S3 Section A's read path: `memberCount desc`, cursor-paginated, no per-card
 * permission resolution. The card payload is a strict subset of the profile
 * schema (no channels/friends), formatted at render time by the caller.
 */
export async function fetchMobileServerDiscovery(
  client: MobileApiClient,
  input: { cursor?: string | null; query?: string | null; signal?: AbortSignal | undefined },
): Promise<ServerDiscoveryPage> {
  const payload = await client.requestJson<unknown>(
    buildMobileServerDiscoveryPath(input),
    input.signal ? { signal: input.signal } : {},
  );

  return ServerDiscoveryPageSchema.parse(payload);
}
