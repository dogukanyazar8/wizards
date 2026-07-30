import {
  MobileInvitePreviewResponseSchema,
  type MobileInvitePreviewResponse,
  type MobileServerJoinResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { joinMobileServer } from "../workspace/mobile-server-management-client";

export function buildMobileCommunityInvitePreviewPath(slug: string): string {
  return `/api/v1/mobile/invites/${encodeURIComponent(slug)}/preview`;
}

export function buildMobileCommunityInviteUrl(webUrl: string, slug: string): string {
  return new URL(`/invite/${encodeURIComponent(slug)}`, webUrl).toString();
}

export async function fetchMobileCommunityInvitePreview(
  client: MobileApiClient,
  slug: string,
): Promise<MobileInvitePreviewResponse> {
  const payload = await client.requestJson<unknown>(buildMobileCommunityInvitePreviewPath(slug), {
    method: "GET",
  });
  return MobileInvitePreviewResponseSchema.parse(payload);
}

/** Uses the established server join mutation; 2g adds no second join endpoint. */
export function joinMobileCommunityServer(
  client: MobileApiClient,
  slug: string,
): Promise<MobileServerJoinResponse> {
  return joinMobileServer(client, { inviteCode: slug });
}
