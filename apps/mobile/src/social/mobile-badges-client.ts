import {
  BADGE_QUERY_STALE_TIME_MS,
  OwnBadgesResponseSchema,
  UserBadgesResponseSchema,
  type OwnBadgesResponse,
  type UserBadgesResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

/**
 * The badge read is its own request, deliberately not folded into the profile
 * payload: the profile field is frozen for 0.8.x clients (00 §2) and badges go
 * stale on a completely different clock from presence or mutual friends.
 */
export { BADGE_QUERY_STALE_TIME_MS };
export type { OwnBadgesResponse, UserBadgesResponse };

export function buildUserBadgesPath(userId: string): string {
  return `/api/v1/mobile/users/${encodeURIComponent(userId)}/badges`;
}

export function buildOwnBadgesPath(): string {
  return "/api/v1/mobile/account/badges";
}

export async function fetchUserBadges(
  client: MobileApiClient,
  userId: string,
): Promise<UserBadgesResponse> {
  const payload = await client.requestJson<unknown>(buildUserBadgesPath(userId), {
    method: "GET",
  });

  return UserBadgesResponseSchema.parse(payload);
}

export async function fetchOwnBadges(client: MobileApiClient): Promise<OwnBadgesResponse> {
  const payload = await client.requestJson<unknown>(buildOwnBadgesPath(), { method: "GET" });

  return OwnBadgesResponseSchema.parse(payload);
}
