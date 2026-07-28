import {
  MOBILE_FRIEND_SUGGESTION_LIMIT,
  MOBILE_USER_SEARCH_LIMIT,
  MobileFriendBlockResponseSchema,
  MobileFriendMutationResponseSchema,
  MobileFriendRequestActionResponseSchema,
  MobileFriendSuggestionsResponseSchema,
  MobileDMCreateResponseSchema,
  MobileFriendsOverviewResponseSchema,
  MobilePresenceResponseSchema,
  MobileProfileResponseSchema,
  MobileProfileUpdateSchema,
  MobileUserProfileResponseSchema,
  MobileUserReportResponseSchema,
  MobileUserSearchResponseSchema,
  type MobileFriendRelationship,
  type MobileUserProfile,
  type MobileUserReportReason,
  type MobileFriendsOverviewResponse,
  type MobileFriendPresenceStatus,
  type MobileFriendSuggestion,
  type MobileProfileResponse,
  type MobileProfileUpdate,
  type MobileUserSearchResponse,
  type MobileUserSearchResult,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export type MobileFriendsOverview = MobileFriendsOverviewResponse;
export type MobileFriend = MobileFriendsOverview["friends"][number];
export type MobileFriendRequest = MobileFriendsOverview["pending"]["incoming"][number];
export type {
  MobileFriendPresenceStatus,
  MobileFriendRelationship,
  MobileFriendSuggestion,
  MobileUserProfile,
  MobileUserReportReason,
  MobileUserSearchResult,
};
export { MOBILE_FRIEND_SUGGESTION_LIMIT };
export type MobileProfile = MobileProfileResponse["user"];
export type { MobileProfileUpdate };
export type MobileProfileBadgeName = MobileUserProfile["badges"][number];
export type MobileProfileRoleBadge = NonNullable<
  MobileUserProfile["serverContext"]
>["roles"][number];

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

/**
 * 1c "TANIYOR OLABİLİRSİN". The server does the excluding — friends, pending
 * requests, blocks and anyone whose privacy settings would reject the viewer
 * never reach this list — so the screen renders whatever comes back.
 */
export async function fetchMobileFriendSuggestions(
  client: MobileApiClient,
  limit: number = MOBILE_FRIEND_SUGGESTION_LIMIT,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  return MobileFriendSuggestionsResponseSchema.parse(
    await client.requestJson(`/api/v1/mobile/friends/suggestions?${params.toString()}`),
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
  /** Invite sheet 2b scopes the search to one server for its membership context. */
  serverId?: string,
): Promise<MobileUserSearchResponse> {
  const term = normalizeMobileUserSearchTerm(query);
  if (term.length < MOBILE_USER_SEARCH_MIN_TERM_LENGTH) {
    return { results: [] };
  }

  const params = new URLSearchParams({ limit: String(limit), q: term });
  if (serverId) {
    params.set("serverId", serverId);
  }

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
    await client.requestJson(`/api/v1/mobile/friends/requests/${encodeId(requestId)}/${action}`, {
      method: "POST",
    }),
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

/** One read behind every profile surface: the quick card (11b) and the full page (11c). */
export async function fetchMobileUserProfile(
  client: MobileApiClient,
  userId: string,
  serverId?: string | undefined,
): Promise<MobileUserProfile> {
  const query = serverId ? `?${new URLSearchParams({ serverId }).toString()}` : "";
  const response = MobileUserProfileResponseSchema.parse(
    await client.requestJson(`/api/v1/mobile/users/${encodeId(userId)}/profile${query}`),
  );
  return response.profile;
}

export async function reportMobileUser(
  client: MobileApiClient,
  userId: string,
  input: { details?: string | null; reason: MobileUserReportReason },
) {
  return MobileUserReportResponseSchema.parse(
    await client.requestJson(`/api/v1/mobile/users/${encodeId(userId)}/report`, {
      body: { details: input.details ?? null, reason: input.reason },
      method: "POST",
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

export async function updateMobileProfile(client: MobileApiClient, input: MobileProfileUpdate) {
  const body = MobileProfileUpdateSchema.parse(input);
  return MobileProfileResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/account/profile", {
      body,
      method: "PATCH",
    }),
  );
}
