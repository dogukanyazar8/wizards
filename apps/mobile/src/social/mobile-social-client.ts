import {
  MOBILE_USER_SEARCH_LIMIT,
  MobileFriendBlockResponseSchema,
  MobileFriendMutationResponseSchema,
  MobileFriendRequestActionResponseSchema,
  MobileDMCreateResponseSchema,
  MobileFriendsOverviewResponseSchema,
  MobilePresenceResponseSchema,
  MobileProfileResponseSchema,
  MobileProfileUpdateSchema,
  MobileUserSearchResponseSchema,
  type MobileFriendRelationship,
  type MobileFriendsOverviewResponse,
  type MobileFriendPresenceStatus,
  type MobileProfileResponse,
  type MobileUserSearchResponse,
  type MobileUserSearchResult,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export type MobileFriendsOverview = MobileFriendsOverviewResponse;
export type MobileFriend = MobileFriendsOverview["friends"][number];
export type MobileFriendRequest = MobileFriendsOverview["pending"]["incoming"][number];
export type { MobileFriendPresenceStatus, MobileFriendRelationship, MobileUserSearchResult };
export type MobileProfile = MobileProfileResponse["user"];

export const MOBILE_USER_SEARCH_MIN_TERM_LENGTH = 2;

/** Search input is `@`-tolerant, so "@ada" and "ada" hit the same query cache entry. */
export function normalizeMobileUserSearchTerm(value: string): string {
  return value.trim().replace(/^@+/, "").trim();
}

function encodeId(value: string) {
  return encodeURIComponent(value);
}

export async function fetchMobileFriends(client: MobileApiClient) {
  return MobileFriendsOverviewResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/friends"),
  );
}

export async function openMobileFriendDM(client: MobileApiClient, userId: string) {
  return MobileDMCreateResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/dm", {
      body: { userId },
      method: "POST",
    }),
  );
}

export async function createMobileFriendRequest(client: MobileApiClient, username: string) {
  return MobileFriendRequestActionResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/friends/requests", {
      body: { username: username.trim() },
      method: "POST",
    }),
  );
}

export async function searchMobileUsers(
  client: MobileApiClient,
  query: string,
  limit = MOBILE_USER_SEARCH_LIMIT,
): Promise<MobileUserSearchResponse> {
  const term = normalizeMobileUserSearchTerm(query);
  if (term.length < MOBILE_USER_SEARCH_MIN_TERM_LENGTH) {
    return { results: [] };
  }

  const params = new URLSearchParams({ limit: String(limit), q: term });
  return MobileUserSearchResponseSchema.parse(
    await client.requestJson(`/api/v1/mobile/friends/search?${params.toString()}`),
  );
}

export async function cancelMobileFriendRequest(client: MobileApiClient, requestId: string) {
  return MobileFriendMutationResponseSchema.parse(
    await client.requestJson(`/api/v1/mobile/friends/requests/${encodeId(requestId)}`, {
      method: "DELETE",
    }),
  );
}

export async function actOnMobileFriendRequest(
  client: MobileApiClient,
  requestId: string,
  action: "accept" | "reject",
) {
  return MobileFriendRequestActionResponseSchema.parse(
    await client.requestJson(
      `/api/v1/mobile/friends/requests/${encodeId(requestId)}/${action}`,
      { method: "POST" },
    ),
  );
}

export async function removeMobileFriend(client: MobileApiClient, userId: string) {
  return MobileFriendMutationResponseSchema.parse(
    await client.requestJson(`/api/v1/mobile/friends/${encodeId(userId)}`, {
      method: "DELETE",
    }),
  );
}

export async function blockMobileFriend(client: MobileApiClient, userId: string) {
  return MobileFriendBlockResponseSchema.parse(
    await client.requestJson(`/api/v1/mobile/friends/blocks/${encodeId(userId)}`, {
      method: "PUT",
    }),
  );
}

export async function unblockMobileFriend(client: MobileApiClient, userId: string) {
  return MobileFriendMutationResponseSchema.parse(
    await client.requestJson(`/api/v1/mobile/friends/blocks/${encodeId(userId)}`, {
      method: "DELETE",
    }),
  );
}

export async function updateMobilePresence(
  client: MobileApiClient,
  status: MobileFriendPresenceStatus,
) {
  return MobilePresenceResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/account/presence", {
      body: { status },
      method: "PUT",
    }),
  );
}

export async function updateMobileProfile(
  client: MobileApiClient,
  input: {
    bio?: string | null;
    customStatus?: string | null;
    displayName?: string | null;
    username?: string;
  },
) {
  const body = MobileProfileUpdateSchema.parse(input);
  return MobileProfileResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/account/profile", {
      body,
      method: "PATCH",
    }),
  );
}
