"use client";

import {
  BADGE_QUERY_STALE_TIME_MS,
  BADGE_RARITY_STALE_TIME_MS,
  BadgeRarityResponseSchema,
  OwnBadgesResponseSchema,
  UserBadgesResponseSchema,
  type BadgeRarityResponse,
  type OwnBadgesResponse,
  type UserBadgesResponse,
} from "@wizards/types";

/**
 * Web half of the badge read. The paths differ from the mobile ones because the
 * two platforms authenticate differently, but the body they receive comes from
 * the same `badge-route-logic` handler, and the freshness window below is the
 * same constant the mobile client imports (03 §4).
 */
export { BADGE_QUERY_STALE_TIME_MS, BADGE_RARITY_STALE_TIME_MS };

export const badgeQueryKeys = {
  own: () => ["badges", "own"] as const,
  /** Its own key: the summary is one document for everyone, refreshed daily. */
  rarity: () => ["badges", "rarity"] as const,
  root: ["badges"] as const,
  user: (userId: string) => ["badges", "user", userId] as const,
};

async function requestJson(url: string): Promise<unknown> {
  const response = await fetch(url, { method: "GET" });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed: ${response.status}`);
  }

  return payload;
}

export async function fetchUserBadges(userId: string): Promise<UserBadgesResponse> {
  return UserBadgesResponseSchema.parse(
    await requestJson(`/api/v1/users/${encodeURIComponent(userId)}/badges`),
  );
}

export async function fetchOwnBadges(): Promise<OwnBadgesResponse> {
  return OwnBadgesResponseSchema.parse(await requestJson("/api/v1/users/me/badges"));
}

export async function fetchBadgeRarity(): Promise<BadgeRarityResponse> {
  return BadgeRarityResponseSchema.parse(await requestJson("/api/v1/badges/rarity"));
}
